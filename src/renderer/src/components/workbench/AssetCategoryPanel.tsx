import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FilePlus2,
  Files,
  Globe2,
  ListTree,
  Lock,
  Sparkles,
  Users
} from 'lucide-react'
import type { AssetNode } from '@shared/types'

export type AssetCategoryKey = 'world' | 'outline' | 'prose'

interface FlatDocItem {
  relPath: string
  displayName: string
  categoryKey: AssetCategoryKey
  locked: boolean
  wordCount: number
}

interface ContextMenuState {
  x: number
  y: number
  kind: AssetCategoryKey
  relPath?: string
  label: string
}

interface AssetCategoryPanelProps {
  assets: AssetNode[]
  activeTabRelPath: string | null
  onOpenFile: (relPath: string, displayName: string) => Promise<void>
  onOpenCompleteModal: (category: AssetCategoryKey) => void
  onCreateOutlineFromWorld: (worldRelPath?: string) => void
  onCreateProseFromOutline: (outlineRelPath?: string) => void
  onExportAssets: (params: {
    category: AssetCategoryKey
    relPaths: string[]
    mergeMode: 'merged' | 'separate'
  }) => Promise<void>
  onOpenNewFileModal: () => void
  onOpenStoryBoard: () => void
}

const HIDDEN_REL_RE =
  /(^|\/)(追踪|交付|版本)\/|(工作状态|写作状态|角色状态|章节交接|伏笔|因果依赖|台账|轻量状态|readme)/i

function flattenUserAssets(nodes: AssetNode[]): FlatDocItem[] {
  const out: FlatDocItem[] = []
  const walk = (list: AssetNode[]) => {
    for (const n of list) {
      if (n.isDirectory) {
        if (n.children) walk(n.children)
        continue
      }
      if (HIDDEN_REL_RE.test(n.relPath)) continue
      let categoryKey: AssetCategoryKey = 'world'
      if (n.category === 'outline') categoryKey = 'outline'
      else if (n.category === 'prose') categoryKey = 'prose'
      else if (n.category === 'tracking' || n.category === 'delivery') continue

      const displayName = n.name.replace(/\.(md|txt|docx|pdf)$/i, '')
      out.push({
        relPath: n.relPath,
        displayName,
        categoryKey,
        locked: Boolean(n.locked),
        wordCount: n.wordCount ?? 0
      })
    }
  }
  walk(nodes)
  return out
}

const CATEGORY_META: Array<{
  key: AssetCategoryKey
  label: string
  icon: React.FC<{ className?: string }>
}> = [
  { key: 'world', label: '世界观', icon: Globe2 },
  { key: 'outline', label: '大纲', icon: ListTree },
  { key: 'prose', label: '正文', icon: BookOpen }
]

