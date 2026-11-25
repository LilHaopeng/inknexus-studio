import React from 'react'
import { Cpu, Layers } from 'lucide-react'
import type { AgentSelection, ReasoningLevel } from '@shared/types'
import {
  REASONING_ORDER,
  clampReasoningLevel,
  groupModelsByFamily,
  parseModelEffortVariant
} from '@shared/model-families'
import { useStudioStore } from '../../store/useStudioStore'
import { ReasoningSlider } from './ReasoningSlider'

interface AgentSelectorBarProps {
  value: AgentSelection
  onChange: (next: AgentSelection) => void
  compact?: boolean
}

export const AgentSelectorBar: React.FC<AgentSelectorBarProps> = ({ value, onChange, compact = false }) => {
  const { localAgents, apiConfigs } = useStudioStore()

  const enabledApis = apiConfigs.filter((a) => a.enabled || a.hasApiKey)
  const availableLocals = localAgents.filter((a) => a.status === 'available')
  const unavailableLocals = localAgents.filter((a) => a.status !== 'available')

  const allBackends: Array<{
    id: string
    label: string
    models: string[]
    supportedReasoning: ReasoningLevel[]
    tag: string
  }> = [
    ...availableLocals.map((a) => ({
      id: a.id,
      label: a.name,
      models: a.models,
      supportedReasoning: a.supportedReasoning,
      tag: '本地'
    })),
    ...enabledApis.map((a) => ({
      id: a.presetId,
      label: a.name,
      models: a.models,
      supportedReasoning: REASONING_ORDER,
      tag: 'API'
    })),
    ...unavailableLocals.map((a) => ({
      id: a.id,
      label: `${a.name} (未安装)`,
      models: a.models,
      supportedReasoning: a.supportedReasoning,
      tag: '未装'
    })),
    ...apiConfigs
      .filter((a) => !a.enabled && !a.hasApiKey)
      .map((a) => ({
        id: a.presetId,
        label: `${a.name} (未填Key)`,
        models: a.models,
        supportedReasoning: REASONING_ORDER,
        tag: '未配'
      }))
  ]

  const currentBackend = allBackends.find((b) => b.id === value.backendId) ?? allBackends[0]
  const rawModels = currentBackend?.models?.length ? currentBackend.models : [value.model || 'default']
  const families = groupModelsByFamily(rawModels, currentBackend?.supportedReasoning ?? REASONING_ORDER)
  const selectedBaseId = parseModelEffortVariant(value.model || '').baseId
  const activeFamily = families.find((f) => f.baseId === selectedBaseId) ?? families[0]
  const supportedLevels = activeFamily?.supportedLevels ?? REASONING_ORDER
  const effectiveReasoning = clampReasoningLevel(value.reasoning, supportedLevels)

  return (
    <div className={`grid gap-1.5 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-3'}`}>
      <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-xs">
        <Cpu className="h-3.5 w-3.5 shrink-0 text-accent" />
        <select
          aria-label="选择 Agent 或 API"
          value={value.backendId}
          onChange={(e) => {
            const nextId = e.target.value
            const nextB = allBackends.find((b) => b.id === nextId)
            const nextFamilies = groupModelsByFamily(
              nextB?.models?.length ? nextB.models : [value.model],
              nextB?.supportedReasoning ?? REASONING_ORDER
            )
            const firstFam = nextFamilies[0]
            const nextModel = firstFam?.baseId ?? value.model
            const nextReasoning = clampReasoningLevel(
              value.reasoning,
              firstFam?.supportedLevels ?? nextB?.supportedReasoning ?? REASONING_ORDER
            )
            onChange({
              backendId: nextId,
              model: nextModel,
              reasoning: nextReasoning
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
          value={activeFamily?.baseId ?? ''}
          onChange={(e) => {
            const nextBase = e.target.value
            const nextFam = families.find((f) => f.baseId === nextBase)
            const nextReasoning = clampReasoningLevel(
              value.reasoning,
              nextFam?.supportedLevels ?? REASONING_ORDER
            )
            onChange({
              ...value,
              model: nextBase,
              reasoning: nextReasoning
            })
          }}
          className="w-full min-w-0 bg-transparent text-text-primary outline-none"
        >
          {families.map((fam) => (
            <option key={fam.baseId} value={fam.baseId} className="bg-surface-raised text-text-primary">
              {fam.baseId}
            </option>
          ))}
        </select>
      </label>

      <ReasoningSlider
        value={effectiveReasoning}
        supportedLevels={supportedLevels}
        compact={compact}
        onChange={(nextReasoning) =>
          onChange({
            ...value,
            model: activeFamily?.baseId ?? value.model,
            reasoning: nextReasoning
          })
        }
      />
    </div>
  )
}
