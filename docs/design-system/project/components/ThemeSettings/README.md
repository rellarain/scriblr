# Theme settings panel

Where a user sets the look: when each time of day starts, and its four hues. It is the Dash's **Settings** tab, and is embedded in the account drawer.

Code: `theme/ThemeSettingsPanel.tsx`, `ThemeTimeline.tsx`, `SkyZoneTab.tsx`, `palettes.ts`, `paletteRules.ts`, `themeSettings.scss`; the colour range is [HueSlider](../HueSlider/README.md).

## Anatomy

1. **Theme** header with the save and restore control.
2. **Change theme by time of day**: a switch. Off, the Day palette is used.
3. **View as**: *User* or *Admin* (the user's own role is shown).
4. **The day bar** (`ThemeTimeline`): 24 hours with each configured zone's span and its sun or moon. Where a zone begins is a **handle** on the bar (a dark 6px bar outlined in white, so it reads on any hue; the seam you see even with Day alone). **Drag** it and it snaps to the **nearest hour**, with the time in a bubble above it; the zone is selected, and its tab and its *Starts at* follow as you drag. A handle that meets the next one **pushes it along**: zones keep their order and at least an hour each, and none is carried past midnight. The handle is a slider: the **arrow keys** move it an hour (Shift: 10 minutes), and a **double click** puts the zone back to its default start (Dawn 4 AM, Day 10 AM, Dusk 4 PM, Night 10 PM).
5. **Zone tabs**: Dawn, Day, Dusk, Night, each a small painted sky, with its start time (a 10-minute select) and a one-line summary ("Light background, dark text, vivid colours"). Enabling or disabling a zone is on its tab; Day cannot be turned off.
6. **For the selected zone, four colour sections** (Theme, Accent, Alert, Admin accent): the colour's **derived shades** (the swatches the app really draws: base, side, deep, deeper, sidebars, raised; or fill, hover and dim), an even **tint ladder**, and a **hue range**.

The panel opens on the zone the app is in (when that zone is in use; else Day). While a zone's editor is open the app previews that zone, unsaved. The swatches are the palette of the zone being edited, whatever zone the frame is in; the icons on the day bar's segments are audited.

## Tokens

`surface-*`, `accent`, `accent-hover`, `accent-dim`, `alert`, `accent2`: the swatches are these tokens for the zone; the text on a swatch is `readableInk`.

## Don't

- Don't offer saturation or lightness: the zone decides them, so readability cannot be lost.
- Don't save as you drag; the palette previews live and is saved by the control.