export const AssetCategoryPanel: React.FC<AssetCategoryPanelProps> = ({
  assets,
  activeTabRelPath,
  onOpenFile,
  onOpenCompleteModal,
  onCreateOutlineFromWorld,
  onCreateProseFromOutline,
  onExportAssets,
  onOpenNewFileModal,
  onOpenStoryBoard
}) => {
  const [selectedCategory, setSelectedCategory] = useState<AssetCategoryKey | null>(null)
  const [selectedProsePaths, setSelectedProsePaths] = useState<string[]>([])
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [ctxMenu])

  useEffect(() => {
    if (selectedCategory !== 'prose') {
      setSelectedProsePaths([])
    }
  }, [selectedCategory])

  const grouped = useMemo(() => {
    const flat = flattenUserAssets(assets)
    return {
      world: flat.filter((d) => d.categoryKey === 'world'),
      outline: flat.filter((d) => d.categoryKey === 'outline'),
      prose: flat.filter((d) => d.categoryKey === 'prose')
    }
  }, [assets])

  const activeMeta = CATEGORY_META.find((m) => m.key === selectedCategory) ?? null
  const activeDocs = selectedCategory ? grouped[selectedCategory] : []

  const openContext = (e: React.MouseEvent, kind: AssetCategoryKey, label: string, relPath?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: Math.min(e.clientX, window.innerWidth - 230),
      y: Math.min(e.clientY, window.innerHeight - 150),
      kind,
      relPath,
      label
    })
  }

  const handleDocClick = (e: React.MouseEvent, doc: FlatDocItem) => {
    if (doc.categoryKey === 'prose' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setSelectedProsePaths((prev) =>
        prev.includes(doc.relPath) ? prev.filter((p) => p !== doc.relPath) : [...prev, doc.relPath]
      )
      return
    }
    if (doc.categoryKey === 'prose' && selectedProsePaths.length > 0) {
      setSelectedProsePaths([])
    }
    void onOpenFile(doc.relPath, doc.displayName)
  }

  return (
    <section className="flex h-full flex-col overflow-hidden bg-surface/80 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        {activeMeta ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs text-text-secondary hover:bg-accent-soft hover:text-accent"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回
            </button>
            <span className="truncate text-xs font-semibold text-text-primary">{activeMeta.label}</span>
          </div>
        ) : (
          <span className="text-xs font-semibold text-text-primary">作品资产</span>
        )}

        <div className="flex items-center gap-1">
          {activeMeta && activeDocs.length > 0 && (
            <button
              type="button"
              title={`将所有「${activeMeta.label}」排成完整读者 Docx`}
              onClick={() =>
                void onExportAssets({
                  category: activeMeta.key,
                  relPaths: activeDocs.map((d) => d.relPath),
                  mergeMode: 'merged'
                })
              }
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
            >
              <Download className="h-3 w-3" />
              导出
            </button>
          )}
          {activeMeta && (
            <button
              type="button"
              onClick={() => onOpenCompleteModal(activeMeta.key)}
              className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
            >
              <Sparkles className="h-3 w-3" />
              补全
            </button>
          )}
          <button
            type="button"
            title="人物与伏笔参考"
            onClick={onOpenStoryBoard}
            className="rounded-lg p-1 text-text-secondary hover:bg-accent-soft hover:text-accent"
          >
            <Users className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="新建文档"
            onClick={onOpenNewFileModal}
            className="rounded-lg p-1 text-text-secondary hover:bg-accent-soft hover:text-accent"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Multi-select action bar when viewing 正文 */}
      {selectedCategory === 'prose' && activeDocs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border/60 bg-surface-raised/70 px-2.5 py-1.5 text-[10px]">
          {selectedProsePaths.length > 0 ? (
            <>
              <span className="font-semibold text-accent">已选 {selectedProsePaths.length} 章</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    void onExportAssets({
                      category: 'prose',
                      relPaths: selectedProsePaths,
                      mergeMode: 'merged'
                    })
                  }
                  className="rounded-md bg-accent px-2 py-0.5 font-medium text-on-accent hover:bg-accent-hover"
                >
                  合并导出
                </button>
                {selectedProsePaths.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      void onExportAssets({
                        category: 'prose',
                        relPaths: selectedProsePaths,
                        mergeMode: 'separate'
                      })
                    }
                    className="rounded-md border border-accent/45 bg-accent-soft px-2 py-0.5 font-medium text-accent hover:bg-accent hover:text-on-accent"
                  >
                    分章导出
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProsePaths([])}
                  className="rounded-md border border-border px-1.5 py-0.5 text-text-muted hover:text-text-primary"
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <span className="text-text-muted">按住 Ctrl + 点击可多选章节导出（支持合并或分章）</span>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2.5">
        {!activeMeta ? (
          <div className="space-y-2">
            {CATEGORY_META.map((cat) => {
              const Icon = cat.icon
              const list = grouped[cat.key]
              const isEmpty = list.length === 0
              return (
                <div
                  key={cat.key}
                  data-testid={`asset-category-${cat.key}`}
                  onContextMenu={(e) => openContext(e, cat.key, cat.label)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-raised/85 px-3 py-2.5 transition hover:border-accent/45"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-text-primary">{cat.label}</div>
                      <div className="text-[10px] text-text-muted">
                        {isEmpty ? '空' : `${list.length} 份文档`}
                      </div>
                    </div>
                  </button>

                  {isEmpty ? (
                    <button
                      type="button"
                      onClick={() => onOpenCompleteModal(cat.key)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
                    >
                      <Sparkles className="h-3 w-3" />
                      补全
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={`导出完整${cat.label} (.docx)`}
                        onClick={() =>
                          void onExportAssets({
                            category: cat.key,
                            relPaths: list.map((d) => d.relPath),
                            mergeMode: 'merged'
                          })
                        }
                        className="rounded-lg p-1 text-text-muted hover:bg-accent-soft hover:text-accent"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(cat.key)}
                        className="rounded-lg p-1 text-text-muted hover:text-accent"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : activeDocs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border p-4 text-center">
            <div className="text-xs font-semibold text-text-secondary">空</div>
            <p className="mt-1 text-[11px] text-text-muted">当前分类暂无「{activeMeta.label}」文档</p>
            <button
              type="button"
              onClick={() => onOpenCompleteModal(activeMeta.key)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-95"
            >
              <Sparkles className="h-3.5 w-3.5" />
              召唤 Agent 补全{activeMeta.label}
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {activeDocs.map((doc) => {
              const isActive = doc.relPath === activeTabRelPath
              const isMultiSelected = doc.categoryKey === 'prose' && selectedProsePaths.includes(doc.relPath)
              return (
                <button
                  key={doc.relPath}
                  type="button"
                  onContextMenu={(e) => openContext(e, doc.categoryKey, doc.displayName, doc.relPath)}
                  onClick={(e) => handleDocClick(e, doc)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition ${
                    isMultiSelected
                      ? 'border-accent bg-accent-soft/85 font-semibold text-accent'
                      : isActive
                        ? 'border-transparent bg-accent-soft font-semibold text-accent'
                        : 'border-transparent text-text-primary hover:bg-surface-raised'
                  }`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                    {isMultiSelected && <Check className="h-3 w-3 shrink-0 text-accent" />}
                    <span className="truncate">{doc.displayName}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-muted">
                    {doc.wordCount > 0 && <span>{doc.wordCount}字</span>}
                    {doc.locked && <Lock className="h-3 w-3 text-warning" />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {ctxMenu &&
        createPortal(
          <div
            data-testid="asset-context-menu"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={(e) => e.stopPropagation()}
            className="no-drag fixed z-[90] min-w-[205px] rounded-xl border border-border bg-surface-raised p-1.5 shadow-2xl backdrop-blur-md"
          >
            {ctxMenu.kind === 'world' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const target = ctxMenu.relPath
                    setCtxMenu(null)
                    onCreateOutlineFromWorld(target)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                >
                  <ListTree className="h-3.5 w-3.5 text-accent" />
                  <span>基于世界观创建大纲</span>
                </button>
                {grouped.world.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const paths = ctxMenu.relPath ? [ctxMenu.relPath] : grouped.world.map((d) => d.relPath)
                      setCtxMenu(null)
                      void onExportAssets({ category: 'world', relPaths: paths, mergeMode: 'merged' })
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                  >
                    <Download className="h-3.5 w-3.5 text-accent" />
                    <span>{ctxMenu.relPath ? '导出此世界观 (.docx)' : '导出完整世界观 (.docx)'}</span>
                  </button>
                )}
              </>
            )}

            {ctxMenu.kind === 'outline' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const target = ctxMenu.relPath
                    setCtxMenu(null)
                    onCreateProseFromOutline(target)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                >
                  <BookOpen className="h-3.5 w-3.5 text-accent" />
                  <span>基于大纲创建正文</span>
                </button>
                {grouped.outline.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const paths = ctxMenu.relPath ? [ctxMenu.relPath] : grouped.outline.map((d) => d.relPath)
                      setCtxMenu(null)
                      void onExportAssets({ category: 'outline', relPaths: paths, mergeMode: 'merged' })
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                  >
                    <Download className="h-3.5 w-3.5 text-accent" />
                    <span>{ctxMenu.relPath ? '导出此大纲 (.docx)' : '导出完整大纲 (.docx)'}</span>
                  </button>
                )}
              </>
            )}

            {ctxMenu.kind === 'prose' && grouped.prose.length > 0 && (
              <>
                {selectedProsePaths.length > 1 && ctxMenu.relPath ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const paths = selectedProsePaths.includes(ctxMenu.relPath!)
                          ? selectedProsePaths
                          : [...selectedProsePaths, ctxMenu.relPath!]
                        setCtxMenu(null)
                        void onExportAssets({ category: 'prose', relPaths: paths, mergeMode: 'merged' })
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                    >
                      <Download className="h-3.5 w-3.5 text-accent" />
                      <span>合并导出已选 {selectedProsePaths.length} 章 (.docx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const paths = selectedProsePaths.includes(ctxMenu.relPath!)
                          ? selectedProsePaths
                          : [...selectedProsePaths, ctxMenu.relPath!]
                        setCtxMenu(null)
                        void onExportAssets({ category: 'prose', relPaths: paths, mergeMode: 'separate' })
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                    >
                      <Files className="h-3.5 w-3.5 text-accent" />
                      <span>分章导出（每章独立 .docx）</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const paths = ctxMenu.relPath ? [ctxMenu.relPath] : grouped.prose.map((d) => d.relPath)
                      setCtxMenu(null)
                      void onExportAssets({ category: 'prose', relPaths: paths, mergeMode: 'merged' })
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-primary transition hover:bg-accent-soft hover:text-accent"
                  >
                    <Download className="h-3.5 w-3.5 text-accent" />
                    <span>{ctxMenu.relPath ? '导出本章 (.docx)' : '合并导出全部正文 (.docx)'}</span>
                  </button>
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </section>
  )
}
