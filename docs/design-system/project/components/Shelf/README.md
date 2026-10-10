# Book shelf and spines

A project's books stand on a shelf as **spines**. The selected book swivels from its spine to its front cover.

Code: `writer/Shelf.tsx` (`Shelf`, `Spine`), `outlineTree.ts` (`shelfGroups`); classes `.wrShelf*`, `.wrSpine*`.

## Anatomy

- **Header** `.wrShelfHeader`: the project's name (11px bold uppercase, a link when it opens the project) and a quiet meta ("2 books").
- **Board** `.wrShelfBooks`: a row 104px tall standing on an 8px board drawn at its bottom (black gradient); scrolls sideways with the wheel, no scrollbar.
- **Series** `.wrShelfSeries`: a darkened section (black at 28%) with a 9px uppercase label above the books it groups; books outside a series stand on the plain shelf.
- **Spine** `.wrSpine`: 100px tall; its width reflects the book's length, 5px per 40,000 words of its goal (at least 8). The title runs vertically (11px bold) when it fits (20px or more). Colour is the book's fill (`--wr-spine`, the same as its level), white text.
- **Cover** (active): 74px wide, the spine turned 180 degrees (0.45s): a serif 9px uppercase title, a 4px inner edge, a 3px right corner.
- With a book picked the other spines darken (55%); hover brightens 15%.

## Tokens

`level-fill-<hue>` (the spine and cover), `level-ink`, `ink-muted` (labels), `ov-sink-*`.

## You provide

`label`, `meta`, `groups` (from `shelfGroups(nodes)`), `activeBookId`, `onOpenBook`, optional `onOpen` (makes the name a link) and `right`.

## Don't

- Don't colour a spine by anything but its book's hue.
- Don't show a title that does not fit; a spine under 20px wide has none.
- Don't animate under `prefers-reduced-motion`; the flip is dropped.
