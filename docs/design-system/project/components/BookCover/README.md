# Book cover, page edges and edge tabs

At Max the Outline is a book. Its **cover** is one column (the book's title, counts, the level's tabs, the sections they open, then the contents), standing beside a **stack of page edges** that carries the **arc and chapter tabs**. The book's pages are the Draft level's.

Code: `writer/outline/OutlineMax.tsx`, `OutlineNav.tsx`, `BookEditor.tsx`, `BookSettings.tsx`, `DraftStats.tsx`, `BookGoals.tsx` (with `lib/bookGoals.ts`; at Mid in `levels/outlineTabs.tsx`, `BookDetails`); `writer/EdgeTabs.tsx`; styles `.wrOutlineMax`, `.wrBookCover`, `.wrCoverColumn`, `.wrEdgeRail`, `.wrEdgeLeaves`, `.wrEdgeTab` in `writer.scss`.

## Anatomy

- **Cover** `.wrBookCover`: the book's flat fill (`--wr-fill`), white text, a soft shadow on its right edge. The title is 20px bold; the tabs row is the Outline's tabs (Book outline, Book details, Settings, Help) and quick actions. The column is at most 860px wide and centred.
- **Spine** down the left: a flat strip, the fill mixed with 40% black.
- **Contents** `.wrOutlineNav`: a card for each arc (`.wrArcCard`) and chapter (`.wrChapterCard`), each with a 7px left stripe in its colour (lifted brighter: `stripeColorCss`), one header row (grip, number badge, title edited in place, a fold chevron, and a Write pencil on a chapter) over its counts. An arc holds its chapter cards and ends in a footer (*+ Chapter*, its colour slider, its trash); the open chapter holds its [cards](../OutlineCards/README.md) and ends in *+ Act*, its colour slider and its trash.
- **Page edges** `.wrEdgeLeaves i`: ten or more, each 4px further out and a little deeper than the one before, on the book's back-cover colour (`--wr-cover`). The rail is 15px wider than the last edge.
- **Tabs** `.wrEdgeTab` (30 wide, vertical text, 46 tall) and arc tabs `.wrEdgeArc` ("A1", "A2"); each arc's cluster starts at its own edge, the first at the second. A tab's stripe is its colour; the **focused** tab is wider (38) with its colour as its background, fitted so its ink reads (`tabColors`). `+` adds a chapter (without focusing it).

## Book details and goals

The **Book details** tab opens the draft stats and the book's **goals** (`.wrBookGoals`): under the stats on the cover at Max; at Mid beside the book's facts (`.wrBookDetailsFacts`: a cover block on the book's fill with its title and "Book 1 of Harbour Lights", the Title and the Synopsis to edit, and its counts, "14 chapters · 38 scenes · 112 moments · 41,200 words"). The goals are on the level's own colour (a panel on `--wr-fill-4` at Mid, the cover's recess on the cover) in the level's ink:

- **The head**: "Goals" and the choice of the two ways (`.wrChoice`, `aria-pressed`): **Goals without dates** (the default) and **Deadlines**, the writer's per book.
- **The goals**: Word count, Chapters, Scenes and Moments, each a goal field (the count now beside its name, the goal, a bar); no number is no goal.
- **The pace** on the level's wash: "Your usual pace: 1,450 to 1,900 words and about 1 chapter a week, from your writing activity over the last 8 weeks" (the slower and the faster of the usual weeks: the lower and upper quartiles of the last eight weeks of the project's activity, net words drafted and nodes made); a goal left without two weeks of activity is named as having no pace yet.
- **Without dates**: the estimate in the serif at 22px, "About 6 to 8 months at your usual pace", and "The book would be done between late May and mid-July 2027. The timeline below follows these estimates." (the book is done when its last goal is; "Every goal is met" when they all are).
- **With deadlines**: a row for the book and one for each arc (`.wrBookGoalsDates`: its name, a date field and what the date asks): "No date"; a tag, **Within reach** (inverted, like a chosen button) or **Above your pace** (ringed in the ink), **Done** or **Past its date**; and "needs 1,575 words a week", "after Arc 2 · The Toll" when the arc before it has a later date than today, and for a date above the pace "; at your pace it ends late Feb to mid-Mar". The arcs take dates only with a word goal (an arc's share of it is its share of the book's chapters); without one the book is planned in its first outline goal.
- **The timeline** (`.wrBookTimeline`): a month scale (the year under the first month and each January), then a row for each arc (and the chapters outside an arc) one after another at the writer's pace, or one row for the book: done up to today (`--level-ink-soft`), solid at the faster pace (`--level-ink`), hatched up to the slower, a tall 2px mark at a date, a dashed line at today; a legend under it. Each row's text alternative says when it would be done and its date.
- **Narrow** (a container under 440px, as on the cover or a narrow panel): a date row puts its status on a line of its own, the row names take 76px, and every second month is left out (the year moves to the next month shown).

## Behaviour

A chapter tab narrows the cover to that chapter's outline; an arc tab to that arc and its chapters; choosing the focused tab again shows the whole book. Adding an arc or chapter (the keys, the buttons, the `+` tab) never focuses it: a narrowed cover goes back to the whole book so the new card shows, and only the tabs focus an arc or a chapter. See [interaction](../../interaction.md).

## Tokens

`level-fill-<hue>` (the cover and the rail), `level-fill-1..4`, `paper-ink` (tab ink), `frame-*`, `surface-*`. The tab's own colour is the chapter's or arc's hue.

## Don't

- Don't add a second column or a page area to the cover: it is one column.
- Don't put tab text horizontally; it runs vertically like a real tabbed book.
- Don't change a page edge's colour per arc: the edges are the book's; the tabs carry the arc and chapter colours.
