# Book shelf and spines

A project's books stand on a shelf as **spines**, each carrying bars that show how far the book has come. The selected book swivels from its spine to its front cover.

Code: `writer/Shelf.tsx` (`Shelf`, `Spine`), `outlineTree.ts` (`shelfGroups`), backend `storage/book_progress.py` (`GET /api/projects/{id}/book-progress`); classes `.wrShelf*`, `.wrSpine*`.

## Anatomy

- **Books** `.wrShelfBooks`: a row (at least 216px tall) that scrolls sideways with the wheel, no scrollbar. Spines stand on the board, 4px apart (8px between a section and what is next to it).
- **Board** `.wrShelfBoard`: a 26px strip under the row, darker than the shelf (`ov-sink-3`), carrying the **project's title** (11px bold uppercase, 1.5px spacing; a link when it opens the project), the book count and a slot for a control. There is no header row above the shelf.
- **Series** `.wrShelfSeries`: a lighter section (`level-wash-lo`, 8px padding) as tall as the row, with the **series title** across its top (9px uppercase); books outside a series stand loose between the sections.
- **Spine** `.wrSpine`: 20 to 64px wide (20px with no word-count goal, 8px more for every 40,000 words) and 160 to 200px tall. The colour is the book's fill (`--wr-spine`, the same as its level). **No title text**: the **book's number** is at the top (the title is its tooltip and accessible name).
- **Bars** `.wrSpineBar`, top to bottom: **planning**, **plotting** and **outlining** (horizontal, 5px tall); the **words** bar (vertical, up the middle, 64% of the spine's width); **plotpoints placed**, **revision** and **published** (horizontal). A bar is a dark track of the spine's colour (55% toward black) with a lighter fill (55% toward white) for the progress, and turns the **accent** colour once complete (or past the word goal). A bar **appears only where there is a goal or a measure** (a total above zero); each has a tooltip ("Outlining: 3 of 5 chapters outlined").
- **Cover** (active): 96px wide, the spine turned 180 degrees (0.45s): a serif 11px uppercase title, a 4px inner edge, a 3px right corner.
- With a book picked the other spines darken (55%); hover brightens 15%.

### What the bars measure

| Bar | Done of total |
|---|---|
| Planning | the book's synopsis, word-count goal, chapter target and time system that are set, once it has a word-count goal or a chapter target |
| Plotting | the book's plotlines that have plotpoints |
| Outlining | chapters that have an act, scene or moment below them (a moment made for free drafting does not count) |
| Words | draft words against the book's word-count goal (no bar without a goal) |
| Plotpoints placed | the book's plotpoints that are assigned to a moment |
| Revision | chapters with a manual revision |
| Published | chapters published at least once |

## Tokens

`level-fill-<hue>` (the spine and cover), `level-ink`, `level-wash-lo` (a series section), `accent` (a complete bar), `ink-muted` (labels), `ov-sink-3` (the board).

## You provide

`label`, `meta`, `groups` (from `shelfGroups(nodes)`), `progress` (per book id, from the book-progress endpoint), `activeBookId`, `onOpenBook`, optional `onOpen` (makes the name a link) and `right`.

## Don't

- Don't colour a spine by anything but its book's hue.
- Don't write the title on the spine; the number and the bars are what it shows.
- Don't draw a bar with nothing to measure against.
- Don't animate under `prefers-reduced-motion`; the flip is dropped.
