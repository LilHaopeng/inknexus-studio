import React, { useEffect, useState } from 'react'
import {
  ArrowUpCircle,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  KeyRound,
  Layers,
  Loader2,
  Palette,
  RefreshCw,
  Scale,
  Shield,
  Trash2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type { ApiProviderConfig, AppUpdateInfo, CloseBehavior, SkillId, StorageScope } from '@shared/types'
import { useStudioStore } from '../store/useStudioStore'

export type SettingsTab =
  | 'agents'
  | 'apis'
  | 'skills'
  | 'storage'
  | 'appearance'
  | 'workspace'
  | 'updater'
  | 'licenses'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const SettingsPage: React.FC<{ initialTab?: SettingsTab }> = ({ initialTab = 'agents' }) => {
  const {
    localAgents,
    setLocalAgents,
    apiConfigs,
    setApiConfigs,
    config,
    setConfig,
    storageReport,
    setStorageReport,
    skillRegistry,
    setSkillRegistry,
    appInfo
  } = useStudioStore()

  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({})
  const [endpointDrafts, setEndpointDrafts] = useState<Record<string, string>>({})
  const [modelDrafts, setModelDrafts] = useState<Record<string, string>>({})
  const [licensesText, setLicensesText] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<Record<string, StorageScope[]>>({})
  const [checkingSkillId, setCheckingSkillId] = useState<string | null>(null)
  const [pullingSkillId, setPullingSkillId] = useState<string | null>(null)
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false)
  const [downloadingUpdate, setDownloadingUpdate] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; label: string } | null>(null)

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (tab === 'storage') {
      void window.inknexus.storage.report().then(setStorageReport)
    } else if (tab === 'licenses' && !licensesText) {
      void window.inknexus.storage.getLicenses().then(setLicensesText)
    } else if (tab === 'skills') {
      void window.inknexus.skills.registry().then(setSkillRegistry)
    }
  }, [tab, licensesText, setStorageReport, setSkillRegistry])

  useEffect(() => {
    return window.inknexus.updater.onProgress((p) => {
      setDownloadProgress(p)
    })
  }, [])

  const handleSaveApi = async (preset: ApiProviderConfig) => {
    const key = apiKeyDrafts[preset.presetId]
    const endpointId = endpointDrafts[preset.presetId]
    const modelsStr = modelDrafts[preset.presetId]
    const parsedModels =
      modelsStr !== undefined
        ? modelsStr
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
    const next = (await window.inknexus.agents.saveApi(preset.presetId, {
      ...(key !== undefined ? { apiKey: key } : {}),
      ...(endpointId !== undefined ? { endpointId } : {}),
      ...(parsedModels?.length ? { models: parsedModels } : {}),
      enabled: true
    })) as ApiProviderConfig[]
    setApiConfigs(next)
    toast.success(`已保存 ${preset.name} 配置（Key 使用 Windows DPAPI 加密存入 AppData）`)
  }

  const handleTestApi = async (preset: ApiProviderConfig) => {
    setTestingId(preset.presetId)
    try {
      const modelOverride = (modelDrafts[preset.presetId] ?? preset.models.join(', '))
        .split(/[,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean)[0]
      const res = await window.inknexus.agents.testApi(preset.presetId, modelOverride || preset.models[0])
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    } finally {
      setTestingId(null)
    }
  }

  const toggleScope = (projectId: string, scope: StorageScope) => {
    setSelectedScopes((prev) => {
      const cur = prev[projectId] ?? []
      const exists = cur.includes(scope)
      return {
        ...prev,
        [projectId]: exists ? cur.filter((s) => s !== scope) : [...cur, scope]
      }
    })
  }

  const handleDeleteProjectCache = async (projectId: string, title: string) => {
    const scopes = selectedScopes[projectId] ?? []
    if (scopes.length === 0) {
      toast.info('请先勾选要清理的缓存类型（批注 / 快照 / 聊天 / 审查记录）')
      return
    }
    const next = await window.inknexus.storage.deleteProjectData(projectId, scopes)
    setStorageReport(next)
    setSelectedScopes((p) => ({ ...p, [projectId]: [] }))
    toast.success(`已清理《${title}》的所选 AppData 缓存（原作品稿件完好无损）`)
  }

  const handleCheckSkill = async (skillId: SkillId) => {
    setCheckingSkillId(skillId)
    try {
      const updated = await window.inknexus.skills.checkUpdate(skillId)
      setSkillRegistry(skillRegistry.map((s) => (s.id === skillId ? updated : s)))
      if (updated.hasUpdate) {
        toast.info(`${updated.name} 检测到 GitHub 更新`)
      } else {
        toast.success(`${updated.name} 已是最新版本`)
      }
    } catch (err) {
      toast.error(`检查失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCheckingSkillId(null)
    }
  }

  const handlePullSkill = async (skillId: SkillId) => {
    setPullingSkillId(skillId)
    try {
      const updated = await window.inknexus.skills.pullUpdate(skillId)
      setSkillRegistry(skillRegistry.map((s) => (s.id === skillId ? updated : s)))
      toast.success(`已从 @LilHaopeng GitHub 拉取并更新 ${updated.name} 至 AppData/skills`)
    } catch (err) {
      toast.error(`拉取更新失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPullingSkillId(null)
    }
  }

  const handleCheckAllSkills = async () => {
    for (const sk of skillRegistry) {
      await handleCheckSkill(sk.id)
    }
  }

  const handleCheckAppUpdate = async () => {
    setCheckingAppUpdate(true)
    try {
      const info = await window.inknexus.updater.check()
      setUpdateInfo(info)
      if (info.hasUpdate) {
        toast.info(`发现新版本 v${info.latestVersion}`)
      } else {
        toast.success(`当前已安装最新版本 v${info.currentVersion}`)
      }
    } catch (err) {
      toast.error(`检查软件更新失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCheckingAppUpdate(false)
    }
  }

  const handleDownloadAndInstallAppUpdate = async () => {
    if (!updateInfo?.downloadUrl || !updateInfo.assetName) {
      toast.error('未找到可直接安装的 Windows .exe 安装包资产')
      return
    }
    setDownloadingUpdate(true)
    try {
      await window.inknexus.updater.downloadAndInstall(updateInfo.downloadUrl, updateInfo.assetName)
      toast.success('安装包已就绪，软件即将关闭并自动安装重启...')
    } catch (err) {
      toast.error(`自动更新失败：${err instanceof Error ? err.message : String(err)}`)
      setDownloadingUpdate(false)
    }
  }

  return (
    <div className="relative z-10 h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-2xl font-bold text-text-primary">设置与工作台管理</h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Sub Navigation */}
          <div className="space-y-1 lg:col-span-3">
            {[
              { id: 'agents' as const, label: '本地 Agent 体检', icon: Cpu },
              { id: 'apis' as const, label: '预置 API 供应商', icon: KeyRound },
              { id: 'skills' as const, label: '内置 Skill 规范库', icon: Layers },
              { id: 'storage' as const, label: 'AppData 存储与清理', icon: HardDrive },
              { id: 'appearance' as const, label: '外观与阅读排版', icon: Palette },
              { id: 'workspace' as const, label: '工作区、关闭行为与权限', icon: Shield },
              { id: 'updater' as const, label: '检查软件更新', icon: ArrowUpCircle },
              { id: 'licenses' as const, label: '开源许可声明', icon: Scale }
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-xs font-medium transition ${
                    tab === item.id
                      ? 'bg-accent-soft font-semibold text-accent'
                      : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="glass-panel p-6 lg:col-span-9">
            {tab === 'agents' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">本地 CLI / ACP Agent 桥接检测</h2>
                    <p className="text-xs text-text-secondary">
                      自动绕过 Windows PowerShell 脚本限制并清洗不受支持的代理环境变量
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const list = await window.inknexus.agents.discover()
                      setLocalAgents(list)
                      toast.success('已刷新本地 Agent 探测状态')
                    }}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium hover:border-accent"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新扫描
                  </button>
                </div>

                <div className="space-y-2.5">
                  {localAgents.map((ag) => (
                    <div key={ag.id} className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{ag.name}</span>
                          {ag.status === 'available' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
                              <CheckCircle2 className="h-3 w-3" /> 已检测到
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-text-muted">
                              <XCircle className="h-3 w-3" /> 未安装
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">{ag.description}</p>
                        {ag.executablePath && (
                          <div className="mt-1 truncate font-mono text-[11px] text-text-muted">{ag.executablePath}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={ag.status !== 'available' || testingId === ag.id}
                        onClick={async () => {
                          setTestingId(ag.id)
                          try {
                            const res = await window.inknexus.agents.testLocal(ag)
                            if (res.ok) toast.success(res.message)
                            else toast.error(res.message)
                          } finally {
                            setTestingId(null)
                          }
                        }}
                        className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary hover:border-accent disabled:opacity-40"
                      >
                        {testingId === ag.id ? '测试中...' : '测试连通'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'apis' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">预置 API 供应商中心（只需填写 API Key）</h2>
                    <p className="text-xs text-text-secondary">
                      已更新至 2026 最新旗舰模型列表（Gemini 4、GPT-6.2、Claude 5.5、Kimi K3.1、Qwen 4 Max 等），亦支持自由编辑模型 ID
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const json = await window.inknexus.agents.exportApiTemplate()
                      await navigator.clipboard.writeText(json)
                      toast.success('已复制脱敏团队预设模板（不含任何 API Key）到剪贴板')
                    }}
                    className="rounded-xl border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-primary hover:border-accent"
                  >
                    导出脱敏团队预设
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {apiConfigs.map((api) => (
                    <div key={api.presetId} className="glass-card space-y-2.5 p-4 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-text-primary">{api.name}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            api.hasApiKey ? 'bg-success-soft text-success' : 'bg-surface text-text-muted'
                          }`}
                        >
                          {api.hasApiKey ? '已配置 Key' : '待填 Key'}
                        </span>
                      </div>
                      <div className="truncate font-mono text-[11px] text-text-muted">{api.baseUrl || '自定义 Base URL'}</div>

                      <input
                        type="password"
                        value={apiKeyDrafts[api.presetId] ?? ''}
                        onChange={(e) => setApiKeyDrafts((d) => ({ ...d, [api.presetId]: e.target.value }))}
                        placeholder={api.hasApiKey ? '••••••••••••（留空保持原 Key）' : '在此粘贴 API Key...'}
                        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                      />

                      <input
                        type="text"
                        value={modelDrafts[api.presetId] ?? api.models.join(', ')}
                        onChange={(e) => setModelDrafts((d) => ({ ...d, [api.presetId]: e.target.value }))}
                        placeholder="逗号分隔模型 ID"
                        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 font-mono text-[11px] text-text-secondary outline-none focus:border-accent"
                      />

                      {api.presetId === 'api-doubao' && (
                        <input
                          type="text"
                          value={endpointDrafts[api.presetId] ?? api.endpointId ?? ''}
                          onChange={(e) => setEndpointDrafts((d) => ({ ...d, [api.presetId]: e.target.value }))}
                          placeholder="可选：火山方舟推理接入点 Endpoint ID (ep-...)"
                          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                        />
                      )}

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleTestApi(api)}
                          disabled={testingId === api.presetId}
                          className="rounded-lg border border-border px-2.5 py-1 text-[11px] hover:border-accent"
                        >
                          {testingId === api.presetId ? '测试中' : '测试'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSaveApi(api)}
                          className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-on-accent"
                        >
                          保存启用
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'skills' && (
              <div className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">
                      内置创作 Skill 规范库（绑定 @LilHaopeng GitHub MIT 仓库）
                    </h2>
                    <p className="text-text-secondary">
                      全部 6 个写作与市场雷达 Skill 均支持手动检查更新并增量热拉取至本地 AppData，无需重装软件。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCheckAllSkills()}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-3 py-1.5 font-medium hover:border-accent"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    全部检查更新
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {skillRegistry.map((sk) => (
                    <div key={sk.id} className="glass-card flex flex-col justify-between space-y-2.5 p-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-accent">{sk.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              sk.hasUpdate
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                : 'bg-surface text-text-muted'
                            }`}
                          >
                            v{sk.localVersion}
                            {sk.hasUpdate ? ` → 新提交可拉取` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void window.inknexus.app.openExternal(sk.repoUrl)}
                          className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary hover:text-accent hover:underline"
                        >
                          {sk.repoOwner}/{sk.repoName}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                        <p className="mt-2 line-clamp-3 leading-relaxed text-text-secondary">{sk.summary}</p>
                        {sk.scripts.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {sk.scripts.map((sc) => (
                              <span
                                key={sc}
                                className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                              >
                                {sc}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 border-t border-border pt-2">
                        <button
                          type="button"
                          disabled={checkingSkillId === sk.id}
                          onClick={() => void handleCheckSkill(sk.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] text-text-secondary hover:border-accent"
                        >
                          {checkingSkillId === sk.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          检查更新
                        </button>
                        <button
                          type="button"
                          disabled={pullingSkillId === sk.id}
                          onClick={() => void handlePullSkill(sk.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
                        >
                          {pullingSkillId === sk.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          拉取覆盖
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'storage' && (
              <div className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">AppData 统一存储与自主清理</h2>
                    <p className="text-text-secondary">
                      软件所有批注、历史快照、会话与并发队列日志均集中存放在本地 AppData，<strong>绝不污染你的小说原文件夹</strong>。删除操作仅清理缓存，永不删除原稿。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void window.inknexus.storage.openAppData()}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-raised px-3 py-1.5 font-medium hover:border-accent"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    打开 AppData 目录
                  </button>
                </div>

                {storageReport && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="glass-card p-3.5">
                        <div className="text-text-muted">AppData 总占用</div>
                        <div className="mt-1 text-lg font-bold text-accent">{formatBytes(storageReport.totalBytes)}</div>
                      </div>
                      <div className="glass-card p-3.5">
                        <div className="text-text-muted">并发队列历史记录</div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-lg font-bold text-text-primary">{formatBytes(storageReport.swarmBytes)}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              const next = await window.inknexus.storage.clearSwarm()
                              setStorageReport(next)
                              toast.success('已清理并发队列历史记录')
                            }}
                            className="rounded-lg border border-danger/40 px-2 py-1 text-[11px] text-danger hover:bg-danger-soft"
                          >
                            清空队列记录
                          </button>
                        </div>
                      </div>
                      <div className="glass-card p-3.5">
                        <div className="text-text-muted">已索引作品缓存数</div>
                        <div className="mt-1 text-lg font-bold text-text-primary">{storageReport.projects.length} 部</div>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {storageReport.projects.map((p) => {
                        const checked = selectedScopes[p.projectId] ?? []
                        return (
                          <div key={p.projectId} className="glass-card flex flex-wrap items-center justify-between gap-3 p-3.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-text-primary">{p.title}</span>
                                <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-secondary">
                                  总计 {formatBytes(p.totalBytes)}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-text-secondary">
                                {[
                                  { scope: 'annotations' as const, label: `批注 (${p.annotationCount}条 · ${formatBytes(p.annotationsBytes)})` },
                                  { scope: 'snapshots' as const, label: `快照 (${p.snapshotCount}份 · ${formatBytes(p.snapshotsBytes)})` },
                                  { scope: 'chat' as const, label: `对话 (${formatBytes(p.chatBytes)})` },
                                  { scope: 'reviews' as const, label: `审查记录 (${formatBytes(p.reviewsBytes)})` }
                                ].map((item) => (
                                  <label key={item.scope} className="inline-flex cursor-pointer items-center gap-1">
                                    <input
                                      type="checkbox"
                                      checked={checked.includes(item.scope)}
                                      onChange={() => toggleScope(p.projectId, item.scope)}
                                    />
                                    <span>{item.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleDeleteProjectCache(p.projectId, p.title)}
                                className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2.5 py-1.5 text-[11px] font-medium text-danger hover:bg-danger-soft"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                删除所选
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = await window.inknexus.storage.deleteProjectData(p.projectId, ['all'])
                                  setStorageReport(next)
                                  toast.success(`已清除《${p.title}》全部 AppData 缓存`)
                                }}
                                className="rounded-lg bg-danger-soft px-2.5 py-1.5 text-[11px] font-medium text-danger hover:bg-danger hover:text-white"
                              >
                                全清该书缓存
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'appearance' && config && (
              <div className="space-y-4 text-xs">
                <h2 className="text-base font-semibold text-text-primary">主题、磨砂与排版偏好</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-medium text-text-secondary">整体界面主题</label>
                    <select
                      value={config.theme}
                      onChange={async (e) => setConfig(await window.inknexus.config.save({ theme: e.target.value as never }))}
                      className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2"
                    >
                      <option value="aurora-light">极光晨曦（Aurora Light）</option>
                      <option value="aurora-dark">极光夜幕（Aurora Dark）</option>
                      <option value="system">跟随 Windows 系统</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-medium text-text-secondary">视觉动效与玻璃材质</label>
                    <select
                      value={config.effectsMode}
                      onChange={async (e) => setConfig(await window.inknexus.config.save({ effectsMode: e.target.value as never }))}
                      className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2"
                    >
                      <option value="full">完整 Aurora 玻璃拟态与微动效</option>
                      <option value="reduced">减弱动效与降低透明度（高性能实色）</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {tab === 'workspace' && config && (
              <div className="space-y-4 text-xs">
                <h2 className="text-base font-semibold text-text-primary">工作区、窗口关闭与安全权限</h2>
                <div>
                  <label className="mb-1 block font-medium text-text-secondary">默认作品库根目录</label>
                  <input
                    type="text"
                    value={config.workspaceRoot}
                    onChange={async (e) => setConfig(await window.inknexus.config.save({ workspaceRoot: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-medium text-text-secondary">点击右上角 X 关闭按钮时的行为</label>
                  <select
                    value={config.closeBehavior ?? 'ask'}
                    onChange={async (e) =>
                      setConfig(await window.inknexus.config.save({ closeBehavior: e.target.value as CloseBehavior }))
                    }
                    className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2"
                  >
                    <option value="ask">每次询问（弹出「最小化后台运行 / 直接关闭」选择框）</option>
                    <option value="minimize-to-tray">最小化到系统托盘后台运行</option>
                    <option value="exit">直接退出 InkNexus Studio</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-medium text-text-secondary">Agent 文件写入策略</label>
                  <select
                    value={config.permissionMode}
                    onChange={async (e) => setConfig(await window.inknexus.config.save({ permissionMode: e.target.value as never }))}
                    className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2"
                  >
                    <option value="diff-review">安全协作模式（推荐：先出红绿 Diff 预览，人工确认后写入）</option>
                    <option value="auto-write">自动写入模式（AI 修改前自动存快照，直接落盘）</option>
                  </select>
                </div>
              </div>
            )}

            {tab === 'updater' && (
              <div className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">检查软件更新（GitHub Releases 自动升级）</h2>
                    <p className="text-text-secondary">
                      当前版本：<strong className="text-accent">v{appInfo.version}</strong> · 作者：@{appInfo.author} · 开源仓库：
                      <button
                        type="button"
                        onClick={() => void window.inknexus.app.openExternal(appInfo.repoUrl)}
                        className="ml-1 text-accent hover:underline"
                      >
                        {appInfo.repoUrl}
                      </button>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={checkingAppUpdate}
                    onClick={() => void handleCheckAppUpdate()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
                  >
                    {checkingAppUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {checkingAppUpdate ? '检查中...' : '检查更新'}
                  </button>
                </div>

                {updateInfo && (
                  <div className="glass-card space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-text-primary">
                          最新版本：v{updateInfo.latestVersion}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {updateInfo.hasUpdate ? '有可用更新包，支持一键拉取安装包并静默安装后自动重开' : '您当前已是最新版本'}
                        </div>
                      </div>
                      {updateInfo.hasUpdate && updateInfo.downloadUrl && (
                        <button
                          type="button"
                          disabled={downloadingUpdate}
                          onClick={() => void handleDownloadAndInstallAppUpdate()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#7855DA] to-[#684BD2] px-4 py-2 font-semibold text-white shadow-md hover:opacity-95 disabled:opacity-50"
                        >
                          {downloadingUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          {downloadingUpdate ? '下载安装中...' : '下载并自动安装'}
                        </button>
                      )}
                    </div>

                    {downloadProgress && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-text-secondary">
                          <span>{downloadProgress.label}</span>
                          <span>{downloadProgress.percent}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${downloadProgress.percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {updateInfo.releaseNotes && (
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-[11px] text-text-secondary">
                        {updateInfo.releaseNotes}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'licenses' && (
              <div className="space-y-3">
                <h2 className="text-base font-semibold text-text-primary">开源许可声明（MIT / Apache-2.0 / BSD）</h2>
                <pre className="max-h-[520px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-raised p-4 text-xs leading-relaxed text-text-secondary">
                  {licensesText || '加载中...'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
