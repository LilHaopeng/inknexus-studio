import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AgentBackendInfo, ReasoningLevel } from '@shared/types'

function sanitizeSocksEnv(baseEnv: NodeJS.ProcessEnv, extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv }
  for (const key of ['all_proxy', 'ALL_PROXY', 'https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY']) {
    const val = env[key]
    if (val && /^socks/i.test(val.trim())) {
      delete env[key]
    }
  }
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v === undefined || v === '') {
        delete env[k]
      } else {
        env[k] = v
      }
    }
  }
  return env
}

function execAsync(
  cmd: string,
  args: string[],
  timeoutMs = 8000,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, env }, (err, stdout, stderr) => {
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

export function parseWorkBuddyHelpModels(helpText: string): string[] {
  const match = helpText.match(/--model\s+<model>[\s\S]*?Currently supported:\s*\(([^)]+)\)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function execCmdOrBin(
  exePath: string,
  args: string[],
  timeoutMs = 8000,
  extraEnv?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  const env = sanitizeSocksEnv(process.env, extraEnv)
  if (/\.(mjs|js|cjs)$/i.test(exePath)) {
    const nodeBin = (await whereBinary(['node.exe'])) ?? 'node'
    return execAsync(nodeBin, [exePath, ...args], timeoutMs, env)
  }
  if (/\.(cmd|bat)$/i.test(exePath)) {
    return execAsync('cmd.exe', ['/c', exePath, ...args], timeoutMs, env)
  }
  return execAsync(exePath, args, timeoutMs, env)
}

const ALL_FIVE_LEVELS: ReasoningLevel[] = ['off', 'low', 'medium', 'high', 'max']

export class AgentDiscoveryService {
  async discoverLocalAgents(): Promise<AgentBackendInfo[]> {
    const homeDir = os.homedir()
    const localApp = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const npmBin = path.join(appData, 'npm')

    const [agyWhere, codexWhere, dshWhere, claudeWhere, geminiWhere, qoderWhere, qoderCnWhere] = await Promise.all([
      whereBinary(['agy.exe', 'agy']),
      whereBinary(['codex.cmd', 'codex.exe']),
      whereBinary(['dsh.cmd', 'dsh.exe']),
      whereBinary(['claude.cmd', 'claude.exe']),
      whereBinary(['gemini.cmd', 'gemini.exe']),
      whereBinary(['qoder.exe', 'qoder.cmd', 'qodercli.exe', 'qodercli.cmd']),
      whereBinary(['qoderclicn.cmd', 'qoderclicn.exe', 'qoder-cn.cmd', 'qoder-cn.exe', 'qodercn.cmd', 'qodercn.exe'])
    ])

    const agyExe = agyWhere ?? checkKnownPaths([path.join(localApp, 'agy', 'bin', 'agy.exe')])
    const codexCmd = codexWhere ?? checkKnownPaths([path.join(npmBin, 'codex.cmd')])
    const dshCmd =
      dshWhere ??
      checkKnownPaths([path.join(localApp, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd')])
    const claudeCmd = claudeWhere ?? checkKnownPaths([path.join(npmBin, 'claude.cmd')])
    const geminiCmd = geminiWhere ?? checkKnownPaths([path.join(npmBin, 'gemini.cmd')])

    const qoderCmd =
      qoderWhere ??
      checkKnownPaths([
        path.join(homeDir, '.qoder', 'bin', 'qodercli.exe'),
        path.join(homeDir, '.qoder', 'bin', 'qoder.exe'),
        path.join(npmBin, 'qodercli.cmd'),
        path.join(npmBin, 'qoder.cmd')
      ])

    const qoderCnCmd =
      qoderCnWhere ??
      checkKnownPaths([
        path.join(npmBin, 'qoderclicn.cmd'),
        path.join(homeDir, '.qoder-cn', 'bin', 'qoderclicn.exe'),
        path.join(homeDir, '.qoder-cn', 'entry', 'qodercn.cmd'),
        path.join(homeDir, '.qoder-cn', 'entry', 'qoder-cn.cmd'),
        path.join(npmBin, 'qodercn.cmd')
      ])

    let workbuddyCnPath = checkKnownPaths([
      path.join(localApp, 'Programs', 'WorkBuddy', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      path.join(programFiles, 'WorkBuddy', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs')
    ])
    if (!workbuddyCnPath && fs.existsSync(path.join(homeDir, '.workbuddy'))) {
      workbuddyCnPath =
        (await whereBinary(['codebuddy-cn.exe', 'codebuddy-cn.cmd', 'codebuddy.exe', 'codebuddy.cmd'])) ??
        checkKnownPaths([path.join(localApp, 'codebuddy', 'bin', 'codebuddy.exe'), path.join(npmBin, 'codebuddy.cmd')])
    }

    let workbuddyIntlPath = checkKnownPaths([
      path.join(localApp, 'Programs', 'WorkBuddyAIint', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      path.join(localApp, 'Programs', 'WorkBuddy AI', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      path.join(programFiles, 'WorkBuddyAIint', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      path.join(programFiles, 'WorkBuddy AI', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs')
    ])
    if (!workbuddyIntlPath && fs.existsSync(path.join(homeDir, '.workbuddy-ai'))) {
      workbuddyIntlPath =
        (await whereBinary(['codebuddy.exe', 'codebuddy.cmd'])) ??
        checkKnownPaths([path.join(localApp, 'codebuddy', 'bin', 'codebuddy.exe'), path.join(npmBin, 'codebuddy.cmd')])
    }

    let agyModels = [
      'gemini-4-neon-high',
      'gemini-4-neon-xhigh',
      'gemini-4-carbon-high',
      'gemini-3.8-flash-high',
      'claude-opus-5-5-high',
      'claude-sonnet-5-5-high'
    ]
    let qoderCnModels = [
      'Auto',
      'Fast',
      'Qwen4-Max',
      'DeepSeek-V4-Pro',
      'GLM-5.4',
      'Kimi-K3.1-Pro',
      'MiniMax-M3.1-Flash'
    ]
    let workbuddyCnModels = [
      'auto',
      'glm-5v-turbo',
      'glm-5.1',
      'glm-5.0-turbo',
      'glm-5.0',
      'kimi-k2.5',
      'minimax-m2.7',
      'deepseek-v3-2-volc'
    ]
    let workbuddyIntlModels = ['primary-model', 'deep-model', 'balanced-model', 'fast-model']

    const [agyRes, qoderCnRes, wbCnRes, wbIntlRes] = await Promise.all([
      agyExe ? execAsync(agyExe, ['models'], 5000) : Promise.resolve(null),
      qoderCnCmd ? execCmdOrBin(qoderCnCmd, ['--list-models'], 5000) : Promise.resolve(null),
      workbuddyCnPath
        ? execCmdOrBin(workbuddyCnPath, ['--help'], 5000, { CODEBUDDY_INTERNET_ENVIRONMENT: 'internal' })
        : Promise.resolve(null),
      workbuddyIntlPath
        ? execCmdOrBin(workbuddyIntlPath, ['--help'], 5000, { CODEBUDDY_INTERNET_ENVIRONMENT: '' })
        : Promise.resolve(null)
    ])

    if (agyRes && agyRes.code === 0 && agyRes.stdout.trim()) {
      const parsed = agyRes.stdout
        .split(/\r?\n/)
        .map((l) => l.split('\t')[0]?.trim())
        .filter((id) => Boolean(id) && !id.startsWith('Fetching'))
      if (parsed.length > 0) agyModels = parsed
    }

    if (qoderCnRes && qoderCnRes.stdout.trim()) {
      const parsed = qoderCnRes.stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(
          (id) =>
            Boolean(id) &&
            id !== 'MODEL' &&
            !id.startsWith('Assertion failed') &&
            !id.startsWith('Fetching') &&
            !/\s/.test(id)
        )
      if (parsed.length > 0) qoderCnModels = parsed
    }

    if (wbCnRes) {
      const parsed = parseWorkBuddyHelpModels(wbCnRes.stdout)
      if (parsed.length > 0) workbuddyCnModels = parsed
    }

    if (wbIntlRes) {
      const parsed = parseWorkBuddyHelpModels(wbIntlRes.stdout)
      if (parsed.length > 0) workbuddyIntlModels = parsed
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
        id: 'qoder-cn-cli',
        kind: 'cli',
        name: 'Qoder CN CLI',
        description: 'Qoder 国内版 CLI（qoderclicn，支持 --list-models 与深度思考）',
        status: qoderCnCmd ? 'available' : 'not-installed',
        executablePath: qoderCnCmd ?? undefined,
        models: qoderCnModels,
        supportedReasoning: ['off', 'low', 'medium', 'high'],
        supportsStreamingThinking: true
      },
      {
        id: 'qoder-cli',
        kind: 'acp',
        name: 'Qoder CLI (国际版)',
        description: 'Qoder 国际版智能体（支持 qoder acp 与 headless 模式，安装后自动启用）',
        status: qoderCmd ? 'available' : 'not-installed',
        executablePath: qoderCmd ?? undefined,
        models: ['qoder-auto', 'qwen4-max'],
        supportedReasoning: ['off', 'low', 'medium', 'high'],
        supportsStreamingThinking: true
      },
      {
        id: 'workbuddy-cn-cli',
        kind: 'cli',
        name: 'WorkBuddy 国内版',
        description: '腾讯 WorkBuddy / CodeBuddy 国内版 CLI（自动识别内置 CLI 并对接国内端点）',
        status: workbuddyCnPath ? 'available' : 'not-installed',
        executablePath: workbuddyCnPath ?? undefined,
        models: workbuddyCnModels,
        supportedReasoning: ALL_FIVE_LEVELS,
        supportsStreamingThinking: true
      },
      {
        id: 'workbuddy-intl-cli',
        kind: 'cli',
        name: 'WorkBuddy 国际版',
        description: 'WorkBuddy AI 国际版 CLI（自动识别内置 CLI 并对接海外端点）',
        status: workbuddyIntlPath ? 'available' : 'not-installed',
        executablePath: workbuddyIntlPath ?? undefined,
        models: workbuddyIntlModels,
        supportedReasoning: ALL_FIVE_LEVELS,
        supportsStreamingThinking: true
      }
    ]
  }

  async testLocalAgent(backend: AgentBackendInfo): Promise<{ ok: boolean; message: string }> {
    if (!backend.executablePath || backend.status === 'not-installed') {
      return { ok: false, message: '本机未检测到可执行文件' }
    }

    const extraEnv: NodeJS.ProcessEnv | undefined =
      backend.id === 'workbuddy-cn-cli'
        ? { CODEBUDDY_INTERNET_ENVIRONMENT: 'internal' }
        : backend.id === 'workbuddy-intl-cli'
          ? { CODEBUDDY_INTERNET_ENVIRONMENT: '' }
          : undefined

    const res = await execCmdOrBin(backend.executablePath, ['--version'], 8000, extraEnv)
    if (res.code === 0 || res.stdout.trim()) {
      return { ok: true, message: `已连通：${(res.stdout || res.stderr).trim().slice(0, 100)}` }
    }
    const helpRes = await execCmdOrBin(backend.executablePath, ['--help'], 8000, extraEnv)
    if (helpRes.stdout.trim() || helpRes.stderr.trim()) {
      return { ok: true, message: '可执行文件响应正常' }
    }
    return { ok: false, message: res.stderr || '命令无响应' }
  }
}
