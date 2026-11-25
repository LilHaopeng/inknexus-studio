import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type {
  AgentBackendInfo,
  AgentSelection,
  AnnotationReply,
  AnnotationThread,
  AppConfig,
  CreationIntent,
  CreationMode,
  ImportedFileItem,
  PermissionMode,
  ReviewHistoryEntry,
  ReviewMode,
  SkillId,
  StorageScope,
  SubTemplateId,
  SwarmJobConfig
} from '@shared/types'
import { stripAgentMarkupForDisplay } from '../shared/agent-markup-filter'
import { AppDataStore, type SecretVault } from './storage/appdata-store'
import { SkillLoader } from './orchestrator/skill-loader'
import { PromptComposer } from './orchestrator/prompt-composer'
import { ContextAssembler } from './orchestrator/context-assembler'
import { ProjectManager } from './workspace/project-manager'
import { ImporterService } from './workspace/importer'
import { PythonRunner } from './workspace/python-runner'
import { RadarService } from './workspace/radar-service'
import { AgentDiscoveryService } from './bridge/discovery'
import { CliSubprocessRunner } from './bridge/cli-adapters'
import { AcpBridgeRunner } from './bridge/acp-adapter'
import { ApiPresetService } from './bridge/api-presets'
import { ApiAgentRunner } from './bridge/api-agent-adapter'
import { SwarmCoordinator, parseReviewOutput } from './swarm/swarm-coordinator'
import { SkillUpdaterService } from './updater/skill-updater'
import { APP_GITHUB_OWNER, APP_GITHUB_REPO, AppUpdaterService } from './updater/app-updater'

const electronVault: SecretVault = {
  encrypt(plain: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plain).toString('base64')
    }
    return Buffer.from(plain, 'utf8').toString('base64')
  },
  decrypt(cipher: string): string {
    const buf = Buffer.from(cipher, 'base64')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
    return buf.toString('utf8')
  }
}

export class StudioRuntime {
  public readonly store: AppDataStore
  public readonly skillLoader: SkillLoader
  public readonly composer: PromptComposer
  public readonly contextAssembler: ContextAssembler
  public readonly projectManager: ProjectManager
  public readonly importer: ImporterService
  public readonly pythonRunner: PythonRunner
  public readonly radarService: RadarService
  public readonly skillUpdater: SkillUpdaterService
  public readonly appUpdater: AppUpdaterService
  public readonly discovery: AgentDiscoveryService
  public readonly cliRunner: CliSubprocessRunner
  public readonly acpRunner: AcpBridgeRunner
  public readonly apiPresets: ApiPresetService
  public readonly apiRunner: ApiAgentRunner
  public readonly swarm: SwarmCoordinator

