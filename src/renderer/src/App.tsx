import React, { useEffect, useState } from 'react'
import { Toaster, toast } from 'sonner'
import type { PreComposedPrompt, ProjectCategory, ProjectSummary, SwarmJob } from '@shared/types'
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
import { BookOpen, Download, FolderOpen, RefreshCw, Search, Sparkles, X } from 'lucide-react'

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
    setAppInfo,
    setAgentsDiscovered,
    startupAppUpdate,
    startupUpdatableSkills,
    updateBannerDismissed,
    setStartupUpdateInfo,
    dismissUpdateBanner,
    activeWorks
  } = useStudioStore()

  const [versionDrawerOpen, setVersionDrawerOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [shelfExportProject, setShelfExportProject] = useState<ProjectSummary | null>(null)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('agents')
  const [projectSearch, setProjectSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProjectCategory>('all')
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  const launchProject = async (params: {
    projectRoot: string
    entryRelPath?: string
    prePrompt?: PreComposedPrompt
    autoStartCoordinatorPlan?: boolean
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
    setPreComposedPrompt(
      params.prePrompt
        ? { ...params.prePrompt, autoPlanOnEnter: params.autoStartCoordinatorPlan ?? params.prePrompt.autoPlanOnEnter }
        : null
    )

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

      const locals = await window.inknexus.agents.discover()
      setLocalAgents(locals)

      const availableLocals = locals.filter((a) => a.status === 'available')
      const readyApis = apis.filter((a: { hasApiKey?: boolean; enabled?: boolean }) => a.hasApiKey && a.enabled)
      const savedLocal = availableLocals.find((a) => a.id === cfg.defaultAgentId)
      const savedApi = readyApis.find((a: { presetId: string }) => a.presetId === cfg.defaultAgentId)

      if (savedLocal) {
        const defaultM = parseModelEffortVariant(savedLocal.models[0] || '').baseId
        const validSaved =
          cfg.defaultModel && savedLocal.models.some((m) => parseModelEffortVariant(m).baseId === cfg.defaultModel)
        useStudioStore.getState().setAgentSelection({
          backendId: savedLocal.id,
          model: validSaved ? cfg.defaultModel : defaultM,
          reasoning: cfg.defaultReasoning ?? 'high'
        })
      } else if (savedApi) {
        useStudioStore.getState().setAgentSelection({
          backendId: savedApi.presetId,
          model: savedApi.models.includes(cfg.defaultModel) ? cfg.defaultModel : savedApi.models[0] || '',
          reasoning: cfg.defaultReasoning ?? 'high'
        })
      } else if (availableLocals[0]) {
        useStudioStore.getState().setAgentSelection({
          backendId: availableLocals[0].id,
          model: parseModelEffortVariant(availableLocals[0].models[0] || '').baseId,
          reasoning: cfg.defaultReasoning ?? 'high'
        })
      } else if (readyApis[0]) {
        useStudioStore.getState().setAgentSelection({
          backendId: readyApis[0].presetId,
          model: readyApis[0].models[0] || '',
          reasoning: cfg.defaultReasoning ?? 'high'
        })
      } else {
        useStudioStore.getState().setAgentSelection({
          backendId: '',
          model: '',
          reasoning: cfg.defaultReasoning ?? 'high'
        })
      }
      setAgentsDiscovered(true)
    }

    const silentStartupUpdateCheck = async () => {
      try {
        const [appUpdRes, skillCheckRes] = await Promise.allSettled([
          window.inknexus.updater.check(),
          window.inknexus.skills.checkAllUpdates()
        ])
        const appUpd = appUpdRes.status === 'fulfilled' && appUpdRes.value.hasUpdate ? appUpdRes.value : null
        const allSkills = skillCheckRes.status === 'fulfilled' ? skillCheckRes.value : []
        if (allSkills.length > 0) {
          setSkillRegistry(allSkills)
        }
        const updatableSkills = allSkills.filter((s) => s.hasUpdate)
        if (appUpd || updatableSkills.length > 0) {
          setStartupUpdateInfo(appUpd, updatableSkills)
        }
      } catch {
        // Silent background check never alerts on network offline
      }
    }

    void bootFast()
    const updateTimer = setTimeout(() => {
      void silentStartupUpdateCheck()
    }, 2200)

    const unsubSwarm = window.inknexus.swarm.onUpdate((jobs) => setSwarmJobs(jobs))
    const unsubExt = window.inknexus.projects.onExternalChange(({ relPath }) => setExternalChangedRelPath(relPath))
    const unsubClose = window.inknexus.window.onCloseRequested(() => setCloseModalOpen(true))
    return () => {
      clearTimeout(updateTimer)
      unsubSwarm()
      unsubExt()
      unsubClose()
    }
  }, [
    setAgentsDiscovered,
    setApiConfigs,
    setAppInfo,
    setConfig,
    setExternalChangedRelPath,
    setLocalAgents,
    setProjects,
    setSkillRegistry,
    setStartupUpdateInfo,
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
      if (scene === 'simulate-no-cli') {
        store.setLocalAgents(store.localAgents.map((a) => ({ ...a, status: 'not-installed' })))
        store.setApiConfigs(store.apiConfigs.map((a) => ({ ...a, enabled: false, hasApiKey: false })))
        store.setAgentSelection({ backendId: '', model: '', reasoning: 'high' })
        store.setAgentsDiscovered(true)
        store.setPage('home')
        await new Promise((r) => setTimeout(r, 120))
        return document.querySelector('[data-testid="titlebar-connection-pill"]')?.textContent?.trim() || ''
      } else if (scene === 'open-version-drawer') {
        store.setPage('workbench')
        setVersionDrawerOpen(true)
        return true
      } else if (scene === 'open-world-context') {
        store.setPage('workbench')
        await new Promise((r) => setTimeout(r, 80))
        const el = document.querySelector('[data-testid="asset-category-world"]')
        if (el) {
          const r = el.getBoundingClientRect()
          el.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              clientX: Math.round(r.left + r.width / 2),
              clientY: Math.round(r.top + r.height / 2)
            })
          )
        }
        return true
      } else if (scene === 'open-world-doc') {
        const findWorld = (nodes: Awaited<ReturnType<typeof window.inknexus.projects.assets>>): string | undefined => {
          for (const n of nodes) {
            if (!n.isDirectory && (/^设定\//.test(n.relPath) || /^世界观\//.test(n.relPath) || n.category === 'world' || /世界观|设定/.test(n.relPath))) {
              return n.relPath
            }
            if (n.isDirectory && n.children) {
              const sub = findWorld(n.children)
              if (sub) return sub
            }
          }
          return undefined
        }
        let targetProj = store.projects[0]
        let worldRel: string | undefined
        for (const p of store.projects) {
          const assets = await window.inknexus.projects.assets(p.rootPath)
          const found = findWorld(assets)
          if (found) {
            targetProj = p
            worldRel = found
            break
          }
        }
        if (targetProj && worldRel) {
          await launchProject({ projectRoot: targetProj.rootPath, entryRelPath: worldRel })
        } else {
          store.setPage('workbench')
          store.openOrFocusTab({
            relPath: '设定/00_世界观总览.md',
            name: '00_世界观总览',
            content: '# 世界观总览\n\n## 核心法则\n灵潮每十二个时辰涨落一次，潮落时凡铁重若玄石，潮涨时符箓自燃。\n',
            savedContent: '# 世界观总览\n\n## 核心法则\n灵潮每十二个时辰涨落一次，潮落时凡铁重若玄石，潮涨时符箓自燃。\n',
            locked: false,
            dirty: false
          })
        }
        await new Promise((r) => setTimeout(r, 250))
        return Boolean(document.querySelector('[data-testid="editor-action-from-world"]'))
      } else if (scene === 'simulate-update-banner') {
        store.setStartupUpdateInfo(
          {
            currentVersion: '1.0.2',
            latestVersion: '1.0.3',
            hasUpdate: true,
            releaseNotes: '- 新增工作区默认 Contents 目录隔离\n- 支持作品资产分组与 Ctrl 多选导出 Docx\n- 工具栏增加世界观生成大纲/大纲生成正文快捷入口',
            releaseUrl: 'https://github.com/LilHaopeng/inknexus-studio/releases',
            checkedAt: Date.now()
          },
          [
            {
              id: 'story-world-architect',
              name: '小说世界观架构师',
              repoOwner: 'LilHaopeng',
              repoName: 'story-world-architect',
              repoUrl: 'https://github.com/LilHaopeng/story-world-architect',
              localVersion: '1.0.0',
              remoteVersion: '1.0.1',
              hasUpdate: true,
              summary: '世界观架构',
              scripts: []
            }
          ]
        )
        return true
      } else if (scene === 'home-light' || scene === 'home-dark') {
        const updated = await window.inknexus.config.save({
          theme: scene === 'home-dark' ? 'aurora-dark' : 'aurora-light'
        })
        store.setConfig(updated)
        store.setPage('home')
      } else if (scene === 'workbench-light' || scene === 'workbench-dark' || scene === 'workbench-split') {
        const nextTheme = scene === 'workbench-dark' ? 'aurora-dark' : 'aurora-light'
        const updated = await window.inknexus.config.save({ theme: nextTheme })
        store.setConfig(updated)
        let projs = store.projects
        if (projs.length === 0) {
          projs = await window.inknexus.projects.scan()
          store.setProjects(projs)
        }
        const target = projs.find((p) => p.title.includes('扬州金谷录')) ?? projs[0]
        if (target) {
          if (!store.activeProject) {
            await launchProject({
              projectRoot: target.rootPath,
              entryRelPath: target.mode === 'long-novel' ? '正文/第001章_屏射开筵.md' : undefined
            })
          } else {
            store.setPage('workbench')
          }
          // Populate preview comms & active work indicator for visual verification if empty
          if ((store.agentCommsByProject[target.rootPath.toLowerCase()] ?? []).length === 0) {
            store.appendAgentComm({
              projectRoot: target.rootPath,
              fromRole: 'coordinator',
              toRole: 'writer',
              content: '已对齐故事 DNA 与《扬州金谷录》卷一细纲，请执笔作者按第一章卡点起稿。'
            })
            store.appendAgentComm({
              projectRoot: target.rootPath,
              fromRole: 'writer',
              toRole: 'reviewer1',
              content: '第001章《屏射开筵》初稿已落成，已触发逻辑与人设复核。'
            })
          }
          store.setActiveWork({
            projectId: target.id,
            projectRoot: target.rootPath,
            title: target.title,
            stage: 'writing',
            statusLabel: '正在写入第001章《屏射开筵》...',
            activeRole: 'writer',
            updatedAt: Date.now()
          })
        }
      } else if (scene === 'projects-shelf') {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        if (store.projects.length === 0) {
          store.setProjects(await window.inknexus.projects.scan())
        }
        store.setPage('projects')
      } else if (scene === 'swarm' || scene === 'workspace-queue') {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        store.setPage('swarm')
      } else if (scene === 'radar') {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        store.setPage('radar')
      } else if (
        scene === 'settings-skills' ||
        scene === 'settings-storage' ||
        scene === 'settings-agents' ||
        scene === 'settings-updater' ||
        scene === 'settings-licenses'
      ) {
        const updated = await window.inknexus.config.save({ theme: 'aurora-light' })
        store.setConfig(updated)
        if (scene === 'settings-agents' && store.localAgents.length === 0) {
          const list = await window.inknexus.agents.discover()
          store.setLocalAgents(list)
        }
        setSettingsTab(
          scene === 'settings-skills'
            ? 'skills'
            : scene === 'settings-agents'
              ? 'agents'
              : scene === 'settings-updater'
                ? 'updater'
                : scene === 'settings-licenses'
                  ? 'licenses'
                  : 'storage'
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

            {page === 'swarm' && (
              <SwarmQueuePage
                onOpenJobInWorkbench={handleOpenJobInWorkbench}
                onOpenProjectInWorkbench={(projectRoot, entryRelPath) =>
                  void launchProject({ projectRoot, entryRelPath })
                }
              />
            )}

            {page === 'projects' && (
              <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
                <div className="mx-auto max-w-6xl space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-bold text-text-primary">我的作品书架（{projects.length} 部）</h1>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as 'all' | ProjectCategory)}
                        className="h-8 rounded-xl border border-border bg-surface-raised px-3 text-xs text-text-primary outline-none focus:border-accent"
                      >
                        <option value="all">全部分类 ({projects.length})</option>
                        <option value="long-novel">
                          长文小说 ({projects.filter((p) => p.category === 'long-novel').length})
                        </option>
                        <option value="short-webnovel">
                          短篇网文 ({projects.filter((p) => p.category === 'short-webnovel').length})
                        </option>
                        <option value="drama-script">
                          AI 剧本 ({projects.filter((p) => p.category === 'drama-script').length})
                        </option>
                        <option value="unclassified">
                          未分类 ({projects.filter((p) => p.category === 'unclassified').length})
                        </option>
                      </select>

                      <div className="flex h-8 items-center gap-2 rounded-xl border border-border bg-surface-raised px-3 text-xs">
                        <Search className="h-3.5 w-3.5 text-text-muted" />
                        <input
                          type="text"
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          placeholder="搜索作品名或路径..."
                          className="w-48 bg-transparent outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {projects
                      .filter((p) => categoryFilter === 'all' || p.category === categoryFilter)
                      .filter(
                        (p) =>
                          !projectSearch ||
                          p.title.toLowerCase().includes(projectSearch.toLowerCase()) ||
                          p.rootPath.toLowerCase().includes(projectSearch.toLowerCase())
                      )
                      .map((p) => {
                        const liveWork = activeWorks[p.rootPath.toLowerCase()]
                        const isWorking = Boolean(liveWork && liveWork.stage !== 'idle')
                        const stageText =
                          liveWork?.stage === 'writing'
                            ? '写作中'
                            : liveWork?.stage === 'reviewing'
                              ? '审查中'
                              : liveWork?.stage === 'revising'
                                ? '修稿中'
                                : liveWork?.stage === 'completing'
                                  ? '补全中'
                                  : liveWork?.stage === 'planning'
                                    ? '构思中'
                                    : ''

                        const categoryBadge =
                          p.category === 'unclassified'
                            ? '未分类'
                            : p.category === 'short-webnovel'
                              ? '短篇网文'
                              : p.category === 'drama-script'
                                ? 'AI 剧本'
                                : '长文小说'

                        return (
                          <div
                            key={p.id}
                            className={`glass-card flex flex-col justify-between p-4 transition ${
                              isWorking ? 'active-work-card' : ''
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-text-primary">{p.title}</span>
                                <div className="flex shrink-0 items-center gap-1">
                                  {isWorking && stageText && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-on-accent">
                                      <Sparkles className="h-2.5 w-2.5 animate-pulse" />
                                      {stageText}
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                      p.category === 'unclassified'
                                        ? 'border border-warning/40 bg-warning-soft text-warning'
                                        : 'bg-accent-soft text-accent'
                                    }`}
                                  >
                                    {categoryBadge}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-1 truncate text-[11px] text-text-muted">{p.rootPath}</div>
                              <div className="mt-2 text-xs text-text-secondary">
                                {p.chapterCount} 篇正文 · {p.wordCount.toLocaleString()} 字
                              </div>

                              {p.category === 'unclassified' && (
                                <div className="mt-2.5 flex items-center gap-2">
                                  <span className="text-[11px] text-text-muted">归类：</span>
                                  <select
                                    defaultValue=""
                                    onChange={async (e) => {
                                      const val = e.target.value as Exclude<ProjectCategory, 'unclassified'> | ''
                                      if (!val) return
                                      const updatedList = await window.inknexus.projects.classify(p.rootPath, val)
                                      setProjects(updatedList)
                                      toast.success(
                                        `已将《${p.title}》归类并迁移至「${
                                          val === 'long-novel'
                                            ? '长文小说'
                                            : val === 'short-webnovel'
                                              ? '短篇网文'
                                              : 'AI 剧本'
                                        }」`
                                      )
                                    }}
                                    className="h-6 rounded-lg border border-border bg-surface px-2 text-[11px] text-text-primary outline-none focus:border-accent"
                                  >
                                    <option value="">选择目标分类...</option>
                                    <option value="long-novel">长文小说</option>
                                    <option value="short-webnovel">短篇网文</option>
                                    <option value="drama-script">AI 剧本</option>
                                  </select>
                                </div>
                              )}
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
                        )
                      })}
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

      {/* 右下角启动静默更新发现提醒（软件新版 / Skill 新版） */}
      {!updateBannerDismissed && (startupAppUpdate?.hasUpdate || startupUpdatableSkills.length > 0) && (
        <div
          data-testid="startup-update-banner"
          className="glass-panel fixed right-5 bottom-5 z-40 w-[330px] border border-accent/40 bg-surface-raised/95 p-3.5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <RefreshCw className="h-3.5 w-3.5" />
              </span>
              <span>发现可用更新</span>
            </div>
            <button
              type="button"
              onClick={dismissUpdateBanner}
              className="rounded-md p-1 text-text-muted hover:bg-surface hover:text-text-primary"
              aria-label="关闭更新提示"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 space-y-1.5 text-[11px] text-text-secondary">
            {startupAppUpdate?.hasUpdate && (
              <div>
                软件发现新版本：<strong className="text-accent">v{startupAppUpdate.latestVersion}</strong>
              </div>
            )}
            {startupAppUpdate?.hasUpdate && startupAppUpdate.releaseNotes && (
              <div className="max-h-24 overflow-y-auto rounded-lg border border-border/60 bg-surface px-2.5 py-1.5 text-[10px] leading-relaxed text-text-secondary whitespace-pre-wrap">
                {startupAppUpdate.releaseNotes
                  .replace(/^#{1,6}\s+/gm, '')
                  .replace(/\*\*/g, '')
                  .replace(/`/g, '')
                  .trim()}
              </div>
            )}
            {startupUpdatableSkills.length > 0 && (
              <div>
                发现 <strong className="text-accent">{startupUpdatableSkills.length}</strong> 个内置创作 Skill 可更新
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {startupUpdatableSkills.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('skills')
                  setPage('settings')
                }}
                className="rounded-lg border border-accent/40 bg-accent-soft/60 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent hover:text-on-accent"
              >
                前往更新 Skill
              </button>
            )}
            {startupAppUpdate?.hasUpdate && (
              <button
                type="button"
                onClick={() => {
                  setSettingsTab('updater')
                  setPage('settings')
                }}
                className="rounded-lg bg-accent px-3 py-1 text-[11px] font-medium text-on-accent hover:bg-accent-hover"
              >
                立即更新软件
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
