import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import iconv from 'iconv-lite'
import type { CreationMode, ImportFileRole, ImportedFileItem, ProjectSummary } from '@shared/types'
import { ProjectManager } from './project-manager'

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

export function guessFileRole(fileName: string, previewText: string): ImportFileRole {
  const name = fileName.toLowerCase()
  const sample = previewText.slice(0, 1000)

  if (/选题简报|扫榜报告/.test(name)) return 'radar-brief'
  if (/世界观|设定|规则|正典/.test(name)) return 'world'
  if (/人物|角色|小传/.test(name)) return 'character'
  if (/声口|文风/.test(name)) return 'style-sample'
  if (/大纲|细纲|节拍|卡点|dna|总案/.test(name)) return 'outline'
  if (/全文|第\s*\d+\s*[章节集]|正文|草稿/.test(name)) return 'prose'

  if (/Story DNA|分章细纲|剧情段|故事弧|节拍表/.test(sample)) return 'outline'
  if (/RULE-|世界规则|设定集/.test(sample)) return 'world'
  if (/CHAR-|角色卡|人物小传/.test(sample)) return 'character'
  if (/第[一二三四五六七八九十百千0-9]+[章节回]/.test(sample)) return 'prose'

  return 'custom'
}

function decodeTextBuffer(buf: Buffer): string {
  // Check UTF-8 validity first
  const utf8 = buf.toString('utf8')
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length
  if (replacementCount === 0) return utf8.replace(/^\uFEFF/, '')
  return iconv.decode(buf, 'gb18030')
}

export class ImporterService {
  constructor(private readonly projectManager: ProjectManager) {}

  async parsePaths(inputPaths: string[]): Promise<ImportedFileItem[]> {
    const collectedFiles: string[] = []

    const collect = (p: string, depth: number) => {
      if (!fs.existsSync(p) || depth > 4) return
      const stat = fs.statSync(p)
      if (stat.isFile()) {
        if (/\.(docx|txt|md)$/i.test(p)) collectedFiles.push(p)
      } else if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          collect(path.join(p, entry.name), depth + 1)
        }
      }
    }

    for (const p of inputPaths) {
      collect(p, 0)
    }

    const results: ImportedFileItem[] = []
    for (const filePath of collectedFiles) {
      results.push(await this.parseSingleFile(filePath))
    }
    return results
  }

  async parseSingleFile(filePath: string): Promise<ImportedFileItem> {
    const fileName = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const id = `imp_${crypto.createHash('md5').update(filePath).digest('hex').slice(0, 10)}`

    try {
      let markdownContent = ''
      if (ext === '.docx') {
        const res = await mammoth.convertToHtml({ path: filePath })
        markdownContent = turndown.turndown(res.value || '').trim()
      } else {
        const buf = fs.readFileSync(filePath)
        markdownContent = decodeTextBuffer(buf).trim()
      }

      const previewText = markdownContent.slice(0, 800)
      const role = guessFileRole(fileName, previewText)
      return {
        id,
        sourcePath: filePath,
        fileName,
        ext,
        role,
        previewText,
        markdownContent,
        charCount: markdownContent.replace(/\s+/g, '').length
      }
    } catch (err) {
      return {
        id,
        sourcePath: filePath,
        fileName,
        ext,
        role: 'custom',
        previewText: '',
        markdownContent: '',
        charCount: 0,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  materializeIntoProject(params: {
    parentDir: string
    title: string
    mode: CreationMode
    files: ImportedFileItem[]
  }): { summary: ProjectSummary; writtenPaths: string[]; primaryRelPath: string } {
    const { summary } = this.projectManager.createNewProject({
      parentDir: params.parentDir,
      title: params.title,
      mode: params.mode
    })

    const writtenPaths: string[] = []
    let primaryRelPath = ''

    const usedNames = new Set<string>()
    const uniqueBase = (name: string) => {
      const stem = path.basename(name, path.extname(name))
      let candidate = `${stem}.md`
      let i = 2
      while (usedNames.has(candidate.toLowerCase())) {
        candidate = `${stem}_${i++}.md`
      }
      usedNames.add(candidate.toLowerCase())
      return candidate
    }

    for (const file of params.files) {
      if (file.error || !file.markdownContent) continue
      const safeName = uniqueBase(file.fileName)
      let relTarget = path.join('参考资料', safeName).replace(/\\/g, '/')

      if (file.role === 'world') {
        relTarget = params.mode === 'long-novel' ? `设定/世界观/${safeName}` : `参考资料/世界观_${safeName}`
      } else if (file.role === 'outline') {
        relTarget =
          params.mode === 'long-novel'
            ? `大纲/${safeName}`
            : params.mode === 'short-webnovel'
              ? `参考资料/大纲_${safeName}`
              : `参考资料/分集参考_${safeName}`
      } else if (file.role === 'prose') {
        relTarget = params.mode === 'drama-script' ? `参考资料/小说原稿_${safeName}` : `正文/导入_${safeName}`
      } else if (file.role === 'character') {
        relTarget = params.mode === 'long-novel' ? `设定/${safeName}` : `参考资料/人物_${safeName}`
      } else if (file.role === 'style-sample') {
        relTarget = params.mode === 'long-novel' ? `正文/导入声口_${safeName}` : `参考资料/声口_${safeName}`
      }

      const absTarget = this.projectManager.assertInsideProject(summary.rootPath, relTarget)
      fs.mkdirSync(path.dirname(absTarget), { recursive: true })
      fs.writeFileSync(absTarget, file.markdownContent, 'utf8')
      writtenPaths.push(relTarget)
      if (!primaryRelPath) primaryRelPath = relTarget
    }

    const updated = this.projectManager.buildSummary(summary.rootPath, summary)
    return {
      summary: updated,
      writtenPaths,
      primaryRelPath: primaryRelPath || '大纲/00_故事DNA.md'
    }
  }
}
