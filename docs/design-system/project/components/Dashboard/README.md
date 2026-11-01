# Schedule console and Dash

The Dash level is the writer's desk across every project. Its **Schedule** tab is one console for managing a project: goals for every facet, the activity of the last year (a grid or lines), a week of shifts with the backlog beside it, analytics and a review. Beside it sit the scratchpad and the project tiles (each a shelf in **its own project's colour**, its hue or else the default, so the shelves differ and a colour changed in Project settings shows on its shelf at once).

The same console is the **Project level's Schedule tab**, over that project alone. (It replaces the Dash's Schedule, Checklist and Analytics tabs and the Project's Schedule placeholder and Analytics tab.)

Code: `writer/schedule/` (`ScheduleConsole.tsx` and a file for each tile), `lib/scheduleCalendar.ts`, `lib/projection.ts`, `lib/recurrence.ts`, `lib/shiftEdit.ts`, `lib/timeline.ts`, `writer/Dashboard.tsx` (`Scratchpad`), `writer/levels/dashTabs.tsx`, `levelBodies.tsx` (`ProjectTiles`); `styles/_schedule.scss`. A mockup of the console in the Day and Night zones is kept in [`../../../mockups/schedule-console/`](../../../mockups/schedule-console/).

## The console's tiles

The console is its own [split grid](../SplitTiles/README.md) inside the tab (saved as `scriblr.writer.schedule.tiles.<dash|project>`), with six tiles, each of which can be dragged by its title bar and resized by a divider. At Mid the tab shows today's shifts and the counts only.

- **Goals** (`GoalsCard`): this week's words, words a writing day, the streak and the best streak, then each goal. A goal is for a **facet** (Outline, Plot, Draft, Revision, Project) and a scope (the project, a book or a chapter), with a daily, a weekly and a total target and an optional **deadline**. It shows its progress as a meter in the facet's colour, today's and the week's share, and a status chip: **▲ Ahead**, **● On track**, **▼ Behind** or **✓ Done**, from the pace of the last 28 days against the pace the deadline needs (the glyph, not only the colour, says which). At the Dash the account's own goals and each project's are listed, each tagged.
- **Review**: a week or a month of each facet against the one before it, and how many days had any work.
- **Activity** (`ActivityCard`, `ActivityControls`): the chart takes the whole height of the tile. Its toggles are in the **title bar**, in **up to three rows**: the **handle and the title are always the top row**; the **facet toggles wrap into a row below them** when the bar is too narrow to hold them beside the title; and the **chart and shade toggles wrap into a third row** below those, as **squares** (the same 26px squares as every icon button). In a wide tile they all sit on the top row, on the right. The toggles are smaller and closer than a button in a tile's body: the facets to show (several, all on to begin with, at least one stays on), the chart as two icons (**Grid**, **Line graph**) and, for the grid, what the shades are measured against: **%** of the daily goal or **#** against the busiest day (a facet without a daily goal uses the busiest day). There is no legend and no footnote under the chart.
- **Schedule** (`ScheduleCard`): Day, Week, Month, **Year** and Agenda views like a calendar; see below.
- **Backlog** (`Backlog`): its own tile, beside the schedule. Overdue routines (**Priority**), those due today, those inside their range (low priority), the tasks not on a shift (drag one onto a shift to assign it), the paused routines and, folded, those coming up; and an add box for a task and a routine.
- **Analytics** (`AnalyticsCard`): words drafted a month by book; the outline's and the plot's growth by kind; revision flags applied and resolved a week; and when in the week the work happens (the days whose events are still kept).

## The activity grid

`.wrSchedCal`. The Activity tile's margin round the calendar is **5px** (the other tiles' is 14px). The grid has **two orientations**, by the shape of its tile: **landscape** when the tile is wider than tall, **portrait** when it is taller than wide or square. A day is a cell. The grid **scrolls along its long side** (the wheel, a swipe, touch): sideways in landscape, down in portrait. There is no scrollbar (see [interaction](../../interaction.md)).

**Landscape.** A cell for each day of the last **52 weeks**, a week to a column with the oldest at the left, the week starting on **Monday** (or Sunday: a setting). One letter beside **every** row (M T W T F S S), **between the monthly bars and the grid**. Above the columns each month is a **rectangle** with its name **in capitals**, over the columns of the weeks that begin in it; the name is **abbreviated to fit** its rectangle (whole where it fits, three letters, then one), the whole name in the tooltip. The cells are **square** (8px to 40px) while the tile is tall enough, and are **squished in height** (down to 2px, 8px wide) when it is not, so the calendar is **never cut off vertically**. The **plain wheel scrolls it sideways** (at either end the page gets the wheel), and **resizing the tile keeps the current week at the right edge** (it does not stay at the left).

