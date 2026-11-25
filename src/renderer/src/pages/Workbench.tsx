import React, { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  Lock,
  RefreshCw,
  Search,
  Users
} from 'lucide-react'
import { toast } from 'sonner'
import type { AnnotationThread, AssetNode, ChatMessage, DiffProposal, ReviewMode, StreamChunkEvent } from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'
import { OfficeEditor } from '../components/editor/OfficeEditor'
import { AgentChatPanel } from '../components/chat/AgentChatPanel'
import { VersionDrawer } from '../components/editor/VersionDrawer'
import { ExportModal } from '../components/editor/ExportModal'
import { AuditionModal } from '../components/editor/AuditionModal'
import { StoryBoardModal } from '../components/editor/StoryBoardModal'

interface WorkbenchProps {
  versionDrawerOpen: boolean
  setVersionDrawerOpen: (v: boolean) => void
  exportModalOpen: boolean
  setExportModalOpen: (v: boolean) => void
}

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
    setChatMessages,
    appendChatMessage,
    setStreamingState,
    activeRequestId,
    agentSelection,
    config,
    setLintReport,
    setReviewHistory,
    externalChangedRelPath,
    setExternalChangedRelPath
  } = useStudioStore()

  const [assetFilter, setAssetFilter] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({
    正文: true,
    大纲: true,
    设定: true,
    剧本: true
  })
  const [draftPrompt, setDraftPrompt] = useState('')
  const [focusMode, setFocusMode] = useState(false)
  const [newFileModal, setNewFileModal] = useState(false)
  const [newFileRelPath, setNewFileRelPath] = useState('正文/第002章_新章.md')
  const [auditionOpen, setAuditionOpen] = useState(false)
  const [storyBoardOpen, setStoryBoardOpen] = useState(false)

  // Populate composer with pre-composed prompt when arriving from HomeHub
  useEffect(() => {
    if (preComposedPrompt?.userDraftPrompt) {
      setDraftPrompt(preComposedPrompt.userDraftPrompt)
    }
  }, [preComposedPrompt])

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
        const msg: ChatMessage = {
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: ev.fullText,
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
        }
      } else if (ev.type === 'error') {
        toast.error(`Agent 执行失败：${ev.message}`)
        setStreamingState({
          isGenerating: false,
          activeRequestId: null,
          statusText: ''
        })
      }
    })
    return unsub
  }, [appendChatMessage, setPendingProposal, setStreamingState])

  const openFile = async (relPath: string, name?: string) => {
    if (!activeProject) return
    try {
      const { content } = await window.inknexus.projects.readFile(activeProject.rootPath, relPath)
      const locked = canonLocks.includes(relPath)
      openOrFocusTab({
        relPath,
        name: name || relPath.split('/').pop() || relPath,
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

  const handleSendPrompt = async (customText?: string, runReviewPipeline = false) => {
    if (!activeProject) return
    const textToSend = (customText ?? draftPrompt).trim()
    if (!textToSend) return

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now()
    }
    appendChatMessage(userMsg)
    if (!customText) setDraftPrompt('')

    const enabledContextNote = contextSlices
      .filter((s) => s.enabled)
      .map((s) => `- ${s.label} (${s.relPath})`)
      .join('\n')

    const sysPrompt = [
      preComposedPrompt?.systemPrompt ??
        `你是墨枢 InkNexus Studio 内的专业中文小说/剧本写作 Agent，当前作品《${activeProject.title}》（${activeProject.mode}）。`,
      enabledContextNote ? `\n当前已装载上下文清单（可通过工具按需读取）：\n${enabledContextNote}` : ''
    ].join('\n')

    const reqId = `req_${Date.now()}`
    setStreamingState({
      isGenerating: true,
      activeRequestId: reqId,
      streamingText: '',
      streamingThinking: '',
      statusText: '准备上下文...'
    })

    try {
      await window.inknexus.chat.send({
        requestId: reqId,
        selection: agentSelection,
        systemPrompt: sysPrompt,
        userPrompt: textToSend,
        projectRoot: activeProject.rootPath,
        targetRelPath: activeTabRelPath ?? undefined,
        permissionMode: config?.permissionMode ?? 'diff-review',
        reviewMode: useStudioStore.getState().reviewMode,
        runReviewPipeline,
        mode: activeProject.mode,
        title: activeProject.title
      })
    } catch (err) {
      setStreamingState({ isGenerating: false, activeRequestId: null })
      toast.error(err instanceof Error ? err.message : String(err))
    }
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

  const handleDispatchAllAnnotations = async () => {
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
    await handleSendPrompt(composed.userDraftPrompt)
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
    toast.info(`已发起「审查本章」（模式：${mode === 'self' ? '自审' : mode === 'single' ? '单独审查' : '高级审查'}）...`)
    try {
      const history = await window.inknexus.reviews.runChapter({
        projectRoot: activeProject.rootPath,
        relPath: activeTabRelPath,
        mode: activeProject.mode,
        title: activeProject.title,
        reviewMode: mode,
        selection: agentSelection
      })
      setReviewHistory(history)
      toast.success('本章审查完成，报告已归档至审校面板')
    } catch (err) {
      toast.error(`审查本章失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleRunFullBookReview = async (chosenMode?: ReviewMode) => {
    if (!activeProject) return
    const mode = chosenMode ?? useStudioStore.getState().reviewMode
    const modeLabel = mode === 'self' ? '自审' : mode === 'single' ? '单独审查' : '高级审查'
    toast.info(`正在执行「全文审查」（${modeLabel}）《${activeProject.title}》...`)
    try {
      const history = await window.inknexus.reviews.runFullBook({
        projectRoot: activeProject.rootPath,
        mode: activeProject.mode,
        title: activeProject.title,
        reviewMode: mode,
        selection: agentSelection
      })
      setReviewHistory(history)
      toast.success('全文审查完成，最新报告已置顶显示')
    } catch (err) {
      toast.error(`全文审查失败：${err instanceof Error ? err.message : String(err)}`)
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

  const renderTree = (nodes: AssetNode[], depth = 0) =>
    nodes
      .filter((n) => !assetFilter || n.name.toLowerCase().includes(assetFilter.toLowerCase()) || n.isDirectory)
      .map((node) => {
        if (node.isDirectory) {
          const open = expandedDirs[node.relPath] ?? depth === 0
          return (
            <div key={node.id}>
              <button
                type="button"
                onClick={() => setExpandedDirs((d) => ({ ...d, [node.relPath]: !open }))}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary"
              >
                {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-accent" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-accent" />}
                <span className="truncate">{node.name}</span>
              </button>
              {open && node.children && <div>{renderTree(node.children, depth + 1)}</div>}
            </div>
          )
        }

        const isActive = node.relPath === activeTabRelPath
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => void openFile(node.relPath, node.name)}
            style={{ paddingLeft: `${depth * 12 + 22}px` }}
            className={`group flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-xs transition ${
              isActive
                ? 'bg-accent-soft font-semibold text-accent'
                : 'text-text-primary hover:bg-surface-raised'
            }`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-75" />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            {node.locked && <Lock className="h-3 w-3 shrink-0 text-warning" />}
          </button>
        )
      })

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
            <Panel defaultSize={19} minSize={14} maxSize={28}>
              <aside className="flex h-full flex-col border-r border-border bg-surface/80 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span className="text-xs font-semibold text-text-primary">作品资产</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="人物状态与伏笔看板"
                      onClick={() => setStoryBoardOpen(true)}
                      className="rounded-lg p-1 text-text-secondary hover:bg-accent-soft hover:text-accent"
                    >
                      <Users className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="新建章节或设定文件"
                      onClick={() => setNewFileModal(true)}
                      className="rounded-lg p-1 text-text-secondary hover:bg-accent-soft hover:text-accent"
                    >
                      <FilePlus2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="p-2.5">
                  <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-2.5 py-1.5 text-xs">
                    <Search className="h-3.5 w-3.5 text-text-muted" />
                    <input
                      type="text"
                      value={assetFilter}
                      onChange={(e) => setAssetFilter(e.target.value)}
                      placeholder="筛选章节或设定..."
                      className="w-full bg-transparent text-text-primary outline-none"
                    />
                  </div>
                </div>

                <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">{renderTree(assets)}</div>
              </aside>
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-transparent transition hover:bg-accent/30" />
          </>
        )}

        <Panel defaultSize={focusMode ? 100 : 51} minSize={35}>
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
            <Panel defaultSize={30} minSize={22} maxSize={42}>
              <AgentChatPanel
                draftPrompt={draftPrompt}
                setDraftPrompt={setDraftPrompt}
                onSendPrompt={handleSendPrompt}
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
