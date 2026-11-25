export type ThemeMode = 'aurora-light' | 'aurora-dark' | 'system'
export type EditorReadTheme = 'default' | 'manuscript'
export type EffectsMode = 'full' | 'reduced'
export type CloseBehavior = 'ask' | 'minimize-to-tray' | 'exit'

export type CreationMode = 'long-novel' | 'short-webnovel' | 'drama-script'
export type SubTemplateId =
  | 'long-standard'
  | 'long-deep'
  | 'short-flash'
  | 'short-microdrama'
  | 'drama-ai-real'
  | 'drama-comic'
  | 'drama-shadiao'

export type ImportFileRole =
  | 'world'
  | 'outline'
  | 'prose'
  | 'character'
  | 'style-sample'
  | 'radar-brief'
  | 'full-project'
  | 'custom'

export type CreationIntent =
  | 'write-prose'
  | 'draft-outline'
  | 'expand-world'
  | 'complete-from-outline'
  | 'reverse-outline'
  | 'adapt-to-script'
  | 'audit-and-polish'
  | 'custom'

export type ReasoningLevel = 'off' | 'low' | 'medium' | 'high' | 'max'
export type ReviewMode = 'self' | 'single' | 'advanced'
export type PermissionMode = 'diff-review' | 'auto-write'

export type SkillId =
  | 'story-world-architect'
  | 'story-outline-architect'
  | 'story-prose-writer'
  | 'webnovel-short-studio'
  | 'webnovel-market-radar'
  | 'ai-drama-script-studio'

export interface AppConfig {
  theme: ThemeMode
  editorReadTheme: EditorReadTheme
  effectsMode: EffectsMode
  workspaceRoot: string
  permissionMode: PermissionMode
  defaultAgentId: string
  defaultModel: string
  defaultReasoning: ReasoningLevel
  defaultReviewMode: ReviewMode
  maxSwarmConcurrency: number
  fontFamily: 'serif' | 'sans'
  fontSize: number
  lineHeight: number
  firstLineIndent: boolean
  wordGoalPerChapter: number
  maxSnapshotsPerFile: number
  closeBehavior: CloseBehavior
}

export interface ProjectSummary {
  id: string
  title: string
  rootPath: string
  mode: CreationMode
  tags: string[]
  chapterCount: number
  wordCount: number
  lastModified: number
  lastOpenedFile?: string
  pinned?: boolean
}

export type SemanticCategory =
  | 'world'
  | 'character'
  | 'outline'
  | 'style'
  | 'prose'
  | 'tracking'
  | 'reference'
  | 'delivery'

export interface AssetNode {
  id: string
  name: string
  relPath: string
  absPath: string
  isDirectory: boolean
  category: SemanticCategory
  locked?: boolean
  wordCount?: number
  children?: AssetNode[]
}

export type AnnotationCategory = 'logic' | 'style' | 'plot' | 'memo'

export interface AnnotationReply {
  id: string
  author: string
  body: string
  createdAt: number
}

export interface AnnotationThread {
  id: string
  filePath: string
  quote: string
  from: number
  to: number
  category: AnnotationCategory
  author: string
  body: string
  replies: AnnotationReply[]
  resolved: boolean
  createdAt: number
}

export interface SnapshotRecord {
  id: string
  filePath: string
  source: 'manual' | 'ai-before-apply' | 'auto' | 'restore-backup'
  summary: string
  createdAt: number
  sizeBytes: number
}

export interface DiffProposal {
  id: string
  filePath: string
  originalText: string
  proposedText: string
  summary: string
  annotationIds?: string[]
  status: 'pending' | 'applied' | 'rejected'
  createdAt: number
}

export interface ContextSlice {
  id: string
  label: string
  relPath: string
  absPath: string
  tokens: number
  enabled: boolean
  reason: string
}

export interface ImportedFileItem {
  id: string
  sourcePath: string
  fileName: string
  ext: string
  role: ImportFileRole
  customRoleLabel?: string
  previewText: string
  markdownContent: string
  charCount: number
  error?: string
}

export interface PreComposedPrompt {
  systemPrompt: string
  userDraftPrompt: string
  attachedSkillIds: SkillId[]
  summaryLabel: string
  taskTitle: string
}

export interface AgentBackendInfo {
  id: string
  kind: 'acp' | 'cli' | 'api'
  name: string
  description: string
  status: 'available' | 'not-installed' | 'error' | 'configured' | 'unconfigured'
  executablePath?: string
  version?: string
  models: string[]
  supportedReasoning: ReasoningLevel[]
  supportsStreamingThinking: boolean
  errorMessage?: string
}

export interface ApiProviderPreset {
  id: string
  name: string
  vendor: string
  baseUrl: string
  protocol: 'openai-compatible' | 'openai' | 'anthropic' | 'google' | 'deepseek'
  defaultModels: string[]
  requiresEndpointId?: boolean
  thinkingSupport: 'toggle' | 'budget' | 'effort' | 'model-switch' | 'none'
  docHint: string
}

