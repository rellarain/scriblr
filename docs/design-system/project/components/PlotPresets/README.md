# Plot presets

Plot presets are ready-made plot categories (a category with its subcategories, clusters, fields, keywords and descriptions). They are **set up in the Admin console** and **added to a project from the Plot sidebar**.

Code: `admin/plot/` (`PlotPresetsConsole.tsx`, `PresetList.tsx`, `PresetPane.tsx`, `PresetCards.tsx`, `usePlotPresets.ts`, `presetModel.ts`, `presetFile.ts`, `plotPresets.scss`), `writer/PresetPicker.tsx`, `writer/PlotNav.tsx`, `writer/plotPreset.ts`.

## Two places

- **Admin > Configuration > Plot** (`PlotPresetsConsole`): the list of presets on the left, the open preset as a card tree on the right. Below 640px of its own width the list folds into a single picker button (`.plpPick`) above the preset, as the Plot tool does.
- **The Plot sidebar** (Project level, Plot tab): two buttons side by side at the foot of the contents, **+ Category** (an empty category) and **+ Preset**, which opens a menu of the **published** presets. Choosing one adds it straight away, as a plain copy (no link back), in one undo step, last in the list, and opens it. A copy is the project's own: later edits to it never touch the preset, and publishing never touches a copy already made.

## The Admin page

`.plpSplit` holds the list (`.plpList`) and the pane (`.plpPane`). The page keeps the Admin's accent (`accent2`).

- **List**: one row per preset, its name and a **status badge** (`.plpBadge`): *Published v3*, *Unpublished changes* (the draft differs from the published copy), *Never published*, *Unpublished* (taken down; the versions are kept). New, Import and Export all are in the list's head and foot. Rows reorder by their grip or Alt + Arrow.
- **Pane**: the preset's name (required, 50 characters, unique without regard to case), a status line ("Live since 12 Jan"), then the tools: **Publish**, **Discard changes**, **Unpublish**, **Versions**, **Duplicate**, **Export** and **Delete**.
- **Card tree** (`.plpTree`, `.plpCard`): the preset is the root card; each subcategory sits in it and each cluster in a subcategory, each a step deeper (the same nesting as the Outline cards). A card has a **grip**, a **kind** label (Category, Subcategory, Cluster), a name, a description (255 characters), **keyword chips**, **field chips** (30 characters each) and its own **+ Subcategory / + Cluster** and **Delete**. Fields and keywords are **chips** (type and press Enter or the + button; remove with the x). A field chip also has a grip and moves with Alt + Left or Right Arrow, since the order of the fields is the order they have in the project. Clusters live only inside subcategories; a subcategory may be empty.
- **Keys**: the shared node keys (`lib/nodeKeys.ts`, see [interaction](../../interaction.md)): Enter a new sibling, Shift + Enter a new child, Backspace in an empty card deletes it. Cards move by their grip or Alt + Up or Down Arrow.
- **Delete, Discard and Bring into draft** ask first, in place (`.plpConfirmBar`, "Delete Characters? It also leaves the + Preset list, and its published versions are removed. Categories already in projects stay."), with Confirm and Cancel. A preset that was never published says so instead: the Plot sidebar is not affected.

### Saving and publishing

Two layers, so a half-finished edit never reaches a project:

1. **Draft**: every edit is saved by the app's shared autosave (`useAutosave` and the Save component; **autosave is off by default**, like the Writer, so the Save button and its toggle are in the page's head). A failed save is an alert message ("Save failed") and the Save button is ringed.
2. **Published**: **Publish** copies the draft to the published copy, which is all the Writer's selector reads. It first shows a **dialog** with a summary of what changed since the published copy (*Added*, *Changed*, *Removed*) and asks to confirm. It is **refused while the draft is invalid** (the faults are listed and the cards in fault are marked): a blank name, a duplicate preset name, or another preset already published under the same name. **Discard changes** puts the draft back to the published copy; a preset with no published copy has nothing to go back to, so it is cleared to a blank preset that keeps its name (after a confirm, enabled once there is something to clear). **Unpublish** takes it out of the selector and keeps its versions. **Versions** lists the published version and the ten before it, each with *Bring into draft*.

Importing adds the file's presets as **drafts**, saved at once and unpublished; a clashing name becomes "Name (copy)". Export writes the draft as JSON with no ids and no publish state; a file with a problem is reported, and nothing from it is half-applied.

## The selector (`PresetPicker`)

A menu (`.wrPresetPicker`, `role="menu"`) that opens above the buttons and reads the published list each time it opens. Each row (`.wrPresetRow`) is the preset's **name** and, when it has one, its **description** (one line, ellipsis). The arrows, Home and End move; Enter chooses; Escape closes and returns to the button. States: *Loading presets*, *Couldn't load the presets* with **Try again**, and *No presets are published yet. Publish one in Admin > Configuration > Plot.*

## Descriptions in the sidebar

The Plot sidebar's contents have a fourth circle at the top right, beside the three that fold a level (`.wrNavDot--desc`): an outline while descriptions are hidden, **filled in the alert hue** while they are shown. Lit, a category, subcategory or cluster row shows its whole description under its name (`.wrNavDesc`, wrapped, the row's own ink at the small size). A plotline never does, and a row with no description keeps its single line. The circle is dimmed when no row has a description, and its setting is kept on this machine.

## Tokens

Surfaces: `surface-raised`, `surface-deep`, `hairline`; text: `ink`, `ink-muted`, `ink-faint`; the Admin accent (`accent`, which the Admin scope points at `accent2`) for the active row and the primary buttons (ink `on-accent`); `alert` for errors and the failed-save ring. The sidebar menu uses the Writer's page tokens (`wr-page-*`). All text is at least 11px (`plotPresets.scss` is in the floor test); the pairs are already in the contrast audit.

## Don't

- Don't link a project's copy to its preset: adding is a copy, and neither side follows the other.
- Don't let the selector show a draft: it lists published presets only.
- Don't write a colour into a preset: the colour belongs to the category in the project, picked there.
- Don't hide a fault: Publish stays disabled, with the reason, until the draft is valid.
