import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'child_process'
import nodeFs from 'fs'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

function getRawFs(): typeof nodeFs {
  const modName = 'original-fs'
  try {
    // In packaged Electron main process, 'original-fs' bypasses ASAR virtual-fs interception so .asar files copy as normal binary files
    if (typeof require === 'function') {
      return require(modName) as typeof nodeFs
    }
  } catch {
    // fall through
  }
  try {
    const base = typeof __filename === 'string' ? __filename : import.meta.url
    return createRequire(base)(modName) as typeof nodeFs
  } catch {
    return nodeFs
  }
}

const fs = getRawFs()

export interface InstallFileEntry {
  src: string
  rel: string
  size: number
}

export interface InstallProgressEvent {
  step: 'prepare' | 'copy' | 'configure' | 'done' | 'error'
  percent: number
  label: string
}

export interface PerformInstallOptions {
  payloadDir: string
  installDir: string
  createDesktopShortcut: boolean
  createStartMenuShortcut: boolean
  launchOnStartup: boolean
  skipSystemRegistration?: boolean
  appVersion?: string
  onProgress?: (ev: InstallProgressEvent) => void
}

const REG_UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\InkNexusStudio'
const REG_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const APP_EXE_NAME = '墨枢 InkNexus Studio.exe'

function runRegCommand(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => {
      resolve({ code: err ? 1 : 0, stdout: stdout?.toString() ?? '' })
    })
  })
}

export function getArgValue(argv: string[], flag: string): string | undefined {
  const prefix = `${flag}=`
  const exactIdx = argv.indexOf(flag)
  if (exactIdx >= 0 && argv[exactIdx + 1]) return argv[exactIdx + 1]
  const found = argv.find((a) => a.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}

export function resolvePayloadDir(argv: string[]): string {
  const explicit = getArgValue(argv, '--payload-dir')
  if (explicit && fs.existsSync(explicit)) return explicit
  // Fallback: running directly from win-unpacked directory
  const exeDir = path.dirname(process.execPath)
  if (fs.existsSync(path.join(exeDir, APP_EXE_NAME))) return exeDir
  return process.cwd()
}

export async function getDefaultInstallDir(): Promise<string> {
  const res = await runRegCommand(['query', REG_UNINSTALL_KEY, '/v', 'InstallLocation'])
  if (res.code === 0) {
    const match = res.stdout.match(/InstallLocation\s+REG_SZ\s+(.+)/)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'InkNexusStudio')
}

export function getDiskFreeBytes(targetDir: string): number {
  let probe = path.resolve(targetDir)
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  try {
    const stats = fs.statfsSync(probe)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return 0
  }
}

export function computePayloadStats(payloadDir: string): { files: InstallFileEntry[]; totalBytes: number } {
  const files: InstallFileEntry[] = []
  let totalBytes = 0

  const walk = (dir: string) => {
    let entries: nodeFs.Dirent[] = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      const rel = path.relative(payloadDir, full)
      if (ent.isDirectory()) {
        walk(full)
      } else if (ent.isFile()) {
        try {
          const st = fs.statSync(full)
          files.push({ src: full, rel, size: st.size })
          totalBytes += st.size
        } catch {
          // ignore unreadable file
        }
      }
    }
  }

  if (fs.existsSync(payloadDir)) walk(payloadDir)
  return { files, totalBytes }
}

function resolveInstallerIconPath(payloadDir: string): string {
  const candidates = [
    path.join(payloadDir, 'resources', 'icon.ico'),
    path.join(payloadDir, 'resources', 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.resolve(process.cwd(), 'build', 'icon.ico')
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return ''
}

function killRunningInstanceInDir(installDir: string): Promise<void> {
  return new Promise((resolve) => {
    const normalized = path.resolve(installDir).toLowerCase()
    const currentExe = path.resolve(process.execPath).toLowerCase()
    // Never terminate ourselves if payloadDir == installDir
    if (currentExe.startsWith(normalized + path.sep)) {
      resolve()
      return
    }
    const targetExe = path.join(installDir, APP_EXE_NAME)
    if (!fs.existsSync(targetExe)) {
      resolve()
      return
    }
    const ps = `Get-Process | Where-Object { $_.Path -eq '${targetExe.replace(/'/g, "''")}' } | Stop-Process -Force -ErrorAction SilentlyContinue`
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 6000 }, () => {
      setTimeout(resolve, 350)
    })
  })
}

