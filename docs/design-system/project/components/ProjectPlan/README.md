# Project Plan: plans per part of the app

Admin > Project Plan is where accepted feedback becomes work. Every node of the [channel list](../Channels/README.md) (an interface, console, component or feature) has its own plan. The planner of a console accepts or vetoes the [feedback statements](../Feedback/README.md) about it and keeps its plan of procedures, processes, tasks and routines. Staff then claim the work and move it along.

Code: `admin/plan/` (`PlanPages.tsx`, `plan.scss`); the store `plan/projectPlanStore.ts`, the routes `plan/planApi.ts`, the pure helpers `plan/planLogic.ts` (`childrenOf`, `progressOf`, `myWork`, `boardColumns`, `timeline`, `movedBefore`). Storage: `project-plan.json` in the app's data folder (backend `storage/project_plan.py`, API `api/project_plan.py`).

## What a plan holds

- **Task**: one thing to do. It can sit in a process or a procedure.
- **Process**: a set of tasks, done in order or in any order (the *1·2·3* toggle). It can sit in a procedure.
- **Procedure**: a set of processes and tasks, in order or not. Procedures are kept in order within their node.
- **Routine**: a task that comes back, with the same repeat picker as the writer's schedule.

Each item has a title, a status (To do, Claimed, In progress, Done), a priority (Urgent, High, Normal, Low), an optional start and due date, the staff member it is assigned to, who claimed it, and the statements it answers.

## The four pages

- **Plan**: the channel list as a tree (`role="tree"`). Each node shows two counts: statements still in voting, in the accent colour, and open plan items. Choosing a node shows:
  - its statements as statement cards, the undecided first. Each card has a note field, **Accept** (`CheckIcon`) and **Veto** (`CloseIcon`). Accepting also adds a task that answers the statement. A decided statement can be put back in voting (`RestoreIcon`).
  - its plan, nested: each item's grip (drag, or Alt+Up / Alt+Down, to reorder), kind, title, how many of its tasks are done, delete (`TrashIcon`), status, priority, assignee, dates, claim (`HandIcon`). A container has fold and add buttons for what it may hold.
  - add buttons for a procedure, a process, a task or a routine at the top.
- **My work**: three lists of cards.
  - **Mine**: assigned to me or claimed by me, most urgent first.
  - **To claim**: nobody's, not done.
  - **Done**: what I finished.
  
  Each card shows its kind, part of the app, priority, due date and who has it. Its buttons are Claim, Start (`PlayIcon`), Finish (`CheckIcon`) and Let go.
- **Timeline**: dated items as bars, one row per part of the app, from the earliest date to the latest, with a line for today. A single date makes a one-day bar. A bar's colour gives its status.
- **Board**: four columns, one per status (tasks and routines only). Drag a card into another column, or use its back and on buttons.

## Who may do what

- **Shaping a plan** (adding, editing, moving, deleting and assigning items, deciding statements) needs the Planner role on the node's console, set in Office > Assignment.
- **Moving an item along** is for whoever it is assigned to, whoever claimed it, or a Planner.
- **Claiming**: anyone may claim an item that is unassigned or assigned to them and not claimed by someone else.

A control that cannot be used is disabled, and its title gives the reason. The server refuses it too. The page acts as the owner (universal access: every role, and any open item can be claimed).

## What writers see

Statuses flow back to the writers of the statements a plan answers:

- accepted is **planned**;
- a linked item started (or done, while others are not) is **in progress**;
- every linked item done is **done**;
- vetoed is **declined**, with the note.

## Tokens

- **Surfaces**:
  - `surface-raised` with a `hairline` ring: a process or procedure;
  - `ov-sink-1`: a task, a card, a column, a timeline track;
  - `ov-sink-2`: the chosen tree node, a count;
  - `ov-sink-3`: a bar not yet started.
- **The accent**: statement counts, high priority, a bar in progress, a column taking a drop, the focus ring.
- **Alert**: urgent priority and today's line.
- **The pleasant tone** (`accent2`): a done bar.

## Don't

- Don't plan work about a place in the app by its words: give it the node.
- Don't change a writer's status by hand: it follows the plan.
- Don't give a Planner's controls to everyone: the roles are per console.
