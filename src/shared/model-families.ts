import type { ReasoningLevel } from './types'

export const REASONING_ORDER: ReasoningLevel[] = ['off', 'low', 'medium', 'high', 'max']

export const REASONING_LABELS: Record<ReasoningLevel, string> = {
  off: '关闭',
  low: '轻度',
  medium: '标准',
  high: '深度',
  max: '极限'
}

export interface ModelFamily {
  baseId: string
  supportedLevels: ReasoningLevel[]
  rawVariants: Partial<Record<ReasoningLevel, string>>
}

const EFFORT_SUFFIX_RE = /^(.+?)-(off|low|medium|high|xhigh|thinking)$/i

export function parseModelEffortVariant(modelId: string): { baseId: string; effort?: ReasoningLevel } {
  const m = modelId.trim().match(EFFORT_SUFFIX_RE)
  if (!m) return { baseId: modelId.trim() }
  const suffix = m[2].toLowerCase()
  let effort: ReasoningLevel = 'medium'
  if (suffix === 'off') effort = 'off'
  else if (suffix === 'low') effort = 'low'
  else if (suffix === 'medium') effort = 'medium'
  else if (suffix === 'high' || suffix === 'thinking') effort = 'high'
  else if (suffix === 'xhigh') effort = 'max'
  return { baseId: m[1], effort }
}

export function clampReasoningLevel(level: ReasoningLevel, supportedLevels: ReasoningLevel[]): ReasoningLevel {
  if (supportedLevels.length === 0) return level
  if (supportedLevels.includes(level)) return level
  const targetIdx = REASONING_ORDER.indexOf(level)
  let best = supportedLevels[0]
  let bestDist = Infinity
  for (const cand of supportedLevels) {
    const d = Math.abs(REASONING_ORDER.indexOf(cand) - targetIdx)
    if (d < bestDist) {
      bestDist = d
      best = cand
    }
  }
  return best
}

export function groupModelsByFamily(rawModels: string[], fallbackLevels?: ReasoningLevel[]): ModelFamily[] {
  const fallback =
    fallbackLevels && fallbackLevels.length > 0
      ? [...fallbackLevels].sort((a, b) => REASONING_ORDER.indexOf(a) - REASONING_ORDER.indexOf(b))
      : [...REASONING_ORDER]

  const map = new Map<string, { order: number; variants: Partial<Record<ReasoningLevel, string>>; unsuffixed: boolean }>()
  let idx = 0

  for (const raw of rawModels) {
    const clean = raw.trim()
    if (!clean) continue
    const parsed = parseModelEffortVariant(clean)
    let entry = map.get(parsed.baseId)
    if (!entry) {
      entry = { order: idx++, variants: {}, unsuffixed: false }
      map.set(parsed.baseId, entry)
    }
    if (parsed.effort) {
      entry.variants[parsed.effort] = clean
    } else {
      entry.unsuffixed = true
    }
  }

  return Array.from(map.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([baseId, data]) => {
      const detected = (Object.keys(data.variants) as ReasoningLevel[]).sort(
        (a, b) => REASONING_ORDER.indexOf(a) - REASONING_ORDER.indexOf(b)
      )
      const supportedLevels = detected.length > 0 && !data.unsuffixed ? detected : fallback
      return {
        baseId,
        supportedLevels,
        rawVariants: data.variants
      }
    })
}

export function resolveExecutableModelId(
  rawModels: string[],
  selectedModel: string,
  reasoning: ReasoningLevel
): string {
  const { baseId } = parseModelEffortVariant(selectedModel || rawModels[0] || '')
  const families = groupModelsByFamily(rawModels)
  const family = families.find((f) => f.baseId === baseId) ?? families[0]
  if (!family) return selectedModel
  const variantKeys = Object.keys(family.rawVariants) as ReasoningLevel[]
  if (variantKeys.length === 0) {
    return family.baseId
  }
  const best = clampReasoningLevel(reasoning, variantKeys)
  return family.rawVariants[best] ?? family.baseId
}
