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

import { computePayloadStats, getArgValue, getDiskFreeBytes } from '../src/main/installer/installer-main'
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
})
