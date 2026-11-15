"""Converters into Scriblr's own markup (the dialect the frontend parses in src/lib/markup), used once by markup_migration.py when
a Resources or Training file written before the markup is read.

The markup, line by line (a marker starts a line, after any spaces):
- headings `######` (largest) down to `#` (smallest), each followed by a space;
- lists `>` (a dot), `>>` (numbered), `>>>` (an indented ring), `>>>>` (an indented number), each followed by a space;
- a quote line starts with `"` and a space;
- knowledge checks: `?????` (a question pulled in), `????` (a question), `???!` (a hint), `???` and `??!` (checkbox options, wrong and
  right), `?!!` (explains the checkbox option above), `??` and `?!` (multiple-choice options, wrong and right), `!!` (explains the
  multiple-choice option above), `?` (a text field), `!` (an accepted answer).
Inline: `***bold italic***`, `**bold**`, `*italic*`, links starting with `@`. A backslash before one of ESCAPABLE shows it as text.

The frontend's marker list is checked against MARKERS by src/lib/markup/markerParity.test.ts."""

import re
from typing import Iterable, Optional

# Every line marker of the markup, longest first within each family (the frontend's lib/markup/lines.ts MARKERS).
MARKERS = ["######", "#####", "####", "###", "##", "#", ">>>>", ">>>", ">>", ">", '"', "?????", "????", "???!", "???", "??!", "?!!", "??", "?!", "!!", "?", "!"]
# Characters a backslash turns into plain text.
ESCAPABLE = set('*>@?!#"[]\\')

_LINK_START = re.compile(r"[A-Za-z0-9_#-]")
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_BULLET = re.compile(r"^([ \t]*)[-*+]\s+(.*)$")
_NUMBERED = re.compile(r"^([ \t]*)\d{1,9}[.)]\s+(.*)$")
_QUOTE = re.compile(r"^[ \t]{0,3}>\s?(.*)$")
_MD_LINK = re.compile(r"\[([^\]\n]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")


def _is_link_start(text: str, i: int) -> bool:
    """A `@` at i starts a link: at the start of the text or after a space or punctuation, and followed by a name character."""
    if i + 1 >= len(text) or not _LINK_START.match(text[i + 1]):
        return False
    if i == 0:
        return True
    before = text[i - 1]
    return before.isspace() or (not before.isalnum() and before not in "_-\\")


def _escape_inline(text: str) -> str:
    """Plain text made safe inline: stars, link starts and backslashes that would escape something are shown as typed."""
    out: list[str] = []
    for i, ch in enumerate(text):
        if ch == "\\" and i + 1 < len(text) and text[i + 1] in ESCAPABLE:
            out.append("\\\\")
        elif ch == "*":
            out.append("\\*")
        elif ch == "@" and _is_link_start(text, i):
            out.append("\\@")
        else:
            out.append(ch)
    return "".join(out)


def _line_marker(line: str) -> Optional[str]:
    """The marker a line would start with in the markup, if any (after its leading spaces)."""
    body = line.lstrip(" \t")
    if body.startswith(("?", "!")):
        return body[0]
    m = re.match(r"^(#+|>+|\")\s", body)
    return m.group(1) if m else None


def _escape_line_start(line: str) -> str:
    """A line that would be read as a marker gets a backslash before it."""
    if _line_marker(line) is None:
        return line
    indent = len(line) - len(line.lstrip(" \t"))
    return line[:indent] + "\\" + line[indent:]


def plain_to_markup(text: str) -> str:
    """Plain text (FAQ answers, descriptions) as markup that shows exactly the same characters."""
    return "\n".join(_escape_line_start(_escape_inline(line)) for line in text.replace("\r\n", "\n").split("\n"))


def _underscores(text: str) -> str:
    """Markdown's `__bold__` and `_italic_` as stars, only at word edges (so snake_case stays)."""
    text = re.sub(r"(?<![A-Za-z0-9_])__(?=\S)(.+?)(?<=\S)__(?![A-Za-z0-9_])", r"**\1**", text)
    return re.sub(r"(?<![A-Za-z0-9_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![A-Za-z0-9_])", r"*\1*", text)


