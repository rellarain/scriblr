# Characters (the cast builder)

The **Characters** console is where the book's cast is built. It is a tab of the Writer's **Project** level (after Maps, before History), with the people icon. A character is its **profile in words** and its **portrait**: a card (a head and shoulders on a coloured tile) drawn from a handful of choices (ids of the portrait library), numbers (sliders) and colours. No image is stored; the card is drawn from the choices by code, wherever it is shown.

Code: `writer/characters/` (`CharactersConsole.tsx`, `CharacterList.tsx`, `PortraitSection.tsx`, `PortraitCard.tsx`, `PreviewSelect.tsx`, `CharFields.tsx`, `AppearanceSection.tsx`, `ForReadersSection.tsx`, `CastSection.tsx`, `SceneCast.tsx`, `castStore.ts`, `charFile.ts`, `sheet.tsx`, `ProfileSection.tsx`, `RelationshipsSection.tsx`, `StorySection.tsx`, `story.ts`, `describe.ts`, `useCharacters.ts`, `characters.scss`) and the portrait engine in `writer/characters/portrait/` (`Portrait.tsx`, `library.ts`, `rig.ts`, `scene.ts`, `crops.ts`, `registry.ts`, `defaults.ts`, `age.ts`, `diff.ts`, `colour.ts`, `paths.ts`, `draw/{body,head,features,facial,hair}.ts`). Storage: the project's `characters` section (`project.json`), one entry per character; the API is `/api/projects/{id}/characters`.

## Anatomy

`.charPage` holds a bar (the title, the **sections**, the **Save cluster**) and `.charSplit`: the **cast** (`.charList`, 200px) and the open section. A character opens on **Appearance**; the bar's sections (icon buttons with a label and a title, `aria-pressed`, in a toolbar named "What to work on") are **Appearance**, **Portrait**, **Profile**, **Relationships**, **Story**, **The cast** and **For readers**. Below 860px of its own width the parts stack. The console sits on the tab's surface in the ink colour.

- **Cast**: each character by name, with a copy and a delete that asks first. The plus makes a new one with the default portrait.
- **Portrait** (`.charPortrait`): the **stage** (`.charPortraitStage`, 320px) holds the card as it is drawn, big, with the name and a line "role · age" under it (from the Profile: `Navigator · age 29`; empty when neither is written); beside it a panel with **tabs** (`.charTabs`, `role="tablist"`): **Face**, **Features**, **Hair**, **Body**, **Card**. Arrow keys, Home and End move between tabs; the tab you leave stays chosen when another character is opened.
  - **Face**: age (nine stages from infant to elderly), head shape, head width, ears, skin colour, expression.
  - **Features**: eyes (shape, colour, size, spacing, tilt), brows (and their colour, or "Same as the hair"), nose (size, width), mouth (size, and lip colour, or "Natural").
  - **Hair**: **length** (bald, buzzed, short, chin, shoulder, chest, stomach, hip, knee, body, Rapunzel), **texture** (1A to 4C: 1 straight, 2 wavy, 3 curly, 4 coily; A fine, B medium, C coarse), **style** (plain, braids, locs, twists, cornrows, Bantu knots, buns, ponytails, pigtails, cuts), **front** (the part or fringe), **hairline** (nine shapes, and its height), **edges**, hair colour, highlight colour, greying (with age by default) and facial hair with its colour.
  - **Body**: build, chest, top and its colour.
  - **Card**: the tile colour, and the name.
- **Choices from a list** are `PreviewSelect`s (`.charPick`): a button showing the chosen choice drawn on this character, with its name; pressed, it opens a grid of every choice drawn the same way (the eyes as eyes, the nose as a nose, the hair as the whole head), each beside its name. It is a listbox: arrow keys move over the choices (a row at a time in the grid), Home and End go to the first and last, Enter or Space chooses, Escape closes without choosing and gives the focus back, Tab leaves, typing the start of a name goes to it, and a press outside closes it. The pictures are only drawn while it is open.
- **Hair shows only what fits.** Each style has the lengths it suits and the fronts it allows (a mohawk is not knee-length; bangs need more than a buzz cut), so the style and front dropdowns list only those; changing the length puts a style or front that no longer fits back to the first that does (plain first).
- **Colours** are a row of swatches and the browser's picker; a colour that can follow another (brows, lips, facial hair, highlights) has a first swatch that says so. The swatches and the portrait are the author's data, so they are drawn in their own colours. **Sliders** show their value beside them (the tilt of the eyes in degrees).
- Every change is **one undo step**; a slider or a colour moved several times in a row is one step.

