import { useState } from 'react'
import {
  useCreateSnapshot,
  useDiff,
  useRevertToSnapshot,
  useRevisions,
  useSnapshot,
} from '../../api/revisions'
import SaveIcon from '../../components/shared/SaveIcon'
import CommentsPanel from './CommentsPanel'
import DiffView from './DiffView'

interface Props {
  projectId: string
  chapterId: string
  momentId: string
  title: string
}

// Revisions are chapter-scoped (a snapshot captures the whole chapter's
// moments at once), but this panel is embedded per-moment -- diff/comments
// below are scoped to just this moment's body within the selected snapshot.
function MomentRevisions({ projectId, chapterId, momentId, title }: Props) {
  const { data: summaries, isLoading } = useRevisions(projectId, chapterId)
  const createSnapshot = useCreateSnapshot(projectId, chapterId)
  const revert = useRevertToSnapshot(projectId, chapterId)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: snapshot } = useSnapshot(projectId, chapterId, selectedId ?? undefined)
  const { data: diff } = useDiff(projectId, chapterId, momentId, selectedId ?? undefined, 'current')

  function handleSnapshot() {
    createSnapshot.mutate()
  }

  function handleRevert() {
    if (!selectedId) return
    if (!confirm('Revert the current draft to this snapshot? A safety snapshot of the current text will be taken first.')) {
      return
    }
    revert.mutate(selectedId, {
      onSuccess: (safetySnapshot) => setSelectedId(safetySnapshot.snapshotId),
    })
  }

  return (
    <div className="scene-revisions">
      <div className="scene-revisions__header">
        <h3>{title}</h3>
        <button
          type="button"
          className="scene-revisions__save-button"
          onClick={handleSnapshot}
          disabled={createSnapshot.isPending}
          title="Save a snapshot of this chapter now"
        >
          <SaveIcon /> Save snapshot
        </button>
      </div>

      <div className="scene-revisions__body">
        <ul className="scene-revisions__timeline">
          {isLoading && <li>Loading snapshots…</li>}
          {summaries?.map((s) => (
            <li key={s.snapshotId}>
              <button
                type="button"
                className={
                  s.snapshotId === selectedId
                    ? 'scene-revisions__snapshot is-active'
                    : 'scene-revisions__snapshot'
                }
                onClick={() => setSelectedId(s.snapshotId)}
              >
                <span className="scene-revisions__snapshot-label">
                  {s.label || new Date(s.createdAt).toLocaleString()}
                </span>
                <span className="scene-revisions__snapshot-meta">
                  {s.wordCount} words · {s.trigger}
                </span>
              </button>
            </li>
          ))}
          {summaries?.length === 0 && <li>No snapshots yet.</li>}
        </ul>

        <div className="scene-revisions__detail">
          {!selectedId && <p>Select a snapshot to view its diff and comments.</p>}
          {selectedId && diff && (
            <>
              <div className="scene-revisions__actions">
                <h4>Diff vs. current draft</h4>
                <button type="button" onClick={handleRevert} disabled={revert.isPending}>
                  Revert to this snapshot
                </button>
              </div>
              <DiffView ops={diff.ops} />
            </>
          )}
          {selectedId && snapshot && (
            <>
              <h4>Snapshot text &amp; comments</h4>
              <CommentsPanel projectId={projectId} chapterId={chapterId} momentId={momentId} snapshot={snapshot} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default MomentRevisions
