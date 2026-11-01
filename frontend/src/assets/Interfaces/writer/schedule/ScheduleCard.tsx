import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ComponentType } from 'react'
import { FACET_LABEL, SLOTS_PER_DAY, slotTime, type ActivityEvent, type Facet, type PlanItem, type Planner, type Shift, type ShiftTemplate } from '../../../../lib/facets'
import { addDays } from '../../../../lib/projection'
import { addUnits, shiftOccurrences, type ShiftOccurrence } from '../../../../lib/recurrence'
import { editShift, type EditScope, type ShiftPatch } from '../../../../lib/shiftEdit'
import { dragResult, intervalStates, layoutLanes, rangeOf, shiftStatus, type DragMode, type ShiftStatus } from '../../../../lib/timeline'
import { MONTH_NAMES, rowLetters, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useStoredState } from '../shared'
import { DRAG_ITEM } from './Backlog'
import { newId } from './ids'
import { ShiftEditor, type TargetOption } from './ShiftEditor'
import { ICON_PX, IconBtn } from './IconBtn'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ListIcon, PlusIcon, TodayIcon, ViewDayIcon, ViewMonthIcon, ViewWeekIcon, ViewYearIcon, type IconProps } from '../../../icons'

// The Schedule: shifts on a day, a week or a month, or listed as an agenda, like a calendar. Drag across empty time to make a shift, drag a shift to
// move it or its edges to resize it, click it to edit it, right-click (or press and hold) for its menu. The backlog sits beside it.

export interface ScheduleOwner { id: string; label: string; projectId: string | null; planner: Planner; setPlanner: (p: Planner) => void }
export interface TicksApi { get: (ownerId: string, date: string) => string[]; load: (ownerId: string, date: string) => void; set: (ownerId: string, date: string, id: string, on: boolean) => void }
type CalView = 'day' | 'week' | 'month' | 'year' | 'agenda'
type Occ = ShiftOccurrence & { ownerId: string }
const VIEW_ICON: Record<CalView, ComponentType<IconProps>> = { day: ViewDayIcon, week: ViewWeekIcon, month: ViewMonthIcon, year: ViewYearIcon, agenda: ListIcon }
// A row is one 10-minute slot (SLOTS_PER_DAY a day), tall enough for its time label; an hour is six rows.
const SLOT_PX = 20
const HOUR_PX = SLOT_PX * 6
const STATUS_LABEL: Record<ShiftStatus, string> = { upcoming: 'Upcoming', inProgress: 'In progress', done: 'Done', partly: 'Partly done', missed: 'Missed', past: '' }
const dayName = (d: string, long = false): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: long ? 'long' : 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const monthTitle = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const sinceStart = (d: string, ws: WeekStart): number => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return ws === 'monday' ? (w + 6) % 7 : w }

