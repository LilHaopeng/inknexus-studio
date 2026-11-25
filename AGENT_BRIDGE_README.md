# 墨枢 · InkNexus Studio 外部本地 Agent 对接与模型刷新说明 (`AGENT_BRIDGE_README.md`)

> 本文件专为外部 AI Agent（如 WorkBuddy 国内版/国际版、DSH / DeepSeek Harness、Qoder CLI、Codex CLI、Claude Code、Gemini CLI 或其他自定义本地助手）读取与自动修复本机探测而设计。

---

## 一、快速自动对接步骤（给外部 Agent 执行）

如果 **墨枢 InkNexus Studio** 未能自动识别到你（或未刷新到你最新的模型列表），请按以下步骤检测并写入桥接配置：

1. **实测本机真实安装路径与可执行文件**：
   - **WorkBuddy 国内版**：常见于 `%LOCALAPPDATA%\Programs\WorkBuddy\resources\app.asar.unpacked\cli\dist\codebuddy-lite-wb.mjs`（或注册表卸载项 `InstallLocation` 下同类路径，亦可为任意盘符如 `D:\Program Files\WorkBuddy\...`），国内环境需传入环境变量 `CODEBUDDY_INTERNET_ENVIRONMENT=internal`。
   - **WorkBuddy 国际版**：常见于 `WorkBuddyAIint` 或 `WorkBuddy AI` 目录下的 `codebuddy-lite-wb.mjs`，不应设置 `internal`。
   - **DSH (DeepSeek Harness)**：常见为 `dsh.cmd` / `dsh.exe`（位于 `PATH`、注册表卸载目录或 `...\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd`）。注意清除 `socks://` / `socks5://` 代理环境变量避免代理阻塞。
   - **Qoder CN / 国际版**：常见 `qoderclicn.cmd` / `qodercli.exe` / `qoder.exe`。

2. **获取当前真实可用模型列表**：
   - 请在**你当前实际生效的登录与环境变量下**运行自身的模型查询命令（例如 WorkBuddy 运行 `node "<codebuddy-lite-wb.mjs>" --help` 查看 `--model <model> ... Currently supported: (...)`，Qoder 运行 `--list-models`，AGY 运行 `agy models`，或读取你本地配置文件获取最新可用模型 ID）。
   - 记录关键环境变量（例如接口域名、环境开关、`CODEBUDDY_INTERNET_ENVIRONMENT`、`DEEPSEEK_*`、`DSH_*` 等），确保在 GUI 干净进程下启动子进程时也能命中同一套最新端点与模型。

3. **写入外部桥接配置文件（热加载）**：
   - 将配置写入以下任一路径（**推荐写入 AppData 路径**，升级软件不会覆盖）：
     - 首选（用户级配置）：`%APPDATA%\InkNexusStudio\custom-agents.json`
     - 备选（安装目录级配置）：`<InkNexus Studio 安装目录>\custom-agents.json`

---

## 二、`custom-agents.json` 标准格式

```json
{
  "agents": [
    {
      "id": "workbuddy-cn-cli",
      "name": "WorkBuddy 国内版",
      "kind": "cli",
      "executablePath": "C:\\Users\\YourName\\AppData\\Local\\Programs\\WorkBuddy\\resources\\app.asar.unpacked\\cli\\dist\\codebuddy-lite-wb.mjs",
      "models": [
        "auto",
        "glm-5.3",
        "kimi-k3.1-pro",
        "deepseek-v4-pro",
        "minimax-m3.1-flash"
      ],
      "supportedReasoning": ["off", "low", "medium", "high", "max"],
      "env": {
        "CODEBUDDY_INTERNET_ENVIRONMENT": "internal"
      },
      "enabled": true
    },
    {
      "id": "dsh-cli",
      "name": "DSH (DeepSeek Harness)",
      "kind": "cli",
      "executablePath": "D:\\Tools\\DeepSeek Harness\\resources\\runtime\\cli\\bin\\dsh.cmd",
      "models": [
        "deepseek-v4-pro",
        "deepseek-reasoner"
      ],
      "supportedReasoning": ["off", "low", "medium", "high", "max"],
      "env": {},
      "enabled": true
    }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 内置 ID 可直接覆盖：`agy-cli`、`codex-cli`、`dsh-cli`、`claude-cli`、`gemini-cli`、`qoder-cn-cli`、`qoder-cli`、`workbuddy-cn-cli`、`workbuddy-intl-cli`；也可填写自定义新 ID |
| `name` | 可选 | 在界面下拉框与设置中心展示的名称 |
| `kind` | 可选 | `cli` 或 `acp`，自定义新 Agent 默认按 `cli` 处理 |
| `executablePath` | 是 | `.exe`、`.cmd`、`.bat` 或 `.mjs/.js` 的**绝对路径**（软件在无全局 `node.exe` 的电脑上会自动使用内置 Electron Node 运行 `.mjs`） |
| `models` | 是 | 最新模型 ID 数组，第一项将作为该 Agent 的默认模型 |
| `supportedReasoning` | 可选 | 支持的思考强度，取自 `["off", "low", "medium", "high", "max"]` |
| `env` | 可选 | 启动该 CLI 时附加注入的环境变量键值对（如果需清除某个变量，值设为空字符串 `""`） |
| `customArgs` | 可选 | 高级自定义命令行参数数组（针对完全自定义的外部 CLI）。支持模板变量：`{{model}}`、`{{reasoning}}`、`{{projectRoot}}`、`{{prompt}}`（若不含 `{{prompt}}`，则通过 `stdin` 传入） |
| `enabled` | 可选 | 默认 `true`；设为 `false` 可禁用 |

---

## 三、常见 CLI 无头调用约定（供测试与排障）

- **DSH (`dsh-cli`)**：软件默认执行 `cmd.exe /c "<dsh.cmd>" --profile headless --json --permission-mode <read-only|workspace-write> -`，并从 `stdin` 传入提示词；如需指定模型或覆盖参数，可通过 `env` 或 `customArgs` 指定。
- **WorkBuddy (`workbuddy-cn-cli` / `workbuddy-intl-cli`)**：软件使用 `node "<codebuddy-lite-wb.mjs>" -p --output-format stream-json --include-partial-messages --effort <effort> --permission-mode <plan|acceptEdits> --model <model>` 并通过 `stdin` 传入提示词。
- 写入 `custom-agents.json` 后，只需在 墨枢 InkNexus Studio 的 **「设置 → 本地 Agent CLI」** 点击 **「重新探测本机 CLI」**（或顶部工作空间弹窗点击 **「刷新检测」**），即可立即加载最新路径与模型列表。
