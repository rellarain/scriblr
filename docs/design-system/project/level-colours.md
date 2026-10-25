# Level colours

Every level of the Writer, every book, arc and chapter, and every plot category has a colour. It is **a hue in degrees, 0 to 360** (0 and 360 are both red), stored as one number (`OutlineNode.themeHue`, `ProjectSettings.themeHue`, `PlotNode.hue`). Saturation and lightness are the zone's, so the same colour is paler by day and deeper at night; the saturation comes in **three tiers** (below). Code: `frontend/src/theme/bookColors.ts`, `assets/Interfaces/writer/levelHues.ts`; mirrored in `backend/app/storage/schema.py` (`MIN_LEVEL_HUE` 0, `MAX_LEVEL_HUE` 360, `HUE_SCHEME` 4).

(Earlier versions also stored a brightness, darker, base or lighter, in the same number. It is gone: the backend converts those colours to their hue once, on load.)

## Who takes which hue

| Level | Hue |
|---|---|
| Dash | the app theme's own colour |
| Project | its own, else the app theme's hue + 120, so the Dash and the Project read as different tints |
| Series | none: it shows the project's colour (a colour stored on a series by an older version is ignored, and cleared the next time the outline is saved) |
| Book | within **90** degrees of the project's hue; a book with no hue of its own is the default orange (28) |
| Arc | within **60** degrees of its book's |
| Chapter | within **30** degrees of its arc's (its book's outside an arc) |
| Plot category | within **90** degrees of the project's hue |
| Plot subcategory | within **60** degrees of its category's |
| Plot cluster | within **30** degrees of its subcategory's (its category's when it sits straight under one) |

These ranges are fixed in code (`HUE_RANGES` in `bookColors.ts`, also published as the `hue-range-*` tokens); the project and the account's theme hues have no parent, so they are the whole wheel (360). A range is a **rule**: a colour is held inside it when it, or the colour above it, is changed, and a colour already outside its range (a project saved before the ranges) stays as it is until then, shown on the nearest end of the slider. An arc, chapter, subcategory or cluster with no colour of its own shows its parent's. A new arc or chapter takes a hue in its range, spread away from its siblings'; a **new book or plot category starts at the project's hue**, and a new subcategory or cluster shows its parent's. Changing a parent pulls what is under it back inside its range, and nothing elsewhere.

The hue slider is **one track**: the whole wheel from 0 to 360 for the project, or the range either side of the parent's hue, with a **square button to its left filled with the parent's hue** that sets the colour to exactly that hue (`HueSlider`, [the preview](components/HueSlider/README.md)).

## Saturation tiers

A tree's colours get louder the deeper they go. The tier is a factor of the zone's saturation (`SAT_QUIET` 0.5, `SAT_MIDDLE` 0.75, `SAT_LOUD` 1 in `bookColors.ts`):

| Tier | Plot tree | Outline |
|---|---|---|
| quiet, 0.5 | category (surface and stripe) | series |
| middle, 0.75 | subcategory (fill and stripe) | book (spine, cover, rail, card stripe) |
| loud, 1 | cluster (fill and stripe) | arc, chapter and everything under them |

The project and the Dash stay at the zone's own saturation. A fill's lightness cap (`fillCap`) holds white text readable at every tier in every zone, and the contrast audit takes the worst of the three.

## From a hue to a panel

A level is a **flat fill**: the hue at the accent's saturation times 0.62 (a little less loud), 8 points deeper than the accent's lightness, and **held dark enough that white text reads on it** (`fillCap` in `bookColors.ts`, worked out from every white text a level carries, in `levelContrast.ts`: its title, the nested shades, muted text at 90%, the header button's wash, the Outline's page, label and arc tab). Yellows and greens come out darker than blues and reds: the cap is lower where a hue is brighter at the same lightness. Token: `level-fill-<hue>`.

Text on a level is **always white** (`--on-accent: #fff` is set by `LevelPanel`, whatever the zone's own on-accent). What sits inside steps one shade deeper each time: `level-fill-1` to `-4` are the fill mixed with 10, 20, 30 and 40% black, ending in light inputs (`level-input`, near-white in the theme hue, with `level-input-ink`). A control on a level is lifted by a wash of the level's ink: `level-wash-lo` 10%, `level-wash` 16%, `level-wash-hi` 28% (hover), a rule is `level-line` 18%, and the softer ink for tab labels and markers is `level-ink-soft` 92%; the Writer's CSS defines them on `.wrLevel` from `--on-accent`. The Draft level is paper, not a fill.

## Scope

Everything inside a book is re-tinted for it: `BookScope` re-derives the theme tokens with the book's hue for both the theme and the accent (a book has the one colour), so surfaces, buttons, highlights and the paper take it, and the readability fitting runs for that hue. The Outline and Draft are scoped to the book; the Project to the project's colour; the Dash is the app theme.

## Where a hue shows up

- the level panel's fill, and its header;
- a book's **spine** and cover (`--wr-spine`, the same fill) and the page-edge rail's back cover (`--wr-cover`);
- an **edge tab**: a stripe in the tab's colour, and, raised, its background (fitted so the tab's ink reads: `tabColors`);
- a card's left stripe (`--wr-node-accent`, 7px): the accent colour at the node's hue, lifted 12 points and never under 72% lightness (`stripeColorCss`), so it reads on the level's dark page in every zone (3:1, audited as "Card stripe"); on the book cards, the arc and chapter cards and rows, and the chapter banner;
- a plotpoint's category and subcategory colours (`plotColors.ts`): a category is the theme's colour at its hue with the zone's ink on it, a subcategory's or cluster's surface (`--wr-sub-fill`, `--wr-cluster-fill`) is the level fill of its hue with white on it, and the left edge of what is under it (`--wr-edge`) is **stripes stacked side by side, 4px each, left to right in the order of the tree**: the category's accent colour, the subcategory's, the cluster's (one for each it has; no gradient); and a plotpoint's awareness shade (`awareness.ts`), which is fitted to read too.
