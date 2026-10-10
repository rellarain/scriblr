# Contrast

Generated from `frontend/src/theme/contrastAudit.ts` by `npm run design-system`; the test `contrastAudit.test.ts` keeps every row at or above its threshold.

Text is held to **4.5:1** (WCAG 2.1 AA); icons and the edges of controls to **3:1**; large text (24px, or 18.66px bold) to 3:1. The theme moves a colour's lightness only as far as its hue needs, so a ratio below holds for **every hue** a user can pick, not just the defaults.

Each cell is the ratio at the default hues (theme 330, accent 32, alert 200) and, in brackets, the worst ratio over a 30-degree grid of all three palette hues (and every 5 degrees of a level colour).

## Theme surfaces

| Pair | Needs | Dawn | Day | Dusk | Night |
|---|---|---|---|---|---|
| Ink on surface-base | 4.5:1 | 12.6 (12.4) | 13.9 (13.7) | 8.4 (7.5) | 10.7 (8.7) |
| Muted ink on surface-base | 4.5:1 | 12.6 (12.4) | 13.9 (13.7) | 7.2 (6.4) | 9.0 (7.4) |
| Faint ink on surface-base | 4.5:1 | 12.6 (12.4) | 13.9 (13.7) | 6.5 (5.9) | 8.1 (6.7) |
| Ink on surface-base under a recess | 4.5:1 | 8.2 (8.0) | 9.0 (8.8) | 12.8 (11.9) | 14.7 (13.1) |
| Muted ink on surface-base under a recess | 4.5:1 | 8.2 (8.0) | 9.0 (8.8) | 10.7 (10.0) | 12.2 (10.9) |
| Faint ink on surface-base under a recess | 4.5:1 | 8.2 (8.0) | 9.0 (8.8) | 9.5 (8.9) | 10.8 (9.7) |
| Ink on surface-side | 4.5:1 | 11.2 (11.1) | 12.4 (12.1) | 9.7 (8.8) | 12.4 (10.5) |
| Muted ink on surface-side | 4.5:1 | 11.2 (11.1) | 12.4 (12.1) | 8.2 (7.5) | 10.4 (8.8) |
| Faint ink on surface-side | 4.5:1 | 11.2 (11.1) | 12.4 (12.1) | 7.4 (6.8) | 9.2 (7.9) |
| Ink on surface-side under a recess | 4.5:1 | 7.3 (7.3) | 8.0 (7.9) | 13.9 (13.1) | 15.9 (14.5) |
| Muted ink on surface-side under a recess | 4.5:1 | 7.3 (7.3) | 8.0 (7.9) | 11.6 (11.0) | 13.1 (12.0) |
| Faint ink on surface-side under a recess | 4.5:1 | 7.3 (7.3) | 8.0 (7.9) | 10.3 (9.8) | 11.6 (10.7) |
| Ink on surface-deep | 4.5:1 | 9.4 (9.3) | 10.3 (9.9) | 12.0 (11.1) | 15.1 (13.6) |
| Muted ink on surface-deep | 4.5:1 | 9.4 (9.3) | 10.3 (9.9) | 10.0 (9.4) | 12.5 (11.3) |
| Faint ink on surface-deep | 4.5:1 | 9.4 (9.3) | 10.3 (9.9) | 9.0 (8.4) | 11.1 (10.0) |
| Ink on surface-deep under a recess | 4.5:1 | 6.2 (6.2) | 6.8 (6.5) | 15.7 (15.0) | 17.6 (16.7) |
| Muted ink on surface-deep under a recess | 4.5:1 | 6.2 (6.2) | 6.8 (6.5) | 12.9 (12.4) | 14.4 (13.7) |
| Faint ink on surface-deep under a recess | 4.5:1 | 6.2 (6.2) | 6.8 (6.5) | 11.4 (11.0) | 12.6 (12.0) |
| Ink on surface-deeper | 4.5:1 | 6.8 (6.8) | 7.4 (6.8) | 16.4 (15.8) | 19.3 (18.8) |
| Muted ink on surface-deeper | 4.5:1 | 6.8 (6.8) | 7.4 (6.8) | 13.4 (13.0) | 15.6 (15.3) |
| Faint ink on surface-deeper | 4.5:1 | 6.8 (6.8) | 7.4 (6.8) | 11.8 (11.5) | 13.6 (13.3) |
| Ink on surface-deeper under a recess | 4.5:1 | 4.6 (4.6) | 5.0 (4.6) | 18.4 (18.0) | 19.9 (19.7) |
| Muted ink on surface-deeper under a recess | 4.5:1 | 4.6 (4.6) | 5.0 (4.6) | 14.9 (14.7) | 16.0 (15.8) |
| Faint ink on surface-deeper under a recess | 4.5:1 | 4.6 (4.6) | 5.0 (4.6) | 13.1 (12.9) | 13.9 (13.8) |
| Ink on surface-sidebar-1 | 4.5:1 | 7.5 (7.5) | 8.2 (7.7) | 6.8 (5.8) | 8.6 (6.7) |
| Muted ink on surface-sidebar-1 | 4.5:1 | 7.5 (7.5) | 8.2 (7.7) | 5.9 (5.0) | 7.3 (5.8) |
| Faint ink on surface-sidebar-1 | 4.5:1 | 7.5 (7.5) | 8.2 (7.7) | 5.3 (4.6) | 6.6 (5.3) |
| Ink on surface-sidebar-1 under a recess | 4.5:1 | 5.1 (5.1) | 5.5 (5.2) | 11.2 (10.0) | 12.9 (11.0) |
| Muted ink on surface-sidebar-1 under a recess | 4.5:1 | 5.1 (5.1) | 5.5 (5.2) | 9.4 (8.5) | 10.8 (9.3) |
| Faint ink on surface-sidebar-1 under a recess | 4.5:1 | 5.1 (5.1) | 5.5 (5.2) | 8.4 (7.6) | 9.6 (8.3) |
| Ink on surface-sidebar-2 | 4.5:1 | 9.7 (9.6) | 10.6 (10.2) | 11.6 (10.7) | 14.7 (13.0) |
| Muted ink on surface-sidebar-2 | 4.5:1 | 9.7 (9.6) | 10.6 (10.2) | 9.7 (9.0) | 12.1 (10.8) |
| Faint ink on surface-sidebar-2 | 4.5:1 | 9.7 (9.6) | 10.6 (10.2) | 8.7 (8.1) | 10.7 (9.7) |
| Ink on surface-sidebar-2 under a recess | 4.5:1 | 6.4 (6.4) | 7.0 (6.7) | 15.4 (14.7) | 17.4 (16.3) |
| Muted ink on surface-sidebar-2 under a recess | 4.5:1 | 6.4 (6.4) | 7.0 (6.7) | 12.7 (12.2) | 14.2 (13.4) |
| Faint ink on surface-sidebar-2 under a recess | 4.5:1 | 6.4 (6.4) | 7.0 (6.7) | 11.2 (10.8) | 12.5 (11.8) |
| Ink on surface-raised-a | 4.5:1 | 12.2 (12.1) | 13.5 (13.3) | 8.7 (7.8) | 11.1 (9.1) |
| Muted ink on surface-raised-a | 4.5:1 | 12.2 (12.1) | 13.5 (13.3) | 7.4 (6.7) | 9.4 (7.8) |
| Faint ink on surface-raised-a | 4.5:1 | 12.2 (12.1) | 13.5 (13.3) | 6.7 (6.1) | 8.4 (7.0) |
| Ink on surface-raised-a under a recess | 4.5:1 | 8.0 (7.8) | 8.7 (8.6) | 13.1 (12.2) | 15.0 (13.4) |
| Muted ink on surface-raised-a under a recess | 4.5:1 | 8.0 (7.8) | 8.7 (8.6) | 10.9 (10.2) | 12.4 (11.2) |
| Faint ink on surface-raised-a under a recess | 4.5:1 | 8.0 (7.8) | 8.7 (8.6) | 9.7 (9.1) | 11.0 (9.9) |
| Ink on surface-raised-b | 4.5:1 | 10.0 (9.9) | 11.0 (10.6) | 11.2 (10.3) | 14.2 (12.5) |
| Muted ink on surface-raised-b | 4.5:1 | 10.0 (9.9) | 11.0 (10.6) | 9.4 (8.7) | 11.8 (10.4) |
| Faint ink on surface-raised-b | 4.5:1 | 10.0 (9.9) | 11.0 (10.6) | 8.4 (7.8) | 10.4 (9.3) |
| Ink on surface-raised-b under a recess | 4.5:1 | 6.6 (6.5) | 7.2 (7.0) | 15.1 (14.4) | 17.1 (16.0) |
| Muted ink on surface-raised-b under a recess | 4.5:1 | 6.6 (6.5) | 7.2 (7.0) | 12.5 (11.9) | 14.0 (13.1) |
| Faint ink on surface-raised-b under a recess | 4.5:1 | 6.6 (6.5) | 7.2 (7.0) | 11.0 (10.6) | 12.3 (11.6) |
| Ink on surface-raised-active | 4.5:1 | 13.7 (13.4) | 15.1 (14.9) | 7.6 (6.6) | 9.6 (7.6) |
| Muted ink on surface-raised-active | 4.5:1 | 13.7 (13.4) | 15.1 (14.9) | 6.5 (5.7) | 8.1 (6.6) |
| Faint ink on surface-raised-active | 4.5:1 | 13.7 (13.4) | 15.1 (14.9) | 5.9 (5.2) | 7.3 (6.0) |
| Ink on surface-raised-active under a recess | 4.5:1 | 8.8 (8.7) | 9.7 (9.6) | 12.0 (11.0) | 13.8 (12.0) |
| Muted ink on surface-raised-active under a recess | 4.5:1 | 8.8 (8.7) | 9.7 (9.6) | 10.0 (9.2) | 11.5 (10.1) |
| Faint ink on surface-raised-active under a recess | 4.5:1 | 8.8 (8.7) | 9.7 (9.6) | 9.0 (8.3) | 10.2 (9.0) |

