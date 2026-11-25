import React from 'react'
import { Brain, Cpu, Layers } from 'lucide-react'
import type { AgentSelection, ReasoningLevel } from '@shared/types'
import { useStudioStore } from '../../store/useStudioStore'

interface AgentSelectorBarProps {
  value: AgentSelection
  onChange: (next: AgentSelection) => void
  compact?: boolean
}

const REASONING_OPTIONS: Array<{ id: ReasoningLevel; label: string }> = [
  { id: 'off', label: '关闭思考' },
  { id: 'low', label: '轻度思考' },
  { id: 'medium', label: '标准思考' },
  { id: 'high', label: '深度思考' },
  { id: 'max', label: '极限推理' }
]

export const AgentSelectorBar: React.FC<AgentSelectorBarProps> = ({ value, onChange, compact = false }) => {
  const { localAgents, apiConfigs } = useStudioStore()

  const enabledApis = apiConfigs.filter((a) => a.enabled || a.hasApiKey)
  const availableLocals = localAgents.filter((a) => a.status === 'available')
  const unavailableLocals = localAgents.filter((a) => a.status !== 'available')

  const allBackends = [
    ...availableLocals.map((a) => ({ id: a.id, label: a.name, models: a.models, tag: '本地' })),
    ...enabledApis.map((a) => ({ id: a.presetId, label: a.name, models: a.models, tag: 'API' })),
    ...unavailableLocals.map((a) => ({ id: a.id, label: `${a.name} (未安装)`, models: a.models, tag: '未装' })),
    ...apiConfigs
      .filter((a) => !a.enabled && !a.hasApiKey)
      .map((a) => ({ id: a.presetId, label: `${a.name} (未填Key)`, models: a.models, tag: '未配' }))
  ]

  const currentBackend = allBackends.find((b) => b.id === value.backendId) ?? allBackends[0]
  const models = currentBackend?.models?.length ? currentBackend.models : [value.model || 'default']

  return (
    <div className={`grid gap-1.5 ${compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
      <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-accent" />
        <select
          aria-label="选择 Agent 或 API"
          value={value.backendId}
          onChange={(e) => {
            const nextId = e.target.value
            const nextB = allBackends.find((b) => b.id === nextId)
            onChange({
              ...value,
              backendId: nextId,
              model: nextB?.models?.[0] ?? value.model
            })
          }}
          className="w-full min-w-0 bg-transparent text-text-primary outline-none"
        >
          {allBackends.map((b) => (
            <option key={b.id} value={b.id} className="bg-surface-raised text-text-primary">
              [{b.tag}] {b.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs">
        <Layers className="h-3.5 w-3.5 shrink-0 text-accent" />
        <select
          aria-label="选择模型"
          value={models.includes(value.model) ? value.model : models[0]}
          onChange={(e) => onChange({ ...value, model: e.target.value })}
          className="w-full min-w-0 bg-transparent text-text-primary outline-none"
        >
          {models.map((m) => (
            <option key={m} value={m} className="bg-surface-raised text-text-primary">
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs">
        <Brain className="h-3.5 w-3.5 shrink-0 text-accent" />
        <select
          aria-label="思考深度"
          value={value.reasoning}
          onChange={(e) => onChange({ ...value, reasoning: e.target.value as ReasoningLevel })}
          className="w-full min-w-0 bg-transparent text-text-primary outline-none"
        >
          {REASONING_OPTIONS.map((r) => (
            <option key={r.id} value={r.id} className="bg-surface-raised text-text-primary">
              {r.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
