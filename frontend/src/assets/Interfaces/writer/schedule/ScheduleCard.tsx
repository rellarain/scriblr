import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ComponentType } from 'react'
import { FACET_LABEL, SLOTS_PER_DAY, slotTime, type ActivityEvent, type Facet, type PlanItem, type Planner, type Shift, type ShiftTemplate } from '../../../../lib/facets'
import { addDays } from '../../../../lib/projection'
import { addUnits, shiftOccurrences, type ShiftOccurrence } from '../../../../lib/recurrence'
import { diffPatch, editShift, shiftForTask, type EditScope, type ShiftPatch } from '../../../../lib/shiftEdit'
import { dragResult, intervalStates, layoutLanes, rangeOf, shiftStatus, type DragMode, type ShiftStatus } from '../../../../lib/timeline'
import { MONTH_NAMES, rowLetters, type WeekStart } from '../../../../lib/scheduleCalendar'
import { useStoredState } from '../shared'
import { DRAG_ITEM } from './Backlog'
import { newId } from './ids'
import { ShiftPanel, type TargetOption } from './ShiftPanel'
import { useElementWidth } from '../useElementWidth'
import { ICON_PX, IconBtn } from './IconBtn'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, CopyIcon, ListIcon, PlusIcon, TodayIcon, TrashIcon, ViewDayIcon, ViewMonthIcon, ViewWeekIcon, ViewYearIcon, type IconProps } from '../../../icons'

// The Schedule: shifts on a day, a week or a month, or listed as an agenda, like a calendar. Drag across empty time to make a shift, drag a shift to
// move it or its edges to resize it, click it to edit it, right-click (or press and hold) for its menu. The backlog sits beside it.

