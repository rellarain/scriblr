# Reader: pages, rails and consoles

The Reader (RUI) is for readers with a plan who borrow and own books. It has four pages that open one from the next, as the Writer's levels do: the **Nook** (the reader's own things), the **Library** (the shelves and the catalog), the **Book** (one book and its cover) and **Pages** (the e-reader). Money and lending are simulated: nothing here leaves the machine.

Code: `assets/Interfaces/RUI.tsx` (the shell and the pages), `reader/ReaderPanel.tsx` (a page's header and consoles), `reader/{NookConsoles,LibraryConsoles,BookConsoles,BookSocial,BookMatter,ReaderDialogs,ReviewDialog,ReadingPage,PagesConsoles}.tsx`, `reader/{PagesSession,pagesLogic}.ts` (the reading session and its pure logic), `assets/Interfaces/FlagSettings.tsx` (the user-level flag classes, in UUI Account > Flags), `reader/consoleStates.ts` (icon, tile, full), `reader/readerRoutes.ts` (the URLs), `reader/activityGrid.ts` (the calendar), `reader/readerStore.ts` (the data), `reader/readerSocial.ts` (levels, reviews, what is hidden), `reader/reader.scss`; backend `storage/{reader_store,reader_social,reader_reading,reading_text,social_views,social_seed,library,library_seed,reader_schema}.py` (`/api/reader`, `/api/library`). Classes `.rd*`, in the Writer's scope (`.rUI.wr`), so its shelf and spines draw here too.

## Anatomy

- **Rails** `.rdRail`: each page before the open one stands at the left as a narrow vertical rail (52px: its icon, its name turned upward) in its own colour; a click goes back to it. On a narrow screen the rails lie across the top, 48px tall, with the name beside the icon.
- **Page** `.rdLevel`: a flat fill of the page's colour with white text (the Nook is the theme's hue, the Library 120 degrees on, a Book and Pages the book's own hue), a header with the page's icon and name, its **console bar** and, at the right, the **credits pill** and an icon for each page that opens from this one. There are no crumbs: pages are reached by the rails, the right-hand icons and a book in a console.
- **Console bar** `.rdBar`: an icon button (40 x 40) for each of the page's consoles. A console is **an icon** (minimized), **a tile** (mid-size, simplified) or **the full console**; the icon's wash says which. A click on an icon opens it as a tile (an open one minimizes; a full one steps down); a click on a tile's **title** opens it full and the others shrink to icons; the **chevron** steps a console down (full to tile, tile to icon). What the reader leaves open is remembered for each page, and the full console is in the URL (`/read/library/catalog`).
- **Console** `.rdCon`: a title bar (`level-fill-3`, the console's icon and name, the chevron) over a body one step deeper (`level-fill-1`); inside, cards (`.rdCard`, `level-fill-2`) in grids that stack when the console is narrow. A tile shows the heart of a console; the full console adds the rest.
- **The shelf and its spines** are the Writer's ([Shelf](../Shelf/README.md)): a book's spine is 10px wide at 20,000 words and 2px wider for every 4,000, with one bar, how much the reader has read. The Stack groups owned books loose, **Borrowed** and **Lent out** as series sections; the Shelves console has **Staff picks**, the **Display Case** (a row of recommendations, with their reasons below it when the console is full) and a row of series.
- **Activity calendar** `.rdCal`: a 14px square for every day of 53 weeks, a week to a column, Sunday first, month names above and Mon, Wed and Fri beside it. A day is shaded in four steps of the accent by its share of the busiest day, over the card; a day not here yet is blank. Pages, Minutes and Sessions switch what it counts; a hover says "52 pages on Oct 8". It sits in the Analytics console, open as a tile by default.
- **Book cover** `.rdBook3d`: the book's colour as a front with a darker spine edge and a stack of page edges at the right, with the title, meta line, a read-progress bar, the flag chips (each says its class: hidden, marked, highlight or spoiler), and the ways to read it: Borrow (1 credit), Buy, Wishlist, and the due date or owner state.
- **Dialogs** `.rdModal`: on the paper (`paper`, `paper-ink`, `paper-line`), over a scrim, closed by the x or Escape. The **plan** dialog has the base $6, the extra credits ($2 each, a stepper), the total, where a borrow's money goes (a base borrow: $2 Scriblr, $3 author, $1 the lender or Scriblr; an extra: $0.67, $1.00, $0.33) and the credit ledger. The **borrow** dialog spends 1 to 4 credits (a credit is a month on one book, stacked), says until when, and offers Buy and Wishlist.

## The Book page

A book is read at a **level**, set by the author's invitation: **alpha** (the plan, read-only), **delta** (work-in-progress drafts), **beta** (final-draft chapters as they publish) and **omega** (the final edition). Alpha and delta are free; beta and omega are borrowed or bought. A badge (`.rdBadge`, "Reading as Delta", in the accent) says which, under the page's header, and the full Bookcover has a **Preview as** switcher so every state can be tried without an invitation.

- **Consoles**: Bookcover (the cover with its spine edge and page edges, the flags with their classes, the ways to read it, and for an alpha reader nothing to borrow), **Bookface** (the book's readers, statistics, clubs and their threads, and the author to follow), **Bookcard** (the average and each criterion's average, the reviews with Top, Newest and Hide spoilers, the reader's own review and notes), **Frontmatter** (the author's note, the flags and their classes, the contents), **Backmatter** (glossary, bibliography, index, appendix). An alpha reader also has the read-only **Outline**, **Plot**, **Plan** and **Revisions**.
- **Edge tabs** `.rdEdge`: a tab for each chapter down the page's right edge, as in the Writer's book; the chapter the reader has reached is wider and in the accent. A click opens the e-reader at it.
- **Reviews** (`.rdTabs` in a dialog): a general score (1 to 10, the reader's own), criteria the reader defines and reuses, a spoiler-free comment, an optional spoiler essay (shown to others only on a tap) and the notes to include. A draft saves itself and stays private until it is posted; a posted review is public and editable ("edited"). A **re-read** adds a folder tab (First read, Re-read 2) with its own score, criteria, comment and essay, and resets the book's progress; the public view shows the latest read with how many times the book was read.
- **Clubs and follows**: a club is a thread on a book, with a schedule and members; a reader can join, leave, start one, post, reply and mark a post as a spoiler (shut until it is tapped). Following a reader or an author puts what they do in the Nook's Feed. Posts and replies stay on this machine; the seeded readers do not answer.
- **Hide, report, block**: a review or post can be hidden or reported (spoiler, abuse, spam) and a reader blocked; the item is out of sight until the reader undoes it in the Feed's Hidden and blocked card. Nothing is sent anywhere.
- **Flag classes** are the reader's, for every book, and are set in the User panel (Account > Flags), not here; the Book page shows them.

## Pages: the e-reader

`/read/book/<id>/pages/<chapter>` opens a book's text. Six consoles: **Flags**, **Reactions**, **Body** (the page, always the full row), **Footnotes**, **Annotations** and **Settings**. A tile of a console opens above or below the page; Body is a tile by default.

- **The page** `.rdReader`: one column of text on a Day or Night page (the Writer's page tokens, `page-day` and `page-night`), titled with the book, chapter and level. The **reaction tracks** are three 20px columns at its left (pleasant, unpleasant, my flags; the strength is the fill, in three steps) and the **crease** runs down between them and the copy. The author's **footnotes** and the reader's **notes** stand in the **right margin of the page**, as cards with a coloured stripe and a trail (Footnote › Chapter 3 › paragraph 2, sentence 2). The page's edges are stacked at its outermost right, and the chapter **edge tabs** of the level lie beyond them: a tab for every chapter, the open one raised, the ones closed at the reader's level dimmed.
- **Turning**: pages are whole paragraphs, cut by the text size and the margins; Previous and Next (or the arrow keys) turn, and the end of a chapter goes on to the next open one. **Scroll** shows the chapter whole. Where the reader stops is saved as they turn (the chapter, the paragraph and the device), so another device resumes there, and the pages and minutes feed the Nook's calendar.
- **A sentence** is selected by a click; a bar offers **Pleasant** and **Unpleasant** (each click raises the level, three levels, then off), a **flag** (an author's flag of the chapter or one of the reader's own), **Highlight**, **Bookmark** and a **note**. Marks are saved with the account. Other readers' totals (anonymous, seeded) are in Reactions; the reader's own count in them only when they choose to share.
- **Flags in the text** show by the class the reader gave them in the User panel: **hidden** replaces the sentence with a one-line placeholder (tap to reveal), **marked** puts a flag icon on it, **highlight** shows the flag's details beside it, **spoiler** adds a description that stays shut until tapped.
- **Settings**: font (serif, sans, easy-read), size, line spacing, margins, turn or scroll, Day or Night, high contrast (no quiet text, strong lines), reading focus (the controls fade while reading), read aloud (the system's voice, at a chosen speed) and the saved position. Annotations exports the book's highlights and notes as Markdown.
- **What can be read** depends on the level: omega the whole final edition, beta the final-draft chapters published so far, delta the draft chapters in progress (with a draft note), alpha the author's current draft with the plan in the margin. Alpha and delta are free; beta and omega need a loan or a purchase, and an author reads their own book freely.

## Credits

A plan is $6 a month with one credit; each extra credit is $2 (3 extra is $12 for 4 credits a month). A month's credits are granted at its start and never expire. A credit lends one book for one month, and credits stack on one book. Returning a book unopened, or in under 14 days with less than half read, gives its credits back. An extension costs one credit.

## Tokens

`level-fill-<hue>` (a page and its consoles' steps), `level-ink` (white on a level), `ov-sink-1..3` (chips, bar tracks), `ov-lift-1..3` (washes), `accent` and `zone-on-accent` (the primary button, an open console's icon, a full one, the calendar's days), `paper` / `paper-ink` / `paper-line` / `paper-soft` (dialogs), `alert` and `on-alert` (errors, and the unread count on the bell), `scrim`.

## You provide

A page is a `ReaderPanel` with a title, an icon, a colour, its `ConsoleDef`s (`id`, `label`, `Icon`, `render(size)` where size is `tile` or `full`) and its console states (`consoleStates.ts`). A console gets the `ReaderCtx`: the reader's data and actions, today's date and `openBook`, `openLibrary`, `borrow`, `openPlan`.

## Don't

- Don't show a scrollbar anywhere; consoles and the calendar scroll by wheel, touch and keyboard.
- Don't put a console's content at full size in a tile: a tile is simplified, and the rest is one click away.
- Don't hide the credits: the pill is on every page.
- Don't set a flag's class on the Book page or in Pages: it is a user-level choice (UUI Account > Flags).
- Don't put the footnotes or notes outside the page, or the tabs and page edges anywhere but its outermost right.
- Don't split the page into two columns: one column of text, the tracks and crease at its left.
- Don't show a spoiler, a spoiler essay or a spoiler post open: they stay shut until tapped.
- Don't use a colour that is not a token, and keep a button 40px or more.
