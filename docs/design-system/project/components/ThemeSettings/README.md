# Theme settings panel

Where a user sets the look: a list of hues, when each time of day starts, and which hue each colour of each time of day takes. It is the Dash's **Settings** tab, and is embedded in the account drawer.

Code: `theme/ThemeSettingsPanel.tsx`, `HueList.tsx`, `ZoneCard.tsx`, `SkyZoneCard.tsx`, `RoleSlot.tsx`, `ThemeTimeline.tsx`, `themeDnd.ts`, `themeHues.ts`, `themeDraft.ts`, `palettes.ts` (`shadeStrip`), `themeSettings.scss`, `skyToggle.scss`; the colour range is [HueSlider](../HueSlider/README.md)'s `ColorRange`.

## Anatomy

One card, three parts under a short line saying how it works, with the Save control in its header (not shown where the embedding panel has its own):

1. **Hues** (`HueList`): up to **ten** flat rounded squares, each a hue at the saturation and lightness of the time of day in use, with **the number of colours that use it** inside (nothing when none does). Its note says "4 of 10 hues".
   - **Drag** a hue onto a colour of a time of day to give the colour that hue. The colour is **linked** to the hue: change the hue and every colour that uses it follows.
   - **Click** a hue to pick it up (it is outlined) and open its **slider** under the row (the whole wheel, 0 to 360, with the degrees, *Delete* and *Done*); then **click a colour** to give it that hue. Escape puts it down.
   - **Reorder** by dragging a hue onto another (it goes before it; the end of the row puts it last) or with Alt and the arrow keys.
   - **Add** with the "+" square at the end (it goes at ten): a new hue at red, its slider open. Duplicates are allowed.
   - **Delete** by dragging a hue **outside the list** (anywhere except a card, which does nothing with it), by its slider's *Delete*, or with the Delete key. **A hue in use cannot be deleted**: it stays and the note says where it is used ("Hue 1 is used by Day theme, so it was kept"). At least one hue stays. Cancelling a drag (Escape) never deletes.
2. **Day bar** (`ThemeTimeline`): 24 hours with each time of day that is on and its sun or moon. Where a time of day begins is a **handle** on the bar (a dark 6px bar outlined in white, so it reads on any hue; the seam you see even with one alone), and it is **the only place a start time is set**. **Drag** it and it snaps to the **nearest hour**, with the time in a bubble above it. A handle that meets the next one **pushes it along**: **the zones are always in the order Dawn, Day, Dusk, Night**, at least an hour apart when dragged, and none is carried past midnight. A time of day turned on begins at its **default time** (Dawn 4 AM, Day 10 AM, Dusk 4 PM, Night 10 PM) if that keeps the order, else as near it as fits between the ones on either side (a time it had before it was turned off is not remembered); start times saved out of order are put right when they load (one out of place goes between its neighbours, more than one and all go back to their default times). The handle is a slider: the **arrow keys** move it an hour (Shift: 10 minutes), and a **double click** puts the zone back to its default start. A line under it says whether the app follows the clock.
3. **Times of day**: a card each for Dawn, Day, Dusk and Night (`ZoneCard`).
   - Its **header** (`SkyZoneCard`) is a large version of the [sky toggle](../SkyToggle/README.md): the same painted sky, sun or moon, stars and clouds scaled up to the card's width (four times as wide as tall; the card measures its own width and sets the scale, because the packaged app's browser cannot work it out in CSS, and a sky left at a fixed size would not fill it), with the name and the start time over it. **Pressing it turns the time of day on or off.** Any may be off, but **at least one stays on** (the last one cannot be pressed; its label says why).
   - A time of day that is **off is only its header**, painted subtly: its sky is made of the **theme hue of the time of day in use**, at 45% of the saturation (`OFF_SKY_SATURATION`), with the name and "Off".
   - A time of day that is **on** has a line saying what it looks like ("Light background, dark text, vivid colours") and a **slot** for each colour: Theme, Accent, Alert and, **for an admin only**, Admin accent (`RoleSlot`). A slot shows the colour's name, its hue and the hue it is linked to ("260° · hue 4"), and under them **ten shades** of the hue at that time of day's saturation and brightness, darkest first, the colour's own ringed (`shadeStrip`: 6 points apart, five darker and four brighter when there is room; display only). A slot is a column of its name and hue, then the strip, **each as wide as the slot** (a button's own default is to shrink its contents, so the stretch is written out). Slots are always shown; while a hue is dragged over a card they **grow into labelled drop targets** and the one under the pointer is ringed.
   - **A colour cannot be emptied.** Dragging one slot onto another **swaps** the two within a time of day, and **copies** the hue (and its link) to the other from another time of day. Clicking a slot and then another does the same.
   - **Turning a time of day off clears its colours and its start time; turning it on gives it its default time and a copy of the colours of the one before it** in the day's order (Dawn, Day, Dusk, Night, round to Dawn), the nearest that is on.

## Staging

Every edit here is held in one shared **draft** (`themeDraft.ts`) and shows **only in the panel**: the rest of the app keeps its saved look until the Save control saves. While the draft holds edits Save is lit, **Save commits and saves**, **Undo steps back through the staged edits** (then on into the settings' own history) and a bar in the panel offers **Discard**. **Leaving the panel without saving drops the draft** with no prompt. Autosave does not send a draft: only Save does. The Dash tab and the account drawer can both show the panel; they share the draft.

## The clock

There is no switch for time-based theming. With **two or more times of day on** the app follows the day bar; with one on it always uses that one (it need not be Day). The header's sky toggle still locks a time of day, but steps only through those that are on.

## Tokens

`surface-*`, `accent`, `accent-hover`, `ov-sink-*`, `ov-lift-2`, `hairline`, `ink`, `ink-muted`; the hue swatches and shade strips are the account's own colours at the zone's saturation and lightness (the number inside a swatch is `fillInk`, whichever ink reads better). The audit covers the number on a swatch (`hue-swatch-count`) and the card header's text on its sky, on and off (`sky-text`, `sky-text-off`).

## Don't

- Don't offer saturation or lightness: the zone decides them, so readability cannot be lost.
- Don't apply an edit to the app as it is made; the draft is shown here and saved by the control.
- Don't let a hue in use be deleted, or a time of day with nothing in it be the last one on.
