# Hue slider and colour range

The one control for choosing a colour: a **single track** showing every hue, 0 to 360, drawn at the zone's own saturation and lightness, so the thumb shows what the app will draw.

Code: `writer/HueSlider.tsx` (a level's colour: the row), `components/ColorRange.tsx` (the track), `components/colorRange.scss`, the ranges in `theme/bookColors.ts` (`HUE_RANGE_OPTIONS`, `HUE_RANGES` the defaults, `effectiveRange`, `rangeOptions`).

## The row

A level's colour is one row, left to right: **Inherit toggle**, **degree chip**, **track**, **range button**.

- **Inherit toggle** `.hueInherit`: a 22px square (the height of the thumb) filled with the **parent's hue** at the zone's own saturation and lightness. It is **outlined in white only while it is on**; it is named "Inherit parent colour" and its tooltip gives the parent's degrees. **On**, the node stores no colour of its own: it shows the parent's and follows it when the parent changes, and the **thumb is hidden** (the track stays, not movable). **Off**, the hue it was showing becomes its own. It is **disabled at a range of 360**, which has no parent to follow.
- **Degree chip** `.hueChip`: read-only, the hue as degrees (`330°`) in the colour itself, white text and a white outline like the thumb's. The hue is the slider's own at the zone's saturation and lightness, **deepened only as far as the white text needs to read (4.5:1)**: by day and at dawn the slider's colours are pale (white on them is about 2:1 at every hue), so the chip is a few points darker there; at dusk and at night it is the slider's exact colour. While inheriting it shows the inherited hue.
- **Track**: below.
- **Range button** `.hueRange`: the chosen range as text (`±60°`, `360°`). On hover, focus or press it **opens inline into every range on offer, the slider giving up the room**; picking one (or the pointer or focus leaving, or Escape) shuts it. It is a radio group (`role="radiogroup"`, each range `role="radio"`); the chosen range is the same element open or shut so the focus stays on it, and pressing it while open does nothing (so a tap that opens it is not a pick).

## Ranges

A range is how far from its parent's hue (degrees either side) a colour may go: **30, 60, 90, 120, 180 or 360**. It is a choice **per node**, kept in the project (`hueRange` on an outline node, a plot node and the project's settings); until one is chosen it is the level's default:

| Level | Default range | Its parent's hue |
|---|---|---|
| Project | 360 (any hue) | the app theme's own hue |
| Book | 90 | the project's |
| Arc | 60 | its book's |
| Chapter | 30 | its arc's (its book's outside an arc) |
| Plot category | 90 | the project's |
| Plot subcategory | 60 | its category's |
| Plot cluster | 30 | its subcategory's (its category's outside one) |
| Account theme hues | 360, **locked** | none |

- **Never wider than the parent's range.** The range button offers none above it: a 180 parent offers up to 180 and never 360; a 360 parent offers all six. Narrowing a parent **lowers its descendants' ranges** to at most that, and pulls their own hues inside the new windows, top down.
- **A range is the range of every sibling**: choosing it on one node sets it on all the nodes of its kind measured from the same parent (the chapters of an arc, the arcs of a book, the books of a project, the categories, the subcategories of a category). Each one's own hue is refitted into the new window (widening never moves anything).
- **At 180 the track is centred on the parent's hue** (the parent in the middle, running through the wrap); **at 360 it runs from 0 (red)**. A node with a range of 180 or 360 is never moved when its parent changes (the window already covers every hue). Choosing 360 while inheriting turns Inherit off first, keeping the hue it showed.
- A series has no colour and no slider. The **account's theme hues** (the theme editor) are the bare track: locked at 360, no toggle, chip or range button.

`HueSlider` takes `label`, `hue` (the colour shown), `centre` (the parent's hue, or null for a bare track), `range`, `maxRange` (the parent's range), `inherit`, and `onChange(hue)`, `onRange(range)`, `onInherit(on)`; the value is a plain hue, wrapped to 0..359. The workspace hands them out per node (`hueSliderOf`, `plotHueSliderOf`, `projectHueSlider`).

**The app draws no visible label or hint over a colour slider** (not "Colour", and not "within 30° of its subcategory"): the row is the whole control, and `label` is its accessible name ("Book colour", "Cluster colour"). The ranges are in the table above and on the range button.

The **track** is a window round the parent's hue: the middle is the parent's own hue and its ends are the range either side, even across red (the window may run past 360). A hue outside its window is held on the nearest end (what is stored does not change until the slider is moved).

## Anatomy

`.colorRange` (a 12px track in a gradient of twelve hue stops, drawn 15 lightness points darker by day and at dawn, whose colours are pale: `sliderLight`), an invisible range input over it (keyboard and pointer), and the **thumb**: a 22px square with a 2px white border holding a smaller square of the resulting colour. Arrow keys step one degree; the label is the control's `aria-label`.

The theme editor's four hue sliders are the same control with `live`, which switches the palette fade off while the thumb is dragged, so the preview tracks it.

## Tokens

The track draws `hsl(h, S, L)` at the active zone's theme saturation and lightness; `ink` for the label.

## Don't

- Don't offer a brightness: a colour is a hue (the old darker and lighter bands are gone).
- Don't draw the track at a fixed lightness; it follows the zone.
- Don't let a child's colour leave its range through the slider; the workspace pulls it back when its parent (or its own range) changes.
- Don't offer a range wider than the parent's, or Inherit at a range of 360.
- Don't draw the chip's text in anything but white, or lighter than white can read on.
