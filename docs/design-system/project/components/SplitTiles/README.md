# Tiles, split grid and dividers

Every console is **one global tile** on a split grid: the Dash and Project levels at Max, the Draft page, the Schedule console, the Reader's pages and the User, Admin and Helper panels. The grid always fills its area exactly; you rearrange it by dragging, and every console has a **tab bar** with one icon per tile.

Code: `components/tiles/TileArea.tsx` (the Writer imports it as `writer/SplitArea.tsx`) on `splitTree.ts`, `tileDrop.ts`, `Divider.tsx`, `useSplitLayout.ts`, `TileTabBar.tsx`.

## Anatomy

- **Area** `.gtScroll` (`.wrSplit` in the Writer): a stage the size of its container; tiles and dividers are positioned from a **split tree** (rows and columns, tiles at the leaves).
- **Tile** `section.gtTile` (`.wrTabTile.wrSplitTile` in the Writer): a `level-fill-2` ground in the Writer, the raised surface elsewhere. A **title bar** `.gtTitle` (11px bold uppercase, 1px tracking, `level-fill-3`) holds a grip, the tile's icon at 14 and its name, the tile's own controls, then **Maximize** where a tile asks. There is **no Minimize button**: a tile is turned off and on in its rail. It is the **drag handle**. The **body** `.gtBody` scrolls on its own.
- **Rails** `.tileTabBar`: 30px icon buttons (24px in a title bar), one per tile, pressed while the tile is open. A minimized tile is an icon here that is not pressed. There are two tiers: the **console tabs** of a panel or level (Settings and Help always among them, last, never in a tile rail) and the **tile tabs** of a console, which sit in the console tile's own title bar (`barHost`); a tile area always has a rail.
- **Gap** `.gtGap`: the dashed, accent-tinted slot a dragged tile would land in.
- **Divider** `.tileDivider` between two tiles: a 2px line, shown on hover and focus; row dividers resize columns, column dividers rows.
- **Spacing** 8px between tiles, nowhere else (`space-grid`).

## Behaviour

Drag a title bar. The tile under the pointer is cut into nine zones:

| zone | drop |
|---|---|
| middle | the two tiles swap places |
| top, bottom (middle cells) | inserted above or below it, in its column |
| left, right (middle cells) | inserted left or right of it, in its row |
| a corner | a new row or column **across the whole grid** at the nearer outer edge, when the tile touches that edge; otherwise the edge cell beside it |
| a divider | wedged in as a new side there |
| the tab bar | minimized |

While dragging, the others **slide** (0.16s, none under reduced motion) to open the gap, and the dragged tile follows the pointer at full opacity; Escape puts everything back. Turn a tile off by un-pressing its icon in the rail or by dropping it on the rail; press its icon to restore it to its old slot, or drag the icon into the grid to put it where it is dropped; icons can be dragged to reorder where a console allows. Where there is no room nothing is offered. Below 400px the tiles stack in one column. The layout is remembered per console. There is **no keyboard shortcut for rearranging**: arrows move focus between title bars, and a focused divider is nudged with the arrow keys. See [interaction](../../interaction.md).

## Tokens

`level-fill-2`, `level-fill-3`, `level-ink`; a console sets `--gt-fill`, `--gt-title-fill`, `--gt-ink` and `--gt-accent` for its own colours. `space-grid`, `one-column-below`.

## You provide

`gridId` (the key the layout is remembered under), `tiles` (`id`, `title`, `Icon`, `children`; `bodyClassName` for a surface or flush body; `titleExtras`; `maximizable`; `railless` for a tile its console turns on and off), `bar` for the inline rail and `barHost` to put it in a title bar, and optionally `defaultTree`, a split tree to start from (`columnsTree(ids)` makes two alternating columns), and `minimized` / `onMinimizedChange`, `maximized` / `onMaximizedChange` when the console decides those itself.

## Don't

- Don't make the whole tile draggable: it holds fields and text.
- Don't put padding on the area or gaps between tiles beyond `space-grid`; the grid is exact.
- Don't use it for a list: a tile is a panel of a screen, not a row.
- Don't add a keyboard way to rearrange tiles, or a second tile look: every console uses this one.
