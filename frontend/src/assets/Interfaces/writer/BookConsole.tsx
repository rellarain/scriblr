import type { OutlineNode } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChapterTabs, NumberInput, Placeholder } from './shared'
import { nodeLabel } from './plotTree'
import TileGrid from '../../../components/tiles/TileGrid'
import ConsoleCorner from '../../../components/tiles/ConsoleCorner'
import { bookLinkTiles } from './tiles/bookTiles'
import { SaveControl } from '../../../components/SaveControl'
import BookOutline from './BookOutline'
import { systemForBook } from './timeSystem'
import { useWordCounts } from './useWordCounts'
import { ColorRange } from '../../../components/ColorRange'
import { relLuminance } from '../../../theme/contrast'
import { bookThemeHue, coverColor } from '../../../theme/bookColors'
import { derivedShades, hslCss } from '../../../theme/palettes'
import { useThemeState } from '../../../theme/useTheme'

// A cover lighter than this gets dark labels instead of light ones.
const LIGHT_COVER = 0.25

// A goal input: the actual count sits above it at the far right of the label,
// and a progress bar along the input's footer fills toward the goal.
function GoalField({ label, current, goal, onChange }: {
  label: string
  current: number
  goal: number | null
  onChange: (value: number | null) => void
}) {
  const percent = goal && goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0
  return (
    <label className="wrCoverField">
      <span className="wrCoverFieldHead">
        <span>{label}</span>
        <span className="wrCoverCurrent" title="Current">{current.toLocaleString('en-US')}</span>
      </span>
      <span className="wrCoverInput">
        <NumberInput value={goal} onChange={onChange} />
        <span
          className="wrProgress" role="progressbar" aria-label={`${label} progress`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} title={`${percent}%`}
        >
          <span className="wrProgressFill" style={{ width: `${percent}%` }} />
        </span>
      </span>
    </label>
  )
}

// The book editor is the book's cover: full height of the console, square
// corners, with the chapter tabs sticking out of its right edge.
function BookCover({ w, book }: { w: WriterWorkspace; book: OutlineNode }) {
  const chapters = w.activeBookChapters
  const counts = useWordCounts(w.activeProjectId)
  // The cover is the book's theme colour: its hue at the active zone's theme
  // saturation and lightness. The accent colour (optional) uses the accent's.
  const { settings, activeZone } = useThemeState()
  const palette = settings.zones[activeZone].palette
  const themeHue = bookThemeHue(book)
  const cover = coverColor(palette, activeZone, themeHue)
  const accentFill = derivedShades(palette, 'accent', activeZone)[0].color
  // The secondary colour is required: a book with none has its primary hue.
  const accentHue = book.accentHue ?? themeHue
  const timeSystems = w.activeProject?.settings.timeSystems ?? []

  return (
    <div className={relLuminance(cover) > LIGHT_COVER ? 'wrCoverWrap wrCoverWrap--light' : 'wrCoverWrap'} style={{ ['--wr-cover' as string]: hslCss(cover) }}>
      <div className="wrCover">
        <div className="wrCoverSave"><SaveControl status={w.saveStatus} onSave={() => { void w.saveNow() }} onRestore={w.restoreSaved} buttonClassName="wrSmallBtn wrSaveBtn" /></div>
        <div className="wrCoverSpine" />
        <div className="wrCoverFrame">
          <div className="wrCoverHead">
            <input
              className="wrCoverTitle" value={book.title} placeholder="Book title" aria-label="Book title"
              onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })}
            />
            <span className="wrCoverRule" />
          </div>

          <div className="wrCoverSummary">
            <label className="wrCoverField">
              <span>Summary</span>
              <textarea
                rows={3} value={book.synopsis} placeholder="What is this book about?"
                onChange={e => w.updateOutlineNode(book.id, { synopsis: e.target.value })}
              />
            </label>
            <div className="wrCoverColors">
              <div className="wrColorRow">
                <span className="wrColorLabel">Primary colour</span>
                <ColorRange
                  label="Primary colour" value={themeHue} sat={cover.s} light={cover.l}
                  onChange={hue => w.updateOutlineNode(book.id, { themeHue: hue })}
                />
              </div>
              <div className="wrColorRow">
                <span className="wrColorLabel">Secondary colour</span>
                <ColorRange
                  label="Secondary colour" value={accentHue} sat={accentFill.s} light={accentFill.l}
                  onChange={hue => w.updateOutlineNode(book.id, { accentHue: hue })}
                />
              </div>
            </div>
          </div>

          <div className="wrCoverRow">
            {timeSystems.length > 1 && (
              <label className="wrCoverField">
                <span className="wrCoverFieldHead"><span>Time system</span></span>
                <select
                  className="wrCoverSelect" value={systemForBook(timeSystems, book).id}
                  onChange={e => w.updateOutlineNode(book.id, { timeSystemId: e.target.value })}
                >
                  {timeSystems.map(sys => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
                </select>
              </label>
            )}
            <GoalField
              label="Chapter target" current={chapters.length} goal={book.chapterCountTarget}
              onChange={n => w.updateOutlineNode(book.id, { chapterCountTarget: n })}
            />
            <GoalField
              label="Word goal" current={counts.books[book.id] ?? 0} goal={book.wordCountGoal}
              onChange={n => w.updateOutlineNode(book.id, { wordCountGoal: n })}
            />
          </div>

          <BookOutline w={w} book={book} chapterWords={counts.chapters} />
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

function BookConsole({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  if (!book) return <Placeholder title="Book" body="Select a book on the shelf to open it." />

  const crumbs = [
    { label: 'Shelves', onClick: w.backToShelves },
    { label: w.activeProject?.title ?? 'Project', onClick: w.showProject },
    { label: nodeLabel(book) },
  ]
  return (
    <TileGrid
      gridId="book" label="Book pages" tiles={bookLinkTiles(w)} crumbs={crumbs}
      below={<><BookCover w={w} book={book} /><ConsoleCorner under /></>}
    />
  )
}

export default BookConsole
