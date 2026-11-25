import { create } from 'zustand'
import type {
  ActiveWorkEntry,
  AgentBackendInfo,
  AgentCommsMessage,
  AgentRoleId,
  AgentSelection,
  AnnotationThread,
  ApiProviderConfig,
  AppConfig,
  AppDataStorageReport,
  AssetNode,
  ChatMessage,
  ContextSlice,
  DiffProposal,
  LintReport,
  PreComposedPrompt,
  ProjectSummary,
  ReviewHistoryEntry,
  ReviewMode,
  SkillRegistryItem,
  SwarmJob
} from '@shared/types'

export type NavPage = 'home' | 'projects' | 'swarm' | 'radar' | 'settings' | 'workbench'

interface OpenDocTab {
  relPath: string
  name: string
  content: string
  savedContent: string
  dirty: boolean
  locked: boolean
}

interface StudioState {
  page: NavPage
  config: AppConfig | null
  projects: ProjectSummary[]
  activeProject: ProjectSummary | null
  assets: AssetNode[]
  canonLocks: string[]
  openTabs: OpenDocTab[]
  activeTabRelPath: string | null
  annotations: AnnotationThread[]
  activeAnnotationId: string | null
  pendingProposal: DiffProposal | null
  contextSlices: ContextSlice[]
  preComposedPrompt: PreComposedPrompt | null
  chatMessages: ChatMessage[]
  isGenerating: boolean
  activeRequestId: string | null
  streamingText: string
  streamingThinking: string
  statusText: string
  reviewMode: ReviewMode
  reviewModeConfirmed: boolean
  agentSelection: AgentSelection
  roleAgentOverrides: Record<string, Partial<Record<AgentRoleId, AgentSelection>>>
  agentCommsByProject: Record<string, AgentCommsMessage[]>
  activeWorks: Record<string, ActiveWorkEntry>
  localAgents: AgentBackendInfo[]
  apiConfigs: ApiProviderConfig[]
  lintReport: LintReport | null
  reviewHistory: ReviewHistoryEntry[]
  skillRegistry: SkillRegistryItem[]
  appInfo: { version: string; author: string; repoUrl: string; authorUrl: string }
  swarmJobs: SwarmJob[]
  storageReport: AppDataStorageReport | null
  externalChangedRelPath: string | null

  setPage: (page: NavPage) => void
  setConfig: (config: AppConfig) => void
  setProjects: (projects: ProjectSummary[]) => void
  setActiveProject: (project: ProjectSummary | null) => void
  setAssets: (assets: AssetNode[]) => void
  setCanonLocks: (locks: string[]) => void
  openOrFocusTab: (tab: OpenDocTab) => void
  updateTabContent: (relPath: string, content: string, markSaved?: boolean) => void
  closeTab: (relPath: string) => void
  setActiveTab: (relPath: string) => void
  setAnnotations: (list: AnnotationThread[]) => void
  setActiveAnnotationId: (id: string | null) => void
  setPendingProposal: (proposal: DiffProposal | null) => void
  setContextSlices: (slices: ContextSlice[]) => void
  toggleContextSlice: (id: string) => void
  setPreComposedPrompt: (prompt: PreComposedPrompt | null) => void
  setChatMessages: (msgs: ChatMessage[]) => void
  appendChatMessage: (msg: ChatMessage) => void
  updateChatMessage: (id: string, patch: Partial<ChatMessage>) => void
  setStreamingState: (patch: Partial<Pick<StudioState, 'isGenerating' | 'activeRequestId' | 'streamingText' | 'streamingThinking' | 'statusText'>>) => void
  setReviewMode: (mode: ReviewMode, confirmed?: boolean) => void
  setAgentSelection: (sel: AgentSelection) => void
  setRoleAgentOverride: (projectRoot: string, role: AgentRoleId, sel: AgentSelection) => void
  ensureRoleAgentSnapshot: (projectRoot: string, role: AgentRoleId) => AgentSelection
  appendAgentComm: (msg: Omit<AgentCommsMessage, 'id' | 'timestamp'>) => void
  setActiveWork: (entry: ActiveWorkEntry) => void
  setLocalAgents: (list: AgentBackendInfo[]) => void
  setApiConfigs: (list: ApiProviderConfig[]) => void
  setLintReport: (report: LintReport | null) => void
  setReviewHistory: (list: ReviewHistoryEntry[]) => void
  setSkillRegistry: (list: SkillRegistryItem[]) => void
  setAppInfo: (info: { version: string; author: string; repoUrl: string; authorUrl?: string }) => void
  setSwarmJobs: (jobs: SwarmJob[]) => void
  setStorageReport: (report: AppDataStorageReport | null) => void
  setExternalChangedRelPath: (relPath: string | null) => void
}

