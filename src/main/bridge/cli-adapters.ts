import { spawn } from 'child_process'
import type { AgentBackendInfo } from '@shared/types'
import { mapReasoningLevel } from './reasoning-map'
import type { AgentExecutionRequest, AgentExecutionResult } from './types'

function sanitizeProxyEnvForDsh(baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...baseEnv }
  for (const key of ['all_proxy', 'ALL_PROXY', 'https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY']) {
    const val = env[key]
    if (val && /^socks/i.test(val.trim())) {
      delete env[key]
    }
  }
  return env
}

export class CliSubprocessRunner {
  async run(backend: AgentBackendInfo, req: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (!backend.executablePath) {
      throw new Error(`未找到本地 Agent：${backend.name}`)
    }

    const mapped = mapReasoningLevel(backend.id, req.selection.reasoning, req.selection.model)
    if (mapped.mappedNote) {
      req.onEvent({ requestId: req.requestId, type: 'status', status: mapped.mappedNote })
    }

    const combinedPrompt = `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`
    let cmd = backend.executablePath
    let args: string[] = []
    let env: NodeJS.ProcessEnv = { ...process.env }

    if (backend.id === 'agy-cli') {
      args = ['-p', '--output-format', 'stream-json']
      if (req.selection.model) args.push('--model', req.selection.model)
      args.push('--effort', String(mapped.nativeValue))
      if (req.permissionMode === 'auto-write') {
        args.push('--mode', 'accept-edits')
      } else {
        args.push('--mode', 'plan')
      }
      if (req.sessionId) args.push('--conversation', req.sessionId)
    } else if (backend.id === 'codex-cli') {
      cmd = 'cmd.exe'
      const innerArgs = [
        '/c',
        backend.executablePath,
        'exec',
        '--json',
        '--skip-git-repo-check',
        '-C',
        req.projectRoot
      ]
      if (req.selection.model) innerArgs.push('-m', req.selection.model)
      innerArgs.push('-c', `model_reasoning_effort=${String(mapped.nativeValue)}`)
      innerArgs.push('-s', req.permissionMode === 'auto-write' ? 'workspace-write' : 'read-only')
      innerArgs.push('-')
      args = innerArgs
    } else if (backend.id === 'dsh-cli') {
      env = sanitizeProxyEnvForDsh(env)
      cmd = 'cmd.exe'
      args = ['/c', backend.executablePath, '--profile', 'headless', '--json']
      if (req.sessionId) args.push('--session-id', req.sessionId)
      args.push('--permission-mode', req.permissionMode === 'auto-write' ? 'workspace-write' : 'read-only')
      args.push('-')
    } else if (backend.id === 'claude-cli') {
      cmd = 'cmd.exe'
      args = ['/c', backend.executablePath, '-p', '--output-format', 'stream-json']
      if (req.selection.model) args.push('--model', req.selection.model)
      if (req.sessionId) args.push('--resume', req.sessionId)
    } else {
      const isCmd = /\.(cmd|bat)$/i.test(backend.executablePath)
      if (isCmd) {
        cmd = 'cmd.exe'
        args = ['/c', backend.executablePath, '-p', '--output-format', 'stream-json']
      } else {
        args = ['-p', '--output-format', 'stream-json']
      }
    }

    req.onEvent({ requestId: req.requestId, type: 'status', status: `正在调用 ${backend.name}...` })

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: req.projectRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })

      let fullText = ''
      let thinkingText = ''
      let sessionId = req.sessionId
      let stdoutBuf = ''
      let stderrBuf = ''

      const onAbort = () => {
        try {
          child.kill()
        } catch {
          // ignore
        }
        reject(new Error('用户已停止生成'))
      }
      req.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8')
        const lines = stdoutBuf.split(/\r?\n/)
        stdoutBuf = lines.pop() ?? ''

        for (const rawLine of lines) {
          const line = rawLine.trim()
          if (!line) continue
          try {
            const ev = JSON.parse(line) as Record<string, unknown>
            if (typeof ev.session_id === 'string') {
              sessionId = ev.session_id
              req.onEvent({ requestId: req.requestId, type: 'session', sessionId })
            }
            if (typeof ev.conversation_id === 'string') {
              sessionId = ev.conversation_id
              req.onEvent({ requestId: req.requestId, type: 'session', sessionId })
            }

            const deltaText = extractTextFromJsonEvent(ev)
            if (deltaText.thinking) {
              thinkingText += deltaText.thinking
              req.onEvent({ requestId: req.requestId, type: 'thinking_delta', delta: deltaText.thinking })
            }
            if (deltaText.text) {
              fullText += deltaText.text
              req.onEvent({ requestId: req.requestId, type: 'text_delta', delta: deltaText.text })
            }
            if (deltaText.toolName) {
              req.onEvent({
                requestId: req.requestId,
                type: 'tool_call',
                toolName: deltaText.toolName,
                argsPreview: deltaText.toolArgs ?? ''
              })
            }
          } catch {
            // Plain text fallback line
            fullText += line + '\n'
            req.onEvent({ requestId: req.requestId, type: 'text_delta', delta: line + '\n' })
          }
        }
      })

      child.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8')
      })

      child.on('error', (err) => {
        req.signal?.removeEventListener('abort', onAbort)
        req.onEvent({ requestId: req.requestId, type: 'error', message: err.message })
        reject(err)
      })

      child.on('close', (code) => {
        req.signal?.removeEventListener('abort', onAbort)
        if (stdoutBuf.trim()) {
          try {
            const ev = JSON.parse(stdoutBuf.trim()) as Record<string, unknown>
            const d = extractTextFromJsonEvent(ev)
            if (d.text) {
              fullText += d.text
              req.onEvent({ requestId: req.requestId, type: 'text_delta', delta: d.text })
            }
          } catch {
            fullText += stdoutBuf.trim()
            req.onEvent({ requestId: req.requestId, type: 'text_delta', delta: stdoutBuf.trim() })
          }
        }
        if (code !== 0 && !fullText.trim()) {
          const msg = stderrBuf.trim() || `Agent 进程退出（代码 ${code}）`
          req.onEvent({ requestId: req.requestId, type: 'error', message: msg })
          reject(new Error(msg))
          return
        }
        req.onEvent({ requestId: req.requestId, type: 'done', fullText, thinkingText })
        resolve({ fullText, thinkingText, sessionId })
      })

      child.stdin.write(combinedPrompt, 'utf8')
      child.stdin.end()
    })
  }
}

