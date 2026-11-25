---
name: ai-drama-script-studio
description: 专攻 AI 短剧、AI 漫剧与沙雕短剧的一体化编剧与改编工作室。支持「从零独立原创完整剧本」与「基于短篇/长篇小说或大纲改编剧本」双入口；开写前强制执行节奏与逻辑预匹配，内置三大剧种模板——MiniMax-H3 常规仿真人 AI 短剧（ai-drama）、高奇观多季 AI 漫剧（comic-drama）、高频反转沙雕短剧（shadiao）。涵盖控算力资产表（固定角色/场景/声音槽位）、黄金前3集与单集秒级卡点纲、视听分集剧本、按需分镜表、视听体检与纯净 DOCX/TXT 导出。默认简体中文。不用于纯文字小说正文撰写。
metadata:
  version: "1.1.0"
---

# AI 短剧与沙雕短剧编剧工作室

面向红果、抖音、番茄等竖屏/横屏生态的 AI 短剧编剧与小说改编工作流。既可从零原创整季完整剧本，也可吃进已有小说正文或大纲（兼容 `webnovel-short-studio`、长篇三件套或外部任意底稿）完成视听重构。

## 核心原则：先对节奏与逻辑，守商业红线，再为 AI 产能写戏

1. **写前必过「节奏与逻辑预匹配门」**：不把小说直接缩成对话，也不盲目开写第 1 集。动笔前先对齐剧种、前 3–5 秒钩子、黄金前 3 集留存闭环、爽点/笑点逻辑自洽与集末卡点密度。
2. **守住红果 40× 分成生死线（视目标平台启用）**：上红果/短剧创作者中心冲最高画风分成系数（`40×`）的 AI 剧、漫剧与对白沙雕漫，**必须以多角色口型对白为主推进，单集旁白/心理独白（OS）占比严控 ≤ 20%（全剧超 20% 不得达到 3 集）**，防止被降档为 `10×` 动态解说漫剧（收益腰斩 4 倍）；抖音/推文旁白解说流合集可显式豁免。
3. **硬资产与硬卡点，松台词声口**：锁死角色/场景固定资产（控算力、防崩脸）与 MiniMax-H3 多人同框口型隔离；台词风格由本剧独立的「声口切片」定调，**绝不跨剧套用万能 AI 套话**。

## 双入口与阶段路由

按用户现有材料直接切入对应阶段（默认简体中文）：

| 阶段 | 适用场景 | 核心动作 | 必读参考 |
|---|---|---|---|
| `intake` | 仅有创意/选题简报，或刚丢进小说/大纲 | 判定入口（原创 / 短篇改编 / 长篇季播切片）与剧种（`ai-drama` / `comic-drama` / `shadiao`），执行**写前节奏与逻辑 5 问预匹配** | [adaptation-and-pacing.md](references/adaptation-and-pacing.md) |
| `bible` | 逻辑与节奏方向已对齐 | 输出 `00_季播总案与资产表.md`：剧集总案、控算力固定资产表（`@CHAR / @LOC / @PROP / @VOICE`）与单剧声口切片 | [genre-templates.md](references/genre-templates.md)、[production-and-assets.md](references/production-and-assets.md) |
| `outline` | 资产与总案已定，排整季分集 | 生成 `01_分集卡点纲.md`：黄金前 3 集精细卡点 + 全季每集冲突、情绪转折、爽点/笑点维度切换与集末硬钩子 | [adaptation-and-pacing.md](references/adaptation-and-pacing.md) |
| `script` | 撰写完整视听分集剧本 | 逐集或按批撰写 `剧本/第XXX集_集名.md`（优先先试写第 1–3 集校准手感与时长，确认后批量推进） | [genre-templates.md](references/genre-templates.md) |
| `storyboard` | 需要直接喂给 MiniMax-H3 / 即梦 / 火山剧创 | 按需将指定集数拆解为可执行的逐镜视听表（含原生对白、环境音、肌肉微表情与资产槽位引用） | [production-and-assets.md](references/production-and-assets.md) |
| `check` & `export` | 剧本自检与交付送审/进组 | 运行 `lint_script.py` 体检时长、台词长度、不可拍心理词与切场成本；用 `export_drama.py` 导出纯净 `.docx` / `.txt` | [production-and-assets.md](references/production-and-assets.md) |

