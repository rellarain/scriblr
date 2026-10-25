# Hue slider and colour range

The one control for choosing a colour: a **single track** showing every hue, 0 to 360, drawn at the zone's own saturation and lightness, so the thumb shows what the app will draw.

Code: `writer/HueSlider.tsx` (a level's colour and its reset button), `components/ColorRange.tsx` (the track), `components/colorRange.scss`, the ranges in `theme/bookColors.ts` (`HUE_RANGES`).

## Two forms

- **The whole wheel** (360): the project, which has no parent hue. The track runs from **0 degrees** (red) at its left to 360 at its right, and there is no reset button.
- **A range round the parent's hue**: the middle of the track is the parent's own hue and its ends are the level's range either side, even across red (the window may run past 360). A hue outside its window is held on the nearest end (what is stored does not change until the slider is moved).

| Level | Range either side of its parent's hue | Its parent's hue |
|---|---|---|
| Project | 360 (any hue) | none |
| Book | 90 | the project's |
| Arc | 60 | its book's |
| Chapter | 30 | its arc's (its book's outside an arc) |
| Plot category | 90 | the project's |
| Plot subcategory | 60 | its category's |
| Plot cluster | 30 | its subcategory's (its category's outside one) |
| Account theme hues | 360 | none |

A series has no colour and no slider. The ranges are fixed, not a setting.

`HueSlider` takes `label`, `hue`, `centre` (the parent's hue, or null), `range` (degrees either side; 360 = the whole wheel) and `onChange(hue)`; the value is a plain hue, wrapped to 0..359.

## The reset button

With a parent hue, a **square button, 22px (the height of the thumb), stands to the left of the track** (`.hueReset`, in a `.hueSliderRow`). It is filled with the **parent's hue** at the zone's own saturation and lightness (what the app would draw), outlined in white like the thumb, and gets the thumb's black-in-white ring on keyboard focus. Pressing it sets the colour to exactly the parent's hue; it is named "Reset to parent colour" and its tooltip gives the degrees. It is always enabled.

## Anatomy

`.colorRange` (a 12px track in a gradient of twelve hue stops, drawn 15 lightness points darker by day and at dawn, whose colours are pale: `sliderLight`), an invisible range input over it (keyboard and pointer), and the **thumb**: a 22px square with a 2px white border holding a smaller square of the resulting colour. Arrow keys step one degree; the label is the control's `aria-label`.

The theme editor's four hue sliders are the same control with `live`, which switches the palette fade off while the thumb is dragged, so the preview tracks it.

## Tokens

The track draws `hsl(h, S, L)` at the active zone's theme saturation and lightness; `ink` for the label.

## Don't

- Don't offer a brightness: a colour is a hue (the old darker and lighter bands are gone).
- Don't draw the track at a fixed lightness; it follows the zone.
- Don't let a child's colour leave its range through the slider; the workspace pulls it back when its parent moves.
- Don't offer a range choice on the slider: each level's range is fixed.
