#!/usr/bin/env python3
"""Contextual prose craft, cadence, and visual-breathing linter (Chinese & English)."""

from __future__ import annotations

import argparse
import json
import re
import statistics
from dataclasses import asdict, dataclass
from pathlib import Path


CJK_RE = re.compile(r"[\u4e00-\u9fff]")
EN_WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")
BULLET_LINE_RE = re.compile(r"^\s*(?:[-*•]|\d+\.)\s+.+$")
SUBHEADING_RE = re.compile(r"^\s*#{2,6}\s+.+$")
SCENE_BREAK_RE = re.compile(r"^\s*(?:\*\s*\*\s*\*|-{3,}|⸻|✦\s*✦\s*✦)\s*$")
SENTENCE_SPLIT_ZH_RE = re.compile(r"[。！？!?…；;]+")
SENTENCE_SPLIT_EN_RE = re.compile(r"[.!?]+(?:\s+|$)")

# Spoken dialogue quotes vs inline scare quotes in Chinese prose
SPOKEN_QUOTE_ZH_RE = re.compile(
    r"(?:^|[：:，,]\s*)(?:“[^”]*”|「[^」]*」|『[^』]*』)"
    r"|(?:“[^”]{7,}”|「[^」]{7,}」|『[^』]{7,}』)"
    r"|(?:“[^”]*[。！？!?…，,、～—~][^”]*”|「[^」]*[。！？!?…，,、～—~][^」]*」)"
)
SCARE_QUOTE_ZH_RE = re.compile(r"(?<![：:])[“「]([^”」\s，。！？；：、]{1,5})[”」]")
BARE_DIALOGUE_ZH_RE = re.compile(r"^(?:“[^”]+”|「[^」]+」|『[^』]+』)$")
BARE_DIALOGUE_EN_RE = re.compile(r'^(?:"[^"]+"|“[^”]+”)$')
PRONOUN_ZH_RE = re.compile(r"[他她它](?:们|的)?")

# Narration-level Chinese template patterns (checked outside spoken dialogue)
FORBIDDEN_PATTERNS_ZH: list[tuple[str, re.Pattern[str], str]] = [
    (
        "ai_contrast_not_but",
        re.compile(r"不是[^，。！？；\n]{1,30}[，,]?\s*而是"),
        "旁白二元解释句式「不是……而是……」，建议删去否定前半句，直接写实际动作或眼前事物。",
    ),
    (
        "ai_contrast_rather_than",
        re.compile(r"与其说[^，。！？；\n]{1,30}[，,]?\s*不如说"),
        "旁白思辨腔「与其说……不如说……」，建议改为人物直观感受或动作细节。",
    ),
    (
        "ai_not_only_but_also",
        re.compile(r"这?不仅仅[是是一场次][^，。！？；\n]{1,30}[，,]?\s*更[是是一场次]"),
        "拔高汇报腔「这不仅仅是……更是……」，建议删除旁白拔高，用代价或后果体现分量。",
    ),
    (
        "ai_era_opening",
        re.compile(r"在(?:这个|那片|这座)[^，。！？\n]{2,20}的(?:时代|世界|大陆|社会|年代)里"),
        "纪录片解说腔「在这个……的时代/世界里」，建议直接从器物、天气或手头事务切入。",
    ),
    (
        "ai_named_metaphor",
        re.compile(r"名为[「“\"']?[^」”\"'，。！？\n]{1,8}[」”\"']?的(?:种子|火焰|毒蛇|情绪|野心|恐惧|嫉妒|枷锁|深渊)"),
        "翻译腔隐喻「名为XX的种子/火焰/情绪」，建议改为具体生理反应或行为变化。",
    ),
    (
        "ai_pie_chart_expression",
        re.compile(r"三分[^，。！？\n]{1,8}[，、\s]*三分[^，。！？\n]{1,8}[，、\s]*(?:四分|还有)"),
        "扇形统计图式神态「三分……三分……四分……」，建议只保留一个最准确的动作细节。",
    ),
    (
        "ai_wheel_of_fate",
        re.compile(r"命运的齿轮(?:开始|悄然|在这一刻)?转动"),
        "总结陈词「命运的齿轮开始转动」，建议删去，让章末停在具体动作或未完局面上。",
    ),
    (
        "ai_indefinite_calque",
        re.compile(
            r"(?:一种|一股)(?:难以言喻|莫名|无形|说不出|奇异|异样|前所未有)的[^，。！？\n]{1,8}"
            r"|带着一种[^，。！？\n]{1,12}的(?:语气|神情|目光|姿态|口吻)"
        ),
        "英文不定冠词翻译腔「一种莫名的……/带着一种……的语气」，建议删去虚词直接白描。",
    ),
    (
        "ai_explanatory_tail",
        re.compile(r"[，,]\s*(?:仿佛在(?:证明|昭示|诉说|宣告|掩饰)|这(?:无疑)?意味着|显然已经说明)"),
        "句尾解释性尾巴，建议遵循「半句留白律」，动作落定即收句号，把余味留给读者。",
    ),
]

