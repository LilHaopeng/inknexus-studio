import { spawn } from 'child_process'
import { Writable, Readable } from 'stream'
import * as acp from '@agentclientprotocol/sdk'
import type { AgentExecutionRequest, AgentExecutionResult } from './types'

export class AcpBridgeRunner {
  async run(
    executablePath: string,
    extraArgs: string[],
    req: AgentExecutionRequest
  ): Promise<AgentExecutionResult> {
    const isCmd = /\.(cmd|bat)$/i.test(executablePath)
    const child = isCmd
      ? spawn('cmd.exe', ['/c', executablePath, ...extraArgs], {
          cwd: req.projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })
      : spawn(executablePath, extraArgs, {
          cwd: req.projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true
        })

    const onAbort = () => {
      try {
        child.kill()
      } catch {
        // ignore
      }
    }
    req.signal?.addEventListener('abort', onAbort, { once: true })

    let fullText = ''
    let thinkingText = ''

    try {
      const input = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>
      const output = Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
      const stream = acp.ndJsonStream(input, output)

      const client: acp.Client = {
        async requestPermission() {
          return {
            outcome: {
              outcome: req.permissionMode === 'auto-write' ? 'selected' : 'cancelled',
              ...(req.permissionMode === 'auto-write' ? { optionId: 'allow_once' } : {})
            }
          } as acp.RequestPermissionResponse
        },
        async sessionUpdate(params: acp.SessionNotification) {
          const update = params.update as unknown as Record<string, unknown>
          if (update.sessionUpdate === 'agent_message_chunk') {
            const content = update.content as { type?: string; text?: string } | undefined
            if (content?.text) {
              fullText += content.text
              req.onEvent({ requestId: req.requestId, type: 'text_delta', delta: content.text })
            }
          } else if (update.sessionUpdate === 'agent_thought_chunk') {
            const content = update.content as { type?: string; text?: string } | undefined
            if (content?.text) {
              thinkingText += content.text
              req.onEvent({ requestId: req.requestId, type: 'thinking_delta', delta: content.text })
            }
          } else if (update.sessionUpdate === 'tool_call') {
            req.onEvent({
              requestId: req.requestId,
              type: 'tool_call',
              toolName: String(update.title ?? update.toolCallId ?? 'tool'),
              argsPreview: ''
            })
          }
        }
      }

      const connection = new acp.ClientSideConnection(() => client, stream)
      await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {}
      })

      const session = await connection.newSession({
        cwd: req.projectRoot,
        mcpServers: []
      })

      const combinedPrompt = `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`
      req.onEvent({ requestId: req.requestId, type: 'status', status: 'running' })

      await connection.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text: combinedPrompt }]
      })

      req.onEvent({ requestId: req.requestId, type: 'done', fullText, thinkingText })
      return { fullText, thinkingText, sessionId: session.sessionId }
    } finally {
      req.signal?.removeEventListener('abort', onAbort)
      try {
        child.kill()
      } catch {
        // ignore
      }
    }
  }
}
