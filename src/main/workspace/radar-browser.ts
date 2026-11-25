import { BrowserWindow } from 'electron'
import type { RadarLiveFetchResult } from '@shared/types'

export const RADAR_PLATFORM_URLS: Record<string, string> = {
  番茄短故事: 'https://fanqienovel.com/rank',
  知乎盐言: 'https://www.zhihu.com/xen/market/remix/story',
  七猫短故事: 'https://www.qimao.com/paihang/short/',
  番茄长篇热榜: 'https://fanqienovel.com/rank',
  '起点月票/畅销榜': 'https://www.qidian.com/rank/yuepiao/',
  '红果短剧 & 抖音版权中心': 'https://www.hongguoduanju.com/'
}

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const EXTRACT_PAGE_JS = `(() => {
  const title = document.title || '';
  const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
  const needLogin = /(请登录|扫码登录|账号密码登录|验证码|安全验证|完成验证)/.test(title + ' ' + bodyText.slice(0, 1200));
  const lines = bodyText
    .split(/\\r?\\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 160);
  const uniq = [];
  const seen = new Set();
  for (const l of lines) {
    if (!seen.has(l)) {
      seen.add(l);
      uniq.push(l);
    }
    if (uniq.length >= 160) break;
  }
  return {
    title,
    url: window.location.href,
    needLogin,
    lines: uniq
  };
})()`

let interactiveRadarWin: BrowserWindow | null = null

export async function capturePublicChartWithBuiltinBrowser(platform: string): Promise<RadarLiveFetchResult> {
  const targetUrl = RADAR_PLATFORM_URLS[platform] || 'https://fanqienovel.com/rank'
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    webPreferences: {
      partition: 'persist:inknexus-radar',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  try {
    win.webContents.setUserAgent(DESKTOP_CHROME_UA)
    await Promise.race([
      win.loadURL(targetUrl),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('页面加载超时')), 15000))
    ])
    await new Promise((r) => setTimeout(r, 2400))

    const payload = (await win.webContents.executeJavaScript(EXTRACT_PAGE_JS)) as {
      title: string
      url: string
      needLogin: boolean
      lines: string[]
    }

    if (payload.needLogin && payload.lines.length < 18) {
      return {
        ok: false,
        source: 'login-required',
        url: payload.url || targetUrl,
        extractedText: '',
        itemCount: 0,
        message: '目标榜单页面需要登录或验证后方可读取，请点击「打开内置榜单窗口」登录后再采集。'
      }
    }

    const joined = payload.lines.join('\n')
    if (payload.lines.length < 5) {
      return {
        ok: false,
        source: 'error',
        url: payload.url || targetUrl,
        extractedText: '',
        itemCount: 0,
        message: '未提取到有效公开榜单文本，将使用内置基线参考执行分析。'
      }
    }

    return {
      ok: true,
      source: 'builtin-browser-live',
      url: payload.url || targetUrl,
      extractedText: `【页面标题】${payload.title}\n【网址】${payload.url}\n\n${joined}`,
      itemCount: payload.lines.length,
      message: `内置浏览器已成功采集 ${payload.lines.length} 条公开页面内容`
    }
  } catch (err) {
    return {
      ok: false,
      source: 'error',
      url: targetUrl,
      extractedText: '',
      itemCount: 0,
      message: `内置采集失败（${err instanceof Error ? err.message : String(err)}），已自动回退基线模式`
    }
  } finally {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }
}

export async function openInteractiveRadarBrowser(platform: string): Promise<{ url: string }> {
  const targetUrl = RADAR_PLATFORM_URLS[platform] || 'https://fanqienovel.com/rank'
  if (interactiveRadarWin && !interactiveRadarWin.isDestroyed()) {
    interactiveRadarWin.focus()
    await interactiveRadarWin.loadURL(targetUrl)
    return { url: targetUrl }
  }

  interactiveRadarWin = new BrowserWindow({
    width: 1180,
    height: 780,
    title: `墨枢内置榜单浏览器 — ${platform}（如需登录请直接在本窗口内完成）`,
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:inknexus-radar',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  interactiveRadarWin.webContents.setUserAgent(DESKTOP_CHROME_UA)
  interactiveRadarWin.on('closed', () => {
    interactiveRadarWin = null
  })
  void interactiveRadarWin.loadURL(targetUrl)
  return { url: targetUrl }
}

export async function captureInteractiveRadarBrowser(): Promise<RadarLiveFetchResult> {
  if (!interactiveRadarWin || interactiveRadarWin.isDestroyed()) {
    return {
      ok: false,
      source: 'error',
      url: '',
      extractedText: '',
      itemCount: 0,
      message: '请先点击「打开内置榜单窗口」打开并浏览目标榜单页面'
    }
  }

  const payload = (await interactiveRadarWin.webContents.executeJavaScript(EXTRACT_PAGE_JS)) as {
    title: string
    url: string
    needLogin: boolean
    lines: string[]
  }

  return {
    ok: payload.lines.length > 0,
    source: payload.lines.length > 0 ? 'builtin-browser-live' : 'error',
    url: payload.url,
    extractedText: `【页面标题】${payload.title}\n【网址】${payload.url}\n\n${payload.lines.join('\n')}`,
    itemCount: payload.lines.length,
    message:
      payload.lines.length > 0
        ? `已从内置榜单窗口提取 ${payload.lines.length} 条实时页面文本`
        : '当前窗口未检测到可读榜单文本'
  }
}
