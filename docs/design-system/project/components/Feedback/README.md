# Feedback: from the Help tile to voting

How a writer's feedback reaches the people who decide on it, in as few steps as possible. A writer writes it as a **statement** (a subject in the [channel list](../Channels/README.md) and a verb, such as *Fix Writer > Draft > Draft*) in the Help tile of the console they are in. A checker **checks** it in the Inbox, a tab of the Office's Desk (AUI). In the Office it is then **voted on** (advice only) and **corrected** by Channel Management. The Project Plan's planner then accepts or vetoes it. Messages with the same subject and verb are **one statement**: they share its votes and are listed under it.

Code: `support/` (the chat stores and API: `supportStores.ts`, `supportApi.ts`, `supportTypes.ts`); `feedback/` (the shared pieces: `StatementCard`, `MessageCard`, `VoteControl`, `ChannelPicker`, `ToneFaces`, `ActingAs`, `MyFeedback`, the stores `staffStore.ts` and `mineStore.ts`, `feedbackApi.ts`, `feedbackLogic.ts`, `feedback.scss`); the Help tile `components/help/HelpTile.tsx`; the Inbox `admin/office/inbox/` (`InboxSection`, `CheckView`, `ConfigurationView`); the Outbox `helper/outbox/OutboxSection.tsx`; the Office pages `admin/office/StatementPages.tsx`; Assignment `admin/RoleAssignment.tsx`; the user's dashboard `user/UserNotifications.tsx`. Storage: `feedback.json` and `support.json` in the app's data folder (backend `storage/feedback.py` and `storage/support.py`, API `api/feedback.py` and `api/support.py`).

## The Help tile (every console)

Four icon tabs (`role="tablist"`), each with an `aria-label` and a title:

- **Guides** (`BookOpenIcon`): the Resources articles written for this console's node and the nodes under it, or the console's short default text.
- **Send feedback** (`EnvelopeIcon`), a form:
  - **What it is about**: the subject picker (`ChannelPicker`), starting at this console. Its path is a row of crumbs (press one to go back up to it), and a select narrows it one level down.
  - **What should happen**: the verb chips (`aria-pressed`).
  - The message itself.
  - **How you feel about it**: a smile and a frown, each pressed on its own (both is mixed, neither says nothing).
  - **Send**: enabled once the subject, a verb and some text are there.
  
  Where the writer was is sent with the feedback.
- **Chat** (`ChatBubblesIcon`), a chat with support for this console (`components/help/HelpChat.tsx`):
  - **Before a chat**: the subject picker (it must be inside a console: the chat goes to that console's queue) and **Your question**; **Start the chat**.
  - **During a chat**: the conversation (`role="log"`, labelled *Conversation*): the writer's messages on one side, staff's on the other, and short notes for what staff did (*Someone is here to help.*, put on hold, checked in, sent to another console, passed to a more experienced helper).
  - A **guide** staff sent opens in place (a `<details>` with the Resources articles of that part of the app).
  - **Feedback drafted for you** (a group): the statement and the words staff wrote with the writer, and **Send this feedback as mine**. Once sent it is the writer's own feedback, listed under My feedback as received, and waits in the [Outbox](#the-outbox-helper) of the staff member who drafted it.
  - **Your message** with **Send the message**, and **Close the chat**. A closed chat lets the writer start a new one.
- **My feedback** (`ListIcon`): everything the writer sent, newest first. Each card shows:
  - its statement;
  - the steps it has passed (Received, Checked, In voting, Planned, In progress, Done or Declined), with the current one marked and `aria-current="step"`;
  - the reason when it was declined;
  - the questions staff asked, each with an answer box.
  
  A badge on the tab counts the unanswered questions.

The Writer's levels, the Draft, Learning, every Reader page and the Admin, User and Helper panels each have one.

## The Outbox (Helper)

A console of HUI (`OutboxIcon`, with the count on its button in the band). It holds the feedback writers confirmed in the staff member's chats, waiting for them to complete it: **From today's chats** first, then **Earlier** (nothing is dropped until it is sent). Each card shows who it is from and the writer's words, then:

- **About** and **Verb**, as the chat showed them;
- **Tone** (Pleasant, Unpleasant, Mixed, Neutral);
- **Note**: an optional comment for staff, sent with it;
- **Send** (enabled once a tone is set), which puts it in the Inbox.

Changes save at once. Only the staff member who drafted it sees it or sends it, and until it is sent it is in nobody's Inbox. A drafter who is not on the feedback staff has no Outbox: the confirmed feedback goes straight to the Inbox.

## The Inbox (Office > Desk)

The first tab of the Office's **Desk** tile, before Voting. **Check** (`CheckboxIcon`, with the count) lists the messages nobody has checked yet, oldest first. For each one the checker:

- confirms or corrects its subject and verb;
- sets its tone (Pleasant, Unpleasant, Mixed, Neutral);
- presses **Check**, which is enabled once a tone is set.

A checked message leaves the list and joins its statement. **Shift+Enter** moves to the next card. **Verbs** (`GearIcon`) keeps the verb list writers choose from, with the keywords that mark a message's words.

## The Office: Voting and Channel Management

Both list the statements still in voting, most messages first. Voting is a tab of the Office's **Desk** tile, beside **Toning** (each message's tone) and **Explication** (what each message is about and what should happen); a select there narrows them to an interface or a console. Channel Management is the **Helper-checked feedback** tab of the Office's **Channel** tile, for the console its picker chooses (see [Office](../Office/README.md)). Each **statement card** (`.fbStatement`, a region named by its statement) shows:

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

