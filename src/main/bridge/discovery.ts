import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AgentBackendInfo, AgentBridgePaths, ReasoningLevel } from '@shared/types'

export interface CustomAgentOverrideEntry {
  id: string
  name?: string
  description?: string
  kind?: 'acp' | 'cli'
  executablePath?: string
  models?: string[]
  supportedReasoning?: ReasoningLevel[]
  supportsStreamingThinking?: boolean
  env?: Record<string, string>
  customArgs?: string[]
  enabled?: boolean
}

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
  timeoutMs = 12000,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env },
      (err, stdout, stderr) => {
        resolve({
          code: err ? 1 : 0,
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? ''
        })
      }
    )
  })
}

async function whereBinary(names: string[]): Promise<string | null> {
  for (const name of names) {
    const res = await execAsync('where.exe', [name], 5000)
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
    if (c && fs.existsSync(c)) return c
  }
  return null
}

async function findRegistryInstallRoots(): Promise<string[]> {
  const regKeys = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]
  const keywords = /(workbuddy|codebuddy|deepseek|harness|qoder|antigravity|agy)/i
  const psScript = [
    '$paths = @();',
    ...regKeys.map((k) => {
      const psPath = k.replace(/^HKCU\\/, 'HKCU:\\').replace(/^HKLM\\/, 'HKLM:\\')
      return `if (Test-Path '${psPath}') { Get-ChildItem '${psPath}' -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if ($p.DisplayName -match 'workbuddy|codebuddy|deepseek|harness|qoder|antigravity|agy' -or $p.InstallLocation -match 'workbuddy|codebuddy|deepseek|harness|qoder|antigravity|agy') { if ($p.InstallLocation) { $paths += $p.InstallLocation }; if ($p.DisplayIcon) { $paths += (Split-Path ($p.DisplayIcon -replace ',.*$','') -Parent) } } } };`
    }),
    '$paths | Select-Object -Unique | Write-Output'
  ].join(' ')

  const res = await execAsync('powershell.exe', ['-NoProfile', '-Command', psScript], 5000)
  if (res.code !== 0 || !res.stdout.trim()) return []
  const roots = new Set<string>()
  for (const rawLine of res.stdout.split(/\r?\n/)) {
    const clean = rawLine.trim().replace(/^"|"$/g, '')
    if (clean && keywords.test(clean) && fs.existsSync(clean)) {
      roots.add(clean)
    }
  }
  return Array.from(roots)
}

export function stripAnsiCodes(text: string): string {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

export function parseWorkBuddyHelpModels(helpText: string): string[] {
  const clean = stripAnsiCodes(helpText).replace(/\s+/g, ' ')
  const match = clean.match(/--model\s+(?:<[^>]+>|\[[^\]]+\])?[\s\S]{0,800}?Currently supported:\s*\(([^)]+)\)/i)
  if (!match?.[1]) return []
  return match[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => Boolean(s) && /^[a-z0-9._-]+$/i.test(s))
}

export function resolveNodeForScript(scriptPath: string, whereNode: string | null): { cmd: string; extraEnv?: NodeJS.ProcessEnv } {
  if (whereNode && fs.existsSync(whereNode)) {
    return { cmd: whereNode }
  }
  // Check bundled node.exe near the script (e.g. WorkBuddy / Electron runtime folder)
  let dir = path.dirname(scriptPath)
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, 'node.exe')
    if (fs.existsSync(candidate)) return { cmd: candidate }
    const binCandidate = path.join(dir, 'node', 'node.exe')
    if (fs.existsSync(binCandidate)) return { cmd: binCandidate }
    dir = path.dirname(dir)
  }
  // Fallback to Electron executable running as pure Node
  const execBase = path.basename(process.execPath || '').toLowerCase()
  if (process.execPath && !execBase.startsWith('node')) {
    return { cmd: process.execPath, extraEnv: { ELECTRON_RUN_AS_NODE: '1' } }
  }
  return { cmd: process.execPath || 'node' }
}

