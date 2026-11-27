# VUI version 1: requirements

What the Visitor UI must do to be complete for phase 1 (see the [roadmap](../roadmap.md)). VUI is the base layer behind the page: what someone sees when no one is logged in. Today it is an empty page (`frontend/src/assets/Interfaces/VUI.tsx`).

**Interview**: the phase 1 round is done (2026-11-26). The VUI round (the open questions below) comes before its mockup. VUI is built after UUI, on the local account record UUI adds.

## Rules it follows

- **No placeholders**: every tile works end to end, or is moved to a later phase here, by name.
- **Accounts are local in phase 1**: registration, login and subscription work on this machine; a local account with a password or a passkey; plans shown but not charged. Phase 4 connects real accounts and payment.

## Welcome console

The landing page.

| Tile | Version 1 |
|---|---|
| Writer Services | **Subscription info** (the plans); the **training curriculum** (Learning's writer courses); **live, read-only demos on sample data** of the Project, Plotting, Outline, Drafting and Revision tools |
| Reader Services | **Subscription info**; the **training curriculum** (Learning's reader courses); read-only demos of the **library catalog** and the **reading tool** |

Left out of phase 1: **Service Reviews** and the **Translator preview** (see Open questions).

## Registration console

| Tile | Version 1 |
|---|---|
| Reader Registration, Writer Registration | Sign up as a reader, a writer or both |
| Subscription Payment | Pick a plan; no charge in phase 1 |
| Account Creation | Make the local account, with a password or a passkey |

## Login console

| Tile | Version 1 |
|---|---|
| Account Details | The account to sign in to |
| Password, Passkey | Sign in with either |
| Forgotten Account, Forgotten Password | Get back in on this machine (how: see Open questions) |

## Open questions (VUI round)

- How "forgotten" works on one machine with no email: for example, a recovery code given at registration.
- Whether the Reader demo includes the bookclub tool, since bookclubs are phase 2.
- Which phase Service Reviews and the Translator preview go to. Suggested: Service Reviews in phase 4, with real users; the Translator preview in phase 3, with TUI.
- Whether a reader-only account sees WUI.

## Moved to a later phase

- **Phase 3** (to confirm): the Translator preview, with TUI.
- **Phase 4**: real accounts and payment; Service Reviews (to confirm).
