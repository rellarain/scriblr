# Schedule console and Dash

The Dash level is the writer's desk across every project. Its **Schedule** tab is one console for managing a project: goals for every facet, the activity of the last year (a grid or lines), a week of shifts with the backlog beside it, analytics and a review. Beside it sit the scratchpad and the project tiles (each a shelf in **its own project's colour**, its hue or else the default, so the shelves differ and a colour changed in Project settings shows on its shelf at once).

The same console is the **Project level's Schedule tab**, over that project alone. (It replaces the Dash's Schedule, Checklist and Analytics tabs and the Project's Schedule placeholder and Analytics tab.)

Code: `writer/schedule/` (`ScheduleConsole.tsx` and a file for each tile), `lib/scheduleCalendar.ts`, `lib/projection.ts`, `lib/recurrence.ts`, `lib/shiftEdit.ts`, `lib/timeline.ts`, `writer/Dashboard.tsx` (`Scratchpad`), `writer/levels/dashTabs.tsx`, `levelBodies.tsx` (`ProjectTiles`); `styles/_schedule.scss`. A mockup of the console in the Day and Night zones is kept in [`../../../mockups/schedule-console/`](../../../mockups/schedule-console/).

## The console's tiles

The console is its own [split grid](../SplitTiles/README.md) inside the tab (saved as `scriblr.writer.schedule.tiles.<dash|project>`), with six tiles, each of which can be dragged by its title bar and resized by a divider. At Mid the tab shows today's shifts and the counts only.

- **Goals** (`GoalsCard`): this week's words, words a writing day, the streak and the best streak, then each goal. A goal is for a **facet** (Outline, Plot, Draft, Revision, Project) and a scope (the project, a book or a chapter), with a daily, a weekly and a total target and an optional **deadline**. It shows its progress as a meter in the facet's colour, today's and the week's share, and a status chip: **▲ Ahead**, **● On track**, **▼ Behind** or **✓ Done**, from the pace of the last 28 days against the pace the deadline needs (the glyph, not only the colour, says which). At the Dash the account's own goals and each project's are listed, each tagged.
- **Review**: a week or a month of each facet against the one before it, and how many days had any work.
- **Activity** (`ActivityCard`, `ActivityControls`): the chart takes the whole height of the tile. Its toggles are in the **title bar, on the right** (a smaller, closer button than one in a tile's body): the facets to show (several, all on to begin with, at least one stays on), the chart as two icons (**Grid**, **Line graph**) and, for the grid, what the shades are measured against: **%** of the daily goal or **#** against the busiest day (a facet without a daily goal uses the busiest day). There is no legend and no footnote under the chart.
- **Schedule** (`ScheduleCard`): Day, Week, Month and Agenda views like a calendar; see below.
- **Backlog** (`Backlog`): its own tile, beside the schedule. Overdue routines (**Priority**), those due today, those inside their range (low priority), the tasks not on a shift (drag one onto a shift to assign it), the paused routines and, folded, those coming up; and an add box for a task and a routine.
- **Analytics** (`AnalyticsCard`): words drafted a month by book; the outline's and the plot's growth by kind; revision flags applied and resolved a week; and when in the week the work happens (the days whose events are still kept).

## The activity grid

`.wrSchedCal`. A square (square-cornered, like everything on a level) for each day of the last **52 weeks**, all the same size, the side set so the seven rows and the months' row fill the tile (8px to 40px; 14px until measured), a week to a column, the week starting on **Monday** (or Sunday: a setting). One letter beside **every** row (M T W T F S S), **between the monthly bars and the grid**. Above the columns each month is a **rectangle** with its whole name, over the columns of the weeks that begin in it. **Today** has a 2px outline in the level's ink (white) **inside** its square, with a 2px gap of the tile's colour before the shade, so it shows on the lightest step too.

A cell is shaded in four steps of the **accent hue**, saturated **mid tones** (OKLCH lightness 0.67, 0.72, 0.77 and 0.82 at chroma 0.17, so every hue steps alike; `CAL_STEPS` in `theme/zoneLooks.ts`), never white or black, by the **highest** of the selected facets' levels: against the daily goal where there is one (a goal met is the darkest step; the hover says "goal met"), else against that facet's busiest day. The hover names each facet's count: "Sat, Oct 31 · Outline 2 nodes · Draft 1,808 words".

Before the 12 months, each older month is a **bar** one column wide and seven rows tall, stacked by facet (each facet scaled by its own busiest month so that words and nodes can share a bar), its height the share of the busiest month's average a day. A rectangle over the bars gives the **year** (one for each year's run of bars, like the months over the weeks), and the **month's number** (1 to 12) is under each bar. The grid opens at the latest weeks and scrolls sideways by touch or **Shift + the wheel**; the plain wheel still scrolls the page. The day letters stay at the left edge of what is on view (`position: sticky`).

