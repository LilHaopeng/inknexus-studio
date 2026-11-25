import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FolderOpen, X } from 'lucide-react'
import type { ProjectSummary } from '@shared/types'
import { useStudioStore } from '../../store/useStudioStore'

interface ExportModalProps {
  open: boolean
  project?: ProjectSummary | null
  onClose: () => void
}

export const ExportModal: React.FC<ExportModalProps> = ({ open, project, onClose }) => {
  const { activeProject } = useStudioStore()
  const target = project ?? activeProject
  const [format, setFormat] = useState<'docx' | 'txt' | 'both'>('docx')
  const [preset, setPreset] = useState<'book' | 'screen'>('book')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; outputFiles: string[]; log: string } | null>(null)

  if (!open || !target) return null

  const handleExport = async () => {
    setBusy(true)
    try {
      const res = (await window.inknexus.python.export({
        projectRoot: target.rootPath,
        title: target.title,
        mode: target.mode,
        format,
        preset
      })) as { ok: boolean; outputFiles: string[]; log: string }
      setResult(res)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div onClick={onClose} className="no-drag fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-text-primary">导出交付稿（出版级排版）</h3>
            <p className="text-xs text-text-muted">目标作品：《{target.title}》</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-surface-raised">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="mb-1 block font-medium text-text-secondary">导出格式</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'docx' as const, label: 'Word (.docx)' },
                { id: 'txt' as const, label: '纯文本 (.txt)' },
                { id: 'both' as const, label: '全部导出' }
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={`rounded-xl border py-2 font-medium ${
                    format === f.id ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-raised text-text-primary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {target.mode === 'long-novel' && (
            <div>
              <label className="mb-1 block font-medium text-text-secondary">排版风格</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  key="book"
                  type="button"
                  onClick={() => setPreset('book')}
                  className={`rounded-xl border py-2 font-medium ${
                    preset === 'book' ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-raised'
                  }`}
                >
                  书籍级 (book)
                </button>
                <button
                  key="screen"
                  type="button"
                  onClick={() => setPreset('screen')}
                  className={`rounded-xl border py-2 font-medium ${
                    preset === 'screen' ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-raised'
                  }`}
                >
                  屏幕轻读 (screen)
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className={`rounded-xl border p-3 ${result.ok ? 'border-success/40 bg-success-soft' : 'border-danger/40 bg-danger-soft'}`}>
              <div className="font-semibold">{result.ok ? '导出完成' : '导出遇到问题'}</div>
              {result.outputFiles.map((f) => (
                <div key={f} className="mt-1 truncate text-[11px]">
                  {f}
                </div>
              ))}
              {result.log && <pre className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap text-[10px]">{result.log}</pre>}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void window.inknexus.projects.openFolder(`${target.rootPath}\\交付`)}
            className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-xs text-text-secondary hover:bg-surface-raised"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            打开交付目录
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-4 py-2 text-xs font-semibold text-white"
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? '正在生成...' : '立即导出'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
