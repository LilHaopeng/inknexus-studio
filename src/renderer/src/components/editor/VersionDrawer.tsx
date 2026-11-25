import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { History, RotateCcw, X } from 'lucide-react'
import type { SnapshotRecord } from '@shared/types'
import { useStudioStore } from '../../store/useStudioStore'

interface VersionDrawerProps {
  open: boolean
  onClose: () => void
  onRestored: (content: string) => void
}

export const VersionDrawer: React.FC<VersionDrawerProps> = ({ open, onClose, onRestored }) => {
  const { activeProject, activeTabRelPath } = useStudioStore()
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([])
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !activeProject) return
    void window.inknexus.snapshots.list(activeProject.rootPath).then((list) => setSnapshots(list as SnapshotRecord[]))
  }, [open, activeProject])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !activeProject) return null

  const filtered = snapshots.filter(
    (s) =>
      !activeTabRelPath ||
      s.filePath.endsWith(activeTabRelPath.replace(/\//g, '\\')) ||
      s.filePath.endsWith(activeTabRelPath)
  )

  const handleSelect = async (snap: SnapshotRecord) => {
    setSelectedId(snap.id)
    const content = await window.inknexus.snapshots.getContent(activeProject.rootPath, snap.id)
    setPreviewText(content as string | null)
  }

  const handleRestore = async (snap: SnapshotRecord) => {
    if (!activeTabRelPath) return
    const content = await window.inknexus.snapshots.restore(activeProject.rootPath, activeTabRelPath, snap.id)
    onRestored(content)
    onClose()
  }

  return createPortal(
    <div
      data-testid="version-drawer-backdrop"
      onClick={onClose}
      className="no-drag fixed inset-0 z-[80] flex justify-end bg-black/40 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface shadow-2xl"
      >
        <div className="no-drag flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">版本快照时间轴（存放在 AppData）</h3>
          </div>
          <button
            type="button"
            data-testid="version-drawer-close"
            onClick={onClose}
            aria-label="关闭历史版本"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary transition hover:border-accent hover:bg-surface-raised hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
            关闭
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-12">
          <div className="col-span-5 space-y-2 overflow-y-auto border-r border-border p-3">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-muted">暂无该文件快照（AI 写入前与自动/手动存盘时会按周期生成）</div>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  onClick={() => void handleSelect(s)}
                  className={`cursor-pointer rounded-xl border p-2.5 text-xs transition ${
                    selectedId === s.id
                      ? 'border-accent bg-accent-soft/60'
                      : 'border-border bg-surface-raised hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-text-primary">{s.summary}</span>
                    <span className="text-[10px] text-text-muted">{(s.sizeBytes / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
                    <span>{new Date(s.createdAt).toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleRestore(s)
                      }}
                      className="inline-flex items-center gap-0.5 text-accent hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      恢复
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="col-span-7 overflow-y-auto bg-editor-bg p-4">
            {previewText !== null ? (
              <pre className="whitespace-pre-wrap font-serif text-xs leading-relaxed text-text-primary">{previewText}</pre>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-text-muted">选择左侧快照预览内容</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
