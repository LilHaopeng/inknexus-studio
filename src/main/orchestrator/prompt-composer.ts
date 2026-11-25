import type {
  AnnotationThread,
  CreationIntent,
  CreationMode,
  ImportFileRole,
  ImportedFileItem,
  PreComposedPrompt,
  SkillId,
  SubTemplateId
} from '@shared/types'
import { SkillLoader } from './skill-loader'

const ROLE_LABELS: Record<ImportFileRole, string> = {
  world: '世界观设定',
  outline: '故事大纲',
  prose: '小说正文',
  character: '人物设定',
  'style-sample': '文风声口样本',
  'radar-brief': '市场扫榜简报',
  'full-project': '整套作品目录',
  custom: '自定义材料'
}

const MODE_LABELS: Record<CreationMode, string> = {
  'long-novel': '长文小说（小说三件套）',
  'short-webnovel': '短篇网文（1-5万字快反）',
  'drama-script': 'AI 剧本（短剧/漫剧/沙雕剧）'
}

function skillsForModeAndIntent(mode: CreationMode, intent: CreationIntent): SkillId[] {
  if (mode === 'short-webnovel') {
    return intent === 'adapt-to-script'
      ? ['webnovel-short-studio', 'ai-drama-script-studio']
      : ['webnovel-short-studio']
  }
  if (mode === 'drama-script') {
    return ['ai-drama-script-studio']
  }
  switch (intent) {
    case 'expand-world':
      return ['story-world-architect']
    case 'draft-outline':
    case 'reverse-outline':
      return ['story-outline-architect', 'story-world-architect']
    case 'complete-from-outline':
      return ['story-outline-architect', 'story-world-architect', 'story-prose-writer']
    case 'adapt-to-script':
      return ['story-prose-writer', 'ai-drama-script-studio']
    case 'write-prose':
    case 'audit-and-polish':
    default:
      return ['story-prose-writer', 'story-outline-architect', 'story-world-architect']
  }
}

export class PromptComposer {
  constructor(private readonly skillLoader: SkillLoader) {}

  composeFromScratch(params: {
    mode: CreationMode
    subTemplate?: SubTemplateId
    title: string
    userIdea?: string
  }): PreComposedPrompt {
    const intent: CreationIntent = params.mode === 'long-novel' ? 'draft-outline' : 'write-prose'
    const skillIds = skillsForModeAndIntent(params.mode, intent)
    const systemPrompt = this.buildSystemPrompt(params.mode, skillIds)

    let taskTitle = `开启${MODE_LABELS[params.mode]}：《${params.title}》`
    let userDraftPrompt = ''

    if (params.mode === 'long-novel') {
      taskTitle = `长篇立项与 Story DNA 设计：《${params.title}》`
      userDraftPrompt = [
        `请按「小说三件套」工作流启动长篇作品《${params.title}》（模板：${params.subTemplate ?? 'long-standard'}）。`,
        params.userIdea?.trim() ? `\n【我的核心灵感 / 需求】\n${params.userIdea.trim()}\n` : '',
        `请先帮我：`,
        `1. 提炼核心 Story DNA（创作初衷、期待场面、核心追读问题与 4 项创作锚点）；`,
        `2. 判断是否需要先固化世界观硬规则（写入 设定/），再展开 L1–L4 大纲；`,
        `3. 给出 2 个差异化切口供我拍板后，再批量生成后续文件。`
      ]
        .filter(Boolean)
        .join('\n')
    } else if (params.mode === 'short-webnovel') {
      const modeName = params.subTemplate === 'short-microdrama' ? '微短剧式短中篇（2-5万字）' : '超短篇（1-3万字）'
      taskTitle = `短篇脑洞压测与节拍设计：《${params.title}》`
      userDraftPrompt = [
        `请使用「短篇网文工作室」模板（${modeName}）启动作品《${params.title}》。`,
        params.userIdea?.trim() ? `\n【我的脑洞想法】\n${params.userIdea.trim()}\n` : '',
        `请执行：`,
        `1. 先对当前脑洞做「4 问脑洞压测」（3秒画面感、持续冲突、反常识切口、不降智博弈依据）；`,
        `2. 拟定《00_脑洞与节拍.md》一页高概念规则卡 + 爽感叠加节拍表；`,
        `3. 试写 300-500 字黄金开篇定调声口，等我确认对味后再推进正文。`
      ]
        .filter(Boolean)
        .join('\n')
    } else {
      const genreName =
        params.subTemplate === 'drama-comic'
          ? '高奇观 AI 漫剧 (comic-drama)'
          : params.subTemplate === 'drama-shadiao'
            ? '高频反转沙雕短剧 (shadiao)'
            : '仿真人 AI 短剧 (ai-drama)'
      taskTitle = `AI 剧本立项与预匹配：《${params.title}》`
      userDraftPrompt = [
        `请使用「AI 短剧编剧工作室」启动剧本《${params.title}》，剧种定位：${genreName}。`,
        params.userIdea?.trim() ? `\n【我的剧本构想】\n${params.userIdea.trim()}\n` : '',
        `请先严格执行：`,
        `1. 完成写前「节奏与逻辑 5 问预匹配」；`,
        `2. 若冲击红果 40× 分成，请守住单集旁白/OS 占比 ≤ 20% 红线，以角色口型对白推进；`,
        `3. 输出《00_季播总案与资产表.md》（含 @CHAR / @LOC / @VOICE 固定资产槽位）及黄金前 3 集卡点纲。`
      ]
        .filter(Boolean)
        .join('\n')
    }

    return {
      systemPrompt,
      userDraftPrompt,
      attachedSkillIds: skillIds,
      summaryLabel: `${MODE_LABELS[params.mode]} · 已装入 ${skillIds.length} 项 Skill 规则`,
      taskTitle
    }
  }

