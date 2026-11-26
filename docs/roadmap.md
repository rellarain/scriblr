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

WUI, UUI, VUI, HUI and AUI completely built out with their version 1 functionality.

Tasks:
- [ ] Version 1 interview, one interface at a time: WUI, UUI, VUI, HUI, AUI.
- [ ] Header: one container for the interface toggles (AUI, HUI | WUI, RUI, LUI) beside the sky toggle.
- [ ] The band under the header for the side interfaces' mini forms, in place of the 40px side divider: HUI's Queue, chats, New chat, Outbox and Settings; AUI's work and break meters.
- [ ] AUI: the Inbox (Check and Verbs) as a tab of the Office's Desk.
- [ ] HUI: the Outbox, where feedback confirmed in a chat is completed and sent to the Office Inbox.
- [ ] AUI: four modes by resizing (mini, small, medium, max), and the work and break meters.

Follow-ups:
- [ ] The help channel is still named "Training". Its id comes from its name, so renaming it needs an explicit id plus a migration that renames the node by id.
- [ ] The Checker role is still kept on the Helper › Inbox channel node (`helper/inbox`) after the Inbox moved to the Office: the same id-and-migration change.

### Phase 2: RUI, LUI, and version 2

- RUI and LUI completely built out with their version 1 functionality.
- Version 2 of WUI, UUI, VUI, HUI and AUI.

### Phase 3: TUI, and version 2 and 3

- TUI (the Translator UI) built out with its version 1 functionality.
- Version 2 of RUI and LUI.
- Version 3 of WUI, UUI, VUI, HUI and AUI.

### Phase 4: release

Deployment and releasing Scriblr to other users, with subscriptions.

### Phase 5: phones and working together

- Phone apps.
- Users working together.

More items will be added.

## Changelog

- 2026-11-26: First version: the five phases, the version rule, and the phase 1 tasks for the header and the side interfaces.
