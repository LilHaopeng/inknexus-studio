import React, { useState } from 'react'
import { motion } from 'motion/react'
import { AlertCircle, Check, FileText, Sparkles, Trash2, X } from 'lucide-react'
import type {
  CreationIntent,
  CreationMode,
  ImportFileRole,
  ImportedFileItem,
  PreComposedPrompt
} from '@shared/types'

interface ImportWizardModalProps {
  initialFiles: ImportedFileItem[]
  onClose: () => void
  onConfirmLaunch: (params: {
    title: string
    mode: CreationMode
    files: ImportedFileItem[]
    prePrompt: PreComposedPrompt
  }) => Promise<void>
}

const ROLE_OPTIONS: Array<{ id: ImportFileRole; label: string }> = [
  { id: 'world', label: '世界观' },
  { id: 'outline', label: '大纲' },
  { id: 'prose', label: '正文' },
  { id: 'character', label: '人物设定' },
  { id: 'style-sample', label: '参考样本' },
  { id: 'radar-brief', label: '扫榜简报' },
  { id: 'full-project', label: '完整作品' },
  { id: 'custom', label: '自定义标签' }
]

const INTENT_OPTIONS: Array<{ id: CreationIntent; label: string; desc: string }> = [
  { id: 'write-prose', label: '写正文', desc: '基于导入设定/大纲直接撰写或续写正文' },
  { id: 'draft-outline', label: '拟大纲', desc: '梳理 Story DNA、故事弧与分章细纲' },
  { id: 'complete-from-outline', label: '单大纲补全设定', desc: '由单一文件大纲反推世界观、人物与声口卡' },
  { id: 'reverse-outline', label: '正文反推大纲', desc: '从已有正文逆向拆解大纲、伏笔与人物台账' },
  { id: 'adapt-to-script', label: '改剧本', desc: '重构为 AI 短剧/漫剧并守住红果 40× 红线' },
  { id: 'audit-and-polish', label: '审校润色', desc: '查吃书冲突、去 AI 味并生成逐段修订' },
  { id: 'custom', label: '自定义要求', desc: '在右侧填写你的专属创作指令' }
]

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  initialFiles,
  onClose,
  onConfirmLaunch
}) => {
  const [files, setFiles] = useState<ImportedFileItem[]>(initialFiles)
  const [selectedId, setSelectedId] = useState<string>(initialFiles[0]?.id ?? '')
  const [projectTitle, setProjectTitle] = useState<string>(() => {
    const first = initialFiles[0]?.fileName ?? '导入作品'
    return first.replace(/\.(pdf|docx|txt|md)$/i, '').replace(/[《》]/g, '').slice(0, 24) || '导入作品'
  })
  const [mode, setMode] = useState<CreationMode>('long-novel')
  const [intent, setIntent] = useState<CreationIntent>(() => {
    const hasOutline = initialFiles.some((f) => f.role === 'outline')
    const hasProse = initialFiles.some((f) => f.role === 'prose')
    if (hasOutline && !hasProse) return 'write-prose'
    if (hasProse && !hasOutline) return 'reverse-outline'
    return 'write-prose'
  })
  const [customIntentText, setCustomIntentText] = useState('')
  const [userNotes, setUserNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedFile = files.find((f) => f.id === selectedId) ?? files[0]

  const updateFileRole = (id: string, role: ImportFileRole) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, role } : f)))
  }

  const updateCustomLabel = (id: string, customRoleLabel: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, customRoleLabel } : f)))
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleLaunch = async () => {
    const valid = files.filter((f) => !f.error)
    if (valid.length === 0) return
    setBusy(true)
    try {
      const prePrompt = await window.inknexus.prompt.composeImport({
        mode,
        intent,
        customIntentText,
        projectTitle,
        files: valid,
        userNotes
      })
      await onConfirmLaunch({ title: projectTitle, mode, files: valid, prePrompt })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">导入作品素材与创作意图配置</h2>
            <p className="text-xs text-text-secondary">
              不会改动你的原文件；导入后将自动装配对应 Skill 规则与预埋 Prompt 进入共创聊天框
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-accent-soft hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-12">
          {/* Left: File List + Preview */}
          <div className="flex flex-col border-b border-border p-4 lg:col-span-6 lg:border-b-0 lg:border-r overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary">已选文件（{files.length} 份）</span>
              <span className="text-[11px] text-text-muted">可修改每份文件的角色标签</span>
            </div>

            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className={`cursor-pointer rounded-xl border p-2.5 transition ${
                    selectedFile?.id === f.id
                      ? 'border-accent bg-accent-soft/45'
                      : 'border-border bg-surface-raised hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{f.fileName}</span>
                    <span className="text-[11px] text-text-muted">{f.charCount.toLocaleString()} 字</span>
                    <select
                      value={f.role}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateFileRole(f.id, e.target.value as ImportFileRole)}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-text-primary outline-none"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(f.id)
                      }}
                      className="rounded p-1 text-text-muted hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {f.role === 'custom' && (
                    <input
                      type="text"
                      value={f.customRoleLabel ?? ''}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateCustomLabel(f.id, e.target.value)}
                      placeholder="填写自定义标签（如：反派档案 / 年表）..."
                      className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
                    />
                  )}
                  {f.error && (
                    <div className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                      <AlertCircle className="h-3.5 w-3.5" />
                      解析失败：{f.error}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selectedFile && !selectedFile.error && (
              <div className="mt-4 flex-1 rounded-xl border border-border bg-editor-bg p-3">
                <div className="mb-1.5 text-[11px] font-medium text-text-muted">
                  内容预览：{selectedFile.fileName}
                </div>
                <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap font-serif text-xs leading-relaxed text-text-secondary">
                  {selectedFile.previewText || '（空内容）'}
                </pre>
              </div>
            )}
          </div>

          {/* Right: Mode + Intent + Notes */}
          <div className="flex flex-col space-y-4 overflow-y-auto p-5 lg:col-span-6">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">新作品名称</label>
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">选择创作工作流（对应 Skill）</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'long-novel' as const, label: '长文小说', sub: '小说三件套' },
                  { id: 'short-webnovel' as const, label: '短篇网文', sub: '1-5万字快反' },
                  { id: 'drama-script' as const, label: 'AI 剧本', sub: '短剧/漫剧' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      mode === m.id
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border bg-surface-raised text-text-primary hover:border-accent/40'
                    }`}
                  >
                    <div className="text-xs font-semibold">{m.label}</div>
                    <div className="text-[11px] text-text-muted">{m.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                希望 AI 接下来做什么？（自动预埋对应 Prompt）
              </label>
              <div className="grid grid-cols-2 gap-2">
                {INTENT_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIntent(item.id)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      intent === item.id
                        ? 'border-accent bg-accent-soft/70 text-accent'
                        : 'border-border bg-surface-raised text-text-primary hover:border-accent/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{item.label}</span>
                      {intent === item.id && <Check className="h-3.5 w-3.5" />}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-muted leading-snug">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {intent === 'custom' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-text-secondary">自定义任务描述</label>
                <textarea
                  rows={2}
                  value={customIntentText}
                  onChange={(e) => setCustomIntentText(e.target.value)}
                  placeholder="例如：把这些资料整合为三幕大纲，并保留女主冷面性格..."
                  className="w-full rounded-xl border border-border bg-surface-raised p-2.5 text-xs text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-text-secondary">补充说明（可选，会随预埋指令带入聊天框）</label>
              <textarea
                rows={2}
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="例如：文风偏冷峻写实，先写第一章 3000 字..."
                className="w-full rounded-xl border border-border bg-surface-raised p-2.5 text-xs text-text-primary outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-surface-raised px-6 py-3.5">
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Sparkles className="h-4 w-4 text-accent" />
            <span>进入工作台后，聊天框将自动预填完整 Skill 指令，你可以再微调后发送</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || files.filter((f) => !f.error).length === 0}
              onClick={() => void handleLaunch()}
              className="rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-5 py-2 text-xs font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-50"
            >
              {busy ? '正在装配工作区...' : '导入并进入共创工作台 →'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
