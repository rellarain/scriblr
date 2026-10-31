import { useEffect, useRef, useState } from 'react'
import { PlusIcon, TrashIcon } from '../../icons'
import { AutoTextarea, useStoredState } from './shared'
import { focusNodeField, useNodeKeys } from '../../../lib/nodeKeys'

// The Dash's scratchpad, a tab of the Dash level (levels/dashTabs.tsx). Notes have no backend of their own, so they persist in the
// user's settings store. (The tasks, routines and analytics that used to be here are the Schedule console, schedule/.)

export const NOTES_KEY = 'scriblr.writer.scratchpad'

export function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}

export interface PanelContext { query?: string; newTick?: number }
export interface Note { id: string; title: string; body: string }

// Notes are cards with a title and description. Click one to edit it. The
// shared node shortcuts apply (lib/nodeKeys.ts): Enter adds a note after this
// one, Shift+Enter is a new line, Tab moves between fields and notes, and
// Enter, Backspace or Delete in an empty note removes it.
export function Scratchpad({ query = '', newTick = 0, bare = false }: PanelContext & { bare?: boolean } = {}) {
  const [notes, setNotes] = useStoredState<Note[]>(NOTES_KEY, [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const shown = query ? notes.filter(n => `${n.title} ${n.body}`.toLowerCase().includes(query)) : notes

  function addAfter(afterId: string | null): string {
    const note: Note = { id: newId(), title: '', body: '' }
    setNotes(prev => {
      if (afterId === null) return [...prev, note]
      const at = prev.findIndex(n => n.id === afterId) + 1
      return [...prev.slice(0, at), note, ...prev.slice(at)]
    })
    setEditingId(note.id)
    return note.id
  }

  function patch(id: string, changes: Partial<Note>) {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, ...changes } : n)))
  }

  // The level header's New button adds a note.
  useEffect(() => { if (newTick > 0) focusNodeField(addAfter(null), 'first') }, [newTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const keys = useNodeKeys({
    parentOf: () => null,
    siblingsOf: () => notes.map(n => n.id),
    isEmpty: id => {
      const n = notes.find(x => x.id === id)
      return !n || (n.title.trim() === '' && n.body.trim() === '')
    },
    createSibling: id => addAfter(id),
    remove: id => setNotes(prev => prev.filter(x => x.id !== id)),
  })

  return (
    <div className={bare ? 'wrNotesBare' : 'wrColumn wrColumn--narrow'}>
      {!bare ? (
        <div className="wrColumnTitle">
          Scratchpad
          <button type="button" className="wrSmallBtn wrColumnAction" onClick={() => focusNodeField(addAfter(null), 'first')}><PlusIcon size={14} /> Note</button>
        </div>
      ) : (
        <div className="wrNotesBareHead">
          <button type="button" className="wrSmallBtn" onClick={() => focusNodeField(addAfter(null), 'first')}><PlusIcon size={14} /> Note</button>
        </div>
      )}
      <div className="wrNotes" ref={listRef} onKeyDown={keys.onKeyDown}>
        {notes.length === 0 && <p className="wrMuted">No notes yet. Add one to jot down a thought.</p>}
        {notes.length > 0 && shown.length === 0 && <p className="wrMuted">Nothing matches.</p>}
        {shown.map(n => (
          <div
            key={n.id} data-note={n.id} data-knode={n.id}
            className={editingId === n.id ? 'wrNote wrNote--editing' : 'wrNote'}
            onFocus={() => setEditingId(n.id)}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditingId(null) }}
          >
            <input
              className="wrNoteTitle" placeholder="Title" value={n.title} data-kf=""
              onChange={e => patch(n.id, { title: e.target.value })}
            />
            <AutoTextarea
              className="wrNoteBody" rows={1} placeholder="Description" value={n.body} keyField
              onChange={body => patch(n.id, { body })}
            />
            {editingId === n.id && (
              <div className="wrNoteFoot">
                <button
                  type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label="Delete note"
                  onMouseDown={e => e.preventDefault()} onClick={() => setNotes(prev => prev.filter(x => x.id !== n.id))}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!bare && <p className="wrHint">Enter adds a note, Shift+Enter a new line. Tab moves between notes. Enter, Backspace or Delete in an empty note removes it.</p>}
    </div>
  )
}
