# Buttons, inputs and alerts

The small controls of the Writer. They sit inside a level (white text on the level's fill) or on the paper (dark ink on the sheet), and follow it.

Code: `writer.scss` (`.wrSmallBtn`, `.wrIconBtn`, `.wrTabBtn`, `.wrSegmented`, `.wrField`, `.wrOutlineInput`, `.wrChip`, `.wrError`), `components/SaveControl.tsx`, `writer/shared.tsx` (`DeleteControl`).

## Buttons

| Control | Class | Look |
|---|---|---|
| Small button | `.wrSmallBtn` | 11px bold, padding 4 / 10, a black wash at 30%; hover takes the accent's light shade |
| Accent button | `.wrSmallBtn--accent` | the accent fill with `on-accent` text |
| On paper | `.wrSmallBtn--light` | a wash a step off the sheet, `paper-ink` |
| Icon button | `.wrIconBtn` | 28 x 28, icon 16 |
| Tab | `.wrTabBtn` | 30 x 30, icon 18; pressed = a darker wash |
| Segmented | `.wrSegmented` + `.wrSegBtn` | two or three options; the selected one expands to show its name |
| Trash | `.wrTrashBtn` | a quiet 24 x 24 icon; on click, the question and *Confirm* / *Cancel* replace it |

Inside a level's body the buttons take `on-accent` text on `level-wash` (the ink at 16%, 28% on hover). A disabled control is 60% opaque.

## Inputs

`.wrField`: a black wash at 25%, 13px, padding 8 / 10, focus = a 1px inset accent. `::placeholder` is `ink-faint`. On a level the Outline's inputs are the **light input** (`level-input`, `level-input-ink`, `level-input-hint` for the placeholder); on paper they are `paper-field` with `paper-ink`, a 1px `paper-line` and a 4px radius. A title input is serif, 13px. A chip (`.wrChip`) is a pill with an optional x.

## Alerts and quiet text

- **Alert** `.wrError` / `.wrPageError`: the **alert colour as the ground**, text and a 1px inset outline in `on-alert`, 12px bold. Never red text on a coloured ground.
- **Muted** `.wrMuted` (12px), **hint** `.wrHint` (10px), **label** `.wrLabel`: the ink at 90%.

## Save control

A joined **restore** and **save** button with one dot: `unsaved` amber, `saving` pulsing, `error` red; the text and the last save time appear only on hover. Restoring asks first.

## Tokens

`accent`, `accent-hover`, `on-accent`, `alert`, `on-alert`, `ink`, `ink-faint`, `paper-field`, `paper-line`, `paper-ink`, `level-wash`.

## Don't

- Don't set a button's colour directly; take the level's.
- Don't use red for an error: the alert hue is the user's.
- Don't put an alert text in a colour other than `on-alert`.
