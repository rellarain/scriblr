# Iconography

Every icon is a component in `frontend/src/assets/icons/index.tsx`, drawn by one base (`IconBase`) so they match: a **24 by 24 grid**, **stroke 1.8**, **round caps and joins**, **no fill**, in the current text colour (`stroke="currentColor"`). The same files are in `assets/Icons` as SVG (with a plain dark ink, because an image cannot inherit a colour).

## Sizes

| Size | Where |
|---|---|
| 14 | a tile's title bar, chevrons in a row |
| 16 | small buttons, the segmented Draft / Preview switch, level toggles |
| 18 | header tabs and quick actions (a 30 x 30 button) |
| 21 | the default, when no size is given |
| 32 and up | only in this system's own pages |

An icon is never smaller than 13 (the grip) and never coloured on its own: it takes the text colour of the control it is in, so it reads at the same ratio (3:1 at least, per [contrast](contrast.md)). A toggled-on tab is the same icon on a darker wash, not a filled icon.

## The set

| Group | Icons |
|---|---|
| Writing | `book-face`, `pencil`, `plot`, `arc`, `sentence`, `page`, `pages`, `bookmark`, `reaction`, `flag`, `export`, `save`, `restore` |
| Header tabs | `calendar`, `checkbox`, `bar-chart`, `list`, `clock`, `gear`, `help`, `info`, `layout-mini`, `layout-midi`, `layout-max` |
| Actions | `plus`, `close`, `search`, `trash`, `grip`, `swap`, `expand`, `chevron-right`, `chevron-down`, `chevron-left`, `check` |
| Time of day | `sunrise`, `sun`, `sunset`, `moon` |
| Reading the plot | `eye`, `eye-forward`, `eye-left`, `eye-right`, `eye-closed` (a plotpoint's awareness) |
| People and shell | `user`, `people`, `team`, `building`, `library`, `briefcase`, `graduation-cap`, `shield`, `globe`, `lock`, `unlock`, `wrench`, `configuration`, `inbox`, `envelope`, `chat-bubbles`, `question` |
| Feedback pipeline | `toning`, `sorting`, `explicating`, `voting`, `integrating`, `frown`, `mixed-face`, `neutral-face`, `queue` |

## The six reaction hearts

A reaction on a sentence is one glyph per level, never a stack (`ReactionHeartIcon`, `kind` and `level`):

| Level | Like | Dislike |
|---|---|---|
| 1 | a heart outline | an outline with a straight line down its middle |
| 2 | two concentric outlines | two separate outlined halves |
| 3 | a filled heart | two separate filled halves |

The heart takes `paper-like` or `paper-dislike`, fitted to read on its bar; the bar's fill gets stronger with the level (saturation 30, 62, 96 for a like, 26, 58, 92 for a dislike). Level 0 is a `+` or `-` on a dashed outline.

## Rules

- Use an existing icon before drawing one. Draw new ones on the same grid, stroke and caps, and add them to `icons/index.tsx`; `npm run design-system` exports them.
- An icon-only button needs an `aria-label` and a `title`; the label names the action ("Write chapter 1", "Search this tab"), not the picture.
- Don't pair an icon with a colour that carries meaning on its own: the state is in the icon's shape or wash (a pressed tab), the colour only follows the zone.
