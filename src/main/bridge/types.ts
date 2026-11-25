import type { AgentSelection, PermissionMode, ReasoningLevel, StreamChunkEvent } from '@shared/types'

export interface AgentExecutionRequest {
  requestId: string
  selection: AgentSelection
  systemPrompt: string
  userPrompt: string
  projectRoot: string
  targetRelPath?: string
  permissionMode: PermissionMode
  sessionId?: string
  signal?: AbortSignal
  onEvent: (ev: StreamChunkEvent) => void
}

export interface AgentExecutionResult {
  fullText: string
  thinkingText: string
  sessionId?: string
}

export interface AgentRunner {
  execute(req: AgentExecutionRequest): Promise<AgentExecutionResult>
}
