# Interaction patterns

How the Writer responds. The rule behind all of it: **everything you can do with the pointer you can do with the keyboard**, and a state is shown in the control, not announced.

## Levels and their sizes

Four stacked levels, each Min, Mid or Max (`levels/levelSizes.ts`). Exactly one has the focus (Max); the level above it is Mid, the ones further up Min; the ones below are not shown. At Dash focus the project shelves sit beside it. Opening something moves the focus down a level (a project, a book, a chapter); a level's **title** brings the focus back to it; a Min level's header strip opens it to Mid; the chevron toggles Min and Mid.

## Tabs

A level's header carries its **tabs**: 30 x 30 icon buttons, ending with Settings and Help, then the quick actions (Search, a context-aware New, Save).

- At **Mid** one tab shows at a time, in one column, and the current tab is remembered.
- At **Max** each tab is the minimised form of a tile: pressing it opens or closes that tile (`aria-pressed`), and the open tiles sit on a split grid.
- **New** adds what the current tab holds (a routine, a task, a note, a chapter) and puts the cursor in it. **Search** filters the current tab only, and appears only on tabs that can be searched.

## Moving and resizing tiles

Tiles on a split grid (`SplitArea`) are moved by their **title bar**, not their body, so what is typed in a tile is never dragged.

| Gesture | Result |
|---|---|
| drag a title bar onto another tile's middle | the two swap places, each area keeping its size |
| drop on a tile's edge (the outer quarter) | a new column or row splits off beside or below it; the edge shows a bar where it will go |
| drop on a divider | the tile is wedged in as a new side there |
| drag a divider | the two tiles it separates resize; nothing else moves |
| arrow keys on a focused divider (Shift: bigger steps) | the same, by 2% (8%) |
| arrow keys on a focused title bar | focus moves to the neighbouring tile |
| Alt + arrow on a title bar | the tile swaps with its neighbour, and keeps the focus |

While a tile is dragged it is half opaque; a tile it could land on gets a 2px accent outline, a divider it could wedge into thickens to 4px.

## The book: contents and tabs

At Outline the **contents** list the arcs and chapters. The **edge tabs** at the right of the cover narrow it:

- a **chapter tab** shows only that chapter's outline (its acts, scenes and moments);
- an **arc tab** shows that arc and each of its chapters' outlines;
- choosing the **focused tab again** goes back to the whole book, every chapter open;
- the **+ tab** adds a chapter and focuses it.

The focused tab is raised, wider, and takes its colour as its background. A book opens on its first chapter.

## Editing a list of nodes

Every editor that lists nodes (scratchpad notes, arcs and chapters, acts, scenes, moments, plot nodes) shares one set of keys (`lib/nodeKeys.ts`):

| Key | In a field with text | In an empty node |
|---|---|---|
| Enter | a new sibling after this node | delete it, focus its parent |
| Shift + Enter | a new child, one level down (a new line in a multi-line field) | delete it, focus its parent |
| Ctrl + Enter | a new sibling of the parent | delete it, then a new sibling of its parent |
| Backspace | (as usual) | delete it, focus the previous sibling |
| Delete | (as usual) | delete it, focus the next sibling |
| Tab, Shift + Tab | next or previous field, else the next or previous sibling | the same |

Draft text is for writing: Enter and Shift + Enter are plain paragraphs there; only Tab is handled.

Cards are reordered and moved by dragging their **grip**; the gaps a card could land in open as it is dragged (`wrDropGap--open`), and only the gaps its kind belongs in. A plotpoint dragged from the Plotpoints tab lands on a chapter, act, scene or moment and is boxed inside it; its x sends it back. Deleting asks first: the quiet trash icon is replaced in place by the question ("Delete Chapter 1 and everything in it?") with Confirm and Cancel.

## Saving

Autosave runs after a pause (30 seconds to 10 minutes, a user setting). The **save control** is one joined button: restore and save, with a dot (`unsaved` amber, `saving` pulsing, `error` red). The state text and the time of the last save appear only on hover. A failed save also shows as an alert message in its level, in the alert colour ("Save failed").

## Reactions

Click a sentence in the preview, then click the bar in the left margin: each click raises the reaction one level; a fourth click clears it. Likes and dislikes are separate bars.

## Focus and hover

- Focus is a 2px outline in the accent's light shade, inside the control, on every button, tab, title bar and divider.
- Hover brightens (a spine by 15%) or washes (a header button by white at 16%); it never moves anything.
- Pressed is `aria-pressed`, and looks like the pressed-in wash of the same control.
- Motion stops under `prefers-reduced-motion`.