## The portrait

A portrait is **flat colour shapes with real adult proportions, no outlines**, front view only, on a **rounded coloured tile** (a different colour per character; the shoulders run off the bottom of the tile). The eyes are halfway down an adult head; the neck is real; the shoulders slope; a child's head is larger and rounder with the eyes lower; an older face has lines, and the hair, brows and beard grey with age unless set by hand.

- **A list of filled paths.** The renderer returns `{d, fill, opacity}` shapes only, in a 200 by 200 tile, never a stroke. They are painted in this order: the tile, the hair behind, the body (neck and shoulders and the top), the ears, the head, the lines of an older forehead, the brows, the eyes, the nose, the beard, the mouth, the moustache, the hair in front. Shading is one darker tone of the same colour on a shape of its own.
- **The crown is a superellipse**, rounder than an egg. The hair is made from the length, the texture (a wavy, ringleted or coiled edge; tighter textures look shorter and fuller), the style, the front, the hairline and the edges. Hair past the chest runs off the tile; the exact length is stored and said in the Appearance words.
- **Stored as choices:** ids as text ("none" is an id), colours as `#rrggbb` (a few may be none), the sliders as numbers in their ranges. An id the app does not know is kept and drawn as the default for that part (an unknown age draws an adult), so a portrait from a newer build still draws.
- **Crops:** the card, the head, the face and one part (ears, eyes, brows, nose, mouth, lower face) are squares of the tile; the dropdowns' pictures, the small heads on a scene and the cast cards use them. Several portraits on a page each have a clip path of their own.
- **The tile's corners are the one rounded shape** in the Writer's otherwise square chrome: they belong to the picture, are drawn in it (radius 16 of 200) and nowhere else.

## Appearance (the words)

A character is described in **words** as well. The **Appearance** section (`AppearanceSection.tsx`, `describe.ts`) is where a character opens: the **name**, a paragraph ("In a paragraph") and a field for each thing a stranger notices: **height, build, skin, hair, eyes, face, voice, bearing and mannerisms, how they dress and distinguishing marks** (kept in the profile as `appearance`, `height`, `build`, `skin`, `hair`, `eyes`, `face`, `voice`, `bearing`, `style`, `marks`; the empty fields show an example as a placeholder). Two icon buttons write a first draft in words from the **portrait** (colours named as an author would: "brown skin", "chest-length curly black hair, in two braids", "green eyes"): **Write the empty fields from the portrait** (only fields the portrait has words for; what is written stays) and **Write every field again from the portrait** (asks first, with a check and a close). The portrait has nothing to say about a height, a voice or marks, so those stay the author's. Every keystroke goes into the character; typing in one field is one undo step and the draft is one step.

- Every field can be shown to readers, one by one, from **For readers** (they are among its public fields, each with its own reveal chapter); the character sheet PNG prints the appearance (the paragraph, or the pieces joined) under "In a sentence"; the cast overview and the comparison show the words under the portrait and say how the written height, build, skin, hair and eyes differ.

## Profile, relationships and story

The last three sections replace the portrait with a sheet (`.charSheet`, a grid of panels) beside the cast list. Every keystroke goes into the character, and typing in one field is one undo step.

