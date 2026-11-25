import fs from 'fs'
import os from 'os'
import path from 'path'
import mammoth from 'mammoth'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AgentDiscoveryService,
  loadCustomAgentOverrides,
  parseWorkBuddyHelpModels
} from '../src/main/bridge/discovery'
import { buildSimpleDocxBuffer, PythonRunner } from '../src/main/workspace/python-runner'
import { SkillLoader } from '../src/main/orchestrator/skill-loader'

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('Discovery enhancement, custom-agents bridge, and zero-Python Docx fallback', () => {
  it('parses wrapped and ANSI-polluted WorkBuddy --help output cleanly', () => {
    const messyHelp = [
      'Options:',
      '\u001b[32m--model <model>\u001b[0m  Specify model (PowerShell 7 detection skipped',
      '  on this host) Currently supported: (auto, glm-5.3,',
      '  kimi-k3.1-pro, deepseek-v4-pro, minimax-m3.1-flash)'
    ].join('\n')

    expect(parseWorkBuddyHelpModels(messyHelp)).toEqual([
      'auto',
      'glm-5.3',
      'kimi-k3.1-pro',
      'deepseek-v4-pro',
      'minimax-m3.1-flash'
    ])
  })

  it('merges external custom-agents.json overrides into discovered local agents', async () => {
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-custom-agents-'))
    tempDirs.push(appDataDir)
    const fakeDsh = path.join(appDataDir, 'dsh.cmd')
    fs.writeFileSync(fakeDsh, '@echo off\necho ok\n', 'utf8')

    fs.writeFileSync(
      path.join(appDataDir, 'custom-agents.json'),
      JSON.stringify({
        agents: [
          {
            id: 'dsh-cli',
            executablePath: fakeDsh,
            models: ['deepseek-v4-pro-latest', 'deepseek-reasoner-r2'],
            env: { DSH_TEST_MODE: '1' }
          }
        ]
      }),
      'utf8'
    )

    const overrides = loadCustomAgentOverrides(appDataDir)
    expect(overrides).toHaveLength(1)

    const svc = new AgentDiscoveryService(appDataDir)
    const list = await svc.discoverLocalAgents()
    const dsh = list.find((a) => a.id === 'dsh-cli')
    expect(dsh?.status).toBe('available')
    expect(dsh?.executablePath).toBe(fakeDsh)
    expect(dsh?.models).toEqual(['deepseek-v4-pro-latest', 'deepseek-reasoner-r2'])
    expect(dsh?.customEnv).toEqual({ DSH_TEST_MODE: '1' })
  }, 15000)

  it('generates valid readable OOXML .docx buffer without Python dependency', async () => {
    const buf = buildSimpleDocxBuffer('测试小说交付稿', [
      { heading: '第一章 开篇', body: '春风吹过江南岸。\n\n故事就此展开。' }
    ])
    const extracted = await mammoth.extractRawText({ buffer: buf })
    expect(extracted.value).toContain('测试小说交付稿')
    expect(extracted.value).toContain('第一章 开篇')
    expect(extracted.value).toContain('春风吹过江南岸')
  })

  it('exports world/outline combined docx and prose merged or separate docx via exportSelectedAssets', async () => {
    const projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-asset-export-'))
    tempDirs.push(projDir)
    fs.mkdirSync(path.join(projDir, '设定', '世界观'), { recursive: true })
    fs.mkdirSync(path.join(projDir, '正文'), { recursive: true })
    fs.writeFileSync(path.join(projDir, '设定', '世界观', '01_灵气体系.md'), '# 灵气\n天地初开，九脉流转。', 'utf8')
    fs.writeFileSync(path.join(projDir, '设定', '世界观', '02_地理疆域.md'), '# 疆域\n东海有仙山。', 'utf8')
    fs.writeFileSync(path.join(projDir, '正文', '第001章_启程.md'), '# 第一章\n少年背剑出山。', 'utf8')
    fs.writeFileSync(path.join(projDir, '正文', '第002章_入城.md'), '# 第二章\n夜雨落青石。', 'utf8')

    const runner = new PythonRunner(new SkillLoader({ userSkillsDir: projDir, appDataSkillsDir: projDir, bundledSkillsDir: projDir }))

    const worldRes = await runner.exportSelectedAssets({
      projectRoot: projDir,
      title: '山海测试录',
      category: 'world',
      relPaths: ['设定/世界观/01_灵气体系.md', '设定/世界观/02_地理疆域.md'],
      mergeMode: 'merged'
    })
    expect(worldRes.ok).toBe(true)
    expect(worldRes.outputFiles).toHaveLength(1)
    expect(worldRes.outputFiles[0]).toContain('世界观设定集.docx')
    const worldText = (await mammoth.extractRawText({ path: worldRes.outputFiles[0] })).value
    expect(worldText).toContain('天地初开')
    expect(worldText).toContain('东海有仙山')

    const sepRes = await runner.exportSelectedAssets({
      projectRoot: projDir,
      title: '山海测试录',
      category: 'prose',
      relPaths: ['正文/第001章_启程.md', '正文/第002章_入城.md'],
      mergeMode: 'separate'
    })
    expect(sepRes.ok).toBe(true)
    expect(sepRes.outputFiles).toHaveLength(2)

    const mergedRes = await runner.exportSelectedAssets({
      projectRoot: projDir,
      title: '山海测试录',
      category: 'prose',
      relPaths: ['正文/第001章_启程.md', '正文/第002章_入城.md'],
      mergeMode: 'merged'
    })
    expect(mergedRes.ok).toBe(true)
    expect(mergedRes.outputFiles).toHaveLength(1)
    const mergedText = (await mammoth.extractRawText({ path: mergedRes.outputFiles[0] })).value
    expect(mergedText).toContain('少年背剑出山')
    expect(mergedText).toContain('夜雨落青石')
  })
})
