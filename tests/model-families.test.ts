import { describe, expect, it } from 'vitest'
import {
  groupModelsByFamily,
  parseModelEffortVariant,
  resolveExecutableModelId
} from '../src/shared/model-families'

describe('Model family collapsing and Codex-style reasoning variant resolution', () => {
  it('groups suffixed effort variants into a single base model family without stripping non-effort suffixes', () => {
    const raw = [
      'gemini-4-neon-high',
      'gemini-4-neon-xhigh',
      'gemini-4-neon-medium',
      'gemini-4-neon-low',
      'claude-opus-5-5-low',
      'claude-opus-5-5-medium',
      'claude-opus-5-5-high',
      'gpt-oss-120b-medium',
      'gemini-pro-orchestrator-neon',
      'qwen4-max'
    ]

    const families = groupModelsByFamily(raw)
    expect(families.map((f) => f.baseId)).toEqual([
      'gemini-4-neon',
      'claude-opus-5-5',
      'gpt-oss-120b',
      'gemini-pro-orchestrator-neon',
      'qwen4-max'
    ])

    expect(families[0].supportedLevels).toEqual(['low', 'medium', 'high', 'max'])
    expect(families[1].supportedLevels).toEqual(['low', 'medium', 'high'])
    expect(families[2].supportedLevels).toEqual(['medium'])
    // qwen4-max must NOT have -max treated as effort suffix
    expect(parseModelEffortVariant('qwen4-max')).toEqual({ baseId: 'qwen4-max' })
  })

  it('resolves selected base model + reasoning level back to executable CLI model variant', () => {
    const raw = [
      'gemini-4-neon-low',
      'gemini-4-neon-medium',
      'gemini-4-neon-high',
      'gemini-4-neon-xhigh',
      'claude-opus-5-5-low',
      'claude-opus-5-5-medium',
      'claude-opus-5-5-high'
    ]

    expect(resolveExecutableModelId(raw, 'gemini-4-neon', 'max')).toBe('gemini-4-neon-xhigh')
    expect(resolveExecutableModelId(raw, 'gemini-4-neon', 'off')).toBe('gemini-4-neon-low')
    expect(resolveExecutableModelId(raw, 'claude-opus-5-5', 'max')).toBe('claude-opus-5-5-high')
    expect(resolveExecutableModelId(['gpt-6.2-astra', 'gpt-6.2-sol'], 'gpt-6.2-astra', 'high')).toBe('gpt-6.2-astra')
  })
})
