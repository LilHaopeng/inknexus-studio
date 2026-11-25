import fs from 'fs'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type {
  AssetNode,
  CreationMode,
  ProjectSummary,
  RadarReportSummary,
  SemanticCategory,
  SubTemplateId
} from '@shared/types'
import { AppDataStore, hashProjectId } from '../storage/appdata-store'

const IGNORED_ROOT_DIRS = new Set([
  'inknexus-studio',
  '.git',
  '.agents',
  '.qa',
  'skill_packages',
  'node_modules',
  '扫榜'
])

function countChineseChars(text: string): number {
  const clean = text.replace(/\s+/g, '')
  return clean.length
}

function classifyCategory(relPath: string): SemanticCategory {
  const norm = relPath.replace(/\\/g, '/').toLowerCase()
  const base = path.basename(norm)
  if (norm.startsWith('设定/') || norm.includes('世界观')) return 'world'
  if (base.includes('人物') || base.includes('角色') || norm.includes('角色状态')) return 'character'
  if (base.includes('声口') || base.includes('文风')) return 'style'
  if (norm.startsWith('大纲/') || base.includes('大纲') || base.includes('节拍') || base.includes('卡点')) return 'outline'
  if (norm.startsWith('正文/') || norm.startsWith('剧本/') || /第\d+[章节集]/.test(base)) return 'prose'
  if (norm.startsWith('追踪/') || base.includes('台账') || base.includes('伏笔') || base.includes('状态')) return 'tracking'
  if (norm.startsWith('交付/')) return 'delivery'
  return 'reference'
}

export function detectProjectMode(projectRoot: string): CreationMode {
  if (fs.existsSync(path.join(projectRoot, '00_季播总案与资产表.md')) || fs.existsSync(path.join(projectRoot, '剧本'))) {
    return 'drama-script'
  }
  if (fs.existsSync(path.join(projectRoot, '00_脑洞与节拍.md')) || fs.existsSync(path.join(projectRoot, '01_轻量状态.md'))) {
    return 'short-webnovel'
  }
  return 'long-novel'
}

export class ProjectManager {
  private watcher: FSWatcher | null = null

  constructor(private readonly store: AppDataStore) {}

