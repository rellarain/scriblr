# Outline cards

The open chapter is outlined as nested, editable cards: a **chapter card** (one card for the chapter, its header in the book's contents) holding **acts**, acts holding **scenes**, scenes holding **moments**. Each step is one shade deeper than the one it sits in and the last is a light input.

Code: `writer/outline/OutlineNav.tsx` (the arc and chapter cards), `CardHeader.tsx`, `OutlineCards.tsx` (what a chapter holds), `SceneFields.tsx`, `useNodeDnd.tsx`, `lib/nodeKeys.ts`; classes `.wrArcCard`, `.wrChapterCard`, `.wrCardHead`, `.wrNumBadge`, `.wrActCard`, `.wrSceneCard`, `.wrMomentCard`, `.wrOutlineCard`, `.wrDropGap`.

## Anatomy

| Card | Ground | Padding | Holds |
|---|---|---|---|
| Chapter card | frame-1 / `level-fill-2` | 10 / 12, a 7px left stripe in the chapter's colour (lifted brighter, as every card stripe); the open chapter has a 1px ring | **header**: grip, the number badge (underlined in the chapter's colour), the title (serif 18, edited in place), a pencil (*Write chapter 1*) and, in the top right corner, a fold chevron (*Collapse chapter 1*); **counts**: acts, scenes, moments, words; its plotpoints and acts; **footer**: *+ Act*, its colour slider, its trash |
| Arc card | `ov-sink-2` | 10 / 12, a 7px left stripe in the arc's colour | the same header (grip, number badge, title, a fold chevron *Collapse arc 1*), counts (*2 chapters*, words), its chapter cards, a footer: *+ Chapter*, its colour slider, its trash |
| Act | frame-3 | 12 | grip, fold chevron, *Act 1*, a title input, its scenes, *+ Scene*, word count, trash |
| Scene | frame-4 | 10 / 12 | grip, chevron, *Scene 1*, Location / Time / Action chips and fields, its moments, *+ Moment* |
| Moment | frame-5 | 8 / 10 | grip, *Moment 1*, a one-line synopsis preview, the synopsis input, boxed placements of plotpoints, word count |

Every card has a **word count** (the draft's), a quiet trash that asks first, a grip to drag it, and a footer. A scene that repeats the previous scene's place or time shows it faded, as inherited. The count of what a folded card holds shows in its footer. The **chapter card** folds too, from the chevron in its top right corner (a 30 x 30 light icon button beside the pencil): folded, it is left as its header and its counts (the plotpoints placed on the chapter are counted there, as *2 plotpoints*), with its plotpoints, acts and footer (*+ Act*, colour, trash) hidden; adding an act with the keyboard unfolds it. An **arc card** folds its chapters up the same way (*Collapse arc 1*).

**A chapter that is not open** is a compact card: the number badge, the title as plain text (a button, *Open chapter 2*), the counts (with the plotpoints placed on it), the grip, the pencil and a chevron (*Expand chapter 2*). A click anywhere on it, or on its chevron, opens it **as it was left**: a chapter folded earlier stays folded until its chevron is used. Any chapter card takes a plotpoint dragged onto it. (The Outline's edge tabs always narrow the contents to one chapter, one arc or the whole book, so a list with one chapter open among compact ones is not what the Outline level shows today; the Outline contents' own tests cover it.)

## States

Dragging: the card is 70% opaque and the gaps it can land in open (10px, accent tint); only the gaps its kind belongs in. A plotpoint (or one of its placements) being dragged onto a chapter, act, scene or moment outlines the target with a 2px dashed accent. Folded state is remembered, per card, with the acts' and scenes'.

## Tokens

`level-fill-1..4` on a level, `frame-1..5` on the paper; inputs `paper-field` or the light input; text `level-ink` / `paper-ink`; stripes the node's hue.

## Don't

- Don't let a card be wider than its parent's content: cards nest by padding.
- Don't give a card a radius or a shadow; depth is the step.
- Don't add a fifth level of nesting: moments are the writing unit.
