# Instructor (the Training builder)

The **Instructor** console is where the Training courses are written. It is a console of the Admin panel (the AUI), beside Resources, with the graduation-cap icon; Training (`/train`) shows whatever is saved here.

Code: `admin/instructor/` (`InstructorConsole.tsx`, `InstructorTree.tsx`, `InstructorEditor.tsx`, `useInstructor.ts`, `instructorModel.ts`, `instructor.scss`).

## Anatomy

`.instPage` holds a bar (the title and the **Save cluster**) and `.instSplit`: the **tree** (`.instTree`, 300px) and the **open item** (`.instEditor`). Below 640px of its own width the tree stacks above the editor. The page keeps the Admin's accent.

- **Tree**: a curriculum with its courses under it (a course in two curricula appears under both), then **Other courses** (in none). Under a course: modules (each with lessons, and under a lesson its exercises and quizzes; a module's tests), projects and exams. A row is a **grip**, a fold caret (when something is under it), the kind's icon and the title. The two buttons in the head add a **curriculum** and a **course** (a course joins the curriculum that is selected).
- **Editor**: the kind of the open item in a chip, the buttons that add what it holds (icons with a "+"), **delete**, then the fields: **Title** (1-200 characters, required), **Description**, and by kind:
  - *curriculum*: **colour** (the hue slider; a button takes the colour away), and **its courses** in order (reorder, take out, an Add course select);
  - *course*: **colour** (a course follows its curriculum's unless it is given one: the *inherit* button), and **In curricula** check boxes;
  - *lesson*: the **material** in Markdown, with a Write / Rendered switch (`.instMarkdown`);
  - *quiz, test, exam*: the **pass mark** (a whole number, clamped to 0-100);
  - *project*: its **exercises**, only those of its own course, in order (an Add exercise select lists the rest).
- **Move to** (module, lesson, exercise, quiz, test, project, exam): a select of the places it can go ("Course › Module"). It says what else changes: a project stops naming an exercise that left its course.

## Ordering

Every list orders by the **grip** (drag) or **Alt + Up / Down** on the grip, inside its own list only: an item dropped on another list is ignored (use **Move to**). A curriculum's course list orders the *references*, not the courses.

## Saving

The Save cluster behaves as in the Writer: **autosave is off by default**, so the Save button is the norm, and the toggle is in the cluster. The whole document goes in one request and the answer is handed to Training, so an open Training page shows it at once. A save the server would refuse (a blank title) is **held**: the item shows the reason beside it (`.instFault`, with the red edge) and the Save button says "Cannot save yet". What the server refuses is shown as readable text.

## Deleting

A delete asks first, in place (`.instConfirm`: *Confirm* / *Cancel*), except for an item nothing has been written in. It takes what is inside it, and the **references to it**: a deleted course leaves its curricula, a deleted exercise leaves its projects. Progress is kept by id; the server drops the progress of an id that is gone.

## Ids

Ids are made once (`writer-xxxxxx`) and never shown or edited: they are what progress is kept by, so renaming, reordering and moving keep a learner's progress.

## Tokens

Surfaces `surface-raised`, `ov-sink-1`, `ov-sink-2`, `hairline`; text `ink`, `ink-muted`; `accent` for the open row; `alert` for a fault. Space and type from the scales. No literal colours.

## Don't

- Don't let a title be saved blank: the server refuses it.
- Don't offer an exercise of another course in a project: the server refuses it.
- Don't show ids to the author, or make them editable.
- Don't re-copy the courses from Training while the author is typing: the draft is copied once.
