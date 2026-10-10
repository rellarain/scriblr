# Outline cards

The open chapter is outlined as nested, editable cards: a **chapter banner** holding **acts**, acts holding **scenes**, scenes holding **moments**. Each step is one shade deeper than the one it sits in and the last is a light input.

Code: `writer/outline/OutlineCards.tsx`, `SceneFields.tsx`, `useNodeDnd.tsx`, `lib/nodeKeys.ts`; classes `.wrChapterBanner`, `.wrActCard`, `.wrSceneCard`, `.wrMomentCard`, `.wrOutlineCard`, `.wrDropGap`.

## Anatomy

| Card | Ground | Padding | Holds |
|---|---|---|---|
| Chapter banner | frame-1 / `level-fill-2` | 10 / 12, a 5px left stripe in the chapter's colour | number, title (serif 18), a pencil (*Write chapter 1*), counts, its acts, *+ Act* |
| Act | frame-3 | 12 | grip, fold chevron, *Act 1*, a title input, its scenes, *+ Scene*, word count, trash |
| Scene | frame-4 | 10 / 12 | grip, chevron, *Scene 1*, Location / Time / Action chips and fields, its moments, *+ Moment* |
| Moment | frame-5 | 8 / 10 | grip, *Moment 1*, a one-line synopsis preview, the synopsis input, boxed plotpoints, word count |

Every card has a **word count** (the draft's), a quiet trash that asks first, a grip to drag it, and a footer. A scene that repeats the previous scene's place or time shows it faded, as inherited. The count of what a folded card holds shows in its footer.

## States

Dragging: the card is 70% opaque and the gaps it can land in open (10px, accent tint); only the gaps its kind belongs in. A plotpoint being dragged onto a chapter, act, scene or moment outlines the target with a 2px dashed accent. Folded state is remembered.

## Tokens

`level-fill-1..4` on a level, `frame-1..5` on the paper; inputs `paper-field` or the light input; text `level-ink` / `paper-ink`; stripes the node's hue.

## Don't

- Don't let a card be wider than its parent's content: cards nest by padding.
- Don't give a card a radius or a shadow; depth is the step.
- Don't add a fifth level of nesting: moments are the writing unit.
