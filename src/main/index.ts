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

  const smokeV5DirArg = process.argv.find((a) => a.startsWith('--smoke-v5='))
  if (smokeV5DirArg && mainWindow) {
    const win = mainWindow
    const outDir = smokeV5DirArg.slice('--smoke-v5='.length)
    fs.mkdirSync(outDir, { recursive: true })
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const snap = async (name: string) => {
        if (win.isDestroyed()) return
        const img = await win.webContents.capturePage()
        fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG())
      }
      await wait(3200)

      // 1. Zero-CLI Top Bar check (must NOT show agy)
      const connText = await win.webContents.executeJavaScript(
        `window.__inknexusSmoke?.('simulate-no-cli')`
      )
      await wait(500)
      await snap('v5_01_no_cli_home')

      // 2. Open Workbench & real mouse drag test on left resize handle (+80px right must increase left width)
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('workbench-split')`)
      await wait(900)
      const handleRect = await win.webContents.executeJavaScript(`(() => {
        const h = document.querySelector('[data-testid="wb-left-resize-handle"]');
        const left = document.querySelector('[data-panel-id="wb-left"]');
        if (!h || !left) return null;
        const r = h.getBoundingClientRect();
        const lr = left.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), leftWidth: lr.width };
      })()`)

      let leftWidthAfter = 0
      if (handleRect) {
        win.focus()
        win.webContents.sendInputEvent({ type: 'mouseMove', x: handleRect.x, y: handleRect.y })
        await wait(60)
        win.webContents.sendInputEvent({
          type: 'mouseDown',
          x: handleRect.x,
          y: handleRect.y,
          button: 'left',
          clickCount: 1,
          modifiers: ['leftButtonDown']
        })
        await wait(80)
        for (let step = 1; step <= 8; step++) {
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: handleRect.x + step * 10,
            y: handleRect.y,
            modifiers: ['leftButtonDown']
          })
          await wait(25)
        }
        win.webContents.sendInputEvent({
          type: 'mouseUp',
          x: handleRect.x + 80,
          y: handleRect.y,
          button: 'left',
          clickCount: 1
        })
        await wait(250)
        leftWidthAfter = await win.webContents.executeJavaScript(
          `document.querySelector('[data-panel-id="wb-left"]')?.getBoundingClientRect().width || 0`
        )
      }

      // 3. Open VersionDrawer, verify close button clickable & closes cleanly
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('open-version-drawer')`)
      await wait(450)
      await snap('v5_02_version_drawer')
      const closeBtnRect = await win.webContents.executeJavaScript(`(() => {
        const b = document.querySelector('[data-testid="version-drawer-close"]');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), top: r.top };
      })()`)
      if (closeBtnRect) {
        win.webContents.sendInputEvent({ type: 'mouseDown', x: closeBtnRect.x, y: closeBtnRect.y, button: 'left', clickCount: 1 })
        win.webContents.sendInputEvent({ type: 'mouseUp', x: closeBtnRect.x, y: closeBtnRect.y, button: 'left', clickCount: 1 })
      }
      await wait(350)
      const drawerClosedAfterClick = await win.webContents.executeJavaScript(
        `!document.querySelector('[data-testid="version-drawer-backdrop"]')`
      )

      // 4. Right-click 世界观 -> 基于世界观创建大纲
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('open-world-context')`)
      await wait(400)
      await snap('v5_03_world_context_menu')
      const ctxMenuVisible = await win.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-testid="asset-context-menu"]')?.textContent?.includes('基于世界观创建大纲'))`
      )
      await win.webContents.executeJavaScript(`document.body.click()`)

      // 5. Startup silent update banner (bottom-right)
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('simulate-update-banner')`)
      await wait(450)
      await snap('v5_04_update_toast')

      // 6. Settings -> Local Agent CLI top repair prompt card
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('settings-agents')`)
      await wait(700)
      await snap('v5_05_settings_cli_repair')

      // 7. Market Radar -> Built-in Browser capture buttons
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('radar')`)
      await wait(600)
      await snap('v5_06_radar_builtin_browser')

      // 8. World Doc in Editor -> green-zone "生成大纲" button left of 书籍
      const worldBtnVisible = await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('open-world-doc')`)
      await wait(500)
      await snap('v5_07_editor_world_btn')

      // 9. Settings -> Updater Changelog display
      await win.webContents.executeJavaScript(`window.__inknexusSmoke?.('settings-updater')`)
      await wait(500)
      await snap('v5_08_settings_updater_changelog')

      const report = {
        noCliPillText: connText,
        leftPanelWidthBefore: handleRect?.leftWidth ?? 0,
        leftPanelWidthAfter: leftWidthAfter,
        dragDirectionCorrect: Boolean(handleRect && leftWidthAfter > handleRect.leftWidth + 20),
        versionCloseBtnTop: closeBtnRect?.top ?? -1,
        drawerClosedAfterClick,
        worldContextMenuVisible: ctxMenuVisible,
        editorWorldActionBtnVisible: Boolean(worldBtnVisible)
      }
      fs.writeFileSync(path.join(outDir, 'v5_sim_report.json'), JSON.stringify(report, null, 2), 'utf8')
      isQuitting = true
      app.quit()
    })
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
      await snap('v4_01_home_light')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('workbench-split')`)
      await wait(900)
      await snap('v4_02_workbench_split')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('projects-shelf')`)
      await wait(700)
      await snap('v4_03_projects_shelf')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('workspace-queue')`)
      await wait(700)
      await snap('v4_04_workspace_queue')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('settings-storage')`)
      await wait(800)
      await snap('v4_05_settings_storage')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('settings-updater')`)
      await wait(600)
      await snap('v4_06_settings_updater')
      await mainWindow?.webContents.executeJavaScript(`window.__inknexusSmoke?.('settings-licenses')`)
      await wait(700)
      await snap('v4_07_settings_licenses')
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