async function execCmdOrBin(
  exePath: string,
  args: string[],
  timeoutMs = 12000,
  extraEnv?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (/\.(mjs|js|cjs)$/i.test(exePath)) {
    const whereNode = await whereBinary(['node.exe'])
    const nodeExec = resolveNodeForScript(exePath, whereNode)
    const env = sanitizeSocksEnv(process.env, { ...extraEnv, ...nodeExec.extraEnv })
    return execAsync(nodeExec.cmd, [exePath, ...args], timeoutMs, env)
  }
  const env = sanitizeSocksEnv(process.env, extraEnv)
  if (/\.(cmd|bat)$/i.test(exePath)) {
    return execAsync('cmd.exe', ['/c', exePath, ...args], timeoutMs, env)
  }
  return execAsync(exePath, args, timeoutMs, env)
}

export function getBridgePaths(appDataRoot: string): AgentBridgePaths {
  const execDir =
    path.basename(process.execPath || '').toLowerCase() !== 'electron.exe' &&
    !(process as unknown as { defaultApp?: boolean }).defaultApp
      ? path.dirname(process.execPath)
      : process.cwd()
  const installCandidates = [
    path.join(execDir, 'AGENT_BRIDGE_README.md'),
    path.join(process.resourcesPath || '', 'AGENT_BRIDGE_README.md'),
    path.resolve(process.cwd(), 'AGENT_BRIDGE_README.md')
  ]
  const readmePath = installCandidates.find((p) => fs.existsSync(p)) ?? installCandidates[0]
  return {
    readmePath,
    configPath: path.join(appDataRoot, 'custom-agents.json'),
    installDir: execDir
  }
}

export function loadCustomAgentOverrides(appDataRoot: string): CustomAgentOverrideEntry[] {
  const execDir =
    path.basename(process.execPath || '').toLowerCase() !== 'electron.exe' &&
    !(process as unknown as { defaultApp?: boolean }).defaultApp
      ? path.dirname(process.execPath)
      : process.cwd()
  const files = [
    path.join(execDir, 'custom-agents.json'),
    path.join(appDataRoot, 'custom-agents.json')
  ]
  const byId = new Map<string, CustomAgentOverrideEntry>()
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { agents?: CustomAgentOverrideEntry[] }
      for (const entry of parsed?.agents ?? []) {
        if (!entry?.id) continue
        byId.set(entry.id, { ...(byId.get(entry.id) ?? {}), ...entry })
      }
    } catch {
      // ignore malformed custom-agents.json
    }
  }
  return Array.from(byId.values())
}

const ALL_FIVE_LEVELS: ReasoningLevel[] = ['off', 'low', 'medium', 'high', 'max']

export class AgentDiscoveryService {
  constructor(private readonly appDataRoot: string = path.join(process.env.APPDATA || os.tmpdir(), 'InkNexusStudio')) {}

  getBridgePaths(): AgentBridgePaths {
    return getBridgePaths(this.appDataRoot)
  }

