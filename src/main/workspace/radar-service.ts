import fs from 'fs'
import path from 'path'
import type { AgentSelection, RadarReportSummary, RadarTrendAnalysis } from '@shared/types'
import { stripAgentMarkupForDisplay } from '../../shared/agent-markup-filter'
import { SkillLoader } from '../orchestrator/skill-loader'
import { AppDataStore } from '../storage/appdata-store'

export class RadarService {
  constructor(
    private readonly skillLoader: SkillLoader,
    private readonly store: AppDataStore
  ) {}

  scanReports(workspaceRoot: string): RadarReportSummary[] {
    const scanDir = path.join(workspaceRoot, '扫榜')
    if (!fs.existsSync(scanDir)) return []
    const out: RadarReportSummary[] = []

    for (const entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const folderPath = path.join(scanDir, entry.name)
      const scanFile = path.join(folderPath, '扫榜报告.md')
      const briefFile = path.join(folderPath, '选题简报.md')
      const rawScan = fs.existsSync(scanFile) ? fs.readFileSync(scanFile, 'utf8') : ''
      const rawBrief = fs.existsSync(briefFile) ? fs.readFileSync(briefFile, 'utf8') : ''

      const scanDate = rawScan.match(/扫榜日期[：:]\s*([^\r\n]+)/)?.[1]?.trim() || entry.name.slice(0, 8)
      const track = rawScan.match(/赛道类型[：:]\s*([^\r\n]+)/)?.[1]?.trim() || entry.name.split('_').pop()
      const sampleCount = rawScan.match(/有效样本数[：:]\s*([^\r\n]+)/)?.[1]?.trim()
      const qualityStatus = rawScan.match(/数据质量[：:]\s*([^\r\n]+)/)?.[1]?.trim()
      const platformMatch = entry.name.split('_')[1] || rawBrief.match(/目标平台[：:]\s*([^\r\n]+)/)?.[1]?.trim()

      out.push({
        folderName: entry.name,
        folderPath,
        hasScanReport: Boolean(rawScan),
        hasTopicBrief: Boolean(rawBrief),
        scanDate,
        platform: platformMatch,
        track,
        sampleCount,
        qualityStatus,
        scanSnippet: rawScan ? stripAgentMarkupForDisplay(rawScan.slice(0, 1200)) : undefined,
        briefSnippet: rawBrief ? stripAgentMarkupForDisplay(rawBrief.slice(0, 1200)) : undefined,
        scanFullText: rawScan ? stripAgentMarkupForDisplay(rawScan) : undefined,
        briefFullText: rawBrief ? stripAgentMarkupForDisplay(rawBrief) : undefined
      })
    }

    return out.sort((a, b) => b.folderName.localeCompare(a.folderName))
  }

  buildScanPrompt(params: {
    platform: string
    track: 'short' | 'long' | 'ai-drama' | 'both'
    notes?: string
  }): { systemPrompt: string; userPrompt: string; targetFolderName: string } {
    const skill = this.skillLoader.loadSkill('webnovel-market-radar')
    const baselinesPath = skill?.references['platform-baselines.md']
    const baselines = baselinesPath && fs.existsSync(baselinesPath) ? fs.readFileSync(baselinesPath, 'utf8').slice(0, 4500) : ''

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const safePlatform = params.platform.replace(/[\\/:*?"<>|\s]/g, '')
    const targetFolderName = `${dateStr}_${safePlatform}_${params.track}`

    const systemPrompt = [
      '你是「墨枢」内置的市场扫榜与选题分析专家，严格遵循 webnovel-market-radar 规范。',
      '要求：严禁编造具体在读人数或真实点击数；无实时网页抓取数据时须明确说明“基于内置市场基线参考”，可行性封顶「中」；强制原创化置换脑洞与反转切口。',
      skill ? `\n【市场雷达规范】\n${skill.skillSummary.slice(0, 2200)}` : '',
      baselines ? `\n【内置平台基线参考】\n${baselines}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    const userPrompt = [
      `请针对平台「${params.platform}」、赛道「${params.track}」执行一次结构化市场扫榜与选题简报生成。`,
      params.notes?.trim() ? `\n【用户补充关注方向或近期榜单素材】\n${params.notes.trim()}` : '',
      '',
      '请严格按以下两部分分隔输出，方便软件直接入库为 扫榜报告.md 与 选题简报.md：',
      '===SCAN_REPORT===',
      `# 网文扫榜报告：${params.platform}（${params.track}）`,
      `- 扫榜日期：${new Date().toISOString().slice(0, 10)}`,
      `- 赛道类型：${params.track}`,
      '- 采集方式：baseline（或用户提供样本）',
      '- 有效样本数：...',
      '- 数据质量：OK / 内置参考降级',
      '## 市场概况',
      '## 情绪与题材热度排行',
      '## 风口与饱和预警',
      '===TOPIC_BRIEF===',
      `# 选题简报：${params.platform}（${params.track}）`,
      '## 推荐选题（2-3 个可直接开书的差异化高概念选题，附情绪痛点、差异化切口、标题导语方向与风险提示）'
    ]
      .filter(Boolean)
      .join('\n')

    return { systemPrompt, userPrompt, targetFolderName }
  }

  saveScanResult(workspaceRoot: string, folderName: string, rawOutput: string): RadarReportSummary {
    const dir = path.join(workspaceRoot, '扫榜', folderName)
    fs.mkdirSync(dir, { recursive: true })

    const scanSplit = rawOutput.split('===SCAN_REPORT===')[1] ?? rawOutput
    const [scanPart, briefPartRaw] = scanSplit.split('===TOPIC_BRIEF===')
    const scanText = (scanPart || rawOutput).trim()
    const briefText = (briefPartRaw || '').trim()

    fs.writeFileSync(path.join(dir, '扫榜报告.md'), scanText, 'utf8')
    if (briefText) {
      fs.writeFileSync(path.join(dir, '选题简报.md'), briefText, 'utf8')
    }

    return this.scanReports(workspaceRoot).find((r) => r.folderName === folderName) ?? {
      folderName,
      folderPath: dir,
      hasScanReport: true,
      hasTopicBrief: Boolean(briefText)
    }
  }

  buildTrendComparePrompt(reports: RadarReportSummary[]): string {
    const snippets = reports
      .map(
        (r, i) =>
          `【第 ${i + 1} 份报告】${r.folderName}（日期：${r.scanDate || '-'}，平台：${r.platform || '-'}）\n${(
            r.scanFullText || r.briefFullText || ''
          ).slice(0, 2600)}`
      )
      .join('\n\n')

    return [
      `请对比以下 ${reports.length} 份历史扫榜报告的趋势演变，为创作者输出一份清晰、无工程暗语的趋势对比结论：`,
      '1. 持续升温与新冒头的题材/情绪（给出具体原因）；',
      '2. 正在退潮或同质化严重的高危红海方向；',
      '3. 结合时间线演变，给出 2 个当下最值得优先立项的切入建议。',
      '',
      '注意：输出面向人类编辑的纯文本段落与条目，不要输出 L0/L1/Status 等内部标记。',
      '',
      snippets
    ].join('\n')
  }

  saveTrendAnalysis(comparedFolders: string[], rawSummary: string, selection: AgentSelection): RadarTrendAnalysis[] {
    const entry: RadarTrendAnalysis = {
      id: `trend_${Date.now()}`,
      createdAt: Date.now(),
      comparedFolders,
      summary: stripAgentMarkupForDisplay(`${rawSummary}\n\n（分析引擎：${selection.backendId} / ${selection.model}）`)
    }
    return this.store.saveRadarTrend(entry)
  }
}