export const useStudioStore = create<StudioState>((set, get) => ({
  page: 'home',
  config: null,
  projects: [],
  activeProject: null,
  assets: [],
  canonLocks: [],
  openTabs: [],
  activeTabRelPath: null,
  annotations: [],
  activeAnnotationId: null,
  pendingProposal: null,
  contextSlices: [],
  preComposedPrompt: null,
  chatMessages: [],
  isGenerating: false,
  activeRequestId: null,
  streamingText: '',
  streamingThinking: '',
  statusText: '',
  reviewMode: 'single',
  reviewModeConfirmed: false,
  agentSelection: {
    backendId: 'agy-cli',
    model: 'gemini-4-neon',
    reasoning: 'high'
  },
  roleAgentOverrides: {},
  agentCommsByProject: {},
  activeWorks: {},
  localAgents: [],
  apiConfigs: [],
  lintReport: null,
  reviewHistory: [],
  skillRegistry: [],
  appInfo: {
    version: '1.0.1',
    author: '@LilHaopeng',
    repoUrl: 'https://github.com/LilHaopeng/inknexus-studio',
    authorUrl: 'https://github.com/LilHaopeng'
  },
  swarmJobs: [],
  storageReport: null,
  externalChangedRelPath: null,

  setPage: (page) => set({ page }),
  setConfig: (config) => set({ config }),
  setProjects: (projects) => set({ projects }),
  setActiveProject: (activeProject) => set({ activeProject }),
  setAssets: (assets) => set({ assets }),
  setCanonLocks: (canonLocks) => set({ canonLocks }),
  openOrFocusTab: (tab) =>
    set((s) => {
      const exists = s.openTabs.find((t) => t.relPath === tab.relPath)
      if (exists) {
        return {
          openTabs: s.openTabs.map((t) => (t.relPath === tab.relPath ? { ...t, locked: tab.locked } : t)),
          activeTabRelPath: tab.relPath
        }
      }
      return { openTabs: [...s.openTabs, tab], activeTabRelPath: tab.relPath }
    }),
  updateTabContent: (relPath, content, markSaved = false) =>
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.relPath === relPath
          ? {
              ...t,
              content,
              savedContent: markSaved ? content : t.savedContent,
              dirty: markSaved ? false : content !== t.savedContent
            }
          : t
      )
    })),
  closeTab: (relPath) =>
    set((s) => {
      const next = s.openTabs.filter((t) => t.relPath !== relPath)
      const active =
        s.activeTabRelPath === relPath ? next[next.length - 1]?.relPath ?? null : s.activeTabRelPath
      return { openTabs: next, activeTabRelPath: active }
    }),
  setActiveTab: (activeTabRelPath) => set({ activeTabRelPath }),
  setAnnotations: (annotations) => set({ annotations }),
  setActiveAnnotationId: (activeAnnotationId) => set({ activeAnnotationId }),
  setPendingProposal: (pendingProposal) => set({ pendingProposal }),
  setContextSlices: (contextSlices) => set({ contextSlices }),
  toggleContextSlice: (id) =>
    set((s) => ({
      contextSlices: s.contextSlices.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c))
    })),
  setPreComposedPrompt: (preComposedPrompt) => set({ preComposedPrompt }),
  setChatMessages: (chatMessages) => set({ chatMessages }),
  appendChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  updateChatMessage: (id, patch) =>
    set((s) => ({
      chatMessages: s.chatMessages.map((m) => (m.id === id ? { ...m, ...patch } : m))
    })),
  setStreamingState: (patch) => set((s) => ({ ...s, ...patch })),
  setReviewMode: (reviewMode, confirmed) =>
    set((s) => ({
      reviewMode,
      reviewModeConfirmed: confirmed !== undefined ? confirmed : s.reviewModeConfirmed
    })),
  setAgentSelection: (agentSelection) => set({ agentSelection }),
  setRoleAgentOverride: (projectRoot, role, sel) =>
    set((s) => {
      const key = projectRoot.toLowerCase()
      return {
        roleAgentOverrides: {
          ...s.roleAgentOverrides,
          [key]: {
            ...(s.roleAgentOverrides[key] ?? {}),
            [role]: sel
          }
        },
        ...(role === 'coordinator' ? { agentSelection: sel } : {})
      }
    }),
  ensureRoleAgentSnapshot: (projectRoot, role) => {
    const state = get()
    const key = projectRoot.toLowerCase()
    const existing = state.roleAgentOverrides[key]?.[role]
    if (existing) return existing
    const coordinatorSel = state.roleAgentOverrides[key]?.coordinator ?? state.agentSelection
    set((s) => ({
      roleAgentOverrides: {
        ...s.roleAgentOverrides,
        [key]: {
          ...(s.roleAgentOverrides[key] ?? {}),
          [role]: { ...coordinatorSel }
        }
      }
    }))
    return coordinatorSel
  },
  appendAgentComm: (msg) =>
    set((s) => {
      const key = msg.projectRoot.toLowerCase()
      const prev = s.agentCommsByProject[key] ?? []
      const entry: AgentCommsMessage = {
        ...msg,
        id: `comm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now()
      }
      return {
        agentCommsByProject: {
          ...s.agentCommsByProject,
          [key]: [...prev, entry].slice(-120)
        }
      }
    }),
  setActiveWork: (entry) =>
    set((s) => {
      const key = entry.projectRoot.toLowerCase()
      return {
        activeWorks: {
          ...s.activeWorks,
          [key]: entry
        }
      }
    }),
  setLocalAgents: (localAgents) => set({ localAgents }),
  setApiConfigs: (apiConfigs) => set({ apiConfigs }),
  setLintReport: (lintReport) => set({ lintReport }),
  setReviewHistory: (reviewHistory) => set({ reviewHistory }),
  setSkillRegistry: (skillRegistry) => set({ skillRegistry }),
  setAppInfo: (info) =>
    set({
      appInfo: {
        ...info,
        authorUrl: info.authorUrl || 'https://github.com/LilHaopeng'
      }
    }),
  setSwarmJobs: (swarmJobs) => set({ swarmJobs }),
  setStorageReport: (storageReport) => set({ storageReport }),
  setExternalChangedRelPath: (externalChangedRelPath) => set({ externalChangedRelPath })
}))