**Portrait.** The grid is an actual **calendar**. The day letters are across the top and under them each **month**, the newest first, is a **divider with its name in capitals** over its weeks, the newest week first (so **the current week is the top row**), each week a row of seven with a day in every place the month has: a week that spans two months is a row in both, each holding only its own days. The cells are **square** and as wide as the seven columns allow, 8px to 40px, so the months run down past the bottom of the tile: the wheel and touch scroll it **down** through them. The older months are bars under the weeks, **grouped by year**: a divider with the year, then that year's months' bars, newest first, each with its month's number at its right (see below).

**Today** has a 2px outline in the level's ink (white) **inside** its cell, with a 2px gap of the tile's colour before the shade, so it shows on the lightest step too. Cells are square-cornered, like everything on a level.

A cell is shaded in four steps of the **colour of the facet with the most activity that day** (the facet with the highest level; the larger share of its measure when levels tie; the accent hue where no facet applies), saturated **mid tones** (OKLCH lightness 0.67, 0.72, 0.77 and 0.82 at chroma 0.17, so every hue steps alike; `CAL_STEPS` in `theme/zoneLooks.ts`), never white or black, the step being the **highest** of the selected facets' levels: against the daily goal where there is one (a goal met is the darkest step; the hover says "goal met"), else against that facet's busiest day. The hover names each facet's count: "Sat, Oct 31 · Outline 2 nodes · Draft 1,808 words".

Before the 12 months, each older month is a **bar**, stacked by facet (each facet scaled by its own busiest month so that words and nodes can share a bar), its length the share of the busiest month's average a day. In landscape a bar is one column wide and seven rows tall, with a rectangle over the bars for each **year** and the **month's number** (1 to 12) under each bar; in portrait a bar is one row across the seven columns, newest first under the weeks, **grouped under a divider for its year**, with the month's number at the right. The day letters stay at the left edge of what is on view in landscape (`position: sticky`), and across the top in portrait.

## The line graph

`.wrSchedLine`. One line per facet that has a **total goal**: the share of that goal done over time, 0 to 100%, with a daily point for the last 12 months and a monthly one before. Past today the line carries on **dotted** at the last 28 days' pace until it reaches 100% or the deadline (a vertical rule). Each facet's end marker has its own shape (circle, square, diamond, triangle, cross), so colour is never the only cue. Hover, or the left and right arrow keys on the focused chart (Shift for a week), read every value on a day.

## Facet colours

