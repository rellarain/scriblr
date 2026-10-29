# Plotpoint tiles

A plotpoint is a value of a plot field: a beat of the story. It can be **placed as many times as the story needs** (on a chapter, act, scene or moment, once on each); each place is a **placement** that stands alone, and the plotpoint itself stays in the tray. It is shown as a small tile **in its category, subcategory and cluster colours** in the tray; a placement is a tile boxed inside the chapter, act, scene or moment it is on, or a footnote in the Draft's margin.

Code: `writer/PlotpointTile.tsx`, `levels/PlotpointsTab.tsx` (`PlotTray`), `plotPlacement.ts` (the placements), `AwarenessEye.tsx`, `plotColors.ts`, `awareness.ts`.

## Anatomy

`.wrPointTile`: a coloured ground (the category's, with its left edge as stacked 4px stripes, left to right: the category's accent colour, the subcategory's, the cluster's, one for each it sits in), an ink fitted to read on it, then:

- a **trail** (category > subcategory > cluster, whichever it sits under) and the **plotline and field** ("Plotline sit amet · DEFAULT");
- the **title** in bold and the **description**;
- tools at the top right: a **counter**, the **awareness eye** of this placement (on a moment only) and an **x** that takes this placement away;
- variants: `margin` (the plotpoint itself, in the tray and the compare list: it drags onto a chapter, act, scene or moment to place it there once more) and `placed` (one placement, boxed inside a card: it drags to another card, which moves it, or back to the tray, which takes it away).

## Counters

How often a plotpoint is placed shows as an outlined pill (`.wrCount`, small bold text in the tile's own ink, so nothing about the contrast changes): **x3** on the tray tile, on the value card in the plot editor and on the compare tile (not shown while it is placed nowhere; *Placed once* for one place), and added up as **x5** beside a field's "unplaced / total" count. A placement boxed in the outline carries **2 of 3**, its place among the plotpoint's placements in story order, whenever there are several. A plotpoint is placed once on a node at most: dropping it where it already is does nothing.

## Awareness

On a moment each placement has one of four states, by clicking its eye: **front-stage** (known to the audience and the characters), **back-stage**, **mid-stage**, **off-stage**. A plotpoint placed on two moments has two states. The state is a shade of the book's hue: saturated or desaturated, bright or dark. The shade is fitted so its text reads, in every zone.

## The tray

`.wrPlotTray`: "Plotpoints" with a count, a **Still to place** switch (kept on this machine) that narrows the list to the plotpoints placed nowhere, and the list: every plotpoint stays in it, placed or not, with its counter. Dragging a placement's tile onto the tray takes that placement away. When the switch is on and there are none: "Every plotpoint has a place. Add more in the Plot." Under it, **Placed in the book** lists the placements in the open book, one row for each, *By time* or *In story*.

## Tokens

`--wr-cat` and `--wr-sub` (the plot colours), `--wr-point-bg` and `--wr-point-ink` (awareness), `level-fill-*`, `ink`.

## Don't

- Don't recolour a tile by hand: it takes its category's hue.
- Don't use the eye for anything but awareness.
- Don't let the title wrap under the tools: it has `overflow-wrap: anywhere` and the tools stay top right.
