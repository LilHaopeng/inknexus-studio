import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  AgentBackendInfo,
  AgentSelection,
  AnnotationReply,
  AnnotationThread,
  AppConfig,
  AppUpdateInfo,
  CreationIntent,
  CreationMode,
  ImportedFileItem,
  PermissionMode,
  ProjectCategory,
  RadarReportSummary,
  RadarTrendAnalysis,
  ReviewHistoryEntry,
  ReviewMode,
  SkillId,
  SkillRegistryItem,
  StorageScope,
  StreamChunkEvent,
  SubTemplateId,
  SwarmJob,
  SwarmJobConfig
} from '@shared/types'

const api = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close'),
    confirmClose: (action: 'minimize-to-tray' | 'exit', remember: boolean) =>
      ipcRenderer.invoke('window:confirmClose', action, remember),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    setThemeBackground: (isDark: boolean) => ipcRenderer.invoke('window:setThemeBackground', isDark),
    onCloseRequested: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('window:close-requested', listener)
      return () => {
        ipcRenderer.removeListener('window:close-requested', listener)
      }
    },
    onMaximizedChanged: (cb: (maximized: boolean) => void) => {
      const listener = (_: unknown, maximized: boolean) => cb(maximized)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => {
        ipcRenderer.removeListener('window:maximized-changed', listener)
      }
    }
  },
  app: {
    getInfo: () =>
      ipcRenderer.invoke('app:getInfo') as Promise<{
        version: string
        author: string
        repoUrl: string
        authorUrl: string
      }>,
    openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url)
  },
  config: {
    get: () => ipcRenderer.invoke('config:get') as Promise<AppConfig>,
    save: (patch: Partial<AppConfig>) => ipcRenderer.invoke('config:save', patch) as Promise<AppConfig>
  },
  projects: {
    scan: (workspaceRoot?: string) => ipcRenderer.invoke('projects:scan', workspaceRoot),
    create: (params: { parentDir?: string; title: string; mode: CreationMode; subTemplate?: SubTemplateId }) =>
      ipcRenderer.invoke('projects:create', params),
    assets: (projectRoot: string) => ipcRenderer.invoke('projects:assets', projectRoot),
    readFile: (projectRoot: string, relPath: string) =>
      ipcRenderer.invoke('projects:readFile', projectRoot, relPath) as Promise<{ content: string; mtimeMs: number }>,
    writeFile: (projectRoot: string, relPath: string, content: string, createSnap = false) =>
      ipcRenderer.invoke('projects:writeFile', projectRoot, relPath, content, createSnap),
    createFile: (projectRoot: string, relPath: string, initial?: string) =>
      ipcRenderer.invoke('projects:createFile', projectRoot, relPath, initial),
    openFolder: (targetPath: string) => ipcRenderer.invoke('projects:openFolder', targetPath),
    classify: (projectRoot: string, targetCategory: Exclude<ProjectCategory, 'unclassified'>) =>
      ipcRenderer.invoke('projects:classify', projectRoot, targetCategory),
    deleteFolder: (projectRoot: string) => ipcRenderer.invoke('projects:deleteFolder', projectRoot),
    radarReports: (workspaceRoot?: string) =>
      ipcRenderer.invoke('projects:radarReports', workspaceRoot) as Promise<RadarReportSummary[]>,
    onExternalChange: (cb: (payload: { projectRoot: string; relPath: string }) => void) => {
      const listener = (_: unknown, payload: { projectRoot: string; relPath: string }) => cb(payload)
      ipcRenderer.on('project:external-change', listener)
      return () => {
        ipcRenderer.removeListener('project:external-change', listener)
      }
    }
  },
  canon: {
    list: (projectRoot: string) => ipcRenderer.invoke('canon:list', projectRoot) as Promise<string[]>,
    set: (projectRoot: string, relPath: string, locked: boolean) =>
      ipcRenderer.invoke('canon:set', projectRoot, relPath, locked) as Promise<string[]>
  },
  importer: {
    pickFiles: () => ipcRenderer.invoke('dialog:pickFiles') as Promise<string[]>,
    pickFolder: () => ipcRenderer.invoke('dialog:pickFolder') as Promise<string | null>,
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    parsePaths: (paths: string[]) => ipcRenderer.invoke('importer:parsePaths', paths) as Promise<ImportedFileItem[]>,
    materialize: (params: { parentDir?: string; title: string; mode: CreationMode; files: ImportedFileItem[] }) =>
      ipcRenderer.invoke('importer:materialize', params)
  },
  prompt: {
    composeScratch: (params: { mode: CreationMode; subTemplate?: SubTemplateId; title: string; userIdea?: string }) =>
      ipcRenderer.invoke('prompt:composeScratch', params),
    composeImport: (params: {
      mode: CreationMode
      intent: CreationIntent
      customIntentText?: string
      projectTitle: string
      files: ImportedFileItem[]
      userNotes?: string
    }) => ipcRenderer.invoke('prompt:composeImport', params),
    composeAnnotation: (params: {
      mode: CreationMode
      filePath: string
      chapterText: string
      annotations: AnnotationThread[]
      extraNote?: string
    }) => ipcRenderer.invoke('prompt:composeAnnotation', params),
    assembleContext: (projectRoot: string, currentFilePath?: string, mode?: CreationMode) =>
      ipcRenderer.invoke('context:assemble', projectRoot, currentFilePath, mode),
    listSkills: () => ipcRenderer.invoke('skills:list') as Promise<SkillRegistryItem[]>
  },
  skills: {
    registry: () => ipcRenderer.invoke('skills:list') as Promise<SkillRegistryItem[]>,
    checkUpdate: (skillId: SkillId) => ipcRenderer.invoke('skills:checkUpdate', skillId) as Promise<SkillRegistryItem>,
    pullUpdate: (skillId: SkillId) => ipcRenderer.invoke('skills:pullUpdate', skillId) as Promise<SkillRegistryItem>
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check') as Promise<AppUpdateInfo>,
    downloadAndInstall: (downloadUrl: string, assetName: string) =>
      ipcRenderer.invoke('updater:downloadAndInstall', downloadUrl, assetName),
    onProgress: (cb: (payload: { percent: number; label: string }) => void) => {
      const listener = (_: unknown, payload: { percent: number; label: string }) => cb(payload)
      ipcRenderer.on('updater:progress', listener)
      return () => {
        ipcRenderer.removeListener('updater:progress', listener)
      }
    }
  },
  agents: {
    discover: () => ipcRenderer.invoke('agents:discover') as Promise<AgentBackendInfo[]>,
    testLocal: (backend: AgentBackendInfo) =>
      ipcRenderer.invoke('agents:testLocal', backend) as Promise<{ ok: boolean; message: string }>,
    listApis: () => ipcRenderer.invoke('api:list'),
    saveApi: (
      presetId: string,
      patch: { apiKey?: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }
    ) => ipcRenderer.invoke('api:save', presetId, patch),
    testApi: (presetId: string, modelId?: string) =>
      ipcRenderer.invoke('api:test', presetId, modelId) as Promise<{ ok: boolean; message: string }>,
    exportApiTemplate: () => ipcRenderer.invoke('api:exportTemplate') as Promise<string>,
    importApiTemplate: (jsonText: string) => ipcRenderer.invoke('api:importTemplate', jsonText)
  },
  chat: {
    send: (params: {
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
    }) => ipcRenderer.invoke('chat:send', params),
    abort: (requestId: string) => ipcRenderer.invoke('chat:abort', requestId),
    onStream: (cb: (ev: StreamChunkEvent) => void) => {
      const listener = (_: unknown, ev: StreamChunkEvent) => cb(ev)
      ipcRenderer.on('chat:stream', listener)
      return () => {
        ipcRenderer.removeListener('chat:stream', listener)
      }
    },
    getHistory: (projectRoot: string) => ipcRenderer.invoke('chat:historyGet', projectRoot),
    saveHistory: (projectRoot: string, messages: unknown[]) => ipcRenderer.invoke('chat:historySave', projectRoot, messages)
  },
  reviews: {
    list: (projectRoot: string) => ipcRenderer.invoke('reviews:list', projectRoot) as Promise<ReviewHistoryEntry[]>,
    runChapter: (params: {
      projectRoot: string
      relPath: string
      mode: CreationMode
      title: string
      reviewMode: ReviewMode
      selection: AgentSelection
    }) => ipcRenderer.invoke('reviews:runChapter', params) as Promise<ReviewHistoryEntry[]>,
    runFullBook: (params: {
      projectRoot: string
      mode: CreationMode
      title: string
      reviewMode: ReviewMode
      selection: AgentSelection
    }) => ipcRenderer.invoke('reviews:runFullBook', params) as Promise<ReviewHistoryEntry[]>
  },
  annotations: {
    list: (projectRoot: string, filePath?: string) =>
      ipcRenderer.invoke('annotations:list', projectRoot, filePath) as Promise<AnnotationThread[]>,
    upsert: (projectRoot: string, thread: AnnotationThread) =>
      ipcRenderer.invoke('annotations:upsert', projectRoot, thread) as Promise<AnnotationThread[]>,
    reply: (projectRoot: string, annotationId: string, reply: AnnotationReply) =>
      ipcRenderer.invoke('annotations:reply', projectRoot, annotationId, reply) as Promise<AnnotationThread[]>,
    resolve: (projectRoot: string, annotationId: string, resolved: boolean) =>
      ipcRenderer.invoke('annotations:resolve', projectRoot, annotationId, resolved) as Promise<AnnotationThread[]>,
    delete: (projectRoot: string, annotationId: string) =>
      ipcRenderer.invoke('annotations:delete', projectRoot, annotationId) as Promise<AnnotationThread[]>
  },
  snapshots: {
    list: (projectRoot: string, filePath?: string) => ipcRenderer.invoke('snapshots:list', projectRoot, filePath),
    create: (projectRoot: string, relPath: string, content: string, source: 'manual' | 'ai-before-apply' | 'auto', summary: string) =>
      ipcRenderer.invoke('snapshots:create', projectRoot, relPath, content, source, summary),
    getContent: (projectRoot: string, snapshotId: string) => ipcRenderer.invoke('snapshots:getContent', projectRoot, snapshotId),
    restore: (projectRoot: string, relPath: string, snapshotId: string) =>
      ipcRenderer.invoke('snapshots:restore', projectRoot, relPath, snapshotId) as Promise<string>
  },
  python: {
    lint: (projectRoot: string, relPath: string, mode: CreationMode) =>
      ipcRenderer.invoke('python:lint', projectRoot, relPath, mode),
    export: (params: { projectRoot: string; title: string; mode: CreationMode; format: 'docx' | 'txt' | 'both'; preset?: 'book' | 'screen' }) =>
      ipcRenderer.invoke('python:export', params)
  },
  radar: {
    list: (workspaceRoot?: string) => ipcRenderer.invoke('radar:list', workspaceRoot) as Promise<RadarReportSummary[]>,
    listTrends: () => ipcRenderer.invoke('radar:listTrends') as Promise<RadarTrendAnalysis[]>,
    runScan: (params: {
      platform: string
      track: 'short' | 'long' | 'ai-drama' | 'both'
      notes?: string
      selection: AgentSelection
    }) =>
      ipcRenderer.invoke('radar:runScan', params) as Promise<{
        created: RadarReportSummary
        reports: RadarReportSummary[]
      }>,
    compareTrends: (params: { folderNames: string[]; selection: AgentSelection }) =>
      ipcRenderer.invoke('radar:compareTrends', params) as Promise<RadarTrendAnalysis[]>
  },
  swarm: {
    list: () => ipcRenderer.invoke('swarm:list') as Promise<SwarmJob[]>,
    enqueue: (config: SwarmJobConfig) => ipcRenderer.invoke('swarm:enqueue', config) as Promise<SwarmJob>,
    enqueueBatch: (configs: SwarmJobConfig[]) => ipcRenderer.invoke('swarm:enqueueBatch', configs) as Promise<SwarmJob[]>,
    pause: (jobId: string) => ipcRenderer.invoke('swarm:pause', jobId),
    resume: (jobId: string) => ipcRenderer.invoke('swarm:resume', jobId),
    cancel: (jobId: string) => ipcRenderer.invoke('swarm:cancel', jobId),
    delete: (jobId: string) => ipcRenderer.invoke('swarm:delete', jobId),
    setConcurrency: (n: number) => ipcRenderer.invoke('swarm:setConcurrency', n),
    onUpdate: (cb: (jobs: SwarmJob[]) => void) => {
      const listener = (_: unknown, jobs: SwarmJob[]) => cb(jobs)
      ipcRenderer.on('swarm:update', listener)
      return () => {
        ipcRenderer.removeListener('swarm:update', listener)
      }
    }
  },
  storage: {
    report: () => ipcRenderer.invoke('storage:report'),
    deleteProjectData: (projectId: string, scopes: StorageScope[]) =>
      ipcRenderer.invoke('storage:deleteProjectData', projectId, scopes),
    clearSwarm: () => ipcRenderer.invoke('storage:clearSwarm'),
    clearTempCaches: () => ipcRenderer.invoke('storage:clearTempCaches'),
    openAppData: () => ipcRenderer.invoke('storage:openAppData'),
    getLicenses: () => ipcRenderer.invoke('app:getLicenses') as Promise<string>
  }
}

