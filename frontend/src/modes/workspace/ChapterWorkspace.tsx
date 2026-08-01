import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { exportChapterPdf } from '../../api/export'
import { useOutline } from '../../api/outline'
import { usePlot } from '../../api/plot'
import { useProject } from '../../api/projects'
import { sanitizeFilename } from '../../lib/sanitizeFilename'
import { OUTLINE_KIND_ORDER } from '../../types'
import ScopedOutlineEditor from './ScopedOutlineEditor'
import MomentWorkspace from './MomentWorkspace'
import ChapterPlotpoints from '../draft/ChapterPlotpoints'
import { ancestorOfKind } from '../outline/outlineTree'

// Chapter-level main content: an act/scene/moment structure editor scoped to
// this chapter, its assigned plotpoints for reference, and -- once a moment
// is selected within the tree -- the moment workspace (draft/read/history).
function ChapterWorkspace() {
  const { projectId, bookId, chapterId, momentId } = useParams<{
    projectId: string
    bookId: string
    chapterId: string
    momentId?: string
  }>()
  const navigate = useNavigate()
  const { data: outline, isLoading } = useOutline(projectId)
  const { data: project } = useProject(projectId)
  const { data: plot } = usePlot(projectId)
  const [isExporting, setIsExporting] = useState(false)

  if (isLoading) return <p>Loading chapter…</p>
  if (!projectId || !chapterId || !outline) return null

  const nodes = outline.nodes
  const chapter = nodes.find((n) => n.id === chapterId && n.kind === 'chapter')
  if (!chapter) return <p className="chapter-workspace__error">Chapter not found.</p>

  const book = ancestorOfKind(nodes, chapterId, 'book')
  const projectLevels = project?.index.settings.outlineLevels ?? OUTLINE_KIND_ORDER
  const levels = projectLevels.filter((k) => k === 'act' || k === 'scene' || k === 'moment')
  const readLevels = project?.index.settings.readLevels ?? OUTLINE_KIND_ORDER

  function handleOpenMoment(id: string) {
    navigate(`/project/${projectId}/book/${bookId}/chapter/${chapterId}/moment/${id}`)
  }

  const exportProjectId = projectId
  const exportChapterId = chapterId
  const chapterTitle = chapter.title

  async function handleExportPdf() {
    setIsExporting(true)
    try {
      await exportChapterPdf(exportProjectId, exportChapterId, `${sanitizeFilename(chapterTitle || 'chapter')}.pdf`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="chapter-workspace">
      <div className="chapter-workspace__tree">
        <button
          type="button"
          className="chapter-workspace__export"
          onClick={handleExportPdf}
          disabled={isExporting}
        >
          {isExporting ? 'Exporting…' : 'Export PDF'}
        </button>
        <ScopedOutlineEditor
          key={chapterId}
          rootId={chapterId}
          levels={levels}
          onOpenMoment={handleOpenMoment}
          accentColor={book?.color}
        />
      </div>

      <div className="chapter-workspace__moment">
        {momentId ? (
          <MomentWorkspace
            projectId={projectId}
            nodes={nodes}
            chapterId={chapterId}
            momentId={momentId}
            readLevels={readLevels}
          />
        ) : (
          <p className="chapter-workspace__placeholder">Select a moment from the chapter outline to start writing.</p>
        )}
      </div>

      <div className="chapter-workspace__plotpoints">
        <ChapterPlotpoints nodes={nodes} plotNodes={plot?.nodes ?? []} chapterId={chapterId} />
      </div>
    </div>
  )
}

export default ChapterWorkspace
