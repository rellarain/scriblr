# Level panels, headers and tabs

Four stacked levels make the Writer: **Dash**, **Project**, **Outline** (the open book) and **Draft** (the open chapter). Each is a `LevelPanel`: a flat fill of its colour, a header strip and a body. One level is the focus (Max); the one above is Mid, the rest Min; the ones below are not shown.

Code: `writer/levels/LevelPanel.tsx`, `WriterLevels.tsx`, `LevelTabs.tsx`, `levelSizes.ts`; styles `.wrLevel*` and `.wrTab*` in `writer.scss`.

## Anatomy

- **Panel** `.wrLevel` (`--dash`, `--project`, `--outline`, `--draft`; `--min`, `--mid`, `--max`). Its fill is `--wr-level-fill`: the level's hue at the accent's saturation less a little, a step deeper, held dark enough for white text ([level-colours](../../level-colours.md)). Its text is `--on-accent`, always white. The Dash is the app theme's own colour; the Draft is paper.
- **Header** `.wrLevelHeader`: min height 40, padding 6 / 14. The **title** (`.wrLevelTitle`, 15px bold) is a button that brings the level to focus; the **tabs** (`.wrTabBar`, 30 x 30 `.wrTabBtn`, icons 18) and **quick actions** (`.wrQuickActions`: Search, New, Save) sit at its right; at Mid a **chevron** (`.wrLevelToggle`) folds it to Min.
- **Body** `.wrLevelBody`: `level-fill-1`, padding 8 / 12 / 12. At Min a level shows only its header (and a short body, e.g. book spines).

## Tabs

At Mid one tab shows at a time; at Max each tab opens or closes a tile on the split grid ([SplitTiles](../SplitTiles/README.md)). The tab strip ends with **Settings** and **Help**. A pressed tab (`.wrTabBtn--on`) is a darker wash of the header, `aria-pressed`. Tab bodies on a light **surface** (editors) use `--surface-side` with the ink, not the level's white.

## Tokens

`level-fill-<hue>`, `level-fill-1..4`, `level-ink`, `level-wash`, `ink`, `surface-side` (an editor tab). Header buttons are white at 16% over the fill.

## You provide

`level`, `size`, `title`, `hue` (the level's colour; none = the theme's), `onPromote`, `onSetSize`; `headerExtras` for the tabs; `minBody` for what a Min level shows; `headerless` where the body brings its own header (the Outline's book editor, the Draft's chapter tile). The tab list comes from `useTabbedLevel`.

## Don't

- Don't give a level a radius, a gradient or a shadow.
- Don't set text colour on a level except `inherit`: white is set once, by the panel.
- Don't nest more than the steps `level-fill-1..4` provide.
