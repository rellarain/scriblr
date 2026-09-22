import { useState } from 'react'
import { BarChartIcon, CalendarIcon, CheckboxIcon, PencilIcon } from '../../../icons'
import type { TileDef } from '../../../../components/tiles/tileTypes'
import type { TileShape } from '../../../../components/tiles/tileShapes'
import { TileBars, TileBig, TileSub } from '../../../../components/tiles/tileParts'
import { AnalyticsPanel, NOTES_KEY, Scratchpad, SchedulePanel, TASKS_KEY, newId, type ChecklistItem, type Note } from '../Dashboard'
import { Placeholder, useStoredState } from '../shared'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { projectRows, projectTotals } from './tileData'

// The tiles of the Shelves screen (no project open): the master template, the
// schedule, analytics across every project, and the scratchpad. Each is read-only
// with a few quick actions; expanding it opens the same panel as before.

const roomy = (shape: TileShape) => shape === 'portrait' || shape === 'large'

function ScheduleBody({ shape }: { shape: TileShape }) {
  const [tasks, setTasks] = useStoredState<ChecklistItem[]>(TASKS_KEY, [])
  const [draft, setDraft] = useState('')
  const open = tasks.filter(t => !t.done).length
  if (shape === 'small') return <><div className="tileBig">{open}</div><TileSub>{open === 1 ? 'task open' : 'tasks open'}</TileSub></>

  function add() {
    if (!draft.trim()) return
    setTasks(prev => [...prev, { id: newId(), label: draft.trim(), done: false }])
    setDraft('')
  }
  return (
    <>
      {tasks.length === 0 && <TileSub>No tasks yet.</TileSub>}
      {tasks.slice(0, roomy(shape) ? 6 : 3).map(t => (
        <label key={t.id} className="tileCheck">
          <input type="checkbox" checked={t.done} onChange={() => setTasks(prev => prev.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))} />
          <span>{t.label}</span>
        </label>
      ))}
      <div className="tileQuick">
        <input
          aria-label="Add a task" placeholder="Add a task" value={draft}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
      </div>
    </>
  )
}

function AnalyticsBody({ shape, w }: { shape: TileShape; w: WriterWorkspace }) {
  const rows = projectRows(w.projects, w.projectOutlines)
  const totals = projectTotals(rows)
  if (shape === 'small') return <TileBig value={totals.chapters} label="chapters" />
  return (
    <>
      {rows.length === 0 && <TileSub>No projects yet.</TileSub>}
      <TileBars rows={rows.slice(0, shape === 'large' ? 6 : 3).map(r => ({ key: r.id, label: r.title, value: r.chapters, text: `${r.chapters} chapters` }))} />
      {shape === 'large' && <TileSub>{totals.projects} projects · {totals.books} books · {totals.moments} moments</TileSub>}
    </>
  )
}

function ScratchpadBody({ shape }: { shape: TileShape }) {
  const [notes, setNotes] = useStoredState<Note[]>(NOTES_KEY, [])
  const [draft, setDraft] = useState('')
  if (shape === 'small') return <TileBig value={notes.length} label={notes.length === 1 ? 'note' : 'notes'} />

  function add() {
    if (!draft.trim()) return
    setNotes(prev => [...prev, { id: newId(), title: draft.trim(), body: '' }])
    setDraft('')
  }
  return (
    <>
      {notes.length === 0 && <TileSub>No notes yet.</TileSub>}
      {notes.slice(-5).map(n => <div key={n.id} className="tileRow"><span>{n.title.trim() || n.body.trim() || 'Untitled note'}</span></div>)}
      <div className="tileQuick">
        <input
          aria-label="Add a note" placeholder="Add a note" value={draft}
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
        />
      </div>
    </>
  )
}

export function shelvesTiles(w: WriterWorkspace): TileDef[] {
  const totals = projectTotals(projectRows(w.projects, w.projectOutlines))
  return [
    {
      id: 'template', title: 'Project template', Icon: CheckboxIcon, shapes: ['link'], defaultShape: 'link',
      summary: 'The master project template',
      console: () => <Placeholder title="Project Template" body="Manage the master project template here." />,
    },
    {
      id: 'schedule', title: 'Schedule', Icon: CalendarIcon, shapes: ['small', 'landscape', 'portrait'], defaultShape: 'landscape',
      summary: 'Tasks and routines',
      render: ({ shape }) => <ScheduleBody shape={shape} />,
      console: () => <div className="wrColumns wrColumns--single"><SchedulePanel /></div>,
    },
    {
      id: 'analytics', title: 'Analytics', Icon: BarChartIcon, shapes: ['small', 'landscape', 'large'], defaultShape: 'landscape',
      summary: `${totals.chapters} chapters in ${totals.projects} ${totals.projects === 1 ? 'project' : 'projects'}`,
      render: ({ shape }) => <AnalyticsBody shape={shape} w={w} />,
      console: () => <div className="wrColumns wrColumns--single"><AnalyticsPanel projects={w.projects} outlines={w.projectOutlines} /></div>,
    },
    {
      id: 'scratchpad', title: 'Scratchpad', Icon: PencilIcon, shapes: ['small', 'portrait'], defaultShape: 'portrait',
      summary: 'Notes',
      render: ({ shape }) => <ScratchpadBody shape={shape} />,
      console: () => <div className="wrColumns wrColumns--single"><Scratchpad /></div>,
    },
  ]
}
