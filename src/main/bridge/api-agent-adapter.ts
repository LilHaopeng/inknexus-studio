import fs from 'fs'
import path from 'path'
import { streamText, tool, type LanguageModelV1 } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { z } from 'zod'
import type { DiffProposal } from '@shared/types'
import { AppDataStore } from '../storage/appdata-store'
import { ProjectManager } from '../workspace/project-manager'
import { API_PROVIDER_PRESETS } from './api-presets'
import { mapReasoningLevel } from './reasoning-map'
import type { AgentExecutionRequest, AgentExecutionResult } from './types'

export class ApiAgentRunner {
  constructor(
    private readonly store: AppDataStore,
    private readonly projectManager: ProjectManager
  ) {}

  private buildModel(backendId: string, requestedModel: string): {
    model: LanguageModelV1
    providerOptions?: Record<string, unknown>
    resolvedModelId: string
  } {
    const preset = API_PROVIDER_PRESETS.find((p) => p.id === backendId)
    if (!preset) throw new Error(`未知 API 供应商：${backendId}`)

    const secrets = this.store.getApiSecrets()[backendId]
    const apiKey = secrets?.apiKey || (backendId === 'api-ollama' ? 'ollama' : '')
    if (!apiKey) {
      throw new Error(`请先在「设置 → API 供应商」中为 ${preset.name} 填写 API Key`)
    }

    const baseUrl = secrets?.baseUrl || preset.baseUrl
    const modelId =
      backendId === 'api-doubao' && secrets?.endpointId?.trim()
        ? secrets.endpointId.trim()
        : requestedModel || preset.defaultModels[0]

    if (preset.protocol === 'anthropic') {
      const anthropic = createAnthropic({ apiKey, baseURL: baseUrl || undefined })
      return { model: anthropic(modelId), resolvedModelId: modelId }
    }
    if (preset.protocol === 'google') {
      const google = createGoogleGenerativeAI({ apiKey })
      return { model: google(modelId), resolvedModelId: modelId }
    }
    if (preset.protocol === 'deepseek') {
      const deepseek = createDeepSeek({ apiKey, baseURL: baseUrl || undefined })
      return { model: deepseek(modelId), resolvedModelId: modelId }
    }
    if (preset.protocol === 'openai') {
      const openai = createOpenAI({ apiKey, baseURL: baseUrl || undefined })
      return { model: openai(modelId), resolvedModelId: modelId }
    }

    const compatible = createOpenAICompatible({
      name: preset.id,
      apiKey,
      baseURL: baseUrl
    })
    return { model: compatible(modelId), resolvedModelId: modelId }
  }