## 三大内置剧种与生产后端

| 剧种 (`--genre`) | 典型平台与爆款气质 | 单集节奏与镜头特征 | 适配要点 |
|---|---|---|---|
| **`ai-drama`**（常规 AI 写实/剧情短剧，默认适配 **MiniMax-H3**） | 红果 AI 剧热播向：年代创业生活流、历史团队季播、都市逆袭/萌宝 | 60–90 秒/集；充分利用 MiniMax-H3 **5–15 秒原生音画同步与中文口型对白**（约 8–14 镜/集） | 强生活细节与真实情绪，严控常驻角色（3–8 人）与单集场景（1–2 处），防“烧心憋屈” |
| **`comic-drama`**（2D/3D 高奇观 AI 漫剧） | 红果漫剧霸榜向：规则怪谈、末世求生、玄幻修仙、系统脑洞多季连载 | 60–120 秒/集；强调视觉奇观、系统弹窗/异象具象化、动作定格与旁白压迫感 | 放大真人拍不起的大场面与战力/规则可视化，按大地图规划多季扩展钩子 |
| **`shadiao`**（沙雕短剧 / 沙雕漫） | 双子轨：**红果 40× 快切沙雕漫**（PNG主角+SVG白人偶切脸+HUD贴纸，旁白≤20%）或 **抖音/推文旁白沙雕动画**（熊猫头/Q版高能预告+高旁白合集） | 70–95 秒/集（快切 2–4 秒/镜，约 18–25 镜），或 2–15 分钟合集；每 10–15 秒一个「预期违背」包袱 | 脸谱化鲜明人设、固定切脸码、一本正经胡说八道、魔性音效/Foley 与合规谐音梗；彻底抛弃慢热写实感 |

## 快速工作流

### 1. 初始化短剧项目

```text
python <skill-dir>/scripts/init_drama_project.py \
  --root <项目根> \
  --title <剧名> \
  --genre <ai-drama|comic-drama|shadiao> \
  --entry <original|adapt-short|adapt-long> \
  --backend <minimax-h3|jimeng|general>
```

（若上游有 `webnovel-market-radar` 的 `选题简报.md` 或已有小说/大纲路径，可通过 `--source-ref <路径>` 记录溯源。）

### 2. 写前预匹配 → 资产圣经 → 试写黄金前 3 集

1. 读 [adaptation-and-pacing.md](references/adaptation-and-pacing.md)：完成**节奏与逻辑 5 问预匹配**；若原小说/创意节奏偏平、钩子太晚或逻辑发虚，先给出具体改造方案经用户拍板。
2. 读 [genre-templates.md](references/genre-templates.md) 与 [production-and-assets.md](references/production-and-assets.md)：填妥 `00_季播总案与资产表.md`（含固定资产 ID `@CHAR-01`、`@LOC-01`、`@VOICE-01` 与 1 段本剧声口定调切片）及 `01_分集卡点纲.md`。
3. 先写 **第 1–3 集**（`剧本/第001集_集名.md` 至 `第003集`），验证前 3 秒开屏钩子、单集时长体感与人物嘴感后再批量推进后续集数。

### 3. 剧本视听体检与纯净导出

每完成一批集数后运行客观体检镜子：

```text
python <skill-dir>/scripts/lint_script.py --dir <项目根>/剧本 --genre <ai-drama|comic-drama|shadiao> --backend <minimax-h3|jimeng|general>
```

确认无硬伤后导出给制作组或投稿审核：

```text
python <skill-dir>/scripts/export_drama.py --root <项目根> --out-docx <交付>/<剧名>_剧本.docx --out-txt <交付>/<剧名>_纯文本.txt --title <剧名>
```
