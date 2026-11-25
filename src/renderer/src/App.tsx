import React, { useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import type { PreComposedPrompt, ProjectSummary, SwarmJob } from '@shared/types'
import { parseModelEffortVariant } from '@shared/model-families'
import { useStudioStore } from './store/useStudioStore'
import { AuroraBackdrop } from './components/ui/AuroraBrand'
import { TitleBar } from './components/shell/TitleBar'
import { GlobalNav } from './components/shell/GlobalNav'
import { HomeHub } from './pages/HomeHub'
import { Workbench } from './pages/Workbench'
import { SwarmQueuePage } from './pages/SwarmQueuePage'
import { MarketRadarPage } from './pages/MarketRadarPage'
import { SettingsPage, type SettingsTab } from './pages/SettingsPage'
import { CloseConfirmModal } from './components/ui/CloseConfirmModal'
import { CommandPalette } from './components/ui/CommandPalette'
import { ExportModal } from './components/editor/ExportModal'
import { BookOpen, Download, FolderOpen, Search } from 'lucide-react'

export const App: React.FC = () => {
  const {
    page,
    setPage,
    config,
    setConfig,
    projects,
    setProjects,
    setActiveProject,
    setAssets,
    setCanonLocks,
    openOrFocusTab,
    setAnnotations,
    setContextSlices,
    setPreComposedPrompt,
    setChatMessages,
    setLocalAgents,
    setApiConfigs,
    setSwarmJobs,
    setPendingProposal,
    setExternalChangedRelPath,
    setReviewHistory,
    setSkillRegistry,
    setAppInfo
  } = useStudioStore()

  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [shelfExportProject, setShelfExportProject] = useState<ProjectSummary | null>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('agents')
  const [projectSearch, setProjectSearch] = useState('')
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  const launchProject = async (params: {
    projectRoot: string
    entryRelPath?: string
    prePrompt?: PreComposedPrompt
  }) => {
    const scanned = await window.inknexus.projects.scan()
    setProjects(scanned)
    const proj = scanned.find((p: { rootPath: string }) => p.rootPath.toLowerCase() === params.projectRoot.toLowerCase())
    if (!proj) return

    setActiveProject(proj)
    const [tree, locks, anns, history, reviews] = await Promise.all([
      window.inknexus.projects.assets(proj.rootPath),
      window.inknexus.canon.list(proj.rootPath),
      window.inknexus.annotations.list(proj.rootPath),
      window.inknexus.chat.getHistory(proj.rootPath),
      window.inknexus.reviews.list(proj.rootPath)
    ])
    setAssets(tree)
    setCanonLocks(locks)
    setAnnotations(anns)
    setChatMessages(history)
    setReviewHistory(reviews)
    setPreComposedPrompt(params.prePrompt ?? null)

    const targetRel = params.entryRelPath || proj.lastOpenedFile
    if (targetRel) {
      try {
        const { content } = await window.inknexus.projects.readFile(proj.rootPath, targetRel)
        openOrFocusTab({
          relPath: targetRel,
          name: targetRel.split('/').pop() || targetRel,
          content,
          savedContent: content,
          dirty: false,
          locked: locks.includes(targetRel)
        })
        const slices = await window.inknexus.prompt.assembleContext(proj.rootPath, targetRel, proj.mode)
        setContextSlices(slices)
      } catch {
        // ignore missing initial file
      }
    }
    setPage('workbench')
  }

  useEffect(() => {
    const bootFast = async () => {
      const [cfg, scanned, apis, jobs, skills, info] = await Promise.all([
        window.inknexus.config.get(),
        window.inknexus.projects.scan(),
        window.inknexus.agents.listApis(),
        window.inknexus.swarm.list(),
        window.inknexus.skills.registry(),
        window.inknexus.app.getInfo()
      ])
      setConfig(cfg)
      setProjects(scanned)
      setApiConfigs(apis)
      setSwarmJobs(jobs)
      setSkillRegistry(skills)
      setAppInfo(info)
    }
    const discoverBackground = async () => {
      const locals = await window.inknexus.agents.discover()
      setLocalAgents(locals)
      const first = locals.find((a) => a.status === 'available')
      if (first) {
        const cfg = useStudioStore.getState().config
        useStudioStore.getState().setAgentSelection({
          backendId: first.id,
          model: parseModelEffortVariant(first.models[0] || '').baseId,
          reasoning: cfg?.defaultReasoning ?? 'high'
        })
      }
    }
    void bootFast()
    void discoverBackground()

    const unsubSwarm = window.inknexus.swarm.onUpdate((jobs) => setSwarmJobs(jobs))
    const unsubExt = window.inknexus.projects.onExternalChange(({ relPath }) => setExternalChangedRelPath(relPath))
    const unsubClose = window.inknexus.window.onCloseRequested(() => setCloseModalOpen(true))
    return () => {
      unsubSwarm()
      unsubExt()
      unsubClose()
    }
  }, [
    setApiConfigs,
    setAppInfo,
    setConfig,
    setExternalChangedRelPath,
    setLocalAgents,
    setProjects,
    setSkillRegistry,
    setSwarmJobs
  ])

  // Global Ctrl+K command palette shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const resolvedTheme =
    config?.theme === 'system'
      ? window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'aurora-dark'
        : 'aurora-light'
      : config?.theme ?? 'aurora-light'

  // Sync Electron BrowserWindow backgroundColor with active theme to eliminate white edge artifacts
  useEffect(() => {
    void window.inknexus.window.setThemeBackground(resolvedTheme === 'aurora-dark')
  }, [resolvedTheme])

  // Expose smoke test hook for real Electron screenshot verification
  useEffect(() => {
    window.__inknexusSmoke = async (scene: string) => {
      const store = useStudioStore.getState()
      if (scene === 'home-light' || scene === 'home-dark') {
        const updated = await window.inknexus.config.save({
          theme: scene === 'home-dark' ? 'aurora-dark' : 'aurora-light'
        })
        store.setConfig(updated)
        store.setPage('home')
      } else if (scene === 'workbench-light' || scene === 'workbench-dark') {
        const nextTheme = scene === 'workbench-dark' ? 'aurora-dark' : 'aurora-light'
        const updated = await window.inknexus.config.save({ theme: nextTheme })
        store.setConfig(updated)
        let projs = store.projects
        if (projs.length === 0) {
          projs = await window.inknexus.projects.scan()
          store.setProjects(projs)
        }
        const target = projs.find((p) => p.title.includes('扬州金谷录')) ?? projs[0]
        if (!store.activeProject && target) {
          await launchProject({
            projectRoot: target.rootPath,
            entryRelPath: target.mode === 'long-novel' ? '正文/第001章_屏射开筵.md' : undefined
          })
        } else {
          store.setPage('workbench')
        }
        store.setReviewMode('advanced')
      } else if (scene === 'fullbook-modal') {
        store.setPage('workbench')
        setTimeout(() => {
          const btns = Array.from(document.querySelectorAll('button'))
          btns.find((b) => b.textContent?.trim().startsWith('审校'))?.click()
          setTimeout(() => {
            const btns2 = Array.from(document.querySelectorAll('button'))
            btns2.find((b) => b.textContent?.includes('再次运行全文审查'))?.click()
          }, 120)
        }, 120)
      } else if (scene === 'swarm') {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        store.setPage('swarm')
      } else if (scene === 'radar') {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        store.setPage('radar')
      } else if (scene === 'settings-skills' || scene === 'settings-storage' || scene === 'settings-agents') {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        if (scene === 'settings-agents' && store.localAgents.length === 0) {
          const list = await window.inknexus.agents.discover()
          store.setLocalAgents(list)
        }
        setSettingsTab(
          scene === 'settings-skills' ? 'skills' : scene === 'settings-agents' ? 'agents' : 'storage'
        )
        store.setPage('settings')
      }
    }
  })

  const handleOpenJobInWorkbench = async (job: SwarmJob) => {
    await launchProject({
      projectRoot: job.config.projectRoot,
      entryRelPath: job.config.targetRelPath
    })
    if (job.proposal) setPendingProposal(job.proposal)
  }

  return (
    <div
      data-theme={resolvedTheme}
      data-effects={config?.effectsMode ?? 'full'}
      className="flex h-screen w-screen flex-col overflow-hidden bg-appbg font-sans text-text-primary select-none"
    >
      <AuroraBackdrop intensity={page === 'home' ? 'hero' : 'subtle'} />
      <Toaster position="top-right" richColors />

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <GlobalNav />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TitleBar
            onOpenExport={() => setExportModalOpen(true)}
            onOpenVersions={() => setVersionDrawerOpen(true)}
          />

          <main className="relative min-h-0 flex-1 overflow-hidden">
            {page === 'home' && <HomeHub onLaunchProject={launchProject} />}

            {page === 'workbench' && (
              <Workbench
                versionDrawerOpen={versionDrawerOpen}
                setVersionDrawerOpen={setVersionDrawerOpen}
                exportModalOpen={exportModalOpen}
                setExportModalOpen={setExportModalOpen}
              />
            )}

            {page === 'swarm' && <SwarmQueuePage onOpenJobInWorkbench={handleOpenJobInWorkbench} />}

            {page === 'projects' && (
              <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
                <div className="mx-auto max-w-6xl space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-bold text-text-primary">我的作品书架（{projects.length} 部）</h1>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs">
                      <Search className="h-3.5 w-3.5 text-text-muted" />
                      <input
                        type="text"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="搜索作品名或路径..."
                        className="w-56 bg-transparent outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {projects
                      .filter((p) => !projectSearch || p.title.toLowerCase().includes(projectSearch.toLowerCase()))
                      .map((p) => (
                        <div key={p.id} className="glass-card flex flex-col justify-between p-4">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-text-primary">{p.title}</span>
                              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                                {p.mode === 'short-webnovel' ? '短篇网文' : p.mode === 'drama-script' ? 'AI 剧本' : '长文小说'}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-[11px] text-text-muted">{p.rootPath}</div>
                            <div className="mt-2 text-xs text-text-secondary">
                              {p.chapterCount} 篇正文 · {p.wordCount.toLocaleString()} 字
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => void window.inknexus.projects.openFolder(p.rootPath)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-text-secondary hover:border-accent"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                                目录
                              </button>
                              <button
                                type="button"
                                onClick={() => setShelfExportProject(p)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-accent"
                              >
                                <Download className="h-3.5 w-3.5" />
                                导出 Docx
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => void launchProject({ projectRoot: p.rootPath })}
                              className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              进入工作台
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {page === 'radar' && <MarketRadarPage onLaunchFromTopic={launchProject} />}

            {page === 'settings' && <SettingsPage initialTab={settingsTab} />}
          </main>
        </div>
      </div>

      <CloseConfirmModal
        open={closeModalOpen}
        onCancel={() => setCloseModalOpen(false)}
        onConfirm={async (action, remember) => {
          setCloseModalOpen(false)
          if (remember) {
            setConfig(await window.inknexus.config.save({ closeBehavior: action }))
            toast.info(action === 'minimize-to-tray' ? '已记住：关闭时最小化至系统托盘（可在设置修改）' : '已记住：点击关闭直接退出')
          }
          await window.inknexus.window.confirmClose(action, remember)
        }}
      />

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onOpenProject={async (projectRoot) => {
          await launchProject({ projectRoot })
        }}
      />

      <ExportModal
        open={Boolean(shelfExportProject)}
        onClose={() => setShelfExportProject(null)}
        project={shelfExportProject}
      />
    </div>
  )
}
