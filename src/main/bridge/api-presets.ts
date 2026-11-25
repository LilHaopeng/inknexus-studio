import type { ApiProviderConfig, ApiProviderPreset } from '@shared/types'
import { AppDataStore } from '../storage/appdata-store'

export const API_PROVIDER_PRESETS: ApiProviderPreset[] = [
  {
    id: 'api-doubao',
    name: '火山方舟 · 豆包',
    vendor: '字节跳动',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'openai-compatible',
    defaultModels: ['doubao-seed-2-1-pro', 'doubao-seed-2-1-turbo', 'doubao-seed-2-1-lite-260915'],
    requiresEndpointId: true,
    thinkingSupport: 'toggle',
    docHint: '填入火山方舟 API Key；支持 Doubao Seed 2.1 Pro/Turbo，亦可直接填入 Endpoint ID (ep-...)'
  },
  {
    id: 'api-deepseek',
    name: 'DeepSeek 官方',
    vendor: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'deepseek',
    defaultModels: ['deepseek-v4-pro', 'deepseek-flash'],
    thinkingSupport: 'model-switch',
    docHint: '关闭思考使用 deepseek-flash，开启深度思考自动切换 deepseek-v4-pro'
  },
  {
    id: 'api-openai',
    name: 'OpenAI',
    vendor: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    defaultModels: ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-5-codex'],
    thinkingSupport: 'effort',
    docHint: '支持 GPT-6.2 Astra / Sol 与 reasoning_effort（low / medium / high / xhigh）调节'
  },
  {
    id: 'api-anthropic',
    name: 'Anthropic Claude',
    vendor: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    defaultModels: ['claude-opus-5-5', 'claude-sonnet-5-5'],
    thinkingSupport: 'budget',
    docHint: '支持 Claude Opus 5.5 / Sonnet 5.5 Extended Thinking 按档位分配 thinkingBudget'
  },
  {
    id: 'api-google',
    name: 'Google Gemini API',
    vendor: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'google',
    defaultModels: ['gemini-4-neon', 'gemini-4-carbon', 'gemini-4-hydrogen', 'gemini-3.8-flash'],
    thinkingSupport: 'budget',
    docHint: '支持 Gemini 4 Neon / Carbon / Hydrogen 原生 thinkingBudget 思考深度控制'
  },
  {
    id: 'api-qwen',
    name: '阿里百炼 · 通义千问',
    vendor: '阿里云',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'openai-compatible',
    defaultModels: ['qwen4-max', 'qwen4-max-preview'],
    thinkingSupport: 'toggle',
    docHint: 'OpenAI 兼容端点，支持 Qwen 4 Max 思考模式参数'
  },
  {
    id: 'api-kimi',
    name: '月之暗面 · Kimi',
    vendor: 'Moonshot AI',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'openai-compatible',
    defaultModels: ['kimi-k3.1-pro', 'kimi-k3.1-pro-highspeed'],
    thinkingSupport: 'none',
    docHint: 'Kimi K3.1 Pro 超长上下文与多轮网文写作表现优异，兼容 OpenAI 协议'
  },
  {
    id: 'api-zhipu',
    name: '智谱 GLM',
    vendor: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'openai-compatible',
    defaultModels: ['glm-5.3', 'glm-5.3-flash', 'glm-5'],
    thinkingSupport: 'toggle',
    docHint: '填写智谱开放平台 API Key 即可直接调用 GLM-5.3 系列'
  },
  {
    id: 'api-minimax',
    name: 'MiniMax',
    vendor: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    protocol: 'openai-compatible',
    defaultModels: ['MiniMax-M3.1-Flash', 'MiniMax-M3'],
    thinkingSupport: 'none',
    docHint: 'MiniMax M3.1 中文短剧台词与角色对白节奏优异'
  },
  {
    id: 'api-siliconflow',
    name: '硅基流动 SiliconFlow',
    vendor: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai-compatible',
    defaultModels: ['deepseek-ai/DeepSeek-V4-Pro', 'Qwen/Qwen4-Max'],
    thinkingSupport: 'none',
    docHint: '聚合主流国产大模型，可在设置内自定义模型列表'
  },
  {
    id: 'api-openrouter',
    name: 'OpenRouter',
    vendor: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    protocol: 'openai-compatible',
    defaultModels: ['anthropic/claude-opus-5.5', 'google/gemini-4-neon', 'openai/gpt-6.2-astra'],
    thinkingSupport: 'effort',
    docHint: '单个 Key 路由全球多款前沿模型'
  },
  {
    id: 'api-ollama',
    name: '本地 Ollama',
    vendor: 'Local',
    baseUrl: 'http://localhost:11434/v1',
    protocol: 'openai-compatible',
    defaultModels: ['qwen4:14b', 'deepseek-v4:14b'],
    thinkingSupport: 'none',
    docHint: '本机离线推理，API Key 填 ollama 即可'
  },
  {
    id: 'api-custom',
    name: '自定义 OpenAI 兼容端点',
    vendor: 'Custom',
    baseUrl: '',
    protocol: 'openai-compatible',
    defaultModels: ['custom-model'],
    thinkingSupport: 'none',
    docHint: '适用于团队自建网关或第三方中转站，可在设置内自由修改模型名'
  }
]

export class ApiPresetService {
  constructor(private readonly store: AppDataStore) {}

  listConfigs(): ApiProviderConfig[] {
    const saved = this.store.getApiSecrets()
    return API_PROVIDER_PRESETS.map((preset) => {
      const s = saved[preset.id]
      return {
        presetId: preset.id,
        name: preset.name,
        baseUrl: s?.baseUrl || preset.baseUrl,
        protocol: preset.protocol,
        models: s?.models?.length ? s.models : preset.defaultModels,
        endpointId: s?.endpointId,
        enabled: Boolean(s?.enabled && (s?.apiKey || preset.id === 'api-ollama')),
        hasApiKey: Boolean(s?.apiKey)
      }
    })
  }

  saveConfig(
    presetId: string,
    patch: { apiKey?: string; endpointId?: string; baseUrl?: string; models?: string[]; enabled?: boolean }
  ): ApiProviderConfig[] {
    this.store.saveApiSecret(presetId, patch)
    return this.listConfigs()
  }

  exportTeamTemplate(): string {
    const list = this.listConfigs().map((c) => ({
      presetId: c.presetId,
      name: c.name,
      baseUrl: c.baseUrl,
      models: c.models,
      endpointId: c.endpointId,
      enabled: c.enabled
    }))
    return JSON.stringify({ version: 1, note: '已脱敏导出，不包含任何 API Key', providers: list }, null, 2)
  }

  importTeamTemplate(jsonText: string): ApiProviderConfig[] {
    const parsed = JSON.parse(jsonText) as {
      providers?: Array<{ presetId: string; baseUrl?: string; models?: string[]; endpointId?: string }>
    }
    for (const p of parsed.providers ?? []) {
      this.store.saveApiSecret(p.presetId, {
        baseUrl: p.baseUrl,
        models: p.models,
        endpointId: p.endpointId
      })
    }
    return this.listConfigs()
  }
}