# High-frequency Chinese physical/atmospheric clichés
CLICHE_PATTERNS_ZH: list[tuple[str, re.Pattern[str], str]] = [
    (
        "cliche_smirk_arc",
        re.compile(r"嘴角(?:勾起|扬起|扯出)(?:一抹|一丝)?[^，。！？\n]{0,8}弧度"),
        "高频神态套话「嘴角勾起弧度」，建议换为贴合人物身份与手头活计的具体反应。",
    ),
    (
        "cliche_eye_flash",
        re.compile(r"眼(?:底|中|眸中|里)(?:闪过|掠过|划过)(?:一丝|一抹)(?:不易察觉的)?"),
        "高频眼神套话「眼底闪过一丝……」，限知视角下建议改为可见的停顿或视线转移。",
    ),
    (
        "cliche_knuckles_white",
        re.compile(r"(?:骨节|指节)(?:捏得|攥得|有些)?发白|指甲(?:深深)?(?:嵌进|掐进|刺入)(?:掌心|肉里)"),
        "通用生理套话「骨节发白/指甲嵌进肉里」，建议结合角色职业与随身物件重塑动作。",
    ),
    (
        "cliche_air_froze",
        re.compile(r"空气(?:仿佛|似乎)?(?:在这一刻)?(?:凝固|冻结)了|死一般的寂静"),
        "氛围概括套话「空气凝固/死一般的寂静」，建议写具体环境声响的变化或旁人动作停滞。",
    ),
    (
        "cliche_pupil_earthquake",
        re.compile(r"瞳孔(?:猛地|骤然|剧烈)?(?:一缩|地震|收缩)"),
        "高频套话「瞳孔一缩/地震」，建议改为失手、退步或呼吸微滞等真实应激反应。",
    ),
    (
        "cliche_in_some_sense",
        re.compile(r"某种意义上(?:来说|而言)?|从某种程度上"),
        "论文解释词「某种意义上/某种程度上」，旁白中建议直接删去。",
    ),
]

ECHO_WORDS_ZH: tuple[str, ...] = (
    "微微", "缓缓", "轻轻", "冷冷", "静静", "死死", "淡淡", "默默",
    "指尖", "仿佛", "似乎", "不由得", "下意识", "莫名", "叹了口气", "顿了顿",
)

# English fiction LLM tells & craft patterns
PATTERNS_EN: list[tuple[str, re.Pattern[str], str]] = [
    (
        "en_ai_not_but",
        re.compile(r"\bit was(?:n't| not) [^.!?;,\n]{2,40},\s*(?:it was|but rather)\b", re.I),
        "Binary LLM rhetorical contrast ('it was not X, it was Y'); state the concrete action or image directly.",
    ),
    (
        "en_ai_testament",
        re.compile(r"\ba testament to\b|\bpalpable tension\b|\bunspoken agreement\b", re.I),
        "High-frequency LLM abstract cliché; ground the moment in specific sensory or behavioral detail.",
    ),
    (
        "en_cliche_breath_held",
        re.compile(r"\blet out a breath [a-z]+ didn't know [a-z]+ was holding\b|\ba shiver ran down [a-z]+ spine\b", re.I),
        "Overused physical cliché; replace with a character-specific physical reaction.",
    ),
    (
        "en_filter_cluster",
        re.compile(r"\b(?:couldn't help but|could not help but|found (?:himself|herself|themselves) \w+ing)\b", re.I),
        "Narrative distance filter ('couldn't help but / found himself -ing'); render the action or thought directly.",
    ),
]


