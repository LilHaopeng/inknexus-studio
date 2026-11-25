import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ActiveWorkEntry, AgentRoleId, SwarmJob, SwarmStage } from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  XCircle
} from 'lucide-react'

const STAGE_LABEL_MAP: Record<ActiveWorkEntry['stage'], string> = {
  idle: '待命',
  planning: '主控构思中',
  completing: '补全资产中',
  writing: '写作中',
  reviewing: '审查中',
  revising: '按批注修改中'
}

const ROLE_LABEL_MAP: Record<AgentRoleId, string> = {
  coordinator: '主控',
  writer: '作者',
  reviewer1: '审查1',
  reviewer2: '审查2'
}

function getSwarmStageLabel(stage: SwarmStage): string {
  switch (stage) {
    case 'queued':
      return '排队等待'
    case 'writing':
      return '写作中'
    case 'linting':
      return '视听/文本体检'
    case 'self_review':
      return '自审中'
    case 'review_round_1':
      return '一审审查中'
    case 'revising_1':
      return '一轮修稿中'
    case 'review_round_2':
      return '二审终核中'
    case 'revising_2':
      return '二轮修稿中'
    case 'awaiting_user':
      return '待确认写入'
    case 'paused':
      return '已暂停'
    case 'failed':
      return '异常中止'
    case 'cancelled':
      return '已取消'
    default:
      return stage
  }
}

