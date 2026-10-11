import type { CatalogBook } from '../../../api/reader'
import type { useReader } from './readerStore'

// What every console is given: the Reader's data and actions, today's date, and ways to open a book or the dialogs.
export interface ReaderCtx {
  data: ReturnType<typeof useReader>
  // Today (UTC) as YYYY-MM-DD: the activity calendar ends on it.
  today: string
  openBook: (bookId: string) => void
  openLibrary: (console?: string) => void
  // The e-reader, at a chapter when one is named.
  openPages: (bookId: string, chapter?: number) => void
  borrow: (book: CatalogBook) => void
  openPlan: () => void
  // The review of a book, on the paper.
  review: (book: CatalogBook) => void
}
