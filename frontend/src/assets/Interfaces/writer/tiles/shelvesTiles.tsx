import { useState } from 'react'
import { BarChartIcon, CalendarIcon, CheckboxIcon, PencilIcon } from '../../../icons'
import type { TileDef } from '../../../../components/tiles/tileTypes'
import { TileBars, TileBig, TileSub } from '../../../../components/tiles/tileParts'
import { AnalyticsPanel, NOTES_KEY, Scratchpad, SchedulePanel, TASKS_KEY, newId, type ChecklistItem, type Note } from '../Dashboard'
import { Placeholder, useStoredState } from '../shared'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { projectRows, projectTotals } from './tileData'

// The tiles of the Shelves screen (no project open): the master template, the
// schedule, analytics across every project, and the scratchpad. Each is read-only
// with a few quick actions; expanding it opens the same panel as before. A mid tile's
// content scales with its actual measured size (small and cramped up through roomy).
const COMPACT_H = 140
const ROOMY_H = 220

function ScheduleBody({ height }: { height: number }) {
  const [tasks, setTasks] = useStoredState<ChecklistItem[]>(TASKS_KEY, [])
  const [draft, setDraft] = useState('')
  const open = tasks.filter(t => !t.done).length
  if (height < COMPACT_H) return <><div className="tileBig">{open}</div><TileSub>{open === 1 ? 'task open' : 'tasks open'}</TileSub></>

  function add() {
    if (!draft.trim()) return
    setTasks(prev => [...prev, { id: newId(), label: draft.trim(), done: false }])
    setDraft('')
  }
  return (
    <>
      {tasks.length === 0 && <TileSub>No tasks yet.</TileSub>}
      {tasks.slice(0, height >= ROOMY_H ? 6 : 3).map(t => (
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

function AnalyticsBody({ width, height, w }: { width: number; height: number; w: WriterWorkspace }) {
  const rows = projectRows(w.projects, w.projectOutlines)
  const totals = projectTotals(rows)
  if (height < COMPACT_H) return <TileBig value={totals.chapters} label="chapters" />
  const roomy = width >= 280 && height >= ROOMY_H
  return (
    <>
      {rows.length === 0 && <TileSub>No projects yet.</TileSub>}
      <TileBars rows={rows.slice(0, roomy ? 6 : 3).map(r => ({ key: r.id, label: r.title, value: r.chapters, text: `${r.chapters} chapters` }))} />
      {roomy && <TileSub>{totals.projects} projects · {totals.books} books · {totals.moments} moments</TileSub>}
    </>
  )
}

function ScratchpadBody({ height }: { height: number }) {
  const [notes, setNotes] = useStoredState<Note[]>(NOTES_KEY, [])
  const [draft, setDraft] = useState('')
  if (height < COMPACT_H) return <TileBig value={notes.length} label={notes.length === 1 ? 'note' : 'notes'} />

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
      id: 'template', title: 'Project template', Icon: CheckboxIcon, defaultShape: 'mini',
      summary: 'The master project template',
      console: () => <Placeholder title="Project Template" body="Manage the master project template here." />,
    },
    {
      id: 'schedule', title: 'Schedule', Icon: CalendarIcon, defaultShape: 'mid',
      summary: 'Tasks and routines',
      render: ({ height }) => <ScheduleBody height={height} />,
      console: () => <div className="wrColumns wrColumns--single"><SchedulePanel /></div>,
    },
    {
      id: 'analytics', title: 'Analytics', Icon: BarChartIcon, defaultShape: 'mid',
      summary: `${totals.chapters} chapters in ${totals.projects} ${totals.projects === 1 ? 'project' : 'projects'}`,
      render: ({ width, height }) => <AnalyticsBody width={width} height={height} w={w} />,
      console: () => <div className="wrColumns wrColumns--single"><AnalyticsPanel projects={w.projects} outlines={w.projectOutlines} /></div>,
    },
    {
      id: 'scratchpad', title: 'Scratchpad', Icon: PencilIcon, defaultShape: 'mid',
      summary: 'Notes',
      render: ({ height }) => <ScratchpadBody height={height} />,
      console: () => <div className="wrColumns wrColumns--single"><Scratchpad /></div>,
    },
  ]
}