export interface ScheduleOwner { id: string; label: string; projectId: string | null; planner: Planner; setPlanner: (p: Planner) => void }
export interface TicksApi { get: (ownerId: string, date: string) => string[]; loaded: (ownerId: string, date: string) => boolean; load: (ownerId: string, date: string) => void; set: (ownerId: string, date: string, id: string, on: boolean) => void }
type CalView = 'day' | 'week' | 'month' | 'year' | 'agenda'
interface Editing { ownerId: string; orig: Shift; base: Shift; draft: Shift; occurrence: string; isNew: boolean; scope: EditScope; tailId: string }
type Occ = ShiftOccurrence & { ownerId: string }
const VIEW_ICON: Record<CalView, ComponentType<IconProps>> = { day: ViewDayIcon, week: ViewWeekIcon, month: ViewMonthIcon, year: ViewYearIcon, agenda: ListIcon }
// A row is one 10-minute slot (SLOTS_PER_DAY a day), tall enough for its time label; an hour is six rows.
const SLOT_PX = 20
const NARROW_PX = 480
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
  const [editing, setEditing] = useState<Editing | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  // Below this width the Planner lists its days as an agenda (the view that is kept is not changed).
  const [wrap, width] = useElementWidth<HTMLDivElement>([NARROW_PX])
  const narrow = width === 0
  const [menu, setMenu] = useState<{ x: number; y: number; occ: Occ } | null>(null)
  const [pending, setPending] = useState<{ occ: Occ; patch: ShiftPatch } | null>(null)
  const [dragNew, setDragNew] = useState<{ date: string; a: number; b: number } | null>(null)
  const [dragShift, setDragShift] = useState<{ occ: Occ; mode: DragMode; y: number; dSlots: number; dDays: number } | null>(null)
  const cols = useRef<Record<string, HTMLDivElement | null>>({})
  const box = useRef<HTMLDivElement>(null)
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { setCursor(today) }, [today])
  const shown: CalView = narrow && (view === 'day' || view === 'week') ? 'agenda' : view
  useEffect(() => { if (box.current && (shown === 'day' || shown === 'week')) box.current.scrollTop = 6 * HOUR_PX - 4 }, [shown])

  const start = shown === 'day' ? cursor : shown === 'agenda' ? cursor : addDays(cursor, -sinceStart(cursor, weekStart))
  const monthFirst = `${cursor.slice(0, 8)}01`
  const from = shown === 'year' ? `${cursor.slice(0, 4)}-01-01` : shown === 'month' ? addDays(monthFirst, -sinceStart(monthFirst, weekStart)) : start
  const length = shown === 'day' ? 1 : shown === 'week' ? 7 : shown === 'month' ? 42 : 14
  const to = shown === 'year' ? `${cursor.slice(0, 4)}-12-31` : addDays(from, length - 1)
  const days = shown === 'year' ? [] : Array.from({ length: shown === 'month' ? 42 : shown === 'agenda' ? 14 : length }, (_, i) => addDays(from, i))
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

  const label = shown === 'day' ? dayName(cursor, true) : shown === 'month' ? monthTitle(cursor) : shown === 'year' ? cursor.slice(0, 4) : `${dayName(from)} – ${dayName(to)}`
  const step = (dir: 1 | -1) => setCursor(c => (shown === 'year' ? addUnits(c, dir * 12, 'month') : shown === 'month' ? addUnits(c, dir, 'month') : addDays(c, dir * (view === 'day' ? 1 : 7))))

  // ---- editing ----
  // What the side panel is changing: the shift as it was (`orig`), as the day was opened (`base`) and as it is now (`draft`), for the days `scope` says. Every
  // change is applied again from `orig`, so the scope can be changed after a field and a split into "this and following" is never made twice (`tailId` is the
  // id the second half of a split takes).
  const blankNew = editing?.isNew && !editing.draft.title.trim() ? editing.orig.id : null
  const applyEdit = (e: Editing, dropId: string | null = null) => {
    const o = owner(e.ownerId)
    let out: Shift[]
    if (!e.orig.recurrence) out = [e.draft]
    else {
      out = editShift(e.orig, e.occurrence, diffPatch(e.base, e.draft), e.scope, () => e.tailId)
      // How it repeats and its pauses are the pattern's: they go to the whole of what the scope covers (a day's own change is only a title and a time).
      if (e.scope !== 'this') {
        const i = e.scope === 'following' ? out.length - 1 : 0
        const first = out[i]
        out[i] = { ...first, pauses: e.draft.pauses, recurrence: e.draft.recurrence ? { ...e.draft.recurrence, anchor: first.recurrence?.anchor ?? e.draft.recurrence.anchor } : null }
      }
    }
    const rest = o.planner.shifts.filter(x => x.id !== e.orig.id && x.id !== e.tailId && x.id !== dropId)
    o.setPlanner({ ...o.planner, shifts: [...rest, ...out] })
  }
  // A shift made at the drag and never given a name is taken away again when the panel is closed (or another shift is opened).
  const dropBlank = () => {
    if (!editing || !blankNew) return
    const o = owner(editing.ownerId)
    o.setPlanner({ ...o.planner, shifts: o.planner.shifts.filter(x => x.id !== blankNew), items: o.planner.items.map(i => (i.shiftId === blankNew ? { ...i, shiftId: null } : i)) })
  }
  const closeEditing = () => { dropBlank(); setEditing(null) }
  const openNew = (date: string, startSlot = 48, endSlot = 60, template?: ShiftTemplate) => {
    const o = owners[0]
    if (!o) return
    const shift: Shift = {
      id: newId('shift'), title: template?.name ?? '', facet: (template?.facet ?? 'draft') as Facet, date, startSlot: template?.startSlot ?? startSlot, endSlot: template?.endSlot ?? endSlot,
      targetNodeId: null, targetTree: null, target: template?.target ?? null,
      recurrence: template?.days.length ? { kind: 'weekly', every: 1, unit: 'day', days: template.days, rangeMax: null, anchor: date, until: null } : null,
      pauses: [], skipped: [], overrides: {},
    }
    // The shift is made now (the panel changes it as it goes): what it starts as is a one-off, and a template's pattern is the first change to it.
    const plain: Shift = { ...shift, recurrence: null, pauses: [] }
    const next: Editing = { ownerId: o.id, orig: plain, base: plain, draft: shift, occurrence: date, isNew: true, scope: 'all', tailId: newId('shift') }
    setEditing(next)
    applyEdit(next, blankNew)
  }
  const openOcc = (occ: Occ) => {
    const s = shiftOf(occ)
    if (!s) return
    ticks.load(occ.ownerId, occ.date)
    const base: Shift = { ...s, date: occ.date, startSlot: occ.startSlot, endSlot: occ.endSlot, title: occ.title }
    dropBlank()
    setEditing({ ownerId: occ.ownerId, orig: s, base, draft: base, occurrence: occ.date, isNew: false, scope: 'this', tailId: newId('shift') })
  }
  const change = (patch: Partial<Shift>) => {
    if (!editing) return
    const draft = { ...editing.draft, ...patch }
    // A pattern never starts after the day it is set on.
    if (patch.date && draft.recurrence && !editing.orig.recurrence && draft.recurrence.anchor > patch.date) draft.recurrence = { ...draft.recurrence, anchor: patch.date }
    const next = { ...editing, draft }
    setEditing(next)
    applyEdit(next)
  }
  const changeScope = (scope: EditScope) => {
    if (!editing) return
    const next = { ...editing, scope }
    setEditing(next)
    applyEdit(next)
  }
  const changeItems = (items: PlanItem[]) => { if (editing) { const o = owner(editing.ownerId); o.setPlanner({ ...o.planner, items }) } }
  // A change made to a shift outside the panel (a drag, a new name on its block) makes the panel's picture of it stale: the panel closes.
  const patchShift = (ownerId: string, s: Shift, occurrence: string, patch: ShiftPatch, scope: EditScope) => {
    const o = owner(ownerId)
    const out = editShift(s, occurrence, patch, scope, () => newId('shift'))
    o.setPlanner({ ...o.planner, shifts: [...o.planner.shifts.filter(x => x.id !== s.id), ...out] })
    if (editing?.orig.id === s.id) setEditing(null)
    setPending(null)
  }
  const remove = (ownerId: string, shift: Shift, occurrence: string, scope: EditScope, alsoGone: string[] = []) => {
    const o = owner(ownerId)
    let shifts = o.planner.shifts.filter(x => !alsoGone.includes(x.id))
    let items = o.planner.items
    const gone = () => { shifts = shifts.filter(x => x.id !== shift.id); items = items.map(i => (i.shiftId === shift.id ? { ...i, shiftId: null } : i)) }
    if (!shift.recurrence || scope === 'all' || (shift.recurrence && occurrence <= shift.recurrence.anchor && scope === 'following')) gone()
    else if (scope === 'this') shifts = shifts.map(x => (x.id === shift.id ? { ...x, skipped: [...x.skipped, occurrence] } : x))
    else shifts = shifts.map(x => (x.id === shift.id && x.recurrence ? { ...x, recurrence: { ...x.recurrence, until: addDays(occurrence, -1) } } : x))
    o.setPlanner({ ...o.planner, shifts, items })
    if (editing?.orig.id === shift.id) setEditing(null)
    setMenu(null)
  }
  const deleteEditing = () => {
    if (!editing) return
    const current = owner(editing.ownerId).planner.shifts.find(x => x.id === editing.orig.id) ?? editing.orig
    // Put back what the panel has done to the pattern first: what is removed is the shift as it was.
    remove(editing.ownerId, editing.isNew ? current : editing.orig, editing.occurrence, editing.isNew ? 'all' : editing.scope, [editing.tailId])
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
    else patchShift(occ.ownerId, s, occ.date, patch, 'this')
  }
  const rename = (occ: Occ, title: string) => {
    setRenaming(null)
    const s = shiftOf(occ)
    const next = title.trim()
    if (s && next && next !== occ.title) patchShift(occ.ownerId, s, occ.date, { title: next }, 'this')
  }
  // ---- dropping a task from the Backlog ----
  const droppedItem = (e: DragEvent): { owner: ScheduleOwner; item: PlanItem } | null => {
    const raw = e.dataTransfer?.getData(DRAG_ITEM)
    if (!raw) return null
    const { ownerId, itemId } = JSON.parse(raw) as { ownerId: string; itemId: string }
    const o = owners.find(x => x.id === ownerId)
    const item = o?.planner.items.find(i => i.id === itemId)
    return o && item ? { owner: o, item } : null
  }
  // On a shift: the task goes on it.
  const dropItem = (e: DragEvent, occ: Occ) => {
    const hit = droppedItem(e)
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    if (hit.owner.id !== occ.ownerId) return
    hit.owner.setPlanner({ ...hit.owner.planner, items: hit.owner.planner.items.map(i => (i.id === hit.item.id ? { ...i, shiftId: occ.shiftId } : i)) })
  }
  // On an empty slot of a day: a shift is made for the task (its facet and node, as long as its estimate), starting where it was dropped.
  const dropOnSlot = (e: DragEvent, date: string) => {
    const hit = droppedItem(e)
    if (!hit) return
    e.preventDefault()
    const shift = shiftForTask(hit.item, newId('shift'), date, slotAt(date, e.clientY))
    hit.owner.setPlanner({ ...hit.owner.planner, shifts: [...hit.owner.planner.shifts, shift], items: hit.owner.planner.items.map(i => (i.id === hit.item.id ? { ...i, shiftId: shift.id } : i)) })
  }
  // On a day of the month or the year: that day is the task's due day.
  const dropOnDay = (e: DragEvent, date: string) => {
    const hit = droppedItem(e)
    if (!hit) return
    e.preventDefault()
    hit.owner.setPlanner({ ...hit.owner.planner, items: hit.owner.planner.items.map(i => (i.id === hit.item.id ? { ...i, dueDate: date } : i)) })
  }
  const dropTarget = { onDragOver: (e: DragEvent) => e.preventDefault() }

  // ---- dragging ----
  const slotAt = (date: string, clientY: number): number => {
    const el = cols.current[date]
    return el ? Math.max(0, Math.min(SLOTS_PER_DAY - 1, Math.floor(((Number.isFinite(clientY) ? clientY : 0) - el.getBoundingClientRect().top) / SLOT_PX))) : 0
  }
  const dateAtX = (clientX: number, fallback: string): string => {
    for (const d of days) { const r = cols.current[d]?.getBoundingClientRect(); if (r && clientX >= r.left && clientX < r.right) return d }
    return fallback
  }
  useEffect(() => {
    if (!dragNew && !dragShift) return undefined
    const move = (e: PointerEvent) => {
      if (dragNew) setDragNew({ ...dragNew, b: slotAt(dragNew.date, e.clientY) })
      else if (dragShift) setDragShift({ ...dragShift, dSlots: Math.round((e.clientY - dragShift.y) / SLOT_PX), dDays: dragShift.mode === 'move' && shown === 'week' ? Math.round((new Date(`${dateAtX(e.clientX, dragShift.occ.date)}T00:00:00Z`).getTime() - new Date(`${dragShift.occ.date}T00:00:00Z`).getTime()) / 86_400_000) : 0 })
    }
    const up = () => {
      if (dragNew) {
        const r = rangeOf(dragNew.a, dragNew.b)
        setDragNew(null)
        // A press that did not move on empty time only closes the panel, when one is open.
        if (dragNew.a === dragNew.b && editing) { closeEditing(); return }
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
    const key = `${occ.ownerId}${occ.shiftId}${occ.date}`
    const name = occ.title || 'New shift'
    const selected = editing !== null && editing.ownerId === occ.ownerId && editing.occurrence === occ.date && (occ.shiftId === editing.orig.id || occ.shiftId === editing.tailId)
    const stop = { onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() }
    return (
      <Fragment key={key}>
        <div
          className={`wrSchedBlock wrSchedBlock--${status}${live ? ' wrSchedBlock--drag' : ''}${selected ? ' wrSchedBlock--selected' : ''}`}
          style={{ top: r.startSlot * SLOT_PX, height: Math.max(SLOT_PX * 3, (r.endSlot - r.startSlot) * SLOT_PX - 1), left: `${(occ.lane / occ.lanes) * 100}%`, width: `${100 / occ.lanes}%`, ['--wr-bc' as string]: `var(--wr-f-${occ.facet})` }}
          role="button" tabIndex={0} aria-label={`${name}, ${slotTime(r.startSlot)} to ${slotTime(r.endSlot)}${STATUS_LABEL[status] ? `, ${STATUS_LABEL[status]}` : ''}`} aria-pressed={selected}
          onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) openOcc(occ); if (e.key === 'F2' && e.target === e.currentTarget) setRenaming(key) }}
          onDoubleClick={() => setRenaming(key)}
          onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, occ }) }}
          onPointerDown={e => { if (e.button !== 0) return; holdOpen(e, occ); setDragShift({ occ, mode: 'move', y: e.clientY, dSlots: 0, dDays: 0 }) }}
          onPointerUp={cancelHold} onPointerLeave={cancelHold}
          onDragOver={e => e.preventDefault()} onDrop={e => dropItem(e, occ)}
        >
          <span className="wrSchedHandle wrSchedHandle--top" onPointerDown={e => { e.stopPropagation(); setDragShift({ occ, mode: 'top', y: e.clientY, dSlots: 0, dDays: 0 }) }} />
          {renaming === key
            ? (
              <input
                className="wrField wrSchedRename" aria-label="Shift title" defaultValue={occ.title} autoFocus {...stop}
                onFocus={e => e.currentTarget.select()} onBlur={e => rename(occ, e.currentTarget.value)}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = occ.title; setRenaming(null) } }}
              />
            )
            : <b>{name}</b>}
          <small>{slotTime(r.startSlot)} – {slotTime(r.endSlot)}</small>
          {STATUS_LABEL[status] && <small>{STATUS_LABEL[status]}</small>}
          <span className="wrSchedIntervals" aria-hidden="true">{states.map((st, i) => <i key={i} className={`wrSchedInterval wrSchedInterval--${st}`} />)}</span>
          <span className="wrSchedHandle wrSchedHandle--bottom" onPointerDown={e => { e.stopPropagation(); setDragShift({ occ, mode: 'bottom', y: e.clientY, dSlots: 0, dDays: 0 }) }} />
        </div>
        {!live && (
          <div className="wrSchedBlockBar" style={{ top: r.startSlot * SLOT_PX + 2, left: `${((occ.lane + 1) / occ.lanes) * 100}%` }}>
            <IconBtn Icon={CopyIcon} label={`Duplicate ${name}`} {...stop} onClick={() => duplicate(occ)} />
            <IconBtn
              Icon={TrashIcon} label={occ.repeats ? `Skip ${name} on this day` : `Delete ${name}`} {...stop}
              onClick={() => { const s = shiftOf(occ); if (s) remove(occ.ownerId, s, occ.date, occ.repeats ? 'this' : 'all') }}
            />
          </div>
        )}
      </Fragment>
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
              key={d} className="wrSchedCol" ref={el => { cols.current[d] = el }} data-date={d} style={{ height: SLOTS_PER_DAY * SLOT_PX }} {...dropTarget} onDrop={e => dropOnSlot(e, d)}
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
          <button key={d} type="button" role="gridcell" className={`wrSchedMonthDay${d === today ? ' wrSchedMonthDay--today' : ''}${d.slice(0, 7) !== cursor.slice(0, 7) ? ' wrSchedMonthDay--out' : ''}`} {...dropTarget} onDrop={e => dropOnDay(e, d)} onClick={() => { setCursor(d); setView('day') }}>
            <b>{Number(d.slice(8))}</b>
            {(deadlines.get(d) ?? []).map(t => <span key={t} className="wrSchedDeadline">{t}</span>)}
            {mine.slice(0, 3).map(o => <span key={o.shiftId} className="wrSchedMonthShift"><i className="wrSchedDot" style={{ background: `var(--wr-f-${o.facet})` }} />{o.title || 'New shift'}</span>)}
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
                      title={`${dayName(d, true)}${[...mine.map(o => o.title), ...due].map(t => ` · ${t}`).join('')}`} {...dropTarget} onDrop={e => dropOnDay(e, d)} onClick={() => { setCursor(d); setView('day') }}
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
                  <span><b>{o.title || 'New shift'}</b> <small>{slotTime(o.startSlot)} – {slotTime(o.endSlot)}{s?.target ? ` · aim ${s.target}` : ''}</small>{items.length > 0 && <small>{items.map(i => i.label).join(' · ')}</small>}</span>
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
    <div className={`wrSchedCard wrSchedSchedule${narrow ? ' wrSchedSchedule--narrow' : ''}`} ref={wrap}>
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
      <div className="wrSchedBody">
        {!(narrow && editing) && <div className="wrSchedMain">{shown === 'month' ? monthGrid : shown === 'year' ? yearGrid : shown === 'agenda' ? agenda : timeGrid}</div>}
        {editing && editingOwner && (
          <ShiftPanel
            key={`${editing.orig.id}${editing.occurrence}`}
            shift={editing.draft} itemsShiftId={editing.orig.id} occurrence={editing.occurrence} isNew={editing.isNew} repeating={Boolean(editing.orig.recurrence) && !editing.isNew}
            scope={editing.scope} onScope={changeScope} items={editingOwner.planner.items} ticks={ticks.get(editing.ownerId, editing.occurrence)} targets={targets}
            onChange={change} onItems={changeItems} onTick={(id, on) => ticks.set(editing.ownerId, editing.occurrence, id, on)}
            onDelete={deleteEditing} onTemplate={() => saveTemplate(editing.ownerId, editing.draft)} onClose={closeEditing}
          />
        )}
      </div>
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
            <button key={scope} type="button" className="wrSmallBtn" onClick={() => { const s = shiftOf(pending.occ); if (s) patchShift(pending.occ.ownerId, s, pending.occ.date, pending.patch, scope) }}>{text}</button>
          ))}
          <IconBtn Icon={CloseIcon} label="Cancel" onClick={() => setPending(null)} />
        </div>
      )}
    </div>
  )
}
