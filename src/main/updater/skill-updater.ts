import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import type { SkillId, SkillRegistryItem } from '@shared/types'
import { AppDataStore } from '../storage/appdata-store'
import { SkillLoader, parseSkillVersion } from '../orchestrator/skill-loader'

export interface SkillRepoSpec {
  id: SkillId
  name: string
  repoOwner: string
  repoName: string
  repoUrl: string
}

export const SKILL_GITHUB_REGISTRY: SkillRepoSpec[] = [
  {
    id: 'story-world-architect',
    name: '小说世界观架构师',
    repoOwner: 'LilHaopeng',
    repoName: 'story-world-architect',
    repoUrl: 'https://github.com/LilHaopeng/story-world-architect'
  },
  {
    id: 'story-outline-architect',
    name: '小说大纲架构师',
    repoOwner: 'LilHaopeng',
    repoName: 'story-outline-architect',
    repoUrl: 'https://github.com/LilHaopeng/story-outline-architect'
  },
  {
    id: 'story-prose-writer',
    name: '小说正文写作',
    repoOwner: 'LilHaopeng',
    repoName: 'story-prose-writer',
    repoUrl: 'https://github.com/LilHaopeng/story-prose-writer'
  },
  {
    id: 'webnovel-short-studio',
    name: '短篇网文与微短剧创作室',
    repoOwner: 'LilHaopeng',
    repoName: 'webnovel-short-studio',
    repoUrl: 'https://github.com/LilHaopeng/webnovel-short-studio'
  },
  {
    id: 'webnovel-market-radar',
    name: '网文与 AI 短剧市场扫榜雷达',
    repoOwner: 'LilHaopeng',
    repoName: 'webnovel-market-radar',
    repoUrl: 'https://github.com/LilHaopeng/webnovel-market-radar'
  },
  {
    id: 'ai-drama-script-studio',
    name: 'AI 短剧与漫剧编剧工作室',
    repoOwner: 'LilHaopeng',
    repoName: 'ai-drama-script-studio',
    repoUrl: 'https://github.com/LilHaopeng/ai-drama-script-studio'
  }
]

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

export class SkillUpdaterService {
  constructor(
    private readonly skillLoader: SkillLoader,
    private readonly store: AppDataStore
  ) {}

  listRegistry(): SkillRegistryItem[] {
    const meta = this.store.getSkillMeta()
    return SKILL_GITHUB_REGISTRY.map((spec) => {
      const loaded = this.skillLoader.loadSkill(spec.id)
      const m = meta[spec.id]
      return {
        id: spec.id,
        name: spec.name,
        repoOwner: spec.repoOwner,
        repoName: spec.repoName,
        repoUrl: spec.repoUrl,
        localVersion: loaded?.version ?? '1.0.0',
        localSha: m?.sha,
        checkedAt: m?.checkedAt,
        summary: loaded?.skillSummary.slice(0, 320) ?? '',
        scripts: loaded ? Object.keys(loaded.scripts) : []
      }
    })
  }

  async checkSkillUpdate(skillId: SkillId): Promise<SkillRegistryItem> {
    const spec = SKILL_GITHUB_REGISTRY.find((s) => s.id === skillId)
    if (!spec) throw new Error(`未知 Skill：${skillId}`)
    const loaded = this.skillLoader.loadSkill(skillId)
    const localVersion = loaded?.version ?? '1.0.0'
    const meta = this.store.getSkillMeta()[skillId]

    const headers = { 'User-Agent': 'InkNexus-Studio-Updater', Accept: 'application/vnd.github+json' }
    const [commitRes, mdRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${spec.repoOwner}/${spec.repoName}/commits/main`, { headers }),
      fetch(`https://raw.githubusercontent.com/${spec.repoOwner}/${spec.repoName}/main/SKILL.md`, {
        headers: { 'User-Agent': 'InkNexus-Studio-Updater' }
      })
    ])

    let remoteSha: string | undefined
    if (commitRes.ok) {
      const json = (await commitRes.json()) as { sha?: string }
      remoteSha = json.sha?.slice(0, 8)
    }

    let remoteVersion: string | undefined
    if (mdRes.ok) {
      const mdText = await mdRes.text()
      remoteVersion = parseSkillVersion(mdText)
    }

    const versionNewer = Boolean(remoteVersion && compareVersions(remoteVersion, localVersion) > 0)
    const shaChanged = Boolean(meta?.sha && remoteSha && meta.sha !== remoteSha)
    const hasUpdate = versionNewer || shaChanged
    const checkedAt = Date.now()
    this.store.saveSkillMeta(skillId, { checkedAt, version: localVersion })

    return {
      id: spec.id,
      name: spec.name,
      repoOwner: spec.repoOwner,
      repoName: spec.repoName,
      repoUrl: spec.repoUrl,
      localVersion,
      remoteVersion,
      localSha: meta?.sha,
      remoteSha,
      hasUpdate,
      checkedAt,
      summary: loaded?.skillSummary.slice(0, 320) ?? '',
      scripts: loaded ? Object.keys(loaded.scripts) : []
    }
  }

  async pullSkillUpdate(skillId: SkillId): Promise<SkillRegistryItem> {
    const spec = SKILL_GITHUB_REGISTRY.find((s) => s.id === skillId)
    if (!spec) throw new Error(`未知 Skill：${skillId}`)

    const zipUrl = `https://github.com/${spec.repoOwner}/${spec.repoName}/archive/refs/heads/main.zip`
    const res = await fetch(zipUrl, { headers: { 'User-Agent': 'InkNexus-Studio-Updater' } })
    if (!res.ok) throw new Error(`下载 ${spec.repoName} 失败（HTTP ${res.status}）`)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `ink-skill-${skillId}-`))
    const zipPath = path.join(tmpDir, `${skillId}.zip`)
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir, { recursive: true })

    try {
      const buf = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(zipPath, buf)

      await new Promise<void>((resolve, reject) => {
        execFile(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`
          ],
          { windowsHide: true },
          (err) => (err ? reject(err) : resolve())
        )
      })

      const innerFolders = fs.readdirSync(extractDir).filter((f) => fs.statSync(path.join(extractDir, f)).isDirectory())
      const sourceRoot = innerFolders[0] ? path.join(extractDir, innerFolders[0]) : extractDir

      const targetRoot = path.join(this.skillLoader.getWritableInstallRoot(), skillId)
      if (fs.existsSync(targetRoot)) fs.rmSync(targetRoot, { recursive: true, force: true })
      fs.cpSync(sourceRoot, targetRoot, { recursive: true })

      const checked = await this.checkSkillUpdate(skillId)
      if (checked.remoteSha) {
        this.store.saveSkillMeta(skillId, { sha: checked.remoteSha, version: checked.localVersion, checkedAt: Date.now() })
      }
      return { ...checked, localSha: checked.remoteSha, hasUpdate: false }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}
