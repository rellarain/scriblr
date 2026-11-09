# Character models

Character models are the shapes characters will be drawn from: the body, the clothes and the hair, arranged in **groups** of **objects** made of **shapes**. They are **designed in the Admin console** (Configuration > Characters) and saved as drafts and published one by one, the way the Plot presets are. The designer draws shapes, arranges them, and (since the second phase) **rigs** them: groups nest and turn about pivots, are fixed to a shape of their parent, and are driven by **sliders**. It does not yet pair left and right, link points, show the back or loosen clothes (the rest of the second phase), nor give shapes forms, colours or poses (later phases), and it stores nothing about any character.

Code: `admin/characters/` (`CharacterModelsConsole.tsx`, `ModelList.tsx`, `ModelPane.tsx`, `AssetTree.tsx`, `DesignerCanvas.tsx`, `Inspector.tsx`, `RigTab.tsx`, `RangesTab.tsx`, `Stepper.tsx`, `ReorderList.tsx`, `PreviewStrip.tsx`, `CheckPanel.tsx`, `TemplateMenu.tsx`, `designerState.ts`, `modelContent.ts`, `modelFile.ts`, `rigView.ts`, `useCharacterModels.ts`, `characterModels.scss`) and the pure engine in `admin/characters/engine/` (`geometry.ts`, `templates.ts`, `edit.ts`, `history.ts`, `limits.ts`, `svgText.ts`, `previews.ts`, `order.ts`, `rig.ts`, `rigEdit.ts`, `rigCheck.ts`). The reference mockup is `docs/mannequin-mockup/`.

## The page

`.cmSplit` holds the list (`.cmList`) and the open model (`.cmPane`). The page keeps the Admin's accent. Below 860px of its own width the list folds into one picker button (`.cmPick`) above the model, and the tree, the canvas and the inspector stack; below 1180px the inspector drops under the canvas.

- **List**: one row per model, its name and a **status badge** (`.cmBadge`): *Published v3*, *v3 · unpublished changes*, *Unpublished (was v2)*, *Not published*. Each state has a shape as well as a colour (a tick, a filled dot, a hollow dot, a grey dot). Rows reorder by their grip or Alt + Arrow.
- **Tools** (`.cmTools`): the model's name, its status, then **Publish**, **Unpublish**, **Discard changes**, **Versions** (the published version and the ten before it, each with *Bring into draft*), **Duplicate** and **Delete** (which asks in place first). Publish stays disabled, and the Check panel says why, while the draft is not valid.
- **Tree** (`.cmTree`) with a **Layers | Rig** switch (`.cmTreeModes`, two icon buttons with `aria-pressed`). *Layers*: three layers, **Body, Clothing and Hair**; under each, the groups that have an object on it, their objects and the objects' shapes. A row selects what it names; the buttons add a group, an object (+ beside a layer) or a shape (a template menu beside an object), copy and delete. Groups, objects and shapes **reorder by their grip** (`.cmGrip`; drag, or Alt + Up / Down), and a shape's up and down arrows do the same one step at a time; the order in the tree is the **draw order** (a shape lower in the list is drawn in front, unless its `z` says otherwise). *Rig* (`.cmRigTree`): the groups nested under the group they hang from, each with its level in the pivot chain (`.cmCount`, bold at six, the most); **drag a group's grip onto another to hang it there**, onto the empty space to unhang it, or press **Alt + Right / Left** on the grip to indent or outdent it. A move that would make a circle or a chain longer than six is refused, with the reason beside the canvas. It has a search. Counts beside groups and objects turn bold with a bar under them above the warning limit.
- **Canvas** (`.cmCanvas`, an SVG): the shapes in a neutral token (the selection in the accent, the rest dimmed), a grid, the **mirror line** at the centre, and, for the selected shape in the point editor, its **points** and the **curve handles** of the selected point. The shapes are drawn **where the rig puts them**: a shape in a turned group is drawn turned, its points and handles drawn through the group's matrix and a drag undone through it, so a shape can be edited with a slider anywhere on its range. A shape whose points a slider moves, with that slider away from rest, can only be looked at (a note says which, and the toolbar's reset puts the sliders back). The selected group shows its **pivot** (`.cmPivot`: a cross in a ring, drag it or focus it and press the arrow keys; Shift for bigger steps; for a group fixed to a shape the arrow keys step the anchor: to the next or previous point, along the edge, or across and down the shape) and, if it is fixed to a shape, the **anchor** (`.cmAnchor`, a diamond). The mirror line is drawn at the model's own axis. Left button: select a shape, drag a point or a handle, or (in move mode) the whole shape. Double-click an edge: add a point there. **Right button: a click on the grid unselects everything and shows the end result; a click on a shape moves through point editor, move shape and unselected; a drag pans.** Arrow keys move the selected point (Shift: bigger steps; in move mode the whole shape), Delete removes the point, Escape unselects.
- **Toolbar** (`.cmToolbar`, icon buttons with a label and a title): undo, redo, point editor, move shape, mirror editing, snap, grid, zoom in and out, fit the whole figure, new shape from a template, and the inspector drawer. There are **no typed number fields**: points are moved by dragging and by the arrow keys.
- **Inspector** (`.cmInspector`, a drawer the toolbar folds away) with three tabs (`role="tablist"`, icon and label, Left and Right arrows move between them): **Shape**, **Rig** and **Ranges** (below). With nothing selected the Shape tab shows the model's name, description and the **Mirror line** (a stepper: the x that mirror editing reflects about, 40 to 160, 100 to begin with). Shape tab: the name, and for an object its layer; for a shape its view (both, front only, back only), its opacity, its template, and its points as numbered chips with the four **point modes** (curve, sharp, curve then sharp, sharp then curve), add a point after the selected one, delete it, reset its handles.
- **Previews** (`.cmStrip`, always on): the selection, or with nothing selected the whole model, at random sizes, tilts and backgrounds, **with every slider at a random value inside its range** (the slider's `rand` range when it has one); *Random* with a re-roll, *Smallest* and *Largest* as stress previews (Smallest also puts every slider at its minimum, Largest at its maximum), and three sizes. The tiles pair a shape token with a ground token so each is readable on all four backgrounds.
- **Checks** (`.cmCheck`): the size of a character's copy of the model, what stops Publish, which limits the model is at or past, and the **rig check** (a slider that drives nothing, an anchor that does not keep its group where it is drawn at rest, a shape that leaves the frame when a slider is at its minimum or maximum; at most eight lines).
- **Model files**: the model's toolbar has an **Export** icon (the open model's draft) and the list has **Import** and **Export all**. A file (`scriblrCharacterModels`, version 1) holds drafts; an import adds each as an **unpublished draft** (a name that is taken becomes *Name (copy)*), skips what is not a valid model and says what it skipped in a notice (`.cmToast`) with a Dismiss button; a file that is not a model file is refused with an alert.

