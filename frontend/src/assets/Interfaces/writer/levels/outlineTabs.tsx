import { ExportIcon, GearIcon, HelpIcon, InfoIcon, OutlineIcon } from '../../../icons'
import WorkspaceSaveCluster from './WorkspaceSaveCluster'
import type { HistoryScope, WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, chaptersOfBook, descendantsOf } from '../outlineTree'
import BookGoals from '../outline/BookGoals'
import BookPublish from '../outline/BookPublish'
import BookSettings from '../outline/BookSettings'
import { nodeLabel } from '../plotTree'
import { Placeholder } from '../shared'
import { useWordCounts } from '../useWordCounts'
import HelpTile from '../../../../components/help/HelpTile'
import { HELP_TARGETS } from '../../../../channels/helpTargets'
import { useTabbedLevel, type LevelTab } from './LevelTabs'
import { V2_FEATURES } from '../../../../features'

export const OUTLINE_HELP_FALLBACK = 'The Outline level is the open book: its arcs and chapters to move around in, the open chapter’s acts, scenes and moments as cards, the book’s draft stats and its own settings. Plotpoints still to place are in the Project’s Plot tab, in its Plotpoints tile: drag one onto a card.'

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

const counted = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`

// The book's details at Mid: what the book has today (its cover, title and synopsis to edit, and its counts) beside its goals.
export function BookDetails({ w }: { w: WriterWorkspace }) {
  const counts = useWordCounts(w.activeProjectId)
  const book = w.activeBook
  if (!book) return null
  const all = descendantsOf(buildChildIndex(w.outlineNodes), book.id)
  const count = (kind: string) => all.filter(n => n.kind === kind).length
  const words = counts.nodes[book.id] ?? counts.books[book.id] ?? 0
  const number = (w.books ?? []).findIndex(b => b.id === book.id) + 1
  const project = w.activeProject?.title
  return (
    <div className="wrOutlineMid wrBookDetails">
      <div className="wrPanelHead">Book details</div>
      <div className="wrBookDetailsBody">
        <div className="wrBookDetailsFacts">
          <div className="wrBookDetailsCover">
            <span className="wrBookDetailsTitle">{nodeLabel(book)}</span>
            {number > 0 && <span>Book {number}{project ? ` of ${project}` : ''}</span>}
          </div>
          <label className="wrBookEdField">
            <span className="wrLabel">Title</span>
            <input className="wrField" aria-label="Book title" value={book.title} onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })} />
          </label>
          <label className="wrBookEdField">
            <span className="wrLabel">Synopsis</span>
            <textarea className="wrField wrBookDetailsSynopsis" aria-label="Synopsis" rows={4} value={book.synopsis} onChange={e => w.updateOutlineNode(book.id, { synopsis: e.target.value })} />
          </label>
          <span className="wrBookDetailsCounts">
            {counted(count('chapter'), 'chapter')} · {counted(count('scene'), 'scene')} · {counted(count('moment'), 'moment')} · {counted(words, 'word')}
          </span>
        </div>
        <BookGoals w={w} book={book} nodeWords={counts.nodes} />
      </div>
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
      id: 'outline', label: 'Book outline', Icon: OutlineIcon,
      render: () => <BookOutlineList w={w} />,
    },
    { id: 'details', label: 'Book details', Icon: InfoIcon, render: () => <BookDetails w={w} /> },
    // Publishing to readers comes in a later version (features.ts).
    ...(V2_FEATURES ? [{ id: 'publish', label: 'Publish', Icon: ExportIcon, render: () => <BookPublish w={w} /> }] : []),
    { id: 'settings', label: 'Settings', Icon: GearIcon, end: true, render: () => <SettingsPane w={w} /> },
    { id: 'help', label: 'Help', Icon: HelpIcon, render: () => <HelpTile target={HELP_TARGETS.writerBook} fallback={OUTLINE_HELP_FALLBACK} /> },
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