@dataclass
class LintIssue:
    level: str  # "error" or "warning"
    code: str
    line: int
    excerpt: str
    suggestion: str


def detect_language(text: str, requested: str = "auto") -> str:
    if requested in ("zh", "en"):
        return requested
    cjk = len(CJK_RE.findall(text))
    en_words = len(EN_WORD_RE.findall(text))
    if cjk == 0 and en_words > 0:
        return "en"
    if en_words > cjk * 2 and en_words >= 30:
        return "en"
    return "zh"


def strip_spoken_zh(para: str) -> str:
    """Remove spoken dialogue spans while keeping narration (and inline scare quotes)."""
    if BARE_DIALOGUE_ZH_RE.match(para):
        return ""
    return SPOKEN_QUOTE_ZH_RE.sub(" ", para)


def check_uniform_blocks(
    para_units: list[tuple[int, int, bool]],
    issues: list[LintIssue],
    lang: str,
) -> int:
    """Flag runs of 5+ medium-sized narrative paragraphs with almost uniform length ('豆腐块')."""
    band_low, band_high, max_stdev = ((65, 160, 22.0) if lang == "zh" else (50, 130, 18.0))
    unit_label = "汉字" if lang == "zh" else "words"
    streak: list[tuple[int, int]] = []
    flagged = 0

    def flush(run: list[tuple[int, int]]) -> None:
        nonlocal flagged
        if len(run) < 5:
            return
        sizes = [sz for _, sz in run]
        stdev = statistics.stdev(sizes) if len(sizes) >= 2 else 0.0
        if stdev <= max_stdev:
            flagged += 1
            start_line, end_line = run[0][0], run[-1][0]
            avg = round(statistics.mean(sizes), 1)
            msg = (
                f"连续 {len(run)} 段均为 {band_low}–{band_high} {unit_label}左右的等高段落（均长 {avg}，标准差 {stdev:.1f}），"
                "页面易显「豆腐块」沉闷感；建议穿插 1–2 行短动作段、单句气口或无旁白裸对白。"
                if lang == "zh"
                else f"{len(run)} consecutive paragraphs have nearly uniform medium length (mean {avg} {unit_label}, stdev {stdev:.1f}); "
                "vary paragraph silhouettes with crisp 1-line beats or bare dialogue exchanges."
            )
            issues.append(
                LintIssue(
                    "warning",
                    "uniform_paragraph_blocks",
                    start_line,
                    f"lines {start_line}-{end_line}",
                    msg,
                )
            )

    for line_no, size, is_bare_dialogue in para_units:
        if not is_bare_dialogue and band_low <= size <= band_high:
            streak.append((line_no, size))
        else:
            flush(streak)
            streak = []
    flush(streak)
    return flagged


def check_choppy_telegraph(
    para_records: list[tuple[int, int, bool]],
    issues: list[LintIssue],
    lang: str,
) -> int:
    """Detect reverse-AI-ness: mechanical runs of 12+ uniformly short non-dialogue paragraphs."""
    if lang != "zh":
        return 0
    streak: list[tuple[int, int]] = []
    flagged = 0

    def flush(run: list[tuple[int, int]]) -> None:
        nonlocal flagged
        if len(run) < 12:
            return
        sizes = [sz for _, sz in run]
        stdev = statistics.stdev(sizes) if len(sizes) >= 2 else 0.0
        if stdev <= 5.5:
            flagged += 1
            issues.append(
                LintIssue(
                    "warning",
                    "choppy_telegraph_uniformity",
                    run[0][0],
                    f"lines {run[0][0]}-{run[-1][0]}",
                    f"连续 {len(run)} 段非对白短段挤在 12–38 汉字（标准差 {stdev:.1f}），疑似过度切段造成的「AI 电报排骨体」；建议合并同类镜头恢复自然长短反差。",
                )
            )

    for line_no, size, has_dialogue in para_records:
        if (not has_dialogue) and 12 <= size <= 38:
            streak.append((line_no, size))
        else:
            flush(streak)
            streak = []
    flush(streak)
    return flagged


