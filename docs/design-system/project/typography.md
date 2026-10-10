# Typography

Two roles, both system fonts: there are no font files to load.

| Role | Family | Used for |
|---|---|---|
| Interface | `system-ui, -apple-system, 'Segoe UI', sans-serif` | everything you operate: labels, buttons, fields, tabs, tiles, headers |
| Writing | `Georgia, 'Times New Roman', serif` | what you write and read: chapter titles, titles and notes in the outline's inputs, the draft text, the preview, synopses, a book's cover title on its spine |

Buttons, inputs and selects inherit the family (`font-family: inherit`); the app has no global button reset, so `:where(button)` in `writer.scss` zeroes them at no extra specificity.

## The scale

The scale is small: most of the app is 11 to 13px. All styles are in `tokens.json` (`type.groups`).

| Style | Size / line | Weight | Notes |
|---|---|---|---|
| label | 10 / 14 | 700 | uppercase, 1px tracking; section labels, panel heads, stats captions (`.wrLabel`, `.wrPanelHead`, `.wrChapterPointsHead`) |
| label-small | 9 / 12 | 700 | uppercase, 1px; series labels on the shelf, a spine's title |
| button | 11 / 16 | 700 | `.wrSmallBtn`, chips |
| ui | 12 / 17 | 400 | muted text, hints, rows |
| field | 13 / 18 | 400 | `.wrField`, titles in rows |
| level-title | 15 / 20 | 700 | a level's header |
| console-title | 18 / 24 | 700 | uppercase, 1.5px; a console's title |
| writing-input / writing-note | 13 / 18 | 400 | serif; the outline's inputs, and synopsis notes in italic |
| banner-title | 18 / 23 | 400 | serif; an open chapter's banner on the Outline |
| chapter-title | 22 / 28 | 700 | serif; the Draft level's chapter tile |
| draft-text | 16 / 26 | 400 | serif; a moment's draft input |
| preview-body | 17 / 28 | 400 | serif; the preview, set by the book's preview formatting |
| preview-title | 30 / 36 | 700 | serif; the preview's chapter title |

## Rules

- **Section marks are bold uppercase small text with tracking**: 9 to 12px, 700, 1px (1.5px for a console title). Little else is uppercase (a kind badge).
- **Weights**: 700 for labels, buttons and titles; 400 for everything else. Nothing is lighter.
- **Muted is a colour, not a size**: use `ink-muted` or `paper-muted`, which are held to 4.5:1. The old habit of lowering opacity for secondary text is kept only where the audit covers it (90% on a level, 88% for the page's muted text).
- **A book's preview** is its own: font, size, bold or italic, alignment, line spacing, paragraph indent and spacing are the book's `previewFormat` (set in the book's Settings) and applied as `--wr-pv-*` variables on `.wrPreviewPane`.
- **Numbers that line up** (the save time, counts in columns) use tabular numerals.
- **Vertical text** is for edge tabs and spines only (`writing-mode: vertical-rl`, 0.3 to 0.5px tracking).
