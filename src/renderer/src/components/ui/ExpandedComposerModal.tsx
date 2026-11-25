import React from 'react'
import { createPortal } from 'react-dom'
import { Minimize2, Send, ShieldCheck } from 'lucide-react'

interface ExpandedComposerModalProps {
  open: boolean
  value: string
  onChange: (v: string) => void
  onClose: () => void
  onSend: (withReview?: boolean) => Promise<void>
}

export const ExpandedComposerModal: React.FC<ExpandedComposerModalProps> = ({
  open,
  value,
  onChange,
  onClose,
  onSend
}) => {
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-xs">
      <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">向主控发送长篇创作 / 修订指令</h3>
          <button
            type="button"
            title="收起到右侧栏"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            收起
          </button>
        </div>

        <textarea
          autoFocus
          rows={14}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onClose()
              void onSend(false)
            }
          }}
          placeholder="在此畅写详细的大纲思路、情节转折、人物对话或修改要求（Ctrl+Enter 发送给主控）..."
          className="w-full resize-none rounded-xl border border-border bg-surface-raised p-4 text-sm leading-relaxed text-text-primary outline-none focus:border-accent"
        />

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-text-muted">{value.length} 字</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!value.trim()}
              onClick={() => {
                onClose()
                void onSend(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3.5 py-2 text-xs font-medium text-accent hover:bg-accent hover:text-on-accent disabled:opacity-45"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              发送并审查
            </button>
            <button
              type="button"
              disabled={!value.trim()}
              onClick={() => {
                onClose()
                void onSend(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-5 py-2 text-xs font-semibold text-white shadow-md hover:opacity-95 disabled:opacity-45"
            >
              <Send className="h-3.5 w-3.5" />
              发送给主控
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
