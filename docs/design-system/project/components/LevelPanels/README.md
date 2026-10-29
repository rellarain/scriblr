# Level panels, headers and tabs

Four stacked levels make the Writer: **Dash**, **Project**, **Outline** (the open book) and **Draft** (the open chapter). Each is a `LevelPanel`: a flat fill of its colour, a header strip and a body. One level is the focus (Max); the one above is Mid, the rest Min; the ones below are not shown.

Code: `writer/levels/LevelPanel.tsx`, `WriterLevels.tsx`, `LevelTabs.tsx`, `levelSizes.ts`; styles `.wrLevel*` in `writer/styles/_levels.scss` and `.wrTab*` in `_level-tabs.scss`.

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
- **Hide**: the **sidebar bar** in the app's header (`SidebarToggle`: a plain 6px vertical bar, no icon, left of the user card with 5px either side of it; lit in the accent colour = shown) hides it, and the focused level takes the whole width. It is disabled at the Dash, which has no side column.
- **Narrow windows**: until the button is pressed, the column is hidden by itself while the window is narrower than 1000px, and shown again when it grows.
- Both are kept on this machine (`scriblr.writer.sidebar`: `{ width, hidden }`; `null` = the default, or automatic).

## The Plot tool

The Project level's Plot tab (`PlotView`) follows **its own width**, not the window's (`useElementWidth`, the `data-size` of `.wrPlotFrame`):

| Width | Layout |
|---|---|
| wide, 1,040px and up | the contents column (250px) beside the editor; a plotline's fields beside its books-and-chapters panel |
| medium, 720 to 1,039px | contents beside the editor, but a plotline's chapters panel stands under its fields |
| compact, under 720px | **one column**: the contents are a bar on top (`.wrPlotBar`: where you are, as a trail, or "Comparing 3 plotlines") that folds down over the editor |

- **Order**: in the contents a category lists its own plotlines first, then its subcategories, and a subcategory its plotlines, then its clusters (each in title order).
- **Inherited fields**: a plotline's `From category / subcategory / cluster` groups put the parent's title first and the kind ("Category", "Subcategory", "Cluster") at the far right of the head, in the muted ink.
- **Fieldsets** (`FieldBlocks.tsx`, `_plot-fields.scss`): a category, subcategory, cluster or plotline can group some of its fields in named sets. Beside **+ Field** in a node's own group stands **+ Fieldset**, which adds an unnamed set whose name takes focus (left blank and empty it is dropped). A set (`.wrFieldSet`, `role="group"`, a sunk box inside the group) has a head of **chevron** (folds it; open at first, and the fold is **remembered per set**, so a set folded on its category stays folded on the plotlines under it), **grip** (drag to reorder the sets), its **name** (`.wrFieldSetName`, small bold capitals, 30 characters), a count, **+ Field** (adds a field to that set) and a trash that asks "Its N fields stay": deleting a set keeps its fields, loose. A node lists its **loose fields first, then its sets, then the plotline's Scrap field**. Drag a field by its grip onto a set to put it in (last), onto another field to sit before it in that field's set, and, while a field in a set is dragged, onto the **"Drop here to take it out of its set"** spot to make it loose; drag a set onto another to go before it, or onto "Drop here to move it last". A set passes down to the plotlines like its fields: read-only there (a name, a count, no grip, no trash), under the origin's own group. A plotline makes its own sets for its own fields, never putting them into an inherited set.
- **Folding a level**: three 10px circles at the top right of the contents (`.wrNavDot`) fold a whole level at once: categories, subcategories, clusters, left to right. A circle is **filled in the accent while any node of its level is open** (and its click closes them all), an outline when they are all closed (its click opens them all), and dimmed when no node of that level has anything under it. A **fourth circle** stands apart from them (`.wrNavDot--desc`, in `.wrNavTools`): an outline when the descriptions are hidden and **filled in the alert hue** when they are shown (see Descriptions); it is dimmed when no row has a description. Lit, it has a ring in the ink around it, so it stands out on a level's dark fill, where the alert hue alone is about 2:1. "+ Category" sits at the bottom of the contents.
- **Adding**: at the foot of the contents, **+ Category** (an empty category, opened at once) and **+ Preset** (`.wrPlotNavAddRow`) stand side by side. + Preset opens a menu of the published plot presets, a name with its description on each row; choosing one adds a whole category with its subcategories, clusters, fields, keywords and descriptions, as a plain copy, in one undo step, and opens it. See [Plot presets](../PlotPresets/README.md).
- **Descriptions**: hidden until the fourth circle is lit. Then a category, subcategory or cluster row shows its **whole description** under its name (`.wrNavDesc`, the small size, the row's own ink, wrapped over as many lines as it needs, line breaks kept). A plotline, or a row with no description, stays a single line. The choice is one setting for the contents, kept on this machine (`scriblr.writer.plotNavDescriptions`).
- **Ticking**: every row of the contents has a checkbox (`.wrNavCheck`, drawn by hand: a box, a tick, or a bar for part-ticked). A plotline's ticks that plotline; a category, subcategory or cluster ticks every plotline under it. "Compare (n)" and "Clear" show once any are ticked. The ticks are kept while browsing and reset with the project.
- **Compare** (`PlotCompare`): two or more ticked plotlines open it in place of the editor. Chips (one per plotline, in its plot colours and its stacked stripes) hide or show its cards, and an x unticks it. The plotpoints stand in **one list**, read-only: each card is a plotpoint tile with its trail, plotline and field, title, description and where it is placed ("2 · Storm", or "Not placed yet"); a click opens that plotline's editor. **Group by plotline** gives each plotline a header: side by side as columns from 860px, otherwise as sections that fold. The chapters panel, with every shown plotline's chips (each marked with its plotline's stripe), is beside the list when wide and a fold-out under it otherwise.
- **Parent chips** (`PlotParents`, `.wrParents`): above the title of a subcategory, cluster or plotline editor (and under each plotline's header in Compare's groups) stand its parents, top-down, as read-only chips, each in its own plot colour with the stacked 4px stripes of its place in the tree at its left (a cluster's chip: category, subcategory, cluster; the tile ink on a category, white on a subcategory's or cluster's fill: the audited pairs). A chip shows only the parent's title (14px bold capitals, 1.5px letter spacing, no kind label; the description, 14px, is its hover text and what the click opens). A click opens the chip to the whole description; its title then links to that parent's editor (in Compare it also leaves the comparison). A parent with no description is only its title, and the title links. Which chips are open is **remembered per level** while the tool is open: open the category chip and the subcategory chip on one plotline and the category and subcategory chips are open on every plotline, cluster or subcategory editor you go to next (whichever parents they have), and in Compare's group headers; closing a level's chip closes it everywhere. Chips wrap onto more lines on a narrow tile.
- **The contents in the compact layout** (`.wrPlotBarDrawer`) stand on the level's own fill (`wr-fill-2`) over the light tile, so they are read in the level ink: white (`on-accent`) for the label, the circles, "n selected" and "Clear", and the two add buttons are the level wash with that ink (the audited level pairs: white on `fill-2`, the header button wash). In the wide and medium layouts the contents are on the tile's light surface in the dark ink.
- **Order**: the toggle (`PlotOrderToggle`, shared with the Draft's chapter list and the Plotpoints tab) is two icon buttons: a **clock** for by time, an **open book** (`book-open`) for in story. Unassigned plotpoints come first.