def analyze_file(
    path: Path,
    target_words: int | None = None,
    tolerance: float = 0.15,
    lang: str = "auto",
    profile: str = "standard",
) -> tuple[list[LintIssue], dict[str, int | float | str]]:
    text = path.read_text(encoding="utf-8", errors="replace")
    resolved_lang = detect_language(text, lang)
    lines = text.splitlines()
    issues: list[LintIssue] = []

    body_lines: list[tuple[int, str]] = []
    for idx, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        if not body_lines and stripped.startswith("# "):
            continue
        if SCENE_BREAK_RE.match(stripped):
            continue
        if SUBHEADING_RE.match(raw_line):
            issues.append(
                LintIssue(
                    "warning",
                    "subheading_in_prose",
                    idx,
                    stripped[:50],
                    "检测到章节内 Markdown 小标题；请确认是否为刻意采用的分节体例。"
                    if resolved_lang == "zh"
                    else "Detected Markdown subheading inside chapter prose; verify whether intentional.",
                )
            )
            continue
        if BULLET_LINE_RE.match(raw_line):
            issues.append(
                LintIssue(
                    "warning",
                    "bullet_point_in_prose",
                    idx,
                    stripped[:50],
                    "检测到列表项；请确认是否为角色阅读的文书、账目或其他有意排版。"
                    if resolved_lang == "zh"
                    else "Detected list bullet in prose; verify whether it represents an in-world document.",
                )
            )
        body_lines.append((idx, stripped))

    body_text = "\n".join(line for _, line in body_lines)
    cjk_count = len(CJK_RE.findall(body_text))
    en_word_count = len(EN_WORD_RE.findall(body_text))
    non_ws_count = len(re.sub(r"\s+", "", body_text))
    primary_count = cjk_count if resolved_lang == "zh" else en_word_count

    sentence_lengths: list[int] = []
    sentence_lines: list[int] = []
    para_units: list[tuple[int, int, bool]] = []
    para_dialogue_records: list[tuple[int, int, bool]] = []
    long_paragraphs = 0
    bare_dialogue_paragraphs = 0
    scare_quotes: list[tuple[int, str]] = []
    narration_cjk_total = 0
    narration_pronouns = 0
    dialogue_cjk_total = 0
    zh_long_thresh = {"standard": 220, "literary": 280, "fast": 0}[profile]
    en_long_thresh = {"standard": 175, "literary": 220, "fast": 150}[profile]

    for line_no, para in body_lines:
        if resolved_lang == "zh":
            para_size = len(CJK_RE.findall(para))
            is_bare = bool(BARE_DIALOGUE_ZH_RE.match(para))
            if is_bare:
                bare_dialogue_paragraphs += 1
            para_units.append((line_no, para_size, is_bare))

            narration = strip_spoken_zh(para)
            narration_cjk = len(CJK_RE.findall(narration))
            para_dialogue_cjk = max(0, para_size - narration_cjk)
            dialogue_cjk_total += para_dialogue_cjk
            para_dialogue_records.append((line_no, para_size, para_dialogue_cjk > 0))

            if zh_long_thresh > 0 and para_size > zh_long_thresh:
                long_paragraphs += 1
                issues.append(
                    LintIssue(
                        "warning",
                        "paragraph_too_long",
                        line_no,
                        para[:45] + "...",
                        f"单段达 {para_size} 个汉字；若非有意为之的抒情/论述长段，可在动作转换或气口处自然拆段。",
                    )
                )

            if profile == "fast":
                spoken_matches = [m.group(0) for m in SPOKEN_QUOTE_ZH_RE.finditer(para)]
                max_span_cjk = max((len(CJK_RE.findall(sp)) for sp in spoken_matches), default=0)
                if max_span_cjk > 120 or para_dialogue_cjk > 135:
                    issues.append(
                        LintIssue(
                            "warning",
                            "long_speech_monologue",
                            line_no,
                            para[:55] + "...",
                            f"fast 模式下单回合角色发言达 {para_dialogue_cjk} 字（最长单句 {max_span_cjk} 字），易显站桩演讲腔；可考虑拆成多轮交锋。",
                        )
                    )

            for seg in SENTENCE_SPLIT_ZH_RE.split(para):
                seg_cjk = len(CJK_RE.findall(seg))
                if seg_cjk > 0:
                    sentence_lengths.append(seg_cjk)
                    sentence_lines.append(line_no)

            narration_cjk_total += narration_cjk
            narration_pronouns += len(PRONOUN_ZH_RE.findall(narration))

            for sq in SCARE_QUOTE_ZH_RE.finditer(narration):
                scare_quotes.append((line_no, sq.group(1)))

            # Check template rhetoric primarily in narration so natural spoken contrast isn't penalized
            for code, pattern, msg in FORBIDDEN_PATTERNS_ZH:
                for m in pattern.finditer(narration):
                    issues.append(
                        LintIssue(
                            "warning",
                            code,
                            line_no,
                            para[:90],
                            f"旁白匹配「{m.group(0)}」— {msg}",
                        )
                    )

            for code, pattern, msg in CLICHE_PATTERNS_ZH:
                target_span = narration if code == "cliche_in_some_sense" else para
                for m in pattern.finditer(target_span):
                    issues.append(
                        LintIssue(
                            "warning",
                            code,
                            line_no,
                            para[:90],
                            f"匹配「{m.group(0)}」— {msg}",
                        )
                    )
        else:
            para_size = len(EN_WORD_RE.findall(para))
            is_bare = bool(BARE_DIALOGUE_EN_RE.match(para))
            if is_bare:
                bare_dialogue_paragraphs += 1
            para_units.append((line_no, para_size, is_bare))
            para_dialogue_records.append((line_no, para_size, is_bare or ('"' in para) or ("“" in para)))

            if para_size > en_long_thresh:
                long_paragraphs += 1
                issues.append(
                    LintIssue(
                        "warning",
                        "paragraph_too_long",
                        line_no,
                        para[:60] + "...",
                        f"Paragraph has {para_size} words; unless intentionally sustained, consider breaking at an action beat.",
                    )
                )

            for seg in SENTENCE_SPLIT_EN_RE.split(para):
                seg_words = len(EN_WORD_RE.findall(seg))
                if seg_words > 0:
                    sentence_lengths.append(seg_words)
                    sentence_lines.append(line_no)

            for code, pattern, msg in PATTERNS_EN:
                for m in pattern.finditer(para):
                    issues.append(
                        LintIssue(
                            "warning",
                            code,
                            line_no,
                            para[:90],
                            f"Matched '{m.group(0)}' — {msg}",
                        )
                    )

    uniform_blocks = check_uniform_blocks(para_units, issues, resolved_lang)
    check_choppy_telegraph(para_dialogue_records, issues, resolved_lang)

    para_sizes = [sz for _, sz, _ in para_units if sz > 0]
    median_para = round(statistics.median(para_sizes), 1) if para_sizes else 0.0
    dialogue_ratio = round(dialogue_cjk_total / cjk_count, 3) if (resolved_lang == "zh" and cjk_count) else 0.0

    if resolved_lang == "zh" and profile == "fast" and len(para_sizes) >= 8:
        heavy_ratio = sum(1 for sz in para_sizes if sz > 95) / len(para_sizes)
        if median_para > 72.0 or heavy_ratio > 0.25:
            issues.append(
                LintIssue(
                    "warning",
                    "heavy_paragraph_distribution",
                    1,
                    f"中位段长 {median_para} 字，>95字重度段占 {heavy_ratio*100:.1f}%",
                    "fast 模式下整章段落分布偏重，可挑纯叙述长段在动作或气口处拆分，同时保留有意为之的长短反差。",
                )
            )
        wall_run: list[tuple[int, int]] = []
        for lno, psz, has_d in para_dialogue_records:
            if not has_d:
                wall_run.append((lno, psz))
            else:
                if len(wall_run) >= 5 and sum(s for _, s in wall_run) >= 280:
                    issues.append(
                        LintIssue(
                            "warning",
                            "narration_wall_streak",
                            wall_run[0][0],
                            f"lines {wall_run[0][0]}-{wall_run[-1][0]}（共 {sum(s for _, s in wall_run)} 字）",
                            "fast 模式下局部出现较长连续纯叙述无对白闷段；若非刻意蓄势或独白，可切入对白交锋。",
                        )
                    )
                wall_run = []
        if len(wall_run) >= 5 and sum(s for _, s in wall_run) >= 280:
            issues.append(
                LintIssue(
                    "warning",
                    "narration_wall_streak",
                    wall_run[0][0],
                    f"lines {wall_run[0][0]}-{wall_run[-1][0]}（共 {sum(s for _, s in wall_run)} 字）",
                    "fast 模式下局部出现较长连续纯叙述无对白闷段；若非刻意蓄势或独白，可切入对白交锋。",
                )
            )

    avg_sent = round(statistics.mean(sentence_lengths), 1) if sentence_lengths else 0.0
    stdev_sent = (
        round(statistics.stdev(sentence_lengths), 1)
        if len(sentence_lengths) >= 2
        else 0.0
    )

    min_global_stdev = (4.2 if profile == "literary" else 5.2) if resolved_lang == "zh" else (3.5 if profile == "literary" else 4.5)
    if len(sentence_lengths) >= 10 and stdev_sent < min_global_stdev:
        issues.append(
            LintIssue(
                "warning",
                "low_sentence_burstiness",
                1,
                f"句长标准差 {stdev_sent}（均长 {avg_sent}）"
                if resolved_lang == "zh"
                else f"Sentence length stdev {stdev_sent} (mean {avg_sent} words)",
                "全章句长起伏偏小，容易产生匀速朗读感；若非刻意追求舒缓平静语流，可在转折处穿插短句。"
                if resolved_lang == "zh"
                else "Low overall sentence-length variation; mix crisp short beats with longer flowing sentences.",
            )
        )
    elif profile != "literary" and len(sentence_lengths) >= 16:
        win_thresh = 4.0 if resolved_lang == "zh" else 3.2
        min_mean = 12.0 if resolved_lang == "zh" else 10.0
        for idx in range(len(sentence_lengths) - 9):
            window = sentence_lengths[idx : idx + 10]
            w_mean = statistics.mean(window)
            w_stdev = statistics.stdev(window)
            if w_mean >= min_mean and w_stdev < win_thresh:
                line_hint = sentence_lines[idx]
                issues.append(
                    LintIssue(
                        "warning",
                        "local_monotonous_sentences",
                        line_hint,
                        f"第 {line_hint} 行附近连续 10 句均长 {w_mean:.1f}、标准差仅 {w_stdev:.1f}"
                        if resolved_lang == "zh"
                        else f"Near line {line_hint}: 10 consecutive sentences average {w_mean:.1f} words (stdev {w_stdev:.1f})",
                        "局部段落出现匀速平铺；建议打断复句链条或穿插短句调节呼吸。"
                        if resolved_lang == "zh"
                        else "Local stretch of uniform sentence lengths; vary rhythm to keep the prose lively.",
                    )
                )
                break

    if resolved_lang == "zh":
        # Lexical echo detector (per 1,000 CJK chars; only flags genuine weak-modifier clusters)
        if cjk_count >= 400:
            echoed: list[str] = []
            for word in ECHO_WORDS_ZH:
                cnt = body_text.count(word)
                rate = cnt * 1000.0 / max(cjk_count, 1)
                if cnt >= 6 and rate >= 4.2:
                    echoed.append(f"{word}×{cnt}")
            if echoed:
                issues.append(
                    LintIssue(
                        "warning",
                        "lexical_echo",
                        1,
                        "、".join(echoed[:8]),
                        "章内高频弱修饰词局部扎堆，易产生阅读腻味；建议删减冗余副词或换回贴合情境的自然表达（勿硬造生僻替代词）。",
                    )
                )

        # Pronoun density detector (zero-anaphora check)
        if narration_cjk_total >= 400:
            pronoun_rate = narration_pronouns * 1000.0 / narration_cjk_total
            if pronoun_rate > 48.0:
                issues.append(
                    LintIssue(
                        "warning",
                        "pronoun_density_high",
                        1,
                        f"旁白人称代词密度 {pronoun_rate:.1f}/千字（共 {narration_pronouns} 处）",
                        "「他/她/他的/她的」出现过密，略带英文语法腔；建议利用中文承前省主语（零形回指）与流水句自然省去代词。",
                    )
                )

        # Scare-quote clutter detector ("引号麻子脸")
        scare_rate = len(scare_quotes) * 1000.0 / max(cjk_count, 1)
        if len(scare_quotes) >= 5 and scare_rate >= 2.2:
            samples = "、".join(f"“{w}”" for _, w in scare_quotes[:5])
            issues.append(
                LintIssue(
                    "warning",
                    "scare_quote_clutter",
                    scare_quotes[0][0],
                    f"共 {len(scare_quotes)} 处短词引号（如 {samples}）",
                    "旁白中非对白强调引号偏多，易造成版面「引号麻子脸」；非专有黑话或强烈反讽建议直接去掉引号。",
                )
            )
    else:
        if en_word_count >= 250:
            ly_words = re.findall(r"\b[a-z]{3,}ly\b", body_text.lower())
            non_adverb_ly = {"only", "early", "family", "belly", "holy", "likely", "lonely", "lovely", "friendly", "ugly", "daily", "reply", "supply", "apply"}
            adverbs = [w for w in ly_words if w not in non_adverb_ly]
            adv_rate = len(adverbs) * 1000.0 / en_word_count
            if len(adverbs) >= 8 and adv_rate > 24.0:
                issues.append(
                    LintIssue(
                        "warning",
                        "en_adverb_density_high",
                        1,
                        f"{len(adverbs)} '-ly' adverbs ({adv_rate:.1f} per 1,000 words)",
                        "High '-ly' adverb density; consider replacing weak verb + adverb pairs with stronger, more specific verbs.",
                    )
                )

    if target_words and target_words > 0:
        min_w = int(target_words * (1.0 - tolerance))
        max_w = int(target_words * (1.0 + tolerance))
        unit_name = "汉字数" if resolved_lang == "zh" else "word count"
        if primary_count < min_w:
            issues.append(
                LintIssue(
                    "warning",
                    "word_count_under_target",
                    1,
                    f"当前{unit_name} {primary_count} < 目标下限 {min_w}（目标 {target_words}）",
                    "低于目标篇幅区间；若情节已充分落定可保留洗练篇幅，若展开不足可补充有效交互细节，勿靠废话注水。"
                    if resolved_lang == "zh"
                    else f"Current {unit_name} ({primary_count}) is below target floor ({min_w}); expand through scene action if needed, without padding.",
                )
            )
        elif primary_count > max_w:
            issues.append(
                LintIssue(
                    "warning",
                    "word_count_over_target",
                    1,
                    f"当前{unit_name} {primary_count} > 目标上限 {max_w}（目标 {target_words}）",
                    "高于目标篇幅区间；请审视是否有重复铺垫或冗余解释可收紧。"
                    if resolved_lang == "zh"
                    else f"Current {unit_name} ({primary_count}) exceeds target ceiling ({max_w}); trim redundant beats or exposition if needed.",
                )
            )

    metrics: dict[str, int | float | str] = {
        "language": resolved_lang,
        "profile": profile,
        "cjk_chars": cjk_count,
        "en_words": en_word_count,
        "primary_units": primary_count,
        "non_whitespace_chars": non_ws_count,
        "paragraphs": len(body_lines),
        "median_para_len": median_para,
        "dialogue_ratio": dialogue_ratio,
        "bare_dialogue_paragraphs": bare_dialogue_paragraphs,
        "long_paragraphs": long_paragraphs,
        "uniform_block_streaks": uniform_blocks,
        "scare_quotes": len(scare_quotes),
        "sentences": len(sentence_lengths),
        "avg_sentence_len": avg_sent,
        "avg_sentence_cjk": avg_sent if resolved_lang == "zh" else 0.0,
        "sentence_burstiness_stdev": stdev_sent,
        "errors": sum(1 for i in issues if i.level == "error"),
        "warnings": sum(1 for i in issues if i.level == "warning"),
    }
    return issues, metrics


