#!/usr/bin/env python3
"""Audio-visual pacing, Hongguo 40x narration-ratio gate, and MiniMax-H3 cost mirror.

Supports both standard `[镜01｜0-7s]` format and production pipeline formats:
- `### Shot 01 | 124帧 (5.17s)` with `- [精确对白文本]:` / `- [发声角色声纹ID ...]:`
- `### 【镜 01｜00:00–00:03（3秒）】` with `说话人声纹 + 完整台词`
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


CJK_RE = re.compile(r"[\u4e00-\u9fff]")
SCENE_HEADER_RE = re.compile(r"^(?:#{2,4}\s*)?(?:场\s*\d+|场景\s*\d+|【?场次\s*\d+|Scene\s*\d+)", re.I)
SCENE_ID_RE = re.compile(r"(?:@LOC-\d+|scene_\d+|SCENE-\d+)")
CHAR_ID_RE = re.compile(r"(?:@CHAR-\d+|char_\d+|CHAR-\d+)")
ANY_ASSET_RE = re.compile(r"(?:@(?:CHAR|LOC|PROP|VOICE)-\d+|(?:char|scene|prop|voice_char)_\d+|(?:CHAR|SCENE|PROP|SVG-DOLL)-\d+)")

# Matches 3 real shot header styles:
# 1. [镜01｜0-7s｜...]  2. ### Shot 01 | 124帧 (5.17s)  3. ### 【镜 01｜00:00–00:03（3秒）｜...】
SHOT_RANGE_SEC_RE = re.compile(r"(?:镜\s*\d+|集末卡点|卡点|Shot\s*\d+)[^\n]*?(?<!:)(\d+)\s*[-–—~]\s*(\d+)\s*(?:s|秒)", re.I)
SHOT_MMSS_RE = re.compile(r"(?:镜\s*\d+|Shot\s*\d+)[^\n]*?(\d{2}):(\d{2})\s*[-–—~]\s*(\d{2}):(\d{2})", re.I)
SHOT_PAREN_SEC_RE = re.compile(r"(?:Shot\s*\d+|镜\s*\d+)[^\n]*?[（(]\s*(\d+(?:\.\d+)?)\s*(?:s|秒)\s*[）)]", re.I)
SHOT_GENERIC_RE = re.compile(r"^(?:#{2,4}\s*)?\*{0,2}\s*[\[【]?\s*(?:Shot\s*\d+|镜\s*\d+|集末卡点)", re.I)
TOTAL_SEC_META_RE = re.compile(r"(?:\[总秒数\]|总时长)[：:]\s*\*?\*?(\d+(?:\.\d+)?)\s*(?:秒|s)?", re.I)

SPOKEN_QUOTE_RE = re.compile(r"“([^”\n]+)”|「([^」\n]+)」|\"([^\"\n]+)\"")
EXACT_DIALOGUE_LINE_RE = re.compile(r"^(?:[-*]\s*)?\[精确对白文本\][：:]\s*(.+)$")
VOICE_LINE_RE = re.compile(r"^(?:[-*]\s*)?\[发声角色声纹ID[^\]]*\][：:]\s*(.+)$")
SPEAKER_DIALOGUE_LINE_RE = re.compile(r"^(?:[-*]\s*)?\*{0,2}说话人声纹\s*\+\s*完整台词\*{0,2}[：:]\s*(.+)$")
VISUAL_LINE_RE = re.compile(r"^(?:[-*]\s*)?(?:\*{0,2})?(?:\[画面[^\]]*\]|画面(?:与[^：:]+)?|镜头|动作|视觉|特写)[：:]")
CLIFFHANGER_HINT_RE = re.compile(r"集末卡点|卡点|钩子|切黑屏|下集预告|未完待续|黑屏|悬念|强断章|断章")
NARRATOR_MARKER_RE = re.compile(r"voice_narrator|旁白|画外音|内心独白|心声|\bOS\b", re.I)
MOUTH_LOCK_RE = re.compile(r"闭嘴|张嘴|开口发声|发声")

UNFILMABLE_MENTAL_RE = re.compile(
    r"内心(?:充满|翻涌|冷笑|暗喜|震惊|挣扎|崩溃|无比)|"
    r"心里(?:暗想|盘算|明白|清楚|恨不得|冷笑)|"
    r"暗自(?:盘算|决定|下定决心|庆幸|发誓)|"
    r"心中涌起|看穿了一切|早已料到|复杂的思绪|意识到自己"
)

NOTICE_TEXT = (
    "本报告为 AI 短剧视听节奏、红果 40× 旁白红线与算力成本体检镜子，不是必须清零的硬考题；"
    "合理的艺术留白、快嘴连珠炮包袱或特殊场面请结合剧种手感保留。"
)


@dataclass
class Advisory:
    code: str
    line: int
    excerpt: str
    suggestion: str


def natural_sort_key(path: Path) -> list[int | str]:
    parts = re.split(r"(\d+)", path.name)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def parse_shot_timing(line: str) -> tuple[bool, float | None, float | None]:
    """Return (is_shot_header, shot_duration_sec, timeline_end_sec)."""
    if not SHOT_GENERIC_RE.match(line):
        return False, None, None
    m_mmss = SHOT_MMSS_RE.search(line)
    if m_mmss:
        t1 = int(m_mmss.group(1)) * 60 + int(m_mmss.group(2))
        t2 = int(m_mmss.group(3)) * 60 + int(m_mmss.group(4))
        return True, float(max(0, t2 - t1)), float(t2)
    m_range = SHOT_RANGE_SEC_RE.search(line)
    if m_range:
        t1, t2 = int(m_range.group(1)), int(m_range.group(2))
        return True, float(max(0, t2 - t1)), float(t2)
    m_paren = SHOT_PAREN_SEC_RE.search(line)
    if m_paren:
        return True, float(m_paren.group(1)), None
    return True, None, None


def analyze_episode(
    path: Path,
    genre: str = "ai-drama",
    backend: str = "minimax-h3",
    allow_high_narration: bool = False,
) -> tuple[list[Advisory], dict[str, Any]]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    lines = text.splitlines()
    advisories: list[Advisory] = []

    speech_limit = 46 if genre == "shadiao" else 38
    cps = 5.6 if genre == "shadiao" else 4.7
    min_dur, max_dur = {
        "ai-drama": (48.0, 115.0),
        "comic-drama": (50.0, 125.0),
        "shadiao": (45.0, 130.0),
    }[genre]

    explicit_total_sec: float | None = None
    m_total = TOTAL_SEC_META_RE.search(text[:800])
    if m_total:
        explicit_total_sec = float(m_total.group(1))

    scene_headers = 0
    unique_scenes: set[str] = set()
    shots = 0
    sum_shot_dur = 0.0
    max_timeline_end = 0.0

    spoken_lines = 0
    spoken_cjk_total = 0
    narrator_cjk_total = 0
    long_speech_lines = 0
    unfilmable_hits = 0
    all_assets: set[str] = set()

    # Per-shot state for MiniMax-H3 checks and voice attribution
    cur_shot_line = 0
    cur_shot_assets: set[str] = set()
    cur_shot_chars: set[str] = set()
    cur_shot_visual_text = ""
    cur_shot_is_narrator = False
    mouth_lock_missing = 0

    def flush_shot() -> None:
        nonlocal mouth_lock_missing
        if cur_shot_line <= 0:
            return
        if backend == "minimax-h3":
            visual_assets = {a for a in cur_shot_assets if not (a.startswith("@VOICE-") or a.startswith("voice_"))}
            if len(visual_assets) > 9 or len(cur_shot_assets) > 12:
                advisories.append(
                    Advisory(
                        "minimax_too_many_assets",
                        cur_shot_line,
                        f"单镜引用 {len(cur_shot_assets)} 项资产（视觉资产 {len(visual_assets)} 项）",
                        "超过 MiniMax-H3 单次 12 参考槽位（≤9 图）建议上限；建议拆分正反打镜头，单镜保持 2–3 个核心主体。",
                    )
                )
            if len(cur_shot_chars) >= 2 and cur_shot_visual_text and not MOUTH_LOCK_RE.search(cur_shot_visual_text):
                mouth_lock_missing += 1

    for idx, raw in enumerate(lines, start=1):
        s = raw.strip()
        if not s:
            continue

        if SCENE_HEADER_RE.match(s):
            scene_headers += 1
        unique_scenes.update(SCENE_ID_RE.findall(s))

        is_shot, s_dur, s_end = parse_shot_timing(s)
        if is_shot:
            flush_shot()
            shots += 1
            cur_shot_line = idx
            cur_shot_assets = set()
            cur_shot_chars = set()
            cur_shot_visual_text = ""
            cur_shot_is_narrator = False
            if s_dur is not None:
                sum_shot_dur += s_dur
                if backend == "minimax-h3" and s_dur > 15.0:
                    advisories.append(
                        Advisory(
                            "minimax_shot_over_15s",
                            idx,
                            s[:60],
                            f"单镜标注时长 {s_dur:.1f} 秒，超过 MiniMax-H3 单镜 15 秒上限；建议拆成两个连贯镜头。",
                        )
                    )
            if s_end is not None and s_end > max_timeline_end:
                max_timeline_end = s_end

        assets = ANY_ASSET_RE.findall(s)
        if assets:
            all_assets.update(assets)
            if cur_shot_line > 0:
                cur_shot_assets.update(assets)
        chars_in_line = CHAR_ID_RE.findall(s)
        if chars_in_line and cur_shot_line > 0:
            cur_shot_chars.update(chars_in_line)

        m_voice = VOICE_LINE_RE.match(s)
        if m_voice:
            cur_shot_is_narrator = bool(NARRATOR_MARKER_RE.search(m_voice.group(1)))
            continue

        if VISUAL_LINE_RE.match(s):
            if cur_shot_line > 0:
                cur_shot_visual_text += " " + s
            for m_u in UNFILMABLE_MENTAL_RE.finditer(s):
                unfilmable_hits += 1
                advisories.append(
                    Advisory(
                        "unfilmable_mental_direction",
                        idx,
                        m_u.group(0),
                        "画面指令出现抽象心理词，视频模型难以呈现；请用「肌肉导演法」改写为可见微表情/动作/道具特写，或移入声音 OS 轨。",
                    )
                )
            continue

        # Format A: `- [精确对白文本]: ...` (no quotes required)
        m_exact = EXACT_DIALOGUE_LINE_RE.match(s)
        if m_exact:
            utterance = m_exact.group(1).strip()
            q_cjk = len(CJK_RE.findall(utterance))
            if q_cjk > 0:
                spoken_lines += 1
                spoken_cjk_total += q_cjk
                if cur_shot_is_narrator:
                    narrator_cjk_total += q_cjk
                if q_cjk > speech_limit:
                    long_speech_lines += 1
                    advisories.append(
                        Advisory(
                            "speech_line_too_long",
                            idx,
                            utterance[:45] + "...",
                            f"单句对白达 {q_cjk} 字（建议 ≤{speech_limit} 字），易挡竖屏字幕或导致口型漂移；建议拆分。",
                        )
                    )
            continue

        # Format B/C: quoted spoken dialogue (including `说话人声纹 + 完整台词`)
        # Skip header summary lines (e.g. `**本集校验小计**`)
        if s.startswith("**本集校验") or s.startswith("- **本集"):
            continue
        quotes = list(SPOKEN_QUOTE_RE.finditer(s))
        if quotes:
            # Check if line context indicates narrator/OS/心声
            first_q_start = quotes[0].start()
            prefix = s[:first_q_start]
            is_narr_line = cur_shot_is_narrator or bool(NARRATOR_MARKER_RE.search(prefix))
            for m_q in quotes:
                qt = m_q.group(1) or m_q.group(2) or m_q.group(3) or ""
                q_cjk = len(CJK_RE.findall(qt))
                if q_cjk == 0:
                    continue
                # Ignore tiny sound-effect quotes like “啪！” / “叮当！” on Foley lines
                if ("音效" in prefix or "Foley" in prefix) and q_cjk <= 4:
                    continue
                spoken_lines += 1
                spoken_cjk_total += q_cjk
                if is_narr_line:
                    narrator_cjk_total += q_cjk
                if q_cjk > speech_limit:
                    long_speech_lines += 1
                    advisories.append(
                        Advisory(
                            "speech_line_too_long",
                            idx,
                            qt[:45] + "...",
                            f"单句对白达 {q_cjk} 字（建议 ≤{speech_limit} 字），竖屏字幕易挡脸且易导致配音断气或口型漂移；建议拆为来回短句。",
                        )
                    )

    flush_shot()

    if backend == "minimax-h3" and mouth_lock_missing >= 2:
        advisories.append(
            Advisory(
                "minimax_missing_mouth_lock",
                1,
                f"本集有 {mouth_lock_missing} 个多人同框镜头未显式标注「张嘴发声 / 闭嘴静态」",
                "MiniMax-H3 多人同框时，建议在画面描述中显式写明谁“张嘴清晰发声”、其余同框角色“闭嘴静态”，避免多人乱动嘴串音。",
            )
        )

    narrator_ratio = round(narrator_cjk_total / spoken_cjk_total, 3) if spoken_cjk_total > 0 else 0.0
    if (not allow_high_narration) and spoken_cjk_total >= 40 and narrator_ratio > 0.20:
        advisories.append(
            Advisory(
                "hongguo_narration_over_20pct",
                1,
                f"旁白/心声/OS 字数占比 {narrator_ratio*100:.1f}%（{narrator_cjk_total}/{spoken_cjk_total} 字），超过红果 20% 降档红线",
                "红果规则：单集旁白/独白超 20% 且全剧 ≥3 集将从 40× 漫剧降档为 10× 动态解说漫剧（收益腰斩 4 倍）；建议将部分旁白改为角色现场口型对白。若投抖音旁白流可传 --allow-high-narration。",
            )
        )

    spoken_est_sec = round(spoken_cjk_total / cps + max(shots, spoken_lines) * 1.1, 1)
    if explicit_total_sec is not None:
        est_sec = explicit_total_sec
    elif max_timeline_end > 0:
        est_sec = max_timeline_end
    elif sum_shot_dur > 0:
        est_sec = round(sum_shot_dur, 1)
    else:
        est_sec = spoken_est_sec

    if spoken_cjk_total >= 40 or shots >= 3:
        if est_sec < 30.0:
            advisories.append(
                Advisory(
                    "below_platform_30s_floor",
                    1,
                    f"估测时长 {est_sec:.1f}s < 红果单集 30 秒过审硬下限",
                    "红果后台要求单集时长至少 ≥ 30 秒，建议扩充本集冲突回合。",
                )
            )
        elif est_sec < min_dur:
            advisories.append(
                Advisory(
                    "duration_too_short",
                    1,
                    f"估测时长约 {est_sec:.1f}s（口播 {spoken_cjk_total} 字 / {shots} 镜）",
                    f"低于 {genre} 常规单集目标下限（约 {min_dur:.0f}s）；请核对冲突与爽点/包袱是否展开充分。",
                )
            )
        elif est_sec > max_dur:
            advisories.append(
                Advisory(
                    "duration_too_long",
                    1,
                    f"估测时长约 {est_sec:.1f}s（口播 {spoken_cjk_total} 字 / {shots} 镜）",
                    f"高于 {genre} 常规单集目标上限（约 {max_dur:.0f}s）；可考虑拆进下一集并在高潮处卡点。",
                )
            )

    scene_count = max(scene_headers, len(unique_scenes))
    if scene_count > 3:
        advisories.append(
            Advisory(
                "too_many_scenes",
                1,
                f"单集涉及 {scene_count} 处场景",
                "单集场景偏多易拉高算力成本并打散节奏；如非蒙太奇快剪，建议压缩到 1–2 个复用主场景。",
            )
        )

    tail_text = "\n".join(lines[-12:])
    has_cliffhanger = bool(CLIFFHANGER_HINT_RE.search(tail_text)) or bool(re.search(r"[！？!?]", tail_text))
    if (shots >= 3 or spoken_lines >= 4) and not has_cliffhanger:
        advisories.append(
            Advisory(
                "missing_cliffhanger_hint",
                max(1, len(lines) - 2),
                "集尾未检测到明确卡点/强钩子标点",
                "建议确认最后一镜是否停在悬念/反转/强包袱卡点上，方便拉起下集连播。",
            )
        )

    metrics: dict[str, Any] = {
        "genre": genre,
        "backend": backend,
        "scenes": scene_count,
        "shots": shots,
        "spoken_lines": spoken_lines,
        "spoken_cjk": spoken_cjk_total,
        "narrator_cjk": narrator_cjk_total,
        "narrator_os_ratio": narrator_ratio,
        "est_duration_sec": round(est_sec, 1),
        "unique_assets": len(all_assets),
        "long_speech_lines": long_speech_lines,
        "unfilmable_mental_hits": unfilmable_hits,
        "mouth_lock_missing_shots": mouth_lock_missing,
        "advisories": len(advisories),
    }
    return advisories, metrics


def discover_scripts(directory: Path) -> list[Path]:
    excluded = {"00_季播总案与资产表", "01_分集卡点纲", "readme", "license"}
    files: list[Path] = []
    for p in sorted(directory.glob("*.md"), key=natural_sort_key):
        if p.stem.lower() in excluded or p.stem.startswith("00_"):
            continue
        files.append(p)
    return files


def main() -> int:
    parser = argparse.ArgumentParser(
        description="AI 短剧视听节奏、红果 40× 旁白红线与 MiniMax-H3 算力成本体检镜子（非硬考题）。"
    )
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--file", type=Path, help="单集剧本 Markdown 文件")
    src.add_argument("--dir", type=Path, help="剧本目录（批量体检全季并核对全季总时长与 40× 红线）")
    parser.add_argument(
        "--genre",
        choices=("ai-drama", "comic-drama", "shadiao"),
        default="ai-drama",
        help="剧种模板（默认 ai-drama）",
    )
    parser.add_argument(
        "--backend",
        choices=("minimax-h3", "jimeng", "general"),
        default="minimax-h3",
        help="制作后端（默认 minimax-h3）",
    )
    parser.add_argument(
        "--allow-high-narration",
        action="store_true",
        help="抖音/推文旁白解说流豁免红果 20%% 旁白降档提醒",
    )
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    args = parser.parse_args()

    targets: list[Path] = []
    if args.file:
        p = args.file.expanduser().resolve()
        if not p.is_file():
            print(f"ERROR: File not found: {p}", file=sys.stderr)
            return 2
        targets = [p]
    else:
        d = args.dir.expanduser().resolve()
        if not d.is_dir():
            print(f"ERROR: Directory not found: {d}", file=sys.stderr)
            return 2
        targets = discover_scripts(d)
        if not targets:
            print(f"ERROR: No script Markdown files found in: {d}", file=sys.stderr)
            return 2

    results: list[dict[str, Any]] = []
    total_sec = 0.0
    over_20_eps = 0
    for fp in targets:
        advs, m = analyze_episode(
            fp,
            genre=args.genre,
            backend=args.backend,
            allow_high_narration=args.allow_high_narration,
        )
        total_sec += float(m["est_duration_sec"])
        if float(m["narrator_os_ratio"]) > 0.20:
            over_20_eps += 1
        results.append({"file": str(fp), "metrics": m, "advisories": [asdict(a) for a in advs]})

    season_advisories: list[str] = []
    if len(results) >= 3:
        total_min = round(total_sec / 60.0, 1)
        if (not args.allow_high_narration) and over_20_eps >= 3:
            season_advisories.append(
                f"[SEASON_ADVISORY] (season_hongguo_tier_drop_risk): 全季有 {over_20_eps} 集旁白/OS 超过 20%，已触发红果「≥3集降档为 10× 动态解说漫剧」风险线！"
            )
        if total_min < 20.0:
            season_advisories.append(
                f"[SEASON_INFO]: 当前已写 {len(results)} 集累计约 {total_min} 分钟（红果首传与双周激励门槛 ≥20 分钟，终极评奖门槛 ≥30 分钟）。"
            )

    if args.json:
        print(
            json.dumps(
                {
                    "notice": NOTICE_TEXT,
                    "episodes": len(results),
                    "total_est_minutes": round(total_sec / 60.0, 1),
                    "episodes_over_20pct_narration": over_20_eps,
                    "season_advisories": season_advisories,
                    "results": results,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(NOTICE_TEXT)
        if len(results) > 1:
            print(
                f"season_summary episodes={len(results)} total_est_min={total_sec/60.0:.1f} "
                f"eps_over_20pct_narration={over_20_eps}"
            )
            for sa in season_advisories:
                print(f"  {sa}")
        for item in results:
            m = item["metrics"]
            print(f"\nfile={item['file']}")
            print(
                "metrics "
                f"genre={m['genre']} backend={m['backend']} scenes={m['scenes']} shots={m['shots']} "
                f"spoken_cjk={m['spoken_cjk']} narrator_os={m['narrator_os_ratio']*100:.1f}% "
                f"est_sec={m['est_duration_sec']} assets={m['unique_assets']} "
                f"long_lines={m['long_speech_lines']} unfilmable={m['unfilmable_mental_hits']} "
                f"advisories={m['advisories']}"
            )
            for a in item["advisories"]:
                print(f"  [ADVISORY] line {a['line']} ({a['code']}): 「{a['excerpt']}」 -> {a['suggestion']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
