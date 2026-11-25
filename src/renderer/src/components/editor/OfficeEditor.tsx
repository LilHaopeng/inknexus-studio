import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import { marked } from 'marked'
import TurndownService from 'turndown'
import {
  AlignCenter,
  AlignLeft,
  Bold,
  BookOpen,
  Code2,
  Expand,
  Eye,
  EyeOff,
  Highlighter,
  Italic,
  LayoutGrid,
  List,
  Lock,
  Maximize,
  MessageSquarePlus,
  Minimize,
  Redo2,
  Save,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
  SplitSquareHorizontal,
  Target,
  Underline as UnderlineIcon,
  Undo2,
  Unlock,
  Wand2
} from 'lucide-react'
import type { AnnotationCategory, AnnotationThread, DiffProposal } from '@shared/types'
import { mergeHiddenAgentMetadata, splitHiddenAgentMetadata } from '@shared/agent-markup-filter'
import { useStudioStore } from '../../store/useStudioStore'
import { CommentMark } from './CommentMark'
import { DiffReviewOverlay } from './DiffReviewOverlay'
import { StructuredCardView } from './StructuredCardView'

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

interface OfficeEditorProps {
  onSaveFile: () => Promise<void>
  onToggleLock: () => Promise<void>
  onQuickAIAction: (actionLabel: string, selectedText: string) => void
  onCreateAnnotation: (ann: Omit<AnnotationThread, 'id' | 'replies' | 'resolved' | 'createdAt'>) => Promise<void>
  onAcceptProposal: (finalText: string) => Promise<void>
  onRejectProposal: () => void
  onOpenAudition?: () => void
  focusMode: boolean
  onToggleFocusMode: () => void
}

type EditorViewMode = 'book' | 'mobile' | 'cards' | 'source'

