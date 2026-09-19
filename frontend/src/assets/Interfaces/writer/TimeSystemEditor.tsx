import { useState } from 'react'
import type { TimeSystem, TimeUnit, TimeUnitKind } from '../../../api/types'
import type { WriterWorkspace } from './useWriterWorkspace'
import { ChevronDownIcon, PlusIcon } from '../../icons'
import { DeleteControl } from './shared'
import { TIME_PRESETS, formatTime } from './timeSystem'

// The Project Editor: the project's time systems. A system is an ordered list
// of units, largest to smallest (Year > Month > Day > Time, or Week > Day...),
// each a number, a named list (months, seasons) or a clock time. A book picks
// a system for its scenes' Time (Book editor); scenes sort by comparing units
// from the first to the last. Standard date & time is the default.

const KIND_LABEL: Record<TimeUnitKind, string> = { number: 'Number', named: 'Named list', clock: 'Time of day' }

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`

// A sample value so the preview shows how a scene's Time would read.
function sampleValue(system: TimeSystem): Record<string, number> {
  const out: Record<string, number> = {}
  for (const u of system.units) out[u.id] = u.kind === 'clock' ? 570 : u.kind === 'named' ? Math.min(2, Math.max(0, u.names.length - 1)) : 3
  return out
}

function SystemCard({ system, canDelete, onChange, onDelete }: {
  system: TimeSystem
  canDelete: boolean
  onChange: (next: TimeSystem, immediate: boolean) => void
  onDelete: () => void
}) {
  const setUnit = (index: number, patch: Partial<TimeUnit>, immediate = false) =>
    onChange({ ...system, units: system.units.map((u, i) => (i === index ? { ...u, ...patch } : u)) }, immediate)

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= system.units.length) return
    const units = [...system.units]
    ;[units[index], units[to]] = [units[to], units[index]]
    onChange({ ...system, units }, true)
  }

  return (
    <div className="wrCardPanel wrTimeSystem">
      <div className="wrCardPanelHead">
        <span className="wrKindBadge">time system</span>
        <input
          className="wrTitleField" value={system.name} placeholder="System name" aria-label="Time system name"
          onChange={e => onChange({ ...system, name: e.target.value }, false)}
        />
        {canDelete && <DeleteControl tone="dark" message={`Delete ${system.name || 'this system'}?`} onConfirm={onDelete} />}
      </div>

      <div className="wrLabel">Units, largest to smallest</div>
      <div className="wrTimeUnits">
        {system.units.length === 0 && <p className="wrMuted">No units yet. Add one.</p>}
        {system.units.map((u, i) => (
          <div key={u.id} className="wrTimeUnit">
            <span className="wrTimeUnitMove">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronDownIcon size={12} className="wrFlip" /></button>
              <button type="button" aria-label="Move down" disabled={i === system.units.length - 1} onClick={() => move(i, 1)}><ChevronDownIcon size={12} /></button>
            </span>
            <input
              className="wrTitleField" value={u.label} placeholder="Unit name (Day, Week...)" aria-label="Unit name"
              onChange={e => setUnit(i, { label: e.target.value })}
            />
            <select
              className="wrTimeKind" value={u.kind} aria-label="Unit type"
              onChange={e => setUnit(i, { kind: e.target.value as TimeUnitKind }, true)}
            >
              {(Object.keys(KIND_LABEL) as TimeUnitKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <DeleteControl
              tone="dark" message={`Remove ${u.label || 'this unit'}?`}
              onConfirm={() => onChange({ ...system, units: system.units.filter((_, j) => j !== i) }, true)}
            />
            {u.kind === 'named' && (
              <input
                className="wrTitleField wrTimeNames" value={u.names.join(', ')} aria-label={`${u.label} names`}
                placeholder="Names, separated by commas (Spring, Summer, ...)"
                onChange={e => setUnit(i, { names: e.target.value.split(',').map(n => n.trim()).filter(Boolean) })}
              />
            )}
          </div>
        ))}
      </div>
      <div className="wrTimeSystemFoot">
        <button
          type="button" className="wrSmallBtn"
          onClick={() => onChange({ ...system, units: [...system.units, { id: newId('unit'), label: '', kind: 'number', names: [] }] }, true)}
        >
          <PlusIcon size={13} /> Unit
        </button>
        <span className="wrOutlineMeta">Example: {formatTime(system, sampleValue(system)) || 'no units yet'}</span>
      </div>
    </div>
  )
}

export default function TimeSystemEditor({ w }: { w: WriterWorkspace }) {
  const systems = w.activeProject?.settings.timeSystems ?? []
  const [preset, setPreset] = useState(TIME_PRESETS[0].key)

  const replace = (index: number, next: TimeSystem, immediate: boolean) =>
    w.updateTimeSystems(systems.map((s, i) => (i === index ? next : s)), immediate)

  function addSystem(blank: boolean) {
    const base: TimeSystem = blank
      ? { id: '', name: 'New time system', units: [{ id: newId('unit'), label: 'Day', kind: 'number', names: [] }] }
      : TIME_PRESETS.find(p => p.key === preset)!.build()
    let id = base.id || newId('sys')
    while (systems.some(s => s.id === id)) id = newId('sys')
    w.updateTimeSystems([...systems, { ...base, id }], true)
  }

  return (
    <div className="wrTimeSystems">
      <div className="wrCardPanel">
        <div className="wrCardPanelHead"><strong>Time</strong></div>
        <p className="wrHint">
          Scenes have a Time that orders the story. Define how it is structured: a system is a list of units from the largest
          to the smallest (for example Year, Month, Day, Time of day, or Week and Day). A book chooses the system its scenes use;
          scenes are ordered by comparing units from the first to the last.
        </p>
        <div className="wrTimeAdd">
          <select value={preset} aria-label="Start from" onChange={e => setPreset(e.target.value)}>
            {TIME_PRESETS.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <button type="button" className="wrSmallBtn" onClick={() => addSystem(false)}><PlusIcon size={13} /> Add system</button>
          <button type="button" className="wrSmallBtn" onClick={() => addSystem(true)}><PlusIcon size={13} /> Blank system</button>
        </div>
      </div>
      {systems.map((s, i) => (
        <SystemCard
          key={s.id} system={s} canDelete={systems.length > 1}
          onChange={(next, immediate) => replace(i, next, immediate)}
          onDelete={() => w.updateTimeSystems(systems.filter((_, j) => j !== i), true)}
        />
      ))}
    </div>
  )
}