export interface ApiProviderConfig {
  presetId: string
  name: string
  baseUrl: string
  protocol: ApiProviderPreset['protocol']
  models: string[]
  endpointId?: string
  enabled: boolean
  hasApiKey: boolean
}

export interface AgentSelection {
  backendId: string
  model: string
  reasoning: ReasoningLevel
}

export type StreamChunkEvent =
  | { requestId: string; type: 'status'; status: string }
  | { requestId: string; type: 'thinking_delta'; delta: string }
  | { requestId: string; type: 'text_delta'; delta: string }
  | { requestId: string; type: 'tool_call'; toolName: string; argsPreview: string }
  | { requestId: string; type: 'tool_result'; toolName: string; summary: string }
  | { requestId: string; type: 'diff_proposal'; proposal: DiffProposal }
  | { requestId: string; type: 'session'; sessionId: string }
  | { requestId: string; type: 'done'; fullText: string; thinkingText: string }
  | { requestId: string; type: 'error'; message: string }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  toolLogs?: Array<{ toolName: string; detail: string }>
  proposal?: DiffProposal
  reviewVerdict?: {
    round: 1 | 2
    verdict: 'PASS' | 'REVISE'
    reviewerLabel: string
    summary: string
  }
  timestamp: number
}

export type SwarmStage =
  | 'queued'
  | 'writing'
  | 'linting'
  | 'self_review'
  | 'review_round_1'
  | 'revising_1'
  | 'review_round_2'
  | 'revising_2'
  | 'awaiting_user'
  | 'paused'
  | 'failed'
  | 'cancelled'

export interface SwarmJobConfig {
  title: string
  projectRoot: string
  targetRelPath: string
  mode: CreationMode
  prompt: string
  reviewMode: ReviewMode
  writer: AgentSelection
  reviewer1?: AgentSelection
  reviewer2?: AgentSelection
  maxRevisions?: number
}

export interface SwarmJobLog {
  timestamp: number
  stage: SwarmStage
  message: string
}

export interface SwarmJob {
  id: string
  config: SwarmJobConfig
  stage: SwarmStage
  revisionRound: number
  progressLabel: string
  draftOutput?: string
  proposal?: DiffProposal
  reviewReports: Array<{
    round: number
    reviewer: string
    verdict: 'PASS' | 'REVISE'
    summary: string
    issues: string[]
    timestamp: number
  }>
  logs: SwarmJobLog[]
  error?: string
  createdAt: number
  updatedAt: number
}

export interface LintIssue {
  severity: 'error' | 'warn' | 'info'
  line?: number
  rule?: string
  message: string
}

export interface LintReport {
  status: 'pass' | 'warn' | 'fail' | 'not-run'
  scriptName?: string
  issues: LintIssue[]
  metrics: Record<string, string | number>
  rawOutput: string
  ranAt: number
}

export type StorageScope = 'annotations' | 'snapshots' | 'chat' | 'reviews' | 'all'

export interface ProjectStorageBreakdown {
  projectId: string
  title: string
  rootPath: string
  annotationsBytes: number
  snapshotsBytes: number
  chatBytes: number
  reviewsBytes: number
  totalBytes: number
  snapshotCount: number
  annotationCount: number
}

export interface AppDataStorageReport {
  rootDir: string
  totalBytes: number
  swarmBytes: number
  projects: ProjectStorageBreakdown[]
}

export interface RadarReportSummary {
  folderName: string
  folderPath: string
  hasScanReport: boolean
  hasTopicBrief: boolean
  scanDate?: string
  platform?: string
  track?: string
  sampleCount?: string
  qualityStatus?: string
  scanSnippet?: string
  briefSnippet?: string
  scanFullText?: string
  briefFullText?: string
}

export interface ReviewHistoryEntry {
  id: string
  createdAt: number
  scope: 'chapter' | 'full-book' | 'lint'
  targetLabel: string
  filePath?: string
  reviewMode: ReviewMode | 'lint'
  verdict: 'PASS' | 'REVISE' | 'WARN'
  summary: string
  issues: Array<{ severity: 'error' | 'warn' | 'info'; message: string; line?: number }>
  reviewerNames: string[]
}

export interface SkillRegistryItem {
  id: SkillId
  name: string
  repoOwner: string
  repoName: string
  repoUrl: string
  localVersion: string
  remoteVersion?: string
  localSha?: string
  remoteSha?: string
  hasUpdate?: boolean
  checkedAt?: number
  summary: string
  scripts: string[]
}

export interface AppUpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseNotes: string
  releaseUrl: string
  downloadUrl?: string
  assetName?: string
  assetSize?: number
  checkedAt: number
}

export interface RadarTrendAnalysis {
  id: string
  createdAt: number
  comparedFolders: string[]
  summary: string
}
