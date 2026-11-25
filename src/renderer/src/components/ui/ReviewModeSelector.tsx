import React from 'react'
import { AlertTriangle, ShieldCheck, UserCheck, Users } from 'lucide-react'
import type { ReviewMode } from '@shared/types'

interface ReviewModeSelectorProps {
  value: ReviewMode
  onChange: (mode: ReviewMode) => void
  compact?: boolean
}

const OPTIONS: Array<{
  id: ReviewMode
  label: string
  shortDesc: string
  icon: React.FC<{ className?: string }>
}> = [
  {
    id: 'self',
    label: '自审',
    shortDesc: '作者 AI 写完后自己复查一遍，结合体检脚本修整，速度最快、耗时少。',
    icon: UserCheck
  },
  {
    id: 'single',
    label: '单独审查',
    shortDesc: '写作完成后派发另一位独立审查 AI 盲审把关，不通过则打回修订。',
    icon: ShieldCheck
  },
  {
    id: 'advanced',
    label: '高级审查',
    shortDesc: '一审逻辑审查通过后，再换另一位独立审查 AI 进行二审文风节奏复核。',
    icon: Users
  }
]

export const ReviewModeSelector: React.FC<ReviewModeSelectorProps> = ({ value, onChange }) => {
  const current = OPTIONS.find((o) => o.id === value) ?? OPTIONS[1]

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">审查机制</span>
        <span className="text-[11px] text-text-muted">{current.label}</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-surface p-1">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const active = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              title={opt.shortDesc}
              onClick={() => onChange(opt.id)}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{opt.label}</span>
              {opt.id === 'advanced' && (
                <AlertTriangle
                  className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-amber-200' : 'text-amber-500'}`}
                  aria-label="高 token 消耗提醒"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 简短模式说明 */}
      <div className="rounded-lg border border-border/70 bg-surface-raised/70 px-2.5 py-1.5 text-[11px] leading-snug text-text-secondary">
        {current.shortDesc}
      </div>

      {/* 仅在选中「高级审查」时显示黄色感叹号高 Token 提醒 */}
      {value === 'advanced' && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-500/15 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>
            <strong className="font-medium">高级审查：</strong>该模式下会消耗大量token额度
          </span>
        </div>
      )}
    </div>
  )
}
