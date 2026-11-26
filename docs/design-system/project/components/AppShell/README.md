# App shell: header, band, sidebar and sky toggle

The frame around the Writer. The **header** across the top, the **band** under it while a side interface is on, the **page** (WUI, or RUI or LUI) in the middle, and the **sidebar** at one side. The preview runs the whole app, with the pretend project in it.

Code: `frontend/src/App.tsx`, `Header.tsx`, `HeaderUserCard.tsx`, `NavSwitcher.tsx`, `HeaderActivityRibbon.tsx`, `ShellBand.tsx`, `HuiMini.tsx`, `Sidebar.tsx`, `theme/SkyToggle.tsx`; `App.scss`.

## Header

A fixed **50px** across the whole width: a 40px row and a 10px activity ribbon. Nothing beside it moves it, so the toggles stay put however wide AUI is.

- **User card** (left): a photo square, the user's name in bold and their organisation (an icon and a code) beneath; it opens the account drawer, which slides down from under the header.
- **Interface container** and the **sky toggle** (right): one group of 30px icon buttons for every interface (`NavSwitcher.tsx`), then the 120 x 30 [sky toggle](../SkyToggle/README.md).
  - **Side interfaces**: **Admin** (AUI, administrators only; pressed, it is the admin accent) and **Helper** (HUI). Each turns on and off on its own. While HUI is off, its button carries the number of chats waiting (the alert colour, top right).
  - A hairline, then the **pages**: **Writer, Reader, Learning** (WUI, RUI, LUI). One is the page; it is the accent. Pressing the page you are on shows the base layer (VUI).
- **Activity ribbon**: a 10px strip across the header, **144 slots of ten minutes** for today, drawn from the account's real activity (every project added together) and its scheduled shifts (`HeaderActivityRibbon.tsx`, `lib/ribbon.ts`). A slot with activity is the **accent hue**, shaded by how today compares with the usual in that slot (the average of the last 28 days): in the light zones (**Dawn, Day**) more is **darker**, in the dark ones (**Dusk, Night**) more is **lighter**, three steps (lower, about the same, higher). A slot a shift still has to fill is a little **brighter** than the ground and one it did not fill (nothing logged in it, judged slot by slot) a little **darker**. The slot the clock is in is the ink colour. A slot with nothing collapses to no height, so it never covers the user card beneath. It looks again when something is saved, every minute, at midnight and when the zone changes. It is decorative (its `aria-label` is the summary); the shades are not held to a contrast ratio, only the ink of the current slot.

## Band

A 40px row under the header, across the whole width, shown while a side interface is on (`ShellBand.tsx`). It holds each side interface's **mini form**, right-aligned under the interface container, on the sidebar's surface (`surface-sidebar-1`). The page and the sidebar start below it; an open account drawer covers it.

- **HUI** (`HuiMini.tsx`): the **queue meter** (150 x 30, no icon: one segment per slice of chats, escalated and first-tier, in progress and waiting; below 30 chats each is a 5px block from the left edge, from 30 on they share the width), the **chat heads**, **New chat** and **Settings**. (The Inbox is a tab of AUI's Office > Desk.) A button opens HUI's panel on that console; pressing the open one again folds the panel back into the band.

## Sidebar

On the left or the right, as the user prefers (handedness), below the header and the band: HUI's 400px panel, opened from the band, and for administrators AUI's panel, outermost, in multiples of 400px, dragged from its inner edge. When a panel opens the page narrows; nothing covers the header. There is no divider: the side interfaces' buttons are in the header and the band.

## Tokens

`surface-sidebar-1`, `surface-sidebar-2`, `surface-raised-*`, `ink`, `accent`, `accent2` (the admin panel). The shell keeps rounded **buttons** (the user card, the nav switcher, the zone toggle); its surfaces and fields, like the Writer's, are flat and square ([known-drift](../../known-drift.md)).

## Don't

- Don't put page content in the header; it is the user, the interfaces and the clock.
- Don't put a side interface's buttons beside its panel; they go in its part of the band.
- Don't let the sidebar overlap the page; the page's width is the screen less the sidebar.
