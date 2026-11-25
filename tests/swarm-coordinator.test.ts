import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataStore } from '../src/main/storage/appdata-store'
import { SkillLoader } from '../src/main/orchestrator/skill-loader'
import { PromptComposer } from '../src/main/orchestrator/prompt-composer'
import { ContextAssembler } from '../src/main/orchestrator/context-assembler'
import { SwarmCoordinator } from '../src/main/swarm/swarm-coordinator'

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('SwarmCoordinator multi-queue & 3-tier review', () => {
  it('executes concurrent novels and runs 2-stage sequential review in advanced mode', async () => {
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-swarm-app-'))
    const projA = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-swarm-a-'))
    const projB = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-swarm-b-'))
    tempDirs.push(appData, projA, projB)

    const store = new AppDataStore({ rootDir: appData })
    const composer = new PromptComposer(new SkillLoader())
    const ctx = new ContextAssembler()

    let callSeq = 0
    const coordinator = new SwarmCoordinator(store, composer, ctx, {
      runAgent: async ({ userPrompt }) => {
        callSeq++
        if (userPrompt.includes('一审')) {
          return '```json\n{"verdict":"PASS","summary":"逻辑一致","issues":[]}\n```'
        }
        if (userPrompt.includes('二审')) {
          return '```json\n{"verdict":"PASS","summary":"声口自然","issues":[]}\n```'
        }
        return `第 ${callSeq} 次生成正文内容`
      },
      runLint: async () => ({ status: 'pass', issues: [], metrics: {}, rawOutput: 'OK', ranAt: Date.now() }),
      readOriginalFile: () => '旧正文',
      onUpdate: () => {}
    })

    const jobs = coordinator.enqueueBatch([
      {
        title: '作品A',
        projectRoot: projA,
        targetRelPath: '正文/ch1.md',
        mode: 'long-novel',
        prompt: '写第一章',
        reviewMode: 'advanced',
        writer: { backendId: 'agy-cli', model: 'gemini-4-neon-high', reasoning: 'high' },
        reviewer1: { backendId: 'codex-cli', model: 'gpt-5-codex', reasoning: 'high' },
        reviewer2: { backendId: 'api-doubao', model: 'doubao-seed-1-6-thinking', reasoning: 'high' }
      },
      {
        title: '作品B',
        projectRoot: projB,
        targetRelPath: '正文/ch1.md',
        mode: 'short-webnovel',
        prompt: '写第一节',
        reviewMode: 'self',
        writer: { backendId: 'dsh-cli', model: 'deepseek-reasoner', reasoning: 'medium' }
      }
    ])

    // Wait for async queue completion
    await new Promise((resolve) => setTimeout(resolve, 250))

    const list = coordinator.listJobs()
    const jobA = list.find((j) => j.id === jobs[0].id)!
    const jobB = list.find((j) => j.id === jobs[1].id)!

    expect(jobA.stage).toBe('awaiting_user')
    expect(jobA.reviewReports).toHaveLength(2)
    expect(jobA.reviewReports[0].round).toBe(1)
    expect(jobA.reviewReports[1].round).toBe(2)

    expect(jobB.stage).toBe('awaiting_user')
    expect(jobB.reviewReports).toHaveLength(1)
  })
})
