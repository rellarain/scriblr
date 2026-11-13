# Map biomes and shapes (Admin > Configuration > Maps)

The page has two tabs (`MapsConfigConsole.tsx`, `role="tablist"`, the arrow keys move between them, the open one remembered on this computer): **Biomes** and **Shapes**. Each is its own list, published on its own.

The biomes are what colour the land of every map: a biome's colour is how it looks **at sea level**, and a map draws higher land lighter and lower land darker. The admin keeps **one list** here, published as a whole; every project draws its maps with the published list, and writers can add biomes of their own to a project (in the Maps console's Biomes panel).

Code: `admin/maps/` (`MapsConfigConsole.tsx`, `MapBiomesConsole.tsx`, `useMapBiomes.ts`, `mapBiomesModel.ts`, `MapShapesConsole.tsx`, `useMapShapeCatalog.ts`, `mapShapesModel.ts`, `mapBiomes.scss`); the store a map reads is `writer/maps/mapBiomes.ts`. Storage: `map-biomes.json` in the app's data folder (beside `presets.json`), backend `storage/map_biomes_store.py`; the API is `/api/map-biomes` (GET, PUT the draft, GET `/published`, POST `/publish`, `/discard`, `/restore/{version}`).

## The page

`.mbxPage` holds the bar (the title and the **Save cluster**), the publishing row and the list.

- **Publishing row** (`.mbxState`): where the list stands ("Published v3 on 13 Nov 2026 · the list has changes that are not published"), **Publish v4** (the primary button; disabled, with the reason as its title, while a fault stands or nothing changed), **Discard changes** (the list as it is published) and **Bring back a version…** (a select of the published version and the twenty before it, and a check button that brings it into the list; it is published again only with Publish).
- **Faults** (`.mbxFaults`, an alert): a biome with no name, or two biomes of one name (the server's words, so the page and a refused publish say the same).
- **List** (`.mbxList`, "Biomes"): one card per biome (`.mbxItem`): its **colour** (the browser's colour picker), its **name** (40 characters), its **group** (Land, Water, Floor material, Space), **Move up / down** and **Remove** (asks in place). Under it, the **levels** it is offered on as chips (`.mbxChip`, `aria-pressed`): a biome that names none is offered on its group's levels ("as its group": land and water on planetary to local, floor materials on architectural and interior, space on the two space levels); the first change starts from those.
- **Add a biome** (the plus under the list; at most 128).
- **Retired** (a line under the list): biomes published before and taken out of the list stay in the published list as **retired**, so the maps that use them keep their colour; they are no longer offered.

A new install starts with the starter list published as version 1: saltwater, freshwater, desert, plain, forest, swamp, tundra, taiga, rocky, lava fields, savannah, jungle, mangrove, ice, beach, steppe, badlands, urban, farmland; the floor materials wood, stone, tile, marble, carpet, dirt, paving, grass, outside; and space. Tundra is a slightly gray white, so higher tundra can still read lighter.

## The Shapes tab

The **default shapes** every project offers in a map's Shapes panel: land forms, space objects, building parts and markers. Storage: `map-shapes.json` in the app's data folder (backend `storage/map_shapes_store.py`); the API is `/api/map-shapes` (as the biomes': GET, PUT the draft, GET `/published`, POST `/publish`, `/discard`, `/restore/{version}`). A new install publishes the starter set as version 1 (`backend/app/seed/map_shapes.json`, written from `writer/maps/mapShapeSeed.ts` by `npm run map-shapes`); a later build with new starter shapes adds them to the draft and the published list without touching the admin's own.

- The same bar, **Publishing row** and **Bring back a version…** as the biomes ("A published version of the shapes to bring back").
- **Faults**: two shapes of one kind with one name (the server's words).
- **Add from My shapes** (a select of the admin's My shapes, grouped by the project each came from, and a plus): an admin makes a default shape by drawing it on a map, choosing **Save to My shapes**, and adding it here. It gets an id from its kind and name (`land:round_hill`) that never changes. At most 300 shapes.
- **Kinds of shape** (chips with counts: All, Land forms, Space objects, Building parts, Markers) filter the list.
- **List** ("Shapes"): one card per shape: a small picture of it in the ink, its **name** (60 characters), its **kind** (a select), **Move up / down** among the shapes of its kind (the order the Shapes panel offers them in) and **Remove** (asks in place; shapes already on maps stay as they are). Under it, the **levels** it is offered on as chips: a shape that names none is offered on every level (all chips on, "every level"); turning one off starts from all of them, and turning the last one back on makes it "every level" again.

## Saving and publishing

As the Plot presets: edits save to the **draft** by the shared autosave (`useAutosave`, **off by default**, so the Save button is in the bar); **Publish** copies the draft to the published list, which is all that projects read; Publish, Discard and Bring back save what is waiting first. After a publish, the open project's maps are drawn with the new colours. **Reader editions** keep the colours they froze when the book was published.

## Tokens

Surfaces `surface-raised`, `ov-sink-1`, `ov-sink-2`, `ov-sink-3`, `hairline`; text `ink`, `ink-muted`; the admin accent (`accent`, which the Admin scope points at `accent2`) for the primary button and the chosen level chips, ink `on-accent`; `alert` for faults and the remove bar. A biome's colour is data and appears only in its colour picker.

## Don't

- Don't draw a default shape in a form: draw it on a map with the map's own tools, then add it from My shapes.

- Don't delete a published biome from a map's sight: removing it retires it, and maps keep its colour.
- Don't type a biome's id: it is made from its name and never changes, so maps and projects keep pointing at it.
- Don't put a biome colour in the chrome.