  async discoverLocalAgents(): Promise<AgentBackendInfo[]> {
    const homeDir = os.homedir()
    const localApp = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const npmBin = path.join(appData, 'npm')
    const [regRoots, agyWhere, codexWhere, dshWhere, claudeWhere, geminiWhere, qoderWhere, qoderCnWhere] = await Promise.all([
      findRegistryInstallRoots(),
      whereBinary(['agy.exe', 'agy']),
      whereBinary(['codex.cmd', 'codex.exe']),
      whereBinary(['dsh.cmd', 'dsh.exe']),
      whereBinary(['claude.cmd', 'claude.exe']),
      whereBinary(['gemini.cmd', 'gemini.exe']),
      whereBinary(['qoder.exe', 'qoder.cmd', 'qodercli.exe', 'qodercli.cmd']),
      whereBinary(['qoderclicn.cmd', 'qoderclicn.exe', 'qoder-cn.cmd', 'qoder-cn.exe', 'qodercn.cmd', 'qodercn.exe'])
    ])

    const agyExe =
      agyWhere ??
      checkKnownPaths([
        path.join(localApp, 'agy', 'bin', 'agy.exe'),
        ...regRoots.map((r) => path.join(r, 'bin', 'agy.exe')),
        ...regRoots.map((r) => path.join(r, 'resources', 'app', 'bin', 'agy.exe'))
      ])

    const codexCmd = codexWhere ?? checkKnownPaths([path.join(npmBin, 'codex.cmd')])

    const dshCandidates = [
      path.join(localApp, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'),
      path.join(localApp, 'Programs', 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.exe'),
      path.join(programFiles, 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'),
      path.join(programFiles, 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.exe'),
      path.join(programFilesX86, 'DeepSeek Harness', 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'),
      path.join(homeDir, '.dsh', 'bin', 'dsh.cmd'),
      path.join(homeDir, '.dsh', 'bin', 'dsh.exe'),
      path.join(npmBin, 'dsh.cmd'),
      ...regRoots.flatMap((r) => [
        path.join(r, 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd'),
        path.join(r, 'resources', 'runtime', 'cli', 'bin', 'dsh.exe'),
        path.join(r, 'bin', 'dsh.cmd'),
        path.join(r, 'bin', 'dsh.exe'),
        path.join(r, 'dsh.cmd'),
        path.join(r, 'dsh.exe')
      ])
    ]
    const dshCmd = dshWhere ?? checkKnownPaths(dshCandidates)

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
      path.join(programFiles, 'WorkBuddy', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      path.join(programFilesX86, 'WorkBuddy', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      ...regRoots
        .filter((r) => /workbuddy(?!aiint|\s+ai)/i.test(r))
        .map((r) => path.join(r, 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'))
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
      path.join(programFiles, 'WorkBuddy AI', 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'),
      ...regRoots
        .filter((r) => /workbuddyaiint|workbuddy\s+ai/i.test(r))
        .map((r) => path.join(r, 'resources', 'app.asar.unpacked', 'cli', 'dist', 'codebuddy-lite-wb.mjs'))
    ])
    if (!workbuddyIntlPath && fs.existsSync(path.join(homeDir, '.workbuddy-ai'))) {
      workbuddyIntlPath =
        (await whereBinary(['codebuddy.exe', 'codebuddy.cmd'])) ??
        checkKnownPaths([path.join(localApp, 'codebuddy', 'bin', 'codebuddy.exe'), path.join(npmBin, 'codebuddy.cmd')])
    }

    const overrides = loadCustomAgentOverrides(this.appDataRoot)
    const overrideMap = new Map(overrides.map((o) => [o.id, o]))

    const resolvedAgy = overrideMap.get('agy-cli')?.executablePath || agyExe
    const resolvedQoderCn = overrideMap.get('qoder-cn-cli')?.executablePath || qoderCnCmd
    const resolvedWbCn = overrideMap.get('workbuddy-cn-cli')?.executablePath || workbuddyCnPath
    const resolvedWbIntl = overrideMap.get('workbuddy-intl-cli')?.executablePath || workbuddyIntlPath

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
      'glm-5.3',
      'kimi-k3.1-pro',
      'deepseek-v4-pro',
      'minimax-m3.1-flash',
      'glm-5.1'
    ]
    let workbuddyIntlModels = ['primary-model', 'deep-model', 'balanced-model', 'fast-model']

    const [agyRes, qoderCnRes, wbCnRes, wbIntlRes] = await Promise.all([
      resolvedAgy ? execCmdOrBin(resolvedAgy, ['models'], 12000, overrideMap.get('agy-cli')?.env) : Promise.resolve(null),
      resolvedQoderCn
        ? execCmdOrBin(resolvedQoderCn, ['--list-models'], 12000, overrideMap.get('qoder-cn-cli')?.env)
        : Promise.resolve(null),
      resolvedWbCn
        ? execCmdOrBin(resolvedWbCn, ['--help'], 12000, {
            CODEBUDDY_INTERNET_ENVIRONMENT: 'internal',
            ...(overrideMap.get('workbuddy-cn-cli')?.env ?? {})
          })
        : Promise.resolve(null),
      resolvedWbIntl
        ? execCmdOrBin(resolvedWbIntl, ['--help'], 12000, {
            CODEBUDDY_INTERNET_ENVIRONMENT: '',
            ...(overrideMap.get('workbuddy-intl-cli')?.env ?? {})
          })
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
      const parsed = parseWorkBuddyHelpModels(wbCnRes.stdout + '\n' + wbCnRes.stderr)
      if (parsed.length > 0) workbuddyCnModels = parsed
    }

    if (wbIntlRes) {
      const parsed = parseWorkBuddyHelpModels(wbIntlRes.stdout + '\n' + wbIntlRes.stderr)
      if (parsed.length > 0) workbuddyIntlModels = parsed
    }

    const baseList: AgentBackendInfo[] = [
      {
        id: 'agy-cli',
        kind: 'acp',
        name: 'AGY (Antigravity)',
        description: 'Google Antigravity 本地 Agent，支持 ACP 与 stream-json、动态模型及思考深度',
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
        description: 'OpenAI Codex 本地非交互式 Agent',
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
        description: 'DeepSeek 本地插件化 Agent 运行时',
        status: dshCmd ? 'available' : 'not-installed',
        executablePath: dshCmd ?? undefined,
        models: ['deepseek-v4-pro', 'deepseek-reasoner', 'deepseek-flash'],
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
        description: 'Qoder 国内版 CLI（qoderclicn）',
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
        description: 'Qoder 国际版智能体',
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
        description: '腾讯 WorkBuddy / CodeBuddy 国内版 CLI',
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
        description: 'WorkBuddy AI 国际版 CLI',
        status: workbuddyIntlPath ? 'available' : 'not-installed',
        executablePath: workbuddyIntlPath ?? undefined,
        models: workbuddyIntlModels,
        supportedReasoning: ALL_FIVE_LEVELS,
        supportsStreamingThinking: true
      }
    ]

    // Apply custom-agents.json overrides
    const mergedList = baseList.map((item) => {
      const ov = overrideMap.get(item.id)
      if (!ov) return { ...item, source: 'builtin' as const }
      if (ov.enabled === false) {
        return { ...item, status: 'not-installed' as const, source: 'custom-override' as const }
      }
      const nextExe = ov.executablePath || item.executablePath
      const validExe = Boolean(nextExe && fs.existsSync(nextExe))
      return {
        ...item,
        name: ov.name || item.name,
        description: ov.description || item.description,
        kind: ov.kind || item.kind,
        executablePath: nextExe,
        status: validExe ? ('available' as const) : item.status,
        models: ov.models && ov.models.length > 0 ? ov.models : item.models,
        supportedReasoning:
          ov.supportedReasoning && ov.supportedReasoning.length > 0 ? ov.supportedReasoning : item.supportedReasoning,
        supportsStreamingThinking: ov.supportsStreamingThinking ?? item.supportsStreamingThinking,
        customEnv: ov.env,
        customArgs: ov.customArgs,
        source: 'custom-override' as const
      }
    })

    // Append custom user-defined CLI IDs not in builtin list
    const builtinIds = new Set(baseList.map((b) => b.id))
    for (const ov of overrides) {
      if (builtinIds.has(ov.id) || ov.enabled === false) continue
      const validExe = Boolean(ov.executablePath && fs.existsSync(ov.executablePath))
      mergedList.push({
        id: ov.id,
        kind: ov.kind ?? 'cli',
        name: ov.name || ov.id,
        description: ov.description || '外部 Agent 自定义桥接（custom-agents.json）',
        status: validExe ? 'available' : 'not-installed',
        executablePath: ov.executablePath,
        models: ov.models && ov.models.length > 0 ? ov.models : ['default'],
        supportedReasoning: ov.supportedReasoning && ov.supportedReasoning.length > 0 ? ov.supportedReasoning : ['low', 'medium', 'high'],
        supportsStreamingThinking: ov.supportsStreamingThinking ?? true,
        customEnv: ov.env,
        customArgs: ov.customArgs,
        source: 'custom-override'
      })
    }

    return mergedList
  }

  async testLocalAgent(backend: AgentBackendInfo): Promise<{ ok: boolean; message: string }> {
    if (!backend.executablePath || backend.status === 'not-installed') {
      return { ok: false, message: '本机未检测到可执行文件' }
    }

    const extraEnv: NodeJS.ProcessEnv = {
      ...(backend.id === 'workbuddy-cn-cli'
        ? { CODEBUDDY_INTERNET_ENVIRONMENT: 'internal' }
        : backend.id === 'workbuddy-intl-cli'
          ? { CODEBUDDY_INTERNET_ENVIRONMENT: '' }
          : {}),
      ...(backend.customEnv ?? {})
    }

    const res = await execCmdOrBin(backend.executablePath, ['--version'], 10000, extraEnv)
    if (res.code === 0 || res.stdout.trim()) {
      return { ok: true, message: `已连通：${(res.stdout || res.stderr).trim().slice(0, 100)}` }
    }
    const helpRes = await execCmdOrBin(backend.executablePath, ['--help'], 10000, extraEnv)
    if (helpRes.stdout.trim() || helpRes.stderr.trim()) {
      return { ok: true, message: '可执行文件响应正常' }
    }
    return { ok: false, message: res.stderr || '命令无响应' }
  }
}
