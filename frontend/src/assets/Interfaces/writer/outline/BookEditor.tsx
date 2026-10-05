import type { ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { nodeLabel } from '../plotTree'
import { formatWords } from '../wordCount'

// The book editor: the header on the book's cover (the left pane of the Outline level): the book's
// title with its chapters and words, and the level's tabs and quick actions under them. The panels the
// Settings and Help tabs open are in the cover's one scrolling column (OutlineMax), under this header.
export function BookEditor({ w, book, bookWords, tabs }: {
  w: WriterWorkspace
  book: OutlineNode
  bookWords: number
  tabs: ReactNode
}) {
  const chapters = w.activeBookChapters
  return (
    <section className="wrBookEd" aria-label="Book editor">
      <div className="wrBookEdHead">
        <h2 className="wrBookEdTitle">{nodeLabel(book)}</h2>
        <span className="wrBookEdMeta">
          {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · {formatWords(bookWords)}
        </span>
        {tabs}
      </div>
    </section>
  )
}

export default BookEditor
