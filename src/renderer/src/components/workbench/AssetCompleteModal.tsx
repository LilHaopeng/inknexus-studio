import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Paperclip, Sparkles, Trash2, X } from 'lucide-react'
import type { ImportedFileItem } from '@shared/types'
import type { AssetCategoryKey } from './AssetCategoryPanel'

interface AssetCompleteModalProps {
  open: boolean
  category: AssetCategoryKey
  onClose: () => void
  onSubmit: (params: {
    category: AssetCategoryKey
    userIdeas: string
    files: ImportedFileItem[]
  }) => Promise<void>
}

const LABELS: Record<AssetCategoryKey, string> = {
  world: '世界观',
  outline: '大纲',
  prose: '正文'
}

export const AssetCompleteModal: React.FC<AssetCompleteModalProps> = ({
  open,
  category,
  onClose,
  onSubmit
}) => {
  const [userIdeas, setUserIdeas] = useState('')
  const [files, setFiles] = useState<ImportedFileItem[]>([])
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const handlePickRefs = async () => {
    const paths = await window.inknexus.importer.pickFiles()
    if (!paths || paths.length === 0) return
    const parsed = await window.inknexus.importer.parsePaths(paths)
    setFiles((prev) => [...prev, ...parsed])
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await onSubmit({ category, userIdeas, files })
      setUserIdeas('')
      setFiles([])
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">补全「{LABELS[category]}」</h3>
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
          <div>
            <label className="mb-1 block font-medium text-text-secondary">
              补充你的想法、设定线索或写作要求
            </label>
            <textarea
              rows={5}
              value={userIdeas}
              onChange={(e) => setUserIdeas(e.target.value)}
              placeholder={`写下希望 Agent 在「${LABELS[category]}」中重点呈现的内容、规则、人物或风格要求...`}
              className="w-full resize-none rounded-xl border border-border bg-surface-raised p-3 text-xs leading-relaxed text-text-primary outline-none focus:border-accent"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-secondary">参考资料（可选，支持 PDF / DOCX / TXT / MD）</span>
              <button
                type="button"
                onClick={() => void handlePickRefs()}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2.5 py-1 text-[11px] font-medium text-text-primary hover:border-accent hover:text-accent"
              >
                <Paperclip className="h-3 w-3" />
                上传参考文件
              </button>
            </div>
            {files.length > 0 && (
              <div className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-border bg-surface-raised p-2">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex min-w-0 items-center gap-1.5 text-text-primary">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate">{f.fileName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                      className="text-text-muted hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-1.5 text-xs text-text-secondary hover:bg-surface-raised"
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting || (!userIdeas.trim() && files.length === 0)}
            onClick={() => void handleConfirm()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-4 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-45"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {submitting ? '派发补全中...' : `交由主控补全${LABELS[category]}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
