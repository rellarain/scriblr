# Training: five stacked levels

Training (TUI, at `/train`) is where users learn the app. It replaced the Translator in the page switcher, and it was the User panel's Training console before that. It is **five stacked levels** laid out as the Writer's are ([Level panels](../LevelPanels/README.md)): the deepest level on the path has the focus, and the ones above it stand in a side column.

Code: `assets/Interfaces/TUI.tsx` (the page, `.tUI.wr`), `training/TrainingLevels.tsx` (the levels and the side column), `training/trainingTabs.tsx` (each level's tabs), `training/TrainingPage.tsx` (a tab's body and its lists), `training/trainingPath.ts` (the path and the sizes, pure), `training/useTrainingState.ts` (what is kept), `training/trainingPages.ts` (what each page is), `training/trainingStore.ts` (the courses and progress, from the backend), `training/trainingContent.ts` (lookups, colour, progress), `training/training.scss`; the panels, tabs and side-column handle are the Writer's (`writer/levels/`).

## The levels

| Level | Tabs | Holds |
|---|---|---|
| **Desk** | Courses, Catalog, Settings, Help | **Courses**: the ones enrolled in. **Catalog**: every course, grouped by **curriculum** (a curriculum is a collection of courses), each with an Enrol button. |
| **Course** | Modules, Exams, Projects | One course's content: its modules (and, in them, the lessons), the exams (learning checks for the whole course) and the projects (a system of exercises that produces a working product). |
| **Module** | Lessons, Tests | A collection of specific topics within a course; its tests check the module's content. |
| **Lesson** | Material, Quizzes, Exercises | Focused learning material on one topic; its quizzes check it, to mark it complete; its exercises are repeated practice. |
| **Practice** | (none) | One exercise or one project, worked on. |

The levels shown are the ones **on the open path**: opening a course from the Desk shows Desk and Course; a module adds Module; a lesson adds Lesson; an exercise adds Practice. A **project opened from the Course level goes straight to Practice** (Desk, Course, Practice): it belongs to the course, not to a lesson.

## Sizes

The deepest level is **Max**, the one above it **Mid**, the others **Min** (the Writer's rule, `levelSizes.ts`). A level's chevron toggles it between Min and Mid; the **title** brings the focus back to that level and closes everything below it. At Max a level's tabs are tiles on the split grid; at Mid one tab at a time, in one column; at Min a level is its header and a line of what it is and what is in it. The side column is the Writer's: dragged from its right edge, double-click puts it back.

## Colours

The Desk is the theme's own hue. Every level below it is a **course's colour**: its own hue or its curriculum's (the Writer's `BookScope` re-tints the tokens), with the zone's own saturation and lightness and white text on the fill, so text stays readable for every hue (the audited level pairs in [Contrast](../../contrast.md)). Nothing here is a literal colour: the panel and the rows use `--wr-fill`, `--level-wash*` and `--on-accent`.

## Lists

A list of things to open (`.trList`) is a row each (`.trRow`, a faint wash of the level's ink): an **open button** with the icon, the title (bold) and a second line, and at the right end one **icon button** (18px icon in a 32px box, `aria-label` and `title`): **Enrol in …** and **Leave …** (pressed) on a course. The curriculum in the Catalog is a group (`.trGroup`) with its name in capitals, what it is, and its courses.

## What is kept

On this machine (`scriblr.training.*`): where you are (the open course, module, lesson and exercise or project), the courses enrolled in, and the Min/Mid toggles. A stored path that names something that is gone is cut to what is.

## Data

The courses and one learner's progress come from the backend (`/api/training`; `training.json` and `training-progress.json`), through `training/trainingStore.ts`; the levels are not drawn until they have loaded (a **loading line** `.trStatus`, or the error and a **try again** icon button). A **curriculum is a collection of courses** (a course may be in several, or none: those are listed under **Other courses** in the Catalog); a course has modules, projects and exams, a module has lessons and tests, a lesson has exercises, quizzes and Markdown material; a project names exercises of its course. A course's colour is its own hue, else its first curriculum's.

- **Progress on the Desk**: an enrolled course's row says how far through it is ("2 of 5 lessons complete", or "Complete").
- **Completion buttons**: a lesson, module, exercise, project or course (the first tab's page head, and the Practice page's) has a button that marks it complete, `aria-pressed` when it is (a 32px box, the 18px checkbox icon, `aria-label` "Mark X complete" / "Mark X not complete").
- **Assessments**: Exams, Tests and Quizzes list each with its description, **pass mark** and how the learner did ("Not tried yet", "Best 85.5%, passed"); there is no taking one yet (a result is a score kept through the API, and a pass marks the lesson, module or course it checks complete).
- **Material**: a lesson's Markdown, in the level's ink (`.trMarkdown`).
- A failed change shows its message (`role="alert"`) on the Desk and leaves things as they were.

## Don't

- Don't open a level the path does not reach (a module with no course, a lesson with no module).
- Don't colour a level with a literal: take the level's tokens.
- Don't put training in the User panel again: it is an interface of its own.
