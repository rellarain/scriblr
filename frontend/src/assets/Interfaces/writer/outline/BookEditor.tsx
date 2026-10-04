import type { ReactNode } from 'react'
import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { nodeLabel } from '../plotTree'
import { formatWords } from '../wordCount'
import BookSettings from './BookSettings'

// The book editor: the strip across the top of the Outline page. It is the level's header: the
// book's title with its chapters and words, and the level's tabs and quick actions at the right.
// While the Settings tab is open the book's settings sit under it, and the Help tab's articles.
export function BookEditor({ w, book, bookWords, tabs, settingsOpen, helpOpen, help }: {
  w: WriterWorkspace
  book: OutlineNode
  bookWords: number
  tabs: ReactNode
  settingsOpen: boolean
  helpOpen: boolean
  help: ReactNode
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
      {settingsOpen && <BookSettings w={w} book={book} bookWords={bookWords} />}
      {helpOpen && <div className="wrBookEdHelp">{help}</div>}
    </section>
  )
}

export default BookEditor
