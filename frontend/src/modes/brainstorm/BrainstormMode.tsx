import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useBrainstorm, useCreateNote, useDeleteNote, useUpdateNote } from '../../api/brainstorm'
import { useOutline } from '../../api/outline'
import NoteCard from './NoteCard'

function BrainstormMode() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useBrainstorm(projectId)
  const { data: outline } = useOutline(projectId)
  const createNote = useCreateNote(projectId ?? '')
  const updateNote = useUpdateNote(projectId ?? '')
  const deleteNote = useDeleteNote(projectId ?? '')

  const [draftBody, setDraftBody] = useState('')

  const linkOptions = (outline?.nodes ?? []).filter((n) => n.kind !== 'book')

  function handleAdd() {
    const body = draftBody.trim()
    if (!body) return
    createNote.mutate({ body })
    setDraftBody('')
  }

  if (isLoading) return <p>Loading notes…</p>

  return (
    <div className="brainstorm-mode">
      <div className="brainstorm-mode__add">
        <textarea
          placeholder="Jot down an idea…"
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
        />
        <button type="button" onClick={handleAdd} disabled={createNote.isPending}>
          Add note
        </button>
      </div>

      <div className="brainstorm-mode__grid">
        {data?.notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            linkOptions={linkOptions}
            onUpdate={(patch) => updateNote.mutate({ noteId: note.id, ...patch })}
            onDelete={() => deleteNote.mutate(note.id)}
          />
        ))}
      </div>

      {data?.notes.length === 0 && <p>No notes yet — jot down your first idea above.</p>}
    </div>
  )
}

export default BrainstormMode
