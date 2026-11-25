import React, { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderKanban,
  Github,
  Home,
  Radar,
  Settings,
  Workflow
} from 'lucide-react'
import navLogo from '../../assets/brand/nav-logo.png'
import { useStudioStore, type NavPage } from '../../store/useStudioStore'

interface NavItem {
  id: NavPage
  label: string
  icon: React.FC<{ className?: string }>
  badge?: number
}

export const GlobalNav: React.FC = () => {
  const { page, setPage, swarmJobs, activeWorks, activeProject, appInfo } = useStudioStore()
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null)

  const compact = manualExpanded !== null ? !manualExpanded : page === 'workbench'
  const activeSwarmCount = swarmJobs.filter((j) =>
    ['queued', 'writing', 'linting', 'self_review', 'review_round_1', 'revising_1', 'review_round_2', 'revising_2'].includes(j.stage)
  ).length
  const activeWorkCount = Object.values(activeWorks).filter((w) => w.stage !== 'idle').length
  const totalActiveCount = activeSwarmCount + activeWorkCount

  const items: NavItem[] = [
    { id: 'home', label: '创作大厅', icon: Home },
    { id: 'projects', label: '我的作品', icon: FolderKanban },
    { id: 'swarm', label: '工作区', icon: Workflow, badge: totalActiveCount || undefined },
    { id: 'radar', label: '市场雷达', icon: Radar },
    { id: 'settings', label: '设置', icon: Settings }
  ]

  return (
    <aside
      className={`relative z-20 flex shrink-0 flex-col border-r border-border/70 bg-surface/80 backdrop-blur-md transition-all duration-200 ${
        compact ? 'w-[60px]' : 'w-[196px]'
      }`}
    >
      <div className="flex h-14 items-center justify-between px-3">
        <button
          type="button"
          onClick={() => setPage('home')}
          className="flex items-center gap-2.5 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-accent/25 bg-[#f7f4ff] shadow-xs">
            <img src={navLogo} alt="墨枢 Logo" className="h-full w-full object-cover" />
          </span>
          {!compact && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-text-primary">墨枢</div>
              <div className="text-[10px] text-text-muted">InkNexus Studio</div>
            </div>
          )}
        </button>
        {!compact && (
          <button
            type="button"
            title="折叠导航"
            onClick={() => setManualExpanded(false)}
            className="rounded-md p-1 text-text-muted hover:bg-accent-soft/60 hover:text-text-primary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {compact && (
        <button
          type="button"
          title="展开导航"
          onClick={() => setManualExpanded(true)}
          className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-accent-soft/60 hover:text-text-primary"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <nav className="flex-1 space-y-1 px-2 py-2">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = page === item.id || (item.id === 'projects' && page === 'workbench')
          return (
            <button
              key={item.id}
              type="button"
              title={compact ? item.label : undefined}
              onClick={() => {
                if (item.id === 'projects' && activeProject && page !== 'projects' && page !== 'workbench') {
                  setPage('projects')
                } else {
                  setPage(item.id)
                }
              }}
              className={`group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-accent-soft text-accent shadow-sm'
                  : 'text-text-secondary hover:bg-surface-raised/70 hover:text-text-primary'
              }`}
            >
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-accent" />}
              <Icon className="h-4 w-4 shrink-0" />
              {!compact && <span className="truncate">{item.label}</span>}
              {item.badge !== undefined && (
                <span
                  className={`${
                    compact ? 'absolute right-1 top-1 h-4 min-w-[16px] text-[10px]' : 'ml-auto px-1.5 py-0.5 text-[11px]'
                  } inline-flex items-center justify-center rounded-full bg-accent font-semibold text-on-accent`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {activeProject && page !== 'workbench' && (
        <div className="border-t border-border/60 p-2">
          <button
            type="button"
            onClick={() => setPage('workbench')}
            title={`回到工作台：${activeProject.title}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/60 px-2.5 py-2 text-xs font-medium text-accent transition hover:bg-accent-soft"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
            {!compact && <span className="truncate">回到：{activeProject.title}</span>}
          </button>
        </div>
      )}

      {/* 左下角：InkNexus 版本号与 @LilHaopeng GitHub 超链接 */}
      <div className="border-t border-border/60 p-2.5">
        {compact ? (
          <button
            type="button"
            title={`InkNexus ${appInfo.version} · ${appInfo.author} (GitHub)`}
            onClick={() =>
              void window.inknexus.app.openExternal(appInfo.authorUrl || 'https://github.com/LilHaopeng')
            }
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-accent-soft hover:text-accent"
          >
            <Github className="h-4 w-4" />
          </button>
        ) : (
          <div className="rounded-xl border border-border/70 bg-surface-raised/65 px-2.5 py-2 text-[11px]">
            <div className="flex items-center justify-between text-text-secondary">
              <span className="font-semibold text-text-primary">InkNexus {appInfo.version}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                void window.inknexus.app.openExternal(appInfo.authorUrl || 'https://github.com/LilHaopeng')
              }
              className="mt-1 inline-flex items-center gap-1 text-text-muted transition hover:text-accent hover:underline"
            >
              <Github className="h-3 w-3" />
              <span>{appInfo.author}</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
