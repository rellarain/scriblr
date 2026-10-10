# How to extend it

Short recipes for the changes that come up. Each ends the same way: **regenerate, test, republish**.

```bash
cd scriblr/frontend
npm run design-system     # tokens.json, contrast.md, icons, previews, the bundle
npx vitest run            # includes the contrast audit and the design-system tests
```

## Add a tab to a level

1. Add an entry to the level's tab list: `levels/dashTabs.tsx`, `projectTabs.tsx` or `outlineTabs.tsx` (`LevelTab`: `id`, `label`, an `Icon`, `render(ctx)`; `newLabel` / `onNew` if it has something to add; `searchable` if it filters; `surface` or `fill` for an editor; `end` for Settings and Help).
2. Draw its body with the class conventions of the others: content goes in `.wrTabPane` (Mid) and `.wrTabTileBody` (Max), which carry the level's text and washes; use `.wrCard` or `.wrNote` for cards, `.wrSmallBtn` for buttons, `.wrField` for inputs. An editor on a light surface sets `surface`.
3. Put its label first in `content-voice.md`'s table if it is new copy.
4. The tab works at Mid (one at a time) and Max (a tile on the split grid) with nothing else to do; its tile joins the grid when opened.

## Add a tile or a card

- A tile is a `SplitArea` tile: `{ id, title, Icon, children }`. Give the grid a `gridId` so its layout is remembered, and a `defaultTree` if it should start somewhere other than even columns.
- A card is a flat box one step deeper than the one it sits in (`--wr-fill-N` on a level, `--wr-frame-N` on paper). Don't give it a radius or a shadow; a raised card on the theme's own surface is `--surface-raised` with a `hairline`. The last step is a light input.

## Add a colour

1. A new **colour for something the user chooses** (a hue) needs nothing new: use `fillColorCss(hue)` for a panel, `themeColorCss(hue)` for a tint, `tabColors` for a tab, and keep white on a level.
2. A new **fixed colour** is a token: derive it in `theme/tokens.ts` / `theme.scss` from the zone (never from a fixed lightness), and register it with `@property` if it should fade between zones.
3. Every text on it is a **pair**: add it to `frontend/src/theme/contrastAudit.ts` (`paletteRatios` or `levelRatios`). The audit runs it over every hue in every zone; if it fails, fit the colour (`fitLightness` in `readable.ts`) rather than choosing a lightness by eye.
4. Add it to `scripts/design-system/colors.ts` so it is in `tokens.json` for all four zones, with a usage note.

## Add an icon

Draw it on the 24 grid, 1.8 stroke, round caps, no fill, and add it to `assets/icons/index.tsx` with `IconBase`. Use it at 14, 16 or 18. `npm run design-system` exports it to `assets/Icons`.

## Add a component to this system

1. Add a card to `frontend/src/designSystem/cardMeta.ts` (id, folder, title, group, summary, height) and to `cards.tsx` (its render, and the zones and views it opens with). The card runs the real component against `mockBackend.ts`; use real labels and lorem ipsum for what is inside.
2. Write `components/<Name>/README.md`: what it is, its anatomy with class names, the tokens it uses, its states, what the consumer provides, and what not to do.
3. `npm run design-system` writes its `preview.html`. Open `docs/design-system/dev.html?card=<id>` to see it.

## Keeping it true

The generated files are never edited by hand; change the code and regenerate. `tokens.json`, `contrast.md`, the icons and the previews are compared with the code in `designSystem` tests, so a stale file fails the suite. The large generated bundle (`components/bundle.js`, `bundle.css`) is not committed: it is built when the system is published.
