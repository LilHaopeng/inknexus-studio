import React, { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  FolderOpen,
  Minus,
  Rocket,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react'
import heroMascot from '../assets/brand/hero-mascot.png'
import navLogo from '../assets/brand/nav-logo.png'
import { USER_AGREEMENT_SECTIONS, USER_AGREEMENT_TITLE } from '@shared/user-agreement'

type InstallerStage = 'welcome' | 'options' | 'installing' | 'complete'

function formatGbOrMb(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(0)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

const STEPS: Array<{ id: 'prepare' | 'copy' | 'configure' | 'done'; label: string }> = [
  { id: 'prepare', label: '准备环境' },
  { id: 'copy', label: '复制文件' },
  { id: 'configure', label: '配置组件' },
  { id: 'done', label: '完成' }
]

export const InstallerApp: React.FC = () => {
  const [stage, setStage] = useState<InstallerStage>('welcome')
  const [version, setVersion] = useState('1.0.0')
  const [author, setAuthor] = useState('@LilHaopeng')
  const [repoUrl, setRepoUrl] = useState('https://github.com/LilHaopeng/inknexus-studio')

  const [agreed, setAgreed] = useState(false)
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [agreementNudge, setAgreementNudge] = useState(false)

  const [installDir, setInstallDir] = useState('')
  const [requiredBytes, setRequiredBytes] = useState(320 * 1024 * 1024)
  const [freeBytes, setFreeBytes] = useState(0)
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState(true)
  const [createStartMenuShortcut, setCreateStartMenuShortcut] = useState(true)
  const [launchOnStartup, setLaunchOnStartup] = useState(false)

  const [progressStep, setProgressStep] = useState<'prepare' | 'copy' | 'configure' | 'done' | 'error'>('prepare')
  const [progressPercent, setProgressPercent] = useState(0)
  const [progressLabel, setProgressLabel] = useState('正在准备安装环境...')
  const [installError, setInstallError] = useState<string | null>(null)
  const [finalInstallDir, setFinalInstallDir] = useState('')

  useEffect(() => {
    void window.inknexusInstaller?.getDefaults().then((info) => {
      setVersion(info.version)
      setInstallDir(info.installDir)
      setRequiredBytes(info.requiredBytes)
      setFreeBytes(info.freeBytes)
      setAuthor(info.author)
      setRepoUrl(info.repoUrl)
    })

    const unsub = window.inknexusInstaller?.onProgress((ev) => {
      setProgressStep(ev.step)
      setProgressPercent(ev.percent)
      setProgressLabel(ev.label)
      if (ev.step === 'error') {
        setInstallError(ev.label)
      }
    })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    window.__installerSmoke = (scene: string) => {
      if (scene === 'welcome') {
        setAgreementOpen(false)
        setStage('welcome')
      } else if (scene === 'agreement') {
        setStage('welcome')
        setAgreementOpen(true)
      } else if (scene === 'options') {
        setAgreementOpen(false)
        setAgreed(true)
        setStage('options')
      } else if (scene === 'installing') {
        setAgreementOpen(false)
        setStage('installing')
        setProgressStep('copy')
        setProgressPercent(64)
        setProgressLabel('正在复制核心组件与创作模板，请稍候...')
      } else if (scene === 'complete') {
        setAgreementOpen(false)
        setStage('complete')
        setFinalInstallDir(installDir || 'C:\\Users\\Demo\\AppData\\Local\\Programs\\InkNexusStudio')
      }
    }
  }, [installDir])

  const hasEnoughSpace = freeBytes === 0 || freeBytes >= requiredBytes

  const handleWelcomeInstallClick = () => {
    if (!agreed) {
      setAgreementNudge(true)
      setTimeout(() => setAgreementNudge(false), 1800)
      return
    }
    setStage('options')
  }

  const handleBrowseDir = async () => {
    const picked = await window.inknexusInstaller.pickDir()
    if (picked) {
      setInstallDir(picked.installDir)
      setFreeBytes(picked.freeBytes)
    }
  }

  const handleDirInputBlur = async () => {
    if (!installDir.trim()) return
    const res = await window.inknexusInstaller.checkSpace(installDir.trim())
    setFreeBytes(res.freeBytes)
  }

  const handleStartInstall = async () => {
    if (!installDir.trim() || !hasEnoughSpace) return
    setInstallError(null)
    setProgressStep('prepare')
    setProgressPercent(4)
    setProgressLabel('正在初始化安装进程...')
    setStage('installing')

    const res = await window.inknexusInstaller.start({
      installDir: installDir.trim(),
      createDesktopShortcut,
      createStartMenuShortcut,
      launchOnStartup
    })

    if (res.ok) {
      setFinalInstallDir(res.installDir || installDir.trim())
      setProgressStep('done')
      setProgressPercent(100)
      setProgressLabel('安装完成！')
      setTimeout(() => setStage('complete'), 350)
    } else {
      setInstallError(res.error || '安装过程中发生未知错误')
    }
  }

  const stepIndex =
    progressStep === 'prepare' ? 0 : progressStep === 'copy' ? 1 : progressStep === 'configure' ? 2 : 3

  return (
    <div data-theme="aurora-light" className="h-screen w-screen bg-transparent p-2 font-sans select-none">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[#DDD4FA] bg-gradient-to-br from-[#FBF9FF] via-[#F2ECFE] to-[#E6EAFF] text-[#1A1A28] shadow-[0_18px_50px_rgba(74,56,145,0.22)]">
        {/* Soft Aurora Ambient Blobs & Subtle Cloud Silhouette */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -left-16 h-64 w-64 rounded-full bg-[#D8C7FF]/45 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -bottom-20 h-72 w-72 rounded-full bg-[#B9D0FF]/45 blur-3xl"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 800 220"
          className="pointer-events-none absolute right-0 bottom-0 left-0 w-full opacity-35"
        >
          <path
            d="M0 175 Q140 120 290 165 T610 155 T800 170 L800 220 L0 220 Z"
            fill="url(#auroraWave)"
          />
          <defs>
            <linearGradient id="auroraWave" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E4D9FF" />
              <stop offset="55%" stopColor="#D7DCFF" />
              <stop offset="100%" stopColor="#C9DBFF" />
            </linearGradient>
          </defs>
        </svg>

        {/* Top Draggable Title Bar */}
        <header
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          className="relative z-20 flex h-11 shrink-0 items-center justify-between border-b border-[#E4DCF8]/80 bg-white/60 px-4 backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg border border-[#7453DC]/25 bg-[#F6F2FF]">
              <img src={navLogo} alt="墨枢 Logo" className="h-full w-full object-cover" />
            </span>
            <span className="text-xs font-semibold tracking-tight text-[#25223B]">
              墨枢 InkNexus Studio 安装程序
            </span>
          </div>

          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1">
            <button
              type="button"
              aria-label="最小化"
              onClick={() => void window.inknexusInstaller.minimize()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5F5C78] transition hover:bg-[#7453DC]/10 hover:text-[#1A1A28]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="关闭安装程序"
              disabled={stage === 'installing' && !installError}
              onClick={() => void window.inknexusInstaller.close()}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#5F5C78] transition hover:bg-red-500/12 hover:text-red-600 disabled:opacity-35"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Stage Content */}
        <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-between p-7">
          {stage === 'welcome' && (
            <div className="my-auto grid grid-cols-12 items-center gap-6">
              {/* Left Character Card */}
              <div className="col-span-5 flex flex-col items-center justify-center">
                <div className="relative flex h-64 w-64 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.92)_0%,rgba(229,217,255,0.58)_62%,transparent_78%)] p-2 shadow-inner">
                  <img
                    src={heroMascot}
                    alt="墨枢创作形象"
                    className="h-full w-full object-contain drop-shadow-[0_12px_22px_rgba(104,75,210,0.22)]"
                  />
                  <Sparkles className="absolute top-6 right-7 h-4 w-4 text-[#7855DA]/70" />
                </div>
              </div>

              {/* Right Welcome & Mandatory Agreement */}
              <div className="col-span-7 flex flex-col items-start space-y-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-[#7453DC]/25 bg-white shadow-sm">
                    <img src={navLogo} alt="墨枢" className="h-full w-full object-cover" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold tracking-tight text-[#1E1A36]">墨枢</span>
                      <span className="rounded-full bg-[#7453DC]/12 px-2 py-0.5 text-[11px] font-semibold text-[#684BD2]">
                        v{version}
                      </span>
                    </div>
                    <div className="text-xs text-[#6B6785]">InkNexus Studio</div>
                  </div>
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-[#1A1A28]">
                    AI 赋能的小说创作工作台
                  </h1>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#5F5C78]">
                    构建世界 · 打造故事 · 人机共创 · 作品管理 · 并发多队列审查
                  </p>
                </div>

                {/* Primary CTA + Mandatory Agreement Checkbox Underneath */}
                <div className="w-full max-w-md space-y-2.5 pt-1">
                  <button
                    type="button"
                    aria-disabled={!agreed}
                    onClick={handleWelcomeInstallClick}
                    className={`inline-flex h-11 w-56 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold shadow-md transition ${
                      agreed
                        ? 'bg-gradient-to-r from-[#7855DA] to-[#5B6BE8] text-white hover:scale-[1.01] hover:opacity-95 cursor-pointer'
                        : 'bg-[#C8C2DC] text-white/90 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <span>立即安装</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div
                    className={`rounded-xl border px-3 py-2 text-xs transition ${
                      agreementNudge
                        ? 'border-amber-500 bg-amber-50/90 text-amber-900 shadow-sm'
                        : agreed
                          ? 'border-[#7453DC]/30 bg-white/75 text-[#2C2847]'
                          : 'border-[#DFD8F5] bg-white/65 text-[#524E6B]'
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => setAgreed(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-[#684BD2]"
                      />
                      <span className="leading-relaxed">
                        我已阅读并同意
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            setAgreementOpen(true)
                          }}
                          className="mx-1 font-semibold text-[#684BD2] underline underline-offset-2 hover:text-[#4F36B4]"
                        >
                          《用户使用声明》
                        </button>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="pt-1 text-[11px] text-[#7A7694]">
                  作者：
                  <button
                    type="button"
                    onClick={() => void window.inknexusInstaller.openExternal('https://github.com/LilHaopeng')}
                    className="inline-flex items-center gap-0.5 font-medium text-[#684BD2] hover:underline"
                  >
                    GitHub {author}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {stage === 'options' && (
            <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-between py-2">
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-[#1A1A28]">选择安装位置</h2>
                </div>

                <div className="rounded-2xl border border-[#DED5F7] bg-white/80 p-4 shadow-xs backdrop-blur-md space-y-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <FolderOpen className="absolute top-2.5 left-3 h-4 w-4 text-[#7855DA]" />
                      <input
                        type="text"
                        value={installDir}
                        onChange={(e) => setInstallDir(e.target.value)}
                        onBlur={() => void handleDirInputBlur()}
                        className="h-9 w-full rounded-xl border border-[#DAD3F2] bg-white pl-9 pr-3 font-mono text-xs text-[#1A1A28] outline-none focus:border-[#7453DC]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleBrowseDir()}
                      className="h-9 rounded-xl border border-[#DAD3F2] bg-[#F7F4FF] px-4 text-xs font-medium text-[#393456] transition hover:border-[#7453DC] hover:text-[#684BD2]"
                    >
                      浏览...
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-[#6B6785]">
                    <span>所需空间：约 {formatGbOrMb(requiredBytes)}</span>
                    <span className={!hasEnoughSpace ? 'font-semibold text-red-600' : ''}>
                      可用空间：{freeBytes > 0 ? formatGbOrMb(freeBytes) : '计算中...'}
                    </span>
                    {!hasEnoughSpace && (
                      <span className="text-red-600">目标磁盘剩余空间不足，请更换安装目录！</span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#DED5F7] bg-white/75 p-4 space-y-2.5 text-xs text-[#2B2742]">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={createDesktopShortcut}
                      onChange={(e) => setCreateDesktopShortcut(e.target.checked)}
                      className="h-4 w-4 accent-[#684BD2]"
                    />
                    <span>创建桌面快捷方式</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={createStartMenuShortcut}
                      onChange={(e) => setCreateStartMenuShortcut(e.target.checked)}
                      className="h-4 w-4 accent-[#684BD2]"
                    />
                    <span>添加到开始菜单快捷方式</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={launchOnStartup}
                      onChange={(e) => setLaunchOnStartup(e.target.checked)}
                      className="h-4 w-4 accent-[#684BD2]"
                    />
                    <span>开机时启动 墨枢</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                <button
                  type="button"
                  onClick={() => setStage('welcome')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#DAD3F2] bg-white/80 px-4 text-xs font-medium text-[#4D4966] hover:border-[#7453DC]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  上一步
                </button>
                <button
                  type="button"
                  disabled={!hasEnoughSpace || !installDir.trim()}
                  onClick={() => void handleStartInstall()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#5B6BE8] px-6 text-xs font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-45"
                >
                  <span>开始安装</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {stage === 'installing' && (
            <div className="my-auto mx-auto flex w-full max-w-xl flex-col items-center space-y-5 text-center">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-[#7453DC]/25 bg-white/90 p-2 shadow-lg">
                <img src={navLogo} alt="墨枢" className="h-full w-full rounded-2xl object-cover" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-[#1A1A28]">
                  {installError ? '安装遇到问题' : '正在安装...'}
                </h2>
                <p className="mt-1 text-xs text-[#64607E]">
                  {installError ? installError : progressLabel}
                </p>
              </div>

              {installError ? (
                <div className="flex items-center gap-3 pt-2">
                  <div className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <span>请检查目标目录写入权限或退出占用的程序后重试</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInstallError(null)
                      setStage('options')
                    }}
                    className="h-9 rounded-xl bg-[#7453DC] px-4 text-xs font-semibold text-white"
                  >
                    返回修改目录
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex w-full items-center gap-3">
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/90 p-0.5 shadow-inner">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#7855DA] to-[#4A74F5] transition-all duration-200"
                        style={{ width: `${Math.max(4, progressPercent)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold text-[#684BD2]">
                      {progressPercent}%
                    </span>
                  </div>

                  {/* 4-Step Horizontal Stepper */}
                  <div className="grid w-full grid-cols-4 gap-2 pt-2">
                    {STEPS.map((st, idx) => {
                      const done = idx < stepIndex || progressStep === 'done'
                      const active = idx === stepIndex && progressStep !== 'done'
                      return (
                        <div key={st.id} className="flex flex-col items-center gap-1.5">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold transition ${
                              done
                                ? 'border-[#684BD2] bg-[#684BD2] text-white'
                                : active
                                  ? 'border-[#684BD2] bg-white text-[#684BD2] ring-4 ring-[#684BD2]/15'
                                  : 'border-[#D4CCE8] bg-white/70 text-[#9B96B3]'
                            }`}
                          >
                            {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                          </span>
                          <span
                            className={`text-[11px] ${
                              done || active ? 'font-semibold text-[#2C2847]' : 'text-[#8C87A5]'
                            }`}
                          >
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {stage === 'complete' && (
            <div className="my-auto mx-auto flex w-full max-w-lg flex-col items-center space-y-5 text-center">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/90 p-2 shadow-lg ring-4 ring-[#7453DC]/15">
                <img src={navLogo} alt="墨枢" className="h-full w-full rounded-full object-cover" />
                <span className="absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                  <Check className="h-4 w-4" />
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-[#1A1A28]">安装完成！</h2>
                <p className="mt-1.5 text-xs text-[#5F5C78]">
                  墨枢 · InkNexus Studio {version} 已成功部署至本机：
                </p>
                <div className="mt-2 rounded-xl border border-[#DFD8F5] bg-white/80 px-3 py-1.5 font-mono text-[11px] text-[#4C4768]">
                  {finalInstallDir}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void window.inknexusInstaller.close()}
                  className="h-10 rounded-xl border border-[#DAD3F2] bg-white/85 px-5 text-xs font-medium text-[#4D4966] hover:border-[#7453DC]"
                >
                  完成并关闭
                </button>
                <button
                  type="button"
                  onClick={() => void window.inknexusInstaller.launchApp(finalInstallDir)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#5B6BE8] px-6 text-xs font-semibold text-white shadow-md hover:opacity-95"
                >
                  <Rocket className="h-4 w-4" />
                  <span>立即启动 墨枢 InkNexus Studio</span>
                </button>
              </div>
            </div>
          )}
        </main>

        {/* User Agreement & Disclaimer Modal */}
        {agreementOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1633]/40 p-5 backdrop-blur-xs">
            <div className="flex max-h-[450px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#DED5F7] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#EDE8FA] bg-[#F9F7FF] px-5 py-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#684BD2]" />
                  <h3 className="text-sm font-bold text-[#1E1A36]">{USER_AGREEMENT_TITLE}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAgreementOpen(false)}
                  className="rounded-lg p-1 text-[#6B6785] hover:bg-[#EDE8FA] hover:text-[#1A1A28]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-[#38344E]">
                {USER_AGREEMENT_SECTIONS.map((sec) => (
                  <div key={sec.title} className="space-y-1.5">
                    <h4 className="flex items-center gap-1.5 font-bold text-[#221D3D]">
                      <FileText className="h-3.5 w-3.5 text-[#7453DC]" />
                      {sec.title}
                    </h4>
                    {sec.paragraphs.map((p, idx) => (
                      <p key={idx} className="text-[#4B4763]">
                        {p}
                      </p>
                    ))}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-[#EDE8FA] bg-[#FAF8FF] px-5 py-3">
                <span className="text-[11px] text-[#7A7694]">
                  开源仓库：github.com/LilHaopeng/inknexus-studio (MIT)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAgreementOpen(false)}
                    className="rounded-xl border border-[#DAD3F2] px-4 py-1.5 text-xs text-[#55506E] hover:bg-white"
                  >
                    关闭
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAgreed(true)
                      setAgreementOpen(false)
                    }}
                    className="rounded-xl bg-gradient-to-r from-[#7855DA] to-[#5B6BE8] px-4 py-1.5 text-xs font-semibold text-white shadow-xs"
                  >
                    我已阅读并同意
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
