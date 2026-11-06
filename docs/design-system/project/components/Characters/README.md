# Characters (the cast builder)

The **Characters** console is where the book's cast is built. It is a tab of the Writer's **Project** level (after Maps, before History), with the people icon. A character is only its **look**: a handful of choices (ids of the part library), numbers (sliders), colours, marks and an outfit. No image is stored; the art is drawn from the look by code, in any view.

Code: `writer/characters/` (`CharactersConsole.tsx`, `CharacterList.tsx`, `Drawers.tsx`, `CharFields.tsx`, `useCharacters.ts`, `characters.scss`) and the art engine in `writer/characters/art/` (`CharacterArt.tsx`, `head.tsx`, `body.tsx`, `marks.tsx`, `space.ts`, `library.ts`, `wardrobe.ts`, `defaults.ts`, `colour.ts`). Storage: the project's `characters` section (`project.json`), one entry per character; the API is `/api/projects/{id}/characters`.

## Anatomy

`.charPage` holds a bar (the title, the **ways to see** the character, the **Save cluster**) and `.charSplit`: the **cast** (`.charList`, 200px), the **stage** (`.charStage`: the view chips, the picture, the expression chips) and the **side** (`.charSide`, 300px: the name and the drawers). Below 860px of its own width the parts stack. The console sits on the tab's surface in the ink colour.

- **Ways to see** (icon buttons, `aria-pressed`): **Close-up** (head and shoulders), **Full body**, **Turnaround** (front, three-quarter, side and back side by side, in one fixed frame so heights compare) and **Expressions** (ten heads; choosing one sets the expression).
- **Views**: Front, Three-quarter, Side, Back for the close-up and the full body; in the side and three-quarter views a button turns the figure to face the other way.
- **Cast**: each character by name, with a copy and a delete that asks first. The plus makes a new one with the default look.
- **Drawers** (an accordion, one open at a time, each a heading button with `aria-expanded`): **Body** (build, height, width, shoulders, skin), **Head and ears** (eight head shapes, head width, six ears, ear size), **Eyes and brows** (eight eyes, colour, size, spacing, tilt; eight brows, colour, thickness, tilt), **Nose and mouth** (eight noses, six mouths, sizes, lip colour), **Hair and beard** (twenty hair styles, colour, length, colour streaks; nine kinds of facial hair), **Marks and tattoos**, **Clothes and accessories** (top, bottom, footwear, outerwear, fourteen accessories, a colour for each slot) and **Pose and things held** (eight poses; something in either hand).
- **Options** (`.charOptions`): a grid of buttons, each with a small picture of the part where it helps (`.charThumbBox`: the figure drawn with that choice, cropped to the part), `aria-pressed` on the chosen one. **Sliders** show their value beside them. **Colours** are a row of swatches and the browser's picker; the swatches are the author's data, so they are drawn in their own colours.
- **Marks**: freckles, moles, scars, birthmarks, tattoos, blush, make-up and face paint, each on an area (cheeks, forehead, around the eyes, nose, lips and chin, neck, chest, belly, back, arms and legs), with a design, a place on the area, a size and a colour. A tattoo can be drawn by hand on a square pad (up to twelve lines); a hand drawing replaces the library design until it is cleared. A mark on a part the view does not show is not drawn.

## The art

The figure is a skeleton of joints in 3D (a head is 100 units high): the pose gives the direction of every limb segment, a view turns it about the vertical axis, and the pieces are painted far to near, so one look draws in every view. The head is a little ellipsoid: a feature on the face has a depth, is squeezed as it turns away and is left out when it faces away. Limbs are tapered shapes, the torso a smooth outline whose width follows the turn; clothes are drawn over them. Everything is flat colour with two tones (a shade and a lit part on the left), no outlines. Seen from the side, a piece of hair that lies on the head is the hull of its sampled patch, because its outline alone folds flat. Skin, hair, eye and clothes colours come from the look; the figure never uses the page's colours.

## Saving

As everywhere in the Writer: **autosave is off by default**, so an edit waits for the Save button. The whole character goes in one request. A slider moved many times within a moment is one undo step. Opening another character saves what is waiting first. A failed save rings the Save button and keeps the edit.

## Tokens

Surfaces `surface-side`, `surface-raised`, `ov-sink-1`, `ov-sink-2`, `hairline`; text `ink`, `ink-muted`; `accent` for the chosen option, drawer and view; `alert` for a refused save. Space and type from the scales. No literal colours in the chrome.

## Don't

- Don't put a literal colour in the chrome: only the colours of the character itself are data.
- Don't make a button text-only where an icon fits: the ways to see the character are icons with a label and a title.
- Don't store art: store the look, and draw it.