const installerApi = {
  getDefaults: () =>
    ipcRenderer.invoke('installer:getDefaults') as Promise<{
      version: string
      installDir: string
      requiredBytes: number
      freeBytes: number
      author: string
      repoUrl: string
    }>,
  pickDir: () =>
    ipcRenderer.invoke('installer:pickDir') as Promise<{ installDir: string; freeBytes: number } | null>,
  checkSpace: (targetDir: string) =>
    ipcRenderer.invoke('installer:checkSpace', targetDir) as Promise<{ freeBytes: number; requiredBytes: number }>,
  start: (opts: {
    installDir: string
    createDesktopShortcut: boolean
    createStartMenuShortcut: boolean
    launchOnStartup: boolean
  }) =>
    ipcRenderer.invoke('installer:start', opts) as Promise<{
      ok: boolean
      installDir?: string
      installedExe?: string
      error?: string
    }>,
  onProgress: (
    cb: (ev: { step: 'prepare' | 'copy' | 'configure' | 'done' | 'error'; percent: number; label: string }) => void
  ) => {
    const listener = (
      _: unknown,
      ev: { step: 'prepare' | 'copy' | 'configure' | 'done' | 'error'; percent: number; label: string }
    ) => cb(ev)
    ipcRenderer.on('installer:progress', listener)
    return () => {
      ipcRenderer.removeListener('installer:progress', listener)
    }
  },
  launchApp: (installDir: string) => ipcRenderer.invoke('installer:launchApp', installDir),
  minimize: () => ipcRenderer.invoke('installer:minimize'),
  close: () => ipcRenderer.invoke('installer:close'),
  openExternal: (url: string) => ipcRenderer.invoke('installer:openExternal', url)
}

contextBridge.exposeInMainWorld('inknexus', api)
contextBridge.exposeInMainWorld('inknexusInstaller', installerApi)

export type InkNexusApi = typeof api
export type InkNexusInstallerApi = typeof installerApi
