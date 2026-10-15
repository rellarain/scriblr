# Level panels, headers and tabs

Four stacked levels make the Writer: **Dash**, **Project**, **Outline** (the open book) and **Draft** (the open chapter). Each is a `LevelPanel`: a flat fill of its colour, a header strip and a body. One level is the focus (Max); the one above is Mid, the rest Min; the ones below are not shown.

Code: `writer/levels/LevelPanel.tsx`, `WriterLevels.tsx`, `LevelTabs.tsx`, `levelSizes.ts`; styles `.wrLevel*` and `.wrTab*` in `writer.scss`.

## Anatomy

- **Panel** `.wrLevel` (`--dash`, `--project`, `--outline`, `--draft`; `--min`, `--mid`, `--max`). Its fill is `--wr-level-fill`: the level's hue at the accent's saturation less a little, a step deeper, held dark enough for white text ([level-colours](../../level-colours.md)). Its text is `--on-accent`, always white. The Dash is the app theme's own colour; the Draft is paper.
- **Header** `.wrLevelHeader`: min height 40, padding 8 / 22. The **title** (`.wrLevelTitle`, 14px bold, all caps, letter spacing 1.5px, line height 1.7) is a button that brings the level to focus; the title and the size toggle share one line (`.wrLevelTitleRow`), the toggle at its right end; the **tabs** (`.wrTabBar`, 30 x 30 `.wrTabBtn`, icons 18) and **quick actions** (`.wrQuickActions`: Search, Save; no header New button) sit at its right; at Mid a **chevron** (`.wrLevelToggle`) folds it to Min. In a narrow header the tabs and quick actions wrap beneath the title line.
- **Body** `.wrLevelBody`: `level-fill-1`, padding 8 / 12 / 12. At Min a level shows only its header (and a short body, e.g. book spines).

## Tabs

At Mid one tab shows at a time; at Max each tab opens or closes a tile on the split grid ([SplitTiles](../SplitTiles/README.md)). The tab strip ends with **Settings** and **Help**. A pressed tab (`.wrTabBtn--on`) is a darker wash of the header, `aria-pressed`. Tab bodies on a light **surface** (editors) use `--surface-side` with the ink, not the level's white.

## Tokens

`level-fill-<hue>`, `level-fill-1..4`, `level-ink`, `level-wash`, `ink`, `surface-side` (an editor tab). Header buttons are white at 16% over the fill.

## You provide

`level`, `size`, `title`, `hue` (the level's colour; none = the theme's), `onPromote`, `onSetSize`; `headerExtras` for the tabs; `minBody` for what a Min level shows; `headerless` where the body brings its own header (the Outline's book editor, the Draft's chapter tile). The tab list comes from `useTabbedLevel`.

## Don't

- Don't give a level a radius, a gradient or a shadow.
- Don't set text colour on a level except `inherit`: white is set once, by the panel.
- Don't nest more than the steps `level-fill-1..4` provide.

## Publishing a book, and what readers did

The **Book level** (Outline) has a **Publish** tab, between Book details and Settings (at Mid a tab; at Max a section of the book's cover). It puts the book in the Reader's library:

- **Publish the book**: a button that asks first ("Publish edition 2?"). An edition is a frozen copy of the chapters published so far with their published footnotes and flagged passages. Publishing again makes the next edition; **Unpublish** takes the book off sale and loan and keeps copies readers own and loans already made.
- **Details in the library**: type, buy price, blurb, genres, tags, tropes, an optional cover colour of its own, and the content flags (a name, the details a reader sees and the class it has by default: hidden, marked, highlight or spoiler). Saved with Save details; a new edition takes the saved details.
- **Invite readers**: a level for this reader account and for each seeded reader (alpha, delta or beta); the level set for this account is the level the Reader shows the book at.
- **Readers**: loans, sales, the author's share (a loan's first credit pays $3.00 and each more $1.00; a sale 70% of the price), the rating and reviews, and the readers' anonymous reactions by chapter (only from readers who share them). Money is simulated.

The **Dash** has a **Readers** tab listing every published book with its loans, sales, earnings and rating.

## Writing analytics

The **Project level's Analytics tab** and the **Dash's Analytics tab** carry the Reader's analytics, for writing. The Project's tab first shows each book's words against its own goal; both then show (`WritingAnalytics`):

- **This week**: words this week, words a writing day, the streak (days in a row with any writing, edits or revisions; a quiet today does not break it) and the best streak of the year.
- **Writing, last 12 months** `.wrCal`: the Reader's calendar, a 14px square for each day of 53 weeks, a week to a column, Sunday first, shaded in four steps of the accent by the day's share of the busiest day. Words, Edits and Revisions switch what it counts; a hover says "1,200 words on Oct 11". A day's words are the net change in the drafts that day, so a day that cut more than it wrote is a quiet one. Days are UTC, as the backend records them.
- **Words per day this week**: a bar for each of the last seven days.
- **Goals**: words a day and words a week, kept on this machine, each with a meter against today and this week.

At the Project level it is over that project; on the Dash, over every project. The calendar is the same component as the Reader's (`components/ActivityCalendar.tsx`, `lib/activityCalendar.ts`); the Writer draws it with the `wr` classes.

## The side column

Beside the focused level, the others sit in a **side column** (`.wrLevelsSide`): 280 to 460px wide (32% of the Writer) by default.

- **Resize**: a 10px handle (`.wrSideResizer`, `role="separator"`) on its right edge; a thin accent line shows on hover and while dragging. The width is held between **200px and 60%** of the Writer, shown live and kept on release; a double click puts it back to the default. At the Draft the column still lies over the page's left side, at the chosen width.
- **Hide**: the **sidebar button** in the app's header (`SidebarToggle`, icon `sidebar`; pressed = shown) hides it, and the focused level takes the whole width. It is disabled at the Dash, which has no side column.
- **Narrow windows**: until the button is pressed, the column is hidden by itself while the window is narrower than 1000px, and shown again when it grows.
- Both are kept on this machine (`scriblr.writer.sidebar`: `{ width, hidden }`; `null` = the default, or automatic).
