import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import type {
  AgentBackendInfo,
  ApiProviderConfig,
  AppDataStorageReport,
  AppUpdateInfo,
  CloseBehavior,
  ProjectSummary,
  SkillId,
  SkillRegistryItem,
  ThemeMode
} from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Github,
  HardDrive,
  KeyRound,
  Palette,
  RefreshCw,
  Scale,
  Sparkles,
  Trash2,
  Upload,
  X
} from 'lucide-react'

export type SettingsTab = 'appearance' | 'agents' | 'apis' | 'skills' | 'storage' | 'updater' | 'licenses'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function renderInlineClean(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <span
          key={idx}
          className="mx-0.5 rounded bg-accent-soft/60 px-1.5 py-0.5 font-mono text-[11px] text-accent"
        >
          {part.slice(1, -1)}
        </span>
      )
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>
  })
}

const CleanLicenseDocument: React.FC<{ raw: string }> = ({ raw }) => {
  const lines = raw.split(/\r?\n/)
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      i += 1
      const blockLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        blockLines.push(lines[i])
        i += 1
      }
      i += 1
      elements.push(
        <div
          key={`code-${i}`}
          className="rounded-xl border border-border bg-surface p-4 text-xs leading-relaxed text-text-secondary whitespace-pre-wrap"
        >
          {blockLines.join('\n')}
        </div>
      )
      continue
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim())
        i += 1
      }
      const parsedRows = tableLines
        .filter((row) => !/^\|[\s\-:|]+\|$/.test(row))
        .map((row) =>
          row
            .split('|')
            .slice(1, -1)
            .map((cell) => cell.trim())
        )
      if (parsedRows.length > 0) {
        const [header, ...body] = parsedRows
        elements.push(
          <div key={`tbl-${i}`} className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-raised/80 text-text-primary">
                <tr>
                  {header.map((h, colIdx) => (
                    <th key={colIdx} className="px-3.5 py-2.5 font-semibold">
                      {renderInlineClean(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {body.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-surface-raised/40">
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="px-3.5 py-2 text-text-secondary">
                        {renderInlineClean(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${i}`} className="text-base font-bold text-text-primary">
          {renderInlineClean(trimmed.slice(2))}
        </h2>
      )
      i += 1
      continue
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} className="border-b border-border/70 pb-1.5 pt-2 text-sm font-semibold text-accent">
          {renderInlineClean(trimmed.slice(3))}
        </h3>
      )
      i += 1
      continue
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} className="pt-1 text-xs font-semibold text-text-primary">
          {renderInlineClean(trimmed.slice(4))}
        </h4>
      )
      i += 1
      continue
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const bullets: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        bullets.push(lines[i].trim().slice(2))
        i += 1
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1.5 pl-4 text-xs text-text-secondary">
          {bullets.map((b, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span className="leading-relaxed">{renderInlineClean(b)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (trimmed === '---' || trimmed === '***') {
      i += 1
      continue
    }

    elements.push(
      <p key={`p-${i}`} className="text-xs leading-relaxed text-text-secondary">
        {renderInlineClean(trimmed)}
      </p>
    )
    i += 1
  }

  return <div className="space-y-3">{elements}</div>
}

export const SettingsPage: React.FC<{ initialTab?: SettingsTab }> = ({ initialTab = 'appearance' }) => {
  const {
    config,
    setConfig,
    localAgents,
    setLocalAgents,
    apiConfigs,
    setApiConfigs,
    projects,
    setProjects,
    activeProject,
    setActiveProject,
    skillRegistry,
    setSkillRegistry,
    appInfo
  } = useStudioStore()

  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [testingAgent, setTestingAgent] = useState<string | null>(null)
  const [editingApi, setEditingApi] = useState<ApiProviderConfig | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [endpointInput, setEndpointInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [modelsInput, setModelsInput] = useState('')
  const [testingApiId, setTestingApiId] = useState<string | null>(null)

  const [storageReport, setStorageReport] = useState<AppDataStorageReport | null>(null)
  const [deleteTargetProject, setDeleteTargetProject] = useState<ProjectSummary | null>(null)
  const [deletingProject, setDeletingProject] = useState(false)

  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateProgress, setUpdateProgress] = useState<{ percent: number; label: string } | null>(null)
  const [licenseText, setLicenseText] = useState('')
  const [skillBusyId, setSkillBusyId] = useState<SkillId | null>(null)
  const [bridgePaths, setBridgePaths] = useState<{ readmePath: string; configPath: string; installDir: string } | null>(null)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  const loadStorage = async () => {
    const [rep, scanned] = await Promise.all([window.inknexus.storage.report(), window.inknexus.projects.scan()])
    setStorageReport(rep)
    setProjects(scanned)
  }

  useEffect(() => {
    if (tab === 'storage') {
      void loadStorage()
    } else if (tab === 'licenses' && !licenseText) {
      void window.inknexus.storage.getLicenses().then(setLicenseText)
    } else if (tab === 'skills' && skillRegistry.length === 0) {
      void window.inknexus.skills.registry().then(setSkillRegistry)
    } else if (tab === 'agents' && !bridgePaths) {
      void window.inknexus.agents.getBridgePaths().then(setBridgePaths)
    }
  }, [tab, licenseText, skillRegistry.length, setSkillRegistry, bridgePaths])

  useEffect(() => {
    const unsub = window.inknexus.updater.onProgress((ev) => setUpdateProgress(ev))
    return unsub
  }, [])

  const handleSaveConfig = async (patch: Partial<NonNullable<typeof config>>) => {
    const updated = await window.inknexus.config.save(patch)
    setConfig(updated)
    toast.success('设置已保存')
  }

  const handleRediscoverAgents = async () => {
    const list = await window.inknexus.agents.discover()
    setLocalAgents(list)
    toast.success(`已完成本地 Agent 探测（${list.filter((a) => a.status === 'available').length} 项就绪）`)
  }

  const handleTestLocal = async (agent: AgentBackendInfo) => {
    setTestingAgent(agent.id)
    const res = await window.inknexus.agents.testLocal(agent)
    setTestingAgent(null)
    if (res.ok) toast.success(`${agent.name}：${res.message}`)
    else toast.error(`${agent.name}：${res.message}`)
  }

  const openEditApi = (item: ApiProviderConfig) => {
    setEditingApi(item)
    setApiKeyInput('')
    setEndpointInput(item.endpointId ?? '')
    setBaseUrlInput(item.baseUrl)
    setModelsInput(item.models.join(', '))
  }

  const handleSaveApi = async () => {
    if (!editingApi) return
    const models = modelsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const updated = await window.inknexus.agents.saveApi(editingApi.presetId, {
      ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      endpointId: endpointInput.trim() || undefined,
      baseUrl: baseUrlInput.trim(),
      models,
      enabled: Boolean(apiKeyInput.trim() || editingApi.hasApiKey)
    })
    setApiConfigs(updated)
    setEditingApi(null)
    toast.success(`已保存 ${editingApi.name}`)
  }

  const handleTestApi = async (presetId: string) => {
    setTestingApiId(presetId)
    const res = await window.inknexus.agents.testApi(presetId)
    setTestingApiId(null)
    if (res.ok) toast.success(res.message)
    else toast.error(res.message)
  }

  const handleExportApiJson = async () => {
    const raw = await window.inknexus.agents.exportApiTemplate()
    await navigator.clipboard.writeText(raw)
    toast.success('脱敏 API 模板已复制到剪贴板')
  }

  const handleImportApiJson = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        toast.error('剪贴板为空，请先复制 JSON 模板')
        return
      }
      const next = await window.inknexus.agents.importApiTemplate(text)
      setApiConfigs(next)
      toast.success('已从剪贴板导入 API 配置模板')
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleCheckSkill = async (skillId: SkillId) => {
    setSkillBusyId(skillId)
    const updatedItem = await window.inknexus.skills.checkUpdate(skillId)
    setSkillRegistry(skillRegistry.map((item) => (item.id === skillId ? updatedItem : item)))
    setSkillBusyId(null)
    toast.info(
      updatedItem.hasUpdate
        ? `${updatedItem.name}：发现远端新版 ${updatedItem.remoteVersion || ''}`
        : `${updatedItem.name}：当前已是最新版本`
    )
  }

  const handlePullSkill = async (skillId: SkillId) => {
    setSkillBusyId(skillId)
    const updatedItem = await window.inknexus.skills.pullUpdate(skillId)
    setSkillRegistry(skillRegistry.map((item) => (item.id === skillId ? updatedItem : item)))
    setSkillBusyId(null)
    toast.success(`${updatedItem.name}：已同步最新规范（${updatedItem.localVersion}）`)
  }

  const handleClearTempCachesOnly = async () => {
    const rep = await window.inknexus.storage.clearTempCaches()
    setStorageReport(rep)
    toast.success('已清理临时缓存，正文、聊天记录与批注完整保留')
  }

  const handleConfirmDeleteProject = async () => {
    if (!deleteTargetProject) return
    setDeletingProject(true)
    try {
      const updatedProjects = await window.inknexus.projects.deleteFolder(deleteTargetProject.rootPath)
      setProjects(updatedProjects)
      if (activeProject?.rootPath.toLowerCase() === deleteTargetProject.rootPath.toLowerCase()) {
        setActiveProject(null)
      }
      const rep = await window.inknexus.storage.report()
      setStorageReport(rep)
      toast.success(`已永久删除《${deleteTargetProject.title}》`)
      setDeleteTargetProject(null)
    } catch (err) {
      toast.error(`删除失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeletingProject(false)
    }
  }

  const handleCheckAppUpdate = async () => {
    setCheckingUpdate(true)
    const info = await window.inknexus.updater.check()
    setUpdateInfo(info)
    setCheckingUpdate(false)
  }

  const navTabs: { id: SettingsTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'appearance', label: '外观与通用', icon: Palette },
    { id: 'agents', label: '本地 Agent CLI', icon: Cpu },
    { id: 'apis', label: 'API 供应商', icon: KeyRound },
    { id: 'skills', label: '内置 Skill 规范库', icon: BookOpenCheck },
    { id: 'storage', label: '数据与作品管理', icon: HardDrive },
    { id: 'updater', label: '检查更新', icon: RefreshCw },
    { id: 'licenses', label: '开源许可声明', icon: Scale }
  ]

  return (
    <div className="relative z-10 flex h-full overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-border bg-surface/65 p-4">
        <h2 className="mb-3 px-2 text-sm font-bold text-text-primary">设置中心</h2>
        <div className="space-y-1">
          {navTabs.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  active ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {tab === 'appearance' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-text-primary">外观、工作区与关闭行为</h1>
              </div>

              <div className="glass-card space-y-4 p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-text-secondary">主题方案</label>
                    <select
                      value={config?.theme ?? 'aurora-light'}
                      onChange={(e) => void handleSaveConfig({ theme: e.target.value as ThemeMode })}
                      className="mt-1.5 h-9 w-full rounded-xl border border-border bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      <option value="aurora-light">极光浅紫（Aurora Light）</option>
                      <option value="aurora-dark">星夜深色（Aurora Dark）</option>
                      <option value="system">跟随系统主题</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary">关闭窗口行为</label>
                    <select
                      value={config?.closeBehavior ?? 'ask'}
                      onChange={(e) => void handleSaveConfig({ closeBehavior: e.target.value as CloseBehavior })}
                      className="mt-1.5 h-9 w-full rounded-xl border border-border bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      <option value="ask">每次关闭时询问</option>
                      <option value="minimize-to-tray">最小化到系统托盘后台运行</option>
                      <option value="exit">直接退出应用</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-text-secondary">小说作品总目录（workspaceRoot）</label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      type="text"
                      value={config?.workspaceRoot ?? ''}
                      onChange={(e) => {
                        if (config) setConfig({ ...config, workspaceRoot: e.target.value })
                      }}
                      className="h-9 flex-1 rounded-xl border border-border bg-surface px-3 font-mono text-xs text-text-primary outline-none focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSaveConfig({ workspaceRoot: config?.workspaceRoot ?? '' })}
                      className="h-9 rounded-xl bg-accent px-4 text-xs font-medium text-on-accent hover:bg-accent-hover"
                    >
                      应用目录
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-text-secondary">视觉动效模式</label>
                    <select
                      value={config?.effectsMode ?? 'full'}
                      onChange={(e) =>
                        void handleSaveConfig({ effectsMode: e.target.value as 'full' | 'reduced' })
                      }
                      className="mt-1.5 h-9 w-full rounded-xl border border-border bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      <option value="full">完整极光毛玻璃特效</option>
                      <option value="reduced">精简高性能模式</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-secondary">主编辑器纸张风格</label>
                    <select
                      value={config?.editorReadTheme ?? 'default'}
                      onChange={(e) =>
                        void handleSaveConfig({ editorReadTheme: e.target.value as 'default' | 'manuscript' })
                      }
                      className="mt-1.5 h-9 w-full rounded-xl border border-border bg-surface px-3 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      <option value="default">现代净白 / 星夜</option>
                      <option value="manuscript">米黄稿纸护眼</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'agents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-text-primary">本地 Agent CLI 探测</h1>
                <button
                  type="button"
                  onClick={() => void handleRediscoverAgents()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-on-accent hover:bg-accent-hover"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新探测本机 CLI
                </button>
              </div>

              {(() => {
                const readmePath = bridgePaths?.readmePath || 'AGENT_BRIDGE_README.md'
                const cfgPath = bridgePaths?.configPath || '%APPDATA%\\InkNexusStudio\\custom-agents.json'
                const repairPrompt = [
                  `请帮我将你（以及本机安装的 DSH / WorkBuddy / Qoder / 其他 CLI）正确接入到「墨枢 InkNexus Studio」并刷新出你最新的可用模型列表：`,
                  `1. 请先阅读安装目录下的对接说明书：${readmePath}`,
                  `2. 请实测你本机真实可执行文件路径、启动所需环境变量，并在你当前有效环境下运行命令获取你最新的可用模型 ID 列表；`,
                  `3. 请按照说明书里的 JSON 格式写入（或更新）桥接配置文件：${cfgPath}；`,
                  `4. 完成后告诉我，我会在软件里点击「重新探测本机 CLI」立即生效。`
                ].join('\n')
                return (
                  <div
                    data-testid="agent-repair-prompt-card"
                    className="glass-card space-y-2.5 border-accent/35 bg-accent-soft/25 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text-primary">
                        如果无法成功探测或模型未更新，请将以下提示词复制到对应的 Agent 里修复：
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (bridgePaths?.readmePath) {
                              void window.inknexus.projects.openFolder(bridgePaths.installDir)
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
                        >
                          <FileText className="h-3 w-3" />
                          查看说明目录
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(repairPrompt)
                            toast.success('已复制外部 Agent 对接与模型修复提示词')
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-on-accent hover:bg-accent-hover"
                        >
                          <Copy className="h-3 w-3" />
                          一键复制提示词
                        </button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-xl border border-border/70 bg-surface/85 p-3 font-mono text-[11px] leading-relaxed text-text-secondary select-all">
                      {repairPrompt}
                    </pre>
                  </div>
                )
              })()}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {localAgents.map((agent) => (
                  <div key={agent.id} className="glass-card flex flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-text-primary">{agent.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            agent.status === 'available'
                              ? 'bg-success-soft text-success'
                              : 'border border-border bg-surface text-text-muted'
                          }`}
                        >
                          {agent.status === 'available' ? '已就绪' : '未配置'}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-text-muted">{agent.executablePath || agent.id}</div>
                      {agent.version && <div className="mt-1 text-[11px] text-text-secondary">版本：{agent.version}</div>}
                    </div>
                    <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-xs">
                      <span className="text-text-muted">{agent.models.length} 个模型</span>
                      <button
                        type="button"
                        disabled={agent.status !== 'available' || testingAgent === agent.id}
                        onClick={() => void handleTestLocal(agent)}
                        className="rounded-lg border border-border px-2.5 py-1 text-text-secondary hover:border-accent hover:text-accent disabled:opacity-45"
                      >
                        {testingAgent === agent.id ? '检测中...' : '连通测试'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'apis' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-text-primary">API 供应商</h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExportApiJson()}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:border-accent"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出脱敏模板
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleImportApiJson()}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:border-accent"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    导入 JSON 模板
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {apiConfigs.map((item) => (
                  <div key={item.presetId} className="glass-card flex flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-text-primary">{item.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            item.enabled && item.hasApiKey
                              ? 'bg-success-soft text-success'
                              : 'border border-border bg-surface text-text-muted'
                          }`}
                        >
                          {item.enabled && item.hasApiKey ? '已启用' : '未配置密钥'}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[11px] text-text-muted">{item.baseUrl}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.models.slice(0, 4).map((m) => (
                          <span key={m} className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-secondary">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2.5 text-xs">
                      <button
                        type="button"
                        disabled={!item.hasApiKey || testingApiId === item.presetId}
                        onClick={() => void handleTestApi(item.presetId)}
                        className="rounded-lg border border-border px-2.5 py-1 text-text-secondary hover:border-accent disabled:opacity-45"
                      >
                        {testingApiId === item.presetId ? '测试中...' : '测试连通'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditApi(item)}
                        className="rounded-lg bg-accent px-3 py-1 font-medium text-on-accent hover:bg-accent-hover"
                      >
                        配置密钥
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {editingApi && (
                <div className="glass-card space-y-3 border-accent/40 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-primary">配置 {editingApi.name}</h3>
                    <button
                      type="button"
                      onClick={() => setEditingApi(null)}
                      className="rounded p-1 text-text-muted hover:text-text-primary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-text-secondary">API Key</label>
                      <input
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={editingApi.hasApiKey ? '已配置密钥（留空保持不变）' : 'sk-...'}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary">接入点 Base URL</label>
                      <input
                        type="text"
                        value={baseUrlInput}
                        onChange={(e) => setBaseUrlInput(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary">接入点 Endpoint ID（豆包/方舟可选）</label>
                      <input
                        type="text"
                        value={endpointInput}
                        onChange={(e) => setEndpointInput(e.target.value)}
                        placeholder="ep-..."
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-secondary">模型列表（逗号分隔）</label>
                      <input
                        type="text"
                        value={modelsInput}
                        onChange={(e) => setModelsInput(e.target.value)}
                        className="mt-1 h-9 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingApi(null)}
                      className="rounded-xl border border-border px-4 py-1.5 text-xs text-text-secondary"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveApi()}
                      className="rounded-xl bg-accent px-4 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
                    >
                      保存并启用
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'skills' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-text-primary">内置 Skill 规范库</h1>
              <div className="space-y-3">
                {skillRegistry.map((skill: SkillRegistryItem) => (
                  <div key={skill.id} className="glass-card flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">{skill.name}</span>
                        <span className="rounded bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
                          {skill.localVersion || 'MIT'}
                        </span>
                        {skill.hasUpdate && (
                          <span className="rounded bg-warning-soft px-2 py-0.5 text-[10px] text-warning">
                            有新版 {skill.remoteVersion}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary">{skill.summary}</p>
                      <button
                        type="button"
                        onClick={() => void window.inknexus.app.openExternal(skill.repoUrl)}
                        className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                      >
                        <Github className="h-3 w-3" />
                        <span>{skill.repoUrl}</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={skillBusyId === skill.id}
                        onClick={() => void handleCheckSkill(skill.id)}
                        className="rounded-xl border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent"
                      >
                        检查更新
                      </button>
                      <button
                        type="button"
                        disabled={skillBusyId === skill.id}
                        onClick={() => void handlePullSkill(skill.id)}
                        className="rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
                      >
                        同步规范
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'storage' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-text-primary">AppData 缓存与作品管理</h1>
                  <p className="mt-1 text-xs text-text-secondary">仅清理缓存，不影响正文</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void window.inknexus.storage.openAppData()}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:border-accent"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    打开 AppData
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearTempCachesOnly()}
                    className="inline-flex items-center gap-1 rounded-xl bg-accent px-3.5 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    清理临时缓存
                  </button>
                </div>
              </div>

              {storageReport && (
                <div className="glass-card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] text-text-muted">临时缓存占用（可安全清理）</div>
                    <div className="mt-1 text-lg font-bold text-accent">{formatBytes(storageReport.tempCacheBytes)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-text-muted">AppData 总占用（含对话/批注/审查/快照）</div>
                    <div className="mt-1 text-lg font-bold text-text-primary">
                      {formatBytes(storageReport.totalBytes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-text-muted">已关联作品数据目录</div>
                    <div className="mt-1 text-lg font-bold text-text-primary">{storageReport.projects.length} 个</div>
                  </div>
                </div>
              )}

              {/* 当前作品列表（支持人工确认删除整部作品目录） */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-primary">当前作品列表（{projects.length} 部）</h2>
                </div>

                {projects.length === 0 ? (
                  <div className="glass-card p-6 text-center text-xs text-text-muted">当前工作区暂无作品文件夹</div>
                ) : (
                  <div className="space-y-2">
                    {projects.map((p) => {
                      const catLabel =
                        p.category === 'unclassified'
                          ? '未分类'
                          : p.category === 'short-webnovel'
                            ? '短篇网文'
                            : p.category === 'drama-script'
                              ? 'AI 剧本'
                              : '长文小说'
                      return (
                        <div
                          key={p.id}
                          className="glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-text-primary">{p.title}</span>
                              <span className="rounded bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
                                {catLabel}
                              </span>
                              <span className="text-[11px] text-text-muted">
                                {p.chapterCount} 篇 · {p.wordCount.toLocaleString()} 字
                              </span>
                            </div>
                            <div className="mt-0.5 truncate font-mono text-[11px] text-text-muted">{p.rootPath}</div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void window.inknexus.projects.openFolder(p.rootPath)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary hover:border-accent"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              打开目录
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTargetProject(p)}
                              className="inline-flex items-center gap-1 rounded-lg border border-danger/45 bg-danger-soft/40 px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger hover:text-white"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              删除
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'updater' && (
            <div className="space-y-5">
              <h1 className="text-xl font-bold text-text-primary">检查软件更新</h1>
              <div className="glass-card space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-text-primary">
                      墨枢 InkNexus Studio v{appInfo.version}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <span>开源作者：</span>
                      <button
                        type="button"
                        onClick={() =>
                          void window.inknexus.app.openExternal(appInfo.authorUrl || 'https://github.com/LilHaopeng')
                        }
                        className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                      >
                        <Github className="h-3.5 w-3.5" />
                        <span>{appInfo.author}</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      <span className="text-text-muted">·</span>
                      <button
                        type="button"
                        onClick={() => void window.inknexus.app.openExternal(appInfo.repoUrl)}
                        className="inline-flex items-center gap-1 text-text-secondary hover:text-accent hover:underline"
                      >
                        <span>项目开源仓库</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="pt-1 text-xs font-medium text-text-primary">
                      小红书 / 抖音 / B站：昊鹏同学
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={checkingUpdate}
                    onClick={() => void handleCheckAppUpdate()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                    {checkingUpdate ? '检查中...' : '检查 GitHub 更新'}
                  </button>
                </div>

                {(() => {
                  const shownUpdate = updateInfo ?? useStudioStore.getState().startupAppUpdate
                  if (!shownUpdate) return null
                  return (
                    <div className="rounded-xl border border-border bg-surface p-4 text-xs space-y-3">
                      <div className="flex items-center justify-between gap-2 font-semibold text-text-primary">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-accent" />
                          <span>
                            当前版本 v{shownUpdate.currentVersion} · 最新 Release v{shownUpdate.latestVersion}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            shownUpdate.hasUpdate
                              ? 'bg-accent-soft text-accent'
                              : 'bg-success-soft text-success'
                          }`}
                        >
                          {shownUpdate.hasUpdate ? '发现可更新版本' : '已是最新版本'}
                        </span>
                      </div>

                      {shownUpdate.releaseNotes && (
                        <div className="space-y-1.5 rounded-xl border border-border/70 bg-surface-raised/60 p-3">
                          <div className="text-[11px] font-semibold text-text-primary">更新日志</div>
                          <CleanLicenseDocument raw={shownUpdate.releaseNotes} />
                        </div>
                      )}

                      {shownUpdate.hasUpdate && shownUpdate.downloadUrl && shownUpdate.assetName && (
                        <button
                          type="button"
                          onClick={() =>
                            void window.inknexus.updater.downloadAndInstall(
                              shownUpdate.downloadUrl!,
                              shownUpdate.assetName!
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-hover"
                        >
                          <Download className="h-3.5 w-3.5" />
                          下载并安装 {shownUpdate.assetName}
                        </button>
                      )}
                    </div>
                  )
                })()}

                {updateProgress && (
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-text-secondary">
                      <span>{updateProgress.label}</span>
                      <span>{updateProgress.percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${updateProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'licenses' && (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-text-primary">开源许可声明</h1>
              <div className="glass-card p-6">
                {licenseText ? (
                  <CleanLicenseDocument raw={licenseText} />
                ) : (
                  <div className="text-xs text-text-muted">正在加载开源许可声明...</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 删除作品二次确认弹窗 */}
      {deleteTargetProject &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-xs">
            <div className="glass-panel w-full max-w-md space-y-4 border border-danger/35 p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">确认永久删除作品文件夹？</h3>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    您正在准备删除《<strong className="text-text-primary">{deleteTargetProject.title}</strong>》。
                    <span className="mt-1 block font-semibold text-danger">
                      该操作将彻底删除磁盘上的作品目录及全部世界观、大纲与章节正文文件，删除后不可恢复！
                    </span>
                  </p>
                  <div className="mt-2 truncate rounded-lg border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-text-muted">
                    {deleteTargetProject.rootPath}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={deletingProject}
                  onClick={() => setDeleteTargetProject(null)}
                  className="h-9 rounded-xl border border-border px-4 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deletingProject}
                  onClick={() => void handleConfirmDeleteProject()}
                  className="h-9 rounded-xl bg-danger px-4 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {deletingProject ? '正在删除...' : '确认永久删除（不可恢复）'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
