import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  FolderOpen,
  FolderUp,
  Paperclip,
  Sparkles,
  UploadCloud,
  Zap
} from 'lucide-react'
import type { CreationMode, ImportedFileItem, PreComposedPrompt, SubTemplateId } from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'
import heroMascot from '../assets/brand/hero-mascot.png'
import { ImportWizardModal } from '../components/ui/ImportWizardModal'

interface HomeHubProps {
  onLaunchProject: (params: {
    projectRoot: string
    entryRelPath?: string
    prePrompt?: PreComposedPrompt
  }) => Promise<void>
}

const MODE_CARDS: Array<{
  mode: CreationMode
  title: string
  subtitle: string
  tags: string[]
  icon: React.FC<{ className?: string }>
  subTemplates: Array<{ id: SubTemplateId; label: string }>
}> = [
  {
    mode: 'long-novel',
    title: '长文小说',
    subtitle: '世界观 · 六层大纲 · 长篇连载',
    tags: ['小说三件套', '正典锁版'],
    icon: BookOpen,
    subTemplates: [
      { id: 'long-standard', label: '标准长篇（L0–L4 + 核心台账）' },
      { id: 'long-deep', label: '深度推演（多 POV / 复杂制度）' }
    ]
  },
  {
    mode: 'short-webnovel',
    title: '短篇网文',
    subtitle: '高概念脑洞 · 爽感节拍 · 手机竖屏',
    tags: ['1-5万字', '网感体检'],
    icon: Zap,
    subTemplates: [
      { id: 'short-flash', label: '超短篇（1-3万字，盐选/番茄短故事）' },
      { id: 'short-microdrama', label: '微短剧式短中篇（2-5万字，强卡点）' }
    ]
  },
  {
    mode: 'drama-script',
    title: 'AI 剧本',
    subtitle: 'AI 短剧 · 漫剧 · 沙雕剧 · 资产表',
    tags: ['分集卡点', '红果40×'],
    icon: Clapperboard,
    subTemplates: [
      { id: 'drama-ai-real', label: '常规仿真人 AI 短剧（MiniMax-H3）' },
      { id: 'drama-comic', label: '高奇观 AI 漫剧（comic-drama）' },
      { id: 'drama-shadiao', label: '高频反转沙雕短剧（shadiao）' }
    ]
  }
]

