import React, { useMemo } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus } from 'lucide-react'

interface StructuredCardViewProps {
  markdown: string
  locked: boolean
  onChangeMarkdown: (next: string) => void
}

interface CardSection {
  id: string
  heading: string
  level: number
  body: string
}

function parseSections(md: string): { preamble: string; sections: CardSection[] } {
  const lines = md.split(/\r?\n/)
  const preambleLines: string[] = []
  const sections: CardSection[] = []
  let current: CardSection | null = null

  lines.forEach((line, idx) => {
    const m = line.match(/^(#{1,3})\s+(.*)$/)
    if (m) {
      if (current) sections.push(current)
      current = {
        id: `sec_${idx}`,
        heading: m[2],
        level: m[1].length,
        body: ''
      }
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line
    } else {
      preambleLines.push(line)
    }
  })
  if (current) sections.push(current)

  return { preamble: preambleLines.join('\n').trim(), sections }
}

function serializeSections(preamble: string, sections: CardSection[]): string {
  const parts: string[] = []
  if (preamble.trim()) parts.push(preamble.trim())
  for (const s of sections) {
    parts.push(`${'#'.repeat(s.level)} ${s.heading}\n${s.body.trimEnd()}`)
  }
  return parts.join('\n\n') + '\n'
}

export const StructuredCardView: React.FC<StructuredCardViewProps> = ({
  markdown,
  locked,
  onChangeMarkdown
}) => {
  const { preamble, sections } = useMemo(() => parseSections(markdown), [markdown])

  const updateSection = (id: string, patch: Partial<CardSection>) => {
    if (locked) return
    const next = sections.map((s) => (s.id === id ? { ...s, ...patch } : s))
    onChangeMarkdown(serializeSections(preamble, next))
  }

  const moveSection = (index: number, delta: -1 | 1) => {
    if (locked) return
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChangeMarkdown(serializeSections(preamble, next))
  }

  const addSection = () => {
    if (locked) return
    const next = [
      ...sections,
      { id: `sec_${Date.now()}`, heading: '新卡片章节 / 设定条目', level: 2, body: '- 关键要点：' }
    ]
    onChangeMarkdown(serializeSections(preamble, next))
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-3 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">结构化卡片视图（双向同步 Markdown）</h3>
          <p className="text-xs text-text-muted">适合非专业用户像填表一样修改大纲、世界观与分集卡点，支持上下排序</p>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={addSection}
            className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-on-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            添加卡片
          </button>
        )}
      </div>

      {sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-text-muted">
          当前文档还没有 `#` / `##` 标题分节，可点击右上角「添加卡片」或切回文档模式撰写。
        </div>
      ) : (
        sections.map((sec, idx) => (
          <div key={sec.id} className="glass-card p-4 transition hover:border-accent/40">
            <div className="mb-2 flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-text-muted" />
              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                H{sec.level}
              </span>
              <input
                type="text"
                disabled={locked}
                value={sec.heading}
                onChange={(e) => updateSection(sec.id, { heading: e.target.value })}
                className="flex-1 bg-transparent text-sm font-semibold text-text-primary outline-none focus:text-accent"
              />
              {!locked && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="上移卡片"
                    disabled={idx === 0}
                    onClick={() => moveSection(idx, -1)}
                    className="rounded p-1 text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="下移卡片"
                    disabled={idx === sections.length - 1}
                    onClick={() => moveSection(idx, 1)}
                    className="rounded p-1 text-text-muted hover:bg-surface hover:text-text-primary disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <textarea
              rows={Math.min(10, Math.max(3, sec.body.split('\n').length + 1))}
              disabled={locked}
              value={sec.body}
              onChange={(e) => updateSection(sec.id, { body: e.target.value })}
              className="w-full rounded-xl border border-border bg-editor-bg p-3 text-xs leading-relaxed text-text-primary outline-none focus:border-accent"
            />
          </div>
        ))
      )}
    </div>
  )
}
