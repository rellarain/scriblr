# Feedback: from the Help tile to voting

How a writer's feedback reaches the people who decide on it, in as few steps as possible. A writer writes it as a **statement** (a subject in the [channel list](../Channels/README.md) and a verb, such as *Fix Writer > Draft > Draft*) in the Help tile of the console they are in. A helper **checks** it in the Inbox. In the Office it is **voted on** (advice only) and **corrected** by Channel Management. The Project Plan's planner then accepts or vetoes it. Messages with the same subject and verb are **one statement**: they share its votes and are listed under it.

Code: `feedback/` (the shared pieces: `StatementCard`, `MessageCard`, `VoteControl`, `ChannelPicker`, `ToneFaces`, `ActingAs`, `MyFeedback`, the stores `staffStore.ts` and `mineStore.ts`, `feedbackApi.ts`, `feedbackLogic.ts`, `feedback.scss`); the Help tile `components/help/HelpTile.tsx`; the Inbox `helper/inbox/` (`InboxSection`, `CheckView`, `ConfigurationView`); the Office pages `admin/office/StatementPages.tsx`; Assignment `admin/RoleAssignment.tsx`; the user's dashboard `user/UserNotifications.tsx`. Storage: `feedback.json` in the app's data folder (backend `storage/feedback.py`, API `api/feedback.py`).

## The Help tile (every console)

Three icon tabs (`role="tablist"`), each with an `aria-label` and a title:

- **Guides** (`BookOpenIcon`): the Resources articles written for this console's node and the nodes under it, or the console's short default text.
- **Send feedback** (`EnvelopeIcon`), a form:
  - **What it is about**: the subject picker (`ChannelPicker`), starting at this console. Its path is a row of crumbs (press one to go back up to it), and a select narrows it one level down.
  - **What should happen**: the verb chips (`aria-pressed`).
  - The message itself.
  - **How you feel about it**: a smile and a frown, each pressed on its own (both is mixed, neither says nothing).
  - **Send**: enabled once the subject, a verb and some text are there.
  
  Where the writer was is sent with the feedback.
- **My feedback** (`ListIcon`): everything the writer sent, newest first. Each card shows:
  - its statement;
  - the steps it has passed (Received, Checked, In voting, Planned, In progress, Done or Declined), with the current one marked and `aria-current="step"`;
  - the reason when it was declined;
  - the questions staff asked, each with an answer box.
  
  A badge on the tab counts the unanswered questions.

The Writer's levels, the Draft, Training, every Reader page and the Admin, User and Helper panels each have one.

## The Inbox (Helper)

**Check** (`CheckboxIcon`, with the count) lists the messages nobody has checked yet, oldest first. For each one the helper:

- confirms or corrects its subject and verb;
- sets its tone (Pleasant, Unpleasant, Mixed, Neutral);
- presses **Check**, which is enabled once a tone is set.

A checked message leaves the list and joins its statement. **Shift+Enter** moves to the next card. **Verbs** (`GearIcon`) keeps the verb list writers choose from, with the keywords that mark a message's words.

## The Office: Voting and Channel Management

Both pages list the statements still in voting, most messages first. A select narrows them to an interface or a console. Each **statement card** (`.fbStatement`, a region named by its statement) shows:

- its verb and subject;
- the number of messages;
- the tally (yes, no, pass);
- a tone bar.

Each **message card** under it carries the text (the words that could mean a verb are marked), the date and both tones, and a **"## replies" chip**. The chip opens a drawer of:

- the questions asked of the writer, with their answers;
- staff comments (marked with a rule at the left);
- *Ask the writer* and *Comment for staff*.

- **Voting**: the square yes, no and pass buttons (`VoteControl`), each with an optional note. Votes are advice for the planner. A badge counts the statements still waiting for your vote.
- **Channel Management**: under each message, its subject, verb and tone. A message moved to another subject or verb leaves its statement and joins (or starts) another.

## Roles and Acting as

Roles are held per console of the channel list (or per interface), and set in **Office > Assignment**:

- **Checker**: checks in the Inbox (on Helper > Inbox).
- **Voter**: votes on a console's statements.
- **Channel manager**: corrects a console's statements. On Helper > Inbox, it also keeps the verbs.
- **Planner**: accepts or vetoes a console's statements.

A control the person acting cannot use is disabled, and its title gives the reason. The server refuses it too, and the refusal shows in an alert. There is no login yet, so the **Acting as** chip (initials) picks the staff member, remembered in this browser.

## The user's Notifications

User > Dashboard > Notifications lists the feedback with questions waiting first (answer them there), then the rest with where each stands.

## Tokens

- **Surfaces**:
  - `ov-sink-1`: a message card;
  - `ov-sink-2`: chips, fields, the replies drawer;
  - `ov-sink-3`: under the pointer;
  - `surface-raised` with a `hairline` ring: a statement card.
- **Text**: `ink`, `ink-muted`.
- **The accent** (`accent` / `on-accent`): a chosen verb, the current step, the primary button and the focus ring.
- **Tones** (`.fbScope`):
  - pleasant is `accent2` / `on-accent2`;
  - unpleasant is `alert` / `on-alert`;
  - neutral is an `ink` shade.

## Don't

- Don't name a subject by its words: point at its channel id.
- Don't show the writer's name to staff, or staff comments to the writer.
- Don't treat a vote as the decision: the planner accepts or vetoes.