export async function performInstall(opts: PerformInstallOptions): Promise<{ installDir: string; installedExe: string }> {
  const emit = opts.onProgress ?? (() => {})
  const version = opts.appVersion || '1.0.1'
  const cleanInstallDir = path.resolve(opts.installDir)

  emit({ step: 'prepare', percent: 4, label: '正在准备安装环境与检查目标目录...' })
  await killRunningInstanceInDir(cleanInstallDir)
  fs.mkdirSync(cleanInstallDir, { recursive: true })

  const { files, totalBytes } = computePayloadStats(opts.payloadDir)
  if (files.length === 0) {
    throw new Error(`安装载荷目录为空：${opts.payloadDir}`)
  }

  emit({ step: 'copy', percent: 10, label: `正在复制核心组件与创作模板（共 ${files.length} 个文件）...` })
  let copiedBytes = 0
  let lastPercent = 10

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const dest = path.join(cleanInstallDir, f.rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (path.resolve(f.src).toLowerCase() !== path.resolve(dest).toLowerCase()) {
      if (fs.existsSync(dest)) {
        try {
          fs.chmodSync(dest, 0o666)
        } catch {
          // ignore permission reset error before overwrite attempt
        }
      }
      fs.copyFileSync(f.src, dest)
    }
    copiedBytes += f.size
    const ratio = totalBytes > 0 ? copiedBytes / totalBytes : (i + 1) / files.length
    const pct = Math.min(84, Math.round(10 + ratio * 74))
    if (pct > lastPercent || i % 25 === 0) {
      lastPercent = pct
      emit({
        step: 'copy',
        percent: pct,
        label: `正在复制文件 (${i + 1}/${files.length})：${path.basename(f.rel)}`
      })
      await new Promise((r) => setImmediate(r))
    }
  }

  const installedExe = path.join(cleanInstallDir, APP_EXE_NAME)

  if (!opts.skipSystemRegistration) {
    emit({ step: 'configure', percent: 88, label: '正在创建快捷方式与注册应用组件...' })
    const uninstallCmdPath = path.join(cleanInstallDir, 'uninstall.cmd')
    const desktopLnk = path.join(os.homedir(), 'Desktop', '墨枢 InkNexus Studio.lnk')
    const startMenuDir = path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      '墨枢 InkNexus Studio'
    )

    const iconLocation = fs.existsSync(path.join(cleanInstallDir, 'resources', 'icon.ico'))
      ? path.join(cleanInstallDir, 'resources', 'icon.ico')
      : installedExe

    if (opts.createDesktopShortcut) {
      try {
        shell.writeShortcutLink(desktopLnk, 'create', {
          target: installedExe,
          cwd: cleanInstallDir,
          icon: iconLocation,
          iconIndex: 0,
          description: '墨枢 InkNexus Studio — AI 赋能的小说创作工作台'
        })
      } catch {
        // non-fatal shortcut failure
      }
    }

    if (opts.createStartMenuShortcut) {
      try {
        fs.mkdirSync(startMenuDir, { recursive: true })
        shell.writeShortcutLink(path.join(startMenuDir, '墨枢 InkNexus Studio.lnk'), 'create', {
          target: installedExe,
          cwd: cleanInstallDir,
          icon: iconLocation,
          iconIndex: 0,
          description: '墨枢 InkNexus Studio — AI 赋能的小说创作工作台'
        })
        shell.writeShortcutLink(path.join(startMenuDir, '卸载 墨枢 InkNexus Studio.lnk'), 'create', {
          target: 'cmd.exe',
          args: `/c "${uninstallCmdPath}"`,
          cwd: cleanInstallDir,
          icon: iconLocation,
          iconIndex: 0,
          description: '卸载 墨枢 InkNexus Studio'
        })
      } catch {
        // non-fatal
      }
    }

    if (opts.launchOnStartup) {
      await runRegCommand(['add', REG_RUN_KEY, '/v', 'InkNexusStudio', '/t', 'REG_SZ', '/d', `"${installedExe}"`, '/f'])
    } else {
      await runRegCommand(['delete', REG_RUN_KEY, '/v', 'InkNexusStudio', '/f'])
    }

    const uninstallScript = [
      '@echo off',
      'chcp 65001 >nul',
      'echo 正在卸载 墨枢 InkNexus Studio（不会删除您的小说原稿目录与作品文件）...',
      `taskkill /IM "${APP_EXE_NAME}" /F >nul 2>nul`,
      `if exist "${desktopLnk}" del /f /q "${desktopLnk}"`,
      `if exist "${startMenuDir}" rmdir /s /q "${startMenuDir}"`,
      `reg delete "${REG_RUN_KEY}" /v InkNexusStudio /f >nul 2>nul`,
      `reg delete "${REG_UNINSTALL_KEY}" /f >nul 2>nul`,
      `start "" cmd /c "timeout /t 2 /nobreak >nul & rmdir /s /q ""${cleanInstallDir}"""`,
      'exit /b 0'
    ].join('\r\n')
    fs.writeFileSync(uninstallCmdPath, uninstallScript, 'utf8')

    const estimatedKb = Math.max(1024, Math.round(totalBytes / 1024))
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', '墨枢 InkNexus Studio', '/f'])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'DisplayVersion', '/t', 'REG_SZ', '/d', version, '/f'])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'Publisher', '/t', 'REG_SZ', '/d', 'LilHaopeng', '/f'])
    await runRegCommand([
      'add',
      REG_UNINSTALL_KEY,
      '/v',
      'URLInfoAbout',
      '/t',
      'REG_SZ',
      '/d',
      'https://github.com/LilHaopeng/inknexus-studio',
      '/f'
    ])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'InstallLocation', '/t', 'REG_SZ', '/d', cleanInstallDir, '/f'])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'DisplayIcon', '/t', 'REG_SZ', '/d', iconLocation, '/f'])
    await runRegCommand([
      'add',
      REG_UNINSTALL_KEY,
      '/v',
      'UninstallString',
      '/t',
      'REG_SZ',
      '/d',
      `cmd.exe /c "${uninstallCmdPath}"`,
      '/f'
    ])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'EstimatedSize', '/t', 'REG_DWORD', '/d', String(estimatedKb), '/f'])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'NoModify', '/t', 'REG_DWORD', '/d', '1', '/f'])
    await runRegCommand(['add', REG_UNINSTALL_KEY, '/v', 'NoRepair', '/t', 'REG_DWORD', '/d', '1', '/f'])
  }

  emit({ step: 'done', percent: 100, label: '安装完成！' })
  return { installDir: cleanInstallDir, installedExe }
}