## The line graph

`.wrSchedLine`. One line per facet that has a **total goal**: the share of that goal done over time, 0 to 100%, with a daily point for the last 12 months and a monthly one before. Past today the line carries on **dotted** at the last 28 days' pace until it reaches 100% or the deadline (a vertical rule). Each facet's end marker has its own shape (circle, square, diamond, triangle, cross), so colour is never the only cue. Hover, or the left and right arrow keys on the focused chart (Shift for a week), read every value on a day.

## Facet colours

`--wr-f-outline`, `-plot`, `-draft`, `-revision`, `-project` are set on the console from five hues the user picks (Settings, in the Schedule tile). The saturation and lightness are one pair for every zone (`FACET_COLOR` in `theme/zoneLooks.ts`), light enough to read on the level's dark fill, so a line, a dot or a bar reads on the tile (3:1) whatever hue is picked; the contrast page audits every facet hue on every level hue.

## The schedule

- **Shifts** are blocks on a day, snapped to 10 minutes. Drag across empty time to make one; drag a block to move it (across days in the week view) or its top or bottom edge to resize it; click it, or press Enter on it, to edit it; right-click, or press and hold on a touch screen, for **Edit, Duplicate, Skip this day, Delete**.
- A shift that repeats asks **This day, This and following, or All of them** when it is changed.
- **Each ten minutes is judged by itself.** A slot is *done* when its shift's facet logged something in it and *missed* when not; a thin strip down the block's right edge shows each slot (solid, or hatched when missed). The block says **Upcoming, In progress, Done, Partly done** or **Missed** in words.
- The editor sets the title, facet, day, time, an aim (words, nodes, flags or items), what it is on, how it repeats (every N days; on chosen days every N weeks; until a date), pauses, and the **checklist items assigned to it**, ticked per day.
- **Routines** come round daily, weekly, or after an interval of days, weeks or months. An interval can be a **range** (every 7-10 days): inside it the routine is low priority but can be ticked, and past it the routine goes to the top as **Priority**. A routine can be **paused** for a length of time (skipped, not missed). **Rest days** (Settings) pause the routines and skip the shifts, and do not break a streak.
- **Deadlines** sit in a strip under the day's name, and on the month.
- Settings also holds the week's first day, the facet colours, a reminder before each shift (a desktop notification), the project's timeline, **Export shifts (.ics)** and **Print the week**.

## Tokens

The console sits on the level it belongs to, so it uses the **level's tokens** like the other tabs ([level colours](../../level-colours.md)): the Schedule tab itself is on the level's fill like every other console (never the light surface), the console's tiles are one step deeper on `--wr-fill-3`, and a card, a day column, a shift's card behind it, a tile's title bar, a header, a chosen button's text and a menu are on `--wr-fill-4`; text in `--level-ink` (white) and `--level-ink-soft`; lines in `--level-line`, a button's wash in `--level-wash`; a field in `--level-input`, `--level-input-ink` and `--level-input-hint`; `--wr-f-*` for the facets. A chosen button, today's head and a Priority tag are inverted (`--level-ink` with `--wr-fill-4` for the text). The grid's shades are `--wr-cal-1` to `--wr-cal-4` (the accent hue in OKLCH); the lowest is audited at 3:1 on the tile in every hue. Text is 12px or 13px; 11px is for a shift's time only. The facet pairs are in the [contrast audit](../../contrast.md) (group *Schedule*), the rest in *Level panels*.

## Don't

- Don't colour a number: the figure is in the ink on the tile; state is in a bar's length, a chip's glyph and word, not only its hue.
- Don't show a chart without its value in text (a hover, an `aria-label`).
- Don't write a literal white or black for the today ring or the line axis: use `--level-ink`. Don't set the tile's own light background or `ink`: the console is on the level's dark fill, and a button or a field not restyled for it turns pale on pale.
- Don't put a scrollbar on the grid: it scrolls by touch and Shift + wheel (see [interaction](../../interaction.md)).
