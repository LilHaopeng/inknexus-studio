import fs from 'fs'
import { describe, expect, it } from 'vitest'
import { SkillLoader } from '../src/main/orchestrator/skill-loader'
import { PythonRunner } from '../src/main/workspace/python-runner'

describe('PythonRunner integration with existing skills', () => {
  it('runs lint_prose.py on an existing chapter read-only', async () => {
    const sampleChapter = 'c:\\Dbackup\\AI小说\\扬州金谷录\\正文\\第001章_屏射开筵.md'
    const sampleRoot = 'c:\\Dbackup\\AI小说\\扬州金谷录'
    if (!fs.existsSync(sampleChapter)) return

    const runner = new PythonRunner(new SkillLoader())
    const report = await runner.runLintForFile(sampleRoot, sampleChapter, 'long-novel')
    expect(report.scriptName).toBe('lint_prose.py')
    expect(['pass', 'warn', 'fail']).toContain(report.status)
    expect(report.rawOutput.length).toBeGreaterThan(0)
  })
})