export async function runInstallerMode(): Promise<void> {
  const argv = process.argv
  const payloadDir = resolvePayloadDir(argv)
  const silent = argv.includes('--silent')
  const skipSystemRegistration = argv.includes('--skip-system-registration')
  const explicitDir = getArgValue(argv, '--install-dir')
  const defaultDir = explicitDir || (await getDefaultInstallDir())

  // Isolate Electron runtime cache into temp so installer never touches AppData\Roaming\InkNexusStudio
  try {
    app.setPath('userData', path.join(os.tmpdir(), 'InkNexusInstallerRuntime'))
  } catch {
    // ignore if locked
  }

  if (silent) {
    try {
      await performInstall({
        payloadDir,
        installDir: defaultDir,
        createDesktopShortcut: !skipSystemRegistration,
        createStartMenuShortcut: !skipSystemRegistration,
        launchOnStartup: false,
        skipSystemRegistration,
        appVersion: app.getVersion() || '1.0.1'
      })
      app.exit(0)
    } catch (err) {
      process.stderr.write(`Silent install failed: ${err instanceof Error ? err.stack || err.message : String(err)}\n`)
      app.exit(1)
    }
    return
  }

  const stats = computePayloadStats(payloadDir)
  const requiredBytes = Math.max(stats.totalBytes, 150 * 1024 * 1024)
  const iconPath = resolveInstallerIconPath(payloadDir)

  const win = new BrowserWindow({
    width: 820,
    height: 530,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    center: true,
    backgroundColor: '#00000000',
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  ipcMain.handle('installer:getDefaults', () => ({
    version: app.getVersion() || '1.0.1',
    installDir: defaultDir,
    requiredBytes,
    freeBytes: getDiskFreeBytes(defaultDir),
    author: '@LilHaopeng',
    repoUrl: 'https://github.com/LilHaopeng/inknexus-studio'
  }))

  ipcMain.handle('installer:pickDir', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: '选择 墨枢 InkNexus Studio 安装目录',
      defaultPath: defaultDir,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    let picked = res.filePaths[0]
    if (!/inknexus/i.test(path.basename(picked))) {
      picked = path.join(picked, 'InkNexusStudio')
    }
    return {
      installDir: picked,
      freeBytes: getDiskFreeBytes(picked)
    }
  })

  ipcMain.handle('installer:checkSpace', (_, targetDir: string) => ({
    freeBytes: getDiskFreeBytes(targetDir),
    requiredBytes
  }))

  ipcMain.handle(
    'installer:start',
    async (
      _,
      opts: {
        installDir: string
        createDesktopShortcut: boolean
        createStartMenuShortcut: boolean
        launchOnStartup: boolean
      }
    ) => {
      try {
        const result = await performInstall({
          payloadDir,
          installDir: opts.installDir,
          createDesktopShortcut: opts.createDesktopShortcut,
          createStartMenuShortcut: opts.createStartMenuShortcut,
          launchOnStartup: opts.launchOnStartup,
          appVersion: app.getVersion() || '1.0.1',
          onProgress: (ev) => {
            if (!win.isDestroyed()) {
              win.webContents.send('installer:progress', ev)
            }
          }
        })
        return { ok: true, ...result }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!win.isDestroyed()) {
          win.webContents.send('installer:progress', { step: 'error', percent: 0, label: msg })
        }
        return { ok: false, error: msg }
      }
    }
  )

  ipcMain.handle('installer:launchApp', (_, installDir: string) => {
    const installedExe = path.join(path.resolve(installDir), APP_EXE_NAME)
    if (fs.existsSync(installedExe)) {
      const cleanEnv = { ...process.env }
      delete cleanEnv.ELECTRON_RUN_AS_NODE
      const child = execFile(installedExe, [], { cwd: installDir, env: cleanEnv })
      child.unref?.()
    }
    app.exit(0)
  })

  ipcMain.handle('installer:minimize', () => {
    win.minimize()
  })

  ipcMain.handle('installer:close', () => {
    app.exit(0)
  })

  ipcMain.handle('installer:openExternal', (_, url: string) => shell.openExternal(url))

  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')
    void win.loadURL(`${base}/?installer=1`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { installer: '1' } })
  }

  const smokeDir = getArgValue(argv, '--smoke-installer-screenshots')
  if (smokeDir) {
    fs.mkdirSync(smokeDir, { recursive: true })
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const snap = async (name: string) => {
        if (win.isDestroyed()) return
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(smokeDir, `${name}.png`), img.toPNG())
      }
      await wait(900)
      await snap('installer_01_welcome')
      await win.webContents.executeJavaScript(`window.__installerSmoke?.('agreement')`)
      await wait(400)
      await snap('installer_02_agreement')
      await win.webContents.executeJavaScript(`window.__installerSmoke?.('options')`)
      await wait(400)
      await snap('installer_03_options')
      await win.webContents.executeJavaScript(`window.__installerSmoke?.('installing')`)
      await wait(400)
      await snap('installer_04_installing')
      await win.webContents.executeJavaScript(`window.__installerSmoke?.('complete')`)
      await wait(400)
      await snap('installer_05_complete')
      app.exit(0)
    })
  }
}
