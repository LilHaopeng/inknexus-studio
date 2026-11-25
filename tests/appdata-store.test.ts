import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDataStore, hashProjectId } from '../src/main/storage/appdata-store'

const tempDirs: string[] = []
function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inknexus-appdata-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tempDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

describe('AppDataStore', () => {
  it('stores all annotations & snapshots in AppData without touching project dir', () => {
    const appData = makeTempDir()
    const projectDir = makeTempDir()
    fs.writeFileSync(path.join(projectDir, 'ch1.md'), '原文内容', 'utf8')

    const store = new AppDataStore({ rootDir: appData })
    store.upsertIndexedProject({
      id: hashProjectId(projectDir),
      title: '测试书',
      rootPath: projectDir,
      mode: 'long-novel',
      tags: ['长篇'],
      chapterCount: 1,
      wordCount: 4,
      lastModified: Date.now()
    })

    store.upsertAnnotation(projectDir, {
      id: 'ann_1',
      filePath: 'ch1.md',
      quote: '原文',
      from: 0,
      to: 2,
      category: 'style',
      author: '作者',
      body: '改精彩点',
      replies: [],
      resolved: false,
      createdAt: Date.now()
    })

    const snap = store.createSnapshot(projectDir, path.join(projectDir, 'ch1.md'), '旧版正文内容', 'manual', '存盘快照')
    expect(store.getSnapshotContent(projectDir, snap.id)).toBe('旧版正文内容')

    // Verify user project folder has ZERO extra files/folders
    expect(fs.readdirSync(projectDir)).toEqual(['ch1.md'])

    const report = store.getStorageReport()
    expect(report.projects).toHaveLength(1)
    expect(report.projects[0].annotationCount).toBe(1)
    expect(report.projects[0].snapshotCount).toBe(1)
    expect(report.projects[0].snapshotsBytes).toBeGreaterThan(0)

    // Selective delete snapshots only, keep annotations
    store.deleteProjectData(hashProjectId(projectDir), ['snapshots'])
    const after = store.getStorageReport()
    expect(after.projects[0].snapshotCount).toBe(0)
    expect(after.projects[0].annotationCount).toBe(1)
    expect(fs.existsSync(path.join(projectDir, 'ch1.md'))).toBe(true)
  })
})
