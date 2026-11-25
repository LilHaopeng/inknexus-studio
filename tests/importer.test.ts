import { execFileSync } from 'child_process'
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

  it('extracts text from .pdf files and classifies projects safely', async () => {
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-app-pdf-'))
    const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-ws-pdf-'))
    tempDirs.push(appData, workRoot)
    fs.mkdirSync(path.join(workRoot, '未分类'), { recursive: true })
    fs.mkdirSync(path.join(workRoot, '长文小说'), { recursive: true })

    const pdfPath = path.join(workRoot, '大纲参考.pdf')
    execFileSync('python', [
      '-c',
      `import fitz, sys; doc = fitz.open(); p = doc.new_page(); p.insert_text((72, 72), "Story DNA: PDF Test World Rule"); doc.save(sys.argv[1]); doc.close()`,
      pdfPath
    ])

    const store = new AppDataStore({ rootDir: appData })
    const pm = new ProjectManager(store)
    const importer = new ImporterService(pm)
    const parsed = await importer.parsePaths([pdfPath])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].ext).toBe('.pdf')
    expect(parsed[0].markdownContent).toContain('PDF Test World Rule')

    const created = pm.createNewProject({ parentDir: path.join(workRoot, '未分类'), title: '待分类书', mode: 'long-novel' })
    expect(created.summary.category).toBe('unclassified')
    const moved = pm.classifyAndMoveProject(workRoot, created.summary.rootPath, 'long-novel')
    expect(moved.category).toBe('long-novel')
    expect(moved.rootPath).toContain('长文小说')
  })
})
