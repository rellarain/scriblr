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
| Characters | built; the writers' own designer and the mannequin's step-by-step editor are switched off | **finished in v1, with a rebuilt character designer** (see The character designer, below): the writers' own designer comes back on (My models, Edit this model, held to the admin's limits) and the mannequin's step-by-step editor works on the new models. A new character starts as a portrait; the writer makes it a mannequin from a published model or one of their copies |
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

## The character designer (interview, 2026-11-27)

Slice 9 is a rebuild of the character designer (the admin's Designer, and the writers' own designer, which is the same console held to limits), before Maps, in sub-slices, each with a mockup first. Today the Designer is a shape editor (since 2026-11-14), its other tools switched off and the old model catalog retired. The trouble with it: it is **hard to learn**, and the **figures look off** (joins, proportions, outlines, bending). Where a tool is already built (the rig, sliders, forms, presets, colour slots, angles, clothes worn under clothes), the sub-slice brings it back into the shape editor and improves it, rather than starting again.

- **Who designs**: admins and writers. A writer works only on **copies of published models** (My models, from Edit this model; never a blank model), and may change everything in a copy (shapes, rig, sliders, forms, colours, clothes) within the limits the admin sets in Configuration › Writers' designer.
- **Starting**: a new model starts from a **body**: a body template on a **proportion guide** (so many heads tall, with lines at the chin, chest, waist and knees) that templates and shapes snap to.
- **Built in 9a**: New model offers six bodies from the approved mockup (average man, average woman, athletic man, heavier man, heavier woman, older woman), each a rig of groups with pivots (pelvis, chest, neck, head, arms and legs), its right side the twin of its left, or a blank canvas. The proportion guide is part of the model (the crown, a head's height, named lines), drawn as the Proportion guide layer and snapped to, and set in the Overview (show, snap, head height, each line's name and height in heads, add and remove). The Body part menu adds a head, a torso, an arm, a hand, a leg, a foot, an eye, an ear, a nose, a mouth or a lock of hair, made to the guide. Idealised, heroic, teen, child, toddler and infant bodies (the 9a mockup's list) wait for 9f, where body sliders stretch a body along the guide.
- **Built in 9b**: the Outline section (Smooth the point, Smooth it all, Simplify to a number of points with how far the outline strays), the Combine section (Merge and Cut out pick the other shape on the canvas, as Maps does; Split lays a line on the canvas the way the taper does) and the Picture to trace (chosen, fitted to the guide, opacity, size, locked, shown, replace, taken away; kept on the server beside the draft, never in the model). A shape whose points are referred to by number elsewhere (symmetric, skin weights, key angles, forms, marks, shapes connected to it) is not simplified or combined, and says why.
- **Built in 9c**: join sets (the Overview's Joins section turns one outline round parts that touch on and off and renames the sets; a shape's Join set section picks its set and its set from behind) and joint caps (a group with a pivot: on or off, and its size). The body templates start with the joins on and caps at the elbows and knees.
- **Built in 9d (posing)**: the shape editor's pivot points pose both sides (a twin's turns are its own); a pivot point is named and stands for a joint of the body, taking its measured limits for the body the model is (men or women; child, adult or elder; hypermobile), listed in the Overview's Joint limits; the Pose section drags the figure into a pose (a hand or foot reaches, an elbow or knee swings the limb; the shoulder or hip holds still, or nothing but the anchor), resets it and keeps poses by name. The body templates come rigged. The mockup's *Leads: Hand / Elbow* chips became posable points at the hands and feet and at the elbows and knees: the point grabbed leads.
- **Built in 9d (smooth bends)**: skin weights follow the pose at the pivot points (painted with the Skin weights tool, back in the shape editor, whose Try the bend turns the pivot point); joint caps follow the pose; the shoulder blade follows the arm (a third of the turn past 30°). The templates' elbows are skinned; their knees keep caps alone, which looked better than skin there.
- **Built in 9e**: the figure from eight angles (the Overview's Angles section, the view bar's front, back and angle), drawing a part at an angle by moving its points there (the Turning section lists its angles), the front-only tools and posing at the front. The body templates are drawn at the sides from the mockup's side view; the ¾ views blend. Still rough: the hands at ¾ (each finger's outline shows), the jaw's underside in profile, and a leg crossed over the other leg (it joins the body's one outline).
- **Outlines per edge** (the user, 2026-11-27: "I want to be able to select what edges of shapes have an outline"): each edge of a shape has the outline or not, so the parts of a body that overlap are outlined along the figure's silhouette only. A body template starts that way.
- **Drawing**: **body-part templates** to place and reshape (a head, a torso, an arm, a hand, an eye, a lock of hair); **smoother curves** (smooth a point or a whole outline, simplify one with too many points); **trace a picture** (a reference image under the canvas, faded and locked); **merge, cut out and split** shapes.
- **Joins**: parts that touch are drawn as **one outline** round the figure, so overlaps show no line, and **joint caps** cover the seam where a limb turns a long way.
- **Proportions**: the guide while drawing, then **sliders** afterwards to vary the figure.
- **Rig and posing**: limbs **bend smoothly** at the joints (skin weights); **drag a hand or a foot** to pose and the arm or leg follows; the figure is drawn from **eight angles** (every 45 degrees); **faces** have expressions (brows, eyes and mouth moving together into named looks).
- **Variation**: **body sliders** (height, build, age, proportions), **forms** (eye shapes, noses, mouths, hairstyles), **colour palettes** (slots with ranges per genre, rolled or chosen) and **clothes in layers** that follow the body as it bends.
- **A starter model**: a new one drawn in the shape editor and published on a fresh install: one adult body that sliders make slim to heavy and more masculine or feminine, an age slider from child to elder, faces (several forms of eyes, noses and mouths, and a handful of expressions), and starter hairstyles and outfits in layers.

**Sub-slices** (mockup first, approved before any code): 9a start from a body (the template and the proportion guide, body-part templates); 9b drawing (smoothing, simplifying, tracing, merge and cut); 9c joins (one outline, joint caps); 9d rig and posing (bones, smooth bends, drag to pose); 9e eight angles; 9f variation (body sliders, forms, palettes, layered clothes); 9g faces; 9h the writers' designer back on (copies only, within limits); 9i the starter model, and the mannequin's step-by-step editor on it.

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
