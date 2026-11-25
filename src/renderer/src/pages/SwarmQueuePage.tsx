import React, { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Workflow,
  X
} from 'lucide-react'
import type { AgentSelection, CreationMode, ReviewMode, SwarmJob } from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'
import { AgentSelectorBar } from '../components/ui/AgentSelectorBar'
import { ReviewModeSelector } from '../components/ui/ReviewModeSelector'

interface SwarmQueuePageProps {
  onOpenJobInWorkbench: (job: SwarmJob) => Promise<void>
}

export const SwarmQueuePage: React.FC<SwarmQueuePageProps> = ({ onOpenJobInWorkbench }) => {
  const { swarmJobs, projects, config, setConfig, agentSelection } = useStudioStore()
  const [showNewModal, setShowNewModal] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [targetRelPath, setTargetRelPath] = useState('正文/第001章_新稿.md')
  const [prompt, setPrompt] = useState('请结合本作大纲与声口卡，完成当前章节正文创作。')
  const [reviewMode, setReviewMode] = useState<ReviewMode>('single')
  const [writer, setWriter] = useState<AgentSelection>(agentSelection)
  const [reviewer1, setReviewer1] = useState<AgentSelection>(agentSelection)
  const [reviewer2, setReviewer2] = useState<AgentSelection>(agentSelection)

  const concurrency = config?.maxSwarmConcurrency ?? 3

  const handleConcurrencyChange = async (n: number) => {
    await window.inknexus.swarm.setConcurrency(n)
    const updated = await window.inknexus.config.save({ maxSwarmConcurrency: n })
    setConfig(updated)
  }

  const handleEnqueueBatch = async () => {
    const chosen = projects.filter((p) => selectedProjectIds.includes(p.id))
    if (chosen.length === 0) return
    await window.inknexus.swarm.enqueueBatch(
      chosen.map((p) => ({
        title: p.title,
        projectRoot: p.rootPath,
        targetRelPath: p.mode === 'drama-script' ? '剧本/第001集_开篇.md' : targetRelPath,
        mode: p.mode as CreationMode,
        prompt,
        reviewMode,
        writer,
        reviewer1: reviewMode !== 'self' ? reviewer1 : undefined,
        reviewer2: reviewMode === 'advanced' ? reviewer2 : undefined
      }))
    )
    setShowNewModal(false)
    setSelectedProjectIds([])
  }

  return (
    <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
              <Workflow className="h-6 w-6 text-accent" />
              多小说并发队列与审查中心
            </h1>
            <p className="mt-1 text-xs text-text-secondary">
              多部小说独立分配 Agent 并发撰写；写完后按所选审查机制（自审 / 单独审查 / 高级双审）自动流转至 Diff 待验收区
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs">
              <span className="text-text-secondary">最大并发数</span>
              <input
                type="range"
                min={1}
                max={6}
                value={concurrency}
                onChange={(e) => void handleConcurrencyChange(Number(e.target.value))}
                className="w-20 accent-[#7453DC]"
              />
              <span className="font-semibold text-accent">{concurrency}</span>
            </div>

            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-4 text-xs font-semibold text-white shadow-md hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              派发并发写作任务
            </button>
          </div>
        </div>

        {/* Queue List */}
        {swarmJobs.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <Workflow className="mx-auto mb-3 h-10 w-10 text-accent/60" />
            <h3 className="text-sm font-semibold text-text-primary">当前并发队列为空</h3>
            <p className="mt-1 text-xs text-text-muted">
              点击右上角「派发并发写作任务」，可一次勾选多部小说并发分配给独立 Agent，并指定自审 / 单独审查 / 高级双审流程
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {swarmJobs.map((job) => (
              <div key={job.id} className="glass-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">《{job.config.title}》</span>
                      <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                        {job.config.reviewMode === 'self'
                          ? '自审'
                          : job.config.reviewMode === 'single'
                            ? '单独审查 (1写+1审)'
                            : '高级审查 (1写+2审)'}
                      </span>
                      {job.config.reviewMode === 'advanced' && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          高 Token 模式
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">
                      状态：<strong className="text-text-primary">{job.progressLabel}</strong> · 目标文件：{job.config.targetRelPath}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {job.stage === 'awaiting_user' && (
                      <button
                        type="button"
                        onClick={() => void onOpenJobInWorkbench(job)}
                        className="inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent hover:bg-accent-hover"
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                        去工作台验收 Diff
                      </button>
                    )}
                    {['queued', 'writing', 'review_round_1', 'review_round_2'].includes(job.stage) && (
                      <button
                        type="button"
                        onClick={() => void window.inknexus.swarm.pause(job.id)}
                        className="rounded-lg border border-border p-1.5 text-text-secondary hover:text-warning"
                        title="暂停"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {['paused', 'failed', 'cancelled'].includes(job.stage) && (
                      <button
                        type="button"
                        onClick={() => void window.inknexus.swarm.resume(job.id)}
                        className="rounded-lg border border-border p-1.5 text-text-secondary hover:text-success"
                        title="继续或重试"
                      >
                        {job.stage === 'failed' ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void window.inknexus.swarm.delete(job.id)}
                      className="rounded-lg border border-border p-1.5 text-text-muted hover:text-danger"
                      title="移除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {job.reviewReports.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {job.reviewReports.map((r, i) => (
                      <div key={i} className="rounded-xl border border-border bg-surface-raised p-2.5 text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span>
                            第 {r.round} 审 · {r.reviewer}
                          </span>
                          <span className={r.verdict === 'PASS' ? 'text-success' : 'text-warning'}>
                            {r.verdict === 'PASS' ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> 通过
                              </span>
                            ) : (
                              '打回修订'
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-text-secondary">{r.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Batch Swarm Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h3 className="text-base font-semibold text-text-primary">配置多小说并发队列任务</h3>
              <button type="button" onClick={() => setShowNewModal(false)}>
                <X className="h-4 w-4 text-text-muted" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-5 text-xs">
              <div>
                <label className="mb-1.5 block font-semibold text-text-secondary">
                  1. 勾选要并发分发的小说作品（每本独占独立 Agent，可多选）
                </label>
                <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-border bg-surface-raised p-2.5">
                  {projects.map((p) => {
                    const checked = selectedProjectIds.includes(p.id)
                    return (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                          checked ? 'border-accent bg-accent-soft/60 text-accent' : 'border-transparent hover:bg-surface'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedProjectIds((ids) => [...ids, p.id])
                            else setSelectedProjectIds((ids) => ids.filter((id) => id !== p.id))
                          }}
                        />
                        <span className="truncate font-medium">{p.title}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-text-secondary">写入目标相对路径</label>
                  <input
                    type="text"
                    value={targetRelPath}
                    onChange={(e) => setTargetRelPath(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-text-secondary">写作任务指令</label>
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-text-secondary">2. 写作 Worker 引擎</label>
                <AgentSelectorBar value={writer} onChange={setWriter} />
              </div>

              <ReviewModeSelector value={reviewMode} onChange={setReviewMode} />

              {reviewMode !== 'self' && (
                <div>
                  <label className="mb-1 block font-semibold text-text-secondary">
                    一审审查员（逻辑 / 正典 / 红线）
                  </label>
                  <AgentSelectorBar value={reviewer1} onChange={setReviewer1} />
                </div>
              )}

              {reviewMode === 'advanced' && (
                <div>
                  <label className="mb-1 block font-semibold text-text-secondary">
                    二审审查员（换另一位审查员复核声口与节奏）
                  </label>
                  <AgentSelectorBar value={reviewer2} onChange={setReviewer2} />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs text-text-secondary"
              >
                取消
              </button>
              <button
                type="button"
                disabled={selectedProjectIds.length === 0}
                onClick={() => void handleEnqueueBatch()}
                className="rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-5 py-2 text-xs font-semibold text-white disabled:opacity-45"
              >
                启动并发队列（{selectedProjectIds.length} 部）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
