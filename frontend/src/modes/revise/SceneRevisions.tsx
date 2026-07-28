import { useState } from 'react'
import {
  useCreateSnapshot,
  useDiff,
  useRevertToSnapshot,
  useRevisions,
  useSnapshot,
} from '../../api/revisions'
import CommentsPanel from './CommentsPanel'
import DiffView from './DiffView'

interface Props {
  projectId: string
  sceneId: string
  title: string
}

function SceneRevisions({ projectId, sceneId, title }: Props) {
  const { data: summaries, isLoading } = useRevisions(projectId, sceneId)
  const createSnapshot = useCreateSnapshot(projectId, sceneId)
  const revert = useRevertToSnapshot(projectId, sceneId)

  const [label, setLabel] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: snapshot } = useSnapshot(projectId, sceneId, selectedId ?? undefined)
  const { data: diff } = useDiff(projectId, sceneId, selectedId ?? undefined, 'current')

  function handleSnapshot() {
    createSnapshot.mutate(label.trim(), {
      onSuccess: () => setLabel(''),
    })
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
        <div className="scene-revisions__snapshot-form">
          <input
            type="text"
            placeholder="Label for this snapshot (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="button" onClick={handleSnapshot} disabled={createSnapshot.isPending}>
            Snapshot this
          </button>
        </div>
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
              <CommentsPanel projectId={projectId} sceneId={sceneId} snapshot={snapshot} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SceneRevisions
