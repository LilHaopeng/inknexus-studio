#!/usr/bin/env python3
"""Export AI short drama scripts to production DOCX/TXT or Hongguo clean submission script."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any


CJK_RE = re.compile(r"[\u4e00-\u9fff]")
PLACEHOLDER_RE = re.compile(r"\[(?:待填|待确认|待补充|待试写确认后填入)[^\]\n]*\]|\{\{[^{}\n]+\}\}")
FORBIDDEN_TITLE_CHARS_RE = re.compile(r"[《》<>\s]")
ASSET_CODE_CLEAN_RE = re.compile(r"`?(?:@(?:CHAR|LOC|PROP|VOICE)-\d+|(?:char|scene|prop|voice_char)_\d+|(?:CHAR|SCENE|PROP|SVG-DOLL|FACE)-\d+)`?\s*")
CAMERA_PREFIX_RE = re.compile(
    r"^(?:竖屏|横屏)?(?:极特写|大特写|特写|近景|中近景|中景|全景|远景|俯拍|仰拍|过肩镜头?|正面|反打)(?:[（(][A-Za-z0-9/+\-\s]+[）)])?[，,、：:\s]*"
)

CN_NUMS = "零一二三四五六七八九"


def load_asset_name_map(root: Path, explicit_bible: Path | None = None) -> dict[str, str]:
    """Parse character/voice/scene ID -> readable Chinese name from bible markdown tables if present."""
    candidates: list[Path] = []
    if explicit_bible:
        candidates.append(explicit_bible.expanduser().resolve())
    candidates.extend(
        [
            root / "00_季播总案与资产表.md",
            root / "01_bible" / "series_bible.md",
            root / "series_bible.md",
        ]
    )
    mapping: dict[str, str] = {"voice_narrator": "旁白"}
    row_re = re.compile(r"^\|\s*`?((?:@(?:CHAR|LOC|PROP|VOICE)-\d+|(?:char|scene|prop)_\d+|(?:CHAR|SCENE|PROP)-\d+))`?\s*\|\s*([^|]+)\|")
    voice_in_row_re = re.compile(r"`?(voice_char_\d+|@VOICE-\d+)`?")
    for cand in candidates:
        if not cand.is_file():
            continue
        text = cand.read_text(encoding="utf-8-sig")
        for line in text.splitlines():
            m = row_re.match(line.strip())
            if not m:
                continue
            code = m.group(1).strip()
            raw_name = strip_md_inline(m.group(2)).strip()
            # Keep clean Chinese/display name before slash or parenthetical role note if concise
            name = re.split(r"[（(/｜|]", raw_name)[0].strip()
            if not name or name.startswith("[待填"):
                continue
            mapping[code] = name
            # Map matching voice_char_XX or @VOICE-XX mentioned in the same table row
            mv = voice_in_row_re.search(line)
            if mv:
                mapping[mv.group(1)] = name
            if code.startswith("char_"):
                mapping[f"voice_{code}"] = name
            elif code.startswith("@CHAR-"):
                mapping[code.replace("@CHAR-", "@VOICE-")] = name
        if len(mapping) > 1:
            break
    return mapping


def replace_asset_codes(text: str, asset_map: dict[str, str]) -> str:
    """Replace known character/scene codes with readable names and drop unknown raw IDs cleanly."""
    # First remove explicit mouth-lock annotations (technical AI prompting tags)
    text = re.sub(
        r"[（(]?\s*(?:在场角色[（(]?[^）)]*[）)]?|(?:(?:char_\d+|@CHAR-\d+|CHAR-\d+)[、,，与和\s]*)+)?(?:全程?闭嘴静态|闭嘴静态|张嘴清晰发声)(?:[（(][^）)]*[）)])?\s*[）)]?[；;，,。]?",
        "",
        text,
    )
    # Replace known IDs with readable names (longest keys first)
    for code in sorted(asset_map.keys(), key=len, reverse=True):
        if code.startswith(("prop_", "@PROP-", "PROP-")):
            continue
        text = re.sub(rf"`?{re.escape(code)}`?", asset_map[code], text)
    # Strip any remaining technical asset codes (like prop_01 / FACE-03 / unknown IDs)
    text = ASSET_CODE_CLEAN_RE.sub("", text)
    # Remove leading camera-shot descriptors so △action reads like a clean screenplay
    text = CAMERA_PREFIX_RE.sub("", text)
    # Tidy orphaned brackets and punctuation left behind by stripped IDs
    text = re.sub(r"[（(]\s*[、,，与和]*\s*[）)]", "", text)
    text = re.sub(r"([，,；;。])[、，,；;]+", r"\1", text)
    text = re.sub(r"(?:在场角色)?[、，,与和]+\s*(?:均保持|保持)", "众人保持", text)
    text = re.sub(r"[，,；;]\s*[与和、]+\s*$", "", text)
    return text.strip(" ；;，,")


def int_to_cn(n: int) -> str:
    if n <= 0:
        return str(n)
    if n < 10:
        return CN_NUMS[n]
    if n < 20:
        return "十" + ("" if n == 10 else CN_NUMS[n % 10])
    if n < 100:
        tens, ones = divmod(n, 10)
        return CN_NUMS[tens] + "十" + ("" if ones == 0 else CN_NUMS[ones])
    return str(n)


def natural_sort_key(path: Path) -> list[int | str]:
    parts = re.split(r"(\d+)", path.name)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def discover_episodes(scripts_dir: Path) -> list[Path]:
    if not scripts_dir.is_dir():
        raise ValueError(f"剧本目录不存在: {scripts_dir}")
    eps = [p for p in sorted(scripts_dir.glob("*.md"), key=natural_sort_key) if not p.stem.startswith("00_")]
    if not eps:
        raise ValueError(f"剧本目录下未找到分集 Markdown 文件: {scripts_dir}")
    return eps


def strip_md_inline(text: str) -> str:
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*|\*([^*]+)\*", lambda m: m.group(1) or m.group(2), text)
    return text


def parse_production_blocks(path: Path) -> tuple[str, list[tuple[str, str]]]:
    raw = path.read_text(encoding="utf-8-sig")
    title = ""
    blocks: list[tuple[str, str]] = []
    for line in raw.splitlines():
        s = line.strip()
        if not s or re.match(r"^-{3,}$", s):
            continue
        if not title and s.startswith("# "):
            title = s[2:].strip()
            continue
        if re.match(r"^#{2,6}\s+", s):
            blocks.append(("heading", re.sub(r"^#{2,6}\s+", "", s).strip()))
            continue
        blocks.append(("paragraph", s))
    if not title:
        title = path.stem.replace("_", " ")
    return title, blocks


def parse_clean_script_blocks(
    path: Path,
    ep_index: int,
    asset_map: dict[str, str] | None = None,
) -> tuple[str, list[tuple[str, str]]]:
    """Convert production script to clean Hongguo submission format (第一集 / △动作 / 角色：台词 / （本集完）)."""
    amap = asset_map or {"voice_narrator": "旁白"}
    raw = path.read_text(encoding="utf-8-sig")
    sec_title = f"第{int_to_cn(ep_index)}集"
    blocks: list[tuple[str, str]] = []
    scene_no = 0
    cur_voice_label = ""

    for line in raw.splitlines():
        s = line.strip()
        if not s or re.match(r"^-{3,}$", s) or s.startswith("# "):
            continue
        # Skip technical metadata lines
        if re.match(r"^-\s*\[(?:集数|总镜头数|总帧数|总秒数|出场角色ID|使用场景ID|画面主体参考ID|场景参考ID)\]", s):
            continue
        if re.match(r"^(?:-\s*)?(?:\*\*)?(?:估测时长|所属弧段|出场 PNG|SVG 沙雕|使用固定场景|核心道具|HTML HUD|本集校验|本集爽点)", s):
            continue
        if re.match(r"^(?:#{2,4}\s*)?(?:\*\*)?[\[【]?(?:镜\s*\d+|Shot\s*\d+|集末卡点)", s, re.I):
            cur_voice_label = ""
            continue
        if re.match(r"^##\s+[一二三四五六七八九十]、", s):
            continue

        # Scene heading
        if re.match(r"^##\s*(?:场|场景)\s*\d+", s):
            scene_no += 1
            clean_scene = replace_asset_codes(re.sub(r"^##\s*(?:场|场景)\s*\d+[｜|:\s]*", "", s), amap)
            blocks.append(("heading", f"{ep_index}-{scene_no} {clean_scene}"))
            continue

        # Voice metadata line for `ep_01` Shot format
        m_v = re.match(r"^-\s*\[发声角色声纹ID[^\]]*\][：:]\s*(.+)$", s)
        if m_v:
            raw_v = strip_md_inline(m_v.group(1)).strip()
            if "narrator" in raw_v.lower():
                cur_voice_label = "旁白"
            else:
                cur_voice_label = amap.get(raw_v, raw_v)
            continue

        # Visual/action line -> △动作
        m_vis = re.match(r"^(?:-\s*)?(?:\*\*)?(?:\[画面[^\]]*\]|画面(?:与[^：:]+)?)[：:]\s*(.+)$", s)
        if m_vis:
            action = replace_asset_codes(strip_md_inline(m_vis.group(1)), amap)
            if action:
                blocks.append(("paragraph", f"△{action}"))
            continue

        # Exact dialogue line
        m_ex = re.match(r"^-\s*\[精确对白文本\][：:]\s*(.+)$", s)
        if m_ex:
            spk = cur_voice_label or "角色"
            blocks.append(("paragraph", f"{spk}：{m_ex.group(1).strip()}"))
            continue

        # Speaker + dialogue line (`pingou_tuan_drama` style)
        m_sp = re.match(r"^(?:-\s*)?\*{0,2}说话人声纹\s*\+\s*完整台词\*{0,2}[：:]\s*(.+)$", s)
        if m_sp:
            line_clean = strip_md_inline(m_sp.group(1)).strip()
            if not line_clean.startswith("（无台词"):
                blocks.append(("paragraph", line_clean))
            continue

        # Standard `声音：` line
        m_snd = re.match(r"^(?:-\s*)?\*{0,2}声音\*{0,2}[：:]\s*(.+)$", s)
        if m_snd:
            snd = re.sub(r"\[(?:环境音|音效|BGM)[^\]]*\][；;，,\s]*", "", strip_md_inline(m_snd.group(1)))
            snd = replace_asset_codes(snd, amap)
            if snd:
                blocks.append(("paragraph", snd))
            continue

    blocks.append(("paragraph", "（本集完）"))
    return sec_title, blocks


def validate_no_placeholders(files: list[Path], allow_placeholders: bool) -> None:
    if allow_placeholders:
        return
    leaks: list[str] = []
    for p in files:
        text = p.read_text(encoding="utf-8-sig")
        for m in PLACEHOLDER_RE.finditer(text):
            leaks.append(f"{p.name}: {m.group(0)}")
    if leaks:
        raise ValueError(
            f"检测到残留未填占位符（{', '.join(leaks[:5])}）。请补全后再导出，或传入 --allow-placeholders。"
        )


def check_hongguo_title(title: str) -> list[str]:
    warnings: list[str] = []
    if len(title) > 20:
        warnings.append(f"剧名长度 {len(title)} 字 > 红果后台 20 字符上限。")
    if FORBIDDEN_TITLE_CHARS_RE.search(title):
        warnings.append("剧名含红果后台禁用字符（《》<> 或空格），上传剧壳时请去除。")
    return warnings


def export_txt(sections: list[tuple[str, list[tuple[str, str]]]], out_txt: Path, title: str) -> str:
    lines: list[str] = [title, ""]
    for idx, (sec_title, blocks) in enumerate(sections):
        if idx > 0:
            lines.append("========================================")
            lines.append("")
        lines.append(sec_title)
        lines.append("")
        for kind, text in blocks:
            clean = strip_md_inline(text)
            if kind == "heading":
                lines.append(f"【{clean}】")
            else:
                lines.append(clean)
        lines.append("")
    out_txt.parent.mkdir(parents=True, exist_ok=True)
    out_txt.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return str(out_txt.resolve())


def set_style_fonts(style: Any, ascii_font: str, east_asia_font: str, qn: Any) -> None:
    style.font.name = ascii_font
    rfonts = style._element.get_or_add_rPr().get_or_add_rFonts()
    for slot in ("asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme", "csTheme"):
        rfonts.attrib.pop(qn("w:" + slot), None)
    rfonts.set(qn("w:ascii"), ascii_font)
    rfonts.set(qn("w:hAnsi"), ascii_font)
    rfonts.set(qn("w:cs"), ascii_font)
    rfonts.set(qn("w:eastAsia"), east_asia_font)


def add_formatted_runs(paragraph: Any, text: str) -> None:
    clean = re.sub(r"`([^`]+)`", r"\1", text)
    pattern = re.compile(r"(\*\*[^*]+\*\*)")
    pos = 0
    for m in pattern.finditer(clean):
        if m.start() > pos:
            paragraph.add_run(clean[pos : m.start()])
        run = paragraph.add_run(m.group(1)[2:-2])
        run.bold = True
        pos = m.end()
    if pos < len(clean):
        paragraph.add_run(clean[pos:])


def export_docx(
    sections: list[tuple[str, list[tuple[str, str]]]],
    out_docx: Path,
    title: str,
    episode_count: int,
    total_cjk: int,
    fmt_label: str,
    author: str = "",
) -> str:
    try:
        from docx import Document
        from docx.enum.style import WD_STYLE_TYPE
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml.ns import qn
        from docx.shared import Mm, Pt, RGBColor
    except ImportError as exc:
        raise RuntimeError("导出 DOCX 需要 python-docx：python -m pip install python-docx") from exc

    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Mm(210)
    sec.page_height = Mm(297)
    sec.top_margin = Mm(22)
    sec.bottom_margin = Mm(20)
    sec.left_margin = Mm(24)
    sec.right_margin = Mm(24)
    sec.different_first_page_header_footer = True

    ink = RGBColor(0x22, 0x22, 0x22)
    accent = RGBColor(0x1B, 0x26, 0x3B)
    muted = RGBColor(0x5C, 0x67, 0x7D)

    normal = doc.styles["Normal"]
    set_style_fonts(normal, "Segoe UI", "微软雅黑", qn)
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = ink

    body = doc.styles.add_style("Script Body", WD_STYLE_TYPE.PARAGRAPH)
    body.base_style = normal
    set_style_fonts(body, "Segoe UI", "微软雅黑", qn)
    body.font.size = Pt(10.5)
    body.paragraph_format.line_spacing = 1.45
    body.paragraph_format.space_after = Pt(4.5)

    h1 = doc.styles["Heading 1"]
    set_style_fonts(h1, "Segoe UI", "微软雅黑", qn)
    h1.font.size = Pt(15)
    h1.font.bold = True
    h1.font.color.rgb = accent
    h1.paragraph_format.space_before = Pt(10)
    h1.paragraph_format.space_after = Pt(8)
    h1.paragraph_format.keep_with_next = True

    h2 = doc.styles["Heading 2"]
    set_style_fonts(h2, "Segoe UI", "微软雅黑", qn)
    h2.font.size = Pt(11.5)
    h2.font.bold = True
    h2.font.color.rgb = accent
    h2.paragraph_format.space_before = Pt(8)
    h2.paragraph_format.space_after = Pt(4)
    h2.paragraph_format.keep_with_next = True

    sp = doc.add_paragraph()
    sp.paragraph_format.space_before = Pt(80)
    ct = doc.add_paragraph()
    ct.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = ct.add_run(title)
    r.bold = True
    r.font.size = Pt(24)
    r.font.color.rgb = accent

    cs = doc.add_paragraph()
    cs.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r2 = cs.add_run(f"{fmt_label} · 共 {episode_count} 集 · 约 {total_cjk:,} 字")
    r2.font.size = Pt(11.5)
    r2.font.color.rgb = muted

    meta = " · ".join(x for x in (author.strip(), date.today().isoformat()) if x)
    cm = doc.add_paragraph()
    cm.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cm.paragraph_format.space_before = Pt(24)
    r3 = cm.add_run(meta)
    r3.font.size = Pt(9.5)
    r3.font.color.rgb = muted

    for sec_title, blocks in sections:
        hp = doc.add_paragraph(style="Heading 1")
        hp.paragraph_format.page_break_before = True
        hp.add_run(sec_title)
        for kind, b_text in blocks:
            if kind == "heading":
                p = doc.add_paragraph(style="Heading 2")
                p.add_run(strip_md_inline(b_text))
            else:
                p = doc.add_paragraph(style="Script Body")
                add_formatted_runs(p, b_text)

    out_docx.parent.mkdir(parents=True, exist_ok=True)
    doc.core_properties.title = title
    doc.core_properties.author = author
    doc.save(out_docx)
    return str(out_docx.resolve())


def main() -> int:
    parser = argparse.ArgumentParser(description="将 AI 短剧分集剧本导出为产线版或红果送审纯净版 DOCX/TXT。")
    parser.add_argument("--root", required=True, type=Path, help="短剧项目根目录（含 剧本/ 或直接指定剧本目录）")
    parser.add_argument("--scripts-dir", type=Path, default=None, help="可选自定义剧本子目录（默认 <root>/剧本）")
    parser.add_argument("--out-docx", type=Path, default=None, help="输出 .docx 路径")
    parser.add_argument("--out-txt", type=Path, default=None, help="输出 .txt 路径")
    parser.add_argument("--title", default="", help="剧名（红果上传须 ≤20 字符且无《》与空格）")
    parser.add_argument("--author", default="", help="可选编剧名")
    parser.add_argument(
        "--format",
        choices=("production", "clean-script"),
        default="production",
        help="导出形态：production（完整产线版）或 clean-script（红果送审/编剧投稿纯净剧本版）",
    )
    parser.add_argument("--bible", type=Path, default=None, help="可选资产圣经路径（clean-script 时用于将 char_01/voice_char_01 还原为角色名）")
    parser.add_argument("--include-bible", action="store_true", help="将 00_季播总案与资产表.md 附在剧本前导出（仅 production）")
    parser.add_argument("--allow-placeholders", action="store_true", help="允许未填占位符继续导出")
    args = parser.parse_args()

    if not args.out_docx and not args.out_txt:
        parser.error("请至少指定 --out-docx 或 --out-txt 之一。")

    try:
        root = args.root.expanduser().resolve()
        s_dir = args.scripts_dir.expanduser().resolve() if args.scripts_dir else (root / "剧本")
        episodes = discover_episodes(s_dir)
        files_to_validate = list(episodes)
        bible_path = args.bible.expanduser().resolve() if args.bible else (root / "00_季播总案与资产表.md")
        if args.format == "production" and args.include_bible and bible_path.is_file():
            files_to_validate.insert(0, bible_path)
        validate_no_placeholders(files_to_validate, args.allow_placeholders)

        sections: list[tuple[str, list[tuple[str, str]]]] = []
        total_cjk = 0
        if args.format == "production":
            for p in files_to_validate:
                st, blks = parse_production_blocks(p)
                sections.append((st, blks))
                total_cjk += sum(len(CJK_RE.findall(bt)) for _, bt in blks)
            fmt_label = "AI短剧产线剧本"
        else:
            asset_map = load_asset_name_map(root, args.bible)
            for idx, p in enumerate(episodes, start=1):
                st, blks = parse_clean_script_blocks(p, idx, asset_map)
                sections.append((st, blks))
                total_cjk += sum(len(CJK_RE.findall(bt)) for _, bt in blks)
            fmt_label = "红果送审纯净剧本"

        title = args.title.strip() or root.name or "AI短剧剧本"
        res: dict[str, Any] = {
            "title": title,
            "format": args.format,
            "episodes": len(episodes),
            "cjk_chars": total_cjk,
            "hongguo_title_warnings": check_hongguo_title(title),
        }
        if args.out_docx:
            res["docx_output"] = export_docx(
                sections, args.out_docx.expanduser().resolve(), title, len(episodes), total_cjk, fmt_label, args.author
            )
        if args.out_txt:
            res["txt_output"] = export_txt(sections, args.out_txt.expanduser().resolve(), title)
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
