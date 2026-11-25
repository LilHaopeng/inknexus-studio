import React, { useEffect, useState } from 'react'
import { Bookmark, Users, X } from 'lucide-react'
import { stripAgentMarkupForDisplay } from '@shared/agent-markup-filter'
import { useStudioStore } from '../../store/useStudioStore'

interface StoryBoardModalProps {
  open: boolean
  onClose: () => void
}

export const StoryBoardModal: React.FC<StoryBoardModalProps> = ({ open, onClose }) => {
  const { activeProject } = useStudioStore()
  const [charsText, setCharsText] = useState('')
  const [foreshadowText, setForeshadowText] = useState('')

  useEffect(() => {
    if (!open || !activeProject) return
    const load = async () => {
      const charCandidates =
        activeProject.mode === 'drama-script'
          ? ['00_季播总案与资产表.md']
          : activeProject.mode === 'short-webnovel'
            ? ['00_脑洞与节拍.md', '01_轻量状态.md']
            : ['追踪/角色状态.md']
      for (const rel of charCandidates) {
        try {
          const r = await window.inknexus.projects.readFile(activeProject.rootPath, rel)
          setCharsText(stripAgentMarkupForDisplay(r.content))
          break
        } catch {
          // try next
        }
      }
      const fsCandidates =
        activeProject.mode === 'short-webnovel' ? ['01_轻量状态.md'] : ['追踪/伏笔.md', '追踪/因果依赖.md']
      for (const rel of fsCandidates) {
        try {
          const r = await window.inknexus.projects.readFile(activeProject.rootPath, rel)
          setForeshadowText(stripAgentMarkupForDisplay(r.content))
          break
        } catch {
          // try next
        }
      }
    }
    void load()
  }, [open, activeProject])

  if (!open || !activeProject) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 className="text-base font-semibold text-text-primary">《{activeProject.title}》人物与伏笔状态看板</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-surface-raised">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2 text-xs">
          <div className="glass-card p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Users className="h-4 w-4" />
              <span>人物状态与核心资产</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans leading-relaxed text-text-secondary">
              {charsText || '暂无角色状态台账，可在工作台点击「提取状态台账」自动生成。'}
            </pre>
          </div>
          <div className="glass-card p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-accent">
              <Bookmark className="h-4 w-4" />
              <span>伏笔与因果线索</span>
            </div>
            <pre className="whitespace-pre-wrap font-sans leading-relaxed text-text-secondary">
              {foreshadowText || '暂无伏笔台账记录。'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
