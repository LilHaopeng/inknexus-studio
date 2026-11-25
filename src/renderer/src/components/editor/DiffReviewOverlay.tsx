import React, { useMemo } from 'react'
import DiffMatchPatch from 'diff-match-patch'
import { Check, CheckCheck, RotateCcw, X } from 'lucide-react'
import type { DiffProposal } from '@shared/types'

interface DiffReviewOverlayProps {
  proposal: DiffProposal
  onAcceptAll: () => void
  onRejectAll: () => void
  onApplyPartial: (mergedText: string) => void
}

interface DiffHunk {
  id: number
  type: 'equal' | 'change'
  original: string
  proposed: string
  accepted: boolean
}

export const DiffReviewOverlay: React.FC<DiffReviewOverlayProps> = ({
  proposal,
  onAcceptAll,
  onRejectAll,
  onApplyPartial
}) => {
  const initialHunks = useMemo<DiffHunk[]>(() => {
    const dmp = new DiffMatchPatch()
    const diffs = dmp.diff_main(proposal.originalText || '', proposal.proposedText || '')
    dmp.diff_cleanupSemantic(diffs)

    const hunks: DiffHunk[] = []
    let idx = 0
    for (let i = 0; i < diffs.length; i++) {
      const [op, txt] = diffs[i]
      if (op === 0) {
        hunks.push({ id: idx++, type: 'equal', original: txt, proposed: txt, accepted: true })
      } else if (op === -1) {
        const next = diffs[i + 1]
        if (next && next[0] === 1) {
          hunks.push({ id: idx++, type: 'change', original: txt, proposed: next[1], accepted: true })
          i++
        } else {
          hunks.push({ id: idx++, type: 'change', original: txt, proposed: '', accepted: true })
        }
      } else if (op === 1) {
        hunks.push({ id: idx++, type: 'change', original: '', proposed: txt, accepted: true })
      }
    }
    return hunks
  }, [proposal.originalText, proposal.proposedText])

  const [decisions, setDecisions] = React.useState<Record<number, boolean>>({})

  const isAccepted = (h: DiffHunk) => (decisions[h.id] !== undefined ? decisions[h.id] : h.accepted)

  const handleApplySelected = () => {
    const merged = initialHunks
      .map((h) => (h.type === 'equal' ? h.original : isAccepted(h) ? h.proposed : h.original))
      .join('')
    onApplyPartial(merged)
  }

  const changeCount = initialHunks.filter((h) => h.type === 'change').length

  return (
    <div className="mx-auto my-4 max-w-[820px] rounded-2xl border border-accent/40 bg-surface-raised p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs text-accent">红绿修订对比</span>
            <span>{proposal.summary}</span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            共检测到 {changeCount} 处修改，支持逐处接受或拒绝；采纳前会自动保存当前版本快照（可用 Ctrl+Z 撤销）
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRejectAll}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-danger-soft hover:text-danger"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            全部拒绝
          </button>
          <button
            type="button"
            onClick={handleApplySelected}
            className="inline-flex items-center gap-1 rounded-lg border border-accent/50 bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent"
          >
            <Check className="h-3.5 w-3.5" />
            按当前勾选应用
          </button>
          <button
            type="button"
            onClick={onAcceptAll}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            全部接受
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-editor-bg p-5 font-serif text-[16px] leading-[1.85] text-text-primary">
        {initialHunks.map((h) => {
          if (h.type === 'equal') return <span key={h.id}>{h.original}</span>
          const accepted = isAccepted(h)
          return (
            <span
              key={h.id}
              className="mx-0.5 inline-flex flex-wrap items-baseline gap-1 rounded-md border border-border/80 bg-surface/60 px-1.5 py-0.5 align-baseline"
            >
              {h.original && (
                <del
                  className="rounded px-1 line-through"
                  style={{ backgroundColor: 'var(--diff-remove-bg)', color: 'var(--diff-remove-text)' }}
                >
                  <span className="mr-1 text-[10px] font-sans opacity-75">[删除]</span>
                  {h.original}
                </del>
              )}
              {h.proposed && (
                <ins
                  className={`rounded px-1 no-underline ${accepted ? '' : 'opacity-40 line-through'}`}
                  style={{ backgroundColor: 'var(--diff-add-bg)', color: 'var(--diff-add-text)' }}
                >
                  <span className="mr-1 text-[10px] font-sans opacity-75">[新增]</span>
                  {h.proposed}
                </ins>
              )}
              <span className="inline-flex items-center gap-0.5 font-sans">
                <button
                  type="button"
                  title="接受此处修改"
                  onClick={() => setDecisions((d) => ({ ...d, [h.id]: true }))}
                  className={`rounded px-1 py-0.5 text-[10px] ${
                    accepted ? 'bg-success text-white' : 'bg-surface text-text-muted hover:text-success'
                  }`}
                >
                  <Check className="inline h-3 w-3" /> 接受
                </button>
                <button
                  type="button"
                  title="保留原文（拒绝此处）"
                  onClick={() => setDecisions((d) => ({ ...d, [h.id]: false }))}
                  className={`rounded px-1 py-0.5 text-[10px] ${
                    !accepted ? 'bg-danger text-white' : 'bg-surface text-text-muted hover:text-danger'
                  }`}
                >
                  <X className="inline h-3 w-3" /> 拒绝
                </button>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
