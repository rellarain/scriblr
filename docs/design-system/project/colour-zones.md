# Colour: the four zones

The shell and the Writer follow the time of day. There are four **zones**: Dawn, Day, Dusk, Night. Day is always on and is the palette when time-based theming is off; the others are opt-in, each with a start time in 10-minute steps. Code: `frontend/src/theme/` (`zones.ts`, `zoneLooks.ts`, `tokens.ts`, `theme.scss`).

## What a user chooses, and what the zone decides

A user chooses **four hues** per zone, and nothing else:

| Hue | For | Default |
|---|---|---|
| theme | inert and read-only things: backgrounds, surfaces, cards | 330 |
| accent | interactive and active things: buttons, the active tab, focus | 32 |
| alert | what needs attention: errors | 200 |
| admin accent | admin features (admins only; everyone else sees the accent) | 260 |

The zone decides saturation, where each lightness starts, and whether the ground is dark or light:

| Zone | Ground | Theme S | Accent S | Alert S | Theme L | Accent L | Alert L | Page L |
|---|---|---|---|---|---|---|---|---|
| Dawn | light, dark text, muted | 15 | 45 | 70 | 80 | 42 | 46 | 97 |
| Day | light, dark text, vivid | 30 | 80 | 100 | 86 | 42 | 46 | 97 |
| Dusk | dark, white text, vivid | 30 | 80 | 100 | 34 | 62 | 66 | 18 |
| Night | dark, white text, muted | 15 | 45 | 70 | 26 | 62 | 66 | 12 |

Saturation always runs theme < accents < alert. The admin accent is the accent's twin: same saturation, only the hue differs.

## The lightnesses are a start

Lightness is blind to hue: a yellow and a blue at the same HSL lightness differ several times over in brightness. So the numbers above are where each colour **starts**. `resolvePalette` (`zoneLooks.ts`) moves a colour's lightness a half point at a time, only as far as its hue needs, until its text reads (`readable.ts`):

- the **theme** is moved (darker in a dark zone, lighter in a light one) until the zone's ink, and its muted and faint tiers, read on every surface, including under the deepest recess;
- each **fill** (accent, alert, admin accent) is fitted for one ink: the zone's preferred ink (white on a light zone, the dark ink on a dark zone) if that takes at most 10 points, otherwise the other ink, which may already read. `fillInk` then picks whichever reads better;
- the **paper** inks, nested cards, error text and hearts are fitted the same way (below).

So at the default hues Day's accent is drawn at about 37 rather than 42, and its alert at about 36 rather than 46, so white text reads; a yellow accent in the Day switches to the dark ink instead of being darkened into mud. [contrast](contrast.md) holds every result to 4.5:1 (3:1 for icons).

## Surfaces and ink

Every surface is the theme hue at the zone's theme saturation, stepped in lightness from the base: `surface-base` 0, `surface-side` -4, `surface-deep` -10, `surface-deeper` -20, `surface-sidebar-2` -9, `surface-raised-a` -1, `surface-raised-b` -8, `surface-raised-active` +3. The sidebar's first shade steps up in a dark zone (+6) and down in a light one (-17) so it never crushes toward black.

There is **one ink** per zone: white in Dusk and Night; in Dawn and Day a near-black tinted with the theme hue (`hsl(theme, 12%, 3%)`). `ink-muted` and `ink-faint` are the ink at 90% and 84% in a dark zone; in a light zone they are the ink itself (the ink is already as dark as it can be). The text on each fill is `on-accent`, `on-alert` or `on-accent2`, picked for that fill. `hover` and `dim` shades of a fill step **away from its text**: darker under white, lighter under dark.

Recesses are black overlays (`ov-sink-1..3` at 0.16, 0.25, 0.35, softened by 0.55 in a light zone); lifts are the ink at 8, 14 and 22%.

## The Writer's paper

The chapter page and the preview follow the zone: a light sheet by day and dawn (L97), a dark one at dusk and night (L18, L12). Shades step toward the text (`paper-l - n * dir`, where `dir` is 1 on a light sheet and -1 on a dark one); fields step the other way. The chapter page is 4 points off the sheet, and the five nested cards (`frame-1..5`) are 6, 9, 12, 15 and 18 points (a light sheet), or 5, 8, 10, 12 and 14 (a dark one): deep enough to see, shallow enough that the five paper inks (`paper-ink`, `-ink2`, `-label`, `-muted`, `-placeholder`) still read on the deepest card.

`paper-error` (the page's error text) and `paper-like` and `paper-dislike` (the reaction hearts) are the accent and alert hues moved only as far as they need to read on their grounds.

## Do and don't

- Take colours by token name; inside a book they are re-derived for the book's hue.
- Don't use a literal white or black for text on a themed ground; use `ink`, `on-accent`, `on-alert` or a level's white.
- Don't set a lightness for a new colour by eye. Add its pair to `contrastAudit.ts` and let the test tell you.
