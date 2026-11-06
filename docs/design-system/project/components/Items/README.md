# Items (the library of things that change hands)

The **Items** console keeps the things of the story that pass from hand to hand: a sword, a letter, a ring. It is a tab of the Writer's **Project** level (after Characters, before History), with the bag icon. An item is a name, a kind, a description, notes and a tag colour, plus its **holdings**: who has it from which chapter or scene on. It reuses the Characters console's page, list and panels (`characters.scss`); only what is its own is in `items.scss`.

Code: `writer/items/` (`ItemsConsole.tsx`, `CarriedItems.tsx`, `itemModel.ts`, `itemStore.ts`, `useItems.ts`, `items.scss`). Storage: the project's `items` section (`project.json`), one entry per item; the API is `/api/projects/{id}/items` (`GET ""` the list, `GET /all` every item whole, `POST ""`, `GET/PUT/DELETE /{id}`). The preview runs against the pretend API in `designSystem/mockItems.ts`.

## Anatomy

`.charPage` holds a bar (the title and the **Save cluster**) and `.charSplit`: the **library** (`.charList`, 200px: each item with its name and kind, a delete that asks first, the plus makes a new one) and the open item's sheet (`.charSheet`) with three panels:

- **The item**: its name (saved when the field is left), a **kind** select (weapon, tool, clothing, jewel, document, vehicle, treasure, other), a **tag colour** (the author's own, so it is drawn in its own colour), a description and notes.
- **Who has it** (`.charWide`): a line that says who has the item at the end of the story, and the holdings in book order. A holding is a **holder** (a character, a place such as a vault or a shelf, or nobody known: lost, hidden, not made yet), the **chapter or scene it starts at** (or "From the start") and a note. A holding lasts until the next one, the way a character's states carry forward. A new holding starts at the point after the last one. A holder or a point that is gone from the project reads "A character who is gone" or "A part of the book that is gone" and can be changed.
- **Belongs to**: the generic two-way links (`WorldLinks`), to characters, places, plot nodes and chapters or scenes of the outline. A link is on both ends.

Edits save the way the Writer's do: the Save button, and autosave when the user has turned it on; typing in one field is one undo step.

## Elsewhere

- Under a character's **Story**, **Items they have had** (`CarriedItems`, `.itemCarried`) lists the items that character has held, from which chapter or scene and whether they still have them at the end; each opens the item here.
- The link pickers of characters, places and plot nodes also offer items, and chapters and scenes (`item:<id>`, `scene:<outline node id>` refs).
- Deleting a character leaves the holdings they had with "nobody known"; deleting an item removes its links.

## Rules

- Icon buttons only (with `aria-label` and a `title`); no text under 11px; theme tokens only. The tag colour is the one colour that is the author's data.
- A holding is only data (a holder ref, a point id and a note): who has what at a point is worked out by `itemModel.ts`, never stored.
