#!/usr/bin/env python3
"""Initialize an AI short drama / comic drama / shadiao script project non-destructively."""

from __future__ import annotations

import argparse
from pathlib import Path


GENRE_META: dict[str, tuple[str, str, str]] = {
    "ai-drama": (
        "常规仿真人 / 写实 AI 短剧（红果 AI 剧热播向）",
        "60–90 秒/集（生活流可放宽至 75–110 秒）｜ 8–14 个连贯音画镜/集",
        "强烟火生活质感、具体手艺/赚钱细节、原生口型短对白、情绪到位不烧心",
    ),
    "comic-drama": (
        "2D / 3D 高奇观 AI 漫剧（红果漫剧霸榜向）",
        "60–120 秒/集 ｜ 强奇观定格 + 系统弹窗/异象特效 + 旁白与画面交错",
        "放大真人拍不起的奇观大场面、战力/规则屏幕可视化、多季大地图扩展钩子",
    ),
    "shadiao": (
        "沙雕短剧 / 沙雕动画（高频反转传播向）",
        "60–120 秒/集 ｜ 每 10–15 秒一个「预期违背」包袱或毒舌金句",
        "脸谱化鲜明人设、一本正经胡说八道、1.15x+ 快语速/方言配音、魔性音效骤停与花字定格",
    ),
}

ENTRY_META: dict[str, str] = {
    "original": "original（从零独立原创整季剧本）",
    "adapt-short": "adapt-short（短篇小说/短纲 1–5 万字改编：爆点前置 + 细节视听展开）",
    "adapt-long": "adapt-long（长篇小说/长纲季播切片：单季打透 1 条主线 + 季末留新地图钩子）",
}

BACKEND_META: dict[str, str] = {
    "minimax-h3": "minimax-h3（MiniMax H3 / Hailuo 3：5–15 秒原生音画同步与中文口型、9:16 2K、最多 12 参考资产含 ≤9 图）",
    "jimeng": "jimeng（即梦 / 火山剧创 / 剪映流水线：先锁三视图静帧与角色资产，再图生视频配音合成）",
    "general": "general（通用 AI 短剧/漫剧/沙雕剪辑流水线）",
}


def safe_root(raw: str) -> Path:
    root = Path(raw).expanduser().resolve()
    if root.parent == root:
        raise ValueError("Refusing to initialize a filesystem root.")
    return root