export const OfficeEditor: React.FC<OfficeEditorProps> = ({
  onSaveFile,
  onToggleLock,
  onQuickAIAction,
  onCreateAnnotation,
  onAcceptProposal,
  onRejectProposal,
  onOpenAudition,
  focusMode,
  onToggleFocusMode
}) => {
  const {
    openTabs,
    activeTabRelPath,
    setActiveTab,
    closeTab,
    updateTabContent,
    config,
    setConfig,
    pendingProposal,
    activeProject,
    lintReport
  } = useStudioStore()

  const activeTab = openTabs.find((t) => t.relPath === activeTabRelPath)
  const [viewMode, setViewMode] = useState<EditorViewMode>('book')
  const [cleanDisplay, setCleanDisplay] = useState(true)
  const [showGoalPopover, setShowGoalPopover] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [selectionState, setSelectionState] = useState<{ text: string; from: number; to: number; top: number; left: number } | null>(null)
  const [commentDraftOpen, setCommentDraftOpen] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commentCat, setCommentCat] = useState<AnnotationCategory>('style')
  const isSyncingRef = useRef(false)
  const activeTabRelRef = useRef(activeTabRelPath)
  activeTabRelRef.current = activeTabRelPath
  const hiddenHeaderRef = useRef('')
  const cleanDisplayRef = useRef(cleanDisplay)
  cleanDisplayRef.current = cleanDisplay

  const splitInitial = useMemo(() => {
    if (!activeTab) return { hiddenHeader: '', cleanBody: '' }
    return cleanDisplay ? splitHiddenAgentMetadata(activeTab.content || '') : { hiddenHeader: '', cleanBody: activeTab.content || '' }
  }, [activeTab?.content, cleanDisplay])

  hiddenHeaderRef.current = splitInitial.hiddenHeader

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Typography,
      Placeholder.configure({ placeholder: '在此开始撰写正文，或从右侧 AI 共创面板发送预埋指令...' }),
      CommentMark
    ],
    editable: !(activeTab?.locked ?? false),
    content: activeTab ? (marked.parse(splitInitial.cleanBody || '', { async: false }) as string) : '',
    onUpdate: ({ editor: ed }) => {
      const rel = activeTabRelRef.current
      if (isSyncingRef.current || !rel || viewMode === 'source' || viewMode === 'cards') return
      const mdBody = turndown.turndown(ed.getHTML())
      const fullMd = cleanDisplayRef.current
        ? mergeHiddenAgentMetadata(hiddenHeaderRef.current, mdBody)
        : mdBody
      updateTabContent(rel, fullMd)
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      if (to - from < 2) {
        setSelectionState(null)
        return
      }
      const text = ed.state.doc.textBetween(from, to, ' ')
      if (!text.trim()) {
        setSelectionState(null)
        return
      }
      const coords = ed.view.coordsAtPos(from)
      setSelectionState({
        text: text.slice(0, 400),
        from,
        to,
        top: Math.max(70, coords.top - 48),
        left: Math.min(window.innerWidth - 420, Math.max(240, coords.left))
      })
    }
  })

  // Sync active tab content into Tiptap ONLY when switching tab, toggling clean mode, or applying external update
  useEffect(() => {
    if (!editor || !activeTab) return
    isSyncingRef.current = true
    try {
      if (editor.isEditable !== !activeTab.locked) {
        editor.setEditable(!activeTab.locked)
      }
      const { cleanBody } = cleanDisplay
        ? splitHiddenAgentMetadata(activeTab.content || '')
        : { cleanBody: activeTab.content || '' }
      const html = marked.parse(cleanBody || '', { async: false }) as string
      const currentMd = turndown.turndown(editor.getHTML())
      if (currentMd.trim() !== cleanBody.trim()) {
        editor.commands.setContent(html, false)
      }
    } finally {
      isSyncingRef.current = false
    }
  }, [editor, activeTabRelPath, activeTab?.locked, activeTab?.savedContent, cleanDisplay])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void onSaveFile()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowFind((s) => !s)
      } else if (e.key === 'Escape') {
        setSelectionState(null)
        setCommentDraftOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSaveFile])

  const charCount = useMemo(
    () => (activeTab?.content || '').replace(/\s+/g, '').length,
    [activeTab?.content]
  )

  const handleAddCommentSubmit = async () => {
    if (!activeTab || !selectionState || !commentBody.trim()) return
    const id = `ann_${Date.now()}`
    editor?.chain().focus().setCommentMark(id).run()
    await onCreateAnnotation({
      filePath: activeTab.relPath,
      quote: selectionState.text,
      from: selectionState.from,
      to: selectionState.to,
      category: commentCat,
      author: '作者',
      body: commentBody.trim()
    })
    setCommentBody('')
    setCommentDraftOpen(false)
    setSelectionState(null)
  }

  const handleReplaceAll = () => {
    if (!activeTab || !findQuery) return
    const next = activeTab.content.split(findQuery).join(replaceQuery)
    updateTabContent(activeTab.relPath, next)
    if (editor) {
      const html = marked.parse(next, { async: false }) as string
      editor.commands.setContent(html, false)
    }
  }

  if (!activeTab) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-editor-bg p-8 text-center">
        <BookOpen className="mb-3 h-10 w-10 text-accent/60" />
        <h3 className="text-base font-semibold text-text-primary">从左侧「作品资产」选择任意章节或大纲</h3>
        <p className="mt-1 text-xs text-text-muted">支持文档编辑、批注、红绿修订对比、结构化卡片与手机竖屏预览</p>
      </div>
    )
  }

  const isManuscript = config?.editorReadTheme === 'manuscript'

  return (
    <div
      data-editor-paper={isManuscript ? 'manuscript' : 'default'}
      className="relative flex h-full flex-col editor-surface"
    >
      {/* Multi-doc tab bar */}
      <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface/85 px-2">
        {openTabs.map((tab) => {
          const isCurrent = tab.relPath === activeTabRelPath
          return (
            <div
              key={tab.relPath}
              onClick={() => setActiveTab(tab.relPath)}
              className={`group flex h-7 max-w-[190px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs transition ${
                isCurrent
                  ? 'bg-editor-bg font-medium text-accent shadow-sm border border-border'
                  : 'text-text-secondary hover:bg-surface-raised'
              }`}
            >
              {tab.locked && <Lock className="h-3 w-3 shrink-0 text-warning" />}
              <span className="truncate">{tab.name}</span>
              {tab.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="未保存" />}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.relPath)
                }}
                className="ml-0.5 rounded px-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {/* Office-style Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface-raised px-3 py-1.5">
        <button
          type="button"
          title="撤销 (Ctrl+Z)"
          disabled={!editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-text-primary hover:bg-accent-soft/60 disabled:opacity-35"
        >
          <Undo2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">撤销</span>
        </button>
        <button
          type="button"
          title="前进 / 重做 (Ctrl+Y)"
          disabled={!editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-text-primary hover:bg-accent-soft/60 disabled:opacity-35"
        >
          <Redo2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">前进</span>
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        <select
          aria-label="段落层级"
          onChange={(e) => {
            const v = e.target.value
            if (v === 'p') editor?.chain().focus().setParagraph().run()
            else editor?.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run()
          }}
          className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-text-primary outline-none"
        >
          <option value="p">正文</option>
          <option value="1">章标题 H1</option>
          <option value="2">小节 H2</option>
          <option value="3">三级 H3</option>
        </select>

        <select
          aria-label="正文字体"
          value={config?.fontFamily ?? 'serif'}
          onChange={async (e) => {
            const updated = await window.inknexus.config.save({ fontFamily: e.target.value as 'serif' | 'sans' })
            setConfig(updated)
          }}
          className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-text-primary outline-none"
        >
          <option value="serif">思源宋体</option>
          <option value="sans">现代黑体</option>
        </select>

        <select
          aria-label="字号"
          value={config?.fontSize ?? 18}
          onChange={async (e) => {
            const updated = await window.inknexus.config.save({ fontSize: Number(e.target.value) })
            setConfig(updated)
          }}
          className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-text-primary outline-none"
        >
          {[15, 16, 18, 20, 22, 24].map((sz) => (
            <option key={sz} value={sz}>
              {sz}px
            </option>
          ))}
        </select>

        <div className="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          title="加粗"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs ${
            editor?.isActive('bold') ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="斜体"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs ${
            editor?.isActive('italic') ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="下划线"
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs ${
            editor?.isActive('underline') ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="荧光高亮"
          onClick={() => editor?.chain().focus().toggleHighlight({ color: '#efe5ff' }).run()}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs ${
            editor?.isActive('highlight') ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="左对齐"
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="居中"
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="项目列表"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-surface"
        >
          <List className="h-3.5 w-3.5" />
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        <button
          type="button"
          title="划词后添加批注"
          onClick={() => {
            if (!selectionState) return
            setCommentDraftOpen(true)
          }}
          disabled={!selectionState}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-text-primary hover:bg-accent-soft hover:text-accent disabled:opacity-40"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span>批注</span>
        </button>

        <button
          type="button"
          title="查找与替换 (Ctrl+F)"
          onClick={() => setShowFind((s) => !s)}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
            showFind ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          title={activeTab.locked ? '正典已锁定（点击解锁）' : '锁定为正典只读'}
          onClick={() => void onToggleLock()}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs ${
            activeTab.locked ? 'bg-warning-soft text-warning' : 'text-text-secondary hover:bg-surface'
          }`}
        >
          {activeTab.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          <span className="hidden 2xl:inline">{activeTab.locked ? '已锁正典' : '锁正典'}</span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex rounded-lg border border-border bg-surface p-0.5 text-[11px]">
            {[
              { id: 'book' as const, label: '书籍', icon: BookOpen },
              { id: 'mobile' as const, label: '手机', icon: Smartphone },
              { id: 'cards' as const, label: '卡片', icon: LayoutGrid },
              { id: 'source' as const, label: '源码', icon: Code2 }
            ].map((m) => {
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setViewMode(m.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 transition ${
                    viewMode === m.id ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            title={cleanDisplay ? '已自动隐藏 L0/L1/Status 等 Agent 工程标记（点击显示）' : '当前显示全部原始标记（点击隐藏）'}
            onClick={() => setCleanDisplay((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] border ${
              cleanDisplay ? 'border-accent/40 bg-accent-soft/60 text-accent' : 'border-border text-text-secondary'
            }`}
          >
            {cleanDisplay ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            <span>{cleanDisplay ? '纯净' : '原标记'}</span>
          </button>

          {onOpenAudition && (
            <button
              type="button"
              title="同题双模型试写分屏对比"
              onClick={onOpenAudition}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
            >
              <SplitSquareHorizontal className="h-3 w-3" />
              <span className="hidden xl:inline">试写对比</span>
            </button>
          )}

          <button
            type="button"
            title="羊皮纸护眼纸张切换"
            onClick={async () => {
              const updated = await window.inknexus.config.save({
                editorReadTheme: isManuscript ? 'default' : 'manuscript'
              })
              setConfig(updated)
            }}
            className={`rounded-md px-2 py-1 text-[11px] border ${
              isManuscript ? 'border-amber-500/50 bg-amber-500/10 text-amber-700' : 'border-border text-text-secondary'
            }`}
          >
            羊皮纸
          </button>

          <button
            type="button"
            title="保存当前文档 (Ctrl+S)"
            onClick={() => void onSaveFile()}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
          >
            <Save className="h-3.5 w-3.5" />
            <span>保存</span>
          </button>
        </div>
      </div>

      {/* Find & Replace Drawer */}
      {showFind && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 text-xs">
          <input
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            placeholder="查找内容..."
            className="rounded-lg border border-border bg-surface-raised px-2.5 py-1 outline-none focus:border-accent"
          />
          <input
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="替换为..."
            className="rounded-lg border border-border bg-surface-raised px-2.5 py-1 outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={handleReplaceAll}
            className="rounded-lg bg-accent-soft px-3 py-1 font-medium text-accent hover:bg-accent hover:text-on-accent"
          >
            全部替换
          </button>
        </div>
      )}

      {/* Canon Lock Banner */}
      {activeTab.locked && (
        <div className="flex items-center justify-between border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-xs text-warning">
          <span>此文件已启用「正典锁定」只读保护，AI 与手动编辑均需先点击工具栏解锁后修改。</span>
          <button type="button" onClick={() => void onToggleLock()} className="underline font-medium">
            解除锁定
          </button>
        </div>
      )}

      {/* Main Scrollable Canvas */}
      <div className="relative flex-1 overflow-y-auto px-6 py-6">
        {pendingProposal && pendingProposal.filePath === activeTab.relPath && (
          <DiffReviewOverlay
            proposal={pendingProposal as DiffProposal}
            onAcceptAll={() => void onAcceptProposal(pendingProposal.proposedText)}
            onRejectAll={onRejectProposal}
            onApplyPartial={(merged) => void onAcceptProposal(merged)}
          />
        )}

        {viewMode === 'cards' ? (
          <StructuredCardView
            markdown={activeTab.content}
            locked={activeTab.locked}
            onChangeMarkdown={(next) => updateTabContent(activeTab.relPath, next)}
          />
        ) : viewMode === 'source' ? (
          <textarea
            disabled={activeTab.locked}
            value={activeTab.content}
            onChange={(e) => updateTabContent(activeTab.relPath, e.target.value)}
            className="mx-auto block h-full min-h-[600px] w-full max-w-[820px] resize-none rounded-xl border border-border bg-surface-raised p-6 font-mono text-sm leading-relaxed text-text-primary outline-none"
          />
        ) : (
          <div
            className={`mx-auto transition-all ${
              viewMode === 'mobile'
                ? 'max-w-[390px] rounded-[28px] border-4 border-border bg-editor-bg px-5 py-8 shadow-xl'
                : 'max-w-[780px] px-4 py-2'
            }`}
          >
            <div
              className={`ink-prose ${config?.firstLineIndent !== false ? 'indent-2em' : ''} ${
                config?.fontFamily === 'sans' ? 'font-sans' : 'font-serif'
              }`}
              style={{
                fontSize: `${viewMode === 'mobile' ? 16 : config?.fontSize ?? 18}px`,
                lineHeight: config?.lineHeight ?? 1.9
              }}
            >
              <EditorContent editor={editor} />
            </div>
          </div>
        )}
      </div>

      {/* Floating Selection AI Bubble */}
      {selectionState && !commentDraftOpen && (
        <div
          style={{ top: selectionState.top, left: selectionState.left }}
          className="fixed z-40 flex items-center gap-1 rounded-xl border border-border bg-surface-raised/95 p-1 shadow-xl backdrop-blur-md"
        >
          <button
            type="button"
            onClick={() => onQuickAIAction('润色优化选中段落，保持本篇声口', selectionState.text)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-accent-soft hover:text-accent"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            润色
          </button>
          <button
            type="button"
            onClick={() => onQuickAIAction('扩写选中段落的动作与感官细节', selectionState.text)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-accent-soft hover:text-accent"
          >
            <Expand className="h-3.5 w-3.5 text-accent" />
            扩写
          </button>
          <button
            type="button"
            onClick={() => onQuickAIAction('去除 AI 腔、空主语与工业神态套话，强化母语语感', selectionState.text)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-accent-soft hover:text-accent"
          >
            <Wand2 className="h-3.5 w-3.5 text-accent" />
            去 AI 味
          </button>
          <button
            type="button"
            onClick={() => onQuickAIAction('对照世界观与人物状态检查选中段落是否有吃书冲突', selectionState.text)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-accent-soft hover:text-accent"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-warning" />
            查冲突
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => setCommentDraftOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            批注
          </button>
        </div>
      )}

      {/* Inline New Comment Popover */}
      {commentDraftOpen && selectionState && (
        <div
          style={{ top: selectionState.top, left: selectionState.left }}
          className="fixed z-50 w-80 rounded-2xl border border-border bg-surface-raised p-3.5 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-text-primary">
            <span>添加 Office 批注</span>
            <select
              value={commentCat}
              onChange={(e) => setCommentCat(e.target.value as AnnotationCategory)}
              className="rounded border border-border bg-surface px-1.5 py-0.5 text-[11px]"
            >
              <option value="style">文风润色</option>
              <option value="logic">逻辑冲突</option>
              <option value="plot">剧情修改</option>
              <option value="memo">灵感备忘</option>
            </select>
          </div>
          <div className="mb-2 truncate rounded bg-surface px-2 py-1 text-[11px] text-text-muted">
            “{selectionState.text}”
          </div>
          <textarea
            rows={3}
            autoFocus
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="写下你的批注意见（稍后可直接派发给 AI 定点修改）..."
            className="w-full rounded-xl border border-border bg-surface p-2 text-xs text-text-primary outline-none focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setCommentDraftOpen(false)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleAddCommentSubmit()}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-on-accent"
            >
              保存批注
            </button>
          </div>
        </div>
      )}

      {/* Bottom Status Bar */}
      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-surface/90 px-4 text-[11px] text-text-secondary">
        <div className="flex items-center gap-3">
          <span>本章 {charCount.toLocaleString()} 字</span>
          <span>·</span>
          <span>全书 {(activeProject?.wordCount ?? 0).toLocaleString()} 字</span>
          <span>·</span>
          <span className={activeTab.dirty ? 'text-warning font-medium' : 'text-success'}>
            {activeTab.dirty ? '● 有未保存修改' : '✓ 已保存'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowGoalPopover((v) => !v)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent-soft hover:text-accent"
            >
              <Target className="h-3 w-3 text-accent" />
              <span>
                目标 {charCount}/{(config?.wordGoalPerChapter ?? 3000).toLocaleString()}
              </span>
            </button>
            {showGoalPopover && (
              <div className="absolute bottom-7 right-0 z-40 w-56 rounded-xl border border-border bg-surface-raised p-3 shadow-xl">
                <div className="mb-1.5 font-medium text-text-primary">单章目标字数</div>
                <input
                  type="number"
                  min={500}
                  max={20000}
                  step={500}
                  value={config?.wordGoalPerChapter ?? 3000}
                  onChange={async (e) => {
                    const updated = await window.inknexus.config.save({
                      wordGoalPerChapter: Math.max(500, Number(e.target.value) || 3000)
                    })
                    setConfig(updated)
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-2.5 py-1 text-xs outline-none focus:border-accent"
                />
              </div>
            )}
          </div>
          {lintReport && lintReport.status !== 'not-run' && (
            <span
              className={
                lintReport.status === 'pass'
                  ? 'text-success'
                  : lintReport.status === 'warn'
                    ? 'text-warning'
                    : 'text-danger'
              }
            >
              体检：{lintReport.status === 'pass' ? '通过' : `${lintReport.issues.length} 项提示`}
            </span>
          )}
          <button
            type="button"
            onClick={onToggleFocusMode}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent-soft hover:text-accent"
          >
            {focusMode ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
            <span>{focusMode ? '退出专注' : '全屏专注'}</span>
          </button>
        </div>
      </footer>
    </div>
  )
}
