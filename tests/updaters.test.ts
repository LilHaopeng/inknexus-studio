import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => process.env.TEMP || 'C:\\Temp',
    quit: vi.fn()
  }
}))

import { isNewerSemver } from '../src/main/updater/app-updater'
import { SKILL_GITHUB_REGISTRY } from '../src/main/updater/skill-updater'

describe('Semver update comparison and @LilHaopeng Skill registry', () => {
  it('compares semantic versions accurately', () => {
    expect(isNewerSemver('v1.0.1', '1.0.0')).toBe(true)
    expect(isNewerSemver('1.2.0', '1.1.9')).toBe(true)
    expect(isNewerSemver('v1.0.0', '1.0.0')).toBe(false)
    expect(isNewerSemver('0.9.9', '1.0.0')).toBe(false)
  })

  it('binds all 6 built-in creative skills to @LilHaopeng GitHub repos', () => {
    expect(SKILL_GITHUB_REGISTRY).toHaveLength(6)
    for (const sk of SKILL_GITHUB_REGISTRY) {
      expect(sk.repoOwner).toBe('LilHaopeng')
      expect(sk.repoUrl).toBe(`https://github.com/LilHaopeng/${sk.repoName}`)
    }
  })
})
