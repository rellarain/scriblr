import { useState } from 'react'
import { useDraft } from '../../api/draft'
import { useDeleteScrapEntry, useRestoreScrapEntry } from '../../api/scrap'
import TrashIcon from '../../components/shared/TrashIcon'
import type { OutlineNode, ScrapEntry } from '../../types'

interface Props {
  projectId: string
  entries: ScrapEntry[]
  nodes: OutlineNode[]
  onClose: () => void
}

function ScrapBinPanel({ projectId, entries, nodes, onClose }: Props) {
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreParentId, setRestoreParentId] = useState('')

  const restoreMutation = useRestoreScrapEntry(projectId)
  const deleteMutation = useDeleteScrapEntry(projectId)
  const viewDraft = useDraft(projectId, viewingId ?? undefined)

  const chapters = nodes.filter((n) => n.kind === 'chapter')

  function handleStartRestore(entry: ScrapEntry) {
    setRestoringId(entry.momentId)
    const chapterStillLive = entry.lastChapterId && chapters.some((c) => c.id === entry.lastChapterId)
    setRestoreParentId(chapterStillLive ? (entry.lastChapterId as string) : chapters[0]?.id ?? '')
  }

  function handleConfirmRestore(momentId: string) {
    if (!restoreParentId) return
    restoreMutation.mutate({ momentId, parentId: restoreParentId })
    setRestoringId(null)
  }

  function handleDelete(momentId: string) {
    if (confirm('Permanently delete this scrapped draft? This cannot be undone.')) {
      deleteMutation.mutate(momentId)
    }
  }

  return (
    <div className="scrap-bin-panel">
      <div className="scrap-bin-panel__header">
        <h4>
          <TrashIcon /> Bin
        </h4>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {entries.length === 0 && <p className="scrap-bin-panel__empty">Nothing here.</p>}
      <ul className="scrap-bin-panel__list">
        {entries.map((entry) => (
          <li key={entry.momentId} className="scrap-bin-panel__item">
            <div className="scrap-bin-panel__item-header">
              <span className="scrap-bin-panel__title">{entry.title || 'Untitled'}</span>
              <span className="scrap-bin-panel__meta">
                {entry.wordCount} words · orphaned {new Date(entry.orphanedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="scrap-bin-panel__actions">
              <button
                type="button"
                onClick={() => setViewingId(viewingId === entry.momentId ? null : entry.momentId)}
              >
                {viewingId === entry.momentId ? 'Hide' : 'View'}
              </button>
              <button type="button" onClick={() => handleStartRestore(entry)}>
                Restore
              </button>
              <button type="button" onClick={() => handleDelete(entry.momentId)}>
                Delete permanently
              </button>
            </div>
            {viewingId === entry.momentId && (
              <div className="scrap-bin-panel__view">
                {viewDraft.isLoading ? (
                  <p>Loading…</p>
                ) : (
                  <p className="scrap-bin-panel__view-body">{viewDraft.data?.body || '(empty)'}</p>
                )}
              </div>
            )}
            {restoringId === entry.momentId && (
              <div className="scrap-bin-panel__restore">
                <select value={restoreParentId} onChange={(e) => setRestoreParentId(e.target.value)}>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || 'Untitled'}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => handleConfirmRestore(entry.momentId)}>
                  Confirm restore
                </button>
                <button type="button" onClick={() => setRestoringId(null)}>
                  Cancel
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default ScrapBinPanel
