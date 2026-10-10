# Sky toggle

A 120 x 30 painted sky in the header that shows the time of day and changes it.

Code: `theme/SkyToggle.tsx`, `SkyScene.tsx`, `skyLook.ts`, `sky.ts`, `skyToggle.scss`.

## Anatomy

- **Left button**: a sun or a moon (with its phase, from the real date). Pressing it steps to the next zone (Dawn, Day, Dusk, Night, all four, configured or not) and **locks** it.
- **Right button**: the time and the date ("11:40 AM", "OCT 10"), dimmed while locked. Pressing it returns to following the clock and turns time-based theming on.
- **The sky** behind both is painted per zone from the zone's hues: dawn and dusk are gradients of the theme hue, the day sky is the accent colour, the night sky the darkest theme shade; the sun, a moon, stars and two flat clouds are drawn on it. Only the text is a real part of the buttons.

## Tokens

The sky uses `accent` (Day), the theme hue's shades (Dawn, Dusk, Night) and white clouds at 30 to 55%. The time text is the accent hue, moved from the lightness the zone wants until it reads (4.5:1) against every colour of the sky behind it; if a bright accent leaves no such colour, the dusk sky is held darker until one does. The audit covers it (`sky-text`). A zone tab that is not in use is desaturated, not faded.

## Don't

- Don't read the toggle's art as the app's palette; it is an illustration of the zone.
- Don't hide the lock state: a locked zone dims the time and says so in the button's label ("Locked to Day. Follow the clock").
