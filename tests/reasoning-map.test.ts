import { describe, expect, it } from 'vitest'
import { mapReasoningLevel } from '../src/main/bridge/reasoning-map'
import { parseWorkBuddyHelpModels } from '../src/main/bridge/discovery'

describe('Reasoning mapping across local CLIs and preset APIs', () => {
  it('maps 5-level reasoning depths cleanly', () => {
    expect(mapReasoningLevel('agy-cli', 'xhigh' as never).nativeValue).toBe('xhigh')
    expect(mapReasoningLevel('agy-cli', 'max').nativeValue).toBe('xhigh')
    expect(mapReasoningLevel('agy-cli', 'off').nativeValue).toBe('low')
    expect(mapReasoningLevel('codex-cli', 'max').nativeValue).toBe('xhigh')
    expect(mapReasoningLevel('qoder-cn-cli', 'off').nativeValue).toBe('disabled')
    expect(mapReasoningLevel('qoder-cn-cli', 'high').nativeValue).toBe('high')
    expect(mapReasoningLevel('workbuddy-cn-cli', 'off').nativeValue).toBe('minimal')
    expect(mapReasoningLevel('workbuddy-intl-cli', 'max').nativeValue).toBe('max')
    expect(mapReasoningLevel('api-deepseek', 'off').nativeValue).toBe('deepseek-flash')
    expect(mapReasoningLevel('api-deepseek', 'high').nativeValue).toBe('deepseek-v4-pro')
    expect(mapReasoningLevel('api-anthropic', 'medium').nativeValue).toEqual({
      type: 'enabled',
      budgetTokens: 8192
    })
  })

  it('parses WorkBuddy supported models from CLI --help text', () => {
    const sample =
      '--model <model>   Model for the current session. Currently supported: (auto, glm-5v-turbo, glm-5.1, kimi-k2.5)'
    expect(parseWorkBuddyHelpModels(sample)).toEqual(['auto', 'glm-5v-turbo', 'glm-5.1', 'kimi-k2.5'])
  })
})
