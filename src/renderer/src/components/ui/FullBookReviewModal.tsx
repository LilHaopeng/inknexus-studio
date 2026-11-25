import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck, X } from 'lucide-react'
import type { ReviewMode } from '@shared/types'
import { ReviewModeSelector } from './ReviewModeSelector'

interface FullBookReviewModalProps {
  open: boolean
  initialMode: ReviewMode
  busy?: boolean
  onCancel: () => void
  onConfirm: (mode: ReviewMode) => Promise<void>
}

export const FullBookReviewModal: React.FC<FullBookReviewModalProps> = ({
  open,
  initialMode,
  busy = false,
  onCancel,
  onConfirm
}) => {
  const [selectedMode, setSelectedMode] = useState<ReviewMode>(initialMode)

  useEffect(() => {
    if (open) setSelectedMode(initialMode)
  }, [open, initialMode])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">选择全文审查方式</h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-raised hover:text-text-primary disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-text-secondary">
          请选择本次运行全文审查所采用的审查流水线，完成后将在「审校」记录中按时间倒序归档纯净可读报告。
        </p>

        <ReviewModeSelector value={selectedMode} onChange={setSelectedMode} />

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-3.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-45"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm(selectedMode)}
            className="rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-5 py-2 text-xs font-semibold text-white shadow-md hover:opacity-95 disabled:opacity-50"
          >
            {busy ? '正在发起审查...' : '确认开始全文审查'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