## Fills

| Pair | Needs | Dawn | Day | Dusk | Night |
|---|---|---|---|---|---|
| Text on the accent | 4.5:1 | 4.6 (4.6) | 4.7 (4.6) | 9.5 (4.6) | 8.5 (4.8) |
| Text on the accent, hovered | 4.5:1 | 7.8 (7.8) | 8.3 (8.1) | 12.2 (7.6) | 11.4 (8.0) |
| Text on the dimmed accent | 4.5:1 | 9.0 (9.0) | 9.7 (9.5) | 12.3 (8.8) | 11.6 (9.7) |
| Text on the alert | 4.5:1 | 4.6 (4.7) | 4.7 (4.6) | 10.4 (4.7) | 9.6 (4.7) |
| Text on the admin accent | 4.5:1 | 4.6 (4.6) | 4.7 (4.6) | 9.5 (4.6) | 8.5 (4.8) |
| Text on the admin accent, hovered | 4.5:1 | 7.8 (7.8) | 8.3 (8.1) | 12.2 (7.6) | 11.4 (8.0) |
| Alert message text on the alert | 4.5:1 | 4.6 (4.7) | 4.7 (4.6) | 10.4 (4.7) | 9.6 (4.7) |

## Paper

| Pair | Needs | Dawn | Day | Dusk | Night |
|---|---|---|---|---|---|
| Paper ink on paper | 4.5:1 | 16.7 (15.5) | 16.7 (15.5) | 12.6 (10.3) | 15.9 (14.2) |
| Paper ink2 on paper | 4.5:1 | 13.2 (11.7) | 13.2 (11.7) | 11.5 (9.3) | 14.5 (12.9) |
| Paper label on paper | 4.5:1 | 10.6 (9.3) | 10.6 (9.3) | 10.7 (8.7) | 13.5 (12.0) |
| Paper muted on paper | 4.5:1 | 9.1 (7.8) | 9.1 (7.8) | 10.2 (8.3) | 12.9 (11.4) |
| Paper placeholder on paper | 4.5:1 | 7.7 (6.7) | 7.7 (6.7) | 9.5 (7.7) | 12.0 (10.6) |
| Page muted text (ink at 88%) on paper | 4.5:1 | 11.9 (11.0) | 11.9 (11.0) | 10.2 (8.4) | 12.6 (11.3) |
| Paper ink on paper-soft | 4.5:1 | 16.0 (14.8) | 16.0 (14.8) | 12.0 (10.3) | 15.1 (13.7) |
| Paper ink2 on paper-soft | 4.5:1 | 12.6 (11.2) | 12.6 (11.2) | 10.9 (9.3) | 13.8 (12.5) |
| Paper label on paper-soft | 4.5:1 | 10.1 (8.8) | 10.1 (8.8) | 10.2 (8.7) | 12.8 (11.6) |
| Paper muted on paper-soft | 4.5:1 | 8.7 (7.4) | 8.7 (7.4) | 9.7 (8.3) | 12.2 (11.1) |
| Paper placeholder on paper-soft | 4.5:1 | 7.4 (6.4) | 7.4 (6.4) | 9.0 (7.7) | 11.4 (10.3) |
| Page muted text (ink at 88%) on paper-soft | 4.5:1 | 11.5 (10.6) | 11.5 (10.6) | 9.7 (8.4) | 12.0 (11.0) |
| Paper ink on page | 4.5:1 | 15.0 (14.9) | 14.8 (14.7) | 12.9 (9.3) | 15.1 (13.6) |
| Paper ink2 on page | 4.5:1 | 11.8 (11.2) | 11.7 (11.4) | 11.7 (8.6) | 13.8 (12.5) |
| Paper label on page | 4.5:1 | 9.5 (8.9) | 9.4 (9.0) | 10.9 (8.0) | 12.8 (11.7) |
| Paper muted on page | 4.5:1 | 8.1 (7.5) | 8.0 (7.6) | 10.4 (7.7) | 12.2 (11.2) |
| Paper placeholder on page | 4.5:1 | 6.9 (6.4) | 6.8 (6.6) | 9.7 (7.2) | 11.4 (10.5) |
| Page muted text (ink at 88%) on page | 4.5:1 | 10.9 (10.6) | 10.8 (10.8) | 10.3 (7.6) | 12.0 (10.8) |
| Paper ink on field | 4.5:1 | 17.7 (17.0) | 17.7 (17.0) | 15.9 (13.1) | 18.2 (17.4) |
| Paper ink2 on field | 4.5:1 | 14.0 (12.8) | 14.0 (12.8) | 14.5 (12.1) | 16.6 (16.1) |
| Paper label on field | 4.5:1 | 11.2 (10.1) | 11.2 (10.1) | 13.5 (11.3) | 15.5 (15.1) |
| Paper muted on field | 4.5:1 | 9.6 (8.5) | 9.6 (8.5) | 12.9 (10.9) | 14.7 (14.4) |
| Paper placeholder on field | 4.5:1 | 8.2 (7.4) | 8.2 (7.4) | 12.0 (10.1) | 13.7 (13.4) |
| Page muted text (ink at 88%) on field | 4.5:1 | 12.5 (11.8) | 12.5 (11.8) | 12.6 (10.5) | 14.2 (13.6) |
| Paper ink on frame-1 | 4.5:1 | 14.3 (14.3) | 14.0 (13.9) | 12.4 (8.8) | 14.7 (13.0) |
| Paper ink2 on frame-1 | 4.5:1 | 11.3 (10.8) | 11.1 (11.1) | 11.3 (8.1) | 13.4 (12.0) |
| Paper label on frame-1 | 4.5:1 | 9.0 (8.5) | 8.9 (8.7) | 10.6 (7.6) | 12.5 (11.2) |
| Paper muted on frame-1 | 4.5:1 | 7.7 (7.2) | 7.6 (7.4) | 10.1 (7.3) | 11.9 (10.8) |
| Page muted text (ink at 88%) on frame-1 | 4.5:1 | 10.5 (10.3) | 10.4 (10.3) | 10.0 (7.3) | 11.7 (10.4) |
| Paper ink on frame-2 | 4.5:1 | 13.2 (13.1) | 12.9 (12.7) | 11.2 (7.6) | 13.3 (11.4) |
| Paper ink2 on frame-2 | 4.5:1 | 10.4 (10.1) | 10.2 (10.1) | 10.2 (7.0) | 12.1 (10.5) |
| Paper label on frame-2 | 4.5:1 | 8.4 (8.0) | 8.2 (8.1) | 9.5 (6.5) | 11.3 (9.9) |
| Paper muted on frame-2 | 4.5:1 | 7.2 (6.7) | 7.0 (7.0) | 9.1 (6.3) | 10.7 (9.5) |
| Page muted text (ink at 88%) on frame-2 | 4.5:1 | 9.8 (9.8) | 9.7 (9.6) | 9.1 (6.3) | 10.6 (9.3) |
| Paper ink on frame-3 | 4.5:1 | 12.2 (12.1) | 11.9 (11.5) | 10.4 (6.8) | 12.4 (10.5) |
| Paper ink2 on frame-3 | 4.5:1 | 9.6 (9.5) | 9.4 (9.2) | 9.5 (6.3) | 11.3 (9.6) |
| Paper label on frame-3 | 4.5:1 | 7.7 (7.5) | 7.5 (7.4) | 8.9 (5.9) | 10.5 (9.0) |
| Paper muted on frame-3 | 4.5:1 | 6.6 (6.3) | 6.5 (6.4) | 8.5 (5.7) | 10.0 (8.7) |
| Page muted text (ink at 88%) on frame-3 | 4.5:1 | 9.2 (9.2) | 9.0 (8.8) | 8.5 (5.7) | 10.0 (8.5) |
| Paper ink on frame-4 | 4.5:1 | 11.2 (11.1) | 10.9 (10.4) | 9.7 (6.2) | 11.5 (9.6) |
| Paper ink2 on frame-4 | 4.5:1 | 8.9 (8.9) | 8.6 (8.4) | 8.9 (5.7) | 10.5 (8.8) |
| Paper label on frame-4 | 4.5:1 | 7.1 (7.0) | 6.9 (6.7) | 8.3 (5.4) | 9.8 (8.3) |
| Paper muted on frame-4 | 4.5:1 | 6.1 (5.9) | 5.9 (5.8) | 7.9 (5.1) | 9.3 (7.9) |
| Page muted text (ink at 88%) on frame-4 | 4.5:1 | 8.6 (8.6) | 8.4 (8.1) | 7.9 (5.2) | 9.3 (7.8) |
| Paper ink on frame-5 | 4.5:1 | 10.3 (10.1) | 10.0 (9.4) | 9.0 (5.6) | 10.7 (8.7) |
| Paper ink2 on frame-5 | 4.5:1 | 8.2 (8.1) | 7.9 (7.5) | 8.2 (5.2) | 9.8 (8.0) |
| Paper label on frame-5 | 4.5:1 | 6.5 (6.5) | 6.3 (6.1) | 7.7 (4.9) | 9.1 (7.5) |
| Paper muted on frame-5 | 4.5:1 | 5.6 (5.6) | 5.4 (5.2) | 7.3 (4.7) | 8.7 (7.2) |
| Page muted text (ink at 88%) on frame-5 | 4.5:1 | 8.0 (7.9) | 7.8 (7.5) | 7.4 (4.8) | 8.7 (7.2) |
| Page error text on paper | 4.5:1 | 5.4 (5.0) | 5.6 (4.9) | 6.5 (4.6) | 7.6 (4.8) |
| Page error text on paper-soft | 4.5:1 | 5.2 (4.8) | 5.4 (4.6) | 6.2 (4.6) | 7.2 (4.6) |
| Page error text on page | 4.5:1 | 4.9 (4.8) | 5.0 (4.8) | 6.6 (4.7) | 7.2 (4.8) |
| Page error text on field | 4.5:1 | 5.8 (5.5) | 5.9 (5.3) | 8.2 (5.6) | 8.7 (5.6) |
| Page error text on frame-1 | 4.5:1 | 4.6 (4.6) | 4.7 (4.6) | 6.4 (4.6) | 7.0 (4.6) |