## The rig

The **Rig tab** is for the selected group (or the group an object or shape is in):

- **Pivot and parent**: the chain from the root as a breadcrumb (each parent a link), *Level n of 6 in the pivot chain*, a **Hangs from** select (every group that is not below this one), the pivot's place, and a button that puts it in the middle of the group. Everything in the group turns and scales about the pivot.
- **Attached to a shape**: a group with a parent can be fixed to one shape of the parent or of a group above it, by one of four **anchors** (chips, `aria-pressed`): *Point* (one point of the shape; a stepper), *Edge spot* (a spot along one edge; steppers and a slider), *Slides* (along one edge, where a **slider** puts it), *Inside* (a relative place across and down the shape). **Pick on the canvas** lets a click on a shape of the parent choose it. Attaching puts the pivot on the anchor without moving the drawing. A parent move drags the group along with the anchor.
- **Motion**: the sliders that turn, scale or slide this group; each is a link that opens it in the Ranges tab.

## Sliders

The **Ranges tab** lists the model's sliders (`.cmSlider`), by default those that have to do with the selection (*This selection | All*). **New slider** offers four kinds, each a menu item that says why it is unavailable (*Select a group first*):

- **Turn the group**: turns the selected group about its pivot, −20° at the minimum and +20° at the maximum to begin with.
- **Scale**: scales the selected shape or group (80% and 120%), or the whole model about its feet when nothing is selected (*Size*); the chips say whether across, up and down, or both.
- **Move points (record)**: the canvas edits a copy of the selected shape with every slider at rest; **Set maximum** (or *Set minimum*) writes how far each point moved, **Cancel** drops it. Adding or deleting a point is not recorded.
- **Bend the shape**: a smooth bend along a length of the shape (two steppers for where it starts and ends).

A slider has a **Try it** range (the test value is only for looking and is never saved; a *n off rest* button in the toolbar and a *Reset test values* button put them back), a **sweep** button (minimum to maximum and back, still running with reduced motion because it was asked for), steppers for its **minimum, rest and maximum** (no typed numbers), a **show to writers** toggle (an eye) and a delete that asks in place. Under them, what it drives, one row per **drive** with its own steppers for the amount at each end, and **Add what it drives**. A drive's amount is zero (or 100% for scale) at rest, the stated amount at the maximum and the other at the minimum, in straight lines between.

## Limits

| What | Warns above | Stops at |
|---|---|---|
| Points in a shape | 24 | 60 |
| Objects in a group | 24 | 48 |
| Shapes in an object | 36 | 72 |
| A character's copy of a model | 150 KB | 250 KB (Publish refused) |
| Groups in a pivot chain | 6 (the most) | above 6 (a move that makes a longer chain is refused) |
| Sliders in a model | 40 | 80 |
| Drives of one slider | 12 | 24 |

The frontend numbers (`engine/limits.ts`) and the backend's (`schema.py`) are held equal by `schemaParity.test.ts`.

## Saving and publishing

Two layers, as in the Plot presets: every edit goes to the **draft** through the shared autosave (off by default; the Save button and its toggle are in the page's head), and **Publish** copies the draft to the published copy, refusing a draft that is not valid (no name, a name another published model has, a shape of fewer than three points, an object or group that points at something missing, a shape in two objects, a pivot chain deeper than six, an anchor whose shape is missing or not in the parent or above it, an anchor that slides on a slider that is not there, a slider that drives something that is not there, recorded point moves for points a shape no longer has, a copy over the size limit). **Discard changes** returns the draft to the published copy; a model never published is cleared. New versions change nothing in characters that already use a model: a character will keep its own copy.

## Tokens

Surfaces: `surface-raised`, `surface-deep`, `hairline`; text: `ink`, `ink-muted`, `ink-faint`; the Admin accent for the selection, the active row and the primary buttons (ink `on-accent`); `alert` for the danger ring and a refused action. Shapes are drawn in `ink-muted` (the selection in `accent`) until the model has colour slots. All text is at least 11px, and every pair is already in the contrast audit.

## Don't

- Don't type coordinates or amounts: a point is dragged or nudged with the arrow keys, a pivot too, and every number of a slider has a minus and a plus.
- Don't save a test value: the Try it sliders are for looking.
- Don't draw a colour into a shape: colour comes later, from the character's palette.
- Don't hide a fault: Publish stays disabled, with the reason, until the draft is valid.
- Don't let a new version of a model change characters that already use it.
