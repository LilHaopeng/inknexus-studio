import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { CreationMode, LintIssue, LintReport, SkillId } from '@shared/types'
import { SkillLoader } from '../orchestrator/skill-loader'

function findPython(): string {
  const candidates = ['python', 'C:\\Python314\\python.exe', 'C:\\Python313\\python.exe', 'C:\\Python312\\python.exe']
  for (const c of candidates) {
    if (c === 'python' || fs.existsSync(c)) return c
  }
  return 'python'
}

export function parseLintOutput(rawOutput: string, exitCode: number, scriptName: string): LintReport {
  const lines = rawOutput.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const issues: LintIssue[] = []
  const metrics: Record<string, string | number> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    // Extract key: value metrics if formatted like "字数: 3240" or "total_words=..."
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

export class PythonRunner {
  private readonly pythonExe: string

  constructor(private readonly skillLoader: SkillLoader) {
    this.pythonExe = findPython()
  }

  async runScript(scriptPath: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(this.pythonExe, [scriptPath, ...args], {
        cwd: cwd || path.dirname(scriptPath),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
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
    if (!scriptPath) {
      return {
        status: 'not-run',
        scriptName,
        issues: [{ severity: 'warn', message: `未找到脚本 ${scriptName}` }],
        metrics: {},
        rawOutput: '',
        ranAt: Date.now()
      }
    }

    const res = await this.runScript(scriptPath, args, projectRoot)
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

    if (!scriptPath) {
      return { ok: false, outputFiles: [], log: '未找到导出脚本。' }
    }

    const res = await this.runScript(scriptPath, args, params.projectRoot)
    const log = [res.stdout, res.stderr].filter(Boolean).join('\n').trim()
    return { ok: res.code === 0, outputFiles: outputFiles.filter((f) => fs.existsSync(f)), log }
  }
}
