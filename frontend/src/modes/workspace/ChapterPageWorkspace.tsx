import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { exportChapterPdf } from '../../api/export'
import { useOutline } from '../../api/outline'
import { usePlot, useSavePlot } from '../../api/plot'
import { useProject } from '../../api/projects'
import { sanitizeFilename } from '../../lib/sanitizeFilename'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNodeKind } from '../../types'
import DashboardIcon from '../../components/shared/DashboardIcon'
import ExportIcon from '../../components/shared/ExportIcon'
import EyeIcon from '../../components/shared/EyeIcon'
import OutlineIcon from '../../components/shared/OutlineIcon'
import PlotIcon from '../../components/shared/PlotIcon'
import ChapterPlotpoints from '../draft/ChapterPlotpoints'
import BulletinBoardOverlay from '../dashboard/BulletinBoardOverlay'
import { ancestorOfKind, subtreeOrder } from '../outline/outlineTree'
import { assignPlotpoint, assignPlotpointToParagraph } from '../plan/plotTree'
import PlotDrawer from '../plot/PlotDrawer'
import ChapterPageParagraph from './ChapterPageParagraph'
import ScopedOutlineEditor from './ScopedOutlineEditor'

type Overlay = 'plot' | 'dashboard' | null

// Same .level-config checkbox-row pattern used elsewhere for
// outlineLevels/plotLevels, pinning "chapter" as the always-on kind.
function ReadLevelConfig({
  projectId,
  levels,
  onChange,
}: {
  projectId: string
  levels: OutlineNodeKind[]
  onChange: (levels: OutlineNodeKind[]) => void
}) {
  function toggleLevel(kind: OutlineNodeKind) {
    if (kind === 'chapter') return
    const set = new Set(levels)
    if (set.has(kind)) set.delete(kind)
    else set.add(kind)
    onChange(OUTLINE_KIND_ORDER.filter((k) => k === 'chapter' || set.has(k)))
  }

  return (
    <div className="level-config">
      <span className="level-config__label">Levels:</span>
      {OUTLINE_KIND_ORDER.map((kind) => (
        <label key={kind} className="level-config__option">
          <input
            type="checkbox"
            checked={levels.includes(kind)}
            disabled={kind === 'chapter'}
            onChange={() => toggleLevel(kind)}
          />
          {kind}
        </label>
      ))}
    </div>
  )
}

