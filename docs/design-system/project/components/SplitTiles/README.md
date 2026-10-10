# Tiles, split grid and dividers

At Max the Dash and Project levels open their tabs as **tiles on a split grid**, and the Draft level's page is three tiles on the same grid. The grid always fills its area exactly; you rearrange it by dragging.

Code: `writer/SplitArea.tsx` on the engine in `components/tiles/` (`splitTree.ts`, `Divider.tsx`, `useSplitLayout.ts`, `tileDrag.ts`).

## Anatomy

- **Area** `.wrSplit`: a stage the size of its container; tiles and dividers are positioned from a **split tree** (rows and columns, tiles at the leaves).
- **Tile** `section.wrTabTile.wrSplitTile`: `level-fill-2` ground. A **title bar** `.wrTabTileTitle` (11px bold uppercase, 1px tracking, `level-fill-3`) holds a grip, the tab's icon at 14 and its name, and is the **drag handle**. The **body** `.wrTabTileBody` scrolls on its own.
- **Divider** `.tileDivider` between two tiles: a 2px line, shown on hover, focus and drop; row dividers resize columns, column dividers rows.
- **Gap** 8px between tiles, nowhere else (`space-grid`).

## Behaviour

Drag a title bar onto a tile to swap, onto a tile's outer quarter to split a new column or row, onto a divider to wedge in. Drag a divider, or focus it and use the arrow keys (Shift for bigger steps). Alt + arrow on a title bar swaps with the neighbour. Opening a tab grafts its tile onto the tree; closing prunes it. Below 400px the tiles stack in one column. The layout is remembered per level. See [interaction](../../interaction.md).

Drop states: the dragged tile is 50% opaque; a target tile gets a 2px inset outline (swap) or a 4px bar on the edge where the split will go; a divider thickens to 4px.

## Tokens

`level-fill-2`, `level-fill-3`, `level-ink`; drop and focus use the accent's light shade. `space-grid`, `one-column-below`.

## You provide

`gridId` (the key the layout is remembered under), `tiles` (`id`, `title`, `Icon`, `children`; `bodyClassName` for a surface or flush body) and optionally `defaultTree`, a split tree to start from (`columnsTree(ids)` makes two alternating columns).

## Don't

- Don't make the whole tile draggable: it holds fields and text.
- Don't put padding on the area or gaps between tiles beyond `space-grid`; the grid is exact.
- Don't use it for a list: a tile is a panel of a screen, not a row.
