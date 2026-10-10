# Known drift

Where the code does not yet follow the rules on the other pages. Each entry says what the code does, what the rule says, and the token to use. Nothing here is hidden: the app is described as it is, and this page is the list of what to fix next. (Items marked **fixed** were drift when this system was written and have been brought into line; they stay as a record of the rule.)

## Fixed

| What it was | Now |
|---|---|
| `.wrError` and `.wrPageError` used a literal white for text and outline, which fell under 4.5:1 on every alert (3.0:1 on the Day default, worse at Dusk and Night) | text and outline are `--on-alert`, the ink chosen for the alert colour in the zone |
| Level text was white or `#17120f` by a "lighter" brightness, and nested shades darkened under dark text | there is one brightness; text on a level is white and the fill is held dark enough by hue (`fillCap`) |
| Quiet text (`.wrMuted`, `.wrHint`, `.wrLabel`, a panel head, meta and counts) was set at 60 to 70% opacity, under 4.5:1 | 90%; a test (`contrastAudit.test.ts`) fails on any text rule at under 80% |
| The accent, alert and paper inks were fixed lightnesses, readable only for the default hues | every pair is fitted for the hue in use and audited over every hue ([contrast](contrast.md)) |
| `--paper-like-l` and a fixed 4-point shift for the page's error text | `--paper-like`, `--paper-dislike`, `--paper-error`, fitted |
| White washes written out (`rgb(255 255 255 / .16)`, `.28`, `.1`, `.14`, `.18`) on level buttons, the level toggle, tab hover, rows and rules, and a white at `.92`, `.7`, `.5` and `.85` for arc tab labels and markers | the level's ink at a token alpha: `level-wash-lo`, `level-wash`, `level-wash-hi`, `level-line`, `level-ink-soft` (defined on `.wrLevel` from `--on-accent`) |
| The edge rail's tab cluster mixed the level's colour with a literal navy `#0d1b2e` | the level's colour mixed with black |
| The save bubble was a literal `rgb(18 18 24 / .94)` with white text | `surface-deeper` with `ink` (it keeps its shadow: it floats) |
| The light input was written out as `hsl(theme 28% 96%)` with `hsl(... 30% 10%)` text in four places | `level-input`, `level-input-ink`, `level-input-hint` |
| `.wrCard`, `.wrCardPanel`, `.wrNote`, project cards, plot cards and plot points (rounded 5 to 8px, a drop shadow, a gradient) | square, one flat `surface-raised`, a hairline; fields on a level are square too. Buttons keep their radius |
| The older tile grid (`tiles.scss`: 10px radius, `linear-gradient(160deg, raised-a, raised-b)`) | square and flat: `surface-raised` and a hairline, the rail, its drop zones and the console too |
| The Theme settings panel (10px card, rounded segmented control, timeline, chips, swatches, selects) | square (buttons and the toggle switch keep theirs) |
| The new-project field and the shelf's other fields | square |
| `.wrPage--day` and `--night` used `#fff`, `#000`, `#d8d8d8`, `#555` and `hsl(theme 10% 11%)` | `page-day`/`page-night` with `-ink`, `-line`, `-muted`: the Day and Night paper in the theme hue, audited |
| The sky toggle's time and date were sized with the 45-point lightness gap, and not audited | the accent hue, fitted to 4.5:1 against every colour of the sky behind it (a bright dusk accent holds the sky darker), audited as `sky-text` and `sky-text-locked`; the zone tabs of the Theme panel are desaturated, no longer faded |
| A plotpoint's awareness shade sized its dark band with the 45-point gap | the shade is fitted to read (`fitFill`) and nothing else; `MIN_TEXT_GAP` is gone |
| Text on a hovered or pressed surface was not measured, and in Dusk and Night `ink-muted` fell to about 3.8 to 4.2:1 | the theme's lightness is fitted for the ink on the lifted surface (the ink at 22%) too; audited as "Hover and pressed" |
| Disabled controls at 40% and dragged cards at 35 to 50% | 60% and 70% |
| A level header's tabs, Reset and Save were square, the Save state was a hover bubble with a dot, and the size toggle wrapped below the tabs | the tab bar, its buttons and the Save component (Undo, Redo, Save, Autosave) are rounded `radius-button` containers of 30 x 30 buttons; no bubble, dot or state text (the time of the last save on hover); the toggle is on the title line; the title is all caps ([interaction](interaction.md)) |
| `style/style.css`: legacy `--accent-light`, `--shelf-wood`, `--page-cream`, a `#f4f2ee` body and a fixed text colour | `surface-raised-active`, `accent-dim`, `paper`, `surface-base` and `ink` (this sheet serves only the older stack in `modes/` and `components/shared/`) |
| The admin Inbox mapped "no" to the accent and its fields to a hand-written black wash | `--tone-no` is `alert` (text `on-alert`), `--field-bg` is `ov-sink-2` |

## Open

| Where | What the code does | The rule | Use |
|---|---|---|---|
| The **helper** and **admin** interfaces (`App.scss`, `admin/resources/resources.scss`) | rounded (8px cards, 4px fields), `linear-gradient(160deg, raised-a, raised-b)` tiles in the admin Resources, and their text is not in the audit | the Writer is flat and square | not covered by this system yet; `surface-raised` and `radius-none` when they are next touched. The Inbox's `--tone-mid` ink (the ink on a 34% mix of itself) has not been measured |
| **Chips** (`.wrChip`, 12px) and the **colour range thumb** | rounded | buttons keep their radius | accepted: `radius-chip`; the thumb is a control |
| Black washes written out (`rgb(0 0 0 / .22)` on the book cover's stats and buttons, bar tracks, `.wrPreviewSelect`) | literal black at a fixed alpha | one recess | `ov-sink-1` to `ov-sink-3` (they are the same blacks, and read in every zone) |
| The preview's **sentence highlights** (`.wrSentence`, `.wrPage--night`) | `hsl(accent 90% 92%)`, `hsl(accent 40% 26%)` literal lightnesses | fitted | a `page-*-highlight` token; the text on them is the page ink, which reads |
| The **Theme settings panel** | its swatches show the user's saved palettes, not the zone of the frame it is in | follow the zone | previews show it in the zone of the app, not per frame |

## Not covered by the audit

The audit lists text on its ground for the surfaces (also lifted by hover), the fills, the paper and its nested cards, the Preview page's two tones, the reaction hearts, the edge tabs, the sky toggle and the level panels. It does not yet include: text on the Theme panel's swatches, the helper and admin interfaces, the Inbox's tone colours, and the plot editor's category and subcategory colours (a plotpoint's own text is fitted but is not in the table). Add a pair to `frontend/src/theme/contrastAudit.ts` when a new text-on-ground is made; the test then covers it for every hue.
