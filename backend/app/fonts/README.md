# Fonts for the PDF export

`app/storage/pdf_export.py` sets the text of a PDF in these fonts. They ship with the app, so an export prints any script, offline, on any machine. fpdf2 embeds only the glyphs a PDF uses, and the export adds a fallback font only when the text needs it, so a plain Latin book carries only Noto Serif or Noto Sans.

All are from the [Noto](https://notofonts.github.io/) project and licensed under the SIL Open Font License 1.1. The licence texts are next to them.

## The book fonts

The Preview's font choice (serif, sans, mono) picks one of these.

| File | Family | Source |
|---|---|---|
| `NotoSerif-Regular/Bold/Italic/BoldItalic.ttf` | Noto Serif 2.015 | notofonts.github.io, `fonts/NotoSerif/hinted/ttf/` |
| `NotoSans-Regular/Bold/Italic/BoldItalic.ttf` | Noto Sans | notofonts.github.io, `fonts/NotoSans/hinted/ttf/` |
| `NotoSansMono-Regular/Bold.ttf` | Noto Sans Mono (italic uses the upright) | notofonts.github.io, `fonts/NotoSansMono/hinted/ttf/` |

## The fallback fonts

These are tried in this order for each character the book font lacks. The script fonts come before Symbols and Math, because Noto Sans Math also has Arabic letters and would otherwise take them.

| File | Covers | Source |
|---|---|---|
| `NotoNaskhArabic-Regular/Bold.ttf` | Arabic, Persian, Urdu | notofonts.github.io, `fonts/NotoNaskhArabic/hinted/ttf/` |
| `NotoSerifHebrew-Regular/Bold.ttf` | Hebrew | notofonts.github.io, `fonts/NotoSerifHebrew/hinted/ttf/` |
| `NotoSerifDevanagari-Regular/Bold.ttf` | Hindi, Marathi, Nepali, Sanskrit | notofonts.github.io, `fonts/NotoSerifDevanagari/hinted/ttf/` |
| `NotoSerifThai-Regular/Bold.ttf` | Thai | notofonts.github.io, `fonts/NotoSerifThai/hinted/ttf/` |
| `NotoSansSymbols2-Regular.ttf` | Arrows, chess, dingbats and other symbols | notofonts.github.io, `fonts/NotoSansSymbols2/hinted/ttf/` |
| `NotoSansMath-Regular.ttf` | Mathematical operators and letters | notofonts.github.io, `fonts/NotoSansMath/hinted/ttf/` |
| `NotoEmoji-Regular.ttf` | Emoji, in outline (a PDF has no colour emoji) | google/fonts, `ofl/notoemoji/NotoEmoji[wght].ttf` (Noto Emoji 3.002, the variable font, renamed; its default weight is used) |
| `NotoSansSC-Regular.ttf` | Chinese (simplified, and most traditional) | notofonts/noto-cjk, `Sans/SubsetOTF/SC/NotoSansSC-Regular.otf` (2.004), converted (see below) |
| `NotoSansJP-Regular.ttf` | Japanese kana and the kanji SC lacks | notofonts/noto-cjk, `Sans/SubsetOTF/JP/NotoSansJP-Regular.otf`, converted |
| `NotoSansKR-Regular.ttf` | Korean Hangul | notofonts/noto-cjk, `Sans/SubsetOTF/KR/NotoSansKR-Regular.otf`, converted |

The CJK fonts have no bold. Bold CJK text is printed in the regular weight.

## The CJK conversion

Noto Sans CJK is published as OpenType with CID-keyed CFF outlines. fpdf2 embeds those fonts but draws nothing with them. So each one was converted once to TrueType outlines with fontTools (`fontTools.cu2qu`, cubic curves to quadratic, maximum error 1 unit), keeping the font's names, metrics and glyph set. The glyph names were dropped (`post` table format 3): a CID-keyed font has none worth keeping. The script is `otf2ttf` in fontTools' snippets, with the `VORG` table removed. The OFL allows a changed format. The licence in `LICENSE-NotoCJK.txt` names no Reserved Font Name, so the converted fonts keep the name "Noto Sans SC/JP/KR".

## Licences

| File | Applies to |
|---|---|
| `OFL-Noto.txt` | Noto Serif, Sans, Sans Mono, the script fonts, Symbols 2 and Math (google/fonts, `ofl/notoserif/OFL.txt`) |
| `OFL-NotoEmoji.txt` | Noto Emoji (google/fonts, `ofl/notoemoji/OFL.txt`) |
| `LICENSE-NotoCJK.txt` | Noto Sans SC, JP and KR (notofonts/noto-cjk, `LICENSE`) |

## Changing the fonts

- **Add or replace a font**: list it in `FAMILIES` or `FALLBACKS` in `pdf_export.py`. `tests/test_pdf_text.py` checks that every listed file is here and that each script is set in a font that has it.
- **Packaging**: `scriblr.spec` bundles this folder as `app/fonts`.
