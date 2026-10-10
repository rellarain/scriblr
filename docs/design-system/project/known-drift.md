# Known drift

Where the code does not yet follow the rules on the other pages. Each entry says what the code does, what the rule says, and the token to use. Nothing here is hidden: the app is described as it is, and this page is the list of what to fix next. (Items marked **fixed** were drift when this system was written and have been brought into line; they stay as a record of the rule.)

## Fixed while writing this system

| What it was | Now |
|---|---|
| `.wrError` and `.wrPageError` used a literal white for text and outline, which fell under 4.5:1 on every alert (3.0:1 on the Day default, worse at Dusk and Night) | text and outline are `--on-alert`, the ink chosen for the alert colour in the zone |
| Level text was white or `#17120f` by a "lighter" brightness, and nested shades darkened under dark text | there is one brightness; text on a level is white and the fill is held dark enough by hue (`fillCap`) |
| Quiet text (`.wrMuted`, `.wrHint`, `.wrLabel`, a panel head, meta and counts) was set at 60 to 70% opacity, under 4.5:1 | 90%; a test (`contrastAudit.test.ts`) fails on any text rule at under 80% |
| The accent, alert and paper inks were fixed lightnesses, readable only for the default hues | every pair is fitted for the hue in use and audited over every hue ([contrast](contrast.md)) |
| `--paper-like-l` and a fixed 4-point shift for the page's error text | `--paper-like`, `--paper-dislike`, `--paper-error`, fitted |

## Open

| Where | What the code does | The rule | Use |
|---|---|---|---|
| The older **tile grid** (`components/tiles/TileGrid`, `App.scss` `.tile`) and the helper and admin interfaces | rounded (10px tiles, 8px cards, 4px buttons), gradient surfaces (`linear-gradient(160deg, raised-a, raised-b)`) | the Writer is flat and square | not covered by this system; the Writer's `SplitArea` shares the tile engine but not its look |
| `.wrCard`, `.wrCardPanel`, `.wrNote` (dashboard cards, plot cards, notes) outside a tab's tile body | 8px (6px for a note) radius and a `0 4px 14px` shadow | no radius, depth by colour | `radius-none`; inside a tile body they are already flat (`.wrTabTileBody .wrCard`) |
| `.wrSmallBtn`, `.wrIconBtn`, chips, fields | 3 to 4px radius (12px for chips) | flat and square on a level; rounded only for controls on paper | `radius-none` on levels, `radius-input` on paper |
| `.wrQuickSearch`, `.wrInlineAdd input`, the Outline's inputs | the light input is written `hsl(var(--color-theme-h) 28% 96%)` with `hsl(... 30% 10%)` text | one light-input token | `paper-field` and `paper-ink` (add a `level-input` token when this is next touched) |
| The edge rail's tab cluster (`.wrEdgeCluster`) | `color-mix(... 22%, #0d1b2e)`, a literal navy | a token | `surface-deeper`, or a mix of the book's cover colour |
| `.wrLevelHeader .wrSmallBtn`, `.wrLevelToggle`, tab hover | `rgb(255 255 255 / 0.16)` washes written out | one wash | `level-wash` |
| Arc tabs, the arc tab label | `rgb(255 255 255 / 0.92)` | the level's white at a token alpha | `level-ink` |
| `.wrPage--day` and `--night` (the preview's own page) | `#fff` / `#000` / `#d8d8d8` / `#555` and `hsl(theme, 10%, 11%)` with `hsl(0 0% 88%)` text | the paper tokens | `paper`, `paper-ink`, `paper-line`, `paper-muted`; the preview's day and night are the preview's own choice, readable (7:1 and better) but not themed |
| The save bubble (`saveControl.scss`) | `rgb(18 18 24 / 0.94)` with light text | a token | `surface-deeper` of the zone, with `ink` |
| `style/style.css` | legacy `--accent-light`, `--shelf-wood`, `--page-cream` and a `#f4f2ee` body | the theme's tokens | `surface-base`; these belong to the older project picker |
| The admin Inbox (`App.scss`) | its own `--tone-yes`, `--tone-no`, `--tone-mid` and `--field-bg` | the accent and alert | `accent2` and `alert` |
| The **sky toggle** and a **plotpoint's awareness shade** | size their text bands with the older 45-lightness-point gap (`MIN_TEXT_GAP`); the plotpoint shade is also fitted to read (4.5:1), the sky text is not part of the audit | WCAG | the sky text should join `contrastAudit.ts` |
| The **Theme settings panel** | its swatches show the user's saved palettes, not the zone of the frame it is in | follow the zone | previews show it in the zone of the app, not per frame |
| Disabled and dragged states | 40% and 35% opacity | WCAG exempts a disabled control, not a dragged one | acceptable; the dragged card is the same as its drop target |

## Not covered by the audit

The audit lists text on its ground for the surfaces, the fills, the paper and its nested cards, the reaction hearts, the edge tabs and the level panels. It does not yet include: the sky toggle's text, the theme settings panel's own labels over the swatches, text on a hovered or pressed wash other than the ones in [contrast](contrast.md), the helper and admin interfaces, and the plot editor's category and subcategory colours (a plotpoint's own text is fitted but is not in the table). Add a pair to `frontend/src/theme/contrastAudit.ts` when a new text-on-ground is made; the test then covers it for every hue.
