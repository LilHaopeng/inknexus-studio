import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => os.tmpdir(),
    setPath: vi.fn(),
    exit: vi.fn()
  },
  BrowserWindow: vi.fn(),
  dialog: {},
  ipcMain: { handle: vi.fn() },
  shell: {
    writeShortcutLink: vi.fn(() => true),
    openExternal: vi.fn()
  }
}))

import { computePayloadStats, getArgValue, getDiskFreeBytes, performInstall } from '../src/main/installer/installer-main'
import { formatUserAgreementPlainText, USER_AGREEMENT_SECTIONS } from '../src/shared/user-agreement'

describe('Custom Aurora installer helpers & user agreement', () => {
  it('parses installer CLI flags accurately', () => {
    const argv = ['app.exe', '--installer-mode', '--payload-dir=C:\\Temp\\payload', '--silent']
    expect(getArgValue(argv, '--payload-dir')).toBe('C:\\Temp\\payload')
    expect(getArgValue(argv, '--install-dir')).toBeUndefined()
  })

  it('computes payload file stats and free disk space on a temporary directory', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inknexus-inst-test-'))
    try {
      fs.mkdirSync(path.join(tmp, 'resources'), { recursive: true })
      fs.writeFileSync(path.join(tmp, '墨枢 InkNexus Studio.exe'), 'dummy', 'utf8')
      fs.writeFileSync(path.join(tmp, 'resources', 'icon.ico'), 'ico', 'utf8')
      const stats = computePayloadStats(tmp)
      expect(stats.files).toHaveLength(2)
      expect(stats.totalBytes).toBe(8)
      expect(getDiskFreeBytes(path.join(tmp, 'nonexistent-subdir'))).toBeGreaterThan(0)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('includes MIT license, @LilHaopeng attribution, content disclaimer, and local privacy guarantee in User Agreement', () => {
    const text = formatUserAgreementPlainText()
    expect(USER_AGREEMENT_SECTIONS.length).toBeGreaterThanOrEqual(4)
    expect(text).toContain('@LilHaopeng')
    expect(text).toContain('MIT')
    expect(text).toContain('所有权')
    expect(text).toContain('不收集')
  })

  it('copies payload including resources/app.asar cleanly when skipSystemRegistration is enabled', async () => {
    const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inknexus-payload-'))
    const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inknexus-dest-'))
    try {
      fs.mkdirSync(path.join(payloadDir, 'resources'), { recursive: true })
      const asarContent = Buffer.from('ASAR_BINARY_HEADER_PAYLOAD_TEST_BYTES_123456')
      fs.writeFileSync(path.join(payloadDir, '墨枢 InkNexus Studio.exe'), 'exe-bytes', 'utf8')
      fs.writeFileSync(path.join(payloadDir, 'resources', 'app.asar'), asarContent)
      fs.writeFileSync(path.join(payloadDir, 'resources', 'AGENT_BRIDGE_README.md'), '# Bridge Guide', 'utf8')

      const res = await performInstall({
        payloadDir,
        installDir,
        createDesktopShortcut: false,
        createStartMenuShortcut: false,
        launchOnStartup: false,
        skipSystemRegistration: true,
        appVersion: '1.0.2'
      })

      expect(res.installDir).toBe(path.resolve(installDir))
      expect(fs.existsSync(path.join(installDir, 'resources', 'app.asar'))).toBe(true)
      expect(fs.readFileSync(path.join(installDir, 'resources', 'app.asar')).equals(asarContent)).toBe(true)
      expect(fs.existsSync(path.join(installDir, 'AGENT_BRIDGE_README.md'))).toBe(true)
      expect(fs.existsSync(path.join(installDir, 'Contents', '未分类'))).toBe(true)
      expect(fs.existsSync(path.join(installDir, 'uninstall.cmd'))).toBe(false)
    } finally {
      fs.rmSync(payloadDir, { recursive: true, force: true })
      fs.rmSync(installDir, { recursive: true, force: true })
    }
  })

  it('writes safe uninstaller that preserves Contents user works directory', async () => {
    const payloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inknexus-payload-u-'))
    const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inknexus-dest-u-'))
    try {
      fs.mkdirSync(path.join(payloadDir, 'resources'), { recursive: true })
      fs.writeFileSync(path.join(payloadDir, '墨枢 InkNexus Studio.exe'), 'exe', 'utf8')
      fs.writeFileSync(path.join(payloadDir, 'resources', 'app.asar'), 'asar', 'utf8')
      await performInstall({
        payloadDir,
        installDir,
        createDesktopShortcut: false,
        createStartMenuShortcut: false,
        launchOnStartup: false,
        appVersion: '1.0.2'
      })
      const uninst = fs.readFileSync(path.join(installDir, 'uninstall.cmd'), 'utf8')
      expect(uninst).toContain('已安全保留 Contents 目录')
      expect(uninst).not.toContain(`rmdir /s /q ""${path.resolve(installDir)}"""`)
    } finally {
      fs.rmSync(payloadDir, { recursive: true, force: true })
      fs.rmSync(installDir, { recursive: true, force: true })
    }
  })
})
