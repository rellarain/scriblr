import type { OutlineNode } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { bookThemeHue } from '../../../../theme/bookColors'
import HueSlider from '../HueSlider'
import { systemForBook } from '../timeSystem'
import GoalField from './GoalField'

// The book's own settings (the Outline level's Settings tab): its title, summary, colour,
// time system and goals.
export function BookSettings({ w, book, bookWords, compact = false }: { w: WriterWorkspace; book: OutlineNode; bookWords: number; compact?: boolean }) {
  const themeHue = bookThemeHue(book)
  const timeSystems = w.activeProject?.settings.timeSystems ?? []
  const chapters = w.activeBookChapters
  return (
    <div className={compact ? 'wrBookEdBody wrBookEdBody--compact' : 'wrBookEdBody'}>
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
  )
}

export default BookSettings
