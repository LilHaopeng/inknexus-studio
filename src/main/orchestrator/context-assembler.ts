import fs from 'fs'
import path from 'path'
import type { ContextSlice, CreationMode } from '@shared/types'

export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.75)
}

export class ContextAssembler {
  assemble(projectRoot: string, currentFilePath?: string, mode?: CreationMode): ContextSlice[] {
    if (!projectRoot || !fs.existsSync(projectRoot)) return []

    const candidates: Array<{ label: string; relPath: string; reason: string; priority: number }> = []

    const addIfExists = (relPath: string, label: string, reason: string, priority: number) => {
      const abs = path.join(projectRoot, relPath)
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        candidates.push({ label, relPath, reason, priority })
      }
    }

    if (mode === 'short-webnovel') {
      addIfExists('00_脑洞与节拍.md', '脑洞与节拍卡', '核心规则、爽点节拍与原声切片', 1)
      addIfExists('01_轻量状态.md', '轻量状态卡', '前文已明牌线索与人物最新状态', 2)
      addIfExists('选题简报.md', '选题简报', '扫榜情绪痛点与差异化切口', 4)
    } else if (mode === 'drama-script') {
      addIfExists('00_季播总案与资产表.md', '季播总案与资产表', '固定 @CHAR/@LOC/@VOICE 与声口切片', 1)
      addIfExists('01_分集卡点纲.md', '分集卡点纲', '黄金前3集与单集集末硬钩子', 2)
    } else {
      addIfExists('正文/00_文风与声口卡.md', '文风与声口卡', '全书防漂移定调原文切片', 1)
      addIfExists('大纲/00_故事DNA.md', '故事 DNA', '核心命题与不可偏移主线', 2)
      addIfExists('追踪/章节交接.md', '章节交接卡', '上章收尾镜头与衔接状态', 3)
      addIfExists('追踪/角色状态.md', '角色状态台账', '人物当前位置、伤势与信息边界', 4)
      addIfExists('设定/世界观/15_大纲接口.md', '世界观大纲接口', '硬规则边界与日常语言肌理', 5)
      addIfExists('大纲/01_故事架构.md', '故事架构', '五轨推进总表', 6)
    }

    // Match chapter outline if editing a numbered chapter
    if (currentFilePath) {
      const base = path.basename(currentFilePath)
      const numMatch = base.match(/第?0*(\d+)[章节]/)
      if (numMatch) {
        const padded = numMatch[1].padStart(3, '0')
        const outlineDir = path.join(projectRoot, '大纲')
        if (fs.existsSync(outlineDir)) {
          for (const f of fs.readdirSync(outlineDir)) {
            if (f.includes(padded) && f.endsWith('.md')) {
              addIfExists(path.join('大纲', f), `本章细纲 (${f})`, '对应当前章节剧情节点', 2)
            }
          }
        }
      }
    }

    const seen = new Set<string>()
    const slices: ContextSlice[] = []
    for (const c of candidates.sort((a, b) => a.priority - b.priority)) {
      const absPath = path.join(projectRoot, c.relPath)
      if (seen.has(absPath.toLowerCase())) continue
      seen.add(absPath.toLowerCase())
      try {
        const content = fs.readFileSync(absPath, 'utf8')
        slices.push({
          id: `ctx_${c.relPath}`,
          label: c.label,
          relPath: c.relPath,
          absPath,
          tokens: estimateTokens(content),
          enabled: true,
          reason: c.reason
        })
      } catch {
        // ignore unreadable file
      }
    }

    return slices
  }

  readEnabledSlices(slices: ContextSlice[]): string {
    return slices
      .filter((s) => s.enabled && fs.existsSync(s.absPath))
      .map((s) => {
        const text = fs.readFileSync(s.absPath, 'utf8')
        return `### [${s.label}] (${s.relPath})\n${text.slice(0, 8000)}`
      })
      .join('\n\n')
  }
}
