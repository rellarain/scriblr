import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { exportBookPdf } from '../../api/export'
import { useOutline, useSaveOutline } from '../../api/outline'
import { usePlot } from '../../api/plot'
import { useProject } from '../../api/projects'
import { sanitizeFilename } from '../../lib/sanitizeFilename'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineTree } from '../../types'
import DashboardIcon from '../../components/shared/DashboardIcon'
import ExportIcon from '../../components/shared/ExportIcon'
import OutlineIcon from '../../components/shared/OutlineIcon'
import PlotIcon from '../../components/shared/PlotIcon'
import TrashIcon from '../../components/shared/TrashIcon'
import BulletinBoardOverlay from '../dashboard/BulletinBoardOverlay'
import {
  removeNode,
  renameNode,
  setBookChapterCountTarget,
  setBookColor,
  setBookPlotlineIds,
  setBookWordCountGoal,
  subtreeOrder,
} from '../outline/outlineTree'
import { getCategories, getChildren as getPlotChildren } from '../plan/plotTree'
import PlotDrawer from '../plot/PlotDrawer'
import ScopedOutlineEditor from './ScopedOutlineEditor'

const TITLE_SAVE_DELAY_MS = 500
const GOAL_SAVE_DELAY_MS = 500

export const BOOK_COLORS = [
  '#c96a6a',
  '#d97a4e',
  '#d99a4e',
  '#d9b64e',
  '#d9c04e',
  '#b0c94e',
  '#7fae6a',
  '#5eb08a',
  '#4e9c8f',
  '#4e9caa',
  '#4a90d9',
  '#4a72d9',
  '#7a6ad9',
  '#9a6ad9',
  '#a56ad9',
  '#c96ac0',
  '#c96a94',
  '#a0785a',
  '#7a8a99',
  '#8f8f6a',
]

type Overlay = 'plot' | 'dashboard' | null