// The chapter "page": a single continuous, directly-editable page combining
// every act/scene heading and moment in the chapter, replacing the old
// act/scene/moment tree + separate Draft/Read/History tabs. Structural
// editing (add/reorder/rename act/scene/moment) moves behind a "Manage
// structure" toggle instead of always occupying a column.
function ChapterPageWorkspace() {
  const { projectId, bookId, chapterId } = useParams<{
    projectId: string
    bookId: string
    chapterId: string
  }>()
  const [searchParams] = useSearchParams()
  const deepLinkMomentId = searchParams.get('moment') ?? undefined

  const { data: outline, isLoading } = useOutline(projectId)
  const { data: project } = useProject(projectId)
  const { data: plot } = usePlot(projectId)
  const savePlot = useSavePlot(projectId ?? '')

  const [isExporting, setIsExporting] = useState(false)
  const [managingStructure, setManagingStructure] = useState(false)
  const [preview, setPreview] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [readLevels, setReadLevels] = useState<OutlineNodeKind[] | null>(null)

  useEffect(() => {
    if (deepLinkMomentId) {
      const el = document.getElementById(`moment-${deepLinkMomentId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    // Only run once per mount/deep-link value -- not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkMomentId])

  if (isLoading) return <p>Loading chapter…</p>
  if (!projectId || !chapterId || !outline) return null

  const nodes = outline.nodes
  const chapter = nodes.find((n) => n.id === chapterId && n.kind === 'chapter')
  if (!chapter) return <p className="chapter-page__error">Chapter not found.</p>

  const book = ancestorOfKind(nodes, chapterId, 'book')
  const projectLevels = project?.index.settings.outlineLevels ?? OUTLINE_KIND_ORDER
  const structureLevels = projectLevels.filter((k) => k === 'act' || k === 'scene' || k === 'moment')
  const effectiveReadLevels = readLevels ?? project?.index.settings.readLevels ?? OUTLINE_KIND_ORDER
  const plotNodes = plot?.nodes ?? []

  const ordered = subtreeOrder(nodes, chapterId).filter(
    (n) => n.kind === 'moment' || effectiveReadLevels.includes(n.kind)
  )

  function handleAssignPlotpointToParagraph(plotpointId: string, momentId: string, paragraphIndex: number) {
    if (!plot) return
    const next = assignPlotpointToParagraph(plot.nodes, plotpointId, momentId, paragraphIndex)
    savePlot.mutate({ schemaVersion: plot.schemaVersion, nodes: next })
  }

  function handleUnassignPlotpoint(plotpointId: string) {
    if (!plot) return
    const next = assignPlotpoint(plot.nodes, plotpointId, null)
    savePlot.mutate({ schemaVersion: plot.schemaVersion, nodes: next })
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
    <div className="chapter-page-workspace">
      <div className="chapter-page-workspace__toolbar">
        <button type="button" onClick={handleExportPdf} disabled={isExporting}>
          <ExportIcon /> {isExporting ? 'Exporting…' : 'Export PDF'}
        </button>
        <button
          type="button"
          className={managingStructure ? 'is-active' : ''}
          onClick={() => setManagingStructure((v) => !v)}
        >
          <OutlineIcon /> {managingStructure ? 'Done managing structure' : 'Manage structure'}
        </button>
        <button type="button" className={preview ? 'is-active' : ''} onClick={() => setPreview((v) => !v)}>
          <EyeIcon /> {preview ? 'Exit preview' : 'Preview'}
        </button>
        <button type="button" onClick={() => setOverlay('plot')}>
          <PlotIcon /> Plot
        </button>
        <button type="button" onClick={() => setOverlay('dashboard')}>
          <DashboardIcon /> Dashboard
        </button>
      </div>

      <div className="chapter-page-workspace__body">
        <div className="chapter-page" style={book?.color ? ({ '--book-accent': book.color } as React.CSSProperties) : undefined}>
          {managingStructure ? (
            <ScopedOutlineEditor key={chapterId} rootId={chapterId} levels={structureLevels} accentColor={book?.color} />
          ) : (
            <>
              {!preview && <ReadLevelConfig projectId={projectId} levels={effectiveReadLevels} onChange={setReadLevels} />}
              <h2 className="chapter-page__heading chapter-page__heading--chapter">{chapter.title || 'Untitled'}</h2>
              {ordered.map((node) =>
                node.kind === 'moment' ? (
                  <ChapterPageParagraph
                    key={node.id}
                    projectId={projectId}
                    chapterId={chapterId}
                    momentId={node.id}
                    title={node.title}
                    showTitle={effectiveReadLevels.includes('moment')}
                    preview={preview}
                    plotNodes={plotNodes}
                    onAssignPlotpointToParagraph={(plotpointId, paragraphIndex) =>
                      handleAssignPlotpointToParagraph(plotpointId, node.id, paragraphIndex)
                    }
                    onUnassignPlotpoint={handleUnassignPlotpoint}
                    highlighted={node.id === deepLinkMomentId}
                  />
                ) : (
                  <h2 key={node.id} className={`chapter-page__heading chapter-page__heading--${node.kind}`}>
                    {node.title}
                  </h2>
                )
              )}
              {ordered.length === 0 && <p className="chapter-page__placeholder">Nothing here yet.</p>}
            </>
          )}
        </div>

        <div className="chapter-page-workspace__plotpoints">
          <ChapterPlotpoints nodes={nodes} plotNodes={plotNodes} chapterId={chapterId} />
        </div>
      </div>

      {overlay === 'plot' && <PlotDrawer onClose={() => setOverlay(null)} />}
      {overlay === 'dashboard' && (
        <BulletinBoardOverlay
          projectId={projectId}
          nodes={nodes}
          chapterId={chapterId}
          initialMomentId={deepLinkMomentId}
          onClose={() => setOverlay(null)}
        />
      )}
    </div>
  )
}

export default ChapterPageWorkspace
