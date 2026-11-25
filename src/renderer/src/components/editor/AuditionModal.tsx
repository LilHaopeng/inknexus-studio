import React, { useEffect, useState } from 'react'
import { Check, Play, SplitSquareHorizontal, X } from 'lucide-react'
import type { AgentSelection, StreamChunkEvent } from '@shared/types'
import { stripAgentMarkupForDisplay } from '@shared/agent-markup-filter'
import { useStudioStore } from '../../store/useStudioStore'
import { AgentSelectorBar } from '../ui/AgentSelectorBar'

interface AuditionModalProps {
  open: boolean
  onClose: () => void
  onAdoptText: (text: string, label: string) => void
}

export const AuditionModal: React.FC<AuditionModalProps> = ({ open, onClose, onAdoptText }) => {
  const { activeProject, activeTabRelPath, agentSelection } = useStudioStore()
  const [leftSel, setLeftSel] = useState<AgentSelection>(agentSelection)
  const [rightSel, setRightSel] = useState<AgentSelection>(agentSelection)
  const [prompt, setPrompt] = useState('请试写当前场景开篇 500 字，重点展示人物声口与第一句抓人钩子。')
  const [leftText, setLeftText] = useState('')
  const [rightText, setRightText] = useState('')
  const [running, setRunning] = useState(false)
  const [reqIds, setReqIds] = useState<{ left: string; right: string } | null>(null)

  useEffect(() => {
    if (!reqIds) return
    return window.inknexus.chat.onStream((ev: StreamChunkEvent) => {
      if (ev.requestId === reqIds.left) {
        if (ev.type === 'text_delta') setLeftText((t) => t + ev.delta)
      } else if (ev.requestId === reqIds.right) {
        if (ev.type === 'text_delta') setRightText((t) => t + ev.delta)
      }
    })
  }, [reqIds])

  if (!open || !activeProject) return null

  const runBoth = async () => {
    setLeftText('')
    setRightText('')
    setRunning(true)
    const leftId = `aud_L_${Date.now()}`
    const rightId = `aud_R_${Date.now()}`
    setReqIds({ left: leftId, right: rightId })

    const sys = `你是小说《${activeProject.title}》的试写助手，输出纯净正文，不要输出任何工程标记。`
    try {
      await Promise.allSettled([
        window.inknexus.chat.send({
          requestId: leftId,
          selection: leftSel,
          systemPrompt: sys,
          userPrompt: prompt,
          projectRoot: activeProject.rootPath,
          targetRelPath: activeTabRelPath ?? undefined,
          permissionMode: 'diff-review'
        }),
        window.inknexus.chat.send({
          requestId: rightId,
          selection: rightSel,
          systemPrompt: sys,
          userPrompt: prompt,
          projectRoot: activeProject.rootPath,
          targetRelPath: activeTabRelPath ?? undefined,
          permissionMode: 'diff-review'
        })
      ])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal className="h-4 w-4 text-accent" />
            <h3 className="text-base font-semibold text-text-primary">双模型同题试写对比竞技场</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-text-muted hover:bg-surface-raised">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border bg-surface-raised p-4 space-y-2.5 text-xs">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={running}
              onClick={() => void runBoth()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              {running ? '并发试写中...' : '同时发给双模型试写'}
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-border overflow-hidden">
          <div className="flex flex-col p-4 overflow-hidden">
            <div className="mb-2">
              <div className="mb-1 text-xs font-semibold text-accent">方案 A 选手</div>
              <AgentSelectorBar value={leftSel} onChange={setLeftSel} compact />
            </div>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-editor-bg p-4 font-serif text-sm leading-relaxed text-text-primary">
              {stripAgentMarkupForDisplay(leftText) || '等待生成...'}
            </div>
            <button
              type="button"
              disabled={!leftText.trim()}
              onClick={() => {
                onAdoptText(stripAgentMarkupForDisplay(leftText), `采纳方案 A（${leftSel.model}）`)
                onClose()
              }}
              className="mt-2 inline-flex items-center justify-center gap-1 rounded-xl bg-accent-soft py-2 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              采纳方案 A 为修订对比
            </button>
          </div>

          <div className="flex flex-col p-4 overflow-hidden">
            <div className="mb-2">
              <div className="mb-1 text-xs font-semibold text-accent">方案 B 选手</div>
              <AgentSelectorBar value={rightSel} onChange={setRightSel} compact />
            </div>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-editor-bg p-4 font-serif text-sm leading-relaxed text-text-primary">
              {stripAgentMarkupForDisplay(rightText) || '等待生成...'}
            </div>
            <button
              type="button"
              disabled={!rightText.trim()}
              onClick={() => {
                onAdoptText(stripAgentMarkupForDisplay(rightText), `采纳方案 B（${rightSel.model}）`)
                onClose()
              }}
              className="mt-2 inline-flex items-center justify-center gap-1 rounded-xl bg-accent-soft py-2 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />
              采纳方案 B 为修订对比
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
