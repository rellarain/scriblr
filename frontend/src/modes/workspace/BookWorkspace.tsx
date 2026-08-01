import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { exportBookPdf } from '../../api/export'
import { useOutline, useSaveOutline } from '../../api/outline'
import { usePlot } from '../../api/plot'
import { useProject } from '../../api/projects'
import { sanitizeFilename } from '../../lib/sanitizeFilename'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineTree } from '../../types'
import { renameNode, setBookChapterCountTarget, setBookColor, setBookPlotlineIds } from '../outline/outlineTree'
import { getCategories, getChildren as getPlotChildren } from '../plan/plotTree'
import ScopedOutlineEditor from './ScopedOutlineEditor'

const TITLE_SAVE_DELAY_MS = 500

const BOOK_COLORS = [
  '#c96a6a',
  '#d99a4e',
  '#d9c04e',
  '#7fae6a',
  '#4e9c8f',
  '#4a90d9',
  '#7a6ad9',
  '#a56ad9',
]

// Book-level main content: the book's own settings (title, color, chapter
// goal, which project plotlines are relevant to it) plus a structure editor
// scoped to its arcs/chapters.
function BookWorkspace() {
  const { projectId, bookId } = useParams<{ projectId: string; bookId: string }>()
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
  const [isExporting, setIsExporting] = useState(false)

  const book = outline?.nodes.find((n) => n.id === bookId && n.kind === 'book')

  useEffect(() => {
    setTitleInput(book?.title ?? '')
  }, [book?.id, book?.title])

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
  if (!bookId || !book) return <p className="book-workspace__error">Book not found.</p>

  const projectLevels = project?.index.settings.outlineLevels ?? OUTLINE_KIND_ORDER
  const levels = projectLevels.filter((k) => k === 'arc' || k === 'chapter')
  const categories = getCategories(plot?.nodes ?? [])

  return (
    <div className="book-workspace">
      <div className="book-workspace__settings">
        <div className="book-workspace__title-row">
          <input
            className="book-workspace__title"
            value={titleInput}
            placeholder="Untitled book"
            onChange={(e) => handleTitleChange(e.target.value)}
          />
          <button type="button" onClick={handleExportPdf} disabled={isExporting}>
            {isExporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>

        <label className="book-workspace__field">
          <span>Chapter goal</span>
          <input
            type="number"
            min={0}
            placeholder="Not set"
            value={book.chapterCountTarget ?? ''}
            onChange={(e) => handleSetChapterCountTarget(e.target.value)}
          />
        </label>

        <div className="book-workspace__field">
          <span>Color</span>
          <div className="book-workspace__swatches">
            {BOOK_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`book-workspace__swatch${book.color === color ? ' is-selected' : ''}`}
                style={{ background: color }}
                onClick={() => handleSetColor(color)}
                aria-label={`Set book color to ${color}`}
              />
            ))}
            <button
              type="button"
              className="book-workspace__swatch book-workspace__swatch--none"
              onClick={() => handleSetColor(null)}
              title="No color"
            >
              ×
            </button>
          </div>
        </div>

        {categories.length > 0 && (
          <div className="book-workspace__field book-workspace__plotlines">
            <span>Relevant plotlines</span>
            {categories.map((category) => {
              const plotlines = getPlotChildren(plot?.nodes ?? [], category.id)
              if (plotlines.length === 0) return null
              return (
                <div key={category.id} className="book-workspace__plotline-category">
                  <span className="book-workspace__plotline-category-title">{category.title || 'Untitled'}</span>
                  {plotlines.map((plotline) => (
                    <label key={plotline.id} className="book-workspace__plotline-option">
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
      </div>

      <ScopedOutlineEditor key={bookId} rootId={bookId} levels={levels} accentColor={book.color} />
    </div>
  )
}

export default BookWorkspace