function extractTextFromJsonEvent(ev: Record<string, unknown>): {
  text?: string
  thinking?: string
  toolName?: string
  toolArgs?: string
} {
  if (ev.type === 'assistant' && ev.message && typeof ev.message === 'object') {
    const msg = ev.message as { content?: Array<{ type?: string; text?: string; thinking?: string; name?: string }> }
    const out: { text?: string; thinking?: string; toolName?: string } = {}
    for (const part of msg.content ?? []) {
      if (part.type === 'text' && part.text) out.text = (out.text ?? '') + part.text
      if (part.type === 'thinking' && part.thinking) out.thinking = (out.thinking ?? '') + part.thinking
      if (part.type === 'tool_use' && part.name) out.toolName = part.name
    }
    return out
  }
  if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta === 'object') {
    const d = ev.delta as { type?: string; text?: string; thinking?: string }
    if (d.type === 'thinking_delta' && d.thinking) return { thinking: d.thinking }
    if (d.text) return { text: d.text }
  }
  if (ev.type === 'item.completed' && ev.item && typeof ev.item === 'object') {
    const item = ev.item as { type?: string; text?: string; name?: string }
    if (item.type === 'agent_message' && item.text) return { text: item.text }
    if (item.type === 'reasoning' && item.text) return { thinking: item.text }
    if (item.type === 'command_execution') return { toolName: 'command_execution' }
  }
  if (ev.type === 'result' && typeof ev.result === 'string') {
    return { text: ev.result }
  }
  if (typeof ev.delta === 'string') return { text: ev.delta }
  if (typeof ev.text === 'string') return { text: ev.text }
  return {}
}