// The open book: settings (title, color, word-count goal, relevant
// plotlines) plus chapter/arc tab dividers down the right edge -- replacing
// the old always-visible arc/chapter tree editor, which now lives behind a
// "Manage chapters" toggle instead.
function BookFaceWorkspace() {
  const { projectId, bookId } = useParams<{ projectId: string; bookId: string }>()
  const navigate = useNavigate()
  const { data: outline, isLoading } = useOutline(projectId)
  const { data: project } = useProject(projectId)
  const { data: plot } = usePlot(projectId)
  const saveOutline = useSaveOutline(projectId ?? '')

  const outlineRef = useRef(outline)
  useEffect(() => {
    if (outline) outlineRef.current = outline
  }, [outline])

  const [titleInput, setTitleInput] = useState('')
  const titleSaveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const [goalInput, setGoalInput] = useState('')
  const goalSaveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const [isExporting, setIsExporting] = useState(false)
  const [managingChapters, setManagingChapters] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>(null)

  const nodes = outline?.nodes ?? []
  const book = nodes.find((n) => n.id === bookId && n.kind === 'book')

  useEffect(() => {
    setTitleInput(book?.title ?? '')
  }, [book?.id, book?.title])

  useEffect(() => {
    setGoalInput(book?.wordCountGoal != null ? String(book.wordCountGoal) : '')
  }, [book?.id, book?.wordCountGoal])

  function mutateBook(updater: (nodes: OutlineNode[]) => OutlineNode[]) {
    const current = outlineRef.current
    if (!current || !bookId) return
    const nextNodes = updater(current.nodes)
    const tree: OutlineTree = { schemaVersion: current.schemaVersion, nodes: nextNodes }
    saveOutline.mutate(tree)
  }

  function handleTitleChange(value: string) {
    setTitleInput(value)
    if (!bookId) return
    if (titleSaveTimeout.current) clearTimeout(titleSaveTimeout.current)
    titleSaveTimeout.current = setTimeout(() => {
      mutateBook((nodes) => renameNode(nodes, bookId, value))
    }, TITLE_SAVE_DELAY_MS)
  }

  function handleGoalChange(value: string) {
    setGoalInput(value)
    if (!bookId) return
    if (goalSaveTimeout.current) clearTimeout(goalSaveTimeout.current)
    goalSaveTimeout.current = setTimeout(() => {
      const goal = value === '' ? null : Number(value)
      mutateBook((nodes) => setBookWordCountGoal(nodes, bookId, goal))
    }, GOAL_SAVE_DELAY_MS)
  }

  function handleSetColor(color: string | null) {
    if (!bookId) return
    mutateBook((nodes) => setBookColor(nodes, bookId, color))
  }

  function handleSetChapterCountTarget(value: string) {
    if (!bookId) return
    const target = value === '' ? null : Number(value)
    mutateBook((nodes) => setBookChapterCountTarget(nodes, bookId, target))
  }

  function handleTogglePlotline(plotlineId: string) {
    if (!bookId || !book) return
    const has = book.plotlineIds.includes(plotlineId)
    const next = has ? book.plotlineIds.filter((id) => id !== plotlineId) : [...book.plotlineIds, plotlineId]
    mutateBook((nodes) => setBookPlotlineIds(nodes, bookId, next))
  }

  function handleDeleteBook() {
    if (!bookId || !book || !projectId) return
    const ok = confirm(
      `Delete "${book.title || 'Untitled'}" and everything in it (chapters, drafts, revisions)? This cannot be undone.`
    )
    if (!ok) return
    mutateBook((nodes) => removeNode(nodes, bookId))
    navigate(`/project/${projectId}`)
  }

  async function handleExportPdf() {
    if (!projectId || !bookId || !book) return
    setIsExporting(true)
    try {
      await exportBookPdf(projectId, bookId, `${sanitizeFilename(book.title || 'book')}.pdf`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) return <p>Loading book…</p>
  if (!bookId || !book || !projectId) return <p className="book-face__error">Book not found.</p>

  const projectLevels = project?.index.settings.outlineLevels ?? OUTLINE_KIND_ORDER
  const structureLevels = projectLevels.filter((k) => k === 'arc' || k === 'chapter')
  const categories = getCategories(plot?.nodes ?? [])
  const tabRows = subtreeOrder(nodes, bookId).filter((n) => n.kind === 'arc' || n.kind === 'chapter')
  const accentStyle = book.color ? ({ '--book-accent': book.color } as React.CSSProperties) : undefined

  return (
    <div className="book-face">
      <div className="book-face__settings">
        <div className="book-face__title-row">
          <input
            className="book-face__title"
            value={titleInput}
            placeholder="Untitled book"
            onChange={(e) => handleTitleChange(e.target.value)}
          />
          <button type="button" onClick={handleExportPdf} disabled={isExporting}>
            <ExportIcon /> {isExporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>

        <div className="book-face__field-row">
          <label className="book-face__field">
            <span>Word count goal</span>
            <input
              type="number"
              min={0}
              placeholder="Not set"
              value={goalInput}
              onChange={(e) => handleGoalChange(e.target.value)}
            />
          </label>
          <label className="book-face__field">
            <span>Chapter goal</span>
            <input
              type="number"
              min={0}
              placeholder="Not set"
              value={book.chapterCountTarget ?? ''}
              onChange={(e) => handleSetChapterCountTarget(e.target.value)}
            />
          </label>
        </div>

        <div className="book-face__field">
          <span>Color</span>
          <div className="book-face__swatches">
            {BOOK_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`book-face__swatch${book.color === color ? ' is-selected' : ''}`}
                style={{ background: color }}
                onClick={() => handleSetColor(color)}
                aria-label={`Set book color to ${color}`}
              />
            ))}
            <button
              type="button"
              className="book-face__swatch book-face__swatch--none"
              onClick={() => handleSetColor(null)}
              title="No color"
            >
              ×
            </button>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="book-face__field book-face__plotlines">
            <span>Relevant plotlines</span>
            {categories.map((category) => {
              const plotlines = getPlotChildren(plot?.nodes ?? [], category.id)
              if (plotlines.length === 0) return null
              return (
                <div key={category.id} className="book-face__plotline-category">
                  <span className="book-face__plotline-category-title">{category.title || 'Untitled'}</span>
                  {plotlines.map((plotline) => (
                    <label key={plotline.id} className="book-face__plotline-option">
                      <input
                        type="checkbox"
                        checked={book.plotlineIds.includes(plotline.id)}
                        onChange={() => handleTogglePlotline(plotline.id)}
                      />
                      {plotline.title || 'Untitled'}
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        <div className="book-face__toolbar">
          <button
            type="button"
            className={managingChapters ? 'is-active' : ''}
            onClick={() => setManagingChapters((v) => !v)}
          >
            <OutlineIcon /> {managingChapters ? 'Done managing chapters' : 'Manage chapters'}
          </button>
          <button type="button" onClick={() => setOverlay('plot')}>
            <PlotIcon /> Plot
          </button>
          <button type="button" onClick={() => setOverlay('dashboard')}>
            <DashboardIcon /> Dashboard
          </button>
          <button type="button" className="book-face__delete" onClick={handleDeleteBook}>
            <TrashIcon /> Delete book
          </button>
        </div>
      </div>

      <div className="book-face__page" style={accentStyle}>
        <div className="book-face__page-surface">
          {managingChapters ? (
            <ScopedOutlineEditor key={bookId} rootId={bookId} levels={structureLevels} accentColor={book.color} />
          ) : (
            <p className="book-face__page-hint">Select a chapter tab to open the book to that chapter.</p>
          )}
        </div>
        <div className="book-face__tabs">
          {tabRows.map((node) =>
            node.kind === 'arc' ? (
              <span key={node.id} className="book-face__tab-label">
                {node.title || 'Untitled'}
              </span>
            ) : (
              <button
                key={node.id}
                type="button"
                className="book-face__tab"
                onClick={() => navigate(`/project/${projectId}/book/${bookId}/chapter/${node.id}`)}
              >
                {node.title || 'Untitled'}
              </button>
            )
          )}
          {tabRows.length === 0 && <p className="book-face__no-chapters">No chapters yet.</p>}
        </div>
      </div>

      {overlay === 'plot' && <PlotDrawer onClose={() => setOverlay(null)} />}
      {overlay === 'dashboard' && (
        <BulletinBoardOverlay projectId={projectId} nodes={nodes} onClose={() => setOverlay(null)} />
      )}
    </div>
  )
}

export default BookFaceWorkspace
