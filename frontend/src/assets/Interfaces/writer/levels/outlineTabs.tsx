import { GearIcon, HelpIcon, InfoIcon, ListIcon } from '../../../icons'
import WorkspaceSaveCluster from './WorkspaceSaveCluster'
import type { HistoryScope, WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, chaptersOfBook, descendantsOf } from '../outlineTree'
import BookSettings from '../outline/BookSettings'
import { nodeLabel } from '../plotTree'
import { Placeholder } from '../shared'
import { useWordCounts } from '../useWordCounts'
import HelpArticles from './HelpArticles'
import { useTabbedLevel, type LevelTab } from './LevelTabs'

export const OUTLINE_HELP_NAMES = ['outline', 'book']
export const OUTLINE_HELP_FALLBACK = 'The Outline level is the open book: its arcs and chapters to move around in, the open chapter’s acts, scenes and moments as cards, the book’s draft stats and its own settings. Plotpoints still to place are in the Project’s Plotpoints tab: drag one onto a card.'

const kv = (k: string, v: React.ReactNode) => (
  <div className="wrKv"><span>{k}</span><span>{v}</span></div>
)

// The Outline level's tabs, at Mid: the book's arcs and chapters as navigation rows, and the book's facts.
export function BookOutlineList({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  if (!book) return null
  const index = buildChildIndex(w.outlineNodes)
  const bookChapters = w.activeBookChapters
  return (
    <div className="wrOutlineMid">
      <div className="wrPanelHead">Book outline</div>
      {descendantsOf(index, book.id)
        .filter(n => n.kind === 'arc' || n.kind === 'chapter')
        .map(n => {
          const depth = n.kind === 'chapter' && n.parentId !== book.id ? 1 : 0
          return n.kind === 'arc' ? (
            <div key={n.id} className="wrOutlineRow wrOutlineRow--static" style={{ paddingLeft: 6 }}>
              <span>{nodeLabel(n)}</span><span className="wrOutlineMeta">arc</span>
            </div>
          ) : (
            <button
              key={n.id} type="button" style={{ paddingLeft: 6 + depth * 12 }}
              className={n.id === w.activeChapterId ? 'wrOutlineRow wrOutlineRow--active' : 'wrOutlineRow'}
              onClick={() => w.openChapter(n.id)}
            >
              <span>{bookChapters.findIndex(c => c.id === n.id) + 1} · {nodeLabel(n)}</span>
            </button>
          )
        })}
      {chaptersOfBook(w.outlineNodes, book.id).length === 0 && <div className="wrMuted">No chapters yet.</div>}
    </div>
  )
}

export function BookDetails({ w }: { w: WriterWorkspace }) {
  const book = w.activeBook
  if (!book) return null
  const bookChapters = w.activeBookChapters
  return (
    <div className="wrOutlineMid">
      <div className="wrPanelHead">Book details</div>
      {kv('Title', nodeLabel(book))}
      {kv('Chapters', book.chapterCountTarget ? `${bookChapters.length} of ${book.chapterCountTarget} target` : bookChapters.length)}
      {book.wordCountGoal != null && kv('Word goal', book.wordCountGoal.toLocaleString())}
      {book.synopsis && <div className="wrPanelText">{book.synopsis}</div>}
    </div>
  )
}

function SettingsPane({ w }: { w: WriterWorkspace }) {
  const counts = useWordCounts(w.activeProjectId)
  const book = w.activeBook
  if (!book) return null
  return <BookSettings w={w} book={book} bookWords={counts.books[book.id] ?? 0} compact />
}

// At Max the tabs open and close the parts of the Outline page itself (OutlineMax lays them out),
// so only Mid renders these.
export function outlineTabs(w: WriterWorkspace): LevelTab[] {
  const book = w.activeBook
  return [
    {
      id: 'outline', label: 'Book outline', Icon: ListIcon,
      render: () => <BookOutlineList w={w} />,
    },
    { id: 'details', label: 'Book details', Icon: InfoIcon, render: () => <BookDetails w={w} /> },
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, render: () => <SettingsPane w={w} /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpArticles names={OUTLINE_HELP_NAMES} fallback={OUTLINE_HELP_FALLBACK} /> },
  ]
}

// What each Outline tab edits, for Undo and Redo.
const OUTLINE_SCOPES: Record<string, HistoryScope> = { outline: 'outline', details: 'outline', settings: 'settings' }

export function useOutlineTabs(w: WriterWorkspace, size: 'min' | 'mid' | 'max') {
  return useTabbedLevel({
    storageKey: 'scriblr.writer.outline', tabs: outlineTabs(w), size, customMax: true, flush: w.flushAll,
    defaultOpen: ['outline', 'details'], defaultTab: 'outline',
    save: focused => <WorkspaceSaveCluster w={w} scope={focused ? OUTLINE_SCOPES[focused] : undefined} />,
  })
}

// Mid's body when no book is open.
export const NoBook = () => <Placeholder title="Book" body="Select a book on the shelf to open it." />
