import { useNavigate, useParams } from 'react-router-dom'
import ChapterNav from '../../components/shared/ChapterNav'
import { useOutline } from '../../api/outline'
import { usePlot } from '../../api/plot'
import { useScrap } from '../../api/scrap'
import { useState } from 'react'
import ChapterOutline from './ChapterOutline'
import ChapterPlotpoints from './ChapterPlotpoints'
import DraftAnalyticsPanel from './DraftAnalyticsPanel'
import MomentEditor from './MomentEditor'
import ScrapBinPanel from './ScrapBinPanel'

/** Resolves a scrap entry to whichever of its last-known ancestors still
 * exists in the live tree (chapter first, then book), or null if neither
 * survives -- used both for ChapterNav badge counts and for scoping the
 * scrap bin panel to whichever badge was clicked. */
function scrapGroupKey(
  entry: { lastChapterId: string | null; lastBookId: string | null },
  liveIds: Set<string>
): string | null {
  if (entry.lastChapterId && liveIds.has(entry.lastChapterId)) return entry.lastChapterId
  if (entry.lastBookId && liveIds.has(entry.lastBookId)) return entry.lastBookId
  return null
}

function DraftMode() {
  const { projectId, chapterId, momentId } = useParams<{
    projectId: string
    chapterId?: string
    momentId?: string
  }>()
  const navigate = useNavigate()
  const { data: outline, isLoading } = useOutline(projectId)
  const { data: plot } = usePlot(projectId)
  const { data: scrapRegistry } = useScrap(projectId)
  const [scrapPanelScope, setScrapPanelScope] = useState<string | null>(null)

  if (isLoading) return <p>Loading outline…</p>
  if (!projectId) return null

  const nodes = outline?.nodes ?? []
  const plotNodes = plot?.nodes ?? []
  const selectedChapter = nodes.find((n) => n.id === chapterId && n.kind === 'chapter')
  const selectedMoment = nodes.find((n) => n.id === momentId && n.kind === 'moment')

  const liveIds = new Set(nodes.map((n) => n.id))
  const scrapCountsByNodeId: Record<string, number> = {}
  for (const entry of scrapRegistry?.entries ?? []) {
    const key = scrapGroupKey(entry, liveIds)
    if (key) scrapCountsByNodeId[key] = (scrapCountsByNodeId[key] ?? 0) + 1
  }
  const scopeEntries = scrapPanelScope
    ? (scrapRegistry?.entries ?? []).filter((e) => scrapGroupKey(e, liveIds) === scrapPanelScope)
    : []

  function handleSelectChapter(id: string) {
    navigate(`/project/${projectId}/draft/${id}`)
  }

  function handleSelectMoment(id: string) {
    if (!chapterId) return
    navigate(`/project/${projectId}/draft/${chapterId}/${id}`)
  }

  return (
    <div className="draft-mode">
      <ChapterNav
        nodes={nodes}
        selectedChapterId={chapterId}
        onSelect={handleSelectChapter}
        scrapCountsByNodeId={scrapCountsByNodeId}
        onScrapBadgeClick={setScrapPanelScope}
      />

      {scrapPanelScope && (
        <div className="draft-mode__scrap-overlay">
          <ScrapBinPanel
            projectId={projectId}
            entries={scopeEntries}
            nodes={nodes}
            onClose={() => setScrapPanelScope(null)}
          />
        </div>
      )}

      <div className="draft-mode__chapter-outline">
        {selectedChapter ? (
          <ChapterOutline
            nodes={nodes}
            chapterId={selectedChapter.id}
            selectedMomentId={momentId}
            onSelect={handleSelectMoment}
          />
        ) : (
          <p className="draft-mode__placeholder">Select a chapter to see its outline.</p>
        )}
      </div>

      <div className="draft-mode__editor">
        {selectedMoment ? (
          <MomentEditor
            key={selectedMoment.id}
            projectId={projectId}
            momentId={selectedMoment.id}
            title={selectedMoment.title}
          />
        ) : (
          <p className="draft-mode__placeholder">Select a moment from the chapter outline to start writing.</p>
        )}
        <DraftAnalyticsPanel
          projectId={projectId}
          nodes={nodes}
          momentId={selectedMoment?.id}
          chapterId={selectedChapter?.id}
        />
      </div>

      <div className="draft-mode__plotpoints">
        {selectedChapter ? (
          <ChapterPlotpoints nodes={nodes} plotNodes={plotNodes} chapterId={selectedChapter.id} />
        ) : (
          <p className="draft-mode__placeholder">No chapter selected.</p>
        )}
      </div>
    </div>
  )
}

export default DraftMode
