export const USER_AGREEMENT_TITLE = '墨枢 · InkNexus Studio 用户使用声明与开源许可协议'

export interface AgreementSection {
  title: string
  paragraphs: string[]
}

export const USER_AGREEMENT_SECTIONS: AgreementSection[] = [
  {
    title: '一、开源许可与作者信息',
    paragraphs: [
      '墨枢 · InkNexus Studio（含软件主体程序及内置六大创作与市场雷达 Skill：story-world-architect、story-outline-architect、story-prose-writer、webnovel-short-studio、webnovel-market-radar、ai-drama-script-studio）由 GitHub 作者 @LilHaopeng（https://github.com/LilHaopeng/inknexus-studio）基于 MIT License 开源发布。',
      '本软件集成的核心第三方开源组件（包括 Electron、React、Tiptap、ProseMirror、Vercel AI SDK、@agentclientprotocol/sdk、Lucide React、Sonner、diff-match-patch 等）均遵循 MIT、Apache-2.0、BSD-2-Clause 或 ISC 等商业友好开源协议。详细协议文本随软件附带于 THIRD_PARTY_LICENSES.md，并可在软件「设置 -> 开源许可声明」随时查阅。'
    ]
  },
  {
    title: '二、创作内容免责与版权归属声明',
    paragraphs: [
      '1. 工具定位与不保证声明：本软件仅作为本地桌面端 AI 辅助创作、编辑管理与多 Agent 工作流编排工具。软件作者（@LilHaopeng）不对任何接入的第三方模型、本地 CLI Agent 或用户通过本软件生成的文本、剧本、大纲、设定及市场分析内容的准确性、原创性、完整性或合法性作任何明示或默示保证，亦不承担任何直接或间接责任。',
      '2. 作品所有权与版权归属：本软件及作者不会对用户使用本软件创作的任何作品主张任何所有权、著作权或商业分成。相关内容的知识产权与可商用范围，以用户所选定的底层模型或服务提供方协议及所在司法辖区适用法律为准。',
      '3. 用户责任自负：用户应对自己使用本软件创作、编辑、发布或用于商业用途的一切文本与素材自行审查把关，并独立承担因作品内容合规性、版权归属、第三方权利纠纷或违规使用而产生的一切法律与经济后果。'
    ]
  },
  {
    title: '三、隐私保护与本地数据处理承诺',
    paragraphs: [
      '1. 零收集与零遥测：本软件承诺绝不收集、窃取、出售或向作者服务器上传用户的任何个人身份信息、阅读/写作行为数据、小说稿件、大纲设定或 API 密钥；软件不内置任何广告 SDK 或第三方埋点遥测服务。',
      '2. 纯本地存储机制：用户的全部作品原稿均保存在用户指定的本地硬盘目录中；软件产生的批注、版本快照、对话记录与审查档案集中存放在本机 %APPDATA%\\InkNexusStudio\\，API 密钥通过 Windows DPAPI（Data Protection API）在本机加密存储，绝不离开本设备。',
      '3. 外部请求边界：仅当用户主动点击发送对话/审查/扫榜任务时，相关上下文会按用户配置直接发送至用户选定的本机 CLI Agent 或第三方模型 API 提供方，其数据合规与留存政策以对应提供方条款为准；仅当用户主动在设置中点击「检查软件更新」或「检查 Skill 更新」时，软件才会直连 GitHub 公开 API 获取版本或仓库源码。'
    ]
  },
  {
    title: '四、按原样提供与条款生效（MIT AS-IS）',
    paragraphs: [
      '本软件按「现状」（AS IS）免费开源提供，不附带任何适销性或特定用途适用性的担保。点击并勾选「我已阅读并同意《用户使用声明》」并继续安装，即视为您已完整理解并自愿受本声明及 MIT 开源协议条款约束；若您不同意其中任何条款，请退出本次安装。'
    ]
  }
]

export function formatUserAgreementPlainText(): string {
  return [
    USER_AGREEMENT_TITLE,
    '',
    ...USER_AGREEMENT_SECTIONS.flatMap((s) => [s.title, ...s.paragraphs, ''])
  ].join('\n')
}
