import { useState } from 'react'
import { useAddComment, useDeleteComment } from '../../api/revisions'
import type { RevisionSnapshot } from '../../types'

interface Props {
  projectId: string
  sceneId: string
  snapshot: RevisionSnapshot
}

function CommentsPanel({ projectId, sceneId, snapshot }: Props) {
  const addComment = useAddComment(projectId, sceneId)
  const deleteComment = useDeleteComment(projectId, sceneId)

  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [commentText, setCommentText] = useState('')
  const [flag, setFlag] = useState<'primary' | 'secondary' | ''>('')

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    if (el.selectionStart !== el.selectionEnd) {
      setSelection({ start: el.selectionStart, end: el.selectionEnd })
    }
  }

  function handleAddComment() {
    if (!selection || !commentText.trim()) return
    addComment.mutate(
      {
        snapshotId: snapshot.snapshotId,
        body: commentText.trim(),
        anchorStart: selection.start,
        anchorEnd: selection.end,
        flag: flag || null,
      },
      {
        onSuccess: () => {
          setCommentText('')
          setSelection(null)
          setFlag('')
        },
      }
    )
  }

  return (
    <div className="comments-panel">
      <textarea
        className="comments-panel__body"
        value={snapshot.body}
        readOnly
        onSelect={handleSelect}
      />

      {selection && (
        <div className="comments-panel__new">
          <p className="comments-panel__quote">
            “{snapshot.body.slice(selection.start, selection.end)}”
          </p>
          <textarea
            placeholder="Add a comment on this selection…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <div className="comments-panel__new-actions">
            <select value={flag} onChange={(e) => setFlag(e.target.value as 'primary' | 'secondary' | '')}>
              <option value="">No flag</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
            <button type="button" onClick={handleAddComment} disabled={addComment.isPending}>
              Add comment
            </button>
            <button type="button" onClick={() => setSelection(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="comments-panel__list">
        {snapshot.notes.map((note) => (
          <li key={note.id} className={`comments-panel__note${note.flag ? ` is-${note.flag}` : ''}`}>
            <p className="comments-panel__note-quote">
              “{snapshot.body.slice(note.anchor.start, note.anchor.end)}”
            </p>
            <p className="comments-panel__note-body">{note.body}</p>
            <button
              type="button"
              onClick={() =>
                deleteComment.mutate({ snapshotId: snapshot.snapshotId, noteId: note.id })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CommentsPanel
