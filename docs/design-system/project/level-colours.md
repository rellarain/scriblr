# Level colours

Every level of the Writer, every book, arc and chapter, and every plot category has a colour. It is **a hue in degrees, 0 to 360** (0 and 360 are both red), stored as one number (`OutlineNode.themeHue`, `ProjectSettings.themeHue`, `PlotNode.hue`). Saturation and lightness are the zone's, so the same colour is paler by day and deeper at night. Code: `frontend/src/theme/bookColors.ts`, `assets/Interfaces/writer/levelHues.ts`; mirrored in `backend/app/storage/schema.py` (`MIN_LEVEL_HUE` 0, `MAX_LEVEL_HUE` 360, `HUE_SCHEME` 4).

(Earlier versions also stored a brightness, darker, base or lighter, in the same number. It is gone: the backend converts those colours to their hue once, on load.)

## Who takes which hue

| Level | Hue |
|---|---|
| Dash | the app theme's own colour |
| Project | its own, else the app theme's hue + 120, so the Dash and the Project read as different tints |
| Series | within 60 degrees of the project's |
| Book | any hue; a book with no hue of its own is the default orange (28) |
| Arc | within 60 degrees of its book's |
| Chapter | within 60 degrees of its arc's (its book's outside an arc) |
| Plot category | any hue; a subcategory within 60 degrees of its category's |

A series, arc, chapter or subcategory with no colour of its own shows its parent's. New ones take a hue in their window, spread away from their siblings'. Changing a parent pulls its children's hues back inside their window. The hue slider is **one track**, 0 to 360: unlimited, or the plus-or-minus 60 degree window round the parent's hue (`HueSlider`, [the preview](components/HueSlider/README.md)).

## From a hue to a panel

A level is a **flat fill**: the hue at the accent's saturation times 0.62 (a little less loud), 8 points deeper than the accent's lightness, and **held dark enough that white text reads on it** (`fillCap` in `bookColors.ts`, worked out from every white text a level carries, in `levelContrast.ts`: its title, the nested shades, muted text at 90%, the header button's wash, the Outline's page, label and arc tab). Yellows and greens come out darker than blues and reds: the cap is lower where a hue is brighter at the same lightness. Token: `level-fill-<hue>`.

Text on a level is **always white** (`--on-accent: #fff` is set by `LevelPanel`, whatever the zone's own on-accent). What sits inside steps one shade deeper each time: `level-fill-1` to `-4` are the fill mixed with 10, 20, 30 and 40% black, ending in light inputs (`hsl(theme, 28%, 96%)` with dark text). The Draft level is paper, not a fill.

## Scope

Everything inside a book is re-tinted for it: `BookScope` re-derives the theme tokens with the book's hue for both the theme and the accent (a book has the one colour), so surfaces, buttons, highlights and the paper take it, and the readability fitting runs for that hue. The Outline and Draft are scoped to the book; the Project to the project's colour; the Dash is the app theme.

## Where a hue shows up

- the level panel's fill, and its header;
- a book's **spine** and cover (`--wr-spine`, the same fill) and the page-edge rail's back cover (`--wr-cover`);
- an **edge tab**: a stripe in the tab's colour, and, raised, its background (fitted so the tab's ink reads: `tabColors`);
- a card's left stripe (`--wr-node-tint`), the arc and chapter rows in the contents;
- a plotpoint's category and subcategory colours (`plotColors.ts`), and a plotpoint's awareness shade (`awareness.ts`), which is fitted to read too.
