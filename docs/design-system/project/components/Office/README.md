# Office: seven tiles with tabs

Admin > Office is seven tiles: Site, Department, Team, Channel, Desk, Admin/Helper and User. Each tile lists its parts as tabs in its own title bar. A tile about one of several things has a picker at the top of its body: a department, a team, a console, a staff member or a user. Everything acts as the owner, who holds every role.

Code: `admin/office/OfficeTiles.tsx` (one component per tile), `admin/office/TabbedTile.tsx` (the tabs and the picker) and `staff.scss` (`.ofTile`, `.ofPicker`, `.ofPanel`, `.ofSoon`). The parts are the [Staff](../Staff/README.md) pages and the [Feedback](../Feedback/README.md) statement pages, split up and filtered by what is picked. The Admin panel gives each tile a slot in its title bar (`ConsolePage.titleExtras` in `components/tiles/consoleTiles.tsx`) and the tile portals its tabs there.

## The tiles

| Tile | Icon | Picker | Tabs |
|---|---|---|---|
| Site | `GlobeIcon` | none | Site analytics · Departments (add, rename, set the director, delete an empty one) |
| Department | `BuildingIcon` | department | Details (name, director, counts) · Roster · Schedule (everyone's helper time) · Analytics · Teams (add, rename, set the manager, delete an empty one) |
| Team | `PeopleIcon` | team | Assignment (the roles of its admins) · Allotment (its people's helper hours) · Schedule (everyone's helper time) · Performance · Members (add, take off, the manager) · Applications |
| Channel | `FilterIcon` | console | Queue analytics · Resource analytics · Helper-checked feedback (Channel Management for that console) |
| Desk | `DeskIcon` | none | Inbox (feedback to check, and the verbs; see [Feedback](../Feedback/README.md)) · Voting · Toning (each message's tone) · Explication (what each message is about and what should happen) |
| Admin/Helper | `ClipboardIcon` | staff member | Training · Performance · Activity · Flags · Promote · Demote · Term · Allot hours |
| User | `UserIcon` | user (the writer and whoever asked for support) | Engagement · Learning · Hire |

- **Promote** lists what can raise the person: a support tier on a console where their training is finished, helper to admin, and manager of their team or director of their department (admins only).
- **Demote** lists what can lower them: a promotion taken back, admin to helper, and the teams they manage and departments they direct. Someone made a helper leads nothing, as someone who left does (the server clears it too).
- **Term** marks someone as left (never deleted) or rehires them. The owner cannot be termed or made a helper: those buttons are off, with the reason as their title.
- **Hire** makes the user picked a helper or an admin, in a team. A user already on the staff shows as such.
- **Schedule** (Department and Team): everyone's helper time, read only, as each set it (helpers on Helper > Settings, admins on Admin > Dashboard > Schedule): a row per person with helper hours, a column per day ("9:00–13:00"), their hours, and **This week** / **Next week** chips (`aria-pressed`). The table scrolls sideways when narrow. See [Feedback](../Feedback/README.md), Helper > Settings.
- Parts with no data in the app yet (the analytics, performance, activity, flags, engagement, a user's courses in Learning and applications) say in one line what they will hold. Users will apply in Learning once they pass its required exams.

## Tabs and picker

- **Tabs**: `role="tablist"` labelled "<Tile> tabs", in the title bar after the tile's name, drawn as the tile tab bar (`tileTabBar`, `tileTabBtn`, `tileTabBtn--on`). Each tab is an icon button with `aria-label` and `title`, `aria-selected`, and `aria-controls` pointing at the tile's `tabpanel`. Left and Right move to the next tab (Home and End to the ends), and focus follows.
- **Picker**: a select at the top of the body (`fbSelect ofPicker`), named after what it picks. While its list loads, or when it is empty, a line says so in its place.
- **Remembered**: the open tab and the thing picked are kept on this computer per tile (`scriblr.office.<tile>.tab` and `.subject`). A thing that is gone falls back to the first in the list.
- **Body**: the open tab's part fills the rest of the tile and scrolls; a page inside it does not scroll on its own.

## Tokens

- **Tabs**: the title bar's tab colours (the accent for the open tab, with `on-accent`).
- **Text**: `ink`; `ink-muted` for the placeholder lines and empty lists.
- **Surfaces**: as the Staff and Feedback pages (`surface-raised`, `hairline`).

## Don't

- Don't put a tile's tabs in its body: they go in its title bar.
- Don't explain a part on screen: what each does is on the Office's Help page.
- Don't fill a part with made-up numbers: until the app has the data, it says what it will hold.
