import crypto from 'crypto'
import type {
  AgentSelection,
  DiffProposal,
  LintReport,
  SwarmJob,
  SwarmJobConfig,
  SwarmStage
} from '@shared/types'
import { PromptComposer } from '../orchestrator/prompt-composer'
import { ContextAssembler } from '../orchestrator/context-assembler'
import { AppDataStore } from '../storage/appdata-store'

export interface ReviewVerdictParsed {
  verdict: 'PASS' | 'REVISE'
  summary: string
  issues: string[]
}

export function parseReviewOutput(raw: string): ReviewVerdictParsed {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/(\{[\s\S]*?"verdict"[\s\S]*?\})/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]) as Partial<ReviewVerdictParsed>
      if (parsed.verdict === 'PASS' || parsed.verdict === 'REVISE') {
        return {
          verdict: parsed.verdict,
          summary: parsed.summary || (parsed.verdict === 'PASS' ? '审查通过' : '需要修订'),
          issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : []
        }
      }
    } catch {
      // fall through
    }
  }
  const looksReject = /REVISE|不通过|打回|存在问题|硬伤/.test(raw)
  return {
    verdict: looksReject ? 'REVISE' : 'PASS',
    summary: raw.trim().slice(0, 140) || '完成审阅',
    issues: looksReject ? [raw.trim().slice(0, 400)] : []
  }
}

export interface SwarmExecutionHooks {
  runAgent: (params: {
    jobId: string
    selection: AgentSelection
    systemPrompt: string
    userPrompt: string
    projectRoot: string
    signal: AbortSignal
  }) => Promise<string>
  runLint: (projectRoot: string, targetRelPath: string, mode: SwarmJobConfig['mode']) => Promise<LintReport>
  readOriginalFile: (projectRoot: string, targetRelPath: string) => string
  onUpdate: (jobs: SwarmJob[]) => void
}

export class SwarmCoordinator {
  private jobs: SwarmJob[] = []
  private activeControllers = new Map<string, AbortController>()
  private maxConcurrency = 3
  private runningIds = new Set<string>()

  constructor(
    private readonly store: AppDataStore,
    private readonly composer: PromptComposer,
    private readonly contextAssembler: ContextAssembler,
    private readonly hooks: SwarmExecutionHooks
  ) {
    this.jobs = this.store.getSwarmJobs().map((j) => {
      if (['writing', 'linting', 'self_review', 'review_round_1', 'revising_1', 'review_round_2', 'revising_2'].includes(j.stage)) {
        return { ...j, stage: 'paused', progressLabel: '上次退出时暂停，可点击继续或重试' }
      }
      return j
    })
    this.maxConcurrency = this.store.getConfig().maxSwarmConcurrency || 3
  }

  listJobs(): SwarmJob[] {
    return this.jobs
  }

  setMaxConcurrency(n: number): void {
    this.maxConcurrency = Math.max(1, Math.min(6, n))
    this.store.saveConfig({ maxSwarmConcurrency: this.maxConcurrency })
    this.pumpQueue()
  }

