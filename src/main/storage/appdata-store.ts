import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import type {
  AnnotationReply,
  AnnotationThread,
  AppConfig,
  AppDataStorageReport,
  ChatMessage,
  ProjectStorageBreakdown,
  ProjectSummary,
  RadarTrendAnalysis,
  ReviewHistoryEntry,
  SnapshotRecord,
  StorageScope,
  SwarmJob
} from '@shared/types'

export interface SecretVault {
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

export const fallbackSecretVault: SecretVault = {
  encrypt: (plain: string) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher: string) => Buffer.from(cipher, 'base64').toString('utf8')
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'aurora-light',
  editorReadTheme: 'default',
  effectsMode: 'full',
  workspaceRoot: 'c:\\Dbackup\\AI小说\\InkNexus',
  permissionMode: 'diff-review',
  defaultAgentId: 'agy-cli',
  defaultModel: 'gemini-4-neon-high',
  defaultReasoning: 'high',
  defaultReviewMode: 'single',
  maxSwarmConcurrency: 3,
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.9,
  firstLineIndent: true,
  wordGoalPerChapter: 3000,
  maxSnapshotsPerFile: 40,
  closeBehavior: 'ask'
}

export function hashProjectId(projectRoot: string): string {
  const normalized = path.resolve(projectRoot).toLowerCase()
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function atomicWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function dirSizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0
  let total = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += dirSizeBytes(full)
    } else if (entry.isFile()) {
      total += fs.statSync(full).size
    }
  }
  return total
}

function fileSizeBytes(filePath: string): number {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0
  } catch {
    return 0
  }
}

export function copyDirRecursiveSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

export class AppDataStore {
  public readonly rootDir: string
  private readonly vault: SecretVault

  constructor(options?: { rootDir?: string; vault?: SecretVault }) {
    this.rootDir = options?.rootDir ?? path.join(process.env.APPDATA || process.cwd(), 'InkNexusStudio')
    this.vault = options?.vault ?? fallbackSecretVault
    fs.mkdirSync(this.rootDir, { recursive: true })
  }

  private get configPath(): string {
    return path.join(this.rootDir, 'config.json')
  }

  private get secretsPath(): string {
    return path.join(this.rootDir, 'secrets.vault')
  }

  private get projectsIndexPath(): string {
    return path.join(this.rootDir, 'projects-index.json')
  }

  private get swarmHistoryPath(): string {
    return path.join(this.rootDir, 'swarm', 'queue-history.json')
  }

  private projectDir(projectRoot: string): string {
    return path.join(this.rootDir, 'projects', hashProjectId(projectRoot))
  }

  private projectDirById(projectId: string): string {
    if (!/^[a-f0-9]{16}$/.test(projectId)) {
      throw new Error(`Invalid projectId: ${projectId}`)
    }
    return path.join(this.rootDir, 'projects', projectId)
  }

  getConfig(): AppConfig {
    const saved = safeReadJson<Partial<AppConfig>>(this.configPath, {})
    const merged = { ...DEFAULT_CONFIG, ...saved }
    if (
      saved.workspaceRoot &&
      path.resolve(saved.workspaceRoot).toLowerCase() === path.resolve('c:\\Dbackup\\AI小说').toLowerCase() &&
      fs.existsSync('c:\\Dbackup\\AI小说\\InkNexus')
    ) {
      merged.workspaceRoot = 'c:\\Dbackup\\AI小说\\InkNexus'
      atomicWriteJson(this.configPath, merged)
    }
    return merged
  }

  saveConfig(partial: Partial<AppConfig>): AppConfig {
    const next = { ...this.getConfig(), ...partial }
    atomicWriteJson(this.configPath, next)
    return next
  }

  // --- Encrypted Secrets Vault ---
  getApiSecrets(): Record<string, { apiKey: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }> {
    const raw = safeReadJson<Record<string, { encryptedKey?: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }>>(
      this.secretsPath,
      {}
    )
    const out: Record<string, { apiKey: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }> = {}
    for (const [id, entry] of Object.entries(raw)) {
      let apiKey = ''
      if (entry.encryptedKey) {
        try {
          apiKey = this.vault.decrypt(entry.encryptedKey)
        } catch {
          apiKey = ''
        }
      }
      out[id] = {
        apiKey,
        endpointId: entry.endpointId,
        baseUrl: entry.baseUrl,
        models: entry.models,
        enabled: entry.enabled
      }
    }
    return out
  }

