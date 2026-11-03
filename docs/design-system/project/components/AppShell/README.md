# App shell: header, sidebar and sky toggle

The frame around the Writer. Three layers: the **header** across the top, the **page** (the Writer, or the Reader or Training) in the middle, and the **sidebar** at one side. The preview runs the whole app, with the pretend project in it.

Code: `frontend/src/App.tsx`, `Header.tsx`, `HeaderUserCard.tsx`, `NavSwitcher.tsx`, `HeaderActivityRibbon.tsx`, `Sidebar.tsx`, `SidebarDivider.tsx`, `theme/SkyToggle.tsx`; `App.scss`.

## Header

A fixed **50px**: a 40px row and a 10px activity ribbon.

- **User card** (left): a photo square, the user's name in bold and their organisation (an icon and a code) beneath; it opens the account drawer, which slides down from under the header.
- **Page switcher** and the **sky toggle** (right): three 30px icon buttons (Writer, Reader, Training; the current one is the accent), then the 120 x 30 [sky toggle](../SkyToggle/README.md). Pressing the page you are on shows the base layer.
- **Activity ribbon**: a 10px strip across the header, **144 slots of ten minutes** for today, drawn from the account's real activity (every project added together) and its scheduled shifts (`HeaderActivityRibbon.tsx`, `lib/ribbon.ts`). A slot with activity is the **accent hue**, shaded by how today compares with the usual in that slot (the average of the last 28 days): in the light zones (**Dawn, Day**) more is **darker**, in the dark ones (**Dusk, Night**) more is **lighter**, three steps (lower, about the same, higher). A slot a shift still has to fill is a little **brighter** than the ground and one it did not fill (nothing logged in it, judged slot by slot) a little **darker**. The slot the clock is in is the ink colour. A slot with nothing collapses to no height, so it never covers the user card beneath. It looks again when something is saved, every minute, at midnight and when the zone changes. It is decorative (its `aria-label` is the summary); the shades are not held to a contrast ratio, only the ink of the current slot.

## Sidebar

On the left or the right, as the user prefers (handedness): a 40px **divider** with the helper's buttons (Inbox, Queue, Settings, chats), and, opened, a 400px helper panel; for administrators an outer admin panel in multiples of 400px, dragged from its outer edge. When it opens the page narrows; it never covers the header.

## Tokens

`surface-sidebar-1`, `surface-sidebar-2`, `surface-raised-*`, `ink`, `accent`, `accent2` (the admin panel). The shell keeps rounded **buttons** (the user card, the nav switcher, the zone toggle); its surfaces and fields, like the Writer's, are flat and square ([known-drift](../../known-drift.md)).

## Don't

- Don't put page content in the header; it is the user, the page switch and the clock.
- Don't let the sidebar overlap the page; the page's width is the screen less the sidebar.
