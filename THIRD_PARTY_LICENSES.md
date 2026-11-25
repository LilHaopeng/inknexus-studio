# 墨枢 · InkNexus Studio — 开源许可声明 (Open Source & Third-Party Licenses)

本软件（**InkNexus Studio**）由 **@LilHaopeng** 基于 **MIT License** 开源发布（项目地址：https://github.com/LilHaopeng/inknexus-studio）。  
本软件内集成的创作用 Skill 规范库与第三方开源依赖均遵循 **MIT / Apache-2.0 / BSD-2-Clause / ISC** 等商用友好协议，未引入任何 GPL / AGPL 传染性协议或闭源商业付费扩展（如 Tiptap Pro）。

---

## 一、本软件与内置创作 Skill 开源许可（MIT）

| 项目 / Skill 名称 | 作者 | 协议 | 说明 | GitHub 仓库地址 |
|---|---|---|---|---|
| **InkNexus Studio** | @LilHaopeng | MIT | 墨枢桌面端 AI 小说与剧本共创工作台主程序 | https://github.com/LilHaopeng/inknexus-studio |
| **story-world-architect** | @LilHaopeng | MIT | 长篇世界观与因果规则架构 Skill | https://github.com/LilHaopeng/story-world-architect |
| **story-outline-architect** | @LilHaopeng | MIT | 长篇多线大纲、剧情段与因果追踪 Skill | https://github.com/LilHaopeng/story-outline-architect |
| **story-prose-writer** | @LilHaopeng | MIT | 长篇正文撰写、审校与 Docx/Txt 导出 Skill | https://github.com/LilHaopeng/story-prose-writer |
| **webnovel-short-studio** | @LilHaopeng | MIT | 高概念短篇网文工作室 Skill | https://github.com/LilHaopeng/webnovel-short-studio |
| **webnovel-market-radar** | @LilHaopeng | MIT | 市场扫榜雷达与多期趋势分析 Skill | https://github.com/LilHaopeng/webnovel-market-radar |
| **ai-drama-script-studio** | @LilHaopeng | MIT | AI 短剧 / 漫剧 / 沙雕剧编剧与分镜 Skill | https://github.com/LilHaopeng/ai-drama-script-studio |

---

## 二、核心第三方开源依赖清单

| 组件名称 | 协议 | 用途说明 | 项目地址 |
|---|---|---|---|
| **Electron** | MIT | 跨平台桌面应用运行时外壳 | https://github.com/electron/electron |
| **electron-vite / Vite** | MIT | 主进程/渲染进程构建与打包工具链 | https://github.com/alex8088/electron-vite |
| **electron-builder** | MIT | Windows 安装包（NSIS）与便携版 `.exe` 打包 | https://github.com/electron-userland/electron-builder |
| **React / React DOM** | MIT | 前端界面声明式渲染引擎 | https://github.com/facebook/react |
| **TypeScript** | Apache-2.0 | 全栈类型安全开发语言 | https://github.com/microsoft/TypeScript |
| **Zustand** | MIT | 轻量前端状态管理 | https://github.com/pmndrs/zustand |
| **Tailwind CSS** | MIT | 原子化样式与语义化 Design Token 系统 | https://github.com/tailwindlabs/tailwindcss |
| **Lucide React** | ISC | 统一线性交互图标库 | https://github.com/lucide-icons/lucide |
| **Motion (Framer Motion)** | MIT | 柔和弹簧与微动效引擎 | https://github.com/motiondivision/motion |
| **Sonner** | MIT | 轻量通知与操作反馈 Toast | https://github.com/emilkowalski/sonner |
| **react-resizable-panels** | MIT | 工作台可拖拽三栏布局 | https://github.com/bvaughn/react-resizable-panels |
| **Tiptap Core / React / StarterKit / Extensions** | MIT | 类 Office 富文本编辑器与撤销/重做历史栈 | https://github.com/ueberdosis/tiptap |
| **ProseMirror** | MIT | 底层文档模型、自定义批注 Mark 与选区装饰 | https://github.com/ProseMirror/prosemirror |
| **diff-match-patch** | Apache-2.0 | 正文红绿修订（Track Changes）差异计算 | https://github.com/google/diff-match-patch |
| **mammoth** | BSD-2-Clause | Word `.docx` 文档导入解析 | https://github.com/mwilliamson/mammoth.js |
| **turndown** | MIT | HTML 转标准 Markdown | https://github.com/mixmark-io/turndown |
| **marked** | MIT | Markdown 转 HTML 预览与导入 | https://github.com/markedjs/marked |
| **chokidar** | MIT | 本地作品目录外部改动监听 | https://github.com/paulmillr/chokidar |
| **iconv-lite** | MIT | 中文 `.txt`（UTF-8 / GB18030）编码自动解码 | https://github.com/ashtuchkin/iconv-lite |
| **@agentclientprotocol/sdk** | Apache-2.0 | ACP（Agent Client Protocol）标准本地 Agent 桥接 | https://github.com/agentclientprotocol/typescript-sdk |
| **Vercel AI SDK (`ai`, `@ai-sdk/*`)** | Apache-2.0 | 预置 API 供应商（豆包火山方舟 / DeepSeek / OpenAI / Claude / Gemini）统一流式调度与工具循环 | https://github.com/vercel/ai |
| **Zod** | MIT | 结构化参数与工具调用校验 | https://github.com/colinhacks/zod |
| **Vitest** | MIT | 单元测试框架 | https://github.com/vitest-dev/vitest |

---

## 三、开源架构参考与致谢

- **iOfficeAI / AionUi**（Apache-2.0，https://github.com/iOfficeAI/AionUi）：参考其基于 Electron 自动探测本机多 CLI Agent 并统一桥接的设计思路。
- **sereneinserenade / tiptap-comment-extension**（MIT，https://github.com/sereneinserenade/tiptap-comment-extension）：参考其基于 ProseMirror Mark 实现类 Google Docs / Word 批注锚点的数据模型设计。

---

## 四、主要协议文本摘要

### MIT License
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

### Apache License 2.0
Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

### BSD 2-Clause License
Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met: (1) Redistributions of source code must retain the above copyright notice; (2) Redistributions in binary form must reproduce the above copyright notice in the documentation and/or other materials provided with the distribution.
