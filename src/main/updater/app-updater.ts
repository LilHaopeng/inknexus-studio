import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import type { AppUpdateInfo } from '@shared/types'

export const APP_GITHUB_OWNER = 'LilHaopeng'
export const APP_GITHUB_REPO = 'inknexus-studio'

export function isNewerSemver(latest: string, current: string): boolean {
  const a = latest.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const b = current.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const va = a[i] ?? 0
    const vb = b[i] ?? 0
    if (va !== vb) return va > vb
  }
  return false
}

export class AppUpdaterService {
  getCurrentVersion(): string {
    try {
      return app.getVersion() || '1.0.2'
    } catch {
      return '1.0.2'
    }
  }

  async checkForUpdates(): Promise<AppUpdateInfo> {
    const currentVersion = this.getCurrentVersion()
    const releaseUrl = `https://github.com/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}/releases`
    const res = await fetch(`https://api.github.com/repos/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}/releases/latest`, {
      headers: {
        'User-Agent': 'InkNexus-Studio-Updater',
        Accept: 'application/vnd.github+json'
      }
    })

    if (res.status === 404) {
      return {
        currentVersion,
        latestVersion: currentVersion,
        hasUpdate: false,
        releaseNotes: 'GitHub 仓库尚未发布正式 Release（或当前已是最新源码版本）。',
        releaseUrl,
        checkedAt: Date.now()
      }
    }

    if (!res.ok) {
      throw new Error(`检查 GitHub 更新失败（HTTP ${res.status}）`)
    }

    const data = (await res.json()) as {
      tag_name?: string
      body?: string
      html_url?: string
      assets?: Array<{ name: string; browser_download_url: string; size: number }>
    }

    const latestVersion = (data.tag_name || currentVersion).replace(/^v/i, '')
    const assets = data.assets ?? []
    const setupAsset =
      assets.find((a) => /setup.*\.exe$/i.test(a.name)) ??
      assets.find((a) => /\.exe$/i.test(a.name))

    return {
      currentVersion,
      latestVersion,
      hasUpdate: isNewerSemver(latestVersion, currentVersion),
      releaseNotes: data.body || '包含功能升级与体验优化。',
      releaseUrl: data.html_url || releaseUrl,
      downloadUrl: setupAsset?.browser_download_url,
      assetName: setupAsset?.name,
      assetSize: setupAsset?.size,
      checkedAt: Date.now()
    }
  }

  async downloadAndInstall(
    downloadUrl: string,
    assetName: string,
    onProgress: (percent: number, label: string) => void
  ): Promise<void> {
    const updateDir = path.join(os.tmpdir(), 'InkNexusStudio-Updates')
    fs.mkdirSync(updateDir, { recursive: true })
    const destExe = path.join(updateDir, assetName || 'InkNexus-Setup.exe')

    onProgress(5, '正在连接 GitHub Release 下载安装包...')
    const res = await fetch(downloadUrl, { headers: { 'User-Agent': 'InkNexus-Studio-Updater' } })
    if (!res.ok || !res.body) {
      throw new Error(`下载安装包失败（HTTP ${res.status}）`)
    }

    const total = Number(res.headers.get('content-length') || 0)
    const reader = res.body.getReader()
    const chunks: Buffer[] = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const buf = Buffer.from(value)
      chunks.push(buf)
      received += buf.length
      if (total > 0) {
        const pct = Math.min(95, Math.round((received / total) * 90) + 5)
        onProgress(pct, `正在下载更新（${(received / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB）`)
      }
    }

    fs.writeFileSync(destExe, Buffer.concat(chunks))
    onProgress(98, '下载完成，准备启动自动安装并重启...')

    const isPortable = /portable/i.test(destExe)
    const currentExe = process.execPath
    const batPath = path.join(updateDir, 'install_and_relaunch.cmd')

    const scriptLines = isPortable
      ? [
          '@echo off',
          'timeout /t 2 /nobreak >nul',
          `start "" "${destExe}"`
        ]
      : [
          '@echo off',
          'timeout /t 2 /nobreak >nul',
          `"${destExe}" /S`,
          `if exist "${currentExe}" (start "" "${currentExe}")`
        ]

    fs.writeFileSync(batPath, scriptLines.join('\r\n'), 'utf8')
    const child = spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()

    setTimeout(() => {
      app.quit()
    }, 600)
  }
}