  enqueueJob(config: SwarmJobConfig): SwarmJob {
    const job: SwarmJob = {
      id: `swarm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      config: { ...config, maxRevisions: config.maxRevisions ?? 2 },
      stage: 'queued',
      revisionRound: 0,
      progressLabel: '排队等待独立 Worker 调度',
      reviewReports: [],
      logs: [{ timestamp: Date.now(), stage: 'queued', message: `任务已入队（审查机制：${config.reviewMode}）` }],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    this.jobs.unshift(job)
    this.persistAndEmit()
    this.pumpQueue()
    return job
  }

  enqueueBatch(configs: SwarmJobConfig[]): SwarmJob[] {
    const created = configs.map((c) => {
      const job: SwarmJob = {
        id: `swarm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        config: { ...c, maxRevisions: c.maxRevisions ?? 2 },
        stage: 'queued',
        revisionRound: 0,
        progressLabel: '排队等待并发分配',
        reviewReports: [],
        logs: [{ timestamp: Date.now(), stage: 'queued', message: `批量任务入队（审查机制：${c.reviewMode}）` }],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      this.jobs.unshift(job)
      return job
    })
    this.persistAndEmit()
    this.pumpQueue()
    return created
  }

  pauseJob(jobId: string): void {
    const job = this.jobs.find((j) => j.id === jobId)
    if (!job) return
    this.activeControllers.get(jobId)?.abort()
    this.activeControllers.delete(jobId)
    this.runningIds.delete(jobId)
    this.transition(job, 'paused', '已暂停任务')
  }

  resumeJob(jobId: string): void {
    const job = this.jobs.find((j) => j.id === jobId)
    if (!job) return
    if (job.stage === 'paused' || job.stage === 'failed' || job.stage === 'cancelled') {
      this.transition(job, 'queued', '重新入队等待执行')
      this.pumpQueue()
    }
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.find((j) => j.id === jobId)
    if (!job) return
    this.activeControllers.get(jobId)?.abort()
    this.activeControllers.delete(jobId)
    this.runningIds.delete(jobId)
    this.transition(job, 'cancelled', '已取消')
  }

  deleteJob(jobId: string): void {
    this.cancelJob(jobId)
    this.jobs = this.jobs.filter((j) => j.id !== jobId)
    this.persistAndEmit()
  }

  private transition(job: SwarmJob, stage: SwarmStage, message: string): void {
    job.stage = stage
    job.progressLabel = message
    job.updatedAt = Date.now()
    job.logs.push({ timestamp: Date.now(), stage, message })
    this.persistAndEmit()
  }

  private persistAndEmit(): void {
    this.store.saveSwarmJobs(this.jobs)
    this.hooks.onUpdate([...this.jobs])
  }

  private pumpQueue(): void {
    while (this.runningIds.size < this.maxConcurrency) {
      const next = this.jobs.find((j) => j.stage === 'queued')
      if (!next) break
      this.runningIds.add(next.id)
      void this.executeJob(next)
    }
  }

  private async executeJob(job: SwarmJob): Promise<void> {
    const controller = new AbortController()
    this.activeControllers.set(job.id, controller)

    try {
      const { config } = job
      const slices = this.contextAssembler.assemble(config.projectRoot, config.targetRelPath, config.mode)
      const refContext = this.contextAssembler.readEnabledSlices(slices)
      const basePrompt = this.composer.composeFromScratch({
        mode: config.mode,
        title: config.title,
        userIdea: config.prompt
      })

      const writerSystem = `${basePrompt.systemPrompt}\n\n【当前作品上下文切片】\n${refContext}`

      // 1. Writer stage
      this.transition(job, 'writing', `写作 Worker (${config.writer.backendId}/${config.writer.model}) 正在创作...`)
      let draft = await this.hooks.runAgent({
        jobId: job.id,
        selection: config.writer,
        systemPrompt: writerSystem,
        userPrompt: `${config.prompt}\n\n请直接输出完整正文内容。`,
        projectRoot: config.projectRoot,
        signal: controller.signal
      })
      job.draftOutput = draft

      // 2. Python Lint check (read-only metrics/hints)
      this.transition(job, 'linting', '运行内置 Python 体检镜子...')
      const lint = await this.hooks.runLint(config.projectRoot, config.targetRelPath, config.mode)
      job.logs.push({
        timestamp: Date.now(),
        stage: 'linting',
        message: `体检结果：${lint.status}（问题 ${lint.issues.length} 项）`
      })

      const maxRev = config.maxRevisions ?? 2

      // 3. Review pipeline
      if (config.reviewMode === 'self') {
        this.transition(job, 'self_review', '写作 Agent 正在自审自修...')
        const selfRes = await this.hooks.runAgent({
          jobId: job.id,
          selection: config.writer,
          systemPrompt: writerSystem,
          userPrompt: `请对你刚才撰写的《${config.title}》稿件执行一轮严格自审（结合体检结果：${lint.issues
            .map((i) => i.message)
            .join('；') || '无报错'}），如有逻辑漏洞、AI 套话或节奏拖沓请直接输出修正后的完整终稿；如已完美则原样输出终稿。\n\n【初稿】\n${draft}`,
          projectRoot: config.projectRoot,
          signal: controller.signal
        })
        if (selfRes.trim()) draft = selfRes
        job.draftOutput = draft
        job.reviewReports.push({
          round: 1,
          reviewer: `${config.writer.backendId}（自审）`,
          verdict: 'PASS',
          summary: '已完成写作自审与 Python 体检校核',
          issues: lint.issues.map((i) => i.message),
          timestamp: Date.now()
        })
      } else {
        // Reviewer 1 (Single & Advanced)
        const reviewer1 = config.reviewer1 ?? config.writer
        let round1Passed = false
        for (let attempt = 0; attempt <= maxRev; attempt++) {
          this.transition(
            job,
            'review_round_1',
            `一审审查员 (${reviewer1.backendId}/${reviewer1.model}) 正在盲审第 ${attempt + 1} 轮...`
          )
          const r1Raw = await this.hooks.runAgent({
            jobId: job.id,
            selection: reviewer1,
            systemPrompt: '你是严谨的文学与短剧一审编辑，只依据设定与稿件事实客观判定。',
            userPrompt: this.composer.composeReviewPrompt({
              round: 1,
              mode: config.mode,
              title: config.title,
              draftText: draft,
              referenceContext: refContext
            }),
            projectRoot: config.projectRoot,
            signal: controller.signal
          })
          const parsed1 = parseReviewOutput(r1Raw)
          job.reviewReports.push({
            round: 1,
            reviewer: `${reviewer1.backendId}/${reviewer1.model}`,
            verdict: parsed1.verdict,
            summary: parsed1.summary,
            issues: parsed1.issues,
            timestamp: Date.now()
          })
          if (parsed1.verdict === 'PASS' || attempt === maxRev) {
            round1Passed = parsed1.verdict === 'PASS'
            break
          }
          job.revisionRound++
          this.transition(job, 'revising_1', `一审打回修订（第 ${job.revisionRound} 次）...`)
          draft = await this.hooks.runAgent({
            jobId: job.id,
            selection: config.writer,
            systemPrompt: writerSystem,
            userPrompt: `一审审查员打回修订，原因：${parsed1.summary}\n具体问题：\n${parsed1.issues.join('\n')}\n\n请修复上述全部问题并输出完整修订稿：\n${draft}`,
            projectRoot: config.projectRoot,
            signal: controller.signal
          })
          job.draftOutput = draft
        }

        // Reviewer 2 (Advanced mode only: 1 Writer + 2 Sequential Reviewers)
        if (config.reviewMode === 'advanced') {
          const reviewer2 = config.reviewer2 ?? config.reviewer1 ?? config.writer
          for (let attempt = 0; attempt <= maxRev; attempt++) {
            this.transition(
              job,
              'review_round_2',
              `高级二审审查员 (${reviewer2.backendId}/${reviewer2.model}) 正在终审声口与节奏（第 ${attempt + 1} 轮）...`
            )
            const r2Raw = await this.hooks.runAgent({
              jobId: job.id,
              selection: reviewer2,
              systemPrompt: '你是资深二审主编，专注于声口自然度、去 AI 味、对白张力与阅读呼吸感。',
              userPrompt: this.composer.composeReviewPrompt({
                round: 2,
                mode: config.mode,
                title: config.title,
                draftText: draft,
                referenceContext: refContext
              }),
              projectRoot: config.projectRoot,
              signal: controller.signal
            })
            const parsed2 = parseReviewOutput(r2Raw)
            job.reviewReports.push({
              round: 2,
              reviewer: `${reviewer2.backendId}/${reviewer2.model}`,
              verdict: parsed2.verdict,
              summary: parsed2.summary,
              issues: parsed2.issues,
              timestamp: Date.now()
            })
            if (parsed2.verdict === 'PASS' || attempt === maxRev) {
              break
            }
            job.revisionRound++
            this.transition(job, 'revising_2', `二审打回精修（第 ${job.revisionRound} 次）...`)
            draft = await this.hooks.runAgent({
              jobId: job.id,
              selection: config.writer,
              systemPrompt: writerSystem,
              userPrompt: `二审主编要求打回精修（一审已${round1Passed ? '通过' : '完成'}），意见：${parsed2.summary}\n具体建议：\n${parsed2.issues.join('\n')}\n\n请仅做文风与节奏精修并保持已通过的一审硬逻辑，输出完整稿件：\n${draft}`,
              projectRoot: config.projectRoot,
              signal: controller.signal
            })
            job.draftOutput = draft
          }
        }
      }

      const originalText = this.hooks.readOriginalFile(config.projectRoot, config.targetRelPath)
      const proposal: DiffProposal = {
        id: `swarm_diff_${job.id}`,
        filePath: config.targetRelPath,
        originalText,
        proposedText: draft,
        summary: `Swarm 队列成稿（${config.reviewMode} · 共 ${job.reviewReports.length} 份审查记录）`,
        status: 'pending',
        createdAt: Date.now()
      }
      job.proposal = proposal
      this.store.appendReviewRecord(config.projectRoot, { jobId: job.id, reports: job.reviewReports })
      this.transition(job, 'awaiting_user', '已通过审查流水线，待作者在工作台验收 Diff')
    } catch (err) {
      if ((job.stage as string) !== 'paused' && (job.stage as string) !== 'cancelled') {
        job.error = err instanceof Error ? err.message : String(err)
        this.transition(job, 'failed', `执行异常：${job.error}`)
      }
    } finally {
      this.activeControllers.delete(job.id)
      this.runningIds.delete(job.id)
      this.pumpQueue()
    }
  }
}
