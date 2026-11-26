# Staff: roster, organisation and SLA

The people who work on Scriblr's feedback, and how they are organised. Helpers and admins are listed in one roster and grouped into departments and teams. The Office gives helpers their hours, and each priority has an SLA: the time plan work has before it goes up to a manager or director. The pages below are the parts of the Admin > Office tiles (see [Office](../Office/README.md): the roster is Department > Roster, the departments and teams are Site > Departments and Department > Teams, helper hours are Team > Allotment and Admin/Helper > Allot hours, hiring is User > Hire, terming Admin/Helper > Term, Monitor Training is Admin/Helper > Training, and Supports is a column of Team > Assignment), and Admin > Configuration > SLA. The card shows them whole.

Code: `admin/office/StaffPages.tsx` (`RosterPage`, `DepartmentsPage`, `AllotmentPage`, `HirePage`, `TrainingPage`, `SlaPage`) and `staff.scss`; the store `staff/rosterStore.ts`, the routes `staff/staffApi.ts`. Storage: `staff.json` in the app's data folder (backend `storage/staff.py`, API `api/staff.py`). On first use the staff are made from the feedback admins, placed in a sample organisation.

## The model

- **People**: a name, helper or admin, active or left, a department and a team, helper hours, the console queues they support (channel support), and the training they finished on interfaces and consoles, with promotions. Hiring someone also adds them to the feedback pipeline, which keeps their roles. Terming someone marks them as left; they are never deleted, so their work keeps their name, and they stop leading any team or department.
- **Departments** have a director. **Teams** sit in a department and have a manager.
- **Support tiers**, per console, worked out rather than set:
  - **tier 1**: a helper promoted on that console;
  - **tier 2**: a helper promoted on its interface;
  - **tier 3**: the console's channel support (they manage its queue);
  - **tier 4**: an admin with helper hours promoted on that console.

  Someone with no tier on a console does not take its chats. The roster shows the highest tier a person has anywhere; someone who left has none.
- **Promotion** follows training: a finished training on an interface or a console is recorded, then a director promotes the person on it (the director of their department, or any director when they have none). Until Learning keeps records per staff member, finishing is recorded by hand on Monitor Training.
- **Helper hours**: 5, 10, 20 or 30 a week, given by the Office.
- **SLA**: hours per priority (urgent 4 h, high 1 day, normal 3 days, low 7 days to begin with).

## The pages

- **Department Roster**: one table per department.
  - **Order**: people by tier, active above those who left, then by name.
  - **Columns**: name, tier, team, helper hours, and how many queues they support.
- **Department Details**: each department's name and director. Under it, its teams, each with name, manager and head count.
  - Add a team or a department.
  - Delete one once it is empty; otherwise the server refuses it with the reason.
- **Allotment**: every active person with the hour chips (None, 5 h, 10 h, 20 h, 30 h), `aria-pressed`.
- **Hire/Term Admin**: a form (name, helper or admin, team) with a Hire button. Below it, everyone, with Term (`CloseIcon`) or Rehire (`RestoreIcon`).
- **Monitor Training**: a card per active person with their training: the part of the app, when it was finished, and who promoted them and when ("Not yet").
  - **Promote** (`ChevronUpIcon`) and **Take back the promotion** (`ChevronDownIcon`), enabled only for their director.
  - **Remove** (`TrashIcon`): not finished after all; it takes back the promotion too.
  - **Training finished on…**: a select of the interfaces and consoles, with a plus to record it.
- **Assignment**: on a console, a **Supports** column makes a person its channel support.
- **Configuration > SLA**: a stepper per priority. It steps by an hour up to a day, then by days; Shift steps a day.

## What the SLA does

Plan work is due within its priority's SLA, counted from when it was assigned. The [Project Plan](../ProjectPlan/README.md) works this out each time it is read; there is no background timer:

- **A person's item** past its SLA goes up to their team's manager. A manager's own item goes to their director.
- **A team's item** nobody claimed goes to the manager, who must do it.
- **A department's item** no manager claimed waits for the director to hand it out.

Cards show the time left or how late the item is ("3 h left", "2 days late, up to Sam Ortiz"). My work lists what came up to you first.

Work can be assigned to a person, a team or a department. Team members claim a team's work; a department's work is claimed by its managers and director.

## Tokens

- **Surfaces**: `surface-raised` with a `hairline` ring for a department; `hairline` rules between table rows.
- **Text**: `ink`, `ink-muted` (people who left, column heads); fields and chips from the feedback styles.
- **Late work**: `alert` mixed into the ground of the SLA note.

## Don't

- Don't delete someone who left: term them.
- Don't set a tier by hand: it follows from training, promotion, channel support and helper hours.
- Don't promote without finished training: the server refuses it.
- Don't time plan work with a timer: the plan works the SLA out when it is read.
