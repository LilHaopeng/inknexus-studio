import React, { useEffect, useRef, useState } from 'react'
import {
  Bell,
  Check,
  ChevronDown,
  Cpu,
  Download,
  History,
  Minus,
  Moon,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  X
} from 'lucide-react'
import { toast } from 'sonner'
import { useStudioStore } from '../../store/useStudioStore'

interface TitleBarProps {
  onOpenExport?: () => void
  onOpenVersions?: () => void
}

const SingleSquareIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.25" />
  </svg>
)

const DoubleSquareRestoreIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3.5 3.5V2C3.5 1.72 3.72 1.5 4 1.5H10C10.28 1.5 10.5 1.72 10.5 2V8C10.5 8.28 10.28 8.5 10 8.5H8.5" stroke="currentColor" strokeWidth="1.2" />
    <rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
  </svg>
)

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenExport, onOpenVersions }) => {
  const {
    page,
    activeProject,
    config,
    setConfig,
    swarmJobs,
    activeWorks,
    setPage,
    agentSelection,
    setAgentSelection,
    localAgents,
    setLocalAgents,
    apiConfigs
  } = useStudioStore()
  const [maximized, setMaximized] = useState(false)
  const [connOpen, setConnOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.inknexus.window.isMaximized().then(setMaximized).catch(() => {})
    return window.inknexus.window.onMaximizedChanged(setMaximized)
  }, [])

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setConnOpen(false)
      }
    }
    if (connOpen) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [connOpen])

  const runningLive = Object.values(activeWorks).filter((w) => w.stage !== 'idle').length
  const runningSwarm =
    swarmJobs.filter((j) =>
      ['queued', 'writing', 'linting', 'self_review', 'review_round_1', 'revising_1', 'review_round_2', 'revising_2'].includes(
        j.stage
      )
    ).length + runningLive

  const isDark =
    config?.theme === 'aurora-dark' ||
    (config?.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)

  const toggleTheme = async () => {
    const nextTheme = isDark ? 'aurora-light' : 'aurora-dark'
    const updated = await window.inknexus.config.save({ theme: nextTheme })
    setConfig(updated)
  }

  const activeLocal = localAgents.find((a) => a.id === agentSelection.backendId)
  const activeApi = apiConfigs.find((a) => a.presetId === agentSelection.backendId)
  const activeEngineLabel = activeLocal?.name ?? activeApi?.name ?? agentSelection.backendId

  const availableLocals = localAgents.filter((a) => a.status === 'available')
  const configuredApis = apiConfigs.filter((a) => a.hasApiKey || a.enabled)

  return (
    <header className="drag-region relative z-30 flex h-12 shrink-0 items-center justify-between border-b border-border/70 bg-surface/85 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2.5 min-w-0">
        {page === 'workbench' && activeProject && (
          <div className="no-drag flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              {activeProject.title}
            </span>
            <span className="text-text-muted">
              {activeProject.mode === 'short-webnovel'
                ? '短篇网文'
                : activeProject.mode === 'drama-script'
                  ? 'AI 剧本'
                  : '长文小说'}
            </span>
          </div>
        )}

        {/* 可点击切换 CLI / API 连接的状态胶囊 */}
        <div className="no-drag relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setConnOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised/90 px-3 py-1 text-xs text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
          >
            <span className="h-2 w-2 rounded-full bg-success" />
            <span>本地工作空间已连接 ·</span>
            <strong className="font-medium text-text-primary">{activeEngineLabel}</strong>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </button>

          {connOpen && (
            <div className="absolute left-0 top-10 z-50 w-[430px] rounded-2xl border border-border bg-surface-raised p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                  <Cpu className="h-4 w-4 text-accent" />
                  <span>快速切换本地 CLI / 预置 API 引擎</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const list = await window.inknexus.agents.discover()
                    setLocalAgents(list)
                    toast.success('已刷新本地 Agent 连接状态')
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
                >
                  <RefreshCw className="h-3 w-3" />
                  刷新检测
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-text-muted">已检测到本地 CLI（{availableLocals.length}）</div>
                  {availableLocals.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-2.5 text-[11px] text-text-muted">
                      未检测到可用的本地 CLI，请安装或在设置中配置 API 供应商。
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {availableLocals.map((a) => {
                        const active = agentSelection.backendId === a.id
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              setAgentSelection({
                                backendId: a.id,
                                model: a.models[0] || '',
                                reasoning: agentSelection.reasoning
                              })
                              toast.success(`已切换主控引擎至 ${a.name}`)
                              setConnOpen(false)
                            }}
                            className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-left transition ${
                              active
                                ? 'border-accent bg-accent-soft/70 font-medium text-accent'
                                : 'border-border bg-surface text-text-primary hover:border-accent/40'
                            }`}
                          >
                            <span className="truncate">{a.name}</span>
                            {active ? (
                              <Check className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1.5 text-[11px] font-medium text-text-muted">
                    已配置 API 供应商（{configuredApis.length}）
                  </div>
                  {configuredApis.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-2.5 text-[11px] text-text-muted">
                      暂未填写 API Key，请前往设置填写 Key 后自动启用。
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {configuredApis.map((api) => {
                        const active = agentSelection.backendId === api.presetId
                        return (
                          <button
                            key={api.presetId}
                            type="button"
                            onClick={() => {
                              setAgentSelection({
                                backendId: api.presetId,
                                model: api.models[0] || '',
                                reasoning: agentSelection.reasoning
                              })
                              toast.success(`已切换主控引擎至 ${api.name}`)
                              setConnOpen(false)
                            }}
                            className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-left transition ${
                              active
                                ? 'border-accent bg-accent-soft/70 font-medium text-accent'
                                : 'border-border bg-surface text-text-primary hover:border-accent/40'
                            }`}
                          >
                            <span className="truncate">{api.name}</span>
                            {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConnOpen(false)
                      setPage('settings')
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                  >
                    <Settings className="h-3 w-3" />
                    管理本地 Agent 与 API 供应商 →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="no-drag flex items-center gap-2">
        {page === 'workbench' && (
          <>
            <button
              type="button"
              onClick={onOpenExport}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 text-xs font-medium text-text-primary transition hover:border-accent/50 hover:text-accent"
            >
              <Download className="h-3.5 w-3.5" />
              导出作品
            </button>
            <button
              type="button"
              onClick={onOpenVersions}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-3 text-xs font-medium text-text-primary transition hover:border-accent/50 hover:text-accent"
            >
              <History className="h-3.5 w-3.5" />
              版本
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setPage('swarm')}
          title="查看正在工作的小说与任务"
          className="relative inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2.5 text-xs text-text-secondary transition hover:border-accent/40 hover:text-text-primary"
        >
          <Bell className="h-3.5 w-3.5" />
          <span>工作区</span>
          {runningSwarm > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-on-accent">
              {runningSwarm}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => void toggleTheme()}
          title={isDark ? '切换至 Aurora 浅色主题' : '切换至 Aurora 深色主题'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-raised text-text-secondary transition hover:border-accent/40 hover:text-accent"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="ml-1 flex items-center gap-1 border-l border-border pl-2">
          <button
            type="button"
            aria-label="最小化"
            onClick={() => void window.inknexus.window.minimize()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={maximized ? '向下还原窗口' : '最大化窗口'}
            title={maximized ? '还原窗口' : '最大化'}
            onClick={async () => setMaximized(await window.inknexus.window.maximize())}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-accent-soft/60 hover:text-text-primary"
          >
            {maximized ? <DoubleSquareRestoreIcon /> : <SingleSquareIcon />}
          </button>
          <button
            type="button"
            aria-label="关闭"
            onClick={() => void window.inknexus.window.close()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-danger-soft hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
