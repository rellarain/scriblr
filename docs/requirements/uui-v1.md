# UUI version 1: requirements

What the User UI must do to be complete for phase 1 (see the [roadmap](../roadmap.md)). UUI lives in the header's drawer and holds what belongs to the user across every role: their activity, their schedule, their requests, and their account.

**Interview**: the phase 1 round is done (2026-11-26). The UUI round (the open questions below) comes before its mockup. UUI is built after WUI.

## Rules it follows

- **No placeholders**: every tile works end to end, or is moved to a later phase here, by name.
- **Accounts are local in phase 1**: the account lives on this machine; plans are shown but not charged. Phase 4 connects real accounts and payment.
- **UUI comes before VUI**, so UUI adds the local account record that Profile and Subscription need. VUI then builds Registration and Login on top of it.

## Dashboard console

| Tile | Today | Version 1 |
|---|---|---|
| Activity Log | filler text | **Every role's activity**, grouped by day, with a filter by role (writing, reading, learning, helper, admin) |
| Schedule | filler text | **One calendar of every role**: writing goals and agenda, helper time, admin work. **Everything is editable here.** HUI's Workweek and Workday fold into it; helper time stays within the hours the Office allots |
| Notifications | built | **Requests** across all roles, such as applications and schedule changes (action items for admins go to the Office's Desk) |
| Settings, Help | built | as built |

## Account console

| Tile | Today | Version 1 |
|---|---|---|
| Profile | filler text | **Account details** (name, sign-in) plus an **author profile**: pen name, bio, links |
| Subscription | filler text | **The local flow**: the plans, the one chosen, and changing it; no charge |
| Portfolio | filler text | **Books and their progress**, plus **learning progress**: the courses taken and the exams passed in Learning |
| Flags (how each content flag shows) | built | as built |
| Settings, Help | built | as built |

## Learning console

LUI, at `/learn`. It is finished in phase 2. In phase 1, the Portfolio reads its courses and exams as they are.

## Open questions (UUI round)

- Which kinds of notification each role gets.
- Whether AUI's Dashboard › Schedule stays, as a view of the same calendar, or goes.
- What the Portfolio's book progress shows: words, outline filled, goals.
- Where the author profile shows. It shows in RUI from phase 2.

## Moved to a later phase

- **Phase 2**: the Learning console (LUI).
- **Phase 4**: real accounts and payment for Subscription.
