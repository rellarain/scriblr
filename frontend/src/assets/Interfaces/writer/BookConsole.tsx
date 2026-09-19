import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { BOOK_COMPONENTS, HELP_COMPONENT, SETTINGS_COMPONENT } from './consoleDefs'
import { ChapterTabs, ConsoleTitleRow, Placeholder } from './shared'
import { PlusIcon } from '../../icons'
import { buildChildIndex, descendantsOf } from './outlineTree'

const COVER_COLORS = ['#5a3a1e', '#4d2a3f', '#22485c', '#2f4a36']
const DEFAULT_COVER = COVER_COLORS[0]

function numberOrNull(value: string): number | null {
  const n = parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// The book editor is the book's cover: full height of the console, square
// corners, with the chapter tabs sticking out of its right edge.
function BookCover({ w, book }: { w: WriterWorkspace; book: OutlineNode }) {
  const index = buildChildIndex(w.outlineNodes)
  const chapters = w.activeBookChapters
  const cover = book.color ?? DEFAULT_COVER

  return (
    <div className="wrCoverWrap" style={{ ['--wr-cover' as string]: cover }}>
      <div className="wrCover">
        <div className="wrCoverSpine" />
        <div className="wrCoverFrame">
          <div className="wrCoverHead">
            <input
              className="wrCoverTitle" value={book.title} placeholder="Book title" aria-label="Book title"
              onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })}
            />
            <span className="wrCoverRule" />
          </div>

          <label className="wrCoverField">
            <span>Summary</span>
            <textarea
              rows={3} value={book.synopsis} placeholder="What is this book about?"
              onChange={e => w.updateOutlineNode(book.id, { synopsis: e.target.value })}
            />
          </label>

          <div className="wrCoverRow">
            <label className="wrCoverField">
              <span>Chapter target</span>
              <input
                type="number" min={0} value={book.chapterCountTarget ?? ''}
                onChange={e => w.updateOutlineNode(book.id, { chapterCountTarget: numberOrNull(e.target.value) })}
              />
            </label>
            <label className="wrCoverField">
              <span>Word goal</span>
              <input
                type="number" min={0} value={book.wordCountGoal ?? ''}
                onChange={e => w.updateOutlineNode(book.id, { wordCountGoal: numberOrNull(e.target.value) })}
              />
            </label>
            <div className="wrCoverField">
              <span>Cover design</span>
              <div className="wrSwatches">
                {COVER_COLORS.map(c => (
                  <button
                    key={c} type="button" aria-label={`Cover color ${c}`} aria-pressed={c === cover}
                    className={c === cover ? 'wrSwatch wrSwatch--active' : 'wrSwatch'}
                    style={{ backgroundColor: c }}
                    onClick={() => w.updateOutlineNode(book.id, { color: c })}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="wrCoverChapters">
            <div className="wrCoverChaptersHead">
              <span>Chapters</span>
              <button type="button" className="wrSmallBtn" onClick={() => w.addOutlineNode(book.id, 'chapter')}>
                <PlusIcon size={13} /> Chapter
              </button>
            </div>
            {chapters.length === 0 && <p className="wrCoverMuted">No chapters yet. Add one to begin.</p>}
            <div className="wrChapterGrid">
              {chapters.map((c, i) => {
                const inside = descendantsOf(index, c.id)
                return (
                  <div key={c.id} className="wrChapterCard">
                    <div className="wrChapterCardTop">
                      <span className="wrChapterNumber">{i + 1}</span>
                      <input
                        className="wrChapterCardTitle" value={c.title} aria-label={`Chapter ${i + 1} title`}
                        onChange={e => w.updateOutlineNode(c.id, { title: e.target.value })}
                      />
                    </div>
                    <div className="wrChapterCardMeta">
                      {inside.filter(n => n.kind === 'scene').length} scenes · {inside.filter(n => n.kind === 'moment').length} moments
                    </div>
                    <div className="wrChapterCardActions">
                      <button type="button" className="wrSmallBtn" onClick={() => w.openChapter(c.id, 'outline')}>Outline</button>
                      <button type="button" className="wrSmallBtn" onClick={() => w.openChapter(c.id, 'draft')}>Write</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <ChapterTabs
        variant="cover" chapters={chapters} activeId={w.activeChapterId}
        onSelect={id => w.openChapter(id)}
        onAdd={() => w.addOutlineNode(book.id, 'chapter')}
      />
    </div>
  )
}

function BookConsole({ w, component }: { w: WriterWorkspace; component: string }) {
  const book = w.activeBook
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  const def = [...BOOK_COMPONENTS, SETTINGS_COMPONENT, HELP_COMPONENT].find(c => c.key === component)

  if (component === 'bookEditor') {
    return <BookCover w={w} book={book} />
  }

  return (
    <>
      <ConsoleTitleRow console="Book" component={def?.label ?? ''} />
      <Placeholder title={def?.label ?? ''} body={def?.body} />
    </>
  )
}

export default BookConsole
