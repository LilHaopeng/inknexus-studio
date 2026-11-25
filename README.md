# 墨枢 · InkNexus Studio

桌面端多 Agent 协同小说与剧本创作工作台（MIT 开源 · Author: [@LilHaopeng](https://github.com/LilHaopeng)）

## 核心特性

- **双入口智能开书**：支持从零构思（长篇小说 / 高概念短篇网文 / AI 短剧与漫剧）以及多文件/整目录拖拽导入（DOCX、TXT、Markdown）。支持单独只有大纲或正文时反推补全完整大纲与世界观。
- **多 Agent 统一桥接**：自动探测本地 CLI / ACP（Codex CLI、DSH、Claude Code、Gemini CLI、Qoder CLI、AGY 等），同时内置 13 家主流 API 供应商预设（Gemini 4、GPT-6.2、Claude 5.5、Kimi K3.1、Qwen 4 Max、豆包 Seed 2.1、DeepSeek V4、GLM-5.3、MiniMax M3.1 等），支持 5 档思考深度控制与快速切换。
- **类 Office 人机共创编辑器**：基于 Tiptap / ProseMirror 构建，支持撤销/重做、全文与局部红绿修订对比（Diff）、文档行内批注与多轮对话修稿、双模型同场试写对比、只读正典锁定、人物/伏笔看板以及自动隐藏 `L0/L1/Status` 工程标记的纯净正文展示。
- **并发队列与三层审查流水线**：支持多本小说独立分配 Agent 并发撰写，可选 **自审** / **单独审查（1写+1审）** / **高级审查（1写+2审）**，并提供按时间倒序归档的纯净人话审查报告与「审查本章 / 再次运行全文审查」。
- **市场扫榜雷达**：支持一键扫榜、历史榜单浏览、多期榜单趋势对比以及「以此简报一键开书」。
- **AppData 集中存储与 GitHub 自动更新**：批注、快照、对话与审查缓存统一存于 `%APPDATA%\InkNexusStudio\`，绝不污染小说原目录；支持内置 6 大 [@LilHaopeng](https://github.com/LilHaopeng) Skill 热更新与 GitHub Releases 一键自动升级。

## 开发与打包

```bash
npm install
npm run typecheck
npm test
npm run package:win:exe
```

## 开源许可

本项目以 **MIT License** 开源，完整依赖及 Skill 许可清单请见 [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md)。
