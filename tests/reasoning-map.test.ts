import { describe, expect, it } from 'vitest'
import { mapReasoningLevel } from '../src/main/bridge/reasoning-map'

describe('Reasoning mapping across local CLIs and preset APIs', () => {
  it('maps 5-level reasoning depths cleanly', () => {
    expect(mapReasoningLevel('agy-cli', 'xhigh' as never).nativeValue).toBe('xhigh')
    expect(mapReasoningLevel('agy-cli', 'off').nativeValue).toBe('low')
    expect(mapReasoningLevel('codex-cli', 'max').nativeValue).toBe('xhigh')
    expect(mapReasoningLevel('api-deepseek', 'off').nativeValue).toBe('deepseek-flash')
    expect(mapReasoningLevel('api-deepseek', 'high').nativeValue).toBe('deepseek-v4-pro')
    expect(mapReasoningLevel('api-doubao', 'high').nativeValue).toEqual({
      thinking: { type: 'enabled' },
      reasoning_effort: 'high'
    })
    expect(mapReasoningLevel('api-anthropic', 'medium').nativeValue).toEqual({
      type: 'enabled',
      budgetTokens: 8192
    })
  })
})
