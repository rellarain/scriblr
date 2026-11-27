# Scriblr roadmap

The plan for building Scriblr, phase by phase. It is a living document: add items, details and tasks to their phase as they come up, and note each change in the changelog at the end. The feature inventory (every interface, console and tile, with what each holds) is [`frontend/src/scrilbrPlan.md`](../frontend/src/scrilbrPlan.md).

## How versions are defined

- **Version 1** of an interface is what it needs to be completely built out. Its requirements are reviewed in a multiphase interview, one interface at a time, before or during its phase.
- **Version 2 and 3** are defined by the improvements to its consoles, tiles and functionality that are found after the previous version's release.

## Terms

| Shorthand | Interface |
|---|---|
| WUI | Writer UI |
| RUI | Reader UI |
| VUI | Visitor UI (the base layer behind the page) |
| LUI | Learning UI |
| UUI | User UI |
| AUI | Admin UI |
| HUI | Helper UI |
| TUI | Translator UI |

An **interface** is a collection of consoles for one type of user; a **console** is a general activity type within an interface; a **tile** is a specific activity type within a console.

## Phases

| Interface | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| WUI | v1 | v2 | v3 |
| UUI | v1 | v2 | v3 |
| VUI | v1 | v2 | v3 |
| HUI | v1 | v2 | v3 |
| AUI | v1 | v2 | v3 |
| RUI | | v1 | v2 |
| LUI | | v1 | v2 |
| TUI | | | v1 |

RUI and LUI already have early builds; phase 2 completes their version 1.

### Phase 1: the core interfaces, version 1

WUI, UUI, VUI, HUI and AUI completely built out with their version 1 functionality. What each one includes is in its requirements: [WUI](requirements/wui-v1.md), [UUI](requirements/uui-v1.md), [VUI](requirements/vui-v1.md), [HUI](requirements/hui-v1.md), [AUI](requirements/aui-v1.md).

**How it runs**: interface by interface, each finished before the next: WUI, UUI, VUI, HUI, AUI. For each one:
1. its interview round settles the open questions in its requirements;
2. a **mockup** (a Design artifact) of its new and changed consoles and tiles, approved before any code;
3. the build, in slices, each committed with its tests and checked live on scratch data;
4. the full suites, then a push.

**Rules for every phase 1 interface**:
- **No placeholders.** Every console and tile works end to end, or is moved to a later phase by name and hidden behind one `V2_FEATURES` switch (its code stays).
- **Accounts are local.** Welcome, Registration, Login, Account and Subscription work on this machine: a local account with a password or a passkey; plans shown, not charged. Phase 4 connects real accounts and payment.
- **UUI before VUI.** UUI adds the local account record its Profile and Subscription need; VUI builds Registration and Login on it.
- **Admin levels map onto the roles that exist**: Site/System is the owner and admins with site rights, Department is director, Team is manager, Support is channel support.
- **Every tile and console takes the hue of what it belongs to**: the project's on the Project level, the book's in the Outline, the chapter's in the Draft (a series', an arc's or a plot category's where it applies), from the level-scoped tokens, never one fixed colour (the user, approving the WUI mockup).

Tasks:
- [x] Version 1 interviews: WUI (four rounds) and the phase 1 round for UUI, VUI, HUI and AUI.
- [ ] Each interface's own round, before its mockup: UUI, VUI, HUI, AUI (their open questions are in their requirements).

WUI (mockup first):
- [x] Take Dash > Readers, Project > Items and Outline > Publish out of v1 behind the `V2_FEATURES` switch (they return in WUI v2), with what only works with them: the chapter's Publish and published versions, For readers, the Footnote tool's content flags, item links and carried items.
- [x] Seven flag kinds: Review, Add, Remove, Merge, Change, Simplify, Expand; Edit becomes Change and Delete becomes Remove. A Merge can name the second passage, picked on the page.
- [x] Export: PDF with full Unicode, EPUB and JSON, for a project, a book or a chapter.
- [x] Paragraph and Sentence tools: move, split and join paragraphs (pinned plotpoints follow); style aids for long sentences, repeated words and readability, each on or off.
- [x] Revision passes in the project's schedule, each with its own goals, across all the project's books and chapters; their open flags in the backlog.
- [ ] Book goals with or without dates, and estimates from the writer's activity of how long the rest will take; the timeline follows them where there are no dates.
- [ ] Outline templates, the writer's own: save a book's or a chapter's outline shape and start a new one from it.
- [ ] The Scratchpad converts a note into an outline node, a plotpoint, draft text or a revision flag.
- [ ] Project > History as one timeline (activity, outline and plot snapshots, chapter revisions) with restore where allowed.
- [ ] Finish Characters: the writers' own designer and the mannequin's step-by-step editor back on.
- [ ] Finish Maps: shapes only with biome hues; lock the environment layer; places over time; routes and travel; story links; generated maps.

UUI (mockup first):
- [ ] The local account record (account details, plan) that Profile, Subscription and VUI use.
- [ ] Dashboard > Activity Log: every role's activity by day, with a role filter.
- [ ] Dashboard > Schedule: one calendar of every role, all editable; HUI's Workweek and Workday fold into it.
- [ ] Account > Profile: account details and an author profile (pen name, bio, links).
- [ ] Account > Subscription: the local plan flow, no charge.
- [ ] Account > Portfolio: books and their progress, and learning progress.