## Reactions

| Pair | Needs | Dawn | Day | Dusk | Night |
|---|---|---|---|---|---|
| Like heart on its fill (S 30) | 3:1 | 3.2 (3.2) | 3.2 (3.2) | 5.3 (3.3) | 5.3 (3.3) |
| Like heart on its fill (S 62) | 3:1 | 3.3 (3.3) | 3.3 (3.3) | 4.9 (3.6) | 4.9 (3.6) |
| Like heart on its fill (S 96) | 3:1 | 3.3 (3.4) | 3.3 (3.4) | 4.4 (3.6) | 4.4 (3.6) |
| Dislike heart on its fill (S 26) | 3:1 | 3.2 (3.2) | 3.3 (3.2) | 6.1 (3.3) | 5.6 (3.3) |
| Dislike heart on its fill (S 58) | 3:1 | 3.2 (3.3) | 3.3 (3.3) | 5.7 (3.7) | 5.3 (3.8) |
| Dislike heart on its fill (S 92) | 3:1 | 3.3 (3.3) | 3.3 (3.2) | 5.2 (3.9) | 4.8 (4.0) |

## Edge tabs

| Pair | Needs | Dawn | Day | Dusk | Night |
|---|---|---|---|---|---|
| Edge tab text on the page edge | 4.5:1 | 15.2 (14.2) | 15.1 (14.5) | 12.9 (9.3) | 15.1 (13.6) |
| Edge tab text on its accent | 4.5:1 | 11.3 (10.8) | 12.4 (12.4) | 8.4 (7.5) | 10.7 (8.7) |
| Edge tab text on any level colour | 4.5:1 | 11.4 (10.0) | 13.3 (10.9) | 7.5 (7.3) | 9.7 (8.7) |

