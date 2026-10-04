import { useEffect, useRef, useState } from 'react'
import type { OutlineNode } from '../../../api/types'
import { PlusIcon, TrashIcon } from '../../icons'
import { booksOf, chaptersOfBook } from './outlineTree'
import { AutoTextarea, useStoredState } from './shared'
import { focusNodeField, useNodeKeys } from '../../../lib/nodeKeys'

// The Dash's panels: tasks, routines, analytics and the scratchpad, each a tab of the Dash level
// (levels/dashTabs.tsx). Checklists and notes have no backend of their own, so they persist in the
// user's settings store.

export interface ChecklistItem { id: string; label: string; done: boolean }
export const TASKS_KEY = 'scriblr.writer.tasks'
export const ROUTINES_KEY = 'scriblr.writer.routines'
export const NOTES_KEY = 'scriblr.writer.scratchpad'

export function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}

// `query` filters the list by text; each rise of `newTick` (the level header's New button) puts the cursor in the add box.
function Checklist({ title, storageKey, placeholder, query = '', newTick = 0 }: {
  title: string; storageKey: string; placeholder: string; query?: string; newTick?: number
}) {
  const [items, setItems] = useStoredState<ChecklistItem[]>(storageKey, [])
  const [draft, setDraft] = useState('')
  const addRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (newTick > 0) addRef.current?.focus() }, [newTick])
  const shown = query ? items.filter(i => i.label.toLowerCase().includes(query)) : items

  function add() {
    if (!draft.trim()) return
    setItems(prev => [...prev, { id: newId(), label: draft.trim(), done: false }])
    setDraft('')
  }

  return (
    <div className="wrCard">
      <div className="wrCardTitle">{title}</div>
      {items.length === 0 && <p className="wrMuted">Nothing here yet.</p>}
      {items.length > 0 && shown.length === 0 && <p className="wrMuted">Nothing matches.</p>}
      <ul className="wrChecklist">
        {shown.map(item => (
          <li key={item.id} className={item.done ? 'wrCheckItem wrCheckItem--done' : 'wrCheckItem'}>
            <label>
              <input
                type="checkbox" checked={item.done}
                onChange={() => setItems(prev => prev.map(i => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              />
              <span>{item.label}</span>
            </label>
            <button
              type="button" className="wrTrashBtn wrTrashBtn--dark" aria-label={`Delete ${item.label}`}
              onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
            >
              <TrashIcon size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="wrInlineAdd">
        <input
          ref={addRef} value={draft} placeholder={placeholder} aria-label={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button type="button" className="wrSmallBtn" disabled={!draft.trim()} onClick={add}><PlusIcon size={14} /> Add</button>
      </div>
    </div>
  )
}

export interface PanelContext { query?: string; newTick?: number }

// The Dash's Checklist tab (tasks) and Schedule tab (routines).
export function TasksPanel({ query, newTick }: PanelContext) {
  return <Checklist title="Tasks" storageKey={TASKS_KEY} placeholder="Add a task…" query={query} newTick={newTick} />
}

export function RoutinesPanel({ query, newTick }: PanelContext) {
  return <Checklist title="Routines" storageKey={ROUTINES_KEY} placeholder="Add a routine…" query={query} newTick={newTick} />
}

export function AnalyticsPanel({ projects, outlines }: {
  projects: { projectId: string; title: string }[]
  outlines: Record<string, OutlineNode[]>
}) {
  const rows = projects.map(p => {
    const nodes = outlines[p.projectId] ?? []
    const books = booksOf(nodes)
    const chapters = books.reduce((n, b) => n + chaptersOfBook(nodes, b.id).length, 0)
    return { id: p.projectId, title: p.title, books: books.length, chapters, moments: nodes.filter(n => n.kind === 'moment' && !n.freeDraft).length }
  })
  const maxChapters = Math.max(1, ...rows.map(r => r.chapters))
  const totals = rows.reduce(
    (t, r) => ({ books: t.books + r.books, chapters: t.chapters + r.chapters, moments: t.moments + r.moments }),
    { books: 0, chapters: 0, moments: 0 },
  )

  return (
    <div className="wrColumn wrColumn--bare">
      <div className="wrCard">
        <div className="wrCardTitle">Across all projects</div>
        <div className="wrStatRow">
          <div><strong>{rows.length}</strong><span>projects</span></div>
          <div><strong>{totals.books}</strong><span>books</span></div>
          <div><strong>{totals.chapters}</strong><span>chapters</span></div>
          <div><strong>{totals.moments}</strong><span>moments</span></div>
        </div>
      </div>
      <div className="wrCard">
        <div className="wrCardTitle">Chapters by project</div>
        {rows.length === 0 && <p className="wrMuted">No projects yet.</p>}
        {rows.map(r => (
          <div key={r.id} className="wrBarRow">
            <div className="wrBarLabel"><span>{r.title}</span><span>{r.chapters} chapters</span></div>
            <div className="wrBarTrack"><div className="wrBarFill" style={{ width: `${(r.chapters / maxChapters) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
      {!bare && (
        <div className="wrColumnTitle">
          Scratchpad
          <button type="button" className="wrSmallBtn wrColumnAction" onClick={() => focusNodeField(addAfter(null), 'first')}><PlusIcon size={14} /> Note</button>
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