  private cachedLocalAgents: AgentBackendInfo[] = []
  private activeChatControllers = new Map<string, AbortController>()

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly onConfirmClose?: (action: 'minimize-to-tray' | 'exit', remember: boolean) => void
  ) {
    this.store = new AppDataStore({
      rootDir: path.join(app.getPath('appData'), 'InkNexusStudio'),
      vault: electronVault
    })
    this.skillLoader = new SkillLoader()
    this.composer = new PromptComposer(this.skillLoader)
    this.contextAssembler = new ContextAssembler()
    this.projectManager = new ProjectManager(this.store)
    this.importer = new ImporterService(this.projectManager)
    this.pythonRunner = new PythonRunner(this.skillLoader)
    this.radarService = new RadarService(this.skillLoader, this.store)
    this.skillUpdater = new SkillUpdaterService(this.skillLoader, this.store)
    this.appUpdater = new AppUpdaterService()
    this.discovery = new AgentDiscoveryService()
    this.cliRunner = new CliSubprocessRunner()
    this.acpRunner = new AcpBridgeRunner()
    this.apiPresets = new ApiPresetService(this.store)
    this.apiRunner = new ApiAgentRunner(this.store, this.projectManager)

    this.swarm = new SwarmCoordinator(this.store, this.composer, this.contextAssembler, {
      runAgent: async ({ selection, systemPrompt, userPrompt, projectRoot, signal }) => {
        const res = await this.executeAgentTurn({
          requestId: `swarm_${crypto.randomBytes(4).toString('hex')}`,
          selection,
          systemPrompt,
          userPrompt,
          projectRoot,
          permissionMode: 'diff-review',
          signal,
          onEvent: () => {}
        })
        return res.fullText
      },
      runLint: (projectRoot, targetRelPath, mode) => this.pythonRunner.runLintForFile(projectRoot, targetRelPath, mode),
      readOriginalFile: (projectRoot, targetRelPath) => {
        try {
          return this.projectManager.readFile(projectRoot, targetRelPath).content
        } catch {
          return ''
        }
      },
      onUpdate: (jobs) => {
        this.getMainWindow()?.webContents.send('swarm:update', jobs)
      }
    })
  }

  async refreshLocalAgents(): Promise<AgentBackendInfo[]> {
    this.cachedLocalAgents = await this.discovery.discoverLocalAgents()
    return this.cachedLocalAgents
  }

  async executeAgentTurn(params: {
    requestId: string
    selection: AgentSelection
    systemPrompt: string
    userPrompt: string
    projectRoot: string
    targetRelPath?: string
    permissionMode: PermissionMode
    sessionId?: string
    signal?: AbortSignal
    onEvent: (ev: unknown) => void
  }): Promise<{ fullText: string; thinkingText: string; sessionId?: string }> {
    if (params.selection.backendId.startsWith('api-')) {
      return this.apiRunner.run({
        ...params,
        onEvent: (ev) => params.onEvent(ev)
      })
    }

    if (this.cachedLocalAgents.length === 0) {
      await this.refreshLocalAgents()
    }
    const local = this.cachedLocalAgents.find((a) => a.id === params.selection.backendId)
    if (!local) throw new Error(`未知 Agent 后端：${params.selection.backendId}`)

    if (local.kind === 'acp' && local.executablePath && local.id !== 'agy-cli') {
      const acpArgs = local.id === 'gemini-cli' ? ['--acp'] : ['acp']
      return this.acpRunner.run(local.executablePath, acpArgs, {
        ...params,
        onEvent: (ev) => params.onEvent(ev)
      })
    }

    return this.cliRunner.run(local, {
      ...params,
      onEvent: (ev) => params.onEvent(ev)
    })
  }

  private async runReviewPass(params: {
    round: 1 | 2
    mode: CreationMode
    title: string
    draftText: string
    referenceContext: string
    projectRoot: string
    selection: AgentSelection
    signal?: AbortSignal
  }) {
    const sys =
      params.round === 1
        ? '你是严谨的文学与短剧一审编辑，只依据设定与稿件事实客观判定。'
        : '你是资深二审主编，换用全新视角复核文风声口、去 AI 味、对白张力与阅读呼吸感。'
    const res = await this.executeAgentTurn({
      requestId: `rev_${Date.now()}_${params.round}`,
      selection: params.selection,
      systemPrompt: sys,
      userPrompt: this.composer.composeReviewPrompt({
        round: params.round,
        mode: params.mode,
        title: params.title,
        draftText: params.draftText,
        referenceContext: params.referenceContext
      }),
      projectRoot: params.projectRoot,
      permissionMode: 'diff-review',
      signal: params.signal,
      onEvent: () => {}
    })
    return parseReviewOutput(res.fullText)
  }

  registerIpc(): void {
    // Window controls & App Info
    ipcMain.handle('window:minimize', () => this.getMainWindow()?.minimize())
    ipcMain.handle('window:maximize', () => {
      const win = this.getMainWindow()
      if (!win) return false
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return win.isMaximized()
    })
    ipcMain.handle('window:close', () => this.getMainWindow()?.close())
    ipcMain.handle('window:confirmClose', (_, action: 'minimize-to-tray' | 'exit', remember: boolean) => {
      this.onConfirmClose?.(action, remember)
    })
    ipcMain.handle('window:isMaximized', () => this.getMainWindow()?.isMaximized() ?? false)
    ipcMain.handle('window:setThemeBackground', (_, isDark: boolean) => {
      this.getMainWindow()?.setBackgroundColor(isDark ? '#11121E' : '#F1F2FA')
    })

    ipcMain.handle('app:getInfo', () => ({
      version: this.appUpdater.getCurrentVersion(),
      author: '@LilHaopeng',
      repoUrl: `https://github.com/${APP_GITHUB_OWNER}/${APP_GITHUB_REPO}`
    }))
    ipcMain.handle('app:openExternal', (_, url: string) => shell.openExternal(url))

    // Config
    ipcMain.handle('config:get', () => this.store.getConfig())
    ipcMain.handle('config:save', (_, patch: Partial<AppConfig>) => {
      const saved = this.store.saveConfig(patch)
      if (patch.theme) {
        this.getMainWindow()?.setBackgroundColor(patch.theme === 'aurora-dark' ? '#11121E' : '#F1F2FA')
      }
      return saved
    })

    // Projects & Files
    ipcMain.handle('projects:scan', (_, workspaceRoot?: string) =>
      this.projectManager.scanWorkspaceProjects(workspaceRoot || this.store.getConfig().workspaceRoot)
    )
    ipcMain.handle(
      'projects:create',
      (_, params: { parentDir?: string; title: string; mode: CreationMode; subTemplate?: SubTemplateId }) => {
        const parent = params.parentDir || this.store.getConfig().workspaceRoot
        return this.projectManager.createNewProject({ ...params, parentDir: parent })
      }
    )
    ipcMain.handle('projects:assets', (_, projectRoot: string) => {
      this.projectManager.watchProject(projectRoot, (relPath) => {
        this.getMainWindow()?.webContents.send('project:external-change', { projectRoot, relPath })
      })
      return this.projectManager.listAssets(projectRoot)
    })
    ipcMain.handle('projects:readFile', (_, projectRoot: string, relPath: string) =>
      this.projectManager.readFile(projectRoot, relPath)
    )
    ipcMain.handle('projects:writeFile', (_, projectRoot: string, relPath: string, content: string, createSnap = false) => {
      if (createSnap) {
        try {
          const prev = this.projectManager.readFile(projectRoot, relPath).content
          this.store.createSnapshot(projectRoot, path.join(projectRoot, relPath), prev, 'manual', '手动存盘前快照')
        } catch {
          // ignore if new
        }
      }
      return this.projectManager.writeFile(projectRoot, relPath, content)
    })
    ipcMain.handle('projects:createFile', (_, projectRoot: string, relPath: string, initial?: string) =>
      this.projectManager.createFile(projectRoot, relPath, initial)
    )
    ipcMain.handle('projects:openFolder', (_, targetPath: string) => shell.openPath(targetPath))
    ipcMain.handle('projects:radarReports', (_, workspaceRoot?: string) =>
      this.radarService.scanReports(workspaceRoot || this.store.getConfig().workspaceRoot)
    )

    // Canon locks
    ipcMain.handle('canon:list', (_, projectRoot: string) => this.store.listCanonLocks(projectRoot))
    ipcMain.handle('canon:set', (_, projectRoot: string, relPath: string, locked: boolean) =>
      this.store.setCanonLock(projectRoot, relPath, locked)
    )

    // Dialogs & Importer
    ipcMain.handle('dialog:pickFiles', async () => {
      const res = await dialog.showOpenDialog({
        title: '选择作品或素材文件（支持多选）',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '文档与小说', extensions: ['docx', 'txt', 'md'] }]
      })
      return res.canceled ? [] : res.filePaths
    })
    ipcMain.handle('dialog:pickFolder', async () => {
      const res = await dialog.showOpenDialog({
        title: '选择作品文件夹',
        properties: ['openDirectory']
      })
      return res.canceled ? null : res.filePaths[0] ?? null
    })
    ipcMain.handle('importer:parsePaths', (_, paths: string[]) => this.importer.parsePaths(paths))
    ipcMain.handle(
      'importer:materialize',
      (_, params: { parentDir?: string; title: string; mode: CreationMode; files: ImportedFileItem[] }) => {
        const parent = params.parentDir || this.store.getConfig().workspaceRoot
        return this.importer.materializeIntoProject({ ...params, parentDir: parent })
      }
    )

    // Prompt Orchestration & Context
    ipcMain.handle(
      'prompt:composeScratch',
      (_, params: { mode: CreationMode; subTemplate?: SubTemplateId; title: string; userIdea?: string }) =>
        this.composer.composeFromScratch(params)
    )
    ipcMain.handle(
      'prompt:composeImport',
      (
        _,
        params: {
          mode: CreationMode
          intent: CreationIntent
          customIntentText?: string
          projectTitle: string
          files: ImportedFileItem[]
          userNotes?: string
        }
      ) => this.composer.composeFromImport(params)
    )
    ipcMain.handle(
      'prompt:composeAnnotation',
      (
        _,
        params: {
          mode: CreationMode
          filePath: string
          chapterText: string
          annotations: AnnotationThread[]
          extraNote?: string
        }
      ) => this.composer.composeAnnotationRevision(params)
    )
    ipcMain.handle('context:assemble', (_, projectRoot: string, currentFilePath?: string, mode?: CreationMode) =>
      this.contextAssembler.assemble(projectRoot, currentFilePath, mode)
    )
    ipcMain.handle('skills:list', () => this.skillUpdater.listRegistry())
    ipcMain.handle('skills:checkUpdate', (_, skillId: SkillId) => this.skillUpdater.checkSkillUpdate(skillId))
    ipcMain.handle('skills:pullUpdate', (_, skillId: SkillId) => this.skillUpdater.pullSkillUpdate(skillId))

    // App Self-Updater
    ipcMain.handle('updater:check', () => this.appUpdater.checkForUpdates())
    ipcMain.handle('updater:downloadAndInstall', (_, downloadUrl: string, assetName: string) =>
      this.appUpdater.downloadAndInstall(downloadUrl, assetName, (percent, label) => {
        this.getMainWindow()?.webContents.send('updater:progress', { percent, label })
      })
    )

    // Agents & API Presets
    ipcMain.handle('agents:discover', () => this.refreshLocalAgents())
    ipcMain.handle('agents:testLocal', (_, backend: AgentBackendInfo) => this.discovery.testLocalAgent(backend))
    ipcMain.handle('api:list', () => this.apiPresets.listConfigs())
    ipcMain.handle(
      'api:save',
      (
        _,
        presetId: string,
        patch: { apiKey?: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }
      ) => this.apiPresets.saveConfig(presetId, patch)
    )
    ipcMain.handle('api:test', (_, presetId: string, modelId?: string) => this.apiRunner.testPreset(presetId, modelId))
    ipcMain.handle('api:exportTemplate', () => this.apiPresets.exportTeamTemplate())
    ipcMain.handle('api:importTemplate', (_, jsonText: string) => this.apiPresets.importTeamTemplate(jsonText))

    // Streaming Chat + Optional 1-write-1/2-review pipeline
    ipcMain.handle(
      'chat:send',
      async (
        _,
        params: {
          requestId: string
          selection: AgentSelection
          systemPrompt: string
          userPrompt: string
          projectRoot: string
          targetRelPath?: string
          permissionMode: PermissionMode
          reviewMode?: ReviewMode
          runReviewPipeline?: boolean
          mode?: CreationMode
          title?: string
          sessionId?: string
        }
      ) => {
        const controller = new AbortController()
        this.activeChatControllers.set(params.requestId, controller)
        const emit = (ev: unknown) => this.getMainWindow()?.webContents.send('chat:stream', ev)
        const emitPipeline = (ev: unknown) => {
          if (params.runReviewPipeline && typeof ev === 'object' && ev !== null && (ev as { type?: string }).type === 'done') {
            return
          }
          emit(ev)
        }

        try {
          const result = await this.executeAgentTurn({
            requestId: params.requestId,
            selection: params.selection,
            systemPrompt: params.systemPrompt,
            userPrompt: params.userPrompt,
            projectRoot: params.projectRoot,
            targetRelPath: params.targetRelPath,
            permissionMode: params.permissionMode,
            sessionId: params.sessionId,
            signal: controller.signal,
            onEvent: emitPipeline
          })

          if (!params.runReviewPipeline) return result

          let draft = result.fullText
          const reviewSummaries: string[] = []
          const creationMode = params.mode ?? 'long-novel'
          const bookTitle = params.title ?? path.basename(params.projectRoot)
          const slices = this.contextAssembler.assemble(params.projectRoot, params.targetRelPath, creationMode)
          const refCtx = this.contextAssembler.readEnabledSlices(slices)
          const reviewMode = params.reviewMode ?? 'single'

          if (reviewMode === 'self') {
            emit({ requestId: params.requestId, type: 'status', status: '正在执行自审与自修...' })
            const selfRes = await this.executeAgentTurn({
              requestId: `${params.requestId}_self`,
              selection: params.selection,
              systemPrompt: params.systemPrompt,
              userPrompt: `请对你刚才输出的内容进行严格自审（检查逻辑、正典一致性与 AI 腔），若有问题请直接输出修订后完整终稿：\n\n${draft}`,
              projectRoot: params.projectRoot,
              targetRelPath: params.targetRelPath,
              permissionMode: 'diff-review',
              signal: controller.signal,
              onEvent: () => {}
            })
            if (selfRes.fullText.trim()) draft = selfRes.fullText
            reviewSummaries.push('【自审完成】已完成一轮写作自查自修。')
          } else {
            emit({ requestId: params.requestId, type: 'status', status: '一审独立审查中（逻辑/正典/红线）...' })
            const parsed1 = await this.runReviewPass({
              round: 1,
              mode: creationMode,
              title: bookTitle,
              draftText: draft,
              referenceContext: refCtx,
              projectRoot: params.projectRoot,
              selection: params.selection,
              signal: controller.signal
            })
            reviewSummaries.push(`【一审：${parsed1.verdict}】${stripAgentMarkupForDisplay(parsed1.summary)}`)

            if (parsed1.verdict === 'REVISE') {
              emit({ requestId: params.requestId, type: 'status', status: '一审打回，正在定向修订...' })
              const rev1 = await this.executeAgentTurn({
                requestId: `${params.requestId}_rev1`,
                selection: params.selection,
                systemPrompt: params.systemPrompt,
                userPrompt: `一审审查意见：${parsed1.summary}\n问题：\n${parsed1.issues.join('\n')}\n\n请修复后输出完整修订正文：\n${draft}`,
                projectRoot: params.projectRoot,
                permissionMode: 'diff-review',
                signal: controller.signal,
                onEvent: () => {}
              })
              if (rev1.fullText.trim()) draft = rev1.fullText
            }

            if (reviewMode === 'advanced') {
              emit({ requestId: params.requestId, type: 'status', status: '高级二审中（换第二位独立审查员复核）...' })
              const parsed2 = await this.runReviewPass({
                round: 2,
                mode: creationMode,
                title: bookTitle,
                draftText: draft,
                referenceContext: refCtx,
                projectRoot: params.projectRoot,
                selection: params.selection,
                signal: controller.signal
              })
              reviewSummaries.push(`【二审：${parsed2.verdict}】${stripAgentMarkupForDisplay(parsed2.summary)}`)

              if (parsed2.verdict === 'REVISE') {
                emit({ requestId: params.requestId, type: 'status', status: '二审要求精修，正在润色终稿...' })
                const rev2 = await this.executeAgentTurn({
                  requestId: `${params.requestId}_rev2`,
                  selection: params.selection,
                  systemPrompt: params.systemPrompt,
                  userPrompt: `二审精修意见：${parsed2.summary}\n建议：\n${parsed2.issues.join('\n')}\n\n请精修后输出完整终稿：\n${draft}`,
                  projectRoot: params.projectRoot,
                  permissionMode: 'diff-review',
                  signal: controller.signal,
                  onEvent: () => {}
                })
                if (rev2.fullText.trim()) draft = rev2.fullText
              }
            }
          }

          if (params.targetRelPath) {
            let originalText = ''
            try {
              originalText = this.projectManager.readFile(params.projectRoot, params.targetRelPath).content
            } catch {
              originalText = ''
            }
            emit({
              requestId: params.requestId,
              type: 'diff_proposal',
              proposal: {
                id: `review_diff_${Date.now()}`,
                filePath: params.targetRelPath,
                originalText,
                proposedText: draft,
                summary: `已完成「${reviewMode === 'self' ? '自审' : reviewMode === 'single' ? '单独审查' : '高级审查'}」流水线`,
                status: 'pending',
                createdAt: Date.now()
              }
            })
          }

          const finalOutput = `${reviewSummaries.join('\n')}\n\n${draft}`
          emit({ requestId: params.requestId, type: 'done', fullText: finalOutput, thinkingText: result.thinkingText })
          return { ...result, fullText: finalOutput }
        } finally {
          this.activeChatControllers.delete(params.requestId)
        }
      }
    )
    ipcMain.handle('chat:abort', (_, requestId: string) => {
      const c = this.activeChatControllers.get(requestId)
      if (c) c.abort()
      return Boolean(c)
    })
    ipcMain.handle('chat:historyGet', (_, projectRoot: string) => this.store.getChatMessages(projectRoot))
    ipcMain.handle('chat:historySave', (_, projectRoot: string, messages: never[]) =>
      this.store.saveChatMessages(projectRoot, messages)
    )

    // Review History & One-Click Chapter / Full-Book Review
    ipcMain.handle('reviews:list', (_, projectRoot: string) => this.store.listReviewHistory(projectRoot))
    ipcMain.handle(
      'reviews:runChapter',
      async (
        _,
        params: {
          projectRoot: string
          relPath: string
          mode: CreationMode
          title: string
          reviewMode: ReviewMode
          selection: AgentSelection
        }
      ) => {
        const chapterText = this.projectManager.readFile(params.projectRoot, params.relPath).content
        const lint = await this.pythonRunner.runLintForFile(params.projectRoot, params.relPath, params.mode)
        const slices = this.contextAssembler.assemble(params.projectRoot, params.relPath, params.mode)
        const refCtx = this.contextAssembler.readEnabledSlices(slices)

        const issues: ReviewHistoryEntry['issues'] = lint.issues.map((i) => ({
          severity: i.severity,
          line: i.line,
          message: stripAgentMarkupForDisplay(i.message)
        }))
        const reviewerNames: string[] = []
        const summaries: string[] = []
        let overallVerdict: ReviewHistoryEntry['verdict'] = lint.status === 'fail' ? 'REVISE' : lint.status === 'warn' ? 'WARN' : 'PASS'

        if (params.reviewMode === 'self') {
          const selfRes = await this.executeAgentTurn({
            requestId: `ch_self_${Date.now()}`,
            selection: params.selection,
            systemPrompt: '你是本作的写作 Agent，请客观自审本章逻辑、正典与文风。',
            userPrompt: this.composer.composeReviewPrompt({
              round: 1,
              mode: params.mode,
              title: `${params.title} · ${params.relPath}`,
              draftText: chapterText,
              referenceContext: refCtx
            }),
            projectRoot: params.projectRoot,
            permissionMode: 'diff-review',
            onEvent: () => {}
          })
          const p = parseReviewOutput(selfRes.fullText)
          reviewerNames.push(`${params.selection.backendId}（自审）`)
          summaries.push(stripAgentMarkupForDisplay(p.summary))
          for (const iss of p.issues) issues.push({ severity: p.verdict === 'REVISE' ? 'warn' : 'info', message: stripAgentMarkupForDisplay(iss) })
          if (p.verdict === 'REVISE') overallVerdict = 'REVISE'
        } else {
          const p1 = await this.runReviewPass({
            round: 1,
            mode: params.mode,
            title: `${params.title} · ${params.relPath}`,
            draftText: chapterText,
            referenceContext: refCtx,
            projectRoot: params.projectRoot,
            selection: params.selection
          })
          reviewerNames.push(`一审：${params.selection.model || params.selection.backendId}`)
          summaries.push(`一审意见：${stripAgentMarkupForDisplay(p1.summary)}`)
          for (const iss of p1.issues) issues.push({ severity: p1.verdict === 'REVISE' ? 'error' : 'info', message: stripAgentMarkupForDisplay(iss) })
          if (p1.verdict === 'REVISE') overallVerdict = 'REVISE'

          if (params.reviewMode === 'advanced') {
            const p2 = await this.runReviewPass({
              round: 2,
              mode: params.mode,
              title: `${params.title} · ${params.relPath}`,
              draftText: chapterText,
              referenceContext: refCtx,
              projectRoot: params.projectRoot,
              selection: params.selection
            })
            reviewerNames.push(`二审：${params.selection.model || params.selection.backendId}`)
            summaries.push(`二审意见：${stripAgentMarkupForDisplay(p2.summary)}`)
            for (const iss of p2.issues) issues.push({ severity: p2.verdict === 'REVISE' ? 'warn' : 'info', message: stripAgentMarkupForDisplay(iss) })
            if (p2.verdict === 'REVISE') overallVerdict = 'REVISE'
          }
        }

        const entry: ReviewHistoryEntry = {
          id: `rev_${Date.now()}`,
          createdAt: Date.now(),
          scope: 'chapter',
          targetLabel: path.basename(params.relPath),
          filePath: params.relPath,
          reviewMode: params.reviewMode,
          verdict: overallVerdict,
          summary: summaries.join('；') || '本章已完成审查。',
          issues,
          reviewerNames
        }
        return this.store.appendReviewRecord(params.projectRoot, entry)
      }
    )

    ipcMain.handle(
      'reviews:runFullBook',
      async (
        _,
        params: {
          projectRoot: string
          mode: CreationMode
          title: string
          reviewMode: ReviewMode
          selection: AgentSelection
        }
      ) => {
        const subFolder = params.mode === 'drama-script' ? '剧本' : '正文'
        const proseDir = path.join(params.projectRoot, subFolder)
        const files = fs.existsSync(proseDir)
          ? fs
              .readdirSync(proseDir)
              .filter((f) => /\.(md|txt)$/i.test(f) && !f.includes('声口卡') && !f.includes('写作状态'))
              .sort()
          : []

        const combinedDigest = files
          .slice(0, 30)
          .map((f) => {
            const txt = fs.readFileSync(path.join(proseDir, f), 'utf8')
            return `【${f}】（约 ${txt.replace(/\s+/g, '').length} 字）\n${stripAgentMarkupForDisplay(txt).slice(0, 1200)}`
          })
          .join('\n\n')

        const slices = this.contextAssembler.assemble(params.projectRoot, undefined, params.mode)
        const refCtx = this.contextAssembler.readEnabledSlices(slices)

        const p1 = await this.runReviewPass({
          round: 1,
          mode: params.mode,
          title: `${params.title}（全书共 ${files.length} 篇）`,
          draftText: combinedDigest || '（暂无已撰写正文章节）',
          referenceContext: refCtx,
          projectRoot: params.projectRoot,
          selection: params.selection
        })

        const issues: ReviewHistoryEntry['issues'] = p1.issues.map((iss) => ({
          severity: p1.verdict === 'REVISE' ? 'warn' : 'info',
          message: stripAgentMarkupForDisplay(iss)
        }))
        const summaries = [`全文逻辑与连续性核查：${stripAgentMarkupForDisplay(p1.summary)}`]
        const reviewerNames = [`一审：${params.selection.model || params.selection.backendId}`]
        let verdict: ReviewHistoryEntry['verdict'] = p1.verdict

        if (params.reviewMode === 'advanced') {
          const p2 = await this.runReviewPass({
            round: 2,
            mode: params.mode,
            title: `${params.title}（全书声口与节奏终审）`,
            draftText: combinedDigest || '（暂无已撰写正文章节）',
            referenceContext: refCtx,
            projectRoot: params.projectRoot,
            selection: params.selection
          })
          reviewerNames.push(`二审：${params.selection.model || params.selection.backendId}`)
          summaries.push(`全文声口与节奏终审：${stripAgentMarkupForDisplay(p2.summary)}`)
          for (const iss of p2.issues) {
            issues.push({ severity: p2.verdict === 'REVISE' ? 'warn' : 'info', message: stripAgentMarkupForDisplay(iss) })
          }
          if (p2.verdict === 'REVISE') verdict = 'REVISE'
        }

        const entry: ReviewHistoryEntry = {
          id: `fullrev_${Date.now()}`,
          createdAt: Date.now(),
          scope: 'full-book',
          targetLabel: `全书审校（${files.length} 篇）`,
          reviewMode: params.reviewMode,
          verdict,
          summary: summaries.join('；'),
          issues,
          reviewerNames
        }
        return this.store.appendReviewRecord(params.projectRoot, entry)
      }
    )

    // Annotations
    ipcMain.handle('annotations:list', (_, projectRoot: string, filePath?: string) =>
      this.store.listAnnotations(projectRoot, filePath)
    )
    ipcMain.handle('annotations:upsert', (_, projectRoot: string, thread: AnnotationThread) =>
      this.store.upsertAnnotation(projectRoot, thread)
    )
    ipcMain.handle('annotations:reply', (_, projectRoot: string, annotationId: string, reply: AnnotationReply) =>
      this.store.addAnnotationReply(projectRoot, annotationId, reply)
    )
    ipcMain.handle('annotations:resolve', (_, projectRoot: string, annotationId: string, resolved: boolean) =>
      this.store.resolveAnnotation(projectRoot, annotationId, resolved)
    )
    ipcMain.handle('annotations:delete', (_, projectRoot: string, annotationId: string) =>
      this.store.deleteAnnotation(projectRoot, annotationId)
    )

    // Snapshots
    ipcMain.handle('snapshots:list', (_, projectRoot: string, filePath?: string) =>
      this.store.listSnapshots(projectRoot, filePath)
    )
    ipcMain.handle(
      'snapshots:create',
      (_, projectRoot: string, relPath: string, content: string, source: 'manual' | 'ai-before-apply' | 'auto', summary: string) =>
        this.store.createSnapshot(projectRoot, path.join(projectRoot, relPath), content, source, summary)
    )
    ipcMain.handle('snapshots:getContent', (_, projectRoot: string, snapshotId: string) =>
      this.store.getSnapshotContent(projectRoot, snapshotId)
    )
    ipcMain.handle('snapshots:restore', (_, projectRoot: string, relPath: string, snapshotId: string) => {
      const targetContent = this.store.getSnapshotContent(projectRoot, snapshotId)
      if (targetContent === null) throw new Error('快照内容不存在')
      try {
        const cur = this.projectManager.readFile(projectRoot, relPath).content
        this.store.createSnapshot(projectRoot, path.join(projectRoot, relPath), cur, 'restore-backup', '恢复快照前自动备份')
      } catch {
        // ignore
      }
      this.projectManager.writeFile(projectRoot, relPath, targetContent)
      return targetContent
    })

    // Python Lint & Export
    ipcMain.handle('python:lint', async (_, projectRoot: string, relPath: string, mode: CreationMode) => {
      const report = await this.pythonRunner.runLintForFile(projectRoot, relPath, mode)
      const entry: ReviewHistoryEntry = {
        id: `lint_${Date.now()}`,
        createdAt: report.ranAt,
        scope: 'lint',
        targetLabel: path.basename(relPath),
        filePath: relPath,
        reviewMode: 'lint',
        verdict: report.status === 'fail' ? 'REVISE' : report.status === 'warn' ? 'WARN' : 'PASS',
        summary:
          report.status === 'pass'
            ? `快速体检通过（脚本：${report.scriptName || 'lint'}）`
            : `快速体检发现 ${report.issues.length} 项待关注条目`,
        issues: report.issues.map((i) => ({
          severity: i.severity,
          line: i.line,
          message: stripAgentMarkupForDisplay(i.message)
        })),
        reviewerNames: ['Python 体检镜子']
      }
      this.store.appendReviewRecord(projectRoot, entry)
      return report
    })
    ipcMain.handle(
      'python:export',
      (_, params: { projectRoot: string; title: string; mode: CreationMode; format: 'docx' | 'txt' | 'both'; preset?: 'book' | 'screen' }) =>
        this.pythonRunner.exportProject(params)
    )

    // Market Radar One-Click Scan & Trend Comparison
    ipcMain.handle('radar:list', (_, workspaceRoot?: string) =>
      this.radarService.scanReports(workspaceRoot || this.store.getConfig().workspaceRoot)
    )
    ipcMain.handle('radar:listTrends', () => this.store.listRadarTrends())
    ipcMain.handle(
      'radar:runScan',
      async (
        _,
        params: {
          platform: string
          track: 'short' | 'long' | 'ai-drama' | 'both'
          notes?: string
          selection: AgentSelection
        }
      ) => {
        const workspaceRoot = this.store.getConfig().workspaceRoot
        const { systemPrompt, userPrompt, targetFolderName } = this.radarService.buildScanPrompt(params)
        const res = await this.executeAgentTurn({
          requestId: `radar_${Date.now()}`,
          selection: params.selection,
          systemPrompt,
          userPrompt,
          projectRoot: workspaceRoot,
          permissionMode: 'diff-review',
          onEvent: () => {}
        })
        const created = this.radarService.saveScanResult(workspaceRoot, targetFolderName, res.fullText)
        return { created, reports: this.radarService.scanReports(workspaceRoot) }
      }
    )
    ipcMain.handle(
      'radar:compareTrends',
      async (_, params: { folderNames: string[]; selection: AgentSelection }) => {
        const workspaceRoot = this.store.getConfig().workspaceRoot
        const all = this.radarService.scanReports(workspaceRoot)
        const chosen = all.filter((r) => params.folderNames.includes(r.folderName))
        if (chosen.length === 0) throw new Error('请先选择至少一份扫榜报告')
        const res = await this.executeAgentTurn({
          requestId: `trend_${Date.now()}`,
          selection: params.selection,
          systemPrompt: '你是资深网文与短剧市场趋势分析师，输出清晰人类可读的趋势研判，禁止输出工程标记。',
          userPrompt: this.radarService.buildTrendComparePrompt(chosen),
          projectRoot: workspaceRoot,
          permissionMode: 'diff-review',
          onEvent: () => {}
        })
        return this.radarService.saveTrendAnalysis(
          chosen.map((c) => c.folderName),
          res.fullText,
          params.selection
        )
      }
    )

    // Concurrency Queue (Swarm)
    ipcMain.handle('swarm:list', () => this.swarm.listJobs())
    ipcMain.handle('swarm:enqueue', (_, config: SwarmJobConfig) => this.swarm.enqueueJob(config))
    ipcMain.handle('swarm:enqueueBatch', (_, configs: SwarmJobConfig[]) => this.swarm.enqueueBatch(configs))
    ipcMain.handle('swarm:pause', (_, jobId: string) => this.swarm.pauseJob(jobId))
    ipcMain.handle('swarm:resume', (_, jobId: string) => this.swarm.resumeJob(jobId))
    ipcMain.handle('swarm:cancel', (_, jobId: string) => this.swarm.cancelJob(jobId))
    ipcMain.handle('swarm:delete', (_, jobId: string) => this.swarm.deleteJob(jobId))
    ipcMain.handle('swarm:setConcurrency', (_, n: number) => this.swarm.setMaxConcurrency(n))

    // AppData Storage Manager & Licenses
    ipcMain.handle('storage:report', () => this.store.getStorageReport())
    ipcMain.handle('storage:deleteProjectData', (_, projectId: string, scopes: StorageScope[]) => {
      this.store.deleteProjectData(projectId, scopes)
      return this.store.getStorageReport()
    })
    ipcMain.handle('storage:clearSwarm', () => {
      this.store.clearSwarmHistory()
      return this.store.getStorageReport()
    })
    ipcMain.handle('storage:openAppData', () => shell.openPath(this.store.rootDir))
    ipcMain.handle('app:getLicenses', () => {
      const candidates = [
        path.join(process.resourcesPath || '', 'THIRD_PARTY_LICENSES.md'),
        path.resolve(process.cwd(), 'THIRD_PARTY_LICENSES.md')
      ]
      for (const p of candidates) {
        if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8')
      }
      return '未找到 THIRD_PARTY_LICENSES.md'
    })
  }
}
