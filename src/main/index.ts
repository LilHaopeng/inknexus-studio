import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron'
import path from 'path'
import fs from 'fs'
import { StudioRuntime } from './ipc'
import { runInstallerMode } from './installer/installer-main'

let mainWindow: BrowserWindow | null = null
let runtime: StudioRuntime | null = null
let tray: Tray | null = null
let isQuitting = false

function resolveIconPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(process.resourcesPath || '', '..', 'build', 'icon.ico'),
    path.resolve(process.cwd(), 'build', 'icon.png'),
    path.resolve(process.cwd(), 'build', 'icon.ico')
  ]
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return ''
}

function createTray(win: BrowserWindow): void {
  if (tray) return
  const iconPath = resolveIconPath()
  const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  tray = new Tray(img.resize({ width: 16, height: 16 }))
  tray.setToolTip('墨枢 · InkNexus Studio')

  const showWindow = () => {
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 墨枢 InkNexus Studio', click: showWindow },
      { type: 'separator' },
      {
        label: '彻底退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
  tray.on('double-click', showWindow)
}

function createMainWindow(): BrowserWindow {
  const iconPath = resolveIconPath()
  const initialTheme = runtime?.store.getConfig().theme ?? 'aurora-light'
  const initialBg = initialTheme === 'aurora-dark' ? '#11121E' : '#F1F2FA'

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 680,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: initialBg,
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('maximize', () => win.webContents.send('window:maximized-changed', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false))

  win.on('close', (e) => {
    if (isQuitting) return
    const behavior = runtime?.store.getConfig().closeBehavior ?? 'ask'
    if (behavior === 'minimize-to-tray') {
      e.preventDefault()
      win.hide()
    } else if (behavior === 'ask') {
      e.preventDefault()
      win.webContents.send('window:close-requested')
    } else {
      isQuitting = true
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  if (process.argv.includes('--installer-mode')) {
    await runInstallerMode()
    return
  }
  runtime = new StudioRuntime(
    () => mainWindow,
    (action, remember) => {
      if (remember && runtime) {
        runtime.store.saveConfig({ closeBehavior: action })
      }
      if (action === 'minimize-to-tray') {
        mainWindow?.hide()
      } else {
        isQuitting = true
        app.quit()
      }
    }
  )
  runtime.registerIpc()
  mainWindow = createMainWindow()

  const smokeDirArg = process.argv.find((a) => a.startsWith('--smoke-screenshots='))
  if (!smokeDirArg) {
    createTray(mainWindow)
  }

  if (smokeDirArg && mainWindow) {
    const outDir = smokeDirArg.slice('--smoke-screenshots='.length)
    fs.mkdirSync(outDir, { recursive: true })
    mainWindow.webContents.once('did-finish-load', async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const snap = async (name: string) => {
        if (!mainWindow) return
        const img = await mainWindow.webContents.capturePage()
        fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG())
      }
      await wait(3200)
      await snap('v3_01_home_light')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('home-dark')`)
      await wait(700)
      await snap('v3_02_home_dark')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('workbench-light')`)
      await wait(900)
      await snap('v3_03_workbench_light')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('fullbook-modal')`)
      await wait(700)
      await snap('v3_04_fullbook_modal')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('settings-agents')`)
      await wait(900)
      await snap('v3_05_settings_agents')
      isQuitting = true
      app.quit()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  runtime?.projectManager.stopWatching()
  if (process.platform !== 'darwin') app.quit()
})
