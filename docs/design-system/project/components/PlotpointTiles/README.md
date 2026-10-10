# Plotpoint tiles

A plotpoint is a value of a plot field: a beat of the story. It is shown as a small tile **in its category and subcategory colours**, in the tray of plotpoints still to place, boxed inside the chapter, act, scene or moment it is placed on, or standing in the Draft's margin.

Code: `writer/PlotpointTile.tsx`, `levels/PlotpointsTab.tsx` (`PlotTray`), `AwarenessEye.tsx`, `plotColors.ts`, `awareness.ts`.

## Anatomy

`.wrPointTile`: a coloured ground (the category's, with the subcategory's as a 4px left stripe), an ink fitted to read on it, then:

- a **trail** (category > subcategory) and the **plotline and field** ("Plotline sit amet · DEFAULT");
- the **title** in bold and the **description**;
- tools at the top right: the **awareness eye** (on a moment only) and an **x** that returns it to the tray (or to the margin);
- variants: `margin` (in the Draft's left margin, draggable onto an act, scene or moment) and `placed` (boxed inside a card).

## Awareness

On a moment a plotpoint has one of four states, by clicking the eye: **front-stage** (known to the audience and the characters), **back-stage**, **mid-stage**, **off-stage**. The state is a shade of the book's hue: saturated or desaturated, bright or dark. The shade is fitted so its text reads, in every zone.

## The tray

`.wrPlotTray`: "Unassigned plotpoints" with a count, a *By time* / *In story* toggle for the placed ones, and the list. Dragging a placed plotpoint onto the tray unassigns it. When there are none: "Every plotpoint has a place. Add more in the Plot."

## Tokens

`--wr-cat` and `--wr-sub` (the plot colours), `--wr-point-bg` and `--wr-point-ink` (awareness), `level-fill-*`, `ink`.

## Don't

- Don't recolour a tile by hand: it takes its category's hue.
- Don't use the eye for anything but awareness.
- Don't let the title wrap under the tools: it has `overflow-wrap: anywhere` and the tools stay top right.