export function ScheduleCard({
  owners, today, nowSlot, events, weekStart, targets, ticks,
}: { owners: ScheduleOwner[]; today: string; nowSlot: number; events: ActivityEvent[]; weekStart: WeekStart; targets: TargetOption[]; ticks: TicksApi }) {
  const [view, setView] = useStoredState<CalView>('scriblr.writer.schedule.calendarView', 'week')
  const [cursor, setCursor] = useState(today)
  const [editing, setEditing] = useState<{ ownerId: string; shift: Shift; occurrence: string; isNew: boolean } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; occ: Occ } | null>(null)
  const [pending, setPending] = useState<{ occ: Occ; patch: ShiftPatch } | null>(null)
  const [dragNew, setDragNew] = useState<{ date: string; a: number; b: number } | null>(null)
  const [dragShift, setDragShift] = useState<{ occ: Occ; mode: DragMode; y: number; dSlots: number; dDays: number } | null>(null)
  const cols = useRef<Record<string, HTMLDivElement | null>>({})
  const box = useRef<HTMLDivElement>(null)
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setCursor(today) }, [today])
  useEffect(() => { if (box.current && (view === 'day' || view === 'week')) box.current.scrollTop = 6 * HOUR_PX - 4 }, [view])

  const start = view === 'day' ? cursor : view === 'agenda' ? cursor : addDays(cursor, -sinceStart(cursor, weekStart))
  const monthFirst = `${cursor.slice(0, 8)}01`
  const from = view === 'year' ? `${cursor.slice(0, 4)}-01-01` : view === 'month' ? addDays(monthFirst, -sinceStart(monthFirst, weekStart)) : start
  const length = view === 'day' ? 1 : view === 'week' ? 7 : view === 'month' ? 42 : 14
  const to = view === 'year' ? `${cursor.slice(0, 4)}-12-31` : addDays(from, length - 1)
  const days = view === 'year' ? [] : Array.from({ length: view === 'month' ? 42 : view === 'agenda' ? 14 : length }, (_, i) => addDays(from, i))
  const occs: Occ[] = useMemo(
    () => owners.flatMap(o => shiftOccurrences(o.planner.shifts, o.planner.restDays, from, to).map(x => ({ ...x, ownerId: o.id }))),
    [owners, from, to],
  )
  const deadlines = useMemo(() => {
    const map = new Map<string, string[]>()
    const add = (d: string | null, label: string) => { if (d) map.set(d, [...(map.get(d) ?? []), label]) }
    for (const o of owners) {
      for (const g of o.planner.goals) add(g.deadline, `${FACET_LABEL[g.facet]} goal due`)
      add(o.planner.timelineStart, 'Timeline starts')
      add(o.planner.timelineEnd, 'Timeline ends')
    }
    return map
  }, [owners])
  const keptFrom = addDays(today, -14)
  const owner = (id: string) => owners.find(o => o.id === id) as ScheduleOwner
  const shiftOf = (o: Occ): Shift | undefined => owner(o.ownerId)?.planner.shifts.find(s => s.id === o.shiftId)

  const label = view === 'day' ? dayName(cursor, true) : view === 'month' ? monthTitle(cursor) : view === 'year' ? cursor.slice(0, 4) : `${dayName(from)} – ${dayName(to)}`
  const step = (dir: 1 | -1) => setCursor(c => (view === 'year' ? addUnits(c, dir * 12, 'month') : view === 'month' ? addUnits(c, dir, 'month') : addDays(c, dir * (view === 'day' ? 1 : 7))))

  // ---- editing ----
  const openNew = (date: string, startSlot = 48, endSlot = 60, template?: ShiftTemplate) => {
    const o = owners[0]
    if (!o) return
    const shift: Shift = {
      id: newId('shift'), title: template?.name ?? '', facet: (template?.facet ?? 'draft') as Facet, date, startSlot: template?.startSlot ?? startSlot, endSlot: template?.endSlot ?? endSlot,
      targetNodeId: null, targetTree: null, target: template?.target ?? null,
      recurrence: template?.days.length ? { kind: 'weekly', every: 1, unit: 'day', days: template.days, rangeMax: null, anchor: date, until: null } : null,
      pauses: [], skipped: [], overrides: {},
    }
    setEditing({ ownerId: o.id, shift, occurrence: date, isNew: true })
  }
  const openOcc = (occ: Occ) => {
    const s = shiftOf(occ)
    if (!s) return
    ticks.load(occ.ownerId, occ.date)
    setEditing({ ownerId: occ.ownerId, shift: { ...s, date: occ.date, startSlot: occ.startSlot, endSlot: occ.endSlot, title: occ.title }, occurrence: occ.date, isNew: false })
  }
  const commit = (ownerId: string, orig: Shift | null, occurrence: string, s: Shift, items: PlanItem[] | null, scope: EditScope) => {
    const o = owner(ownerId)
    let out: Shift[]
    if (!orig || !orig.recurrence) out = [s]
    else {
      const patch: ShiftPatch = { title: s.title, facet: s.facet, date: s.date, startSlot: s.startSlot, endSlot: s.endSlot, target: s.target, targetNodeId: s.targetNodeId, targetTree: s.targetTree }
      out = editShift(orig, occurrence, patch, scope, () => newId('shift'))
      if (scope !== 'this') {
        const i = scope === 'following' ? out.length - 1 : 0
        const base = out[i]
        out[i] = { ...base, pauses: s.pauses, recurrence: s.recurrence ? { ...s.recurrence, anchor: base.recurrence?.anchor ?? s.recurrence.anchor } : null }
      }
    }
    const rest = o.planner.shifts.filter(x => x.id !== (orig?.id ?? s.id))
    o.setPlanner({ ...o.planner, shifts: [...rest, ...out], items: items ?? o.planner.items })
    setEditing(null)
    setPending(null)
  }
  const remove = (ownerId: string, shift: Shift, occurrence: string, scope: EditScope) => {
    const o = owner(ownerId)
    let shifts = o.planner.shifts
    let items = o.planner.items
    const gone = () => { shifts = shifts.filter(x => x.id !== shift.id); items = items.map(i => (i.shiftId === shift.id ? { ...i, shiftId: null } : i)) }
    if (!shift.recurrence || scope === 'all' || (shift.recurrence && occurrence <= shift.recurrence.anchor && scope === 'following')) gone()
    else if (scope === 'this') shifts = shifts.map(x => (x.id === shift.id ? { ...x, skipped: [...x.skipped, occurrence] } : x))
    else shifts = shifts.map(x => (x.id === shift.id && x.recurrence ? { ...x, recurrence: { ...x.recurrence, until: addDays(occurrence, -1) } } : x))
    o.setPlanner({ ...o.planner, shifts, items })
    setEditing(null)
    setMenu(null)
  }
  const duplicate = (occ: Occ) => {
    const s = shiftOf(occ)
    if (!s) return
    const o = owner(occ.ownerId)
    o.setPlanner({ ...o.planner, shifts: [...o.planner.shifts, { ...s, id: newId('shift'), date: occ.date, startSlot: occ.startSlot, endSlot: occ.endSlot, recurrence: null, pauses: [], skipped: [], overrides: {}, title: occ.title }] })
    setMenu(null)
  }
  const saveTemplate = (ownerId: string, s: Shift) => {
    const o = owner(ownerId)
    o.setPlanner({ ...o.planner, templates: [...o.planner.templates, { id: newId('tpl'), name: s.title.trim() || FACET_LABEL[s.facet], facet: s.facet, startSlot: s.startSlot, endSlot: s.endSlot, target: s.target, days: s.recurrence?.days ?? [] }] })
  }
  const moveOrResize = (occ: Occ, patch: ShiftPatch) => {
    const s = shiftOf(occ)
    if (!s) return
    if (s.recurrence) setPending({ occ, patch })
    else commit(occ.ownerId, s, occ.date, { ...s, ...patch, date: patch.date ?? s.date } as Shift, null, 'this')
  }
  const dropItem = (e: DragEvent, occ: Occ) => {
    const raw = e.dataTransfer.getData(DRAG_ITEM)
    if (!raw) return
    e.preventDefault()
    const { ownerId, itemId } = JSON.parse(raw) as { ownerId: string; itemId: string }
    if (ownerId !== occ.ownerId) return
    const o = owner(ownerId)
    o.setPlanner({ ...o.planner, items: o.planner.items.map(i => (i.id === itemId ? { ...i, shiftId: occ.shiftId } : i)) })
  }

  // ---- dragging ----
  const slotAt = (date: string, clientY: number): number => {
    const el = cols.current[date]
    return el ? Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor((clientY - el.getBoundingClientRect().top) / SLOT_PX))) : 0
  }
  const dateAtX = (clientX: number, fallback: string): string => {
    for (const d of days) { const r = cols.current[d]?.getBoundingClientRect(); if (r && clientX >= r.left && clientX < r.right) return d }
    return fallback
  }
  useEffect(() => {
    if (!dragNew && !dragShift) return undefined
    const move = (e: PointerEvent) => {
      if (dragNew) setDragNew({ ...dragNew, b: slotAt(dragNew.date, e.clientY) })
      else if (dragShift) setDragShift({ ...dragShift, dSlots: Math.round((e.clientY - dragShift.y) / SLOT_PX), dDays: dragShift.mode === 'move' && view === 'week' ? Math.round((new Date(`${dateAtX(e.clientX, dragShift.occ.date)}T00:00:00Z`).getTime() - new Date(`${dragShift.occ.date}T00:00:00Z`).getTime()) / 86_400_000) : 0 })
    }
    const up = () => {
      if (dragNew) {
        const r = rangeOf(dragNew.a, dragNew.b)
        setDragNew(null)
        openNew(dragNew.date, r.startSlot, r.endSlot)
      } else if (dragShift) {
        const { occ, mode, dSlots, dDays } = dragShift
        setDragShift(null)
        if (dSlots === 0 && dDays === 0) { openOcc(occ); return }
        const r = dragResult(mode, occ.startSlot, occ.endSlot, dSlots)
        moveOrResize(occ, { ...r, ...(dDays ? { date: addDays(occ.date, dDays) } : {}) })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragNew, dragShift])

  const holdOpen = (e: ReactPointerEvent, occ: Occ) => {
    if (e.pointerType !== 'touch') return
    const { clientX, clientY } = e
    press.current = setTimeout(() => { setDragShift(null); setMenu({ x: clientX, y: clientY, occ }) }, 500)
  }
  const cancelHold = () => { if (press.current) clearTimeout(press.current); press.current = null }

  const block = (occ: Occ & { lane: number; lanes: number }) => {
    const live = dragShift && dragShift.occ.shiftId === occ.shiftId && dragShift.occ.date === occ.date ? dragShift : null
    const r = live ? dragResult(live.mode, occ.startSlot, occ.endSlot, live.dSlots) : { startSlot: occ.startSlot, endSlot: occ.endSlot }
    const states = intervalStates({ ...occ, ...r }, events, today, nowSlot, keptFrom)
    const status = shiftStatus(states, { ...occ, ...r }, today, nowSlot)
    return (
      <div
        key={`${occ.ownerId}${occ.shiftId}${occ.date}`}
        className={`wrSchedBlock wrSchedBlock--${status}${live ? ' wrSchedBlock--drag' : ''}`}
        style={{ top: r.startSlot * SLOT_PX, height: Math.max(SLOT_PX * 3, (r.endSlot - r.startSlot) * SLOT_PX - 1), left: `${(occ.lane / occ.lanes) * 100}%`, width: `${100 / occ.lanes}%`, ['--wr-bc' as string]: `var(--wr-f-${occ.facet})` }}
        role="button" tabIndex={0} aria-label={`${occ.title}, ${slotTime(r.startSlot)} to ${slotTime(r.endSlot)}${STATUS_LABEL[status] ? `, ${STATUS_LABEL[status]}` : ''}`}
        onKeyDown={e => { if (e.key === 'Enter') openOcc(occ) }}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, occ }) }}
        onPointerDown={e => { if (e.button !== 0) return; holdOpen(e, occ); setDragShift({ occ, mode: 'move', y: e.clientY, dSlots: 0, dDays: 0 }) }}
        onPointerUp={cancelHold} onPointerLeave={cancelHold}
        onDragOver={e => e.preventDefault()} onDrop={e => dropItem(e, occ)}
      >
        <span className="wrSchedHandle wrSchedHandle--top" onPointerDown={e => { e.stopPropagation(); setDragShift({ occ, mode: 'top', y: e.clientY, dSlots: 0, dDays: 0 }) }} />
        <b>{occ.title}</b>
        <small>{slotTime(r.startSlot)} – {slotTime(r.endSlot)}</small>
        {STATUS_LABEL[status] && <small>{STATUS_LABEL[status]}</small>}
        <span className="wrSchedIntervals" aria-hidden="true">{states.map((st, i) => <i key={i} className={`wrSchedInterval wrSchedInterval--${st}`} />)}</span>
        <span className="wrSchedHandle wrSchedHandle--bottom" onPointerDown={e => { e.stopPropagation(); setDragShift({ occ, mode: 'bottom', y: e.clientY, dSlots: 0, dDays: 0 }) }} />
      </div>
    )
  }

  const timeGrid = (
    <div className="wrSchedGridBox" ref={box} style={{ ['--slot' as string]: `${SLOT_PX}px` }}>
      <div className="wrSchedWeek" style={{ gridTemplateColumns: `max-content repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map(d => (
          <div key={d} className={`wrSchedDayHead${d === today ? ' wrSchedDayHead--today' : ''}`}>
            <button type="button" onClick={() => { setCursor(d); setView('day') }}>{dayName(d)}</button>
            {(deadlines.get(d) ?? []).map(t => <span key={t} className="wrSchedDeadline">{t}</span>)}
          </div>
        ))}
        <div className="wrSchedHours" aria-hidden="true">{Array.from({ length: SLOTS_PER_DAY }, (_, i) => <span key={i} className={i % 6 === 0 ? 'wrSchedHour' : undefined}>{slotTime(i)}</span>)}</div>
        {days.map(d => {
          const mine = layoutLanes(occs.filter(o => o.date === d))
          return (
            <div
              key={d} className="wrSchedCol" ref={el => { cols.current[d] = el }} data-date={d} style={{ height: SLOTS_PER_DAY * SLOT_PX }}
              onPointerDown={e => { if (e.target === e.currentTarget && e.button === 0) { const s = slotAt(d, e.clientY); setDragNew({ date: d, a: s, b: s }) } }}
            >
              {dragNew?.date === d && (() => { const r = rangeOf(dragNew.a, dragNew.b); return <div className="wrSchedGhost" style={{ top: r.startSlot * SLOT_PX, height: (r.endSlot - r.startSlot) * SLOT_PX }} /> })()}
              {mine.map(block)}
              {d === today && <div className="wrSchedNow" style={{ top: nowSlot * SLOT_PX }} aria-hidden="true" />}
            </div>
          )
        })}
      </div>
    </div>
  )

  const monthGrid = (
    <div className="wrSchedMonth" role="grid" aria-label={monthTitle(cursor)}>
      {days.map(d => {
        const mine = occs.filter(o => o.date === d)
        return (
          <button key={d} type="button" role="gridcell" className={`wrSchedMonthDay${d === today ? ' wrSchedMonthDay--today' : ''}${d.slice(0, 7) !== cursor.slice(0, 7) ? ' wrSchedMonthDay--out' : ''}`} onClick={() => { setCursor(d); setView('day') }}>
            <b>{Number(d.slice(8))}</b>
            {(deadlines.get(d) ?? []).map(t => <span key={t} className="wrSchedDeadline">{t}</span>)}
            {mine.slice(0, 3).map(o => <span key={o.shiftId} className="wrSchedMonthShift"><i className="wrSchedDot" style={{ background: `var(--wr-f-${o.facet})` }} />{o.title}</span>)}
            {mine.length > 3 && <span className="wrMuted">+{mine.length - 3} more</span>}
          </button>
        )
      })}
    </div>
  )

  // The year: a small calendar for each month, a day shaded in the colour of its first shift (and underlined at the foot when it has more, and marked when a goal
  // or the timeline is due), a click opening that day.
  const yearGrid = (() => {
    const year = cursor.slice(0, 4)
    const byDay = new Map<string, Occ[]>()
    for (const o of occs) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o])
    return (
      <div className="wrSchedYear" role="grid" aria-label={year}>
        {Array.from({ length: 12 }, (_, m) => {
          const first = `${year}-${String(m + 1).padStart(2, '0')}-01`
          const count = new Date(Date.UTC(Number(year), m + 1, 0)).getUTCDate()
          return (
            <section key={first} className="wrSchedYearMonth" aria-label={monthTitle(first)}>
              <h4 className="wrSchedYearName">{MONTH_NAMES[m].toUpperCase()}</h4>
              <div className="wrSchedYearDays">
                {rowLetters(weekStart).map((l, i) => <span key={i} className="wrSchedYearLetter" aria-hidden="true">{l}</span>)}
                {Array.from({ length: sinceStart(first, weekStart) }, (_, i) => <i key={`b${i}`} />)}
                {Array.from({ length: count }, (_, i) => {
                  const d = addDays(first, i)
                  const mine = byDay.get(d) ?? []
                  const due = deadlines.get(d) ?? []
                  const cls = ['wrSchedYearDay', mine.length > 0 ? 'wrSchedYearDay--has' : '', mine.length > 1 ? 'wrSchedYearDay--many' : '', due.length > 0 ? 'wrSchedYearDay--due' : '', d === today ? 'wrSchedYearDay--today' : ''].filter(Boolean).join(' ')
                  return (
                    <button
                      key={d} type="button" role="gridcell" className={cls} style={mine[0] ? { ['--wr-bc' as string]: `var(--wr-f-${mine[0].facet})` } : undefined}
                      title={`${dayName(d, true)}${[...mine.map(o => o.title), ...due].map(t => ` · ${t}`).join('')}`} onClick={() => { setCursor(d); setView('day') }}
                    >{i + 1}</button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    )
  })()

  const agenda = (
    <div className="wrSchedAgenda">
      {days.map(d => {
        const mine = occs.filter(o => o.date === d)
        if (mine.length === 0 && !(deadlines.get(d) ?? []).length) return null
        return (
          <div key={d} className="wrSchedAgendaDay">
            <h4 className="wrSchedSub">{dayName(d, true)}{d === today ? ' · Today' : ''}</h4>
            {(deadlines.get(d) ?? []).map(t => <div key={t} className="wrSchedDeadline">{t}</div>)}
            {mine.map(o => {
              const s = shiftOf(o)
              const items = owner(o.ownerId).planner.items.filter(i => i.shiftId === o.shiftId)
              return (
                <button type="button" key={`${o.shiftId}${o.date}`} className="wrSchedAgendaRow" onClick={() => openOcc(o)}>
                  <i className="wrSchedDot" style={{ background: `var(--wr-f-${o.facet})` }} />
                  <span><b>{o.title}</b> <small>{slotTime(o.startSlot)} – {slotTime(o.endSlot)}{s?.target ? ` · aim ${s.target}` : ''}</small>{items.length > 0 && <small>{items.map(i => i.label).join(' · ')}</small>}</span>
                </button>
              )
            })}
          </div>
        )
      })}
      {occs.length === 0 && <p className="wrMuted">Nothing scheduled in these two weeks.</p>}
    </div>
  )

  const editingOwner = editing ? owner(editing.ownerId) : null
  return (
    <div className="wrSchedCard wrSchedSchedule">
      <div className="wrSchedHead">
        <IconBtn Icon={TodayIcon} iconProps={{ day: Number(today.slice(8)) }} label="Today" onClick={() => setCursor(today)} />
        <IconBtn Icon={ChevronLeftIcon} label="Previous" onClick={() => step(-1)} />
        <IconBtn Icon={ChevronRightIcon} label="Next" onClick={() => step(1)} />
        <strong>{label}</strong>
        <span className="wrSchedSpacer" />
        <div className="wrSchedSeg" role="group" aria-label="Calendar view">
          {(['day', 'week', 'month', 'year', 'agenda'] as CalView[]).map(v => {
            const name = v[0].toUpperCase() + v.slice(1)
            const Icon = VIEW_ICON[v]
            return <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} aria-label={name} title={name} onClick={() => setView(v)}><Icon size={ICON_PX} /></button>
          })}
        </div>
        <IconBtn Icon={PlusIcon} label="New shift" className="wrSmallBtn wrSmallBtn--accent" onClick={() => openNew(view === 'day' ? cursor : today)} />
      </div>
      {owners.some(o => o.planner.templates.length > 0) && (
        <div className="wrSchedTools">
          <span className="wrMuted">From a template</span>
          {owners.flatMap(o => o.planner.templates).map(t => <button key={t.id} type="button" className="wrSmallBtn" onClick={() => openNew(today, 48, 60, t)}>{t.name}</button>)}
        </div>
      )}
      <div className="wrSchedBody"><div className="wrSchedMain">{view === 'month' ? monthGrid : view === 'year' ? yearGrid : view === 'agenda' ? agenda : timeGrid}</div></div>
      {editing && editingOwner && (
        <ShiftEditor
          key={`${editing.shift.id}${editing.occurrence}`}
          shift={editing.shift} occurrence={editing.occurrence} isNew={editing.isNew} items={editingOwner.planner.items} ticks={ticks.get(editing.ownerId, editing.occurrence)} targets={targets}
          onTick={(id, on) => ticks.set(editing.ownerId, editing.occurrence, id, on)}
          onSave={(s, items, scope) => commit(editing.ownerId, editing.isNew ? null : (editingOwner.planner.shifts.find(x => x.id === editing.shift.id) ?? null), editing.occurrence, s, items, scope)}
          onDelete={scope => remove(editing.ownerId, editingOwner.planner.shifts.find(x => x.id === editing.shift.id) ?? editing.shift, editing.occurrence, scope)}
          onTemplate={s => saveTemplate(editing.ownerId, s)} onClose={() => setEditing(null)}
        />
      )}
      {menu && (
        <div className="wrSchedMenu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerLeave={() => setMenu(null)}>
          <button type="button" role="menuitem" onClick={() => { openOcc(menu.occ); setMenu(null) }}>Edit</button>
          <button type="button" role="menuitem" onClick={() => duplicate(menu.occ)}>Duplicate</button>
          {menu.occ.repeats && <button type="button" role="menuitem" onClick={() => { const s = shiftOf(menu.occ); if (s) remove(menu.occ.ownerId, s, menu.occ.date, 'this') }}>Skip this day</button>}
          <button type="button" role="menuitem" onClick={() => { const s = shiftOf(menu.occ); if (s) remove(menu.occ.ownerId, s, menu.occ.date, 'all') }}>{menu.occ.repeats ? 'Delete all' : 'Delete'}</button>
        </div>
      )}
      {pending && (
        <div className="wrSchedScopeAsk" role="dialog" aria-label="Change which shifts?">
          <p>Change which shifts?</p>
          {([['this', 'This day'], ['following', 'This and following'], ['all', 'All of them']] as const).map(([scope, text]) => (
            <button key={scope} type="button" className="wrSmallBtn" onClick={() => { const s = shiftOf(pending.occ); if (s) commit(pending.occ.ownerId, s, pending.occ.date, { ...s, ...pending.patch, date: pending.patch.date ?? pending.occ.date } as Shift, null, scope) }}>{text}</button>
          ))}
          <IconBtn Icon={CloseIcon} label="Cancel" onClick={() => setPending(null)} />
        </div>
      )}
    </div>
  )
}
