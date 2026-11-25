import React, { useMemo, useState } from 'react'
import { Bot, Cpu, MessageCircle, X } from 'lucide-react'
import type { AgentRoleId, AgentSelection } from '@shared/types'
import { stripAgentMarkupForDisplay } from '@shared/agent-markup-filter'
import { useStudioStore } from '../../store/useStudioStore'
import { AgentSelectorBar } from '../ui/AgentSelectorBar'

const ROLES: Array<{ id: AgentRoleId; label: string; tone: string }> = [
  { id: 'coordinator', label: '主控', tone: 'bg-accent-soft text-accent border-accent/35' },
  { id: 'writer', label: '作者', tone: 'bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/30' },
  { id: 'reviewer1', label: '审查1', tone: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' },
  { id: 'reviewer2', label: '审查2', tone: 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/30' }
]

const ROLE_NAME_MAP: Record<AgentRoleId | 'user' | 'all', string> = {
  coordinator: '主控',
  writer: '作者',
  reviewer1: '审查1',
  reviewer2: '审查2',
  user: '你',
  all: '全体'
}

export const AgentCommsBoard: React.FC = () => {
  const {
    activeProject,
    agentSelection,
    roleAgentOverrides,
    setRoleAgentOverride,
    agentCommsByProject,
    activeWorks
  } = useStudioStore()

  const [editingRole, setEditingRole] = useState<AgentRoleId | null>(null)

  const projectKey = activeProject?.rootPath.toLowerCase() ?? ''
  const messages = useMemo(
    () => agentCommsByProject[projectKey] ?? [],
    [agentCommsByProject, projectKey]
  )
  const overrides = roleAgentOverrides[projectKey] ?? {}
  const activeWork = activeWorks[projectKey]

  const getRoleSelection = (role: AgentRoleId): AgentSelection => {
    if (role === 'coordinator') return overrides.coordinator ?? agentSelection
    return overrides[role] ?? overrides.coordinator ?? agentSelection
  }

  return (
    <section className="flex h-full flex-col overflow-hidden bg-surface/85 backdrop-blur-md">
      {/* Header & Per-Role Model Controls */}
      <div className="border-b border-border px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
            <Bot className="h-3.5 w-3.5 text-accent" />
            <span>协作信息板</span>
          </div>
          {activeWork && activeWork.stage !== 'idle' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {activeWork.statusLabel}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {ROLES.map((r) => {
            const sel = getRoleSelection(r.id)
            const isEditing = editingRole === r.id
            const isExplicit = Boolean(overrides[r.id])
            return (
              <button
                key={r.id}
                type="button"
                title={`点击单独切换「${r.label}」模型与思考强度（当前：${sel.model || sel.backendId}）`}
                onClick={() => setEditingRole(isEditing ? null : r.id)}
                className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-medium transition ${
                  isEditing ? 'ring-2 ring-accent/40 ' + r.tone : r.tone
                }`}
              >
                <span>{r.label}</span>
                <span className="max-w-[68px] truncate opacity-80">
                  {sel.model || sel.backendId}
                </span>
                {r.id !== 'coordinator' && isExplicit && <Cpu className="h-2.5 w-2.5 opacity-75" />}
              </button>
            )
          })}
        </div>

        {editingRole && activeProject && (
          <div className="mt-2 rounded-xl border border-accent/35 bg-surface-raised p-2 text-xs shadow-sm">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-text-primary">
              <span>
                切换「{ROLE_NAME_MAP[editingRole]}」模型
                {editingRole === 'coordinator' ? '（仅影响未启动的子 Agent）' : '（独立指定，不受主控切换覆盖）'}
              </span>
              <button type="button" onClick={() => setEditingRole(null)} className="text-text-muted hover:text-text-primary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <AgentSelectorBar
              value={getRoleSelection(editingRole)}
              compact
              onlyReady
              onChange={(nextSel) => {
                setRoleAgentOverride(activeProject.rootPath, editingRole, nextSel)
              }}
            />
          </div>
        )}
      </div>

      {/* Swarm-style Comms Feed */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5 text-[11px]">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border p-4 text-center text-text-muted">
            <MessageCircle className="mb-1.5 h-5 w-5 opacity-50" />
            <span>主控、作者与审查之间的协作派发记录将实时展示于此。</span>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-xl border border-border bg-surface-raised/90 p-2.5 space-y-1">
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <span className="font-semibold text-accent">
                  {ROLE_NAME_MAP[m.fromRole]} → {ROLE_NAME_MAP[m.toRole]}
                </span>
                <span className="text-text-muted">
                  {m.modelLabel ? `${m.modelLabel} · ` : ''}
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="leading-relaxed text-text-primary whitespace-pre-wrap">
                {stripAgentMarkupForDisplay(m.content)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