VUI (mockup first):
- [ ] Welcome: Writer Services and Reader Services, with plans, the training curriculum and live read-only demos on sample data.
- [ ] Registration: reader and writer registration, a plan (no charge), and the local account.
- [ ] Login: password and passkey, and getting back in to a forgotten account or password.

HUI (mockup first):
- [ ] The work and break meters and the Break button in HUI's band, for everyone with helper time.
- [ ] Chat > User: the user and their context (profile, current project, book and words, earlier chats, feedback).
- [ ] The Dispatch console for leads: live helper status by department and queue, moving helpers between queues, performance.

AUI (mockup first):
- [ ] Name the admin levels in AUI (Site/System, Department, Team, Support) and add what is missing.
- [ ] Dashboard > Notifications: requests (applications, schedule changes, promotions).
- [ ] Office > Desk: the action items (plan items due or late, escalated chats, staff requests to act on).
- [ ] Office: build every "soon" tab: site, department and queue and resource analytics; team and person performance; person activity and flags; user engagement and learning; team applications.
- [ ] Configuration > Overview: site-wide settings (app name, default theme, later-version switches) and a summary of each Configuration page.
- [ ] Hide the Organizer console in phase 1 (Bookclub Management moves to phase 2).
- [ ] The admin Designer's switched-off tools back on.

Done:
- [x] Header: one container for the interface toggles (AUI, HUI | WUI, RUI, LUI) beside the sky toggle.
- [x] The band under the header for the side interfaces' mini forms, in place of the 40px side divider: HUI's Queue, chats, New chat, Outbox and Settings; AUI's work and break meters.
- [x] AUI: the Inbox (Check and Verbs) as a tab of the Office's Desk.
- [x] HUI: the Outbox, where feedback confirmed in a chat is completed and sent to the Office Inbox.
- [x] AUI: four modes by resizing (mini, small, medium, max), and the work and break meters, with the break allowance on Configuration > SLA.

Follow-ups:
- [ ] The help channel is still named "Training". Its id comes from its name, so renaming it needs an explicit id plus a migration that renames the node by id.
- [ ] The Checker role is still kept on the Helper › Inbox channel node (`helper/inbox`) after the Inbox moved to the Office: the same id-and-migration change.

### Phase 2: RUI, LUI, and version 2

- RUI and LUI completely built out with their version 1 functionality.
- Version 2 of WUI, UUI, VUI, HUI and AUI.
- WUI v2 so far: Dash > Readers, with real readers from RUI; Project > Items; Outline > Publish, with RUI.
- LUI includes UUI's Learning console.
- AUI v2 so far: Organizer > Bookclub Management, with RUI's bookclubs.

### Phase 3: TUI, and version 2 and 3

- TUI (the Translator UI) built out with its version 1 functionality.
- Version 2 of RUI and LUI.
- Version 3 of WUI, UUI, VUI, HUI and AUI.
- VUI: the Translator preview on Welcome, with TUI (to confirm in the VUI round).

### Phase 4: release

- Deployment and releasing Scriblr to other users, with subscriptions.
- Real accounts and payment in place of phase 1's local accounts and plans.
- VUI: Service Reviews on Welcome, once there are real users (to confirm in the VUI round).

### Phase 5: phones and working together

- Phone apps.
- Users working together.

More items will be added.

## Changelog

- 2026-11-26: First version: the five phases, the version rule, and the phase 1 tasks for the header and the side interfaces.
- 2026-11-26: The header container, the band, the Office Inbox, the HUI Outbox, and AUI's modes and meters are done.
- 2026-11-26: WUI v1 interview round 1 (the bar and the Dash): requirements in `requirements/wui-v1.md`.
- 2026-11-26: WUI v1 interview round 2 (the Project level): outline templates, revision passes, Maps and Characters finished, Items to v2.
- 2026-11-26: WUI v1 interview round 3: what finishing Characters means, book goals with or without dates and estimates, Publish to v2.
- 2026-11-26: WUI v1 interview round 4: Maps tools, seven flag kinds, export formats, paragraph and sentence tools. The WUI interview is done.
- 2026-11-26: The phase 1 plan: requirements for UUI, VUI, HUI and AUI; build order (interface by interface, a mockup before each one's code); local accounts; admin levels; items moved to phases 2, 3 and 4.
- 2026-11-26: The WUI v1 mockup is approved; every tile takes its own scope's hue. WUI slice 1: the `V2_FEATURES` switch and the seven flag kinds.
- 2026-11-26: WUI slice 2: export. A project, a book or a chapter as a PDF (any script, in bundled Noto fonts; open revision flags in the margin when asked), an EPUB or JSON, from the Preview's new Export tool. The Preview's buttons and selects now read on the day and the night page.
- 2026-11-26: WUI slice 3: paragraph tools (up, down, to another moment of the book, split, join; a plotpoint can be pinned to a paragraph, and pins, footnotes, reactions and revision flags go with it) and style aids (long sentences, repeated words, reading level).
- 2026-11-27: WUI slice 4: revision passes. The project's Schedule console has a Revision passes tile (each pass's kinds of flag, dates and goals: resolve its flags, cut or add words, read every chapter in the Preview), and a running pass's open flags are a group in the Backlog.
