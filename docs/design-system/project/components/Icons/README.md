# Icons

Every icon the app draws, and the six reaction hearts, in the current zone's text colour. The full list and rules are in [iconography](../../iconography.md); the SVG files are in `assets/Icons`.

Code: `frontend/src/assets/icons/index.tsx` (`IconBase`, `XxxIcon`, `ReactionHeartIcon`).

## Anatomy

A 24 by 24 grid, stroke 1.8, round caps and joins, no fill, `stroke="currentColor"`. `size` defaults to 21; use 14, 16 or 18. The reaction hearts fill their solid levels with the current colour.

## Don't

- Don't colour an icon on its own; it takes its control's text colour.
- Don't draw a new one off the grid or at another stroke.
- Don't use an icon without a label: a button's `aria-label` and `title` name the action.
