# Maps (the setting builder)

The **Maps** console is where the book's setting is mapped. It is a tab of the Writer's **Project** level (after Project, before History), with the folded-map icon. A map is a grid of terrain cells painted with the pointer; maps nest (a town inside a world map), and each has layers.

Code: `writer/maps/` (`MapsConsole.tsx`, `MapList.tsx`, `MapCanvas.tsx`, `MapSide.tsx`, `MapFields.tsx`, `useMaps.ts`, `mapModel.ts`, `mapView.ts`, `mapRender.ts`, `maps.scss`). Storage: the project's `maps` section (`project.json`), one entry per map; the API is `/api/projects/{id}/maps`.

## Anatomy

`.mapPage` holds a bar (the title, the **tools**, the **Save cluster**) and `.mapSplit`: the **list** (`.mapList`, 220px), the **stage** (`.mapStage`: the canvas and a status line) and the **side** (`.mapSide`, 280px: Terrain, Layers, Map). Below 860px of its own width the parts stack. The console sits on the tab's surface in the ink colour.

- **Tools** (icon buttons, `aria-pressed`): **Paint** (brush), **Fill an area**, **Pick up a terrain** (the dropper) and **Move the view** (the hand); then the brush width (1, 2 or 3 cells) and the **grid** toggle. The middle or right mouse button pans with any tool; the wheel zooms at the pointer; the view buttons at the canvas corner zoom in and out and **fit** the map.
- **List**: each map with the maps inside it under it (indented), its size, and a delete that asks first (the maps inside move up). The plus opens the **New map** form: title, kind (world or region, town or city, interior), a size (Small 32×24, Medium 64×48, Large 128×96, Huge 256×192, Largest 512×512, or any width and height up to 512), what one cell is (a number and a unit: miles, paces, feet ...), and the map it is inside.
- **Terrain**: the palette of the open map (each kind starts with its own set; a map keeps its own copy). A row is a swatch, the name and the share of the map it covers. The chosen terrain is what the brush and the fill paint; below it, its colour, name and a remove (it asks when cells use it, and says they become the first terrain). The plus adds a terrain of your own.
- **Layers**: terrain, regions and lines, symbols, labels, notes (bottom to top; listed top first). Each has **show / hide**, **lock**, a name, **move up / down** and delete (never the terrain layer). Hidden or locked terrain cannot be painted; the console says so. Symbols, labels and shapes arrive in later updates.
- **Map**: title, kind, width and height (a new size keeps the painted cells from the top left), the size of a cell and its unit.

## The canvas

A bitmap of one pixel per cell is scaled up without smoothing, so each cell is a crisp square; the grid shows once a cell is 6 pixels or more. The frame, the grid and the brush outline take the **ink colour**; the colours of the terrain are the author's, set inline (the only colours not from a token). A stroke is **one undo step**; the Save cluster's Undo and Redo (Ctrl+Z, Ctrl+Shift+Z) work per map and are kept while the project is open. The canvas is `role="img"` with the map's name and size; painting is by pointer.

## Saving

As everywhere in the Writer: **autosave is off by default**, so an edit waits for the Save button (or the autosave wait, or leaving the page or the map). The whole map goes in one request. Opening another map saves what is waiting first. A failed save rings the Save button and keeps the edit.

## Tokens

Surfaces `surface-side`, `surface-raised`, `ov-sink-1`, `ov-sink-2`, `hairline`; text `ink`, `ink-muted`; `accent` for the chosen row, tool and terrain; `alert` for a refused save. Space and type from the scales. No literal colours in the chrome.

## Don't

- Don't put a literal colour in the chrome: only a terrain's own colour is data.
- Don't make a button text-only: the tools are icons with a label and a title.
- Don't paint with the pointer events of the page: the canvas owns them (touch-action none).