## The Helper's chats

The Helper panel's **Conversation** tile (`helper/ChatsSection.tsx`, its state in `helper/useHelperChats.ts`) is the staff side of the Help tile's Chat. The sidebar's **New chat** takes the chat that is next for the staff member by the queues (below); the chat heads are the chats the staff member acting is in. A chat that is transferred, escalated or closed leaves the panel.

- **Header**: back, the writer's name, the queue (a console) and the support tier, and the **Stage** select (Greeting, The issue, Acknowledgement, Solutions, Resolution, Closing).
- **Focal feature**: what the chat is about, changed with the subject picker.
- **The conversation**: the same events as the writer sees, from the other side.
- **Composer**, three tabs:
  - **Response**: **Your response** and **Send the response** (a helper message or an admin message, by who is acting).
  - **Guide**: a part of the app and **Send the guide** (the writer sees its articles; the stage moves to Solutions).
  - **Feedback**: a form, **Draft feedback**: subject, verb chips, **The feedback**, how the writer feels, and **Draft it for the writer to confirm**.
- **Actions**: Check in, Put on hold, Escalate (the next tier, at most 3; back to waiting), **Transfer to** another console with **Transfer** (back to waiting in that queue), and Close the chat.

Every change is saved at once (`support.json`) and both sides read again, so a message sent in a Help tile shows in the Helper panel straight away and the other way round.

## The Queue console (Helper)

One console per console queue of the channel list (`helper/QueueSection.tsx`, `helper/queue.scss`; the store `useQueues` in `support/supportStores.ts`; backend `storage/queues.py`), for two audiences.

- **Support tiers** are per console ([Staff](../Staff/README.md)): 1 a helper promoted on it, 2 a helper promoted on its interface, 3 its channel support, 4 an admin with helper hours promoted on it. A chat starts at tier 1; escalating moves it up, to 4 at most.
- **Helper time**: being inside one of this week's scheduled blocks (Helper > Settings, below).
- **Levels**: Low, Medium, High, Urgent, from how many users are waiting, by ranges the queue's channel support set (one default, and per queue). A temporary override raises a queue's level for 1 to 24 hours.
- **For everyone, the switchboard**:
  - the staff member, On shift or Off shift, and their hours this week;
  - per interface, a row for each console where they have a tier: its name, their tier (T1 to T4), its level chip, how many are waiting, and a switch (`role="switch"`);
  - a queue is **required** (on, locked) up to a tier set by its level: Low tier 1, Medium tiers 1-2, High tiers 1-3, Urgent every tier; above that it is optional and the switch is theirs;
  - without helper time every switch is off and locked.
- **The next chat** (New chat): from the queues that are on, a chat at their own tier first (an escalation from the tier below); a lower tier's chat only when its queue is High or Urgent, or nobody of the tiers between is covering it; then by level, then the oldest.
- **For admins, the queues** (a `<details>` card each, with its level, waiting and in-progress counts):
  - **People**: everyone with a tier there, Active (in a chat in it), Idle (helper time, the queue on, no chat) or Inactive;
  - **In progress**: staff, writer, feature, stage and the last action with the count, never the messages;
  - **Waiting**: writer, feature, tier and how long;
  - for the queue's channel support, **Levels**: steppers for Medium from, High from and Urgent from (each kept between its neighbours), Use the default levels, and Raise the level (a select) for some hours.
  - Channel support also set the **Default levels** at the top.

The sidebar's queue meter counts the chats the staff member is in and those waiting for them, escalated and first-tier.

## Helper > Settings: the schedule

Everyone with helper hours sets their own: helpers on Helper > Settings, admins on Admin > Dashboard > Schedule (the same editor, `support/ShiftEditor.tsx`). The Office's Department and Team tiles show everyone's on their **Schedule** tab (`support/WeekTable.tsx`, read only): a row per person with helper hours, a column per day ("9:00–13:00"), the hours, and a This week / Next week choice. The queue view gives admins everyone's weeks (`weeks`).

- **This week**: the blocks, fixed.
- **Next week**: a row per day with a switch, the start (a stepper by the hour) and the hours (a stepper, 1 to 12, ending by midnight), the total against the allotment, and **Save next week** (`SaveIcon`). A week with no schedule of its own repeats the latest one.
- Without helper hours it says so.

## Roles and the owner

Roles are held per console of the channel list (or per interface), and set in **Office > Team > Assignment**:

- **Checker**: checks in the Inbox (on Helper > Inbox).
- **Voter**: votes on a console's statements.
- **Channel manager**: corrects a console's statements. On Helper > Inbox, it also keeps the verbs.
- **Planner**: accepts or vetoes a console's statements.

There is no login yet, so every Admin and Helper screen acts as the **owner** (universal access): a staff member always on the roster (*Owner*, an admin with 30 helper hours, renameable), who holds **every role on every part of the app** and tier 4 on every console, claims any open plan item and promotes anyone. Assignment shows the owner's row as *Every role*, ticked and not changeable, and the owner cannot be termed. The other staff keep their roles for when they sign in. A control a staff member cannot use is disabled, and its title gives the reason; the server refuses it too, and the refusal shows in an alert.

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
- Don't send feedback for the writer from a chat: draft it, and the writer sends it as theirs.
- Don't show a chat's messages anywhere but in that chat: elsewhere it is listed by its writer, queue, stage and actions only.
- Don't change this week's schedule: coverage is fixed per week; only next week's is set.
