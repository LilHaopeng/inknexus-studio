import React, { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BookCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GitCompare,
  Maximize2,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  Workflow
} from 'lucide-react'
import { toast } from 'sonner'
import type { AnnotationThread, ChatMessage, PermissionMode, ReviewHistoryEntry, ReviewMode } from '@shared/types'
import { stripAgentMarkupForDisplay } from '@shared/agent-markup-filter'
import { useStudioStore } from '../../store/useStudioStore'
import { AgentSelectorBar } from '../ui/AgentSelectorBar'
import { FullBookReviewModal } from '../ui/FullBookReviewModal'
import { ExpandedComposerModal } from '../ui/ExpandedComposerModal'
import { CreateChaptersModal } from '../ui/CreateChaptersModal'

interface AgentChatPanelProps {
  draftPrompt: string
  setDraftPrompt: (v: string) => void
  onSendPrompt: (customText?: string, runReviewPipeline?: boolean, overrideReviewMode?: ReviewMode) => Promise<void>
  onExecutePlanMessage: (msg: ChatMessage) => Promise<void>
  onConfirmReviewModeAsk: (msg: ChatMessage, chosenMode: ReviewMode) => Promise<void>
  onCreateChaptersFromOutline: (params: {
    outlineRelPath: string
    scope: 'count' | 'full'
    chapterCount: number
    extraNote: string
  }) => Promise<void>
  onAbort: () => void
  onApplyTextAsDiff: (text: string, summary: string) => void
  onDispatchAnnotation: (ann: AnnotationThread) => Promise<void>
  onDispatchAllAnnotations: (reviewAfter: boolean) => Promise<void>
  onRunLint: () => Promise<void>
  onRunChapterReview: () => Promise<void>
  onRunFullBookReview: (chosenMode: ReviewMode) => Promise<void>
}

