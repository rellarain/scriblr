# Markup: the editor and the formatted text

Scriblr's own markup is how Resources articles (guides, tutorials, FAQ answers, the Exam/Test/Quiz questions) and Training (lesson material, every description, quiz/test/exam questions) are written, and every reader sees it formatted. It is not Markdown: `#` is the **smallest** heading and `>` makes **lists**.

Code: the parser `lib/markup/` (pure, node-tested: `lines.ts`, `inline.ts`, `blocks.ts`, `parse.ts`, `anchors.ts`, `checks.ts`, `plainText.ts`, `cheatSheet.ts`, `escape.ts`), the components `components/markup/` (`Markup.tsx` with `MarkupInline`, `MarkupEditor.tsx` with the checks panel and the cheat sheet, `CopyPlainText.tsx`, `markup.scss`). The backend converts text written before the markup once (`storage/markup_convert.py`, `storage/markup_migration.py`); `lib/markup/markerParity.test.ts` keeps the two lists of markers equal.

## The markers

A marker starts a line (spaces before it are allowed). Headings, lists and the quote need a space after the marker; a line that starts with a backslash is never a marker.

| Marker | Makes |
|---|---|
| `######` | the largest heading: largest size, largest margins, bolder, underlined (`.mkH6`) |
| `#####` | largest size, largest margins, bolder (`.mkH5`) |
| `####` | larger, bold, underlined (`.mkH4`) |
| `###` | larger, bold (`.mkH3`) |
| `##` | bold, underlined (`.mkH2`) |
| `#` | bold (`.mkH1`) |
| `>` | a dot bullet |
| `>>` | numbered 1, 2, 3; it starts again at 1 after a paragraph or heading (a blank line between items does not restart it) |
| `>>>` | an indented ring bullet |
| `>>>>` | an indented number: 1.1, 1.2 under the nearest `>>` above, 2.1 under item 2; under a `>` dot 1, 2, 3 |
| `"` | a quote; lines together are one quote |

Inside a line: `***bold italic***`, `**bold**`, `*italic*`. A run of stars opens when a letter follows it and closes when one comes before it, so `2 * 3 * 4` keeps its stars, and a star with no partner stays as typed. A backslash shows a marker as text (`\*`, `\>`, `\@`, `\?`, `\!`, `\#`, `\"`, `\[`, `\]`, `\\`); any other backslash stays, so `C:\Users` is safe. A blank line starts a paragraph; a single line break stays a line break.

Headings are real headings whose levels follow what holds the text (`baseLevel`, the level of its own title): `######` is one below it, each smaller marker one further down, never past `h6`. Each gets an anchor from its words (`data-anchor`, repeats `-2`, `-3`) for links to headings.

## Knowledge checks

A question is a `????` line and the check lines after it (blank lines are allowed inside it; any other line ends it). Its kind is set by its first option.

| Marker | Is |
|---|---|
| `????` | the question (`????#q7f3a`: a question of a quiz, test or exam, with its permanent id) |
| `???!` | a hint (one per press of Hint) |
| `??!` / `???` | a checkbox that should / should not be ticked |
| `?!!` | explains the checkbox option above it |
| `?!` / `??` | the right / a wrong multiple choice |
| `!!` | explains the multiple-choice option above it |
| `?` | a text field; the rest of the line is its placeholder |
| `!` | an accepted answer of the text field, one per line |
| `?????` | pulls in a question written in a quiz, test or exam (`?????@writer@draft#q7f3a`) |

They are practice: nothing is saved. Until the practice slice they show as their question and options (`.mkQuestion`, the marks `.mkMark--checkbox` and `.mkMark--choice` drawn in the ink), never their answers, hints or explanations; a pulled-in question shows its reference (`.mkPullin`).

## The editor

`MarkupEditor` is a text field with a bar: three **view** buttons (`role="group"`, *View of …*: **Write** `PencilIcon`, **Read-only** `EyeIcon`, **Side by side** `LayoutMidiIcon`, `aria-pressed`; the view is remembered on this computer for every editor, `scriblr.markup.view`), the **checks count** (`.mkCheckCount`, the alert colour, shown only when there are checks) and the **cheat sheet** button (`HelpIcon`, `aria-expanded`). Side by side puts the field and the formatted text in two columns, one above the other under 520px of the editor's own width. The formatted text is drawn from a deferred copy of the text, so typing stays quick. There is no insert toolbar: the text is typed.

- **Checks** (`.mkChecks`, a list of buttons, each *Line n* and what is wrong): a marker that is not one (`#######`, `>>>>>`), a hint, option, explanation, text field or answer outside a question, an explanation with no option above it, a question with no right option or accepted answer, a question with no options, a question id used twice. A click selects that line in the field (switching to Write from Read-only). Links and pulled-in questions are checked from the links slice.
- **Cheat sheet** (`.mkCheat`, a region): every marker with an example to copy and what it makes, in four groups.

## Reading

`Markup` draws the text (`.mk`); it sets no text colour, so it takes the ink of what holds it (a level's ink in Training). `MarkupInline` draws only the first line's words, styled, for a row's second line. **Copy as plain text** (`CopyPlainText`, `CopyIcon`, with a *Copied* status) copies the words with no markers, lists with their bullets and numbers and each question with its options, but never its answers, hints or explanations. It is beside each Help article and above a lesson's material.

## Where it is used

- Admin > Resources: the Article Builder's guide, tutorial steps and FAQ answers, and its preview; the Quiz Builder is the editor of the console's, component's or feature's assessment text.
- The Help tiles: each article formatted under its title (`baseLevel` 4), with Copy.
- Admin > Instructor: the material, every description and the questions of a quiz, test or exam.
- Training: the material (`.trMaterial`), each About paragraph (the full text) and each row's second line (`MarkupInline`).

## Don't

- Don't render Markdown: a `#` there would be read as the smallest heading.
- Don't set a colour on the formatted text: it takes the ink of what holds it.
- Don't add buttons that insert markers: the cheat sheet is the reference.