## Level panels

| Pair | Needs | Dawn | Day | Dusk | Night |
|---|---|---|---|---|---|
| Level title on its fill | 4.5:1 | 7.4 (7.1) | 6.8 (6.6) | 6.8 (6.6) | 7.4 (6.7) |
| Level text on fill-1 | 4.5:1 | 8.5 (8.1) | 7.9 (7.7) | 7.9 (7.7) | 8.5 (7.7) |
| Muted level text (90%) on fill-1 | 4.5:1 | 7.2 (7.0) | 6.8 (6.6) | 6.8 (6.6) | 7.2 (6.6) |
| Level text on fill-2 | 4.5:1 | 9.7 (9.3) | 9.1 (8.9) | 9.1 (8.9) | 9.7 (8.9) |
| Muted level text (90%) on fill-2 | 4.5:1 | 8.2 (7.9) | 7.7 (7.6) | 7.7 (7.6) | 8.2 (7.6) |
| Level text on fill-3 | 4.5:1 | 11.1 (10.7) | 10.5 (10.3) | 10.5 (10.3) | 11.1 (10.3) |
| Muted level text (90%) on fill-3 | 4.5:1 | 9.3 (9.0) | 8.9 (8.7) | 8.9 (8.7) | 9.3 (8.7) |
| Level text on fill-4 | 4.5:1 | 12.6 (12.3) | 12.1 (11.9) | 12.1 (11.9) | 12.6 (11.9) |
| Muted level text (90%) on fill-4 | 4.5:1 | 10.5 (10.3) | 10.1 (9.9) | 10.1 (9.9) | 10.5 (10.0) |
| Outline page muted text (85%) on the page | 4.5:1 | 6.7 (6.4) | 6.2 (6.1) | 6.2 (6.1) | 6.7 (6.1) |
| Outline page label (75%) on the page | 4.5:1 | 5.6 (5.4) | 5.3 (5.1) | 5.3 (5.1) | 5.6 (5.2) |
| Outline label (75%) on a card | 4.5:1 | 6.3 (6.1) | 5.9 (5.8) | 5.9 (5.8) | 6.3 (5.9) |
| Header button text on its wash | 4.5:1 | 4.9 (4.8) | 4.7 (4.6) | 4.7 (4.6) | 4.9 (4.6) |
| Collapsed header text on its hover | 4.5:1 | 5.4 (5.2) | 5.1 (5.0) | 5.1 (5.0) | 5.4 (5.0) |
| Text on a cover wash | 4.5:1 | 10.8 (10.4) | 10.2 (10.0) | 10.2 (10.0) | 10.8 (10.0) |
| Arc tab label (92%) on the cover colour | 4.5:1 | 6.6 (6.3) | 6.1 (5.9) | 6.1 (5.9) | 6.6 (6.0) |

## Below the threshold

Nothing: every documented pair reads in every zone for every hue.
