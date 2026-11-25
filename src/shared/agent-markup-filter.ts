/**
 * Helpers for hiding internal Agent / Skill engineering metadata tags
 * (such as L0/L1/L2, Status, ID: CH-001, ARC-001, SEQ-001, RULE-NNN, etc.)
 * from clean user-facing reading, review reports, and market radar views,
 * while preserving original metadata safely when saving edited files.
 */

const AGENT_META_LINE_RE =
  /^\s*(?:[-*•]\s*)?(?:ID|状态|Status|所属故事弧|所属剧情段|读取世界观|拟议世界状态变化|未闭环|章节节奏类型|Agent标记|Track|Pipeline|Stage)\s*[：:]\s*.*$/i

const AGENT_INLINE_TAG_RE =
  /\[(?:L[0-5]|Status|OK|待确认|数据稀疏|内置参考降级|ERROR|WARN|FAIL|INFO)\]/gi

const AGENT_CODE_PREFIX_RE = /\b(?:L[0-5]|CH-\d+|ARC-\d+|SEQ-\d+|RULE-\d+|CON-\d+|SEED-\d+|CHAR-\d+|WLOOP-\d+|LOOP-\d+|WCR-\d+|CR-\d+)\b/g

export function splitHiddenAgentMetadata(markdown: string): {
  hiddenHeader: string
  cleanBody: string
} {
  if (!markdown) return { hiddenHeader: '', cleanBody: '' }

  let remaining = markdown
  const hiddenParts: string[] = []

  // 1. YAML frontmatter
  const fmMatch = remaining.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  if (fmMatch) {
    hiddenParts.push(fmMatch[0].trimEnd())
    remaining = remaining.slice(fmMatch[0].length)
  }

  // 2. Leading HTML comments or L0/L1/Status lines
  const lines = remaining.split(/\r?\n/)
  const keptLines: string[] = []
  let inCommentBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('<!--')) {
      hiddenParts.push(line)
      if (!trimmed.includes('-->')) inCommentBlock = true
      continue
    }
    if (inCommentBlock) {
      hiddenParts.push(line)
      if (trimmed.includes('-->')) inCommentBlock = false
      continue
    }
    if (AGENT_META_LINE_RE.test(line)) {
      hiddenParts.push(line)
      continue
    }
    if (/^\s*(?:[-*]\s*)?L[0-5]\s*[：:]/.test(trimmed)) {
      hiddenParts.push(line)
      continue
    }
    keptLines.push(line)
  }

  // Collapse extra leading blank lines
  const cleanBody = keptLines.join('\n').replace(/^\n{2,}/, '')
  return {
    hiddenHeader: hiddenParts.join('\n'),
    cleanBody
  }
}

export function mergeHiddenAgentMetadata(hiddenHeader: string, editedCleanBody: string): string {
  if (!hiddenHeader.trim()) return editedCleanBody
  return `${hiddenHeader.trimEnd()}\n\n${editedCleanBody.replace(/^\n+/, '')}`
}

export function stripAgentMarkupForDisplay(rawText: string): string {
  if (!rawText) return ''
  // Remove JSON code blocks (e.g., review verdict JSON blocks)
  let cleaned = rawText.replace(/```json[\s\S]*?```/gi, '')
  cleaned = cleaned.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/^```[a-zA-Z0-9_-]*\r?\n?/, '').replace(/```\s*$/, '')
  )

  const lines = cleaned.split(/\r?\n/)
  const outLines: string[] = []
  for (let line of lines) {
    if (AGENT_META_LINE_RE.test(line)) continue
    if (/^\s*(?:[-*]\s*)?L[0-5]\s*[：:]/.test(line)) continue
    if (/^\s*---+\s*$/.test(line)) continue

    // Strip markdown heading hashes, bold/italic markers, backticks, blockquote '>'
    line = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(AGENT_INLINE_TAG_RE, '')
      .replace(AGENT_CODE_PREFIX_RE, '')
      .replace(/\s{2,}/g, ' ')
      .trim()

    if (line) outLines.push(line)
  }

  return outLines.join('\n')
}
