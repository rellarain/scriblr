# WUI version 1: requirements

What the Writer UI must do to be complete for phase 1 (see the [roadmap](../roadmap.md)). Written from the version 1 interview, one round per level of the Writer; each answer becomes a requirement and, where something is missing, a task on the roadmap.

**Interview**: done, all four rounds (2026-11-26). Next: a mockup of the changes, approved before any code; then the build, in the roadmap's order.

## The bar

Everything in the WUI section of the feature inventory ([`scrilbrPlan.md`](../../frontend/src/scrilbrPlan.md)), with the **core writing loop** first (plan, outline, draft, revise, export), and **no placeholders**: every console and tile works end to end, or is moved to a later version here, by name.

## Dash (Shelves console)

| Tile | Today | Version 1 |
|---|---|---|
| Schedule (goals, agenda, backlog, analytics) | built | as built |
| Scratchpad | a plain list of notes | **Convert a note** into an outline node, a plotpoint, draft text or a revision flag, in a project the writer chooses. Built (slice 7): from the note being edited; a revision flag goes on the project or on a chapter (the chapter's own flag); the note stays marked with what it became, or goes |
| Readers | every published book's loans, sales, earnings and rating, all simulated | **Moved to WUI v2** (phase 2, when RUI gives it real readers); left out of v1 |
| Project (the plan, and the template a new project's plan starts from) | built | as built |
| Settings, Help | built | as built |

## Project (Shelf console)

| Tile | Today | Version 1 |
|---|---|---|
| Plot (categories, subcategories, clusters, plotlines, plotpoints; presets; fields a node defines for its children) | built | as built |
| Outline (series, books, arcs, chapters, acts, scenes, moments) | built | as built, plus **book templates** (below) |
| Schedule (goals, routines, checklists) | built; revisions are only chapter snapshots and the Preview's flags | plus **revision passes** (below) |
| Project (the plan) | built | as built |
| Maps | built | **finished in v1, with new tools** (see Maps v1, below) |
| Characters | built; the writers' own designer and the mannequin's step-by-step editor are switched off | **finished in v1**: the writers' own designer (My models, Edit this model, held to the admin's limits) and the mannequin's step-by-step editor come back on. The admin Designer's switched-off tools (weights, skin weights, taper, pose mode, mirror editing, previews, Roll, Lock, Reset) come back in **AUI v1** |
| Items | built | **Moved to WUI v2**; left out of v1 |
| History | a placeholder | **One timeline** of the project by day: its activity, outline and plot snapshots, and chapter revisions, with restore wherever the app already allows it. Built (slice 8): the writing in sittings (a day older than the activity kept, its total), the flags added and resolved, chips by kind, a book choice and a search; a day shows four changes and the rest behind a button, fourteen days then Older days; a revision compares with the chapter now, word by word; Restore puts the outline or the plot back through the workspace (an edit Undo takes back and Save keeps) or a chapter back on the backend, which keeps the chapter as it was first (a chapter open in the Draft saves first and reads it again after) |
| Settings (the project editor; Delete project), Help | built | as built |

**Outline templates** (book templates here, chapter templates on the Outline level): the writer's own only. A template is a saved outline shape: a book's or a chapter's arcs, chapters, acts, scenes and moments, with titles and summaries but no draft; a new book or chapter can start from one. No templates published by admins in v1. Built (slice 6): a book's shape is saved from its card in the project outline, a chapter's from its tools on the book's Outline, keeping the titles and summaries when asked; **From a template** sits beside + Book and + Chapter; the Project level's **Templates** tab lists them to rename and delete. They are the writer's, for every project.

**Revision passes**: a pass is planned in the project's schedule, with **goals of its own** (set per pass), and applies **across all the books and chapters of the project**. Its open revision flags show in the backlog as its tasks. Built (slice 4): a pass has a name, a first day and an optional last day, and the kinds of flag it works through; its goals are to resolve those flags, to cut or add a number of words, or to read every chapter once (a chapter opened in the Preview while the pass runs); its open flags are a group in the Backlog, due on its last day.

**Maps v1**:
- **Shapes only, no pens.** Biomes are the shapes' fill and outline hues.
- **Lock the environment layer** (land, water, biomes) before adding roads, buildings and the rest, so they can't move it by accident.
- **Places change over time.** A location is saved at points on the story's timeline: a new building, a new road, a ruined building, a river's different path. The map shows the place as it is at the chosen point.
- **Routes and travel**: a route between places, and how long it takes to travel.
- **Story links**: places linked to plotlines, plotpoints and moments, on the existing world links (`backend/app/storage/world_links.py`).
- **Generated maps**: a starting map made for the writer to edit.

## Outline (Book console)

| Tile | Today | Version 1 |
|---|---|---|
| Book outline (arcs, chapters, acts, scenes, moments) | built | as built, plus **chapter templates** (the writer's own; see Outline templates) |
| Book details | a title, a synopsis, a cover, a word goal and a target number of chapters | plus **book goals** (below) |
| Publish (to the Reader on this machine) | built | **Moved to WUI v2** (with RUI, phase 2); left out of v1 |
| Settings, Help | built | as built |

**Book goals**: two ways, the writer's choice per book.
- **Goals without dates**: a word count, or an outline to fill (chapters, scenes, moments). The app **estimates** from the writer's own activity how long the rest will take ("6 to 8 months at your usual pace"), and the book's timeline follows those estimates.
- **Deadlines**: dates for the book and its parts. The same estimates show beside them, to plan the project with (whether a date is within reach, and the pace it needs).

Built (slice 5), in Book details (at Mid beside the book's cover, title, synopsis and counts; on the cover at Max): goals for the words, chapters, scenes and moments; the usual pace is the slower and the faster of the writer's last eight weeks of activity; without dates, "About 6 to 8 months at your usual pace" and when that is; with deadlines, a date for the book and for each arc (an arc's share of the word goal is its share of the chapters), each with the pace it needs and whether it is within reach; a timeline of the arcs one after another at that pace, with the dates on it.

## Draft and Preview (Page and Pages consoles)

| Tile | Today | Version 1 |
|---|---|---|
| Chapter (the chapter's acts, scenes and moments) and Plotpoints | built | as built |
| Draft (an input per moment) | built | plus the **Paragraph** and **Sentence** tools (below) |
| Bookmark (the parents' outlines, read-only) | the stacked levels above the Draft show the project and the book | as built; confirm at the mockup |
| Preview (the chapter as a formatted book) | built | as built |
| Reaction (three levels each way, in the margin) | built; kept in this browser only | as built |
| Footnote | built | as built |
| Flag | four kinds: Review, Edit, Add, Delete | **seven kinds** (below) |
| Export | a chapter or a book as PDF, a chapter as JSON | **PDF with full Unicode, EPUB and JSON**, for a project, a book or a chapter. No DOC. Built (slice 2): a project of several books can be a file per book (a zip) or one file |
| Settings, Help | built | plus the style aids' switches |

**Flag kinds**: Review, Add, Remove, Merge, Change, Simplify, Expand. A migration renames existing flags: Edit becomes Change, Delete becomes Remove.

**Paragraph and Sentence tools**, both:
- **Structure**: move a paragraph up or down, or to another moment; split a paragraph and join two. A plotpoint pinned to a paragraph (`assignedParagraphIndex`) follows it. Built (slice 3): another moment can be in another chapter of the book; a placement is pinned from the line under the paragraph; footnotes, reactions and revision flags follow too.
- **Style aids**: long sentences, repeated words and readability, each turned on or off in the Draft's settings.

## Moved to a later version

- **WUI v2**: Dash > Readers; Project > Items; Outline > Publish. They are held back by one switch, `V2_FEATURES` in `frontend/src/features.ts` (code and saved data kept), which also covers what only means something with them:
  - with publishing: a chapter's Publish button and published date, the Preview's published versions, the For readers sections of Characters and Maps, and the Footnote tool's content flags and Published switch;
  - with Items: items in the *Link to…* picker and a character's carried items.
- **AUI v1** (from this interview): the admin Designer's switched-off tools, which finishing Characters needs.
