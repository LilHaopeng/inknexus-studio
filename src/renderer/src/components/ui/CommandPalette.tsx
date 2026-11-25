import React, { useEffect, useState } from 'react'
import { BookOpen, Home, Moon, Radar, Search, Settings, Workflow, X } from 'lucide-react'
import { useStudioStore } from '../../store/useStudioStore'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenProject: (projectRoot: string) => Promise<void>
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, onOpenProject }) => {
  const { projects, setPage, config, setConfig } = useStudioStore()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  if (!open) return null

  const actions = [
    { id: 'nav-home', label: '前往：创作大厅', icon: Home, run: () => setPage('home') },
    { id: 'nav-projects', label: '前往：我的作品书架', icon: BookOpen, run: () => setPage('projects') },
    { id: 'nav-swarm', label: '前往：并发队列中心', icon: Workflow, run: () => setPage('swarm') },
    { id: 'nav-radar', label: '前往：市场扫榜雷达', icon: Radar, run: () => setPage('radar') },
    { id: 'nav-settings', label: '前往：设置与更新', icon: Settings, run: () => setPage('settings') },
    {
      id: 'toggle-theme',
      label: config?.theme === 'aurora-dark' ? '切换为：Aurora 浅色主题' : '切换为：Aurora 深色主题',
      icon: Moon,
      run: async () => {
        const next = config?.theme === 'aurora-dark' ? 'aurora-light' : 'aurora-dark'
        setConfig(await window.inknexus.config.save({ theme: next }))
      }
    }
  ]

  const q = query.trim().toLowerCase()
  const filteredActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q))
  const filteredProjects = projects.filter((p) => !q || p.title.toLowerCase().includes(q)).slice(0, 8)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-24 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-accent" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索作品、跳转页面或执行指令 (Ctrl+K)..."
            className="flex-1 bg-transparent text-sm text-text-primary outline-none"
          />
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 text-xs">
          {filteredActions.map((act) => {
            const Icon = act.icon
            return (
              <button
                key={act.id}
                type="button"
                onClick={() => {
                  void act.run()
                  onClose()
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-text-primary hover:bg-accent-soft hover:text-accent"
              >
                <Icon className="h-4 w-4" />
                <span>{act.label}</span>
              </button>
            )
          })}

          {filteredProjects.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="px-3 py-1 text-[10px] font-semibold text-text-muted">快速打开作品</div>
              {filteredProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    void onOpenProject(p.rootPath)
                    onClose()
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-text-primary hover:bg-accent-soft hover:text-accent"
                >
                  <span className="font-medium">{p.title}</span>
                  <span className="text-[10px] text-text-muted">{p.chapterCount} 篇</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