  async testPreset(presetId: string, modelId?: string): Promise<{ ok: boolean; message: string }> {
    try {
      const { model, resolvedModelId } = this.buildModel(presetId, modelId || '')
      const result = await streamText({
        model,
        prompt: '请只回复“OK”两个字母。',
        maxTokens: 16
      })
      let out = ''
      for await (const part of result.textStream) {
        out += part
      }
      return { ok: true, message: `连接成功（${resolvedModelId}）：${out.trim().slice(0, 40) || 'OK'}` }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async run(req: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const mapped = mapReasoningLevel(req.selection.backendId, req.selection.reasoning, req.selection.model)
    const effectiveModel =
      req.selection.backendId === 'api-deepseek' && typeof mapped.nativeValue === 'string'
        ? mapped.nativeValue
        : req.selection.model

    const { model } = this.buildModel(req.selection.backendId, effectiveModel)
    if (mapped.mappedNote) {
      req.onEvent({ requestId: req.requestId, type: 'status', status: mapped.mappedNote })
    }

    const tools = req.projectRoot && fs.existsSync(req.projectRoot)
      ? {
          list_project_files: tool({
            description: '列出当前作品目录下的文件结构',
            parameters: z.object({}),
            execute: async () => {
              req.onEvent({ requestId: req.requestId, type: 'tool_call', toolName: 'list_project_files', argsPreview: '' })
              const tree = this.projectManager.listAssets(req.projectRoot)
              const flat: string[] = []
              const walk = (nodes: typeof tree) => {
                for (const n of nodes) {
                  if (n.isDirectory && n.children) walk(n.children)
                  else if (!n.isDirectory) flat.push(n.relPath)
                }
              }
              walk(tree)
              req.onEvent({ requestId: req.requestId, type: 'tool_result', toolName: 'list_project_files', summary: `共 ${flat.length} 个文件` })
              return flat.slice(0, 80)
            }
          }),
          read_project_file: tool({
            description: '读取当前作品目录内指定相对路径的设定、大纲或章节文本',
            parameters: z.object({
              relPath: z.string().describe('相对于作品根目录的路径')
            }),
            execute: async ({ relPath }) => {
              req.onEvent({ requestId: req.requestId, type: 'tool_call', toolName: 'read_project_file', argsPreview: relPath })
              try {
                const { content } = this.projectManager.readFile(req.projectRoot, relPath)
                req.onEvent({ requestId: req.requestId, type: 'tool_result', toolName: 'read_project_file', summary: `已读取 ${relPath}` })
                return content.slice(0, 14000)
              } catch (err) {
                return `读取失败：${err instanceof Error ? err.message : String(err)}`
              }
            }
          }),
          propose_file_edit: tool({
            description: '提交对作品内指定文件的修改建议（安全协作模式会转为红绿 Diff 待用户确认）',
            parameters: z.object({
              relPath: z.string(),
              newContent: z.string(),
              summary: z.string()
            }),
            execute: async ({ relPath, newContent, summary }) => {
              req.onEvent({ requestId: req.requestId, type: 'tool_call', toolName: 'propose_file_edit', argsPreview: relPath })
              let originalText = ''
              const abs = this.projectManager.assertInsideProject(req.projectRoot, relPath)
              if (fs.existsSync(abs)) {
                originalText = fs.readFileSync(abs, 'utf8')
              }
              if (req.permissionMode === 'auto-write') {
                if (originalText) {
                  this.store.createSnapshot(req.projectRoot, abs, originalText, 'ai-before-apply', `AI 自动写入前快照：${summary}`)
                }
                fs.mkdirSync(path.dirname(abs), { recursive: true })
                this.projectManager.writeFile(req.projectRoot, relPath, newContent)
                req.onEvent({ requestId: req.requestId, type: 'tool_result', toolName: 'propose_file_edit', summary: `已写入 ${relPath}` })
                return `已写入文件 ${relPath}（已自动保存前置快照）。`
              }

              const proposal: DiffProposal = {
                id: `diff_${Date.now()}`,
                filePath: relPath,
                originalText,
                proposedText: newContent,
                summary,
                status: 'pending',
                createdAt: Date.now()
              }
              req.onEvent({ requestId: req.requestId, type: 'diff_proposal', proposal })
              req.onEvent({ requestId: req.requestId, type: 'tool_result', toolName: 'propose_file_edit', summary: `已生成修订 Diff：${relPath}` })
              return `已生成针对 ${relPath} 的红绿修订对比，等待作者在编辑器内确认。`
            }
          })
        }
      : undefined

    req.onEvent({ requestId: req.requestId, type: 'status', status: '正在流式生成...' })

    const providerOptions: Record<string, Record<string, unknown>> = {}
    if (req.selection.backendId === 'api-anthropic' && typeof mapped.nativeValue === 'object') {
      providerOptions.anthropic = { thinking: mapped.nativeValue }
    } else if (req.selection.backendId === 'api-google' && typeof mapped.nativeValue === 'object') {
      providerOptions.google = { thinkingConfig: mapped.nativeValue }
    } else if (req.selection.backendId === 'api-openai' && typeof mapped.nativeValue === 'string' && mapped.nativeValue !== 'none') {
      providerOptions.openai = { reasoningEffort: mapped.nativeValue }
    }

    const result = await streamText({
      model,
      system: req.systemPrompt,
      prompt: req.userPrompt,
      tools,
      maxSteps: 6,
      abortSignal: req.signal,
      providerOptions: Object.keys(providerOptions).length > 0 ? (providerOptions as never) : undefined
    })

    let fullText = ''
    let thinkingText = ''

    for await (const part of result.fullStream) {
      if (part.type === 'reasoning') {
        thinkingText += part.textDelta
        req.onEvent({ requestId: req.requestId, type: 'thinking_delta', delta: part.textDelta })
      } else if (part.type === 'text-delta') {
        fullText += part.textDelta
        req.onEvent({ requestId: req.requestId, type: 'text_delta', delta: part.textDelta })
      } else if (part.type === 'error') {
        throw part.error instanceof Error ? part.error : new Error(String(part.error))
      }
    }

    req.onEvent({ requestId: req.requestId, type: 'done', fullText, thinkingText })
    return { fullText, thinkingText }
  }
}