  saveApiSecret(
    presetId: string,
    payload: { apiKey?: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }
  ): void {
    const raw = safeReadJson<Record<string, { encryptedKey?: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }>>(
      this.secretsPath,
      {}
    )
    const prev = raw[presetId] ?? {}
    raw[presetId] = {
      ...prev,
      ...(payload.apiKey !== undefined
        ? { encryptedKey: payload.apiKey ? this.vault.encrypt(payload.apiKey) : '' }
        : {}),
      ...(payload.endpointId !== undefined ? { endpointId: payload.endpointId } : {}),
      ...(payload.baseUrl !== undefined ? { baseUrl: payload.baseUrl } : {}),
      ...(payload.models !== undefined ? { models: payload.models } : {}),
      ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {})
    }
    atomicWriteJson(this.secretsPath, raw)
  }

  // --- Project Index ---
  listIndexedProjects(): ProjectSummary[] {
    return safeReadJson<ProjectSummary[]>(this.projectsIndexPath, [])
  }

  upsertIndexedProject(summary: ProjectSummary): void {
    const list = this.listIndexedProjects()
    const idx = list.findIndex((p) => p.id === summary.id || path.resolve(p.rootPath).toLowerCase() === path.resolve(summary.rootPath).toLowerCase())
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...summary }
    } else {
      list.unshift(summary)
    }
    atomicWriteJson(this.projectsIndexPath, list)
  }

  removeIndexedProject(projectId: string): void {
    const list = this.listIndexedProjects().filter((p) => p.id !== projectId)
    atomicWriteJson(this.projectsIndexPath, list)
  }

  migrateProjectDir(oldRoot: string, newRoot: string): void {
    const oldId = hashProjectId(oldRoot)
    const newId = hashProjectId(newRoot)
    if (oldId === newId) return
    const oldDir = this.projectDirById(oldId)
    const newDir = this.projectDirById(newId)
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      fs.mkdirSync(path.dirname(newDir), { recursive: true })
      copyDirRecursiveSync(oldDir, newDir)
      fs.rmSync(oldDir, { recursive: true, force: true })
    }
    const next = this.listIndexedProjects().map((p) =>
      p.id === oldId ? { ...p, id: newId, rootPath: path.resolve(newRoot) } : p
    )
    atomicWriteJson(this.projectsIndexPath, next)
  }

  // --- Annotations ---
  private annotationsPath(projectRoot: string): string {
    return path.join(this.projectDir(projectRoot), 'annotations.json')
  }

  listAnnotations(projectRoot: string, filePath?: string): AnnotationThread[] {
    const all = safeReadJson<AnnotationThread[]>(this.annotationsPath(projectRoot), [])
    if (!filePath) return all
    const target = path.resolve(filePath).toLowerCase()
    return all.filter((a) => path.resolve(a.filePath).toLowerCase() === target)
  }

  upsertAnnotation(projectRoot: string, thread: AnnotationThread): AnnotationThread[] {
    const all = this.listAnnotations(projectRoot)
    const idx = all.findIndex((a) => a.id === thread.id)
    if (idx >= 0) all[idx] = thread
    else all.push(thread)
    atomicWriteJson(this.annotationsPath(projectRoot), all)
    return all
  }

  addAnnotationReply(projectRoot: string, annotationId: string, reply: AnnotationReply): AnnotationThread[] {
    const all = this.listAnnotations(projectRoot)
    const target = all.find((a) => a.id === annotationId)
    if (target) {
      target.replies.push(reply)
      atomicWriteJson(this.annotationsPath(projectRoot), all)
    }
    return all
  }

  resolveAnnotation(projectRoot: string, annotationId: string, resolved: boolean): AnnotationThread[] {
    const all = this.listAnnotations(projectRoot)
    const target = all.find((a) => a.id === annotationId)
    if (target) {
      target.resolved = resolved
      atomicWriteJson(this.annotationsPath(projectRoot), all)
    }
    return all
  }

  deleteAnnotation(projectRoot: string, annotationId: string): AnnotationThread[] {
    const next = this.listAnnotations(projectRoot).filter((a) => a.id !== annotationId)
    atomicWriteJson(this.annotationsPath(projectRoot), next)
    return next
  }

  // --- Snapshots ---
  private snapshotsMetaPath(projectRoot: string): string {
    return path.join(this.projectDir(projectRoot), 'snapshots', 'index.json')
  }

  private snapshotsBlobDir(projectRoot: string): string {
    return path.join(this.projectDir(projectRoot), 'snapshots', 'blobs')
  }

  createSnapshot(
    projectRoot: string,
    filePath: string,
    content: string,
    source: SnapshotRecord['source'],
    summary: string
  ): SnapshotRecord {
    const id = `snap_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`
    const blobDir = this.snapshotsBlobDir(projectRoot)
    fs.mkdirSync(blobDir, { recursive: true })
    const blobPath = path.join(blobDir, `${id}.txt`)
    fs.writeFileSync(blobPath, content, 'utf8')
    const rec: SnapshotRecord = {
      id,
      filePath: path.resolve(filePath),
      source,
      summary,
      createdAt: Date.now(),
      sizeBytes: Buffer.byteLength(content, 'utf8')
    }
    const list = safeReadJson<SnapshotRecord[]>(this.snapshotsMetaPath(projectRoot), [])
    list.unshift(rec)

    const maxPerFile = this.getConfig().maxSnapshotsPerFile || 40
    const targetNorm = rec.filePath.toLowerCase()
    let sameFileCount = 0
    const kept: SnapshotRecord[] = []
    for (const item of list) {
      if (item.filePath.toLowerCase() === targetNorm) {
        sameFileCount++
        if (sameFileCount > maxPerFile) {
          const oldBlob = path.join(blobDir, `${item.id}.txt`)
          if (fs.existsSync(oldBlob)) fs.rmSync(oldBlob, { force: true })
          continue
        }
      }
      kept.push(item)
    }

    atomicWriteJson(this.snapshotsMetaPath(projectRoot), kept)
    return rec
  }

  listSnapshots(projectRoot: string, filePath?: string): SnapshotRecord[] {
    const list = safeReadJson<SnapshotRecord[]>(this.snapshotsMetaPath(projectRoot), [])
    if (!filePath) return list
    const norm = path.resolve(filePath).toLowerCase()
    return list.filter((s) => s.filePath.toLowerCase() === norm)
  }

  getSnapshotContent(projectRoot: string, snapshotId: string): string | null {
    const blobPath = path.join(this.snapshotsBlobDir(projectRoot), `${snapshotId}.txt`)
    if (!fs.existsSync(blobPath)) return null
    return fs.readFileSync(blobPath, 'utf8')
  }

  // --- Canon Locks ---
  private canonLocksPath(projectRoot: string): string {
    return path.join(this.projectDir(projectRoot), 'canon-locks.json')
  }

  listCanonLocks(projectRoot: string): string[] {
    return safeReadJson<string[]>(this.canonLocksPath(projectRoot), [])
  }

  setCanonLock(projectRoot: string, relPath: string, locked: boolean): string[] {
    const set = new Set(this.listCanonLocks(projectRoot))
    if (locked) set.add(relPath)
    else set.delete(relPath)
    const next = Array.from(set)
    atomicWriteJson(this.canonLocksPath(projectRoot), next)
    return next
  }

  // --- Chat Sessions ---
  private chatPath(projectRoot: string): string {
    return path.join(this.projectDir(projectRoot), 'chat-sessions.json')
  }

  getChatMessages(projectRoot: string): ChatMessage[] {
    return safeReadJson<ChatMessage[]>(this.chatPath(projectRoot), [])
  }

  saveChatMessages(projectRoot: string, messages: ChatMessage[]): void {
    atomicWriteJson(this.chatPath(projectRoot), messages.slice(-200))
  }

  // --- Review Reports ---
  private reviewsPath(projectRoot: string): string {
    return path.join(this.projectDir(projectRoot), 'reviews.json')
  }

  listReviewHistory(projectRoot: string): ReviewHistoryEntry[] {
    const raw = safeReadJson<ReviewHistoryEntry[]>(this.reviewsPath(projectRoot), [])
    return raw
      .filter((r) => r && typeof r.createdAt === 'number' && typeof r.summary === 'string')
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  appendReviewRecord(projectRoot: string, record: ReviewHistoryEntry | unknown): ReviewHistoryEntry[] {
    const list = safeReadJson<unknown[]>(this.reviewsPath(projectRoot), [])
    list.unshift(record)
    atomicWriteJson(this.reviewsPath(projectRoot), list.slice(0, 100))
    return this.listReviewHistory(projectRoot)
  }

  // --- Skill Update SHAs & Radar Trend History ---
  private skillMetaPath(): string {
    return path.join(this.rootDir, 'skill-meta.json')
  }

  getSkillMeta(): Record<string, { sha?: string; version?: string; checkedAt?: number }> {
    return safeReadJson<Record<string, { sha?: string; version?: string; checkedAt?: number }>>(this.skillMetaPath(), {})
  }

  saveSkillMeta(skillId: string, patch: { sha?: string; version?: string; checkedAt?: number }): void {
    const all = this.getSkillMeta()
    all[skillId] = { ...(all[skillId] ?? {}), ...patch }
    atomicWriteJson(this.skillMetaPath(), all)
  }

  private radarTrendsPath(): string {
    return path.join(this.rootDir, 'radar-trends.json')
  }

  listRadarTrends(): RadarTrendAnalysis[] {
    return safeReadJson<RadarTrendAnalysis[]>(this.radarTrendsPath(), []).sort((a, b) => b.createdAt - a.createdAt)
  }

  saveRadarTrend(item: RadarTrendAnalysis): RadarTrendAnalysis[] {
    const next = [item, ...this.listRadarTrends()].slice(0, 40)
    atomicWriteJson(this.radarTrendsPath(), next)
    return next
  }

  // --- Swarm History ---
  getSwarmJobs(): SwarmJob[] {
    return safeReadJson<SwarmJob[]>(this.swarmHistoryPath, [])
  }

  saveSwarmJobs(jobs: SwarmJob[]): void {
    atomicWriteJson(this.swarmHistoryPath, jobs.slice(0, 200))
  }

  clearSwarmHistory(): void {
    if (fs.existsSync(this.swarmHistoryPath)) {
      fs.rmSync(this.swarmHistoryPath, { force: true })
    }
  }

  // --- AppData Storage Report & Selective Deletion ---
  getStorageReport(): AppDataStorageReport {
    const projectsDir = path.join(this.rootDir, 'projects')
    const indexed = this.listIndexedProjects()
    const indexById = new Map(indexed.map((p) => [p.id, p]))
    const breakdown: ProjectStorageBreakdown[] = []

    if (fs.existsSync(projectsDir)) {
      for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const pId = entry.name
        const pPath = path.join(projectsDir, pId)
        const meta = indexById.get(pId)
        const annotationsBytes = fileSizeBytes(path.join(pPath, 'annotations.json'))
        const snapshotsBytes = dirSizeBytes(path.join(pPath, 'snapshots'))
        const chatBytes = fileSizeBytes(path.join(pPath, 'chat-sessions.json'))
        const reviewsBytes = fileSizeBytes(path.join(pPath, 'reviews.json'))
        const annotations = safeReadJson<AnnotationThread[]>(path.join(pPath, 'annotations.json'), [])
        const snapshots = safeReadJson<SnapshotRecord[]>(path.join(pPath, 'snapshots', 'index.json'), [])
        const totalBytes = annotationsBytes + snapshotsBytes + chatBytes + reviewsBytes
        breakdown.push({
          projectId: pId,
          title: meta?.title ?? `作品缓存 (${pId.slice(0, 6)})`,
          rootPath: meta?.rootPath ?? '',
          annotationsBytes,
          snapshotsBytes,
          chatBytes,
          reviewsBytes,
          totalBytes,
          snapshotCount: snapshots.length,
          annotationCount: annotations.length
        })
      }
    }

    const swarmBytes = dirSizeBytes(path.join(this.rootDir, 'swarm'))
    const tempUpdateBytes = dirSizeBytes(path.join(os.tmpdir(), 'InkNexusStudio-Updates'))
    const tempAppBytes = dirSizeBytes(path.join(this.rootDir, 'temp-cache'))
    const snapshotsTotalBytes = breakdown.reduce((acc, p) => acc + p.snapshotsBytes, 0)
    const tempCacheBytes = tempUpdateBytes + tempAppBytes + snapshotsTotalBytes
    const totalBytes = dirSizeBytes(this.rootDir)
    return {
      rootDir: this.rootDir,
      totalBytes,
      tempCacheBytes,
      swarmBytes,
      projects: breakdown.sort((a, b) => b.totalBytes - a.totalBytes)
    }
  }

  clearTempCachesOnly(): void {
    const tmpUpdater = path.join(os.tmpdir(), 'InkNexusStudio-Updates')
    if (fs.existsSync(tmpUpdater)) fs.rmSync(tmpUpdater, { recursive: true, force: true })

    const tempAppDir = path.join(this.rootDir, 'temp-cache')
    if (fs.existsSync(tempAppDir)) fs.rmSync(tempAppDir, { recursive: true, force: true })

    const projectsDir = path.join(this.rootDir, 'projects')
    if (fs.existsSync(projectsDir)) {
      for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const snapDir = path.join(projectsDir, entry.name, 'snapshots')
        if (fs.existsSync(snapDir)) {
          fs.rmSync(snapDir, { recursive: true, force: true })
        }
      }
    }
  }

  deleteProjectData(projectId: string, scopes: StorageScope[]): void {
    const pDir = this.projectDirById(projectId)
    if (!fs.existsSync(pDir)) return
    if (scopes.includes('all')) {
      fs.rmSync(pDir, { recursive: true, force: true })
      this.removeIndexedProject(projectId)
      return
    }
    if (scopes.includes('snapshots')) {
      fs.rmSync(path.join(pDir, 'snapshots'), { recursive: true, force: true })
    }
  }
}
