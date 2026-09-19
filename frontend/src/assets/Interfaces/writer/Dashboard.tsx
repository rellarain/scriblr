import { useRef, useState } from 'react'
import type { OutlineNode } from '../../../api/types'
import { PlusIcon, TrashIcon } from '../../icons'
import { booksOf, chaptersOfBook } from './outlineTree'
import { AutoTextarea, useStoredState } from './shared'

// The Shelves dashboard: schedule and analytics as equal columns and a
// narrow scratchpad column. Checklists and notes have no backend yet, so
// they persist in the browser's local storage.

interface ChecklistItem { id: string; label: string; done: boolean }

function newId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function Checklist({ title, storageKey, placeholder }: { title: string; storageKey: string; placeholder: string }) {
  const [items, setItems] = useStoredState<ChecklistItem[]>(storageKey, [])
  const [draft, setDraft] = useState('')

  function add() {
    if (!draft.trim()) return
    setItems(prev => [...prev, { id: newId(), label: draft.trim(), done: false }])
    setDraft('')
  }

  return (
    <div className="wrCard">
      <div className="wrCardTitle">{title}</div>
      {items.length === 0 && <p className="wrMuted">Nothing here yet.</p>}
      <ul className="wrChecklist">
        {items.map(item => (
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
          value={draft} placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
        <button type="button" className="wrSmallBtn" disabled={!draft.trim()} onClick={add}><PlusIcon size={14} /> Add</button>
      </div>
    </div>
  )
}

export function SchedulePanel() {
  return (
    <div className="wrColumn">
      <div className="wrColumnTitle">Schedule</div>
      <Checklist title="Tasks" storageKey="scriblr.writer.tasks" placeholder="Add a task…" />
      <Checklist title="Routines" storageKey="scriblr.writer.routines" placeholder="Add a routine…" />
    </div>
  )
}

export function AnalyticsPanel({ projects, outlines }: {
  projects: { projectId: string; title: string }[]
  outlines: Record<string, OutlineNode[]>
}) {
  const rows = projects.map(p => {
    const nodes = outlines[p.projectId] ?? []
    const books = booksOf(nodes)
    const chapters = books.reduce((n, b) => n + chaptersOfBook(nodes, b.id).length, 0)
    return { id: p.projectId, title: p.title, books: books.length, chapters, moments: nodes.filter(n => n.kind === 'moment').length }
  })
  const maxChapters = Math.max(1, ...rows.map(r => r.chapters))
  const totals = rows.reduce(
    (t, r) => ({ books: t.books + r.books, chapters: t.chapters + r.chapters, moments: t.moments + r.moments }),
    { books: 0, chapters: 0, moments: 0 },
  )

  return (
    <div className="wrColumn">
      <div className="wrColumnTitle">Analytics</div>
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

interface Note { id: string; title: string; body: string }

// Notes are cards with a title and description. Click one to edit it, Tab
// moves to the next field or card, and Enter adds a new card after it.
export function Scratchpad() {
  const [notes, setNotes] = useStoredState<Note[]>('scriblr.writer.scratchpad', [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  function addAfter(afterId: string | null) {
    const note: Note = { id: newId(), title: '', body: '' }
    setNotes(prev => {
      if (afterId === null) return [...prev, note]
      const at = prev.findIndex(n => n.id === afterId) + 1
      return [...prev.slice(0, at), note, ...prev.slice(at)]
    })
    setEditingId(note.id)
    setTimeout(() => listRef.current?.querySelector<HTMLInputElement>(`[data-note="${note.id}"] input`)?.focus(), 0)
  }

  function patch(id: string, changes: Partial<Note>) {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, ...changes } : n)))
  }

  function onKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      addAfter(id)
    }
  }

  return (
    <div className="wrColumn wrColumn--narrow">
      <div className="wrColumnTitle">
        Scratchpad
        <button type="button" className="wrSmallBtn wrColumnAction" onClick={() => addAfter(null)}><PlusIcon size={14} /> Note</button>
      </div>
      <div className="wrNotes" ref={listRef}>
        {notes.length === 0 && <p className="wrMuted">No notes yet. Add one to jot down a thought.</p>}
        {notes.map(n => (
          <div
            key={n.id} data-note={n.id}
            className={editingId === n.id ? 'wrNote wrNote--editing' : 'wrNote'}
            onFocus={() => setEditingId(n.id)}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditingId(null) }}
          >
            <input
              className="wrNoteTitle" placeholder="Title" value={n.title}
              onChange={e => patch(n.id, { title: e.target.value })} onKeyDown={e => onKeyDown(e, n.id)}
            />
            <AutoTextarea
              className="wrNoteBody" rows={1} placeholder="Description" value={n.body}
              onChange={body => patch(n.id, { body })} onKeyDown={e => onKeyDown(e, n.id)}
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
      <p className="wrHint">Click a note to edit. Tab moves to the next field or note. Enter adds a note.</p>
    </div>
  )
}

export function Dashboard({ projects, outlines }: {
  projects: { projectId: string; title: string }[]
  outlines: Record<string, OutlineNode[]>
}) {
  return (
    <div className="wrColumns">
      <SchedulePanel />
      <AnalyticsPanel projects={projects} outlines={outlines} />
      <Scratchpad />
    </div>
  )
}

