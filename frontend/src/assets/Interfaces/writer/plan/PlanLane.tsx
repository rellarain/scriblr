import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Phase, Planner } from '../../../../lib/facets'
import { tickMilestone } from '../../../../lib/planEdit'
import { setPhaseLength } from '../../../../lib/planActions'
import { barOf, daysForPx, dropIndex, pct, restBars, todayPct, type TimelineRange } from '../../../../lib/planTimeline'
import { milestonesOf, movePhase } from '../../../../lib/planSequence'
import { addDays, daysBetween } from '../../../../lib/projection'
import { FlagIcon } from '../../../icons'

// One row's lane on the chart: a bar for each of its phases across the days, a flag for each of its milestones, the rest days shaded and a line for today.
// Drag a bar sideways to put the phase in another place in the row's sequence (the row is dated again from the lengths), drag its right edge to change how long it
// is; with the keyboard, the arrows move it a place, Alt and the arrows change its length by a day (Shift, a week). A bar never leaves its row.

const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Drag { id: string; edge: 'move' | 'end'; x: number; delta: number }

export function PlanLane({ planner, setPlanner, today, phases, range, width, rowTitle, onOpen }: {
  planner: Planner
  setPlanner: (p: Planner) => void
  today: string
  phases: Phase[]
  range: TimelineRange
  // The chart's width in pixels, for the days a pointer has travelled.
  width: number
  rowTitle: string
  onOpen: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const moved = useRef(false)

  useEffect(() => {
    if (!drag) return undefined
    const move = (e: PointerEvent) => { moved.current = true; setDrag(d => (d ? { ...d, delta: daysForPx(e.clientX - d.x, box.current?.clientWidth ?? width, range) } : d)) }
    const up = () => {
      const phase = phases.find(p => p.id === drag.id)
      setDrag(null)
      if (!phase) return
      if (drag.delta === 0) { if (!moved.current) onOpen(phase.id); return }
      if (drag.edge === 'end') { setPlanner(setPhaseLength(planner, phase.id, (phase.lengthDays ?? 1) + drag.delta, today)); return }
      const start = phase.start ?? phase.end
      const end = phase.end ?? phase.start
      if (!start || !end) return
      const mid = daysBetween(range.from, start) + (daysBetween(start, end) + 1) / 2 + drag.delta
      const at = dropIndex(phases.filter(p => p.id !== phase.id), mid, range)
      const r = movePhase(planner, phase.id, at)
      if (r.ok) setPlanner(r.planner)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.edge, drag?.x, drag?.delta, planner, range, phases])

  const press = (e: ReactPointerEvent, id: string, edge: Drag['edge']) => { e.preventDefault(); e.stopPropagation(); moved.current = false; setDrag({ id, edge, x: e.clientX, delta: 0 }) }
  const key = (e: KeyboardEvent, p: Phase) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id) } return }
    e.preventDefault()
    if (e.altKey) { setPlanner(setPhaseLength(planner, p.id, (p.lengthDays ?? 1) + dir * (e.shiftKey ? 7 : 1), today)); return }
    const at = phases.findIndex(x => x.id === p.id)
    const r = movePhase(planner, p.id, at + dir)
    if (r.ok) setPlanner(r.planner)
  }

  const rest = restBars(planner.restDays, range)
  const now = todayPct(today, range)
  const flags = phases.flatMap(p => milestonesOf(planner, p.id)).filter(m => m.date && m.date >= range.from && m.date <= range.to)

  return (
    <div className="wrLane" ref={box} role="group" aria-label={`${rowTitle} on the timeline`} style={{ width }}>
      <div className="wrTimelineRest" aria-hidden="true">{rest.map(x => <i key={x.id} title={x.label || 'Rest days'} style={{ left: `${x.left}%`, width: `${x.width}%` }} />)}</div>
      {now !== null && <i className="wrTimelineNow" aria-hidden="true" title={`Today, ${dayLabel(today)}`} style={{ left: `${now}%` }} />}
      <div className="wrTimelineRow wrTimelineRow--ms">
        {flags.map(m => (
          <button
            key={m.id} type="button" className={`wrTimelineMs${m.done ? ' wrTimelineMs--done' : ''}`} style={{ left: `${pct(m.date as string, range)}%` }} aria-pressed={m.done}
            aria-label={`${m.title || 'Milestone'}, ${dayLabel(m.date as string)}, ${m.done ? 'achieved' : 'not achieved'}`} title={`${m.title || 'Milestone'} · ${dayLabel(m.date as string)}`}
            onClick={() => setPlanner(tickMilestone(planner, m.id, !m.done, today))}
          ><FlagIcon size={20} /></button>
        ))}
      </div>
      <div className="wrTimelineRow">
        {phases.map(p => {
          const start = p.start ?? p.end
          const stretched = drag?.id === p.id && drag.edge === 'end' && start ? addDays(p.end ?? start, drag.delta) : null
          const shown = stretched && start ? { ...p, start, end: stretched < start ? start : stretched } : p
          const bar = barOf(shown, range)
          if (!bar) return null
          const shift = drag?.id === p.id && drag.edge === 'move' ? (drag.delta / range.days) * 100 : 0
          return (
            <div
              key={p.id} data-phase-bar={p.id} className={`wrTimelineBar wrTimelineBar--${p.status}${drag?.id === p.id ? ' wrTimelineBar--drag' : ''}`}
              style={{ left: `${bar.left + shift}%`, width: `${bar.width}%` }} role="button" tabIndex={0}
              aria-label={`${p.title || 'Phase'}, ${p.start ? dayLabel(p.start) : ''}${p.end && p.end !== p.start ? ` to ${dayLabel(p.end)}` : ''}. Arrows move it a place, Alt and arrows change its length.`}
              onPointerDown={e => press(e, p.id, 'move')} onKeyDown={e => key(e, p)}
            >
              <span className="wrTimelineName">{p.title || 'Untitled phase'}</span>
              <span className="wrTimelineEdge wrTimelineEdge--end" aria-hidden="true" title="Drag to change how long it lasts" onPointerDown={e => press(e, p.id, 'end')} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