def build_templates(
    title: str,
    genre: str,
    entry: str,
    backend: str,
    episodes: str,
    source_ref: str,
) -> dict[str, str]:
    genre_label, pacing_hint, style_focus = GENRE_META[genre]
    entry_label = ENTRY_META[entry]
    backend_label = BACKEND_META[backend]
    ep_display = episodes.strip() or ("20–40 集（单季闭环）" if genre == "shadiao" or entry == "adapt-short" else "60–100 集（第一季）")
    src_line = source_ref.strip() or "无（原创直立项；若有上游小说/大纲或 webnovel-market-radar 选题简报可在此写明路径）"

    bible_doc = f"""# {title} · 季播总案与控算力资产表

- 剧名：{title}
- 剧种模板：`{genre}` · {genre_label}
- 立项入口：`{entry}` · {entry_label}
- 目标制作后端：`{backend}` · {backend_label}
- 规划集数：{ep_display}
- 单集节奏基准：{pacing_hint}
- 来源素材 / 上游雷达简报：{src_line}

---

## 1. 写前「节奏与逻辑 5 问预匹配」结论

- **一句话高概念（3秒懂画面与爽点/笑点）**：[待填]
- **开屏前 3–5 秒钩子画面**：[待填：直接砸出最炸冲突、奇观或离谱反差]
- **核心矛盾与自洽破局逻辑（防降智、防烧心）**：[待填]
- **黄金前 3 集留存闭环**：
  - 第 1 集：[待填：3秒入局 + 核心困境/奇观 + 硬卡点]
  - 第 2 集：[待填：立刻兑现首个小反杀/笑点/奇观验证 + 暴露更高赌注]
  - 第 3 集：[待填：抛出贯通全季的大目标或终极悬念]
- **跨集爽感/笑点维度轮换规划**：[待填：至少规划 3–4 种不同维度的交替推进，防同质复读]
- **本季终局与下一季扩展钩子（多季连载按需）**：[待填]

---

## 2. 控算力固定资产圣经（全剧统一用 ID 引用，严控崩脸与切场）

### 2.1 核心角色资产表（建议短期 3–5 人，季播 5–8 人）

| 资产ID | 角色名 | 定位 | 固定外貌与标志穿搭（全季锁定） | 性格底色与反差 | 对应声线ID |
|---|---|---|---|---|---|
| `@CHAR-01` |  | 主角 |  |  | `@VOICE-01` |
| `@CHAR-02` |  | 核心对手/搭档 |  |  | `@VOICE-02` |
| `@CHAR-03` |  | 关键配角 |  |  | `@VOICE-03` |

### 2.2 高频复用主场景表（建议 4–6 处，单集严控 1–2 处）

| 资产ID | 场景名 | 空间布局、时代质感与固定主色调/光源 | 常驻事件功能 |
|---|---|---|---|
| `@LOC-01` |  |  |  |
| `@LOC-02` |  |  |  |
| `@LOC-03` |  |  |  |

### 2.3 核心道具 / 奇观特效资产表

| 资产ID | 物件/特效名 | 具象视觉细节（供特写或 UI 弹窗提示词复用） | 剧情功能 |
|---|---|---|---|
| `@PROP-01` |  |  |  |
| `@PROP-02` |  |  |  |

### 2.4 角色声线与听觉风格表

| 声线ID | 对应角色 | 音色/年龄/方言特征 | 语速与情绪刻度 | 标志口癖/说话习惯 |
|---|---|---|---|---|
| `@VOICE-01` | `@CHAR-01` |  |  |  |
| `@VOICE-02` | `@CHAR-02` |  |  |  |

---

## 3. 本剧专属「台词与视听声口切片」（防千剧一面）

> 剧种侧重：{style_focus}
> 试写第 1 集前 3 个镜头并经确认后，粘贴 150–250 字最对味的台词+画面片段于此，作为全季统一调音叉。

[待试写确认后填入]
"""

    outline_doc = f"""# {title} · 分集爽点与卡点总纲

- 剧种：`{genre}` ｜ 后端：`{backend}` ｜ 规划集数：{ep_display}

## 黄金前 3 集精细卡点

| 集数 | 主场景 | 0–3 秒开屏钩子 | 核心冲突与反杀/包袱 | 爽点/笑点维度 | 集末硬卡点钩子 |
|---|---|---|---|---|---|
| 第001集 | `@LOC-01` |  |  |  |  |
| 第002集 | `@LOC-01` |  |  |  |  |
| 第003集 | `@LOC-02` |  |  |  |  |

## 后续分集节奏总表（每 5–10 集须切换爽点/笑点维度）

| 集数范围 / 单集 | 复用主场景 | 本集核心推进与情绪落差 | 爽点/笑点维度 | 埋/收线索 | 集末钩子 |
|---|---|---|---|---|---|
| 第004集 |  |  |  |  |  |
| 第005集 |  |  |  |  |  |
"""

    return {
        "00_季播总案与资产表.md": bible_doc,
        "01_分集卡点纲.md": outline_doc,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="初始化 AI 短剧 / 漫剧 / 沙雕短剧项目骨架与资产圣经。"
    )
    parser.add_argument("--root", required=True, help="短剧项目根目录")
    parser.add_argument("--title", default="未命名AI短剧", help="剧名")
    parser.add_argument(
        "--genre",
        choices=("ai-drama", "comic-drama", "shadiao"),
        default="ai-drama",
        help="剧种模板：ai-drama（写实AI剧）/ comic-drama（高奇观漫剧）/ shadiao（沙雕短剧）",
    )
    parser.add_argument(
        "--entry",
        choices=("original", "adapt-short", "adapt-long"),
        default="original",
        help="立项入口：original / adapt-short / adapt-long",
    )
    parser.add_argument(
        "--backend",
        choices=("minimax-h3", "jimeng", "general"),
        default="minimax-h3",
        help="目标生成后端（默认 minimax-h3）",
    )
    parser.add_argument("--episodes", default="", help="可选规划集数说明")
    parser.add_argument("--source-ref", default="", help="可选原著小说/大纲/雷达简报路径")
    parser.add_argument("--dry-run", action="store_true", help="仅预览不写盘")
    args = parser.parse_args()

    try:
        root = safe_root(args.root)
    except ValueError as exc:
        parser.error(str(exc))

    dirs = [root / "剧本", root / "分镜", root / "交付"]
    if not args.dry_run:
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)

    title = args.title.strip() or "未命名AI短剧"
    files = build_templates(
        title=title,
        genre=args.genre,
        entry=args.entry,
        backend=args.backend,
        episodes=args.episodes,
        source_ref=args.source_ref,
    )

    created: list[Path] = []
    skipped: list[Path] = []
    for rel, content in files.items():
        dest = root / rel
        if dest.exists():
            skipped.append(dest)
            continue
        created.append(dest)
        if not args.dry_run:
            dest.write_text(content.rstrip() + "\n", encoding="utf-8")

    print(f"root={root}")
    print(f"genre={args.genre} entry={args.entry} backend={args.backend}")
    print(f"created={len(created)}")
    for p in created:
        print(f"  + {p.relative_to(root)}")
    print(f"skipped={len(skipped)}")
    for p in skipped:
        print(f"  = {p.relative_to(root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
