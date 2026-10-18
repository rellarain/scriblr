# Spacing, shape and elevation

The Writer is **flat and square**. Depth is a step in colour, not a shadow; panels butt up against each other with a small gap, and a split grid has no gaps that are not its own. Code: `writer.scss` (the "flat and square" block near the end), `components/tiles/` for the grid.

## Shape

- **No radius on a surface or a field** (`radius-none`): levels, tiles (the tile grid, its minimised rail and its console too), tabs, page edges, cards, notes, project cards, the Theme panel and its swatches, the helper and admin screens' cards, fields and counts, **chips** (the tag with an x, the chip add box) and every field on a level. The level and card rules set `border-radius: 0` after their own, so a stray rounded rule does not leak through.
- **Buttons keep their small radius** where they have one (`radius-button`, 4px; the Theme panel's are 6px): the header, a tile's title button, the zone tabs. On a level the **header tab buttons, the tab bar that holds them, and the Undo, Redo and Save buttons with the container that holds them** are rounded (`radius-button`); the other small, icon and toggle buttons on a level are square (`radius-none`).
- **Rounded only where it reads as a control on paper**: inputs and buttons on the sheet and the segmented switch (`radius-input`, 4px), the toggle switch and its knob.
- A book is the exception that proves it: the spine front has a 3px right corner, and the page edges are square steps.

## Depth

A level is a flat fill. What sits inside steps one shade deeper each time: a level body is `level-fill-1` (the fill mixed with 10% black), a tile `level-fill-2`, a tile's title bar `level-fill-3`, a note or card `level-fill-3`, an editing note `level-fill-4`. On the paper the five nested cards (`frame-1..5`) do the same. The last step is always a **light input** (a field is `hsl(theme, 28%, 96%)` with dark text on a level, `paper-field` on the paper).

Borders are mostly **inset shadows or 1px lines in a token colour**, not drawn borders: a tile's, card's or note's edge is `hairline` (a card is `surface-raised`, one flat colour, with that hairline where it would otherwise merge with its ground); a card on paper has a 1px `paper-line`; an arc or chapter card has a 5px left stripe in its own colour (`--wr-node-tint`). Focus is `outline: 2px solid` in the accent's light shade, offset inside the control.

Shadows are few (`tokens.json`, `shadow-*`) and are for what floats over content or stands in front of it: a page-edge tab, the raised tab, the book cover beside its page edges, a spine, the time popover. They are black at a fixed alpha, softened by 0.55 in a light zone (`--shade-k`). A card, a tile and a note have none.

## Dragged and disabled

A dragged card or tile is 70% opaque, a disabled control 60%. Text inside stays readable (the quiet-text floor is 80%, and a test holds it).

## Spacing

Gaps are small and come from a short list (`space-*`): 2, 4, 6, 8, 10, 12, 14, 18. They are CSS custom properties on `:root` (`--space-1` to `--space-7`, `--space-grid`, `--tab-size`, `--radius-*`, in `frontend/src/theme/_space.scss`), and a gap, padding or margin in the Writer's stylesheets that is one of the scale's values is written as the token (`gap: var(--space-3)`); a test keeps the file equal to `tokens.json` and fails on a literal. The 8 is `space-grid`, the split grid's gap, and is still written as a number where it is something else's gap.

| Where | Value |
|---|---|
| between the levels, and padding of the stack | 6 |
| between tiles on a split grid (`space-grid`), and across a divider | 8 |
| a level header | min height 40, padding 6 / 14 |
| a level body | padding 8 / 12 / 12 |
| a tile body | padding 10, gap 10 |
| between stacked cards | 10 (outline) to 12 (dashboard) |
| a header tab or quick action | 30 x 30, 2 apart, icons 18 |
| the paper page | padding 26 / 34 |
| a nested card | 12, then 10 / 12, then 8 / 10 down the levels |

## The split grid

Tiles on a split grid (`SplitArea`) always fill their area exactly: a tree of splits, tiles at the leaves, dividers between. Nothing is ragged and nothing is left over. A divider is a 2px line that shows on hover and is wide enough to grab; dropping a tile on it wedges the tile in as a new column or row. Below **400px** the tiles stack in one column. Layout is remembered per level.

## Breakpoints

The Writer answers to the width of the **element** it is in, not the window, because its tiles are resized by their neighbours. The widths that change a layout:

| Width | Of | What changes |
|---|---|---|
| under 1,000px | the window | the side column (the levels beside the focused one) hides itself (`AUTO_HIDE_BELOW`); it can be shown again by hand |
| 200px to 60% | the side column | the range its drag handle holds it in (`SIDE_MIN_W`, `SIDE_MAX_FRACTION`); the same limits are in the CSS, so a window that shrinks keeps a stored width |
| under 720px | the Plot tool | one column: the contents become a bar on top (`PLOT_COMPACT_BELOW`) |
| 720px to 1,040px | the Plot tool | the contents beside the editor, a plotline's chapters panel under its fields; from 1,040px (`PLOT_WIDE_FROM`) the chapters sit beside the fields |
| 860px and up | the compare view | the plotlines sit side by side in columns (`COMPARE_COLUMNS_FROM`) |
| under 400px | a split grid | the tiles stack in one column |

The Plot tool and the compare view read their width once per breakpoint crossed, not once per pixel dragged (`useElementWidth(breakpoints)`), so resizing a tile does not redraw them continuously.

## Page edges

The edge rail beside a book (`EdgeTabs`) is 10 or more stacked page edges, each 4px further out and a little deeper than the one before (`color-mix` of the page edge with black), 15px of back cover beyond the last. Each arc's tabs start at their own edge, the first group from the second.

## Motion

Short and quiet. The theme fades between palettes over 1s (off while a settings slider is dragged, and under `prefers-reduced-motion`). A spine turns to its cover over 0.45s. A drop gap opens in 0.15s, a goal bar fills in 0.3s, a segmented label slides in 0.25s, the save bubble in 0.12s, a divider changes in 0.1s. Nothing bounces. Motion is dropped for `prefers-reduced-motion`, everywhere, by one rule in `style/base.css`.