  composeFromImport(params: {
    mode: CreationMode
    intent: CreationIntent
    customIntentText?: string
    projectTitle: string
    files: ImportedFileItem[]
    userNotes?: string
  }): PreComposedPrompt {
    const skillIds = skillsForModeAndIntent(params.mode, params.intent)
    const systemPrompt = this.buildSystemPrompt(params.mode, skillIds)

    const fileInventory = params.files
      .map((f, idx) => {
        const label = f.role === 'custom' && f.customRoleLabel ? f.customRoleLabel : ROLE_LABELS[f.role]
        return `${idx + 1}. 【${label}】\`${f.fileName}\`（约 ${f.charCount} 字）`
      })
      .join('\n')

    const intentInstruction = this.buildIntentPrompt(params.mode, params.intent, params.customIntentText)

    const userDraftPrompt = [
      `我已导入作品《${params.projectTitle}》的以下材料（共 ${params.files.length} 份）：`,
      fileInventory,
      '',
      `【本次创作目标（${MODE_LABELS[params.mode]}）】`,
      intentInstruction,
      params.userNotes?.trim() ? `\n【我的补充要求】\n${params.userNotes.trim()}` : ''
    ]
      .filter(Boolean)
      .join('\n')

    return {
      systemPrompt,
      userDraftPrompt,
      attachedSkillIds: skillIds,
      summaryLabel: `已关联 ${params.files.length} 份导入材料 · 预埋 ${intentInstruction.slice(0, 18)}...`,
      taskTitle: `导入共创：《${params.projectTitle}》`
    }
  }

  composeAnnotationRevision(params: {
    mode: CreationMode
    filePath: string
    chapterText: string
    annotations: AnnotationThread[]
    extraNote?: string
  }): PreComposedPrompt {
    const skillIds = skillsForModeAndIntent(params.mode, 'audit-and-polish')
    const systemPrompt = this.buildSystemPrompt(params.mode, skillIds)

    const annList = params.annotations
      .map(
        (a, i) =>
          `${i + 1}. [分类: ${a.category}] 原文锚点：「${a.quote}」\n   批注要求：${a.body}${
            a.replies.length ? `\n   补充讨论：${a.replies.map((r) => `${r.author}: ${r.body}`).join('；')}` : ''
          }`
      )
      .join('\n')

    const userDraftPrompt = [
      `请根据以下人工批注，对当前文档 \`${params.filePath}\` 进行**精准局部修订**。`,
      `要求：仅修改批注涉及的段落及必要衔接句，保留其余未被批注段落的原有声口与细节，并输出完整修订后的正文（便于在编辑器内做红绿 Diff 逐处审阅）。`,
      '',
      `【待处理批注清单（共 ${params.annotations.length} 条）】`,
      annList,
      params.extraNote?.trim() ? `\n【作者补充说明】\n${params.extraNote.trim()}` : '',
      '',
      `【当前正文原文】\n${params.chapterText}`
    ]
      .filter(Boolean)
      .join('\n')

    return {
      systemPrompt,
      userDraftPrompt,
      attachedSkillIds: skillIds,
      summaryLabel: `批注定点修订（${params.annotations.length} 条批注）`,
      taskTitle: `按批注修订 ${params.filePath}`
    }
  }

