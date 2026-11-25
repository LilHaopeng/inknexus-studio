import React, { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  FilePlus2,
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

interface AssetCategoryPanelProps {
  assets: AssetNode[]
  activeTabRelPath: string | null
  onOpenFile: (relPath: string, displayName: string) => Promise<void>
  onOpenCompleteModal: (category: AssetCategoryKey) => void
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
  onOpenNewFileModal,
  onOpenStoryBoard
}) => {
  const [selectedCategory, setSelectedCategory] = useState<AssetCategoryKey | null>(null)

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
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(cat.key)}
                      className="rounded-lg p-1 text-text-muted hover:text-accent"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
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
              return (
                <button
                  key={doc.relPath}
                  type="button"
                  onClick={() => void onOpenFile(doc.relPath, doc.displayName)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition ${
                    isActive
                      ? 'bg-accent-soft font-semibold text-accent'
                      : 'text-text-primary hover:bg-surface-raised'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{doc.displayName}</span>
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
    </section>
  )
}
