# Draft page, preview and reactions

At Max the Draft level is the open chapter on **paper**: a light sheet with dark text by day and a dark sheet with light text at night. The right page is three tiles on the [split grid](../SplitTiles/README.md): the **chapter**, its **plotpoints** and the **draft**; the arcs' and chapters' [edge tabs](../BookCover/README.md) stand at its right.

Code: `writer/draft/DraftLevel.tsx`, `ChapterTile.tsx`, `ChapterPoints.tsx`, `DraftCards.tsx`, `PreviewPane.tsx`; classes `.wrSpread*`, `.wrChapterTile`, `.wrPreview*`, `.wrReactBar`.

## Anatomy

- **Chapter tile** `.wrChapterTile`: the titles above the chapter as tags (series, book, arc, each in its own colour with a 4px stripe), then "Chapter 1" over the title (serif 22 bold, click to edit) and synopsis, the dates and draft stats, and the tools at the right: Save, Publish, the **Draft | Preview** switch, Settings and Help.
- **Plotpoints tile**: footnote cards of the plotpoints in this chapter, *By time* or *In story*.
- **Draft tile**: the acts, scenes and moments as cards (fold up, remembered), each around an auto-growing serif input (16px, line 1.6) with a live word count. Settings (the chapter's colour) and Help swap this tile's content.
- **Left page and crease**: a bare strip of paper under the other levels, and an 18px crease.

## The preview

The chapter laid out as a reader sees it, in the book's own **preview formatting** (font, size, bold or italic, alignment, line spacing, indent, paragraph spacing), on a day or night page of its own. A toolbar sets the version (the current draft or a published copy) and the tool: **Reaction**, **Flag**, **Export**.

## Reactions

Click a sentence, then the bar in the left margin. A reaction has three levels and a fourth click clears it; one glyph per level ([iconography](../../iconography.md)). Likes and dislikes are separate bars of 20px at the sentence's own height. The bar's fill strengthens with the level (saturation 30, 62, 96 / 26, 58, 92) in the accent's hue for a like and the alert's for a dislike; level 0 is a dashed outline with a `+` or `-`.

## Tokens

`paper`, `paper-soft`, `page`, `frame-1..5`, `paper-ink`, `paper-ink2`, `paper-label`, `paper-muted`, `paper-placeholder`, `paper-error`, `paper-like`, `paper-dislike`, `like-bar-*`, `dislike-bar-*`.

## Don't

- Don't use a fixed black or white on the paper: take the paper inks, which are fitted.
- Don't stack hearts to show a level; one glyph per level.
- Don't style the preview text outside the book's preview formatting.
