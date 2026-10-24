# Book cover, page edges and edge tabs

At Max the Outline is a book. Its **cover** is one column (the book's title, counts, the level's tabs, the sections they open, then the contents), standing beside a **stack of page edges** that carries the **arc and chapter tabs**. The book's pages are the Draft level's.

Code: `writer/outline/OutlineMax.tsx`, `OutlineNav.tsx`, `BookEditor.tsx`, `BookSettings.tsx`, `DraftStats.tsx`; `writer/EdgeTabs.tsx`; styles `.wrOutlineMax`, `.wrBookCover`, `.wrCoverColumn`, `.wrEdgeRail`, `.wrEdgeLeaves`, `.wrEdgeTab` in `writer.scss`.

## Anatomy

- **Cover** `.wrBookCover`: the book's flat fill (`--wr-fill`), white text, a soft shadow on its right edge. The title is 20px bold; the tabs row is the Outline's tabs (Book outline, Book details, Settings, Help) and quick actions. The column is at most 860px wide and centred.
- **Spine** down the left: a flat strip, the fill mixed with 40% black.
- **Contents** `.wrOutlineNav`: a card for each arc (`.wrArcCard`) and chapter (`.wrChapterCard`), each with a 7px left stripe in its colour (lifted brighter: `stripeColorCss`), one header row (grip, number badge, title edited in place, a fold chevron, and a Write pencil on a chapter) over its counts. An arc holds its chapter cards and ends in a footer (*+ Chapter*, its colour slider, its trash); the open chapter holds its [cards](../OutlineCards/README.md) and ends in *+ Act*, its colour slider and its trash.
- **Page edges** `.wrEdgeLeaves i`: ten or more, each 4px further out and a little deeper than the one before, on the book's back-cover colour (`--wr-cover`). The rail is 15px wider than the last edge.
- **Tabs** `.wrEdgeTab` (30 wide, vertical text, 46 tall) and arc tabs `.wrEdgeArc` ("A1", "A2"); each arc's cluster starts at its own edge, the first at the second. A tab's stripe is its colour; the **focused** tab is wider (38) with its colour as its background, fitted so its ink reads (`tabColors`). `+` adds a chapter.

## Behaviour

A chapter tab narrows the cover to that chapter's outline; an arc tab to that arc and its chapters; choosing the focused tab again shows the whole book. See [interaction](../../interaction.md).

## Tokens

`level-fill-<hue>` (the cover and the rail), `level-fill-1..4`, `paper-ink` (tab ink), `frame-*`, `surface-*`. The tab's own colour is the chapter's or arc's hue.

## Don't

- Don't add a second column or a page area to the cover: it is one column.
- Don't put tab text horizontally; it runs vertically like a real tabbed book.
- Don't change a page edge's colour per arc: the edges are the book's; the tabs carry the arc and chapter colours.