`--wr-f-outline`, `-plot`, `-draft`, `-revision`, `-project` are set on the console from five hues the user picks (Settings, in the console's header; each is the app's colour range, a gradient of every hue at the facet colour's own saturation and lightness). The saturation and lightness are one pair for every zone (`FACET_COLOR` in `theme/zoneLooks.ts`), light enough to read on the level's dark fill, so a line, a dot or a bar reads on the tile (3:1) whatever hue is picked; the contrast page audits every facet hue on every level hue.

## The schedule

- **The tile is full height.** The day and week timeline (and the month grid) stretch to the height of the Schedule tile and scroll inside it; there is no fixed height. The timeline has **a row for every 10-minute slot** (144 a day, 20px each), each labelled with its time ("6:10 AM") on **one line**, never wrapped; the whole hours are brighter and bold, with a stronger line above them. It opens at 6 AM.

- **The year view** is twelve small calendars (their names in capitals), the days of the week as letters and each day a button: a day with a shift is **shaded in the colour of its first shift** (the same 26% mix as a shift's block, so it reads), has a **bar at its foot** when it has more than one, is **underlined** when a goal or the timeline is due, and is **outlined** when it is today. A click opens that day; Previous and Next move a year.
- **Shifts** are blocks on a day, snapped to 10 minutes. Drag across empty time to make one; drag a block to move it (across days in the week view) or its top or bottom edge to resize it; click it, or press Enter on it, to edit it; right-click, or press and hold on a touch screen, for **Edit, Duplicate, Skip this day, Delete**.
- A shift that repeats asks **This day, This and following, or All of them** when it is changed.
- **Each ten minutes is judged by itself.** A slot is *done* when its shift's facet logged something in it and *missed* when not; a thin strip down the block's right edge shows each slot (solid, or hatched when missed). The block says **Upcoming, In progress, Done, Partly done** or **Missed** in words.
- The editor sets the title, facet, day, time, an aim (words, nodes, flags or items), what it is on, how it repeats (every N days; on chosen days every N weeks; until a date), pauses, and the **checklist items assigned to it**, ticked per day.
- **Routines** come round daily, weekly, or after an interval of days, weeks or months. An interval can be a **range** (every 7-10 days): inside it the routine is low priority but can be ticked, and past it the routine goes to the top as **Priority**. A routine can be **paused** for a length of time (skipped, not missed). **Rest days** (Settings) pause the routines and skip the shifts, and do not break a streak.
- **Deadlines** sit in a strip under the day's name, and on the month.
- **Settings** is a **gear icon** button ("Schedule settings") at the right of the **console's header** (the title bar of the Schedule tab's tile, not a tile of the console), opening a panel over the console from its top right (Esc closes it). It holds the week's first day, the facet colours, a reminder before each shift (a desktop notification), the project's timeline, **Export shifts (.ics)** and **Print the week**.

## Tokens

The console sits on the level it belongs to, so it uses the **level's tokens** like the other tabs ([level colours](../../level-colours.md)): the Schedule tab itself is on the level's fill like every other console (never the light surface), the console's tiles are one step deeper on `--wr-fill-3`, and a card, a day column, a shift's card behind it, a tile's title bar, a header, a chosen button's text and a menu are on `--wr-fill-4`; text in `--level-ink` (white) and `--level-ink-soft`; lines in `--level-line`, a button's wash in `--level-wash`; a field in `--level-input`, `--level-input-ink` and `--level-input-hint`; `--wr-f-*` for the facets. A chosen button, today's head and a Priority tag are inverted (`--level-ink` with `--wr-fill-4` for the text). The grid's shades are four OKLCH steps of `--cal-src` (the day's leading facet colour, else the accent hue); the lowest is audited at 3:1 on the tile in every hue. Text is 12px or 13px; 11px is for a shift's time only. The facet pairs are in the [contrast audit](../../contrast.md) (group *Schedule*), the rest in *Level panels*.

## The calendar icons

The icons of the calendar's views, and of Today, are **one calendar page** with slight differences: a **single rounded square** with a **line across it 25% of the way down**, dividing a **narrow header** (the top quarter) from the **body** where the days would be (`PAGE` and `PAGE_LINE` in `assets/icons/index.tsx`).

| Icon | Header | Body | Mark |
|---|---|---|---|
| Year | filled | open | none |
| Month | open | filled | none |
| Week | open | open | a filled horizontal stripe across the middle of the body |
| Day | open | open | one filled square in the body |
| Today | open | open | the **day of the month** in the body (today's, 31 in the drawings) |

The Review's week and month switch uses the Week and Month icons.

## Buttons are icons

Every button in the console is an **icon** (`IconBtn`: the icon at **20px, never smaller**, in a **26px square**, its name as the accessible label and the tooltip). **All icon buttons are the same square**, in the title bars and the tiles alike (the `%` and `#` of the shade rule too); an icon is never squeezed under 20px by a flex box, and the grips and icons of the title bars of the console's own tiles and of the Schedule tab's tile are 20px as well: the gear for Settings; plus for a new goal, shift, task or rest days; a calendar page for Today; chevrons for Previous and Next; day, week, month and list icons for the calendar's views and week and month icons for the Review's; a pencil, a trash can, a tick and a cross for edit, remove, save and cancel; play and pause for a routine; an export arrow and a printer for the settings' export and print. Only a **choice that has no picture** stays text: the three answers to "Change which shifts?" (This day, This and following, All of them), the weekday letters, the context menu's items, the facet toggles (a colour dot and the facet's name) and a shift template's own name.

## Don't

- Don't colour a number: the figure is in the ink on the tile; state is in a bar's length, a chip's glyph and word, not only its hue.
- Don't show a chart without its value in text (a hover, an `aria-label`).
- Don't write a literal white or black for the today ring or the line axis: use `--level-ink`. Don't set the tile's own light background or `ink`: the console is on the level's dark fill, and a button or a field not restyled for it turns pale on pale.
- Don't put a scrollbar on the grid: it scrolls by the wheel and touch along its long side (see [interaction](../../interaction.md)).
