# Reader: pages, rails and consoles

The Reader (RUI) is for readers with a plan who borrow and own books. It has four pages that open one from the next, as the Writer's levels do: the **Nook** (the reader's own things), the **Library** (the shelves and the catalog), the **Book** (one book and its cover) and **Pages** (the e-reader, a later release). Money and lending are simulated: nothing here leaves the machine.

Code: `assets/Interfaces/RUI.tsx` (the shell and the pages), `reader/ReaderPanel.tsx` (a page's header and consoles), `reader/{NookConsoles,LibraryConsoles,BookConsoles,ReaderDialogs}.tsx`, `reader/consoleStates.ts` (icon, tile, full), `reader/readerRoutes.ts` (the URLs), `reader/activityGrid.ts` (the calendar), `reader/readerStore.ts` (the data), `reader/reader.scss`; backend `storage/{reader_store,library,library_seed,reader_schema}.py` (`/api/reader`, `/api/library`). Classes `.rd*`, in the Writer's scope (`.rUI.wr`), so its shelf and spines draw here too.

## Anatomy

- **Rails** `.rdRail`: each page before the open one stands at the left as a narrow vertical rail (52px: its icon, its name turned upward) in its own colour; a click goes back to it. On a narrow screen the rails lie across the top, 48px tall, with the name beside the icon.
- **Page** `.rdLevel`: a flat fill of the page's colour with white text (the Nook is the theme's hue, the Library 120 degrees on, a Book and Pages the book's own hue), a header with the page's icon and name, its **console bar** and, at the right, the **credits pill** and an icon for each page that opens from this one. There are no crumbs: pages are reached by the rails, the right-hand icons and a book in a console.
- **Console bar** `.rdBar`: an icon button (40 x 40) for each of the page's consoles. A console is **an icon** (minimized), **a tile** (mid-size, simplified) or **the full console**; the icon's wash says which. A click on an icon opens it as a tile (an open one minimizes; a full one steps down); a click on a tile's **title** opens it full and the others shrink to icons; the **chevron** steps a console down (full to tile, tile to icon). What the reader leaves open is remembered for each page, and the full console is in the URL (`/read/library/catalog`).
- **Console** `.rdCon`: a title bar (`level-fill-3`, the console's icon and name, the chevron) over a body one step deeper (`level-fill-1`); inside, cards (`.rdCard`, `level-fill-2`) in grids that stack when the console is narrow. A tile shows the heart of a console; the full console adds the rest.
- **The shelf and its spines** are the Writer's ([Shelf](../Shelf/README.md)): a book's spine is 10px wide at 20,000 words and 2px wider for every 4,000, with one bar, how much the reader has read. The Stack groups owned books loose, **Borrowed** and **Lent out** as series sections; the Shelves console has **Staff picks**, the **Display Case** (a row of recommendations, with their reasons below it when the console is full) and a row of series.
- **Activity calendar** `.rdCal`: a 14px square for every day of 53 weeks, a week to a column, Sunday first, month names above and Mon, Wed and Fri beside it. A day is shaded in four steps of the accent by its share of the busiest day, over the card; a day not here yet is blank. Pages, Minutes and Sessions switch what it counts; a hover says "52 pages on Oct 8". It sits in the Analytics console, open as a tile by default.
- **Book cover** `.rdBook3d`: the book's colour as a front with a darker spine edge and a stack of page edges at the right, with the title, meta line, a read-progress bar, the flag chips (each says its class: hidden, marked, highlight or spoiler), and the ways to read it: Borrow (1 credit), Buy, Wishlist, and the due date or owner state.
- **Dialogs** `.rdModal`: on the paper (`paper`, `paper-ink`, `paper-line`), over a scrim, closed by the x or Escape. The **plan** dialog has the base $6, the extra credits ($2 each, a stepper), the total, where a borrow's money goes (a base borrow: $2 Scriblr, $3 author, $1 the lender or Scriblr; an extra: $0.67, $1.00, $0.33) and the credit ledger. The **borrow** dialog spends 1 to 4 credits (a credit is a month on one book, stacked), says until when, and offers Buy and Wishlist.

## Credits

A plan is $6 a month with one credit; each extra credit is $2 (3 extra is $12 for 4 credits a month). A month's credits are granted at its start and never expire. A credit lends one book for one month, and credits stack on one book. Returning a book unopened, or in under 14 days with less than half read, gives its credits back. An extension costs one credit.

## Tokens

`level-fill-<hue>` (a page and its consoles' steps), `level-ink` (white on a level), `ov-sink-1..3` (chips, bar tracks), `ov-lift-1..3` (washes), `accent` and `zone-on-accent` (the primary button, an open console's icon, a full one, the calendar's days), `paper` / `paper-ink` / `paper-line` / `paper-soft` (dialogs), `alert` and `on-alert` (errors), `scrim`.

## You provide

A page is a `ReaderPanel` with a title, an icon, a colour, its `ConsoleDef`s (`id`, `label`, `Icon`, `render(size)` where size is `tile` or `full`) and its console states (`consoleStates.ts`). A console gets the `ReaderCtx`: the reader's data and actions, today's date and `openBook`, `openLibrary`, `borrow`, `openPlan`.

## Don't

- Don't show a scrollbar anywhere; consoles and the calendar scroll by wheel, touch and keyboard.
- Don't put a console's content at full size in a tile: a tile is simplified, and the rest is one click away.
- Don't hide the credits: the pill is on every page.
- Don't use a colour that is not a token, and keep a button 40px or more.
