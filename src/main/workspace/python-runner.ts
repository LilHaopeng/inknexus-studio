import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import type { CreationMode, LintIssue, LintReport, SkillId } from '@shared/types'
import { stripAgentMarkupForDisplay } from '../../shared/agent-markup-filter'
import { SkillLoader } from '../orchestrator/skill-loader'

function findPython(): { cmd: string; prefixArgs: string[] } | null {
  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const probes: Array<{ cmd: string; prefixArgs: string[] }> = [
    { cmd: 'python', prefixArgs: [] },
    { cmd: 'py', prefixArgs: ['-3'] },
    { cmd: 'python3', prefixArgs: [] },
    { cmd: 'C:\\Python314\\python.exe', prefixArgs: [] },
    { cmd: 'C:\\Python313\\python.exe', prefixArgs: [] },
    { cmd: 'C:\\Python312\\python.exe', prefixArgs: [] },
    { cmd: path.join(localApp, 'Programs', 'Python', 'Python313', 'python.exe'), prefixArgs: [] },
    { cmd: path.join(localApp, 'Programs', 'Python', 'Python312', 'python.exe'), prefixArgs: [] },
    { cmd: path.join(localApp, 'Programs', 'Python', 'Python311', 'python.exe'), prefixArgs: [] }
  ]

  for (const probe of probes) {
    if (path.isAbsolute(probe.cmd) && !fs.existsSync(probe.cmd)) continue
    try {
      execFileSync(probe.cmd, [...probe.prefixArgs, '--version'], { windowsHide: true, timeout: 2500, stdio: 'ignore' })
      return probe
    } catch {
      // try next candidate
    }
  }
  return null
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// CRC32 & minimal pure-TypeScript ZIP builder so .docx export works cleanly even on zero-Python PCs
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function createZipBuffer(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8')
    const compressed = zlib.deflateRawSync(entry.data)
    const crc = crc32(entry.data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6) // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8) // Deflate
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(entry.data.length, 22)
    localHeader.writeUInt16LE(nameBuf.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBuf, compressed)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(8, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(entry.data.length, 24)
    centralHeader.writeUInt16LE(nameBuf.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuf)

    offset += localHeader.length + nameBuf.length + compressed.length
  }

  const centralDir = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDir, eocd])
}

export function buildSimpleDocxBuffer(title: string, sections: Array<{ heading: string; body: string }>): Buffer {
  const paragraphsXml: string[] = []
  paragraphsXml.push(
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>`
  )

  for (const sec of sections) {
    if (sec.heading) {
      paragraphsXml.push(
        `<w:p><w:pPr><w:spacing w:before="200" w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(sec.heading)}</w:t></w:r></w:p>`
      )
    }
    for (const line of sec.body.split(/\r?\n/)) {
      const cleanLine = line.replace(/^#{1,6}\s+/, '').trim()
      if (!cleanLine) continue
      paragraphsXml.push(
        `<w:p><w:pPr><w:ind w:firstLine="420"/><w:spacing w:after="100" w:line="360" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">${escapeXml(cleanLine)}</w:t></w:r></w:p>`
      )
    }
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml.join('\n    ')}
    <w:sectPr/>
  </w:body>