- **Profile**: identity (role, age, occupation, other names, a sentence), personality and psychology (personality, what they want, why, what they fear, their flaw and strength), background, **fields of your own** (a label and a text, up to 30) and **possessions** (a name and a line each). The role and the age are the line under the portrait card.
- **Relationships**: typed links to the other characters (family, friend, ally, rival, enemy, romance, mentor, other) with a label and a description; a family link says who the other is (parent, child, spouse, sibling). Each link keeps **changes over the story** (a new label and note from a chapter or scene on), and the list can be read **as it stands at** a point. A character can see who has a link to them. The **web** draws the whole cast in a ring, a line for each link; the kinds differ by the **dash** of the line, not by colour, with a key. The **family tree** of the open character puts parents above, children below, siblings and spouses beside, from the family links of either character.
- **Story**: **states** (what is true of the character from a chapter or scene until the next state: mood, goal, where, what they carry, notes, story time and, if captured, a copy of their portrait, shown as a small head beside the state with "Capture the portrait now / again" and "Forget the portrait"); a state **carries forward**, and "What is true at" looks one up. **How they look, point to point** lists what changed between states that captured the portrait ("Hair style: Plain > Two-strand twists"); a state that only has an older look is ignored. **Arc** (stages, each placed on a chapter or scene or not yet) and a **life timeline** in story time.
- The chapters and scenes come from the project's outline in book order. A relationship is only with another character that is there; deleting a character removes the links to them.

## The cast, files, the sheet and who is in a scene

- **The cast** (the team icon): an **overview** of every character as a portrait card (the name, and the role and age); **Compare** two characters side by side (two portrait cards, the words, and what differs in how they look and in role, age and occupation); and **Show them at another age**: a picture dropdown over the nine ages draws the open character at each, beside the portrait as it is. The age moves, the hair, brows and beard grey for an older one, and a child has no beard. The result is a preview until **Change to this** (one edit to save) or **Make a copy at this age**.
- **Where they appear**: the Story section lists the chapters and scenes the character is tagged on (kept on the character). In the **Outline**, a scene card shows the small heads and names of the characters tagged on it, with a select to tag another and a x to take one off (saved at once with the character); in the **Draft**, the scene's chips show the same, read only (`.charTags`).
- **Files**: each row of the list has a save-to-file button, and the list one for the whole cast, writing `*.scriblr-characters.json` (the portrait goes with each character; a file from before portraits gets the default one and keeps its old look); the import button reads one and asks, for each character the project has under the same id, whether to **keep both**, **replace the one here** or **leave out**. Links to characters that are not in the file are dropped, and the tags on the outline are left out (they belong to the project).
- **The character sheet**: the image button in the bar saves a **PNG** of the open character: the name and role and the profile **in words**, on white paper. It has no picture (the portrait is for the console, the cards and the book).
- **Links**: the Story section ends with "Linked to": the plot nodes and places this character is linked to, and a picker to add one (see Maps, "Links to other things of the story").
- **For readers** (the export icon): the character's publish switch, the chapter it is revealed at, which fields are public and each field's own chapter, spoiler warnings and a preview as a reader. See Maps, "For readers", which describes the pieces both consoles share; the card a reader sees is the portrait tile, the name and the public fields (`.wvCard`; the role and age are among the fields, so they are only shown when public).

## Saving

As everywhere in the Writer: **autosave is off by default**, so an edit waits for the Save button. The whole character goes in one request. A slider moved many times within a moment is one undo step. Opening another character saves what is waiting first. A failed save rings the Save button and keeps the edit. A character made before portraits opens with the default portrait; its old look stays in `project.json` untouched and is not shown.

## Tokens

Surfaces `surface-side`, `surface-raised`, `ov-sink-1`, `ov-sink-2`, `hairline`; text `ink`, `ink-muted`; `accent` for the chosen choice, tab and section; `alert` for a refused save; `hairline` and a shadow for the dropdown's list. Space and type from the scales. No literal colours in the chrome.

## Don't

- Don't put a literal colour in the chrome: only the colours of the character itself (the portrait, its swatches) are data.
- Don't make a button text-only where an icon fits: the sections and the tabs are icons with a label and a title.
- Don't store art: store the choices, and draw them.
- Don't outline the portrait or make it an image: it is flat filled shapes, drawn by code.
- Don't list a hair style or front the length does not allow.
