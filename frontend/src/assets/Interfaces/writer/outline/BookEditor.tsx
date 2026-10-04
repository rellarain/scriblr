import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { ChevronDownIcon, ChevronRightIcon } from '../../../icons'
import { SaveControl } from '../../../../components/SaveControl'
import { bookThemeHue } from '../../../../theme/bookColors'
import HueSlider from '../HueSlider'
import { useStoredState } from '../storage'
import { nodeLabel } from '../plotTree'
import { systemForBook } from '../timeSystem'
import { formatWords } from '../wordCount'
import GoalField from './GoalField'

// The book editor: a collapsible strip at the top of the Outline page. Collapsed it is
// the book's title with its chapters and words; open it holds the title, summary,
// colour, time system and goals.
export function BookEditor({ w, book, bookWords }: { w: WriterWorkspace; book: OutlineNode; bookWords: number }) {
  const [open, setOpen] = useStoredState<boolean>('scriblr.writer.bookEditorOpen', false)
  const themeHue = bookThemeHue(book)
  const timeSystems = w.activeProject?.settings.timeSystems ?? []
  const chapters = w.activeBookChapters

  return (
    <section className="wrBookEd" aria-label="Book editor">
      <div className="wrBookEdHead">
        <button type="button" className="wrBookEdToggle" aria-expanded={open} onClick={() => setOpen(!open)} title={open ? 'Close the book editor' : 'Edit the book'}>
          {open ? <ChevronDownIcon size={15} /> : <ChevronRightIcon size={15} />}
          <span className="wrBookEdTitle">{nodeLabel(book)}</span>
        </button>
        <span className="wrBookEdMeta">
          {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · {formatWords(bookWords)}
        </span>
        <SaveControl status={w.saveStatus} onSave={() => { void w.saveNow() }} onRestore={w.restoreSaved} buttonClassName="wrSmallBtn wrSaveBtn" />
      </div>
      {open && (
        <div className="wrBookEdBody">
          <label className="wrBookEdField">
            <span className="wrLabel">Title</span>
            <input
              className="wrField" value={book.title} placeholder="Book title" aria-label="Book title"
              onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })}
            />
          </label>
          <label className="wrBookEdField wrBookEdField--wide">
            <span className="wrLabel">Summary</span>
            <textarea
              className="wrField" rows={3} value={book.synopsis} placeholder="What is this book about?"
              onChange={e => w.updateOutlineNode(book.id, { synopsis: e.target.value })}
            />
          </label>
          <div className="wrBookEdField">
            <span className="wrLabel">Colour</span>
            <HueSlider label="Book colour" hue={themeHue} centre={null} onChange={code => w.setNodeHue(book.id, code)} />
          </div>
          {timeSystems.length > 1 && (
            <label className="wrBookEdField">
              <span className="wrLabel">Time system</span>
              <select
                className="wrField" value={systemForBook(timeSystems, book).id}
                onChange={e => w.updateOutlineNode(book.id, { timeSystemId: e.target.value })}
              >
                {timeSystems.map(sys => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
              </select>
            </label>
          )}
          <div className="wrBookEdGoals">
            <GoalField
              label="Chapter target" current={chapters.length} goal={book.chapterCountTarget}
              onChange={n => w.updateOutlineNode(book.id, { chapterCountTarget: n })}
            />
            <GoalField
              label="Word goal" current={bookWords} goal={book.wordCountGoal}
              onChange={n => w.updateOutlineNode(book.id, { wordCountGoal: n })}
            />
          </div>
        </div>
      )}
    </section>
  )
}

export default BookEditor
