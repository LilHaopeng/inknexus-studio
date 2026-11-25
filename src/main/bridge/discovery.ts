import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { AgentBackendInfo, ReasoningLevel } from '@shared/types'

function execAsync(cmd: string, args: string[], timeoutMs = 8000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({
        code: err ? 1 : 0,
        stdout: stdout?.toString() ?? '',
        stderr: stderr?.toString() ?? ''
      })
    })
  })
}

async function whereBinary(names: string[]): Promise<string | null> {
  for (const name of names) {
    const res = await execAsync('where.exe', [name], 4000)
    if (res.code === 0 && res.stdout.trim()) {
      const lines = res.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
      const preferred = lines.find((l) => /\.(exe|cmd|bat)$/i.test(l)) ?? lines[0]
      if (preferred && fs.existsSync(preferred)) return preferred
    }
  }
  return null
}

function checkKnownPaths(candidates: string[]): string | null {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

const ALL_FIVE_LEVELS: ReasoningLevel[] = ['off', 'low', 'medium', 'high', 'max']

export class AgentDiscoveryService {
  async discoverLocalAgents(): Promise<AgentBackendInfo[]> {
    const localApp = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    const npmBin = path.join(appData, 'npm')

    const [agyWhere, codexWhere, dshWhere, claudeWhere, geminiWhere, qoderWhere] = await Promise.all([
      whereBinary(['agy.exe', 'agy']),
      whereBinary(['codex.cmd', 'codex.exe']),
      whereBinary(['dsh.cmd', 'dsh.exe']),
      whereBinary(['claude.cmd', 'claude.exe']),
      whereBinary(['gemini.cmd', 'gemini.exe']),
      whereBinary(['qoder.exe', 'qoder.cmd', 'qodercli.exe', 'qodercli.cmd'])
    ])

    const agyExe = agyWhere ?? checkKnownPaths([path.join(localApp, 'agy', 'bin', 'agy.exe')])
    const codexCmd = codexWhere ?? checkKnownPaths([path.join(npmBin, 'codex.cmd')])
    const dshCmd =
      dshWhere ??
      checkKnownPaths([path.join(localApp, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd')])
    const claudeCmd = claudeWhere ?? checkKnownPaths([path.join(npmBin, 'claude.cmd')])
    const geminiCmd = geminiWhere ?? checkKnownPaths([path.join(npmBin, 'gemini.cmd')])
    const qoderCmd = qoderWhere

    let agyModels = [
      'gemini-4-neon-high',
      'gemini-4-neon-xhigh',
      'gemini-4-carbon-high',
      'gemini-3.8-flash-high',
      'claude-opus-5-5-high',
      'claude-sonnet-5-5-high'
    ]
    if (agyExe) {
      const mRes = await execAsync(agyExe, ['models'], 8000)
      if (mRes.code === 0 && mRes.stdout.trim()) {
        const parsed = mRes.stdout
          .split(/\r?\n/)
          .map((l) => l.split('\t')[0]?.trim())
          .filter((id) => Boolean(id) && !id.startsWith('Fetching'))
        if (parsed.length > 0) agyModels = parsed
      }
    }

    return [
      {
        id: 'agy-cli',
        kind: 'acp',
        name: 'AGY (Antigravity)',
        description: 'Google Antigravity 本地 Agent，支持 ACP 与 stream-json、动态模型及 5 档思考深度',
        status: agyExe ? 'available' : 'not-installed',
        executablePath: agyExe ?? undefined,
        models: agyModels,
        supportedReasoning: ['low', 'medium', 'high', 'max'],
        supportsStreamingThinking: true
      },
      {
        id: 'codex-cli',
        kind: 'cli',
        name: 'Codex CLI',
        description: 'OpenAI Codex 本地非交互式 Agent（自动绕过 PowerShell 脚本限制）',
        status: codexCmd ? 'available' : 'not-installed',
        executablePath: codexCmd ?? undefined,
        models: ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-5-codex'],
        supportedReasoning: ['low', 'medium', 'high', 'max'],
        supportsStreamingThinking: true
      },
      {
        id: 'dsh-cli',
        kind: 'cli',
        name: 'DSH (DeepSeek Harness)',
        description: 'DeepSeek 本地插件化 Agent 运行时（自动清洗 socks 代理）',
        status: dshCmd ? 'available' : 'not-installed',
        executablePath: dshCmd ?? undefined,
        models: ['deepseek-v4-pro', 'deepseek-flash'],
        supportedReasoning: ALL_FIVE_LEVELS,
        supportsStreamingThinking: true
      },
      {
        id: 'claude-cli',
        kind: 'cli',
        name: 'Claude Code CLI',
        description: 'Anthropic Claude Code 本地命令行 Agent',
        status: claudeCmd ? 'available' : 'not-installed',
        executablePath: claudeCmd ?? undefined,
        models: ['claude-opus-5-5', 'claude-sonnet-5-5'],
        supportedReasoning: ['off', 'low', 'medium', 'high'],
        supportsStreamingThinking: true
      },
      {
        id: 'gemini-cli',
        kind: 'acp',
        name: 'Gemini CLI',
        description: 'Google Gemini CLI（原生 --acp 模式）',
        status: geminiCmd ? 'available' : 'not-installed',
        executablePath: geminiCmd ?? undefined,
        models: ['gemini-4-neon', 'gemini-4-carbon', 'gemini-4-hydrogen'],
        supportedReasoning: ALL_FIVE_LEVELS,
        supportsStreamingThinking: true
      },
      {
        id: 'qoder-cli',
        kind: 'acp',
        name: 'Qoder CLI',
        description: 'Qoder 本地智能体（支持 qoder acp 与 headless 模式，安装后自动启用）',
        status: qoderCmd ? 'available' : 'not-installed',
        executablePath: qoderCmd ?? undefined,
        models: ['qoder-auto', 'qwen4-max'],
        supportedReasoning: ['off', 'low', 'medium', 'high'],
        supportsStreamingThinking: true
      }
    ]
  }

  async testLocalAgent(backend: AgentBackendInfo): Promise<{ ok: boolean; message: string }> {
    if (!backend.executablePath || backend.status === 'not-installed') {
      return { ok: false, message: '本机未检测到可执行文件' }
    }
    const isCmd = /\.(cmd|bat)$/i.test(backend.executablePath)
    const res = isCmd
      ? await execAsync('cmd.exe', ['/c', backend.executablePath, '--version'], 8000)
      : await execAsync(backend.executablePath, ['--version'], 8000)

    if (res.code === 0 || res.stdout.trim()) {
      return { ok: true, message: `已连通：${(res.stdout || res.stderr).trim().slice(0, 100)}` }
    }
    const helpRes = isCmd
      ? await execAsync('cmd.exe', ['/c', backend.executablePath, '--help'], 8000)
      : await execAsync(backend.executablePath, ['--help'], 8000)
    if (helpRes.stdout.trim() || helpRes.stderr.trim()) {
      return { ok: true, message: '可执行文件响应正常' }
    }
    return { ok: false, message: res.stderr || '命令无响应' }
  }
}
