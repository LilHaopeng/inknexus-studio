import fs from 'fs'
import path from 'path'
import type { SkillId } from '@shared/types'

export interface SkillDefinition {
  id: SkillId
  dir: string
  skillMdPath: string
  version: string
  skillSummary: string
  scripts: Record<string, string>
  references: Record<string, string>
}

const ALL_SKILLS: SkillId[] = [
  'story-world-architect',
  'story-outline-architect',
  'story-prose-writer',
  'webnovel-short-studio',
  'webnovel-market-radar',
  'ai-drama-script-studio'
]

export function parseSkillVersion(rawMd: string): string {
  const m = rawMd.match(/^\s*version\s*:\s*["']?([^"'\r\n]+)["']?/m)
  return m ? m[1].trim() : '1.0.0'
}

export class SkillLoader {
  private readonly userSkillsDir: string
  private readonly appDataSkillsDir: string
  private readonly bundledSkillsDir: string

  constructor(options?: { userSkillsDir?: string; appDataSkillsDir?: string; bundledSkillsDir?: string }) {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    this.userSkillsDir = options?.userSkillsDir ?? path.join(home, '.gemini', 'config', 'skills')
    this.appDataSkillsDir =
      options?.appDataSkillsDir ??
      path.join(process.env.APPDATA || process.cwd(), 'InkNexusStudio', 'skills')
    const resourcesRoot = (process as unknown as { resourcesPath?: string }).resourcesPath
    this.bundledSkillsDir =
      options?.bundledSkillsDir ??
      (resourcesRoot && fs.existsSync(path.join(resourcesRoot, 'skills'))
        ? path.join(resourcesRoot, 'skills')
        : path.resolve(process.cwd(), 'resources', 'skills'))
  }

  getWritableInstallRoot(): string {
    if (fs.existsSync(this.userSkillsDir)) return this.userSkillsDir
    fs.mkdirSync(this.appDataSkillsDir, { recursive: true })
    return this.appDataSkillsDir
  }

  resolveSkillDir(id: SkillId): string | null {
    for (const base of [this.appDataSkillsDir, this.userSkillsDir, this.bundledSkillsDir]) {
      const candidate = path.join(base, id)
      if (fs.existsSync(path.join(candidate, 'SKILL.md'))) return candidate
    }
    return null
  }

  loadSkill(id: SkillId): SkillDefinition | null {
    const dir = this.resolveSkillDir(id)
    if (!dir) return null
    const skillMdPath = path.join(dir, 'SKILL.md')
    const raw = fs.readFileSync(skillMdPath, 'utf8')
    const version = parseSkillVersion(raw)
    const summary = raw.replace(/^---[\s\S]*?---\s*/, '').trim()

    const scripts: Record<string, string> = {}
    const scriptsDir = path.join(dir, 'scripts')
    if (fs.existsSync(scriptsDir)) {
      for (const f of fs.readdirSync(scriptsDir)) {
        if (f.endsWith('.py')) scripts[f] = path.join(scriptsDir, f)
      }
    }

    const references: Record<string, string> = {}
    const refsDir = path.join(dir, 'references')
    if (fs.existsSync(refsDir)) {
      for (const f of fs.readdirSync(refsDir)) {
        if (f.endsWith('.md')) references[f] = path.join(refsDir, f)
      }
    }

    return { id, dir, skillMdPath, version, skillSummary: summary, scripts, references }
  }

  listAllSkills(): SkillDefinition[] {
    return ALL_SKILLS.map((id) => this.loadSkill(id)).filter((s): s is SkillDefinition => s !== null)
  }

  getScriptPath(skillId: SkillId, scriptName: string): string | null {
    const skill = this.loadSkill(skillId)
    return skill?.scripts[scriptName] ?? null
  }
}