const OUTLINE_PATH_RE = /(^|\/)(大纲\/|00_故事DNA|01_故事架构|00_脑洞与节拍|01_分集卡点|.*细纲|.*总案)/i

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  draftPrompt,
  setDraftPrompt,
  onSendPrompt,
  onExecutePlanMessage,
  onConfirmReviewModeAsk,
  onCreateChaptersFromOutline,
  onAbort,
  onApplyTextAsDiff,
  onDispatchAnnotation,
  onDispatchAllAnnotations,
  onRunLint,
  onRunChapterReview,
  onRunFullBookReview
}) => {
  const {
    activeProject,
    activeTabRelPath,
    preComposedPrompt,
    contextSlices,
    toggleContextSlice,
    chatMessages,
    isGenerating,
    streamingText,
    streamingThinking,
    statusText,
    agentSelection,
    setRoleAgentOverride,
    setAgentSelection,
    reviewMode,
    setReviewMode,
    config,
    setConfig,
    annotations,
    reviewHistory
  } = useStudioStore()

  const [rightTab, setRightTab] = useState<'chat' | 'annotations' | 'lint'>('chat')
  const [taskExpanded, setTaskExpanded] = useState(false)
  const [showThinking, setShowThinking] = useState(false)
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [fullBookModalOpen, setFullBookModalOpen] = useState(false)
  const [expandModalOpen, setExpandModalOpen] = useState(false)
  const [createChaptersOpen, setCreateChaptersOpen] = useState(false)
  const [reviewAfterAnnotation, setReviewAfterAnnotation] = useState(true)
  const [inlineAskMode, setInlineAskMode] = useState<ReviewMode>(reviewMode)

  const totalTokens = contextSlices.filter((s) => s.enabled).reduce((acc, s) => acc + s.tokens, 0)
  const fileAnnotations = annotations.filter((a) => !activeTabRelPath || a.filePath === activeTabRelPath)
  const unresolvedCount = fileAnnotations.filter((a) => !a.resolved).length
  const isOutlineDoc = Boolean(activeTabRelPath && OUTLINE_PATH_RE.test(activeTabRelPath))

  const togglePermission = async () => {
    const next: PermissionMode = config?.permissionMode === 'auto-write' ? 'diff-review' : 'auto-write'
    const updated = await window.inknexus.config.save({ permissionMode: next })
    setConfig(updated)
  }

  const handleResolveAnn = async (annId: string, resolved: boolean) => {
    if (!activeProject) return
    const next = await window.inknexus.annotations.resolve(activeProject.rootPath, annId, resolved)
    useStudioStore.getState().setAnnotations(next)
  }

  const handleDeleteAnn = async (annId: string) => {
    if (!activeProject) return
    const next = await window.inknexus.annotations.delete(activeProject.rootPath, annId)
    useStudioStore.getState().setAnnotations(next)
  }

  const handleReplySubmit = async (annId: string) => {
    if (!activeProject || !replyText.trim()) return
    const next = await window.inknexus.annotations.reply(activeProject.rootPath, annId, {
      id: `rep_${Date.now()}`,
      author: '作者',
      body: replyText.trim(),
      createdAt: Date.now()
    })
    useStudioStore.getState().setAnnotations(next)
    setReplyText('')
    setReplyTargetId(null)
  }

  const triggerChapterReview = async () => {
    setReviewBusy(true)
    try {
      await onRunChapterReview()
      setRightTab('lint')
    } finally {
      setReviewBusy(false)
    }
  }

  const triggerFullBookReview = async (chosenMode: ReviewMode) => {
    setFullBookModalOpen(false)
    setReviewMode(chosenMode, true)
    setReviewBusy(true)
    try {
      await onRunFullBookReview(chosenMode)
      setRightTab('lint')
    } finally {
      setReviewBusy(false)
    }
  }

  const handleApplyReviewToFix = (entry: ReviewHistoryEntry) => {
    const issueLines = entry.issues.map((i, idx) => `${idx + 1}. ${i.message}`).join('\n')
    const fixPrompt = `请对照以下审查报告，对当前章节进行针对性修订（保持原有声口，不破坏已锁定设定）：\n\n【总评】${entry.summary}\n${
      issueLines ? `【待修条目】\n${issueLines}` : ''
    }`
    setRightTab('chat')
    void onSendPrompt(fixPrompt)
  }

  return (
    <aside className="flex h-full flex-col border-l border-border bg-surface/85 backdrop-blur-md">
      {/* Header + 3 Tabs */}
      <div className="border-b border-border px-3.5 pt-3 pb-2">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-text-primary">主控对话</span>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              isGenerating || reviewBusy
                ? 'bg-accent-soft text-accent'
                : 'border border-border bg-surface-raised text-text-secondary'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isGenerating || reviewBusy ? 'animate-pulse bg-accent' : 'bg-success'}`} />
            {reviewBusy ? '审查执行中' : isGenerating ? statusText || '执行中' : '待命中'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-raised p-1 text-xs">
          <button
            type="button"
            onClick={() => setRightTab('chat')}
            className={`rounded-lg py-1 font-medium transition ${
              rightTab === 'chat' ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            对话
          </button>
          <button
            type="button"
            onClick={() => setRightTab('annotations')}
            className={`rounded-lg py-1 font-medium transition ${
              rightTab === 'annotations' ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            批注{' '}
            {unresolvedCount > 0 && (
              <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[10px] text-on-accent">{unresolvedCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setRightTab('lint')}
            className={`rounded-lg py-1 font-medium transition ${
              rightTab === 'lint' ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            审查 {reviewHistory.length > 0 && <span className="ml-0.5 text-[10px] opacity-75">({reviewHistory.length})</span>}
          </button>
        </div>
      </div>

      {rightTab === 'chat' && (
        <>
          {/* Compact collapsible context slices bar */}
          <div className="border-b border-border px-3.5 py-2 text-xs">
            <button
              type="button"
              onClick={() => setTaskExpanded((v) => !v)}
              className="flex w-full items-center justify-between font-medium text-text-primary"
            >
              <span className="truncate">{preComposedPrompt?.taskTitle ?? '当前装载参考切片'}</span>
              <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                <span>~{totalTokens.toLocaleString()} tokens</span>
                {taskExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
            </button>
            {taskExpanded && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {contextSlices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={`${c.reason}（约 ${c.tokens} tokens）`}
                    onClick={() => toggleContextSlice(c.id)}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] transition ${
                      c.enabled
                        ? 'border-accent/40 bg-accent-soft/70 text-accent'
                        : 'border-border bg-surface text-text-muted line-through'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Upper Coordinator Feedback / Questions / Conversation Feed */}
          <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-2xl p-3 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'ml-6 bg-accent text-on-accent'
                    : 'mr-2 border border-border bg-surface-raised text-text-primary shadow-sm'
                }`}
              >
                {msg.thinking && (
                  <details className="mb-2 rounded-lg border border-border/70 bg-surface p-2 text-[11px] text-text-secondary">
                    <summary className="cursor-pointer font-medium">思考过程摘要</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-sans">{msg.thinking}</pre>
                  </details>
                )}
                <div className="whitespace-pre-wrap">
                  {msg.role === 'assistant' ? stripAgentMarkupForDisplay(msg.content) : msg.content}
                </div>

                {msg.kind === 'plan-proposal' && !msg.actionExecuted && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <span className="text-[11px] text-text-muted">确认思路后由主控派发执行</span>
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => void onExecutePlanMessage(msg)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-45"
                    >
                      <Play className="h-3 w-3" />
                      按需执行
                    </button>
                  </div>
                )}

                {msg.kind === 'review-mode-ask' && !msg.actionExecuted && (
                  <div className="mt-2.5 space-y-2 border-t border-border/60 pt-2">
                    <div className="grid grid-cols-3 gap-1">
                      {(['self', 'single', 'advanced'] as ReviewMode[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setInlineAskMode(m)}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                            inlineAskMode === m
                              ? 'border-accent bg-accent text-on-accent'
                              : 'border-border bg-surface text-text-primary hover:border-accent/40'
                          }`}
                        >
                          {m === 'self' ? '自审' : m === 'single' ? '单独审查' : '高级审查'}
                        </button>
                      ))}
                    </div>
                    {inlineAskMode === 'advanced' && (
                      <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/12 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>高级审查：该模式下会消耗大量token额度</span>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={isGenerating}
                      onClick={() => void onConfirmReviewModeAsk(msg, inlineAskMode)}
                      className="w-full rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-45"
                    >
                      确认采用此方式并开始
                    </button>
                  </div>
                )}

                {msg.role === 'assistant' && msg.content.length > 40 && msg.kind !== 'review-mode-ask' && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/60 pt-2">
                    <button
                      type="button"
                      onClick={() => onApplyTextAsDiff(msg.content, '应用 AI 生成内容对比')}
                      className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
                    >
                      <GitCompare className="h-3 w-3" />
                      应用为修订对比
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isGenerating && (
              <div className="mr-2 rounded-2xl border border-accent/40 bg-surface-raised p-3 text-xs shadow-sm">
                {streamingThinking && (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => setShowThinking((s) => !s)}
                      className="text-[11px] font-medium text-accent underline"
                    >
                      {showThinking ? '收起思考过程' : '查看思考过程'}
                    </button>
                    {showThinking && (
                      <pre className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap rounded bg-surface p-2 text-[11px] text-text-secondary">
                        {streamingThinking}
                      </pre>
                    )}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-text-primary">
                  {streamingText || '正在调用主控 Agent 调度中...'}
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions + Composer */}
          <div className="space-y-2 border-t border-border bg-surface-raised/90 p-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => void onSendPrompt('请紧接当前章节末尾与大纲节点，续写下一章完整纯净正文。')}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-text-secondary hover:border-accent/50 hover:text-accent"
              >
                续写下一章
              </button>
              <button
                type="button"
                onClick={() => void onRunLint()}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-text-secondary hover:border-accent/50 hover:text-accent"
              >
                快速体检
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!activeProject) return
                  await window.inknexus.swarm.enqueue({
                    title: activeProject.title,
                    projectRoot: activeProject.rootPath,
                    targetRelPath: activeTabRelPath || '正文/第001章_新稿.md',
                    mode: activeProject.mode,
                    prompt: draftPrompt.trim() || '请按本作大纲与声口卡完成当前章节创作。',
                    reviewMode,
                    writer: agentSelection,
                    reviewer1: reviewMode !== 'self' ? agentSelection : undefined,
                    reviewer2: reviewMode === 'advanced' ? agentSelection : undefined
                  })
                  toast.success(`已将《${activeProject.title}》派发至工作区`)
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft/60 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
              >
                <Workflow className="h-3 w-3" />
                派发至工作区
              </button>
            </div>

            <AgentSelectorBar
              value={agentSelection}
              compact
              onlyReady
              onChange={(nextSel) => {
                setAgentSelection(nextSel)
                if (activeProject) {
                  setRoleAgentOverride(activeProject.rootPath, 'coordinator', nextSel)
                }
              }}
            />

            <div className="relative rounded-xl border border-border bg-surface p-2 focus-within:border-accent">
              <button
                type="button"
                title="放大输入框至屏幕中央"
                onClick={() => setExpandModalOpen(true)}
                className="absolute top-1.5 right-1.5 z-10 rounded-lg border border-border/70 bg-surface-raised/65 p-1 text-text-secondary opacity-70 backdrop-blur-xs transition hover:opacity-100 hover:border-accent/50 hover:text-accent"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>

              <textarea
                rows={3}
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void onSendPrompt()
                  }
                }}
                placeholder="向主控发送指令（Ctrl+Enter 发送）..."
                className="w-full resize-none bg-transparent pr-7 text-xs leading-relaxed text-text-primary outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void togglePermission()}
                  title="安全协作模式：AI 修改先出红绿 Diff；自动写入模式：AI 直接修改并先存快照"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-surface-raised"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  <span>{config?.permissionMode === 'auto-write' ? '自动写入' : '安全 Diff 审阅'}</span>
                </button>

                {isGenerating ? (
                  <button
                    type="button"
                    onClick={onAbort}
                    className="inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-1 text-xs font-medium text-white"
                  >
                    <Square className="h-3 w-3" />
                    停止
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!draftPrompt.trim()}
                      onClick={() => void onSendPrompt(undefined, true)}
                      className="inline-flex items-center gap-1 rounded-lg border border-accent/50 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent hover:text-on-accent disabled:opacity-45"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      发送并审查
                    </button>
                    <button
                      type="button"
                      disabled={!draftPrompt.trim()}
                      onClick={() => void onSendPrompt()}
                      className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-3 py-1 text-xs font-semibold text-white shadow-sm disabled:opacity-45"
                    >
                      <Send className="h-3 w-3" />
                      发送
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {rightTab === 'annotations' && (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">
              当前文档批注（{fileAnnotations.length}）
            </span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto">
            {fileAnnotations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                在中间编辑器选中任意段落，点击「批注」即可添加修改批注。
              </div>
            ) : (
              fileAnnotations.map((ann) => (
                <div
                  key={ann.id}
                  className={`rounded-xl border p-3 text-xs transition ${
                    ann.resolved
                      ? 'border-border/60 bg-surface/50 opacity-65'
                      : 'border-border bg-surface-raised shadow-sm'
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      {ann.category === 'logic'
                        ? '逻辑冲突'
                        : ann.category === 'plot'
                          ? '剧情修改'
                          : ann.category === 'memo'
                            ? '灵感备忘'
                            : '文风润色'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleResolveAnn(ann.id, !ann.resolved)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-surface"
                      >
                        {ann.resolved ? '重开' : '标记已解决'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAnn(ann.id)}
                        className="rounded p-0.5 text-text-muted hover:text-danger"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="mb-1.5 truncate rounded bg-surface px-2 py-1 text-[11px] text-text-muted">
                    “{ann.quote}”
                  </div>
                  <p className="leading-relaxed text-text-primary">{ann.body}</p>

                  {ann.replies.map((rep) => (
                    <div key={rep.id} className="mt-1.5 rounded-lg bg-surface px-2 py-1 text-[11px] text-text-secondary">
                      <span className="font-medium">{rep.author}：</span>
                      {rep.body}
                    </div>
                  ))}

                  {replyTargetId === ann.id ? (
                    <div className="mt-2 flex gap-1">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="回复批注..."
                        className="flex-1 rounded border border-border bg-surface px-2 py-1 text-[11px] outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void handleReplySubmit(ann.id)}
                        className="rounded bg-accent px-2 py-1 text-[11px] text-on-accent"
                      >
                        回复
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
                      <button
                        type="button"
                        onClick={() => setReplyTargetId(ann.id)}
                        className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
                      >
                        <MessageSquare className="h-3 w-3" />
                        回复
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDispatchAnnotation(ann)}
                        className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
                      >
                        <Sparkles className="h-3 w-3" />
                        发给 AI 修改
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Sticky Bottom Actions: Batch Annotation Fix + Outline-to-Prose Trigger */}
          <div className="mt-3 space-y-2.5 border-t border-border pt-3 text-xs">
            {fileAnnotations.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-border bg-surface-raised p-2.5">
                <button
                  type="button"
                  disabled={isGenerating || unresolvedCount === 0}
                  onClick={() => void onDispatchAllAnnotations(reviewAfterAnnotation)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-45"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  按批注进行修改 {unresolvedCount > 0 ? `(${unresolvedCount})` : ''}
                </button>
                <label className="flex cursor-pointer items-center gap-2 px-1 text-[11px] text-text-secondary">
                  <input
                    type="checkbox"
                    checked={reviewAfterAnnotation}
                    onChange={(e) => setReviewAfterAnnotation(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#684BD2]"
                  />
                  <span>完成后进行审查</span>
                </label>
              </div>
            )}

            {isOutlineDoc && (
              <button
                type="button"
                onClick={() => setCreateChaptersOpen(true)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent hover:text-on-accent"
              >
                <BookOpen className="h-3.5 w-3.5" />
                开始创建正文章节
              </button>
            )}
          </div>
        </div>
      )}

      {rightTab === 'lint' && (
        <div className="flex flex-1 flex-col overflow-hidden p-3.5 text-xs">
          <div className="mb-3 space-y-2.5">
            {/* Active Review Mode Strip */}
            <div className="rounded-xl border border-border bg-surface-raised p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-secondary">当前审查方式</span>
                <span className="text-[11px] font-semibold text-accent">
                  {reviewMode === 'self' ? '自审' : reviewMode === 'single' ? '单独审查' : '高级审查'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(['self', 'single', 'advanced'] as ReviewMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setReviewMode(m, true)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                      reviewMode === m
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-border bg-surface text-text-primary hover:border-accent/40'
                    }`}
                  >
                    {m === 'self' ? '自审' : m === 'single' ? '单独审查' : '高级审查'}
                  </button>
                ))}
              </div>
              {reviewMode === 'advanced' && (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/12 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>高级审查：该模式下会消耗大量token额度</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-text-secondary">审查记录</span>
              <button
                type="button"
                onClick={() => void onRunLint()}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2.5 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
              >
                <Play className="h-3 w-3" />
                快速体检
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={reviewBusy || !activeTabRelPath}
                onClick={() => void triggerChapterReview()}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-accent-soft px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent hover:text-on-accent disabled:opacity-45"
              >
                <BookCheck className="h-3.5 w-3.5" />
                审查本章
              </button>
              <button
                type="button"
                disabled={reviewBusy}
                onClick={() => setFullBookModalOpen(true)}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm disabled:opacity-45"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reviewBusy ? 'animate-spin' : ''}`} />
                再次运行全文审查
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto">
            {reviewHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-text-muted">
                暂无审查记录
              </div>
            ) : (
              reviewHistory.map((entry) => (
                <div key={entry.id} className="space-y-2 rounded-xl border border-border bg-surface-raised p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {entry.verdict === 'PASS' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                      )}
                      <span className="truncate font-semibold text-text-primary">{entry.targetLabel}</span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        entry.verdict === 'PASS'
                          ? 'bg-success-soft text-success'
                          : entry.verdict === 'WARN'
                            ? 'bg-warning-soft text-warning'
                            : 'bg-danger-soft text-danger'
                      }`}
                    >
                      {entry.verdict === 'PASS' ? '通过' : entry.verdict === 'WARN' ? '提醒' : '建议修订'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    <span>·</span>
                    <span>
                      {entry.scope === 'full-book' ? '全文审查' : entry.scope === 'chapter' ? '本章审查' : '快速体检'}
                    </span>
                    {entry.reviewerNames.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{entry.reviewerNames.join(' / ')}</span>
                      </>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed text-text-primary">
                    {stripAgentMarkupForDisplay(entry.summary)}
                  </p>

                  {entry.issues.length > 0 && (
                    <ul className="space-y-1 rounded-lg bg-surface p-2">
                      {entry.issues.map((iss, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[11px] text-text-secondary">
                          <span
                            className={`mt-0.5 shrink-0 rounded px-1 py-0.2 text-[9px] font-semibold ${
                              iss.severity === 'error'
                                ? 'bg-danger-soft text-danger'
                                : iss.severity === 'warn'
                                  ? 'bg-warning-soft text-warning'
                                  : 'bg-accent-soft text-accent'
                            }`}
                          >
                            {iss.severity === 'error' ? '问题' : iss.severity === 'warn' ? '提醒' : '建议'}
                          </span>
                          <span>{stripAgentMarkupForDisplay(iss.message)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {entry.issues.length > 0 && (
                    <div className="flex justify-end pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleApplyReviewToFix(entry)}
                        className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
                      >
                        <Wand2 className="h-3 w-3" />
                        按此报告交 AI 修订
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <FullBookReviewModal
        open={fullBookModalOpen}
        initialMode={reviewMode}
        busy={reviewBusy}
        onCancel={() => setFullBookModalOpen(false)}
        onConfirm={triggerFullBookReview}
      />

      <ExpandedComposerModal
        open={expandModalOpen}
        value={draftPrompt}
        onChange={setDraftPrompt}
        onClose={() => setExpandModalOpen(false)}
        onSend={async (withReview) => {
          await onSendPrompt(undefined, Boolean(withReview))
        }}
      />

      <CreateChaptersModal
        open={createChaptersOpen}
        outlineRelPath={activeTabRelPath || ''}
        onClose={() => setCreateChaptersOpen(false)}
        onConfirm={async (params) => {
          await onCreateChaptersFromOutline({
            outlineRelPath: activeTabRelPath || '',
            ...params
          })
        }}
      />
    </aside>
  )
}
