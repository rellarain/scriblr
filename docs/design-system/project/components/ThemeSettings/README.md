# Theme settings panel

Where a user sets the look: when each time of day starts, and its four hues. It is the Dash's **Settings** tab, and is embedded in the account drawer.

Code: `theme/ThemeSettingsPanel.tsx`, `SkyZoneTab.tsx`, `palettes.ts`, `paletteRules.ts`, `themeSettings.scss`; the colour range is [HueSlider](../HueSlider/README.md).

## Anatomy

1. **Theme** header with the save and restore control.
2. **Change theme by time of day**: a switch. Off, the Day palette is used.
3. **View as**: *User* or *Admin* (the user's own role is shown).
4. **The day bar**: 24 hours with each configured zone's span and its sun or moon.
5. **Zone tabs**: Dawn, Day, Dusk, Night, each a small painted sky, with its start time (a 10-minute select) and a one-line summary ("Light background, dark text, vivid colours"). Enabling or disabling a zone is on its tab; Day cannot be turned off.
6. **For the selected zone, four colour sections** (Theme, Accent, Alert, Admin accent): the colour's **derived shades** (the swatches the app really draws: base, side, deep, deeper, sidebars, raised; or fill, hover and dim), an even **tint ladder**, and a **hue range**.

While a zone's editor is open the app previews that zone, unsaved.

## Tokens

`surface-*`, `accent`, `accent-hover`, `accent-dim`, `alert`, `accent2`: the swatches are these tokens for the zone; the text on a swatch is `readableInk`.

## Don't

- Don't offer saturation or lightness: the zone decides them, so readability cannot be lost.
- Don't save as you drag; the palette previews live and is saved by the control.
