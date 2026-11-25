import React, { useState } from 'react'
import { Minimize2, Power, X } from 'lucide-react'

interface CloseConfirmModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (action: 'minimize-to-tray' | 'exit', remember: boolean) => Promise<void>
}

export const CloseConfirmModal: React.FC<CloseConfirmModalProps> = ({ open, onCancel, onConfirm }) => {
  const [choice, setChoice] = useState<'minimize-to-tray' | 'exit'>('minimize-to-tray')
  const [remember, setRemember] = useState(false)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">关闭窗口选项</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-raised hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-text-secondary">请选择点击关闭按钮时的行为：</p>

        <div className="space-y-2 text-xs">
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
              choice === 'minimize-to-tray'
                ? 'border-accent bg-accent-soft/60 text-text-primary'
                : 'border-border bg-surface-raised hover:border-accent/40'
            }`}
          >
            <input
              type="radio"
              name="closeChoice"
              checked={choice === 'minimize-to-tray'}
              onChange={() => setChoice('minimize-to-tray')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Minimize2 className="h-3.5 w-3.5 text-accent" />
                <span>最小化后台运行</span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-secondary">
                隐藏到系统托盘，并发队列写作与审查任务继续在后台运行，点击托盘图标即可恢复。
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
              choice === 'exit'
                ? 'border-accent bg-accent-soft/60 text-text-primary'
                : 'border-border bg-surface-raised hover:border-accent/40'
            }`}
          >
            <input
              type="radio"
              name="closeChoice"
              checked={choice === 'exit'}
              onChange={() => setChoice('exit')}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Power className="h-3.5 w-3.5 text-danger" />
                <span>直接关闭</span>
              </div>
              <p className="mt-0.5 text-[11px] text-text-secondary">彻底退出墨枢 InkNexus Studio 进程。</p>
            </div>
          </label>
        </div>

        <label className="mt-3.5 flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>记住此选择（可在「设置 → 工作区与安全权限」中随时修改）</span>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2 text-xs text-text-secondary hover:bg-surface-raised"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(choice, remember)}
            className="rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-5 py-2 text-xs font-semibold text-white shadow-sm"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
