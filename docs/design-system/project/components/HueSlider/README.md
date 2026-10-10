# Hue slider and colour range

The one control for choosing a colour: a **single track** showing every hue, 0 to 360, drawn at the zone's own saturation and lightness, so the thumb shows what the app will draw.

Code: `writer/HueSlider.tsx` (a level's colour), `components/ColorRange.tsx` (the track), `components/colorRange.scss`.

## Two forms

- **Unlimited**: the whole wheel. For a project, a book and a plot category.
- **Limited**: the plus-or-minus **60 degree window** round the parent's hue, for a series, an arc, a chapter and a plot subcategory. The middle of the track is the parent's own hue; its ends are 60 degrees either side, even across red (the window may run past 360). A hue outside its window is held on the nearest end.

`HueSlider` takes `label`, `hue`, `centre` (the parent's hue, or null) and `onChange(hue)`; the value is a plain hue, wrapped to 0..359.

## Anatomy

`.colorRange` (a 12px track in a gradient of twelve hue stops), an invisible range input over it (keyboard and pointer), and the **thumb**: a 22px square with a 2px white border holding a smaller square of the resulting colour. Arrow keys step one degree; the label is the control's `aria-label`.

The theme editor's four hue sliders are the same control with `live`, which switches the palette fade off while the thumb is dragged, so the preview tracks it.

## Tokens

The track draws `hsl(h, S, L)` at the active zone's theme saturation and lightness; `ink` for the label.

## Don't

- Don't offer a brightness: a colour is a hue (the old darker and lighter bands are gone).
- Don't draw the track at a fixed lightness; it follows the zone.
- Don't let a child's colour leave its window; the workspace pulls it back when its parent moves.