def _markdown_inline(text: str) -> str:
    """One line of Markdown's inline text as markup: links become `text (url)`, underscores become stars, link starts are escaped.
    Stars and backslash escapes mean the same in both, so they are kept."""
    text = _MD_LINK.sub(lambda m: f"{m.group(1)} ({m.group(2)})" if m.group(1).strip() else m.group(2), text)
    text = _underscores(text)
    out: list[str] = []
    for i, ch in enumerate(text):
        out.append("\\@" if ch == "@" and _is_link_start(text, i) else ch)
    return "".join(out)


def markdown_to_markup(text: str) -> str:
    """Standard Markdown (guides, tutorials, lesson material) as markup: heading sizes turned round (Markdown's `#` is the largest),
    `-`, `*` and `+` items as `>` (indented: `>>>`), numbered items as `>>` (indented: `>>>>`), `>` quotes as `"`, and anything that
    would be read as a marker by accident escaped."""
    out: list[str] = []
    fenced = False
    for line in text.replace("\r\n", "\n").split("\n"):
        if line.lstrip().startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            out.append(_escape_line_start(_escape_inline(line)))
            continue
        if re.match(r"^[ \t]{0,3}([-*_])([ \t]*\1){2,}[ \t]*$", line):
            out.append("")
            continue
        m = _HEADING.match(line.lstrip(" "))
        if m and len(line) - len(line.lstrip(" ")) <= 3:
            level = len(m.group(1))
            out.append("#" * (7 - level) + " " + _markdown_inline(m.group(2).rstrip("# ").strip()))
            continue
        m = _BULLET.match(line)
        if m:
            nested = len(m.group(1).expandtabs(4)) >= 2
            out.append((">>> " if nested else "> ") + _markdown_inline(m.group(2)))
            continue
        m = _NUMBERED.match(line)
        if m:
            nested = len(m.group(1).expandtabs(4)) >= 2
            out.append((">>>> " if nested else ">> ") + _markdown_inline(m.group(2)))
            continue
        m = _QUOTE.match(line)
        if m:
            out.append('" ' + _markdown_inline(m.group(1)) if m.group(1).strip() else "")
            continue
        out.append(_escape_line_start(_markdown_inline(line)))
    return "\n".join(out)


def _one_line(text: str) -> str:
    return " ".join(text.split())


def questions_to_markup(questions: Iterable[dict]) -> str:
    """The old form questions (`{id, prompt, options: [{text, isCorrect}]}`) as markup, keeping their ids: one right option or none is
    a multiple-choice question, more than one a checkbox question."""
    blocks: list[str] = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        qid = str(q.get("id") or "")
        qid = qid if re.fullmatch(r"[A-Za-z0-9_-]{1,40}", qid) else ""
        prompt = _escape_inline(_one_line(str(q.get("prompt") or ""))) or "Question"
        options = [o for o in (q.get("options") or []) if isinstance(o, dict)]
        many = sum(1 for o in options if o.get("isCorrect") is True) > 1
        lines = [f"????{'#' + qid if qid else ''} {prompt}"]
        for o in options:
            right = o.get("isCorrect") is True
            marker = ("??!" if right else "???") if many else ("?!" if right else "??")
            lines.append(f"{marker} {_escape_inline(_one_line(str(o.get('text') or '')))}".rstrip())
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def merge_assessments(first_text: str, extras: Iterable[tuple[str, str, str]]) -> str:
    """The text of the one assessment kept where there were several: its own text, then each extra one's title as a heading, its
    description and its text. `extras` are (title, description, text) with the description already markup."""
    parts = [first_text.strip()] if first_text.strip() else []
    for title, description, text in extras:
        block = [f"##### {_escape_inline(_one_line(title)) or 'More questions'}"]
        if description.strip():
            block.append(description.strip())
        if text.strip():
            block.append(text.strip())
        parts.append("\n\n".join(block))
    return "\n\n".join(parts)
