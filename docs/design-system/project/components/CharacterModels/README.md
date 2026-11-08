# Character models

Character models are the shapes characters will be drawn from: the body, the clothes and the hair, arranged in **groups** of **objects** made of **shapes**. They are **designed in the Admin console** (Configuration > Characters) and saved as drafts and published one by one, the way the Plot presets are. This is the first phase of the designer: it draws shapes and arranges them; it does not yet join them with pivots, give them forms, colours or poses (those come in later phases), and it stores nothing about any character.

Code: `admin/characters/` (`CharacterModelsConsole.tsx`, `ModelList.tsx`, `ModelPane.tsx`, `AssetTree.tsx`, `DesignerCanvas.tsx`, `Inspector.tsx`, `PreviewStrip.tsx`, `CheckPanel.tsx`, `TemplateMenu.tsx`, `designerState.ts`, `modelContent.ts`, `useCharacterModels.ts`, `characterModels.scss`) and the pure drawing engine in `admin/characters/engine/` (`geometry.ts`, `templates.ts`, `edit.ts`, `history.ts`, `limits.ts`, `svgText.ts`, `previews.ts`). The reference mockup is `docs/mannequin-mockup/`.

## The page

`.cmSplit` holds the list (`.cmList`) and the open model (`.cmPane`). The page keeps the Admin's accent. Below 860px of its own width the list folds into one picker button (`.cmPick`) above the model, and the tree, the canvas and the inspector stack; below 1180px the inspector drops under the canvas.

- **List**: one row per model, its name and a **status badge** (`.cmBadge`): *Published v3*, *v3 · unpublished changes*, *Unpublished (was v2)*, *Not published*. Each state has a shape as well as a colour (a tick, a filled dot, a hollow dot, a grey dot). Rows reorder by their grip or Alt + Arrow.
- **Tools** (`.cmTools`): the model's name, its status, then **Publish**, **Unpublish**, **Discard changes**, **Versions** (the published version and the ten before it, each with *Bring into draft*), **Duplicate** and **Delete** (which asks in place first). Publish stays disabled, and the Check panel says why, while the draft is not valid.
- **Tree** (`.cmTree`): three layers, **Body, Clothing and Hair**; under each, the groups that have an object on it, their objects and the objects' shapes. A row selects what it names; the buttons add a group, an object (+ beside a layer) or a shape (a template menu beside an object), copy and delete, and move a shape earlier or later in the draw order. It has a search. Counts beside groups and objects turn bold with a bar under them above the warning limit.
- **Canvas** (`.cmCanvas`, an SVG): the shapes in a neutral token (the selection in the accent, the rest dimmed), a grid, the **mirror line** at the centre, and, for the selected shape in the point editor, its **points** and the **curve handles** of the selected point. Left button: select a shape, drag a point or a handle, or (in move mode) the whole shape. Double-click an edge: add a point there. **Right button: a click on the grid unselects everything and shows the end result; a click on a shape moves through point editor, move shape and unselected; a drag pans.** Arrow keys move the selected point (Shift: bigger steps; in move mode the whole shape), Delete removes the point, Escape unselects.
- **Toolbar** (`.cmToolbar`, icon buttons with a label and a title): undo, redo, point editor, move shape, mirror editing, snap, grid, zoom in and out, fit the whole figure, new shape from a template, and the inspector drawer. There are **no typed number fields**: points are moved by dragging and by the arrow keys.
- **Inspector** (`.cmInspector`, a drawer the toolbar folds away): the name, and for an object its layer; for a shape its view (both, front only, back only), its opacity, its template, and its points as numbered chips with the four **point modes** (curve, sharp, curve then sharp, sharp then curve), add a point after the selected one, delete it, reset its handles.
- **Previews** (`.cmStrip`, always on): the selection, or with nothing selected the whole model, at random sizes, tilts and backgrounds; *Random* with a re-roll, *Smallest* and *Largest* as stress previews, and three sizes. The tiles pair a shape token with a ground token so each is readable on all four backgrounds.
- **Checks** (`.cmCheck`): the size of a character's copy of the model, what stops Publish, and which limits the model is at or past.

## Limits

| What | Warns above | Stops at |
|---|---|---|
| Points in a shape | 24 | 60 |
| Objects in a group | 24 | 48 |
| Shapes in an object | 36 | 72 |
| A character's copy of a model | 150 KB | 250 KB (Publish refused) |

The frontend numbers (`engine/limits.ts`) and the backend's (`schema.py`) are held equal by `schemaParity.test.ts`.

## Saving and publishing

Two layers, as in the Plot presets: every edit goes to the **draft** through the shared autosave (off by default; the Save button and its toggle are in the page's head), and **Publish** copies the draft to the published copy, refusing a draft that is not valid (no name, a name another published model has, a shape of fewer than three points, an object or group that points at something missing, a shape in two objects, a copy over the size limit). **Discard changes** returns the draft to the published copy; a model never published is cleared. New versions change nothing in characters that already use a model: a character will keep its own copy.

## Tokens

Surfaces: `surface-raised`, `surface-deep`, `hairline`; text: `ink`, `ink-muted`, `ink-faint`; the Admin accent for the selection, the active row and the primary buttons (ink `on-accent`); `alert` for the danger ring and a refused action. Shapes are drawn in `ink-muted` (the selection in `accent`) until the model has colour slots. All text is at least 11px, and every pair is already in the contrast audit.

## Don't

- Don't type coordinates: a point is dragged or nudged with the arrow keys.
- Don't draw a colour into a shape: colour comes later, from the character's palette.
- Don't hide a fault: Publish stays disabled, with the reason, until the draft is valid.
- Don't let a new version of a model change characters that already use it.