</w:document>`

  return createZipBuffer([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(relsXml, 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') }
  ])
}

function collectChapterFiles(projectRoot: string, mode: CreationMode): Array<{ heading: string; body: string }> {
  const dirCandidates =
    mode === 'drama-script'
      ? [path.join(projectRoot, '剧本'), path.join(projectRoot, '正文')]
      : [path.join(projectRoot, '正文'), projectRoot]
  const chapters: Array<{ heading: string; body: string }> = []
  const seen = new Set<string>()

  for (const dir of dirCandidates) {
    if (!fs.existsSync(dir)) continue
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.(md|txt)$/i.test(e.name) && !/(声口卡|状态|大纲|脑洞|总案)/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (seen.has(full.toLowerCase())) continue
      seen.add(full.toLowerCase())
      const raw = fs.readFileSync(full, 'utf8')
      const clean = stripAgentMarkupForDisplay(raw)
      const heading = ent.name.replace(/\.(md|txt)$/i, '')
      chapters.push({ heading, body: clean })
    }
    if (chapters.length > 0) break
  }

  return chapters
}

export function parseLintOutput(rawOutput: string, exitCode: number, scriptName: string): LintReport {
  const lines = rawOutput.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const issues: LintIssue[] = []
  const metrics: Record<string, string | number> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    const kv = trimmed.match(/^([A-Za-z0-9_\u4e00-\u9fa5]{2,20})\s*[:：=]\s*([0-9]+(?:\.[0-9]+)?%?)$/)
    if (kv) {
      metrics[kv[1]] = kv[2]
    }
    const lineMatch = trimmed.match(/(?:line|行)\s*[:：]?\s*(\d+)/i)
    const lineNum = lineMatch ? Number(lineMatch[1]) : undefined

    if (/\[(ERROR|FAIL|严重|S0|S1)\]|ERROR:|FAIL:/i.test(trimmed)) {
      issues.push({ severity: 'error', line: lineNum, message: trimmed })
    } else if (/\[(WARN|WARNING|提醒|S2)\]|WARN:|WARNING:|⚠|注意/.test(trimmed)) {
      issues.push({ severity: 'warn', line: lineNum, message: trimmed })
    } else if (/^[-•]\s+/.test(trimmed)) {
      issues.push({ severity: 'info', line: lineNum, message: trimmed.replace(/^[-•]\s+/, '') })
    }
  }

  const hasError = exitCode !== 0 || issues.some((i) => i.severity === 'error')
  const hasWarn = issues.some((i) => i.severity === 'warn')
  const status: LintReport['status'] = hasError ? 'fail' : hasWarn ? 'warn' : 'pass'

  return {
    status,
    scriptName,
    issues,
    metrics,
    rawOutput,
    ranAt: Date.now()
  }
}

function runBuiltinFallbackLint(absFile: string): LintReport {
  const raw = fs.readFileSync(absFile, 'utf8')
  const clean = stripAgentMarkupForDisplay(raw)
  const charCount = clean.replace(/\s+/g, '').length
  const issues: LintIssue[] = []
  if (charCount < 200) {
    issues.push({ severity: 'warn', message: `当前章节正文仅 ${charCount} 字，建议继续扩充核心场景。` })
  }
  const paragraphs = clean.split(/\r?\n\s*\r?\n/).filter(Boolean)
  const longParas = paragraphs.filter((p) => p.replace(/\s+/g, '').length > 260)
  if (longParas.length > 0) {
    issues.push({ severity: 'warn', message: `检测到 ${longParas.length} 处超长自然段（>260字），可适当切分提升阅读呼吸感。` })
  }
  return {
    status: issues.length > 0 ? 'warn' : 'pass',
    scriptName: 'builtin-ts-lint',
    issues,
    metrics: { 字数: charCount, 段落数: paragraphs.length },
    rawOutput: `内置体检完成：共 ${charCount} 字，${paragraphs.length} 段。`,
    ranAt: Date.now()
  }
}

export class PythonRunner {
  private readonly pythonExe: { cmd: string; prefixArgs: string[] } | null

  constructor(private readonly skillLoader: SkillLoader) {
    this.pythonExe = findPython()
  }

  async runScript(scriptPath: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
    if (!this.pythonExe) {
      return { code: 127, stdout: '', stderr: '本机未检测到 Python 环境' }
    }
    return new Promise((resolve) => {
      const child = spawn(this.pythonExe!.cmd, [...this.pythonExe!.prefixArgs, scriptPath, ...args], {
        cwd: cwd || path.dirname(scriptPath),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        windowsHide: true
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => {
        stdout += d.toString('utf8')
      })
      child.stderr.on('data', (d) => {
        stderr += d.toString('utf8')
      })
      child.on('error', (err) => {
        resolve({ code: 1, stdout, stderr: err.message })
      })
      child.on('close', (code) => {
        resolve({ code: code ?? 0, stdout, stderr })
      })
    })
  }

  async runLintForFile(projectRoot: string, filePath: string, mode: CreationMode): Promise<LintReport> {
    const absFile = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    if (!fs.existsSync(absFile)) {
      return { status: 'not-run', issues: [], metrics: {}, rawOutput: '文件不存在', ranAt: Date.now() }
    }

    let skillId: SkillId = 'story-prose-writer'
    let scriptName = 'lint_prose.py'
    let args = ['--file', absFile]

    if (mode === 'short-webnovel') {
      skillId = 'webnovel-short-studio'
      scriptName = 'lint_webnovel.py'
      args = ['--file', absFile]
    } else if (mode === 'drama-script') {
      skillId = 'ai-drama-script-studio'
      scriptName = 'lint_script.py'
      args = ['--dir', path.dirname(absFile)]
    } else if (absFile.includes(`${path.sep}大纲${path.sep}`)) {
      skillId = 'story-outline-architect'
      scriptName = 'validate_outline.py'
      args = ['--root', projectRoot]
    } else if (absFile.includes(`${path.sep}设定${path.sep}`)) {
      skillId = 'story-world-architect'
      scriptName = 'validate_world.py'
      args = ['--root', projectRoot]
    }

    const scriptPath = this.skillLoader.getScriptPath(skillId, scriptName)
    if (!scriptPath || !this.pythonExe) {
      return runBuiltinFallbackLint(absFile)
    }

    const res = await this.runScript(scriptPath, args, projectRoot)
    if (res.code === 127) {
      return runBuiltinFallbackLint(absFile)
    }
    const combined = [res.stdout, res.stderr].filter(Boolean).join('\n').trim()
    return parseLintOutput(combined, res.code, scriptName)
  }

  async exportProject(params: {
    projectRoot: string
    title: string
    mode: CreationMode
    format: 'docx' | 'txt' | 'both'
    preset?: 'book' | 'screen'
  }): Promise<{ ok: boolean; outputFiles: string[]; log: string }> {
    const deliveryDir = path.join(params.projectRoot, '交付')
    fs.mkdirSync(deliveryDir, { recursive: true })
    const safeTitle = params.title.replace(/[\\/:*?"<>|]/g, '_')
    const outDocx = path.join(deliveryDir, `《${safeTitle}》_交付.docx`)
    const outTxt = path.join(deliveryDir, `《${safeTitle}》_平台发布.txt`)

    let scriptPath: string | null = null
    let args: string[] = []
    const outputFiles: string[] = []

    if (params.mode === 'short-webnovel') {
      scriptPath = this.skillLoader.getScriptPath('webnovel-short-studio', 'export_short.py')
      args = ['--chapters-dir', path.join(params.projectRoot, '正文'), '--title', safeTitle]
      if (params.format === 'docx' || params.format === 'both') {
        args.push('--out-docx', outDocx)
        outputFiles.push(outDocx)
      }
      if (params.format === 'txt' || params.format === 'both') {
        args.push('--out-txt', outTxt)
        outputFiles.push(outTxt)
      }
    } else if (params.mode === 'drama-script') {
      scriptPath = this.skillLoader.getScriptPath('ai-drama-script-studio', 'export_drama.py')
      args = ['--root', params.projectRoot, '--title', safeTitle]
      if (params.format === 'docx' || params.format === 'both') {
        args.push('--out-docx', outDocx)
        outputFiles.push(outDocx)
      }
      if (params.format === 'txt' || params.format === 'both') {
        args.push('--out-txt', outTxt)
        outputFiles.push(outTxt)
      }
    } else {
      scriptPath = this.skillLoader.getScriptPath('story-prose-writer', 'build_prose_docx.py')
      args = [
        '--chapters-dir',
        path.join(params.projectRoot, '正文'),
        '--out',
        outDocx,
        '--title',
        safeTitle,
        '--preset',
        params.preset ?? 'book'
      ]
      outputFiles.push(outDocx)
    }

    if (scriptPath && this.pythonExe) {
      const res = await this.runScript(scriptPath, args, params.projectRoot)
      const produced = outputFiles.filter((f) => fs.existsSync(f))
      if (res.code === 0 && produced.length > 0) {
        const log = [res.stdout, res.stderr].filter(Boolean).join('\n').trim()
        return { ok: true, outputFiles: produced, log }
      }
    }

    // Pure-TypeScript fallback exporter (zero-Python safe)
    const chapters = collectChapterFiles(params.projectRoot, params.mode)
    if (chapters.length === 0) {
      return { ok: false, outputFiles: [], log: '未找到可导出的正文章节。' }
    }

    const written: string[] = []
    if (params.format === 'docx' || params.format === 'both') {
      const buf = buildSimpleDocxBuffer(params.title, chapters)
      fs.writeFileSync(outDocx, buf)
      written.push(outDocx)
    }
    if (params.format === 'txt' || params.format === 'both') {
      const txtOut = chapters.map((c) => `${c.heading}\n\n${c.body}`).join('\n\n====================\n\n')
      fs.writeFileSync(outTxt, txtOut, 'utf8')
      written.push(outTxt)
    }

    return {
      ok: written.length > 0,
      outputFiles: written,
      log: `已使用内置纯净排版引擎完成导出（共 ${chapters.length} 篇章节，无需依赖本机 Python）。`
    }
  }

  async exportSelectedAssets(params: {
    projectRoot: string
    title: string
    category: 'world' | 'outline' | 'prose'
    relPaths: string[]
    mergeMode: 'merged' | 'separate'
  }): Promise<{ ok: boolean; outputFiles: string[]; outputDir: string; message: string }> {
    const resolvedRoot = path.resolve(params.projectRoot)
    const deliveryDir = path.join(resolvedRoot, '交付')
    fs.mkdirSync(deliveryDir, { recursive: true })
    const safeTitle = params.title.replace(/[\\/:*?"<>|]/g, '_') || '未命名作品'

    const sections: Array<{ heading: string; body: string }> = []
    for (const rel of params.relPaths) {
      const abs = path.resolve(resolvedRoot, rel)
      if (!abs.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep)) {
        throw new Error(`安全拦截：路径越界 (${rel})`)
      }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue
      const raw = fs.readFileSync(abs, 'utf8')
      const clean = stripAgentMarkupForDisplay(raw)
      const heading = path.basename(abs).replace(/\.(md|txt|docx|pdf)$/i, '')
      sections.push({ heading, body: clean })
    }

    if (sections.length === 0) {
      return {
        ok: false,
        outputFiles: [],
        outputDir: deliveryDir,
        message: '未找到可导出的有效文档内容。'
      }
    }

    if (params.mergeMode === 'separate' && params.category === 'prose' && sections.length > 1) {
      const subDir = path.join(deliveryDir, `《${safeTitle}》_分章导出`)
      fs.mkdirSync(subDir, { recursive: true })
      const outputFiles: string[] = []
      const usedNames = new Set<string>()
      for (const sec of sections) {
        let baseName = sec.heading.replace(/[\\/:*?"<>|]/g, '_') || '章节'
        let candidate = baseName
        let idx = 2
        while (usedNames.has(candidate.toLowerCase())) {
          candidate = `${baseName}_${idx++}`
        }
        usedNames.add(candidate.toLowerCase())
        const outPath = path.join(subDir, `${candidate}.docx`)
        fs.writeFileSync(outPath, buildSimpleDocxBuffer(sec.heading, [{ heading: '', body: sec.body }]))
        outputFiles.push(outPath)
      }
      return {
        ok: true,
        outputFiles,
        outputDir: subDir,
        message: `已分章导出 ${outputFiles.length} 个独立 Docx 文件`
      }
    }

    let outFileName = `《${safeTitle}》_导出.docx`
    let docTitle = params.title
    if (params.category === 'world') {
      outFileName = `《${safeTitle}》_世界观设定集.docx`
      docTitle = `《${params.title}》世界观设定集`
    } else if (params.category === 'outline') {
      outFileName = `《${safeTitle}》_故事大纲.docx`
      docTitle = `《${params.title}》故事大纲`
    } else if (sections.length === 1) {
      const safeHeading = sections[0].heading.replace(/[\\/:*?"<>|]/g, '_') || '单章正文'
      outFileName = `${safeHeading}.docx`
      docTitle = sections[0].heading
    } else {
      outFileName = `《${safeTitle}》_精选正文(${sections.length}章).docx`
      docTitle = `《${params.title}》精选正文`
    }

    const outPath = path.join(deliveryDir, outFileName)
    const buf = buildSimpleDocxBuffer(
      docTitle,
      sections.length === 1 && params.category === 'prose'
        ? [{ heading: '', body: sections[0].body }]
        : sections
    )
    fs.writeFileSync(outPath, buf)

    return {
      ok: true,
      outputFiles: [outPath],
      outputDir: deliveryDir,
      message: `已生成读者排版 Docx：${outFileName}`
    }
  }
}
