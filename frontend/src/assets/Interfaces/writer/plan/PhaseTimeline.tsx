import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Phase, Planner } from '../../../../lib/facets'
import { tickMilestone } from '../../../../lib/planEdit'
import { barOf, dragPhase, daysForPx, pct, restBars, timelineRange, todayPct, type BarEdge, type TimelineRange } from '../../../../lib/planTimeline'
import { addDays } from '../../../../lib/projection'
import { Fold } from '../schedule/Fold'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { FlagIcon, PlusIcon, TrashIcon } from '../../../icons'

// The phase timeline: the project's days across a chart, a bar for each phase (drag it to move it, or its edges to change when it starts or ends; with the
// keyboard, the arrows move it a day, Shift a week, Alt changes its end), a flag for each milestone (press it to tick it), the rest days shaded and a line
// for today. Under it, folded, the project's start and end and its rest days.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// The first of each month inside the range, for the ruler.
function monthMarks(r: TimelineRange): Array<{ date: string; label: string }> {
  const out: Array<{ date: string; label: string }> = []
  let d = r.from.slice(8) === '01' ? r.from : `${addDays(`${r.from.slice(0, 7)}-28`, 5).slice(0, 7)}-01`
  while (d <= r.to) {
    out.push({ date: d, label: `${MONTHS[Number(d.slice(5, 7)) - 1]}${d.slice(5, 7) === '01' ? ` ${d.slice(0, 4)}` : ''}` })
    d = `${addDays(`${d.slice(0, 7)}-28`, 5).slice(0, 7)}-01`
  }
  return out
}

interface Drag { id: string; edge: BarEdge; x: number; delta: number }

