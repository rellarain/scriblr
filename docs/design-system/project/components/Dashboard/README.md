# Dashboard cards and analytics

The Dash level is the writer's desk across every project: schedule, checklist, analytics, a scratchpad, and the project tiles beside them.

Code: `writer/Dashboard.tsx` (`RoutinesPanel`, `TasksPanel`, `AnalyticsPanel`, `Scratchpad`), `writer/levels/dashTabs.tsx`, `levelBodies.tsx` (`ProjectTiles`).

## Anatomy

- **Tabs**: Schedule (routines), Checklist (tasks), Analytics, Scratchpad, Project template, Settings (the theme panel), Help. At Max each is a tile on the [split grid](../SplitTiles/README.md).
- **Routine and task lists** (`.wrCheckItem`): a checkbox in the accent, the text at 13px; a done item is struck through at 80% opacity. A quick-add field (`.wrInlineAdd`) sits under the list: a light input and an *Add* button.
- **Analytics** (`.wrStatRow`, `.wrBarRow`): big numbers (24px) over uppercase labels, and goal bars (`.wrBarTrack` black at 30%, `.wrBarFill` white at 85%) with a label and a value on one line.
- **Notes** (`.wrNote`): a title and a body, one step deeper (`level-fill-3`); the one being edited is `level-fill-4` with a 3px white left stripe. Enter adds a note.
- **Project tiles** beside the Dash (`.wrProjectsColumn`, `.wrProjectTile`): one flat tile per project in the project's own colour, with the book **shelf** inside.

## Tokens

`surface-*` (the Dash is the theme's own colour), `level-fill-1..4`, `ink`, `ink-muted`, `accent`. Counts are `ink` on the tile.

## Don't

- Don't colour a number: the figure is white on the tile; state is in a bar's length, not its hue.
- Don't show a chart without its value in text.
- Don't invent a new card style for a stat: use `.wrStatRow` and `.wrBarRow`.
