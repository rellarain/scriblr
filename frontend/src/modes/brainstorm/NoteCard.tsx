import { useState } from 'react'
import type { BrainstormNote, OutlineNode } from '../../types'

interface Props {
  note: BrainstormNote
  linkOptions: OutlineNode[]
  onUpdate: (patch: { body?: string; tags?: string[]; linkedOutlineNodeId?: string | null }) => void
  onDelete: () => void
}

function NoteCard({ note, linkOptions, onUpdate, onDelete }: Props) {
  const [body, setBody] = useState(note.body)
  const [tagsText, setTagsText] = useState(note.tags.join(', '))

  function commitBody() {
    if (body !== note.body) onUpdate({ body })
  }

  function commitTags() {
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    onUpdate({ tags })
  }

  return (
    <div className="note-card">
      <textarea
        className="note-card__body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={commitBody}
      />
      <input
        className="note-card__tags"
        placeholder="tags, comma, separated"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
        onBlur={commitTags}
      />
      <div className="note-card__footer">
        <select
          value={note.linkedOutlineNodeId ?? ''}
          onChange={(e) => onUpdate({ linkedOutlineNodeId: e.target.value || null })}
        >
          <option value="">Not linked</option>
          {linkOptions.map((n) => (
            <option key={n.id} value={n.id}>
              {n.kind === 'scene' ? `— ${n.title}` : n.title}
            </option>
          ))}
        </select>
        <button type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

export default NoteCard
