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
  hideBackend?: boolean
  onlyReady?: boolean
}

export const AgentSelectorBar: React.FC<AgentSelectorBarProps> = ({
  value,
  onChange,
  compact = false,
  hideBackend = false,
  onlyReady = true
}) => {
  const { localAgents, apiConfigs } = useStudioStore()

  const enabledApis = apiConfigs.filter((a) => a.enabled || a.hasApiKey)
  const availableLocals = localAgents.filter((a) => a.status === 'available')

  const readyBackends: Array<{
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
    }))
  ]

  const allBackends =
    onlyReady || readyBackends.length > 0
      ? readyBackends
      : [
          ...localAgents.map((a) => ({
            id: a.id,
            label: a.name,
            models: a.models,
            supportedReasoning: a.supportedReasoning,
            tag: a.status === 'available' ? '本地' : '未装'
          }))
        ]

  const currentBackend =
    allBackends.find((b) => b.id === value.backendId) ??
    allBackends[0] ?? {
      id: value.backendId,
      label: '未检测到可用引擎',
      models: [value.model || 'default'],
      supportedReasoning: REASONING_ORDER,
      tag: '提示'
    }

  const rawModels = currentBackend.models?.length ? currentBackend.models : [value.model || 'default']
  const families = groupModelsByFamily(rawModels, currentBackend.supportedReasoning ?? REASONING_ORDER)
  const selectedBaseId = parseModelEffortVariant(value.model || '').baseId
  const activeFamily = families.find((f) => f.baseId === selectedBaseId) ?? families[0]
  const supportedLevels = activeFamily?.supportedLevels ?? REASONING_ORDER
  const effectiveReasoning = clampReasoningLevel(value.reasoning, supportedLevels)

  if (allBackends.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-raised px-3 py-1.5 text-[11px] text-text-muted">
        暂无已就绪的 CLI 或 API，请先在「设置」安装本地 CLI 或填写 API Key
      </div>
    )
  }

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-1.5 ${
        compact ? 'w-full' : 'w-full'
      }`}
    >
      {!hideBackend && (
        <label className="flex h-8 min-w-[120px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 text-xs">
          <Cpu className="h-3.5 w-3.5 shrink-0 text-accent" />
          <select
            aria-label="选择 Agent 或 API"
            value={currentBackend.id}
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
                {b.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex h-8 min-w-[130px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 text-xs">
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
              backendId: currentBackend.id,
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

      <div className="min-w-[155px] flex-1">
        <ReasoningSlider
          value={effectiveReasoning}
          supportedLevels={supportedLevels}
          compact={compact}
          onChange={(nextReasoning) =>
            onChange({
              ...value,
              backendId: currentBackend.id,
              model: activeFamily?.baseId ?? value.model,
              reasoning: nextReasoning
            })
          }
        />
      </div>
    </div>
  )
}
