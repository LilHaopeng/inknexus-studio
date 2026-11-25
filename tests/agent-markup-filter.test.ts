import { describe, expect, it } from 'vitest'
import {
  mergeHiddenAgentMetadata,
  splitHiddenAgentMetadata,
  stripAgentMarkupForDisplay
} from '../src/shared/agent-markup-filter'

describe('Agent markup filtering and lossless preservation', () => {
  it('splits L0/L1/Status headers cleanly and restores them on merge', () => {
    const raw = [
      '<!-- inknexus:meta -->',
      'ID：CH-001',
      '状态：locked',
      'L1：第一章重点铺垫江南权谋',
      '',
      '# 第001章 屏射开筵',
      '',
      '雨丝敲打着金谷园的青瓦。'
    ].join('\n')

    const { hiddenHeader, cleanBody } = splitHiddenAgentMetadata(raw)
    expect(hiddenHeader).toContain('ID：CH-001')
    expect(hiddenHeader).toContain('状态：locked')
    expect(hiddenHeader).toContain('L1：第一章重点铺垫江南权谋')
    expect(cleanBody).not.toContain('ID：CH-001')
    expect(cleanBody).toContain('雨丝敲打着金谷园的青瓦。')

    const editedClean = '# 第001章 屏射开筵\n\n夜雨骤急，灯影摇曳。'
    const merged = mergeHiddenAgentMetadata(hiddenHeader, editedClean)
    expect(merged).toContain('ID：CH-001')
    expect(merged).toContain('夜雨骤急，灯影摇曳。')
  })

  it('strips raw markdown symbols, verdict JSON blocks, and L0/Status tags for reports', () => {
    const rawReport = [
      '### 审查意见',
      '- 状态：REVISE',
      '- L0：核心主线稳定',
      '> **人物声口**：主角语气需再冷静三分。[Status]',
      '```json',
      '{"verdict":"PASS","issues":[]}',
      '```',
      'CH-001 ARC-002 伏笔已于第三段回收。'
    ].join('\n')

    const display = stripAgentMarkupForDisplay(rawReport)
    expect(display).not.toContain('###')
    expect(display).not.toContain('**')
    expect(display).not.toContain('状态：REVISE')
    expect(display).not.toContain('L0：')
    expect(display).not.toContain('"verdict"')
    expect(display).not.toContain('[Status]')
    expect(display).not.toContain('CH-001')
    expect(display).toContain('人物声口：主角语气需再冷静三分。')
    expect(display).toContain('伏笔已于第三段回收。')
  })
})
