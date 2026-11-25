import { create } from 'zustand'
import type {
  AgentBackendInfo,
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
  agentSelection: AgentSelection
  localAgents: AgentBackendInfo[]
  apiConfigs: ApiProviderConfig[]
  lintReport: LintReport | null
  reviewHistory: ReviewHistoryEntry[]
  skillRegistry: SkillRegistryItem[]
  appInfo: { version: string; author: string; repoUrl: string }
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
  setStreamingState: (patch: Partial<Pick<StudioState, 'isGenerating' | 'activeRequestId' | 'streamingText' | 'streamingThinking' | 'statusText'>>) => void
  setReviewMode: (mode: ReviewMode) => void
  setAgentSelection: (sel: AgentSelection) => void
  setLocalAgents: (list: AgentBackendInfo[]) => void
  setApiConfigs: (list: ApiProviderConfig[]) => void
  setLintReport: (report: LintReport | null) => void
  setReviewHistory: (list: ReviewHistoryEntry[]) => void
  setSkillRegistry: (list: SkillRegistryItem[]) => void
  setAppInfo: (info: { version: string; author: string; repoUrl: string }) => void
  setSwarmJobs: (jobs: SwarmJob[]) => void
  setStorageReport: (report: AppDataStorageReport | null) => void
  setExternalChangedRelPath: (relPath: string | null) => void
}

export const useStudioStore = create<StudioState>((set) => ({
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
  agentSelection: {
    backendId: 'agy-cli',
    model: 'gemini-4-neon-high',
    reasoning: 'high'
  },
  localAgents: [],
  apiConfigs: [],
  lintReport: null,
  reviewHistory: [],
  skillRegistry: [],
  appInfo: { version: '1.0.0', author: '@LilHaopeng', repoUrl: 'https://github.com/LilHaopeng/inknexus-studio' },
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
  setStreamingState: (patch) => set((s) => ({ ...s, ...patch })),
  setReviewMode: (reviewMode) => set({ reviewMode }),
  setAgentSelection: (agentSelection) => set({ agentSelection }),
  setLocalAgents: (localAgents) => set({ localAgents }),
  setApiConfigs: (apiConfigs) => set({ apiConfigs }),
  setLintReport: (lintReport) => set({ lintReport }),
  setReviewHistory: (reviewHistory) => set({ reviewHistory }),
  setSkillRegistry: (skillRegistry) => set({ skillRegistry }),
  setAppInfo: (appInfo) => set({ appInfo }),
  setSwarmJobs: (swarmJobs) => set({ swarmJobs }),
  setStorageReport: (storageReport) => set({ storageReport }),
  setExternalChangedRelPath: (externalChangedRelPath) => set({ externalChangedRelPath })
}))