  composeReviewPrompt(params: {
    round: 1 | 2
    mode: CreationMode
    title: string
    draftText: string
    referenceContext: string
  }): string {
    if (params.round === 1) {
      return [
        `你现在担任【一审专业审查员（硬逻辑与正典把关）】。请独立、严格地盲审《${params.title}》（模式：${MODE_LABELS[params.mode]}）的当前稿件。`,
        `重点核查：`,
        `1. 与世界观硬规则、人物核心动机、大纲/节拍因果链是否完全一致，有无吃书、时间线穿帮或战力/信息差漏洞；`,
        params.mode === 'drama-script'
          ? `2. 严格检查红果 40× 商业红线：单集旁白/OS 占比是否 ≤ 20%，是否可拍可执行（无抽象心理描写）；`
          : `2. 伏笔投放与回收是否严密，章节末尾是否有真实推进力；`,
        `3. 若存在明显硬伤，请给出具体定位与可执行的修订要求；若已达标，判定通过。`,
        '',
        `请在回答最开头严格输出如下 JSON 块（必须可解析）：`,
        '```json',
        '{"verdict": "PASS" | "REVISE", "summary": "一句话总评", "issues": ["问题1", "问题2"]}',
        '```',
        params.referenceContext ? `\n【参考设定与上下文】\n${params.referenceContext}\n` : '',
        `【待审查稿件】\n${params.draftText}`
      ].join('\n')
    }

    return [
      `你现在担任【二审资深主笔审查员（文风声口与读者体感终审）】。本稿已通过一审硬逻辑检查，请你换用全新读者与编辑视角复审《${params.title}》。`,
      `重点核查：`,
      `1. 文风声口是否贴合本篇题材，有无滑向千书一面的“AI 翻译腔/工业神态套话/空主语说明文”；`,
      `2. 节奏呼吸感是否自然（段落长短错落、对白嘴感鲜活、爽点或情绪钩子是否到位）；`,
      `3. 是否有为了凑字数或解释设定而产生的冗余注水。`,
      '',
      `请在回答最开头严格输出如下 JSON 块（必须可解析）：`,
      '```json',
      '{"verdict": "PASS" | "REVISE", "summary": "一句话总评", "issues": ["问题1", "问题2"]}',
      '```',
      params.referenceContext ? `\n【参考声口与上下文】\n${params.referenceContext}\n` : '',
      `【待审查稿件】\n${params.draftText}`
    ].join('\n')
  }

  private buildIntentPrompt(mode: CreationMode, intent: CreationIntent, customText?: string): string {
    switch (intent) {
      case 'write-prose':
        return '基于已导入的大纲、设定或前文，直接进入章节正文创作/续写。动手前先简要核对本章目标、出场人物状态与本篇文风声口卡，再输出纯净小说正文（不夹杂工程编号或自检注释）。'
      case 'draft-outline':
        return '基于导入的想法、设定或粗略梗概，完善或构建可执行的 Story DNA、故事弧与分章细纲，保留人物行动的具象冲突与追读钩子，避免空泛工程黑话。'
      case 'expand-world':
        return '基于已有材料深化世界观因果链（约束→分配→激励→制度→日常 consequences），区分 hard 硬规则与 soft 创作留白，并输出日常语言与器物肌理切片。'
      case 'complete-from-outline':
        return '用户仅提供了单份大纲。请先以此大纲为唯一骨架，反推并补齐一套兼容的最小可用创作套件：\n1. 核心世界观硬规则与日常肌理（避免过度锁死）；\n2. 主要角色档案卡（欲望、底牌、关系张力与原声台词）；\n3. 本篇专属「文风与声口卡」（含 200 字定调试写切片）；\n确认无误后即可开写第一章正文。'
      case 'reverse-outline':
        return '用户提供了已有正文/草稿但缺少完整大纲与台账。请逆向拆解已导入的正文，反推出：\n1. Story DNA 与核心卖点提炼；\n2. 已写章节的分章结构纲与后续推进大纲；\n3. 人物当前状态台账、已埋伏笔清单（标注出自哪一章）及文风声口切片，方便后续无缝续写。'
      case 'adapt-to-script':
        return '将导入的小说大纲或正文改编为 AI 短剧/漫剧剧本：先过「节奏与逻辑 5 问预匹配」（前3秒钩子、黄金前3集、红果 40× 旁白 ≤20% 红线），再输出固定资产表（@CHAR/@LOC/@VOICE）与分集视听剧本。'
      case 'audit-and-polish':
        return '对导入稿件执行全面体检（逻辑一致性、设定吃书检查、节奏拖沓点、去 AI 味与母语语感润色），先给分优先级修复清单，再给出逐段修订稿。'
      case 'custom':
      default:
        return customText?.trim() || `请结合所选模式（${MODE_LABELS[mode]}）分析已导入材料，并给出下一步创作方案与执行产物。`
    }
  }

  private buildSystemPrompt(mode: CreationMode, skillIds: SkillId[]): string {
    const snippets: string[] = [
      '你是「墨枢 InkNexus Studio」内协同创作的专业中文小说与剧本架构/写作 Agent。',
      `当前创作模式：${MODE_LABELS[mode]}。`,
      '工作纪律：',
      '1. 严格区分「作者真相」与「角色当前认知」，绝不吃书或违反已锁定正典；',
      '2. 输出正文时仅保留章标题与纯净正文，不得夹杂内部工作台编号、字数统计或元注释；',
      '3. 默认使用简体中文（除非用户明确要求其他语种或保持原稿语种）。',
      ''
    ]

    for (const id of skillIds) {
      const def = this.skillLoader.loadSkill(id)
      if (def) {
        snippets.push(`=== 挂载技能规范：${id} ===`)
        snippets.push(def.skillSummary.slice(0, 2600))
        snippets.push('')
      }
    }

    return snippets.join('\n')
  }
}