export const HomeHub: React.FC<HomeHubProps> = ({ onLaunchProject }) => {
  const { projects, setPage } = useStudioStore()
  const [ideaText, setIdeaText] = useState('')
  const [workflowPref, setWorkflowPref] = useState<'auto' | CreationMode>('auto')
  const [showModePicker, setShowModePicker] = useState(false)
  const [selectedMode, setSelectedMode] = useState<CreationMode>('long-novel')
  const [subTemplate, setSubTemplate] = useState<SubTemplateId>('long-standard')
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const [isDragging, setIsDragging] = useState(false)
  const [importModalFiles, setImportModalFiles] = useState<ImportedFileItem[] | null>(null)
  const [parsingImport, setParsingImport] = useState(false)

  const handleStartCreationClick = () => {
    if (workflowPref !== 'auto') {
      setSelectedMode(workflowPref)
      const card = MODE_CARDS.find((c) => c.mode === workflowPref)
      if (card) setSubTemplate(card.subTemplates[0].id)
    }
    setShowModePicker((v) => !v)
  }

  const handleConfirmCreate = async () => {
    setCreating(true)
    try {
      const title = newTitle.trim() || ideaText.trim().slice(0, 14).replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '') || '新灵感作品'
      const created = (await window.inknexus.projects.create({
        title,
        mode: selectedMode,
        subTemplate
      })) as { summary: { rootPath: string }; entryRelPath: string }
      const prePrompt = (await window.inknexus.prompt.composeScratch({
        mode: selectedMode,
        subTemplate,
        title,
        userIdea: ideaText
      })) as PreComposedPrompt
      await onLaunchProject({
        projectRoot: created.summary.rootPath,
        entryRelPath: created.entryRelPath,
        prePrompt
      })
    } finally {
      setCreating(false)
    }
  }

  const processImportedPaths = async (paths: string[]) => {
    if (paths.length === 0) return
    setParsingImport(true)
    try {
      const parsed = await window.inknexus.importer.parsePaths(paths)
      if (parsed.length > 0) setImportModalFiles(parsed)
    } finally {
      setParsingImport(false)
    }
  }

  const handlePickFiles = async () => {
    const paths = await window.inknexus.importer.pickFiles()
    await processImportedPaths(paths)
  }

  const handlePickFolder = async () => {
    const dir = await window.inknexus.importer.pickFolder()
    if (dir) await processImportedPaths([dir])
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    const paths = dropped
      .map((f) => window.inknexus.importer.getPathForFile(f))
      .filter((p): p is string => Boolean(p))
    await processImportedPaths(paths)
  }

  const recentProjects = projects.slice(0, 3)

  return (
    <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Hero Banner */}
        <section className="relative flex flex-col items-center pt-1 text-center md:flex-row md:items-center md:justify-center md:gap-7 md:text-left">
          <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(248,245,255,0.92)_0%,rgba(234,227,252,0.45)_58%,transparent_76%)] p-1">
            <img
              src={heroMascot}
              alt="墨枢灵感星核形象"
              className="h-full w-full object-contain drop-shadow-md"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-text-primary md:text-4xl">
              每一个故事，都始于
              <span className="bg-gradient-to-r from-[#7453DC] to-[#4A74F5] bg-clip-text text-transparent">
                灵感。
              </span>
            </h1>
            <p className="mt-2 text-sm text-text-secondary md:text-base">
              今天，想创作一个怎样的世界？选择模式即刻起笔，或拖入已有大纲/正文开启人机共创。
            </p>
          </div>
        </section>

        {/* Central Natural Language Composer + Start Creation */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="glass-panel p-5"
        >
          <textarea
            rows={4}
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            placeholder="在这里描述你的故事灵感、创作需求或想完成的任务…&#10;例如：我想写一部设定在江南的古风权谋小说，主角是出身寒门的女策士，风格偏群像与成长…"
            className="w-full resize-none bg-transparent text-sm leading-relaxed text-text-primary placeholder:text-text-muted outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handlePickFiles()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 text-xs font-medium text-text-primary transition hover:border-accent/50 hover:text-accent"
              >
                <Paperclip className="h-3.5 w-3.5" />
                添加参考资料
              </button>

              <select
                aria-label="工作流选择"
                value={workflowPref}
                onChange={(e) => setWorkflowPref(e.target.value as 'auto' | CreationMode)}
                className="h-9 rounded-xl border border-border bg-surface-raised px-3 text-xs font-medium text-text-primary outline-none hover:border-accent/50"
              >
                <option value="auto">自动选择工作流</option>
                <option value="long-novel">长文小说（小说三件套）</option>
                <option value="short-webnovel">短篇网文（1-5万字）</option>
                <option value="drama-script">AI 剧本（短剧/漫剧）</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-text-muted">{ideaText.length} / 4000</span>
              <button
                type="button"
                onClick={handleStartCreationClick}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-5 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01] hover:opacity-95"
              >
                <Sparkles className="h-4 w-4" />
                <span>开始创作</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Expanded 3-Mode Creation Cards */}
          <AnimatePresence>
            {showModePicker && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className="overflow-hidden"
              >
                <div className="mt-4 border-t border-border pt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {MODE_CARDS.map((card) => {
                      const Icon = card.icon
                      const active = selectedMode === card.mode
                      return (
                        <button
                          key={card.mode}
                          type="button"
                          onClick={() => {
                            setSelectedMode(card.mode)
                            setSubTemplate(card.subTemplates[0].id)
                          }}
                          className={`group rounded-2xl border p-4 text-left transition-all ${
                            active
                              ? 'border-accent bg-accent-soft/55 shadow-md'
                              : 'border-border bg-surface-raised hover:-translate-y-0.5 hover:border-accent/45'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                                active ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="flex gap-1">
                              {card.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 text-sm font-semibold text-text-primary">{card.title}</div>
                          <div className="mt-1 text-xs text-text-secondary">{card.subtitle}</div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-3.5">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">作品名称</label>
                      <input
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="输入书名或剧名（留空将自动从灵感命名）"
                        className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent"
                      />
                    </div>
                    <div className="min-w-[240px] flex-1">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">子模板</label>
                      <select
                        value={subTemplate}
                        onChange={(e) => setSubTemplate(e.target.value as SubTemplateId)}
                        className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent"
                      >
                        {MODE_CARDS.find((c) => c.mode === selectedMode)?.subTemplates.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={creating}
                      onClick={() => void handleConfirmCreate()}
                      className="h-9 rounded-xl bg-accent px-5 text-xs font-semibold text-on-accent shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
                    >
                      {creating ? '初始化中...' : '初始化目录并进入工作台 →'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Lower Drop Zone: Import Files / Folders */}
        <section
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => void handleDrop(e)}
          className={`glass-panel transition-all duration-150 ${
            isDragging ? 'border-2 border-dashed border-accent bg-accent-soft/35' : 'border border-dashed border-border'
          } px-6 py-5`}
        >
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  {parsingImport ? '正在解析导入文件...' : '导入已有作品或素材（支持多选与整目录拖入）'}
                </h2>
                <p className="mt-0.5 text-xs text-text-secondary">
                  支持 DOCX、TXT、Markdown 文件及完整作品目录；上传后可标注为世界观、大纲、正文或自定义标签，并预埋对应 Prompt
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handlePickFiles()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 text-xs font-medium text-text-primary shadow-sm transition hover:border-accent/50 hover:text-accent"
              >
                <FolderUp className="h-3.5 w-3.5 text-accent" />
                选择多个文件
              </button>
              <button
                type="button"
                onClick={() => void handlePickFolder()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3.5 text-xs font-medium text-text-primary shadow-sm transition hover:border-accent/50 hover:text-accent"
              >
                <FolderOpen className="h-3.5 w-3.5 text-accent" />
                选择文件夹
              </button>
            </div>
          </div>
        </section>

        {/* Recent Projects */}
        <section className="space-y-3 pb-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <BookOpen className="h-4 w-4 text-accent" />
              最近打开
            </h2>
            <button
              type="button"
              onClick={() => setPage('projects')}
              className="text-xs font-medium text-accent hover:underline"
            >
              查看全部作品 ({projects.length}) &gt;
            </button>
          </div>

          {recentProjects.length === 0 ? (
            <div className="glass-card p-6 text-center text-xs text-text-muted">
              当前工作区暂无作品，点击上方「开始创作」或拖入任意 DOCX / TXT / Markdown 即可开始。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {recentProjects.map((p, idx) => {
                const gradients = [
                  'from-[#B89EFF] via-[#96B8FF] to-[#B7EBF0]',
                  'from-[#8DA8F8] via-[#B496FA] to-[#E8D5FF]',
                  'from-[#7EDCC6] via-[#88B8F8] to-[#BBA4FB]'
                ]
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void onLaunchProject({ projectRoot: p.rootPath, entryRelPath: p.lastOpenedFile })}
                    className="glass-card group flex items-center gap-3.5 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-accent/50"
                  >
                    <div
                      className={`flex h-20 w-16 shrink-0 items-end rounded-xl bg-gradient-to-br ${
                        gradients[idx % gradients.length]
                      } p-2 shadow-sm`}
                    >
                      <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-[#202239]">
                        {p.mode === 'short-webnovel' ? '短篇' : p.mode === 'drama-script' ? '剧本' : '长篇'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-text-primary group-hover:text-accent">
                        {p.title}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 text-[11px] text-text-secondary">
                        共 {p.chapterCount} 篇 · {(p.wordCount / 10000).toFixed(1)} 万字
                      </div>
                      <div className="mt-0.5 text-[10px] text-text-muted">
                        更新：{new Date(p.lastModified).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {importModalFiles && (
        <ImportWizardModal
          initialFiles={importModalFiles}
          onClose={() => setImportModalFiles(null)}
          onConfirmLaunch={async ({ title, mode, files, prePrompt }) => {
            const res = (await window.inknexus.importer.materialize({
              title,
              mode,
              files
            })) as { summary: { rootPath: string }; primaryRelPath: string }
            setImportModalFiles(null)
            await onLaunchProject({
              projectRoot: res.summary.rootPath,
              entryRelPath: res.primaryRelPath,
              prePrompt
            })
          }}
        />
      )}
    </div>
  )
}
