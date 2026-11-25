import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckSquare,
  ExternalLink,
  FolderOpen,
  GitCompare,
  Globe,
  Loader2,
  Radar,
  Sparkles,
  Square,
  TrendingUp
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  AgentSelection,
  CreationMode,
  PreComposedPrompt,
  RadarReportSummary,
  RadarTrendAnalysis
} from '@shared/types'
import { stripAgentMarkupForDisplay } from '@shared/agent-markup-filter'
import { useStudioStore } from '../store/useStudioStore'
import { AgentSelectorBar } from '../components/ui/AgentSelectorBar'

interface MarketRadarPageProps {
  onLaunchFromTopic: (params: { projectRoot: string; prePrompt?: PreComposedPrompt }) => Promise<void>
}

interface ParsedSection {
  heading: string
  items: string[]
  paragraphs: string[]
}

function parseCleanMarkdownSections(raw: string): ParsedSection[] {
  const clean = stripAgentMarkupForDisplay(raw)
  const lines = clean.split(/\r?\n/)
  const sections: ParsedSection[] = []
  let current: ParsedSection = { heading: '核心综述', items: [], paragraphs: [] }

  const flush = () => {
    if (current.items.length > 0 || current.paragraphs.length > 0) {
      sections.push(current)
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^#{1,4}\s+/.test(trimmed)) {
      flush()
      current = {
        heading: trimmed.replace(/^#{1,4}\s+/, '').replace(/\*\*/g, ''),
        items: [],
        paragraphs: []
      }
    } else if (/^[-*+]\s+/.test(trimmed) || /^\d+[.、]\s+/.test(trimmed)) {
      current.items.push(trimmed.replace(/^[-*+]\s+/, '').replace(/\*\*/g, '').replace(/`([^`]+)`/g, '$1'))
    } else if (/^\|/.test(trimmed)) {
      if (/^\|[\s-:|]+\|$/.test(trimmed)) continue
      const cells = trimmed
        .split('|')
        .map((c) => c.trim().replace(/\*\*/g, ''))
        .filter(Boolean)
      if (cells.length > 0) {
        current.items.push(cells.join(' · '))
      }
    } else {
      current.paragraphs.push(trimmed.replace(/\*\*/g, '').replace(/`([^`]+)`/g, '$1'))
    }
  }
  flush()
  return sections
}

function mapTrackToMode(track: 'short' | 'long' | 'ai-drama'): CreationMode {
  if (track === 'short') return 'short-webnovel'
  if (track === 'ai-drama') return 'drama-script'
  return 'long-novel'
}

export const MarketRadarPage: React.FC<MarketRadarPageProps> = ({ onLaunchFromTopic }) => {
  const { agentSelection, setAgentSelection, config } = useStudioStore()
  const [reports, setReports] = useState<RadarReportSummary[]>([])
  const [trends, setTrends] = useState<RadarTrendAnalysis[]>([])
  const [activeReportId, setActiveReportId] = useState<string>('')
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([])
  const [platform, setPlatform] = useState('番茄短故事')
  const [track, setTrack] = useState<'short' | 'long' | 'ai-drama'>('short')
  const [notes, setNotes] = useState('')
  const [scanning, setScanning] = useState(false)
  const [capturingLive, setCapturingLive] = useState(false)
  const [liveStatus, setLiveStatus] = useState<string>('')
  const [comparing, setComparing] = useState(false)
  const [activeTrend, setActiveTrend] = useState<RadarTrendAnalysis | null>(null)
  const [creatingFromBrief, setCreatingFromBrief] = useState(false)

  const reloadAll = async () => {
    const [rList, tList] = await Promise.all([window.inknexus.radar.list(), window.inknexus.radar.listTrends()])
    setReports(rList)
    setTrends(tList)
    if (rList.length > 0 && !activeReportId) {
      setActiveReportId(rList[0].folderName)
    }
    if (tList.length > 0 && !activeTrend) {
      setActiveTrend(tList[0])
    }
  }

  useEffect(() => {
    void reloadAll()
  }, [])

  const activeReport = useMemo(
    () => reports.find((r) => r.folderName === activeReportId) ?? reports[0] ?? null,
    [reports, activeReportId]
  )

  const handleRunScan = async () => {
    setScanning(true)
    try {
      const res = await window.inknexus.radar.runScan({
        platform,
        track,
        notes,
        selection: agentSelection,
        useBuiltinBrowser: true
      })
      if (res.liveMeta) {
        setLiveStatus(
          res.liveMeta.ok
            ? `已自动通过内置浏览器实时抓取 ${res.liveMeta.itemCount} 条榜单信息`
            : res.liveMeta.message || '未抓取到公开页数据，已回退内置基线分析'
        )
      }
      toast.success(`扫榜完成：${res.created.folderName}`)
      setReports(res.reports)
      setActiveReportId(res.created.folderName)
    } catch (err) {
      toast.error(`扫榜失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setScanning(false)
    }
  }

  const handleOpenBuiltinBrowser = async () => {
    const res = await window.inknexus.radar.openBrowser(platform)
    setLiveStatus(`已打开内置榜单窗口（${res.url}），如目标站点需要登录请在窗口内完成后点击「抓取窗口榜单」`)
  }

  const handleCaptureBuiltinWindow = async () => {
    setCapturingLive(true)
    try {
      const res = await window.inknexus.radar.captureBrowser()
      if (res.ok && res.extractedText) {
        setNotes((prev) => `${prev ? prev + '\n\n' : ''}${res.extractedText.slice(0, 4500)}`)
        setLiveStatus(res.message || `已提取 ${res.itemCount} 条实时文本`)
        toast.success(`已从内置浏览器窗口抓取 ${res.itemCount} 条榜单内容，可直接点击「一键扫榜」`)
      } else {
        setLiveStatus(res.message || '未提取到内容')
        toast.info(res.message || '请先在内置榜单窗口加载页面')
      }
    } finally {
      setCapturingLive(false)
    }
  }

  const toggleCompare = (folderName: string) => {
    setSelectedForCompare((prev) =>
      prev.includes(folderName) ? prev.filter((f) => f !== folderName) : [...prev, folderName]
    )
  }

  const handleCompareTrends = async () => {
    if (selectedForCompare.length < 2) {
      toast.info('请至少勾选两份扫榜记录进行趋势对比')
      return
    }
    setComparing(true)
    try {
      const tList = await window.inknexus.radar.compareTrends({
        folderNames: selectedForCompare,
        selection: agentSelection
      })
      setTrends(tList)
      if (tList.length > 0) setActiveTrend(tList[0])
      toast.success('已完成多期榜单趋势对比分析')
    } catch (err) {
      toast.error(`趋势对比失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setComparing(false)
    }
  }

  const handleLaunchTopic = async (briefText: string, titleHint: string, targetMode: CreationMode) => {
    setCreatingFromBrief(true)
    try {
      const root = config?.workspaceRoot || undefined
      const safeTitle = titleHint.replace(/[<>:"/\\|?*]/g, '_').slice(0, 26) || `新选题_${Date.now()}`
      const proj = await window.inknexus.projects.create({
        title: safeTitle,
        mode: targetMode,
        ...(root ? { parentDir: root } : {})
      })
      const prePrompt = await window.inknexus.prompt.composeScratch({
        mode: targetMode,
        title: safeTitle,
        userIdea: `请基于以下市场扫榜选题简报立项并起稿：\n\n${briefText.slice(0, 2500)}`
      })
      await onLaunchFromTopic({ projectRoot: proj.rootPath, prePrompt })
    } catch (err) {
      toast.error(`一键开书失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCreatingFromBrief(false)
    }
  }

  const cleanReportSections = useMemo(
    () => parseCleanMarkdownSections(activeReport?.scanFullText || activeReport?.scanSnippet || activeReport?.briefSnippet || ''),
    [activeReport]
  )
  const cleanBriefSections = useMemo(
    () => parseCleanMarkdownSections(activeReport?.briefFullText || activeReport?.briefSnippet || ''),
    [activeReport]
  )

  return (
    <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Header & One-click Scan */}
        <div className="glass-panel space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
                <Radar className="h-6 w-6 text-accent" />
                市场雷达与多期趋势看板
              </h1>
              <p className="mt-1 text-xs text-text-secondary">
                一键驱动内置市场雷达分析当下热榜与选题简报（自动隐藏 Agent 内部协议标记，纯净可读展示）
              </p>
            </div>
            <div className="min-w-[340px]">
              <AgentSelectorBar
                compact
                value={agentSelection}
                onChange={(next: AgentSelection) => setAgentSelection(next)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">目标平台榜单</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              >
                <option value="番茄短故事">番茄短故事</option>
                <option value="知乎盐言">知乎盐言</option>
                <option value="七猫短故事">七猫短故事</option>
                <option value="番茄长篇热榜">番茄长篇热榜</option>
                <option value="起点月票/畅销榜">起点月票/畅销榜</option>
                <option value="红果短剧 & 抖音版权中心">红果短剧 & 抖音版权中心</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">分析赛道</label>
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value as 'short' | 'long' | 'ai-drama')}
                className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              >
                <option value="short">高概念短篇网文</option>
                <option value="long">中长篇网文</option>
                <option value="ai-drama">AI 短剧 / 漫剧</option>
              </select>
            </div>

            <div className="md:col-span-4">
              <label className="mb-1 block text-[11px] font-medium text-text-secondary">补充聚焦方向（可选）</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="如：规则怪谈、女频微短剧反转、历史权谋..."
                className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
              />
            </div>

            <div className="flex items-end md:col-span-2">
              <button
                type="button"
                disabled={scanning}
                onClick={() => void handleRunScan()}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-3 text-xs font-semibold text-white shadow-md hover:opacity-95 disabled:opacity-50"
              >
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {scanning ? '扫榜分析中...' : '一键扫榜'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleOpenBuiltinBrowser()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent hover:text-accent"
              >
                <Globe className="h-3.5 w-3.5 text-accent" />
                打开内置榜单窗口（免 Ego 浏览器）
                <ExternalLink className="h-3 w-3 text-text-muted" />
              </button>
              <button
                type="button"
                disabled={capturingLive}
                onClick={() => void handleCaptureBuiltinWindow()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft/60 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent hover:text-on-accent disabled:opacity-50"
              >
                {capturingLive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                抓取窗口榜单
              </button>
            </div>
            {liveStatus && <span className="text-[11px] text-text-secondary">{liveStatus}</span>}
          </div>
        </div>

        {/* Main split: History list + Detail & Trend compare */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left: History + Multi-select compare */}
          <div className="space-y-3 lg:col-span-4">
            <div className="glass-panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-text-primary">
                  历史扫榜档案（{reports.length} 份）
                </span>
                <button
                  type="button"
                  disabled={comparing || selectedForCompare.length < 2}
                  onClick={() => void handleCompareTrends()}
                  className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent disabled:opacity-45"
                >
                  {comparing ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompare className="h-3 w-3" />}
                  趋势对比 ({selectedForCompare.length})
                </button>
              </div>

              {reports.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                  暂未找到历史扫榜报告，点击上方「一键扫榜」立即生成第一份市场雷达档案。
                </div>
              ) : (
                <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                  {reports.map((r) => {
                    const isActive = activeReport?.folderName === r.folderName
                    const checked = selectedForCompare.includes(r.folderName)
                    return (
                      <div
                        key={r.folderName}
                        className={`rounded-xl border p-3 transition ${
                          isActive
                            ? 'border-accent bg-accent-soft/55'
                            : 'border-border bg-surface-raised/70 hover:border-accent/45'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveReportId(r.folderName)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-xs font-semibold text-text-primary">{r.folderName}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-text-muted">
                              {r.platform && <span className="rounded bg-surface px-1.5 py-0.5">{r.platform}</span>}
                              {r.track && <span className="rounded bg-surface px-1.5 py-0.5">{r.track}</span>}
                              {r.scanDate && <span>{r.scanDate}</span>}
                              {r.sampleCount && <span>样本 {r.sampleCount}</span>}
                            </div>
                          </button>

                          <button
                            type="button"
                            title="勾选参与多期趋势对比"
                            onClick={() => toggleCompare(r.folderName)}
                            className="mt-0.5 text-text-secondary hover:text-accent"
                          >
                            {checked ? (
                              <CheckSquare className="h-4 w-4 text-accent" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {trends.length > 0 && (
              <div className="glass-panel space-y-2 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  历史趋势对比存档
                </div>
                {trends.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTrend(t)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-[11px] transition ${
                      activeTrend?.id === t.id
                        ? 'border-accent bg-accent-soft/50 text-accent'
                        : 'border-border bg-surface-raised text-text-secondary hover:border-accent/40'
                    }`}
                  >
                    <div className="truncate font-medium">{t.comparedFolders.join(' vs ')}</div>
                    <div className="text-[10px] opacity-75">{new Date(t.createdAt).toLocaleString('zh-CN')}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Structured clean view */}
          <div className="space-y-4 lg:col-span-8">
            {activeTrend && (
              <div className="glass-panel space-y-2.5 border-accent/35 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-accent">
                    <TrendingUp className="h-4 w-4" />
                    多期榜单趋势对比结论（{activeTrend.comparedFolders.join(' · ')}）
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTrend(null)}
                    className="text-[11px] text-text-muted hover:text-text-primary"
                  >
                    收起
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary">
                  {stripAgentMarkupForDisplay(activeTrend.summary)}
                </div>
              </div>
            )}

            {activeReport ? (
              <div className="glass-panel space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div>
                    <h2 className="text-base font-bold text-text-primary">{activeReport.folderName}</h2>
                    <div className="mt-0.5 text-[11px] text-text-muted">
                      平台：{activeReport.platform || '市场综合'} · 赛道：{activeReport.track || track}
                      {activeReport.scanDate ? ` · 日期：${activeReport.scanDate}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void window.inknexus.projects.openFolder(activeReport.folderPath)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-accent"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      打开目录
                    </button>
                    <button
                      type="button"
                      disabled={creatingFromBrief}
                      onClick={() =>
                        void handleLaunchTopic(
                          activeReport.briefFullText ||
                            activeReport.scanFullText ||
                            activeReport.briefSnippet ||
                            activeReport.scanSnippet ||
                            '',
                          activeReport.folderName,
                          mapTrackToMode(track)
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
                    >
                      {creatingFromBrief ? '立项中...' : '以此简报一键开书'}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {cleanBriefSections.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">推荐选题简报摘要</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {cleanBriefSections.slice(0, 6).map((sec, idx) => (
                        <div key={idx} className="space-y-1.5 rounded-xl border border-border bg-surface-raised/85 p-3.5">
                          <div className="text-xs font-semibold text-text-primary">{sec.heading}</div>
                          {sec.paragraphs.slice(0, 2).map((p, i) => (
                            <p key={i} className="text-xs leading-relaxed text-text-secondary">
                              {p}
                            </p>
                          ))}
                          {sec.items.length > 0 && (
                            <ul className="space-y-1 text-xs text-text-secondary">
                              {sec.items.slice(0, 5).map((it, i) => (
                                <li key={i} className="flex gap-1.5">
                                  <span className="text-accent">•</span>
                                  <span>{it}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">榜单结构化分析</h3>
                  <div className="space-y-2.5">
                    {cleanReportSections.map((sec, idx) => (
                      <div key={idx} className="space-y-1.5 rounded-xl border border-border bg-surface/75 p-3.5">
                        <div className="text-xs font-semibold text-text-primary">{sec.heading}</div>
                        {sec.paragraphs.map((p, i) => (
                          <p key={i} className="text-xs leading-relaxed text-text-secondary">
                            {p}
                          </p>
                        ))}
                        {sec.items.length > 0 && (
                          <ul className="space-y-1 text-xs text-text-secondary">
                            {sec.items.map((it, i) => (
                              <li key={i} className="flex gap-1.5">
                                <span className="text-accent">•</span>
                                <span>{it}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="glass-panel p-12 text-center text-xs text-text-muted">
                从左侧选择一份历史扫榜档案，或在上方点击「一键扫榜」生成新分析。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
