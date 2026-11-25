import React, { useEffect, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type {
  AnnotationThread,
  ChatMessage,
  DiffProposal,
  ImportedFileItem,
  ReviewMode,
  StreamChunkEvent
} from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'
import { OfficeEditor } from '../components/editor/OfficeEditor'
import { AgentChatPanel } from '../components/chat/AgentChatPanel'
import { VersionDrawer } from '../components/editor/VersionDrawer'
import { ExportModal } from '../components/editor/ExportModal'
import { AuditionModal } from '../components/editor/AuditionModal'
import { StoryBoardModal } from '../components/editor/StoryBoardModal'
import { AssetCategoryPanel, type AssetCategoryKey } from '../components/workbench/AssetCategoryPanel'
import { AssetCompleteModal } from '../components/workbench/AssetCompleteModal'
import { AgentCommsBoard } from '../components/workbench/AgentCommsBoard'

interface WorkbenchProps {
  versionDrawerOpen: boolean
  setVersionDrawerOpen: (v: boolean) => void
  exportModalOpen: boolean
  setExportModalOpen: (v: boolean) => void
}

const PROSE_INTENT_RE = /正文|续写|章节|开篇|撰写|改写|批注|创作/i

export const Workbench: React.FC<WorkbenchProps> = ({
  versionDrawerOpen,
  setVersionDrawerOpen,
  exportModalOpen,
  setExportModalOpen
}) => {
  const {
    activeProject,
    assets,
    setAssets,
    canonLocks,
    setCanonLocks,
    openTabs,
    activeTabRelPath,
    openOrFocusTab,
    updateTabContent,
    setAnnotations,
    annotations,
    setPendingProposal,
    contextSlices,
    setContextSlices,
    preComposedPrompt,
    setPreComposedPrompt,
    appendChatMessage,
    updateChatMessage,
    setStreamingState,
    activeRequestId,
    agentSelection,
    ensureRoleAgentSnapshot,
    appendAgentComm,
    setActiveWork,
    setReviewMode,
    config,
    setLintReport,
    setReviewHistory,
    externalChangedRelPath,
    setExternalChangedRelPath
  } = useStudioStore()

  const [draftPrompt, setDraftPrompt] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [newFileModal, setNewFileModal] = useState(false)
  const [newFileRelPath, setNewFileRelPath] = useState('正文/第002章_新章.md')
  const [auditionOpen, setAuditionOpen] = useState(false)
  const [storyBoardOpen, setStoryBoardOpen] = useState(false)
  const [completeModalCat, setCompleteModalCat] = useState<AssetCategoryKey | null>(null)
  const autoPlanTriggeredFor = useRef<string>('')

  // Populate composer or trigger Coordinator initial planning when arriving from HomeHub
  useEffect(() => {
    if (!activeProject || !preComposedPrompt) return
    if (preComposedPrompt.autoPlanOnEnter && autoPlanTriggeredFor.current !== activeProject.rootPath) {
      autoPlanTriggeredFor.current = activeProject.rootPath
      const planTaskTitle = preComposedPrompt.taskTitle || '立项创意构思'
      const rawDraft = preComposedPrompt.userDraftPrompt
      setPreComposedPrompt({ ...preComposedPrompt, autoPlanOnEnter: false })
      void triggerCoordinatorPlan(planTaskTitle, rawDraft)
    } else if (preComposedPrompt.userDraftPrompt && !preComposedPrompt.autoPlanOnEnter) {
      setDraftPrompt(preComposedPrompt.userDraftPrompt)
    }
  }, [activeProject, preComposedPrompt])

  // Subscribe to streaming chat chunks
  useEffect(() => {
    const unsub = window.inknexus.chat.onStream((ev: StreamChunkEvent) => {
      const state = useStudioStore.getState()
      if (ev.requestId !== state.activeRequestId) return
      if (ev.type === 'status') {
        setStreamingState({ statusText: ev.status })
      } else if (ev.type === 'thinking_delta') {
        setStreamingState({ streamingThinking: state.streamingThinking + ev.delta })
      } else if (ev.type === 'text_delta') {
        setStreamingState({ streamingText: state.streamingText + ev.delta })
      } else if (ev.type === 'diff_proposal') {
        setPendingProposal(ev.proposal)
      } else if (ev.type === 'done') {
        const isPlan = ev.requestId.startsWith('plan_')
        const msg: ChatMessage = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: ev.fullText,
          kind: isPlan ? 'plan-proposal' : 'text',
          ...(isPlan
            ? {
                planPayload: {
                  taskTitle: state.preComposedPrompt?.taskTitle || '按当前思路执行创作',
                  executePrompt: `请严格按照上述已讨论的基础创作思路与执行步骤开始创作第一阶段核心内容（先输出大纲/正文核心内容）：\n\n${ev.fullText.slice(0, 1800)}`
                }
              }
            : {}),
          thinking: ev.thinkingText || undefined,
          timestamp: Date.now()
        }
        appendChatMessage(msg)
        setStreamingState({
          isGenerating: false,
          activeRequestId: null,
          streamingText: '',
          streamingThinking: '',
          statusText: ''
        })
        if (state.activeProject) {
          void window.inknexus.chat.saveHistory(state.activeProject.rootPath, useStudioStore.getState().chatMessages)
          setActiveWork({
            projectId: state.activeProject.id,
            projectRoot: state.activeProject.rootPath,
            title: state.activeProject.title,
            stage: 'idle',
            statusLabel: '待命中',
            activeRole: 'coordinator',
            updatedAt: Date.now()
          })
          appendAgentComm({
            projectRoot: state.activeProject.rootPath,
            fromRole: isPlan ? 'coordinator' : 'writer',
            toRole: 'user',
            modelLabel: state.agentSelection.model,
            content: isPlan ? '已向你提交基础创作思路，请确认后点击「按需执行」。' : '本轮生成任务已完成，成果已呈递审阅。'
          })
        }
      } else if (ev.type === 'error') {
        toast.error(`Agent 执行失败：${ev.message}`)
        setStreamingState({
          isGenerating: false,
          activeRequestId: null,
          statusText: ''
        })
        if (state.activeProject) {
          setActiveWork({
            projectId: state.activeProject.id,
            projectRoot: state.activeProject.rootPath,
            title: state.activeProject.title,
            stage: 'idle',
            statusLabel: '执行中断',
            activeRole: 'coordinator',
            updatedAt: Date.now()
          })
        }
      }
    })
    return unsub
  }, [appendAgentComm, appendChatMessage, setActiveWork, setPendingProposal, setStreamingState])

  const openFile = async (relPath: string, name?: string) => {
    if (!activeProject) return
    try {
      const { content } = await window.inknexus.projects.readFile(activeProject.rootPath, relPath)
      const locked = canonLocks.includes(relPath)
      openOrFocusTab({
        relPath,
        name: name || relPath.split('/').pop()?.replace(/\.(md|txt)$/i, '') || relPath,
        content,
        savedContent: content,
        dirty: false,
        locked
      })
      const slices = await window.inknexus.prompt.assembleContext(activeProject.rootPath, relPath, activeProject.mode)
      setContextSlices(slices)
    } catch (err) {
      toast.error(`打开文件失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSaveCurrent = async () => {
    if (!activeProject || !activeTabRelPath) return
    const tab = openTabs.find((t) => t.relPath === activeTabRelPath)
    if (!tab) return
    try {
      await window.inknexus.projects.writeFile(activeProject.rootPath, tab.relPath, tab.content, true)
      updateTabContent(tab.relPath, tab.content, true)
      toast.success(`已保存 ${tab.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleToggleLock = async () => {
    if (!activeProject || !activeTabRelPath) return
    const currentlyLocked = canonLocks.includes(activeTabRelPath)
    const nextLocks = await window.inknexus.canon.set(activeProject.rootPath, activeTabRelPath, !currentlyLocked)
    setCanonLocks(nextLocks)
    const tab = openTabs.find((t) => t.relPath === activeTabRelPath)
    if (tab) {
      openOrFocusTab({ ...tab, locked: !currentlyLocked })
    }
    toast.success(!currentlyLocked ? '已锁定为正典只读' : '已解除正典锁定')
  }

  const triggerCoordinatorPlan = async (taskTitle: string, basePrompt: string) => {
    if (!activeProject) return
    const coordinatorSel = ensureRoleAgentSnapshot(activeProject.rootPath, 'coordinator')
    appendAgentComm({
      projectRoot: activeProject.rootPath,
      fromRole: 'user',
      toRole: 'coordinator',
      modelLabel: coordinatorSel.model,
      content: `立项请求（${taskTitle}）：请先给出基础创作思路与执行方案。`
    })
    setActiveWork({
      projectId: activeProject.id,
      projectRoot: activeProject.rootPath,
      title: activeProject.title,
      stage: 'planning',
      statusLabel: '主控构思中',
      activeRole: 'coordinator',
      updatedAt: Date.now()
    })

    const reqId = `plan_${Date.now()}`
    setStreamingState({
      isGenerating: true,
      activeRequestId: reqId,
      streamingText: '',
      streamingThinking: '',
      statusText: '主控拟定创作思路中...'
    })

    try {
      await window.inknexus.chat.send({
        requestId: reqId,
        selection: coordinatorSel,
        systemPrompt: `${preComposedPrompt?.systemPrompt ?? ''}\n\n你是本作《${activeProject.title}》的主控 Agent。现在不要直接铺写完整章节，请先给出清晰、可执行的基础创作思路（核心卖点、人物定位、世界/冲突结构、以及建议的 3 步执行计划），方便用户确认后点击「按需执行」或向你补充调整要求。`,
        userPrompt: basePrompt || `请针对作品《${activeProject.title}》（${activeProject.mode}）拟定初步创作思路与推进计划。`,
        projectRoot: activeProject.rootPath,
        permissionMode: 'diff-review',
        runReviewPipeline: false,
        mode: activeProject.mode,
        title: activeProject.title
      })
    } catch (err) {
      setStreamingState({ isGenerating: false, activeRequestId: null })
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSendPrompt = async (
    customText?: string,
    runReviewPipeline = false,
    overrideReviewMode?: ReviewMode
  ) => {
    if (!activeProject) return
    const textToSend = (customText ?? draftPrompt).trim()
    if (!textToSend) return

    const state = useStudioStore.getState()
    const isProseTask =
      PROSE_INTENT_RE.test(textToSend) ||
      Boolean(activeTabRelPath && /^(正文|剧本)\//.test(activeTabRelPath))

    // Item 8: When writing prose and user hasn't explicitly chosen a review mode yet,
    // coordinator asks user in chat before calling writer/reviewers (unless running explicit review)
    if (isProseTask && !runReviewPipeline && !overrideReviewMode && !state.reviewModeConfirmed) {
      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: textToSend,
        timestamp: Date.now()
      }
      appendChatMessage(userMsg)
      if (!customText) setDraftPrompt('')

      const askMsg: ChatMessage = {
        id: `ask_rev_${Date.now()}`,
        role: 'assistant',
        kind: 'review-mode-ask',
        content: '在开始撰写正文前，请确认你希望采用的审查机制，随后我将按该模式调度作者与审查协同完成：',
        reviewAskPayload: {
          pendingPrompt: textToSend,
          targetRelPath: activeTabRelPath ?? undefined
        },
        timestamp: Date.now()
      }
      appendChatMessage(askMsg)
      appendAgentComm({
        projectRoot: activeProject.rootPath,
        fromRole: 'coordinator',
        toRole: 'user',
        content: '已向用户确认本次正文写作的审查机制。'
      })
      void window.inknexus.chat.saveHistory(activeProject.rootPath, useStudioStore.getState().chatMessages)
      return
    }

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now()
    }
    appendChatMessage(userMsg)
    if (!customText) setDraftPrompt('')

    const effectiveSelection = isProseTask
      ? ensureRoleAgentSnapshot(activeProject.rootPath, 'writer')
      : ensureRoleAgentSnapshot(activeProject.rootPath, 'coordinator')

    const activeRole = isProseTask ? 'writer' : 'coordinator'
    const chosenReviewMode = overrideReviewMode ?? state.reviewMode

    appendAgentComm({
      projectRoot: activeProject.rootPath,
      fromRole: 'coordinator',
      toRole: activeRole,
      modelLabel: effectiveSelection.model,
      content: textToSend.slice(0, 180) + (textToSend.length > 180 ? '...' : '')
    })

    setActiveWork({
      projectId: activeProject.id,
      projectRoot: activeProject.rootPath,
      title: activeProject.title,
      stage: runReviewPipeline ? 'reviewing' : isProseTask ? 'writing' : 'planning',
      statusLabel: runReviewPipeline ? '写作与审查中' : isProseTask ? '写作中' : '主控调度中',
      activeRole,
      updatedAt: Date.now()
    })

    const enabledContextNote = contextSlices
      .filter((s) => s.enabled)
      .map((s) => `- ${s.label} (${s.relPath})`)
      .join('\n')

    const sysPrompt = [
      preComposedPrompt?.systemPrompt ??
        `你是墨枢 InkNexus Studio 内的专业中文小说/剧本创作 Agent，当前作品《${activeProject.title}》（${activeProject.mode}）。`,
      isProseTask ? '除非用户另行指定，整部作品坚持单作者连贯执笔，确保叙事声口统一。' : '',
      enabledContextNote ? `\n当前已装载上下文清单（可通过工具按需读取）：\n${enabledContextNote}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const reqId = `req_${Date.now()}`
    setStreamingState({
      isGenerating: true,
      activeRequestId: reqId,
      streamingText: '',
      streamingThinking: '',
      statusText: isProseTask ? '作者执笔中...' : '主控处理中...'
    })

    try {
      await window.inknexus.chat.send({
        requestId: reqId,
        selection: effectiveSelection,
        systemPrompt: sysPrompt,
        userPrompt: textToSend,
        projectRoot: activeProject.rootPath,
        targetRelPath: activeTabRelPath ?? undefined,
        permissionMode: config?.permissionMode ?? 'diff-review',
        reviewMode: chosenReviewMode,
        runReviewPipeline,
        mode: activeProject.mode,
        title: activeProject.title
      })
    } catch (err) {
      setStreamingState({ isGenerating: false, activeRequestId: null })
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleExecutePlanMessage = async (msg: ChatMessage) => {
    if (!activeProject || !msg.planPayload) return
    updateChatMessage(msg.id, { actionExecuted: true })
    await handleSendPrompt(msg.planPayload.executePrompt, false)
  }

  const handleConfirmReviewModeAsk = async (msg: ChatMessage, chosenMode: ReviewMode) => {
    if (!activeProject || !msg.reviewAskPayload) return
    setReviewMode(chosenMode, true)
    updateChatMessage(msg.id, { actionExecuted: true })
    appendAgentComm({
      projectRoot: activeProject.rootPath,
      fromRole: 'user',
      toRole: 'coordinator',
      content: `已确认审查方式：${chosenMode === 'self' ? '自审' : chosenMode === 'single' ? '单独审查' : '高级审查'}`
    })
    await handleSendPrompt(msg.reviewAskPayload.pendingPrompt, true, chosenMode)
  }

  const handleCreateChaptersFromOutline = async (params: {
    outlineRelPath: string
    scope: 'count' | 'full'
    chapterCount: number
    extraNote: string
  }) => {
    if (!activeProject) return
    const outlineTitle = params.outlineRelPath.split('/').pop()?.replace(/\.(md|txt)$/i, '') || '大纲'
    const goalDesc =
      params.scope === 'full'
        ? `严格依据大纲《${outlineTitle}》撰写全本连续正文章节（使用单一作者保持文风统一）`
        : `严格依据大纲《${outlineTitle}》顺序撰写接下来的 ${params.chapterCount} 个正文章节（使用单一作者保持文风统一）`
    const fullPrompt = `${goalDesc}。\n${params.extraNote ? `补充要求：${params.extraNote}` : ''}`
    await handleSendPrompt(fullPrompt, useStudioStore.getState().reviewModeConfirmed)
  }

  const handleCompleteAsset = async (params: {
    category: AssetCategoryKey
    userIdeas: string
    files: ImportedFileItem[]
  }) => {
    if (!activeProject) return
    const catLabel = params.category === 'world' ? '世界观' : params.category === 'outline' ? '大纲' : '正文'
    const refSnippet = params.files
      .map((f) => `【参考资料：${f.fileName}】\n${f.markdownContent.slice(0, 2000)}`)
      .join('\n\n')
    const prompt = [
      `请补全作品《${activeProject.title}》的「${catLabel}」部分，遵循本项目对应的创作 Skill 规范输出可直接落盘的正典文档内容。`,
      params.userIdeas.trim() ? `【用户想法与补充信息】\n${params.userIdeas.trim()}` : '',
      refSnippet
    ]
      .filter(Boolean)
      .join('\n\n')

    setActiveWork({
      projectId: activeProject.id,
      projectRoot: activeProject.rootPath,
      title: activeProject.title,
      stage: 'completing',
      statusLabel: `补全${catLabel}中`,
      activeRole: 'coordinator',
      updatedAt: Date.now()
    })
    await handleSendPrompt(prompt, false)
  }

  const handleQuickAIAction = (actionLabel: string, selectedText: string) => {
    const prompt = `请针对当前文档 \`${activeTabRelPath}\` 中的以下选中片段执行「${actionLabel}」：\n\n${selectedText}`
    void handleSendPrompt(prompt)
  }

  const handleCreateAnnotation = async (ann: Omit<AnnotationThread, 'id' | 'replies' | 'resolved' | 'createdAt'>) => {
    if (!activeProject) return
    const thread: AnnotationThread = {
      ...ann,
      id: `ann_${Date.now()}`,
      replies: [],
      resolved: false,
      createdAt: Date.now()
    }
    const next = await window.inknexus.annotations.upsert(activeProject.rootPath, thread)
    setAnnotations(next)
    toast.success('批注已保存至 AppData')
  }

  const handleDispatchAnnotation = async (ann: AnnotationThread) => {
    if (!activeProject || !activeTabRelPath) return
    const tab = openTabs.find((t) => t.relPath === activeTabRelPath)
    if (!tab) return
    const composed = await window.inknexus.prompt.composeAnnotation({
      mode: activeProject.mode,
      filePath: tab.relPath,
      chapterText: tab.content,
      annotations: [ann]
    })
    await handleSendPrompt(composed.userDraftPrompt)
  }

  const handleDispatchAllAnnotations = async (reviewAfter: boolean) => {
    if (!activeProject || !activeTabRelPath) return
    const tab = openTabs.find((t) => t.relPath === activeTabRelPath)
    const pending = annotations.filter((a) => a.filePath === activeTabRelPath && !a.resolved)
    if (!tab || pending.length === 0) return
    const composed = await window.inknexus.prompt.composeAnnotation({
      mode: activeProject.mode,
      filePath: tab.relPath,
      chapterText: tab.content,
      annotations: pending
    })
    appendAgentComm({
      projectRoot: activeProject.rootPath,
      fromRole: 'coordinator',
      toRole: 'writer',
      content: `按 ${pending.length} 条批注修改《${tab.name}》${reviewAfter ? '，修改完成后按所选模式复审' : ''}`
    })
    await handleSendPrompt(composed.userDraftPrompt, reviewAfter, reviewAfter ? useStudioStore.getState().reviewMode : undefined)
  }

  const handleApplyTextAsDiff = (proposedText: string, summary: string) => {
    const tab = openTabs.find((t) => t.relPath === activeTabRelPath)
    if (!tab) return
    const proposal: DiffProposal = {
      id: `diff_${Date.now()}`,
      filePath: tab.relPath,
      originalText: tab.content,
      proposedText,
      summary,
      status: 'pending',
      createdAt: Date.now()
    }
    setPendingProposal(proposal)
  }

  const handleAcceptProposal = async (finalText: string) => {
    if (!activeProject || !activeTabRelPath) return
    const tab = openTabs.find((t) => t.relPath === activeTabRelPath)
    if (!tab) return
    await window.inknexus.snapshots.create(
      activeProject.rootPath,
      tab.relPath,
      tab.content,
      'ai-before-apply',
      '采纳 AI 修订对比前自动快照'
    )
    await window.inknexus.projects.writeFile(activeProject.rootPath, tab.relPath, finalText, false)
    updateTabContent(tab.relPath, finalText, true)
    setPendingProposal(null)
    toast.success('已应用修订并自动存档前版快照')
  }

  const handleRunLint = async () => {
    if (!activeProject || !activeTabRelPath) return
    const report = await window.inknexus.python.lint(activeProject.rootPath, activeTabRelPath, activeProject.mode)
    setLintReport(report)
    const history = await window.inknexus.reviews.list(activeProject.rootPath)
    setReviewHistory(history)
    toast.info(`体检完成：${report.status}`)
  }

  const handleRunChapterReview = async () => {
    if (!activeProject || !activeTabRelPath) {
      toast.info('请先在左侧选择要审查的章节文件')
      return
    }
    const mode = useStudioStore.getState().reviewMode
    const revSel = ensureRoleAgentSnapshot(activeProject.rootPath, 'reviewer1')
    setActiveWork({
      projectId: activeProject.id,
      projectRoot: activeProject.rootPath,
      title: activeProject.title,
      stage: 'reviewing',
      statusLabel: '审查本章中',
      activeRole: 'reviewer1',
      updatedAt: Date.now()
    })
    appendAgentComm({
      projectRoot: activeProject.rootPath,
      fromRole: 'coordinator',
      toRole: 'reviewer1',
      modelLabel: revSel.model,
      content: `派发「审查本章」任务（${activeTabRelPath} · ${mode}）`
    })
    try {
      const history = await window.inknexus.reviews.runChapter({
        projectRoot: activeProject.rootPath,
        relPath: activeTabRelPath,
        mode: activeProject.mode,
        title: activeProject.title,
        reviewMode: mode,
        selection: revSel
      })
      setReviewHistory(history)
      toast.success('本章审查完成，报告已归档至审查面板')
    } catch (err) {
      toast.error(`审查本章失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setActiveWork({
        projectId: activeProject.id,
        projectRoot: activeProject.rootPath,
        title: activeProject.title,
        stage: 'idle',
        statusLabel: '待命中',
        activeRole: 'coordinator',
        updatedAt: Date.now()
      })
    }
  }

  const handleRunFullBookReview = async (chosenMode?: ReviewMode) => {
    if (!activeProject) return
    const mode = chosenMode ?? useStudioStore.getState().reviewMode
    const revSel = ensureRoleAgentSnapshot(activeProject.rootPath, 'reviewer1')
    setActiveWork({
      projectId: activeProject.id,
      projectRoot: activeProject.rootPath,
      title: activeProject.title,
      stage: 'reviewing',
      statusLabel: '全文审查中',
      activeRole: 'reviewer1',
      updatedAt: Date.now()
    })
    appendAgentComm({
      projectRoot: activeProject.rootPath,
      fromRole: 'coordinator',
      toRole: 'reviewer1',
      modelLabel: revSel.model,
      content: `派发「全文审查」任务（${mode}）`
    })
    try {
      const history = await window.inknexus.reviews.runFullBook({
        projectRoot: activeProject.rootPath,
        mode: activeProject.mode,
        title: activeProject.title,
        reviewMode: mode,
        selection: revSel
      })
      setReviewHistory(history)
      toast.success('全文审查完成，最新报告已置顶显示')
    } catch (err) {
      toast.error(`全文审查失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setActiveWork({
        projectId: activeProject.id,
        projectRoot: activeProject.rootPath,
        title: activeProject.title,
        stage: 'idle',
        statusLabel: '待命中',
        activeRole: 'coordinator',
        updatedAt: Date.now()
      })
    }
  }

  const handleCreateNewFile = async () => {
    if (!activeProject || !newFileRelPath.trim()) return
    try {
      await window.inknexus.projects.createFile(activeProject.rootPath, newFileRelPath.trim(), `# ${newFileRelPath.trim()}\n\n`)
      const refreshed = await window.inknexus.projects.assets(activeProject.rootPath)
      setAssets(refreshed)
      setNewFileModal(false)
      await openFile(newFileRelPath.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-muted">
        请先从「创作大厅」或「我的作品」打开一部作品。
      </div>
    )
  }

  return (
    <div className="relative z-10 h-full overflow-hidden">
      {externalChangedRelPath && (
        <div className="flex items-center justify-between border-b border-accent/30 bg-accent-soft px-4 py-1.5 text-xs text-accent">
          <span>检测到外部工具修改了文件：{externalChangedRelPath}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void openFile(externalChangedRelPath)
                setExternalChangedRelPath(null)
              }}
              className="inline-flex items-center gap-1 font-semibold underline"
            >
              <RefreshCw className="h-3 w-3" /> 重新加载
            </button>
            <button type="button" onClick={() => setExternalChangedRelPath(null)}>
              忽略
            </button>
          </div>
        </div>
      )}

      <PanelGroup direction="horizontal" className="h-full">
        {!focusMode && (
          <>
            <Panel defaultSize={21} minSize={15} maxSize={30}>
              <aside className="flex h-full flex-col border-r border-border">
                <PanelGroup direction="vertical" className="h-full">
                  <Panel defaultSize={44} minSize={24}>
                    <AssetCategoryPanel
                      assets={assets}
                      activeTabRelPath={activeTabRelPath}
                      onOpenFile={openFile}
                      onOpenCompleteModal={(cat) => setCompleteModalCat(cat)}
                      onOpenNewFileModal={() => setNewFileModal(true)}
                      onOpenStoryBoard={() => setStoryBoardOpen(true)}
                    />
                  </Panel>
                  <PanelResizeHandle className="h-1.5 bg-border/35 transition hover:bg-accent/40" />
                  <Panel defaultSize={56} minSize={28}>
                    <AgentCommsBoard />
                  </Panel>
                </PanelGroup>
              </aside>
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-transparent transition hover:bg-accent/30" />
          </>
        )}

        <Panel defaultSize={focusMode ? 100 : 49} minSize={35}>
          <OfficeEditor
            onSaveFile={handleSaveCurrent}
            onToggleLock={handleToggleLock}
            onQuickAIAction={handleQuickAIAction}
            onCreateAnnotation={handleCreateAnnotation}
            onAcceptProposal={handleAcceptProposal}
            onRejectProposal={() => setPendingProposal(null)}
            onOpenAudition={() => setAuditionOpen(true)}
            focusMode={focusMode}
            onToggleFocusMode={() => setFocusMode((f) => !f)}
          />
        </Panel>

        {!focusMode && (
          <>
            <PanelResizeHandle className="w-1.5 bg-transparent transition hover:bg-accent/30" />
            <Panel defaultSize={30} minSize={24} maxSize={42}>
              <AgentChatPanel
                draftPrompt={draftPrompt}
                setDraftPrompt={setDraftPrompt}
                onSendPrompt={handleSendPrompt}
                onExecutePlanMessage={handleExecutePlanMessage}
                onConfirmReviewModeAsk={handleConfirmReviewModeAsk}
                onCreateChaptersFromOutline={handleCreateChaptersFromOutline}
                onAbort={() => activeRequestId && void window.inknexus.chat.abort(activeRequestId)}
                onApplyTextAsDiff={handleApplyTextAsDiff}
                onDispatchAnnotation={handleDispatchAnnotation}
                onDispatchAllAnnotations={handleDispatchAllAnnotations}
                onRunLint={handleRunLint}
                onRunChapterReview={handleRunChapterReview}
                onRunFullBookReview={handleRunFullBookReview}
              />
            </Panel>
          </>
        )}
      </PanelGroup>

      {newFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text-primary">新建文件</h3>
            <input
              type="text"
              value={newFileRelPath}
              onChange={(e) => setNewFileRelPath(e.target.value)}
              className="mt-3 w-full rounded-xl border border-border bg-surface-raised px-3 py-2 text-xs text-text-primary outline-none focus:border-accent"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFileModal(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreateNewFile()}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      <AssetCompleteModal
        open={completeModalCat !== null}
        category={completeModalCat ?? 'world'}
        onClose={() => setCompleteModalCat(null)}
        onSubmit={handleCompleteAsset}
      />

      <VersionDrawer
        open={versionDrawerOpen}
        onClose={() => setVersionDrawerOpen(false)}
        onRestored={(restored) => {
          if (activeTabRelPath) {
            updateTabContent(activeTabRelPath, restored, true)
            toast.success('已从快照恢复（恢复前已自动备份当前版本）')
          }
        }}
      />

      <ExportModal open={exportModalOpen} onClose={() => setExportModalOpen(false)} />
      <AuditionModal
        open={auditionOpen}
        onClose={() => setAuditionOpen(false)}
        onAdoptText={(text, label) => {
          handleApplyTextAsDiff(text, `采纳双模试写对比方案：${label}`)
          setAuditionOpen(false)
        }}
      />
      <StoryBoardModal open={storyBoardOpen} onClose={() => setStoryBoardOpen(false)} />
    </div>
  )
}
