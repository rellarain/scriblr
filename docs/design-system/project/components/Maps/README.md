# Maps (the setting builder)

The **Maps** console is where the book's setting is mapped. It is a tab of the Writer's **Project** level (after Project, before History), with the folded-map icon. A map is a grid of terrain cells painted with the pointer; maps nest (a town inside a world map), and each has layers.

Code: `writer/maps/` (`MapsConsole.tsx`, `MapList.tsx`, `MapCanvas.tsx`, `MapSide.tsx`, `MapFields.tsx`, `useMaps.ts`, `mapModel.ts`, `mapItems.ts`, `mapSymbols.ts`, `mapThemes.ts`, `mapView.ts`, `mapRender.ts`, `mapDrawItems.ts`, `maps.scss`). Storage: the project's `maps` section (`project.json`), one entry per map; the API is `/api/projects/{id}/maps`.

## Anatomy

`.mapPage` holds a bar (the title, the **tools**, the **Save cluster**) and `.mapSplit`: the **list** (`.mapList`, 220px), the **stage** (`.mapStage`: the canvas and a status line) and the **side** (`.mapSide`, 280px: the chosen thing, Terrain, Symbols, Layers, Map). Below 860px of its own width the parts stack. The console sits on the tab's surface in the ink colour.

- **Tools** (icon buttons, `aria-pressed`): **Select and move** (the pointer), **Paint** (brush), **Fill an area**, **Pick up a terrain** (the dropper), **Stamp a symbol**, **Place a label** and **Move the view** (the hand); then the brush width (1, 2 or 3 cells) and the **grid** toggle. The middle or right mouse button pans with any tool; the wheel zooms at the pointer; the view buttons at the canvas corner zoom in and out and **fit** the map.
- **List**: each map with the maps inside it under it (indented), its size, and a delete that asks first (the maps inside move up). The plus opens the **New map** form: title, kind (world or region, town or city, interior), a size (Small 32×24, Medium 64×48, Large 128×96, Huge 256×192, Largest 512×512, or any width and height up to 512), what one cell is (a number and a unit: miles, paces, feet ...), and the map it is inside.
- **Terrain**: the palette of the open map (each kind starts with its own set; a map keeps its own copy). A row is a swatch, the name and the share of the map it covers. The chosen terrain is what the brush and the fill paint; below it, its colour, name and a remove (it asks when cells use it, and says they become the first terrain). The plus adds a terrain of your own.
- **Layers**: terrain, regions and lines, symbols, labels, notes (bottom to top; listed top first, and drawn in that order, so a symbols layer above the labels draws over them). Each has **show / hide**, **lock**, a name, **move up / down** and delete (never the terrain layer; deleting a layer takes the symbols and labels on it, and an undo brings them back). Hidden or locked terrain cannot be painted, and a symbol or label goes on the top layer of its kind that is shown and not locked; the console says so when there is none. Regions and lines arrive in a later update.
- **Map**: title, kind, width and height (a new size keeps the painted cells from the top left), the size of a cell and its unit, the **look** (Parchment, Modern, Night or Blueprint) and three check boxes for what is drawn over the map: **Scale bar**, **Compass** and **Legend**.
- **Symbols** (`.mapSymbols`): four sets as chips (**Settlements**, **Nature**, **Interior**, **Landmarks and travel**) and, for the set, a grid of square buttons, each the symbol's own silhouette in the ink colour (`aria-pressed` on the one that is chosen). Picking one picks the Stamp tool. "New symbols are N cells wide" sets the size a stamp is made at.
- **Chosen thing** (top of the side, only while something is chosen): a **symbol** has its width in cells, its **colour** (a button takes it back to the colour of the look) and a delete; a **label** has its **text** (it takes the cursor when it has just been placed), its height in cells and a delete. Drag it with the Select tool, or move it with the arrow keys (a cell; Shift a quarter), Delete removes it, Escape lets go.

## The canvas

A bitmap of one pixel per cell is scaled up without smoothing, so each cell is a crisp square, then the layers above it in their order; the grid shows once a cell is 6 pixels or more. **Symbols** are one SVG path each in a 24 by 24 box (`mapSymbols.ts`), drawn in their own colour or the look's, over a halo of the look's paper colour; **labels** are drawn over the same kind of halo, and left out when they would be under 6 pixels tall. Things are placed in cells (a symbol's or label's centre), snapped to the middle of a cell (Alt while placing or dragging: free), so they keep their place when the view zooms. The **scale bar** (a round length, 1, 2 or 5 times a power of ten, of about 110 pixels), the **compass** (north is up) and the **legend** (the terrains that are used and the kinds of symbol on the map) sit in corners of the map on a plate, and are left out when the map is too small on the canvas to hold them. The frame round the map takes the **ink colour** of the page; the colours of the terrain are the author's, and everything drawn over it (symbols, text, grid, plates) is in the colours of the map's **look** (`mapThemes.ts`: ink, symbol, halo, plate and typeface per look; Parchment fades the terrain towards old paper, Night darkens it, Blueprint draws it in shades of one blue, Modern shows it as it is). These are the map's art, set in code, and the only colours that are not tokens. A stroke is **one undo step**; the Save cluster's Undo and Redo (Ctrl+Z, Ctrl+Shift+Z) work per map and are kept while the project is open. The canvas is `role="img"` with the map's name and size; painting is by pointer.

## Saving

As everywhere in the Writer: **autosave is off by default**, so an edit waits for the Save button (or the autosave wait, or leaving the page or the map). The whole map goes in one request. Opening another map saves what is waiting first. A failed save rings the Save button and keeps the edit.

## Tokens

Surfaces `surface-side`, `surface-raised`, `ov-sink-1`, `ov-sink-2`, `hairline`; text `ink`, `ink-muted`; `accent` for the chosen row, tool and terrain; `alert` for a refused save. Space and type from the scales. No literal colours in the chrome.

## Don't

- Don't put a literal colour in the chrome: only a terrain's own colour is data.
- Don't make a button text-only: the tools are icons with a label and a title.
- Don't paint with the pointer events of the page: the canvas owns them (touch-action none).
