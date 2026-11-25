import type { ReasoningLevel } from '@shared/types'

export interface MappedReasoning {
  nativeValue: string | number | boolean | Record<string, unknown>
  mappedNote?: string
}

export function mapReasoningLevel(backendId: string, level: ReasoningLevel, model?: string): MappedReasoning {
  if (backendId.startsWith('agy')) {
    if (level === 'off') return { nativeValue: 'low', mappedNote: 'AGY 最低支持 low 档，已自动映射为 low' }
    if (level === 'max') return { nativeValue: 'xhigh', mappedNote: 'AGY 极限推理自动映射为 xhigh' }
    return { nativeValue: level }
  }

  if (backendId.startsWith('codex')) {
    const table: Record<ReasoningLevel, string> = {
      off: 'low',
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'xhigh'
    }
    const mapped = table[level]
    return {
      nativeValue: mapped,
      mappedNote: level === 'off' ? 'Codex 映射为 low' : level === 'max' ? 'Codex 映射为 xhigh' : undefined
    }
  }

  if (backendId.startsWith('dsh')) {
    return {
      nativeValue: level,
      mappedNote: level === 'off' ? 'DSH 默认按基础推理执行' : undefined
    }
  }

  if (backendId.startsWith('qoder')) {
    const table: Record<ReasoningLevel, string> = {
      off: 'disabled',
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'high'
    }
    return {
      nativeValue: table[level],
      mappedNote: level === 'max' ? 'Qoder 最高思考映射为 high' : undefined
    }
  }

  if (backendId.startsWith('workbuddy')) {
    const table: Record<ReasoningLevel, string> = {
      off: 'minimal',
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'max'
    }
    return { nativeValue: table[level] }
  }

  if (backendId.includes('doubao') || backendId.includes('volc')) {
    if (level === 'off') {
      return { nativeValue: { thinking: { type: 'disabled' } } }
    }
    const effort = level === 'max' ? 'high' : level
    return { nativeValue: { thinking: { type: 'enabled' }, reasoning_effort: effort } }
  }

  if (backendId.includes('deepseek')) {
    if (level === 'off') {
      return { nativeValue: 'deepseek-flash', mappedNote: '关闭深度思考，自动选用 deepseek-flash' }
    }
    return {
      nativeValue: model?.includes('v4-pro') ? model : 'deepseek-v4-pro',
      mappedNote: '已启用 DeepSeek V4 Pro 深度推理模式'
    }
  }

  if (backendId.includes('openai')) {
    if (level === 'off') return { nativeValue: 'none' }
    const map: Record<ReasoningLevel, string> = {
      off: 'low',
      low: 'low',
      medium: 'medium',
      high: 'high',
      max: 'high'
    }
    return { nativeValue: map[level] }
  }

  if (backendId.includes('anthropic') || backendId.includes('claude')) {
    if (level === 'off') return { nativeValue: { type: 'disabled' } }
    const budgets: Record<ReasoningLevel, number> = {
      off: 0,
      low: 2048,
      medium: 8192,
      high: 16384,
      max: 32000
    }
    return { nativeValue: { type: 'enabled', budgetTokens: budgets[level] } }
  }

  if (backendId.includes('google') || backendId.includes('gemini')) {
    const budgets: Record<ReasoningLevel, number> = {
      off: 0,
      low: 2048,
      medium: 8192,
      high: 16384,
      max: 24576
    }
    return { nativeValue: { thinkingBudget: budgets[level] } }
  }

  if (backendId.includes('dashscope') || backendId.includes('qwen')) {
    if (level === 'off') return { nativeValue: { enable_thinking: false } }
    const budgets: Record<ReasoningLevel, number> = {
      off: 0,
      low: 2048,
      medium: 8192,
      high: 16384,
      max: 32000
    }
    return { nativeValue: { enable_thinking: true, thinking_budget: budgets[level] } }
  }

  return { nativeValue: level }
}
