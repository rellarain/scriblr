# Markup: the editor and the formatted text

Scriblr's own markup is how Resources articles (guides, tutorials, FAQ answers, the Exam/Test/Quiz questions) and Training (lesson material, every description, quiz/test/exam questions) are written, and every reader sees it formatted. It is not Markdown: `#` is the **smallest** heading and `>` makes **lists**.

Code: the parser `lib/markup/` (pure, node-tested: `lines.ts`, `inline.ts`, `blocks.ts`, `parse.ts`, `anchors.ts`, `links.ts`, `picker.ts`, `checks.ts`, `plainText.ts`, `cheatSheet.ts`, `escape.ts`), the components `components/markup/` (`Markup.tsx` with `MarkupInline`, `MarkupEditor.tsx` with the link picker, the checks panel and the cheat sheet, `MarkupPlace.tsx` with the article and Training views, `linkContext.tsx`, `renderInline.tsx`, `CopyPlainText.tsx`, `markup.scss`), and the Resources file's store `channels/resourcesStore.ts` (the admin's Resources builder hands every edit into it). The backend converts text written before the markup once (`storage/markup_convert.py`, `storage/markup_migration.py`); `lib/markup/markerParity.test.ts` keeps the two lists of markers equal.

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

## Links

A link names what it points at by **permanent ids**, so a reader always sees its **current title** (`lib/markup/links.ts`):

| Link | Points at |
|---|---|
| `@writer@draft@3f9c21ab` | a channel node's article (the names joined by `/` are its id: an interface, console, component or feature) |
| `@training@<course>[@<module>[@<lesson>]]` | a Training course, module or lesson; ids are unique, so the deepest one is the item. After `training` a course's id wins over a channel node; `@training` alone, or with a name that is neither, is the Training interface's article |
| `@#Heading-words` | a heading of the same text (its words joined by hyphens, any capitals) |
| `@writer@draft#Heading-words` | a heading of another article (or of a lesson's material) |
| `…[text]` | right after a link: this text instead of the title |

`@` starts a link only at the start of a line or after a space or punctuation (so `name@mail.com` is not one); the link ends at the first character that is not a letter, digit, `_` or `-` (an `@` between names and a `#` before the heading continue it). A link is read as one token, so it may sit inside bold or italic.

- **Reading**: a link reads as its label, else its title. In a **place** (`MarkupPlace`: a Help tile's guides, a lesson's material, an About paragraph) it is a button (`.mkLink`) that **opens its target in place**, over what was there, with a **Back** button (`ChevronLeftIcon`, *Back*): what was there stays mounted (hidden), the focus moves to Back and, on Back, returns to the link. A heading of the same text scrolls there; a heading of another article opens that article at the heading. An article opens as in a Help tile (its title, its guide, tutorials and FAQ, Copy); a course, module or lesson as its title, its description and its material. Outside a place a link is text (`.mkLink--static`, a dotted underline). Inside a row (`MarkupInline`) it is only its title, since the row is a button itself.
- **Not found**: a link that points at nothing keeps its text and gets a **"not found"** mark (`.mkMissing`, the alert colour; the reason in its title). Until the channel list or Training has loaded, a link shows as typed with no mark, and the link checks wait.
- **Copy as plain text** copies a link as its label or its title.

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

They are **practice: nothing is saved** (`components/markup/QuestionView.tsx`: `QuestionView`, the question and its controls, and `PracticeQuestion`). A question (`.mkQuestion`, `role="group"` *Practice question*) shows its prompt and **radio buttons** (multiple choice, a `radiogroup`), **check boxes**, or a **text field** with its placeholder, then a bar of icon buttons: **Hint** (`SparkleIcon`; one hint a press, listed under the options, turned off when none are left), **Check** (`CheckIcon`; turned off until something is chosen or typed) and **Show the answer** (`EyeIcon`; at any time).

- **Revealed** (by Check or Show the answer; it **stays answered**, no Try again): the right options are **highlighted** (`.mkOption--right`, the accent with the on-accent ink and a tick), a wrong choice is **struck** with a cross (`.mkOption--wrong`), the other options are **dimmed** (`.mkOption--dim`, the muted ink, still 4.5:1), **every explanation** shows under its option (`.mkExplanation`), and a text field shows its **accepted answers** (`.mkAccepted`, each in the accent). These are the accent / on-accent and muted-ink pairs the contrast audit already holds; in Training the dimmed options keep the level's ink.
- **Check** also says how it went (`.mkResult`, a status): *Right.*, *Not quite.*, or for check boxes the share earned (*2 of 3.*). Show the answer says nothing.
- **Text answers** (`lib/markup/answers.ts`) match an accepted answer ignoring capitals, extra spaces, punctuation and accents, and allow small typos: none in an answer under 5 characters, 1 for 5 to 9, 2 for 10 or more; two letters swapped count as one.
- **Scores** (`lib/markup/score.ts`, used by the quizzes): multiple choice and text are right or wrong; check boxes earn a share, the right boxes ticked less the wrong ones over how many are right, never below 0.

A pulled-in question shows its reference (`.mkPullin`) until the quiz slice.

## The editor

`MarkupEditor` is a text field with a bar: three **view** buttons (`role="group"`, *View of …*: **Write** `PencilIcon`, **Read-only** `EyeIcon`, **Side by side** `LayoutMidiIcon`, `aria-pressed`; the view is remembered on this computer for every editor, `scriblr.markup.view`), the **checks count** (`.mkCheckCount`, the alert colour, shown only when there are checks) and the **cheat sheet** button (`HelpIcon`, `aria-expanded`). Side by side puts the field and the formatted text in two columns, one above the other under 520px of the editor's own width. The formatted text is drawn from a deferred copy of the text, so typing stays quick. There is no insert toolbar: the text is typed.

- **Link picker** (`.mkPicker`, `role="listbox"` *Link to*, under the field): typing `@` where a link may start lists what the link could point at by title: the text's own headings (`# Heading`), every article of the channel list (*Writer › Draft › Autosave*) and the Training courses, modules and lessons (*Training › Course › Module › Lesson*), each with its id path, filtered by the words typed after `@`. Arrows choose, **Enter** or **Tab** puts the id path in place of what was typed, **Escape** closes. The field says so (`aria-autocomplete="list"`, `aria-expanded`, `aria-activedescendant`). In the Instructor the picker and the titles use the courses being edited.
- **Checks** (`.mkChecks`, a list of buttons, each *Line n* and what is wrong): a marker that is not one (`#######`, `>>>>>`), a hint, option, explanation, text field or answer outside a question, an explanation with no option above it, a question with no right option or accepted answer, a question with no options, a question id used twice, and a **link or heading link that goes nowhere** (*@writer@gone goes nowhere: …*). A click selects that line in the field (switching to Write from Read-only). Pulled-in questions are checked from the quiz slice.
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
