import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataStore } from '../src/main/storage/appdata-store'
import { ProjectManager } from '../src/main/workspace/project-manager'
import { ImporterService, guessFileRole } from '../src/main/workspace/importer'

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('ImporterService & ProjectManager', () => {
  it('guesses file roles accurately from filename and content', () => {
    expect(guessFileRole('《守心录》故事大纲.docx', '')).toBe('outline')
    expect(guessFileRole('世界观设定集.md', '')).toBe('world')
    expect(guessFileRole('第一章_正文.txt', '')).toBe('prose')
    expect(guessFileRole('人物小传.md', '')).toBe('character')
  })

  it('imports real .docx outline cleanly without modifying original file', async () => {
    const sampleDocx = 'c:\\Dbackup\\AI小说\\1124\\《守心录》故事大纲.docx'
    if (!fs.existsSync(sampleDocx)) return

    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-app-'))
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-work-'))
    tempDirs.push(appData, workRoot)

    const store = new AppDataStore({ rootDir: appData })
    const pm = new ProjectManager(store)
    const importer = new ImporterService(pm)

    const items = await importer.parsePaths([sampleDocx])
    expect(items).toHaveLength(1)
    expect(items[0].error).toBeUndefined()
    expect(items[0].role).toBe('outline')
    expect(items[0].charCount).toBeGreaterThan(100)

    const mat = importer.materializeIntoProject({
      parentDir: workRoot,
      title: '守心录导入测试',
      mode: 'long-novel',
      files: items
    })
    expect(mat.writtenPaths.some((p) => p.startsWith('大纲/'))).toBe(true)
  })
})