function Chart({ planner, setPlanner, today, range }: { planner: Planner; setPlanner: (p: Planner) => void; today: string; range: TimelineRange }) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const patchPhase = (id: string, patch: Partial<Phase>) => setPlanner({ ...planner, phases: planner.phases.map(p => (p.id === id ? { ...p, ...patch } : p)) })
  const dated = planner.phases.filter(p => p.start || p.end)

  useEffect(() => {
    if (!drag) return undefined
    const move = (e: PointerEvent) => setDrag(d => (d ? { ...d, delta: daysForPx(e.clientX - d.x, box.current?.clientWidth ?? 0, range) } : d))
    const up = () => {
      const phase = planner.phases.find(p => p.id === drag.id)
      setDrag(null)
      if (phase && drag.delta !== 0) patchPhase(phase.id, dragPhase(phase, drag.edge, drag.delta))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id, drag?.edge, drag?.x, drag?.delta, planner, range])

  const press = (e: ReactPointerEvent, id: string, edge: BarEdge) => { e.preventDefault(); e.stopPropagation(); setDrag({ id, edge, x: e.clientX, delta: 0 }) }
  const key = (e: KeyboardEvent, p: Phase) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    patchPhase(p.id, dragPhase(p, e.altKey ? 'end' : 'move', dir * (e.shiftKey ? 7 : 1)))
  }
  const rest = restBars(planner.restDays, range)
  const now = todayPct(today, range)
  const dated_ms = planner.milestones.filter(m => m.date && m.date >= range.from && m.date <= range.to)

  return (
    <div className="wrTimeline" ref={box} role="group" aria-label="Phase timeline">
      <div className="wrTimelineRest" aria-hidden="true">{rest.map(x => <i key={x.id} title={x.label || 'Rest days'} style={{ left: `${x.left}%`, width: `${x.width}%` }} />)}</div>
      {now !== null && <i className="wrTimelineNow" aria-hidden="true" title={`Today, ${dayLabel(today)}`} style={{ left: `${now}%` }} />}
      <div className="wrTimelineRuler" aria-hidden="true">{monthMarks(range).map(m => <span key={m.date} style={{ left: `${pct(m.date, range)}%` }}>{m.label}</span>)}</div>
      <div className="wrTimelineRow wrTimelineRow--ms">
        {dated_ms.map(m => (
          <button
            key={m.id} type="button" className={`wrTimelineMs${m.done ? ' wrTimelineMs--done' : ''}`} style={{ left: `${pct(m.date as string, range)}%` }} aria-pressed={m.done}
            aria-label={`${m.title || 'Milestone'}, ${dayLabel(m.date as string)}, ${m.done ? 'done' : 'not done'}`} title={`${m.title || 'Milestone'} · ${dayLabel(m.date as string)}`}
            onClick={() => setPlanner(tickMilestone(planner, m.id, !m.done, today))}
          ><FlagIcon size={20} /></button>
        ))}
      </div>
      {dated.map(p => {
        const shown = drag?.id === p.id ? { ...p, ...dragPhase(p, drag.edge, drag.delta) } : p
        const bar = barOf(shown, range)
        if (!bar) return null
        return (
          <div className="wrTimelineRow" key={p.id}>
            <div
              className={`wrTimelineBar wrTimelineBar--${p.status}${drag?.id === p.id ? ' wrTimelineBar--drag' : ''}`} style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
              role="button" tabIndex={0} aria-label={`${p.title || 'Phase'}, ${shown.start ? dayLabel(shown.start) : ''}${shown.end && shown.end !== shown.start ? ` to ${dayLabel(shown.end)}` : ''}. Arrows move it, Alt and arrows change its end.`}
              onPointerDown={e => press(e, p.id, 'move')} onKeyDown={e => key(e, p)}
            >
              <span className="wrTimelineEdge wrTimelineEdge--start" aria-hidden="true" onPointerDown={e => press(e, p.id, 'start')} />
              <span className="wrTimelineName">{p.title || 'Untitled phase'}</span>
              <span className="wrTimelineEdge wrTimelineEdge--end" aria-hidden="true" onPointerDown={e => press(e, p.id, 'end')} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DatesFold({ planner, setPlanner }: { planner: Planner; setPlanner: (p: Planner) => void }) {
  const [open, setOpen] = useState(false)
  const patchRest = (id: string, patch: Partial<Planner['restDays'][number]>) => setPlanner({ ...planner, restDays: planner.restDays.map(r => (r.id === id ? { ...r, ...patch } : r)) })
  const summary = [planner.timelineStart && planner.timelineEnd ? `${dayLabel(planner.timelineStart)} to ${dayLabel(planner.timelineEnd)}` : '', planner.restDays.length ? `${planner.restDays.length} rest` : ''].filter(Boolean).join(' · ') || 'None'
  return (
    <Fold title="Project dates and rest days" summary={summary} open={open} onToggle={() => setOpen(o => !o)}>
      <div className="wrTaskGrid">
        <label>Project starts<input className="wrField" type="date" aria-label="Project starts" value={planner.timelineStart ?? ''} onChange={e => setPlanner({ ...planner, timelineStart: e.target.value || null })} /></label>
        <label>Project ends<input className="wrField" type="date" aria-label="Project ends" min={planner.timelineStart ?? undefined} value={planner.timelineEnd ?? ''} onChange={e => setPlanner({ ...planner, timelineEnd: e.target.value || null })} /></label>
      </div>
      <span className="wrLabel">Rest days</span>
      {planner.restDays.map(r => (
        <div className="wrPlanMilestone" key={r.id}>
          <input className="wrField" aria-label="Rest days name" placeholder="Holiday" value={r.label} onChange={e => patchRest(r.id, { label: e.target.value })} />
          <input className="wrField" type="date" aria-label={`${r.label || 'Rest days'} start`} value={r.start} onChange={e => e.target.value && patchRest(r.id, { start: e.target.value, end: r.end < e.target.value ? e.target.value : r.end })} />
          <input className="wrField" type="date" aria-label={`${r.label || 'Rest days'} end`} min={r.start} value={r.end} onChange={e => e.target.value && patchRest(r.id, { end: e.target.value })} />
          <IconBtn Icon={TrashIcon} label={`Delete ${r.label || 'the rest days'}`} onClick={() => setPlanner({ ...planner, restDays: planner.restDays.filter(x => x.id !== r.id) })} />
        </div>
      ))}
      <IconBtn Icon={PlusIcon} label="Add rest days" onClick={() => { const d = planner.timelineStart ?? new Date().toISOString().slice(0, 10); setPlanner({ ...planner, restDays: [...planner.restDays, { id: newId('rest'), start: d, end: d, label: '' }] }) }} />
    </Fold>
  )
}

export function PhaseTimeline({ planner, setPlanner, today }: { planner: Planner; setPlanner: (p: Planner) => void; today: string }) {
  const range = timelineRange(planner)
  return (
    <section className="wrPlanTimeline" aria-label="Timeline">
      {range ? <Chart planner={planner} setPlanner={setPlanner} today={today} range={range} /> : <p className="wrHint">Give a phase dates, or the project a start and an end, to see the timeline.</p>}
      <DatesFold planner={planner} setPlanner={setPlanner} />
    </section>
  )
}