  assertInsideProject(projectRoot: string, targetPath: string): string {
    const resolvedRoot = path.resolve(projectRoot)
    const resolvedTarget = path.resolve(projectRoot, targetPath)
    if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Security violation: path escapes project root (${targetPath})`)
    }
    return resolvedTarget
  }

  scanWorkspaceProjects(workspaceRoot: string): ProjectSummary[] {
    if (!workspaceRoot || !fs.existsSync(workspaceRoot)) return this.store.listIndexedProjects()

    const found: ProjectSummary[] = []
    const indexedMap = new Map(this.store.listIndexedProjects().map((p) => [p.id, p]))

    const inspectDir = (dirPath: string, depth: number) => {
      if (depth > 2 || !fs.existsSync(dirPath)) return
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      const hasProjectMarker = entries.some(
        (e) =>
          (e.isDirectory() && ['正文', '大纲', '设定', '剧本'].includes(e.name)) ||
          (e.isFile() && ['00_脑洞与节拍.md', '00_季播总案与资产表.md', '00_故事DNA.md'].includes(e.name))
      )
      if (hasProjectMarker) {
        found.push(this.buildSummary(dirPath, indexedMap.get(hashProjectId(dirPath))))
        return
      }
      if (depth < 2) {
        for (const e of entries) {
          if (!e.isDirectory()) continue
          if (IGNORED_ROOT_DIRS.has(e.name) || e.name.startsWith('.')) continue
          inspectDir(path.join(dirPath, e.name), depth + 1)
        }
      }
    }

    inspectDir(workspaceRoot, 0)

    // Merge indexed projects outside workspaceRoot
    const foundIds = new Set(found.map((f) => f.id))
    for (const prev of indexedMap.values()) {
      if (!foundIds.has(prev.id) && fs.existsSync(prev.rootPath)) {
        found.push(this.buildSummary(prev.rootPath, prev))
      }
    }

    return found.sort((a, b) => b.lastModified - a.lastModified)
  }

  buildSummary(projectRoot: string, prev?: ProjectSummary): ProjectSummary {
    const mode = detectProjectMode(projectRoot)
    let chapterCount = 0
    let wordCount = 0
    let latestMtime = 0

    const walk = (dir: string, depth: number) => {
      if (depth > 3 || !fs.existsSync(dir)) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === '交付' || entry.name === '版本') continue
          walk(full, depth + 1)
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          const stat = fs.statSync(full)
          if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs
          const rel = path.relative(projectRoot, full).replace(/\\/g, '/')
          if (rel.startsWith('正文/') || rel.startsWith('剧本/') || /第\d+[章节集]/.test(entry.name)) {
            if (!entry.name.includes('声口卡') && !entry.name.includes('写作状态')) {
              chapterCount++
              const txt = fs.readFileSync(full, 'utf8')
              wordCount += countChineseChars(txt)
            }
          }
        }
      }
    }

    walk(projectRoot, 0)
    const id = hashProjectId(projectRoot)
    const summary: ProjectSummary = {
      id,
      title: prev?.title ?? path.basename(projectRoot),
      rootPath: path.resolve(projectRoot),
      mode,
      tags:
        prev?.tags ??
        (mode === 'short-webnovel' ? ['短篇网文'] : mode === 'drama-script' ? ['AI 剧本'] : ['长文小说']),
      chapterCount,
      wordCount,
      lastModified: latestMtime || fs.statSync(projectRoot).mtimeMs,
      lastOpenedFile: prev?.lastOpenedFile,
      pinned: prev?.pinned
    }
    this.store.upsertIndexedProject(summary)
    return summary
  }

  listAssets(projectRoot: string): AssetNode[] {
    if (!fs.existsSync(projectRoot)) return []
    const locks = new Set(this.store.listCanonLocks(projectRoot))

    const buildTree = (dir: string): AssetNode[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      const nodes: AssetNode[] = []
      const sorted = entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name, 'zh-CN')
        })

      for (const entry of sorted) {
        const absPath = path.join(dir, entry.name)
        const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/')
        if (entry.isDirectory()) {
          nodes.push({
            id: relPath,
            name: entry.name,
            relPath,
            absPath,
            isDirectory: true,
            category: classifyCategory(relPath + '/'),
            children: buildTree(absPath)
          })
        } else if (/\.(md|txt)$/i.test(entry.name)) {
          let wc = 0
          try {
            wc = countChineseChars(fs.readFileSync(absPath, 'utf8'))
          } catch {
            wc = 0
          }
          nodes.push({
            id: relPath,
            name: entry.name,
            relPath,
            absPath,
            isDirectory: false,
            category: classifyCategory(relPath),
            locked: locks.has(relPath),
            wordCount: wc
          })
        }
      }
      return nodes
    }

    return buildTree(projectRoot)
  }

  createNewProject(params: {
    parentDir: string
    title: string
    mode: CreationMode
    subTemplate?: SubTemplateId
  }): { summary: ProjectSummary; entryRelPath: string } {
    const safeTitle = params.title.trim().replace(/[\\/:*?"<>|]/g, '_') || '未命名作品'
    const projectRoot = path.join(params.parentDir, safeTitle)
    fs.mkdirSync(projectRoot, { recursive: true })

    let entryRelPath = '大纲/00_故事DNA.md'

    if (params.mode === 'short-webnovel') {
      fs.mkdirSync(path.join(projectRoot, '正文'), { recursive: true })
      fs.mkdirSync(path.join(projectRoot, '交付'), { recursive: true })
      fs.writeFileSync(
        path.join(projectRoot, '00_脑洞与节拍.md'),
        `# 《${safeTitle}》脑洞与节拍卡\n\n- **体量模板**：${params.subTemplate === 'short-microdrama' ? 'microdrama (2-5万字)' : 'flash (1-3万字)'}\n- **核心脑洞规则**：[待填写]\n- **规则约束/漏洞**：[待填写]\n- **单篇声口切片（200-300字）**：[试写定调后固化]\n\n## 爽感叠加节拍表\n\n| 节次 | 核心冲突 | 爽点维度 | 钩子 |\n|---|---|---|---|\n| 第1节 | 开篇入局 | | |\n`,
        'utf8'
      )
      fs.writeFileSync(
        path.join(projectRoot, '01_轻量状态.md'),
        `# 《${safeTitle}》轻量状态卡\n\n- 当前进度：立项待试写\n- 已明牌线索：\n- 人物当前状态：\n`,
        'utf8'
      )
      fs.writeFileSync(path.join(projectRoot, '正文', '01_第一节_开篇.md'), `# 第一节\n\n`, 'utf8')
      entryRelPath = '00_脑洞与节拍.md'
    } else if (params.mode === 'drama-script') {
      fs.mkdirSync(path.join(projectRoot, '剧本'), { recursive: true })
      fs.mkdirSync(path.join(projectRoot, '交付'), { recursive: true })
      const genre =
        params.subTemplate === 'drama-comic'
          ? 'comic-drama'
          : params.subTemplate === 'drama-shadiao'
            ? 'shadiao'
            : 'ai-drama'
      fs.writeFileSync(
        path.join(projectRoot, '00_季播总案与资产表.md'),
        `# 《${safeTitle}》季播总案与控算力资产表\n\n- **剧种模板**：${genre}\n- **红果 40× 合规红线**：单集旁白/OS 占比 ≤ 20%，以角色口型对白推进\n\n## 固定资产槽位\n- \`@CHAR-01\` 主角：[外貌锚点]\n- \`@LOC-01\` 核心场景：[空间锚点]\n- \`@VOICE-01\` 主角声线：[音色/语速]\n\n## 单剧声口切片\n[待定调]\n`,
        'utf8'
      )
      fs.writeFileSync(
        path.join(projectRoot, '01_分集卡点纲.md'),
        `# 《${safeTitle}》分集卡点纲\n\n## 黄金第 1 集（60-90秒）\n- 前 3 秒开屏钩子：\n- 情绪转折：\n- 集末硬卡点：\n`,
        'utf8'
      )
      fs.writeFileSync(path.join(projectRoot, '剧本', '第001集_开篇.md'), `# 第001集\n\n`, 'utf8')
      entryRelPath = '00_季播总案与资产表.md'
    } else {
      for (const dir of ['设定/世界观', '大纲/故事弧', '大纲/剧情段', '正文', '追踪', '交付']) {
        fs.mkdirSync(path.join(projectRoot, dir), { recursive: true })
      }
      fs.writeFileSync(
        path.join(projectRoot, '大纲', '00_故事DNA.md'),
        `# 《${safeTitle}》Story DNA\n\n- **创作初衷**：[待填写]\n- **核心期待场面**：[待填写]\n- **百字核心故事**：[待填写]\n- **核心追读问题**：[待填写]\n`,
        'utf8'
      )
      fs.writeFileSync(
        path.join(projectRoot, '大纲', '01_故事架构.md'),
        `# 《${safeTitle}》故事架构\n\n## 五轨推进总表\n- Plot 主线：\n- Character 人物弧：\n- Conflict 核心冲突：\n- Information 信息差：\n- Theme 主题：\n`,
        'utf8'
      )
      fs.writeFileSync(
        path.join(projectRoot, '正文', '00_文风与声口卡.md'),
        `# 《${safeTitle}》文风与声口卡\n\n- **叙事声口**：[待定调]\n- **定调原文切片（150-250字）**：[试写确认后填入]\n`,
        'utf8'
      )
      fs.writeFileSync(path.join(projectRoot, '追踪', '角色状态.md'), `# 角色状态台账\n\n`, 'utf8')
      fs.writeFileSync(path.join(projectRoot, '追踪', '章节交接.md'), `# 章节交接卡\n\n`, 'utf8')
      fs.writeFileSync(path.join(projectRoot, '追踪', '伏笔.md'), `# 伏笔台账\n\n`, 'utf8')
      fs.writeFileSync(path.join(projectRoot, '正文', '第001章_序幕.md'), `# 第001章 序幕\n\n`, 'utf8')
      entryRelPath = '大纲/00_故事DNA.md'
    }

    const summary = this.buildSummary(projectRoot)
    summary.lastOpenedFile = entryRelPath
    this.store.upsertIndexedProject(summary)
    return { summary, entryRelPath }
  }

  readFile(projectRoot: string, relPath: string): { content: string; mtimeMs: number } {
    const abs = this.assertInsideProject(projectRoot, relPath)
    const content = fs.readFileSync(abs, 'utf8')
    const mtimeMs = fs.statSync(abs).mtimeMs
    return { content, mtimeMs }
  }

  writeFile(projectRoot: string, relPath: string, content: string): { mtimeMs: number } {
    const locks = new Set(this.store.listCanonLocks(projectRoot))
    if (locks.has(relPath)) {
      throw new Error(`正典文件已锁定（${relPath}），请先解除锁定或走变更确认后再写入。`)
    }
    const abs = this.assertInsideProject(projectRoot, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
    return { mtimeMs: fs.statSync(abs).mtimeMs }
  }

  createFile(projectRoot: string, relPath: string, initialContent = ''): void {
    const abs = this.assertInsideProject(projectRoot, relPath)
    if (fs.existsSync(abs)) throw new Error(`文件已存在：${relPath}`)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, initialContent, 'utf8')
  }

  watchProject(projectRoot: string, onChange: (relPath: string) => void): void {
    this.stopWatching()
    this.watcher = chokidar.watch(projectRoot, {
      ignored: /(^|[\\/])\..|node_modules|交付/,
      persistent: true,
      ignoreInitial: true
    })
    this.watcher.on('change', (changedAbs) => {
      onChange(path.relative(projectRoot, changedAbs).replace(/\\/g, '/'))
    })
  }

  stopWatching(): void {
    if (this.watcher) {
      void this.watcher.close()
      this.watcher = null
    }
  }

  scanRadarReports(workspaceRoot: string): RadarReportSummary[] {
    const scanDir = path.join(workspaceRoot, '扫榜')
    if (!fs.existsSync(scanDir)) return []
    const out: RadarReportSummary[] = []
    for (const entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folderPath = path.join(scanDir, entry.name)
      const scanFile = path.join(folderPath, '扫榜报告.md')
      const briefFile = path.join(folderPath, '选题简报.md')
      out.push({
        folderName: entry.name,
        folderPath,
        hasScanReport: fs.existsSync(scanFile),
        hasTopicBrief: fs.existsSync(briefFile),
        scanSnippet: fs.existsSync(scanFile) ? fs.readFileSync(scanFile, 'utf8').slice(0, 600) : undefined,
        briefSnippet: fs.existsSync(briefFile) ? fs.readFileSync(briefFile, 'utf8').slice(0, 600) : undefined
      })
    }
    return out.sort((a, b) => b.folderName.localeCompare(a.folderName))
  }
}