export const SwarmQueuePage: React.FC<{
  onOpenJobInWorkbench: (job: SwarmJob) => void
  onOpenProjectInWorkbench?: (projectRoot: string, entryRelPath?: string) => void
}> = ({ onOpenJobInWorkbench, onOpenProjectInWorkbench }) => {
  const { swarmJobs, setSwarmJobs, config, setConfig, activeWorks } = useStudioStore()
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  const liveWorkList = useMemo(
    () =>
      Object.values(activeWorks).sort((a, b) => {
        if (a.stage !== 'idle' && b.stage === 'idle') return -1
        if (a.stage === 'idle' && b.stage !== 'idle') return 1
        return b.updatedAt - a.updatedAt
      }),
    [activeWorks]
  )

  const filteredJobs = swarmJobs.filter((j) => {
    const isDone = j.stage === 'awaiting_user' || j.stage === 'failed' || j.stage === 'cancelled'
    if (filter === 'active') return !isDone
    if (filter === 'done') return isDone
    return true
  })

  const handleConcurrency = async (n: number) => {
    await window.inknexus.swarm.setConcurrency(n)
    const updated = await window.inknexus.config.save({ maxSwarmConcurrency: n })
    setConfig(updated)
    toast.success(`工作区最大并发已调整为 ${n}`)
  }

  const handleClearCompleted = async () => {
    const remaining = await window.inknexus.storage.clearSwarm()
    setSwarmJobs(remaining)
    toast.success('已清理已结束后台任务记录')
  }

  return (
    <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">工作区</h1>
            <p className="mt-1 text-sm text-text-secondary">目前正在工作的小说</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs">
              <span className="text-text-muted">并发数</span>
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => void handleConcurrency(n)}
                  className={`rounded-md px-2 py-0.5 font-medium transition ${
                    (config?.maxSwarmConcurrency ?? 2) === n
                      ? 'bg-accent text-on-accent'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleClearCompleted()}
              className="rounded-xl border border-border bg-surface-raised px-3 py-2 text-xs text-text-secondary hover:border-danger hover:text-danger"
            >
              清理已结束任务
            </button>
          </div>
        </div>

        {/* 实时工作区小说追踪（与工作台 & 书架状态同步） */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
              <Activity className="h-4 w-4 text-accent" />
              <span>实时协作与状态追踪（{liveWorkList.length}）</span>
            </div>
          </div>

          {liveWorkList.length === 0 ? (
            <div className="glass-card p-6 text-center text-xs text-text-muted">
              当前暂无活跃写作或审查中的小说；在创作大厅发起项目或进入工作台后，实时进度将在此同步显示。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {liveWorkList.map((work) => {
                const isRunning = work.stage !== 'idle'
                return (
                  <div
                    key={work.projectRoot}
                    className={`glass-card flex flex-col justify-between p-4 transition ${
                      isRunning ? 'active-work-card' : ''
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{work.title}</span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              isRunning
                                ? 'bg-accent text-on-accent'
                                : 'border border-border bg-surface text-text-muted'
                            }`}
                          >
                            {isRunning && <Sparkles className="h-2.5 w-2.5 animate-pulse" />}
                            {STAGE_LABEL_MAP[work.stage]}
                          </span>
                        </div>
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                          当前角色：{ROLE_LABEL_MAP[work.activeRole] ?? work.activeRole}
                        </span>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-surface/65 px-2.5 py-1.5 text-xs text-text-secondary">
                        {work.statusLabel}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
                      <span>更新于 {new Date(work.updatedAt).toLocaleTimeString()}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenProjectInWorkbench) {
                            onOpenProjectInWorkbench(work.projectRoot)
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover"
                      >
                        <ExternalLink className="h-3 w-3" />
                        查看工作台
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 后台批量生成与审校任务 */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-text-primary">后台批量生成与审查队列（{swarmJobs.length}）</span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `全部 (${swarmJobs.length})` },
                  {
                    id: 'active',
                    label: `进行中 (${
                      swarmJobs.filter((j) => !['awaiting_user', 'failed', 'cancelled'].includes(j.stage)).length
                    })`
                  },
                  {
                    id: 'done',
                    label: `已结束 (${
                      swarmJobs.filter((j) => ['awaiting_user', 'failed', 'cancelled'].includes(j.stage)).length
                    })`
                  }
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs transition ${
                    filter === tab.id
                      ? 'bg-accent-soft font-medium text-accent'
                      : 'border border-border bg-surface-raised text-text-secondary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="glass-card p-8 text-center text-xs text-text-muted">
              当前没有后台批量任务；可在大纲审阅时点击「开始创建正文章节」批量派发或由主控按需拉起子 Agent。
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredJobs.map((job) => {
                const isRunning = !['awaiting_user', 'failed', 'cancelled', 'paused'].includes(job.stage)
                return (
                  <div
                    key={job.id}
                    className={`glass-card flex items-center justify-between gap-4 p-4 ${
                      isRunning ? 'active-work-card' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-text-primary">{job.config.title}</span>
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                          {getSwarmStageLabel(job.stage)}
                        </span>
                        <span className="text-[11px] text-text-muted">{job.config.writer.model}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-secondary">
                        <span>{job.progressLabel || job.error || '执行中'}</span>
                        <span className="text-text-muted">目标：{job.config.targetRelPath}</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {job.proposal && (
                        <button
                          type="button"
                          onClick={() => onOpenJobInWorkbench(job)}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          核验写入
                        </button>
                      )}
                      {job.stage === 'paused' ? (
                        <button
                          type="button"
                          onClick={() => void window.inknexus.swarm.resume(job.id)}
                          className="rounded-lg border border-border p-1.5 text-text-secondary hover:border-accent hover:text-accent"
                          title="继续"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      ) : job.stage !== 'awaiting_user' && job.stage !== 'failed' && job.stage !== 'cancelled' ? (
                        <button
                          type="button"
                          onClick={() => void window.inknexus.swarm.pause(job.id)}
                          className="rounded-lg border border-border p-1.5 text-text-secondary hover:border-warning hover:text-warning"
                          title="暂停"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </button>
                      ) : null}

                      {job.stage === 'failed' || job.stage === 'cancelled' ? (
                        <button
                          type="button"
                          onClick={() => void window.inknexus.swarm.resume(job.id)}
                          className="rounded-lg border border-border p-1.5 text-text-secondary hover:border-accent hover:text-accent"
                          title="重试"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      ) : job.stage !== 'awaiting_user' ? (
                        <button
                          type="button"
                          onClick={() => void window.inknexus.swarm.cancel(job.id)}
                          className="rounded-lg border border-border p-1.5 text-text-secondary hover:border-danger hover:text-danger"
                          title="取消"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => void window.inknexus.swarm.delete(job.id)}
                        className="rounded-lg border border-border p-1.5 text-text-secondary hover:border-danger hover:text-danger"
                        title="删除记录"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      {job.stage === 'failed' && <XCircle className="h-4 w-4 text-danger" />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