def main() -> int:
    parser = argparse.ArgumentParser(
        description="扫描章节语感、分布节奏与页面视觉呼吸感提醒（体检镜子，不自动改稿，支持 standard/fast/literary 档位）。"
    )
    parser.add_argument("--file", required=True, help="Path to chapter markdown file")
    parser.add_argument(
        "--target-words",
        type=int,
        default=0,
        help="Optional target count (CJK chars for Chinese, words for English)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.15,
        help="Allowed count deviation ratio (default 0.15)",
    )
    parser.add_argument(
        "--lang",
        choices=("auto", "zh", "en"),
        default="auto",
        help="Prose language mode (default: auto)",
    )
    parser.add_argument(
        "--profile",
        choices=("standard", "fast", "literary"),
        default="standard",
        help="Pacing/craft profile: standard (default), fast (webnovel/light-novel), literary (slow/flowing)",
    )
    parser.add_argument(
        "--ignore",
        action="append",
        default=[],
        metavar="CODE",
        help="忽略指定规则代码，可重复传入或用逗号分隔",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    if args.target_words < 0:
        parser.error("--target-words 不能为负数。")
    if not 0 <= args.tolerance <= 1:
        parser.error("--tolerance 必须在 0 到 1 之间。")
    path = Path(args.file).expanduser().resolve()
    if not path.is_file():
        parser.error(f"File not found: {path}")

    issues, metrics = analyze_file(
        path,
        target_words=args.target_words or None,
        tolerance=args.tolerance,
        lang=args.lang,
        profile=args.profile,
    )

    ignored = {
        code.strip()
        for group in args.ignore
        for code in group.split(",")
        if code.strip()
    }
    issues = [issue for issue in issues if issue.code not in ignored]
    metrics["errors"] = sum(issue.level == "error" for issue in issues)
    metrics["warnings"] = sum(issue.level == "warning" for issue in issues)

    notice = (
        "本报告为语感与分布体检镜子，绝非必须清零的硬考题；有意为之的长段铺陈、安静留白或角色口癖请直接保留，严禁为消警告机械切段或硬换生僻同义词。中文字数按正文 U+4E00–U+9FFF 汉字统计，英文按词数统计。"
        if metrics["language"] == "zh"
        else "Advisory diagnostic mirror (not a rigid exam to zero out); preserve intentional pacing and character voice. English counts words and Chinese counts CJK characters."
    )

    if args.json:
        print(
            json.dumps(
                {
                    "file": str(path),
                    "notice": notice,
                    "ignored_codes": sorted(ignored),
                    "metrics": metrics,
                    "issues": [asdict(i) for i in issues],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        print(f"file={path}")
        print(notice)
        print("metrics " + " ".join(f"{k}={v}" for k, v in metrics.items()))
        for issue in issues:
            print(
                f"[{issue.level.upper()}] line {issue.line} ({issue.code}): "
                f"「{issue.excerpt}」 -> {issue.suggestion}"
            )
    return 1 if int(metrics["errors"]) > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
