import React from 'react'
import { Brain } from 'lucide-react'
import type { ReasoningLevel } from '@shared/types'
import { REASONING_LABELS, clampReasoningLevel } from '@shared/model-families'

interface ReasoningSliderProps {
  value: ReasoningLevel
  supportedLevels: ReasoningLevel[]
  onChange: (next: ReasoningLevel) => void
  compact?: boolean
}

export const ReasoningSlider: React.FC<ReasoningSliderProps> = ({
  value,
  supportedLevels,
  onChange,
  compact = false
}) => {
  const levels = supportedLevels.length > 0 ? supportedLevels : (['medium'] as ReasoningLevel[])
  const clamped = clampReasoningLevel(value, levels)
  const activeIdx = Math.max(0, levels.indexOf(clamped))
  const percent = levels.length <= 1 ? 100 : (activeIdx / (levels.length - 1)) * 100
  const scaleTooltip = `左右拖动调节思考强度：${levels.map((l) => REASONING_LABELS[l]).join(' · ')}`

  if (levels.length <= 1) {
    return (
      <div
        title={scaleTooltip}
        className="flex h-8 items-center justify-between gap-2 rounded-lg border border-border bg-surface-raised px-2.5 text-xs"
      >
        <span className="inline-flex items-center gap-1 text-text-secondary">
          <Brain className="h-3.5 w-3.5 text-accent" />
          思考
        </span>
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
          {REASONING_LABELS[clamped]}
        </span>
      </div>
    )
  }

  return (
    <div
      title={scaleTooltip}
      className={`flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 ${
        compact ? 'h-8' : 'h-9'
      }`}
    >
      <div className="flex shrink-0 items-center gap-1 text-[11px] text-text-secondary">
        <Brain className="h-3.5 w-3.5 text-accent" />
        <span className="font-semibold text-accent">{REASONING_LABELS[clamped]}</span>
      </div>

      <div className="relative mx-1 flex min-w-[68px] flex-1 items-center py-1">
        {/* Background track */}
        <div className="h-1.5 w-full rounded-full bg-border" />
        {/* Filled gradient track */}
        <div
          className="pointer-events-none absolute left-0 h-1.5 rounded-full bg-gradient-to-r from-[#7855DA] to-[#4A74F5] transition-all duration-150"
          style={{ width: `${percent}%` }}
        />
        {/* Stop dots */}
        <div className="pointer-events-none absolute inset-x-0 flex items-center justify-between px-[3px]">
          {levels.map((lvl, idx) => (
            <span
              key={lvl}
              className={`h-1.5 w-1.5 rounded-full transition ${
                idx <= activeIdx ? 'bg-white/90 shadow-2xs' : 'bg-text-muted/40'
              }`}
            />
          ))}
        </div>
        {/* Visible thumb */}
        <div
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white bg-[#7855DA] shadow-md ring-2 ring-[#7855DA]/25 transition-all duration-150"
          style={{ left: `${percent}%` }}
        />
        {/* Interactive native range input overlaid transparently for accessible drag & keyboard step */}
        <input
          type="range"
          aria-label="思考强度"
          min={0}
          max={levels.length - 1}
          step={1}
          value={activeIdx}
          onChange={(e) => {
            const nextIdx = Number(e.target.value)
            const nextLevel = levels[nextIdx]
            if (nextLevel) onChange(nextLevel)
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}
