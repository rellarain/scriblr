# Draft page, preview and reactions

At Max the Draft level is the open chapter on **paper**: a light sheet with dark text by day and a dark sheet with light text at night. The right page is three tiles on the [split grid](../SplitTiles/README.md): the **chapter**, its **plotpoints** and the **draft**; the arcs' and chapters' [edge tabs](../BookCover/README.md) stand at its right.

Code: `writer/draft/DraftLevel.tsx`, `ChapterTile.tsx`, `ChapterPoints.tsx`, `DraftCards.tsx`, `PreviewPane.tsx`; classes `.wrSpread*`, `.wrChapterTile`, `.wrPreview*`, `.wrReactBar`.

## Anatomy

- **Chapter tile** `.wrChapterTile`: the titles above the chapter as tags (series, book, arc, each in its own colour with a 6px stripe), then the chapter's number badge (the one the Outline's cards have, *Chapter 1* to a screen reader) over the title (serif 22 bold, click to edit) and synopsis, the dates and draft stats, and the tools at the right: Save, Publish, the **Draft | Preview** switch, Settings and Help.
- **Plotpoints tile**: footnote cards of the placements in this chapter (a plotpoint placed twice here has two, each with the awareness eye of its own place), *By time* or *In story*.
- **Draft tile**: the acts, scenes and moments as cards (fold up, remembered), each around an auto-growing serif input (16px, line 1.6) with a live word count. Settings (the chapter's colour) and Help swap this tile's content.
- **Left page and crease**: a bare strip of paper under the other levels, and an 18px crease.

## The preview

The chapter laid out as a reader sees it, in the book's own **preview formatting** (font, size, bold or italic, alignment, line spacing, indent, paragraph spacing), on a day or night page of its own. A toolbar sets the version (the current draft or a published copy) and the tool: **Reaction**, **Flag**, **Footnote**, **Export**.

The **Flag** tool (`draft/FlagTool.tsx`, `useRevisionFlags.ts`) keeps the project's **revision flags**, things to come back to: a **kind** (Review, Edit, Add or Delete, a segmented choice), a note, and one of two icon buttons: **Flag this sentence** (disabled until a sentence is clicked; the flag is the sentence's characters in its moment, `sentenceRanges` in `sentences.ts`, and follows the text as it is edited) or **Flag the project** (not tied to a passage). A flagged sentence is **underlined in the accent** while the tool is open. Under the toolbar each open flag of the chapter and of the project is a row: its kind (a select), its text in quotation marks (or "The project", or "Text gone" when the passage was cut), its note (saved when the field is left), **Show it in the text** (eye), **Resolve** (check: it asks what was done, Enter to confirm, Escape to cancel) and **Delete** (trash). The **Show resolved** switch brings back the resolved ones, dimmed, with what was done. The flags are read again each time the tool opens.

The **Footnote** tool is the author's side of a reader's margin notes: select a sentence, give the footnote a title and text, and it is kept on that sentence (a small numbered marker shows on it); a footnote can be unpublished or deleted. The same tool flags a passage with one of the book's content flags (set in the Book level's Publish tab). Published footnotes and flagged passages are frozen into the next edition of the book; readers see the footnotes in the right margin of the e-reader's page and the flags by the class each reader chose.

## Reactions

Click a sentence, then the bar in the left margin. A reaction has three levels and a fourth click clears it; one glyph per level ([iconography](../../iconography.md)). Likes and dislikes are separate bars of 20px at the sentence's own height. The bar's fill strengthens with the level (saturation 30, 62, 96 / 26, 58, 92) in the accent's hue for a like and the alert's for a dislike; level 0 is a dashed outline with a `+` or `-`.

## Tokens

`paper`, `paper-soft`, `page`, `frame-1..5`, `paper-ink`, `paper-ink2`, `paper-label`, `paper-muted`, `paper-placeholder`, `paper-error`, `paper-like`, `paper-dislike`, `like-bar-*`, `dislike-bar-*`.

## Don't

- Don't use a fixed black or white on the paper: take the paper inks, which are fitted.
- Don't stack hearts to show a level; one glyph per level.
- Don't style the preview text outside the book's preview formatting.
