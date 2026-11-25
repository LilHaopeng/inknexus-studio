import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Sparkles, X } from 'lucide-react'

interface CreateChaptersModalProps {
  open: boolean
  outlineRelPath: string
  onClose: () => void
  onConfirm: (params: { scope: 'count' | 'full'; chapterCount: number; extraNote: string }) => Promise<void>
}

export const CreateChaptersModal: React.FC<CreateChaptersModalProps> = ({
  open,
  outlineRelPath,
  onClose,
  onConfirm
}) => {
  const [scope, setScope] = useState<'count' | 'full'>('count')
  const [chapterCount, setChapterCount] = useState(3)
  const [extraNote, setExtraNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const cleanOutlineName = outlineRelPath.split('/').pop()?.replace(/\.(md|txt)$/i, '') || '当前大纲'

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm({ scope, chapterCount, extraNote })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">根据大纲创建正文章节</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-raised hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div className="rounded-xl border border-border bg-surface-raised px-3 py-2 text-text-secondary">
            依据大纲：<strong className="text-text-primary">{cleanOutlineName}</strong>
            <div className="mt-0.5 text-[11px] text-text-muted">
              默认由主控指派单一作者连续执笔以保持文风与人物声口一致
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope('count')}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                scope === 'count'
                  ? 'border-accent bg-accent-soft text-accent font-semibold'
                  : 'border-border bg-surface-raised text-text-primary'
              }`}
            >
              <div>写指定章数</div>
              <div className="mt-0.5 text-[10px] opacity-75">分段推进，随时审阅卡点</div>
            </button>
            <button
              type="button"
              onClick={() => setScope('full')}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                scope === 'full'
                  ? 'border-accent bg-accent-soft text-accent font-semibold'
                  : 'border-border bg-surface-raised text-text-primary'
              }`}
            >
              <div>撰写全文</div>
              <div className="mt-0.5 text-[10px] opacity-75">按大纲全卷顺序推进完本</div>
            </button>
          </div>

          {scope === 'count' && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-3 py-2">
              <span className="text-text-secondary">本次撰写章节数</span>
              <div className="flex items-center gap-1.5">
                {[1, 3, 5, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setChapterCount(n)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-medium ${
                      chapterCount === n ? 'bg-accent text-on-accent' : 'bg-surface text-text-secondary'
                    }`}
                  >
                    {n} 章
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={chapterCount}
                  onChange={(e) => setChapterCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-12 rounded-lg border border-border bg-surface px-1.5 py-1 text-center text-[11px] text-text-primary outline-none"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-text-secondary">补充写作要求（可选）</label>
            <textarea
              rows={3}
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="例如：严格贴合第一章文风切片，重点展开茶楼对峙戏份..."
              className="w-full resize-none rounded-xl border border-border bg-surface-raised p-2.5 text-xs text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-1.5 text-xs text-text-secondary"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-4 py-1.5 text-xs font-semibold text-white shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {submitting ? '派发中...' : '开始生成正文'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
