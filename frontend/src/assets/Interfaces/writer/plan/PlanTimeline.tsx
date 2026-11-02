import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react'
import type { Phase, PhaseLevel, Planner } from '../../../../lib/facets'
import { newPass, passNumbers } from '../../../../lib/phaseKinds'
import { addPhase, deletePhase } from '../../../../lib/planActions'
import { projectPlan } from '../../../../lib/planProjection'
import type { GoalProgress } from '../../../../lib/projection'
import { phasesOffRows, phasesOnRow, type PlanRow } from '../../../../lib/planRows'
import { PX_PER_DAY, ZOOMS, ZOOM_LABEL, rulerMarks, timelineRange, type Zoom, pct } from '../../../../lib/planTimeline'
import { useWheelScrollX } from '../../../../lib/useWheelScrollX'
import { useStoredState } from '../shared'
import { newId } from '../schedule/ids'
import { IconBtn } from '../schedule/IconBtn'
import { BookFaceIcon, CalendarIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, FolderIcon, ListIcon, PageIcon, PlusIcon, TrashIcon, ViewDayIcon, ViewMonthIcon, ViewWeekIcon } from '../../../icons'
import { PhaseCard } from './PhaseCard'
import { PlanLane } from './PlanLane'
import { KindsPanel } from './KindsPanel'
import { ProjectionChip } from './ProjectionChip'
import { ProjectDates } from './ProjectDates'

// The Plan tile: the project's phases on rows, a row for the project, for each of its books and for their chapters. In the Dates view each row has a lane on a
// chart of days (zoom it to months, weeks or days) with a bar for each phase, over its cards; in the Sequence view the rows are just the cards in order, each with
// its sections. A phase is a card with milestone sections, which hold the work that reaches them. Everything is made at once, and nothing is dragged out of its row.

type View = 'dates' | 'sequence'
// A box of the chart that scrolls sideways (by the wheel too), in step with the others.
function PlanScroll({ track, follow, children }: { track: (el: HTMLElement | null) => void; follow: (e: UIEvent<HTMLElement>) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useWheelScrollX(ref)
  return <div className="wrPlanScroll" ref={el => { ref.current = el; track(el) }} onScroll={follow}>{children}</div>
}

const ZOOM_ICON = { month: ViewMonthIcon, week: ViewWeekIcon, day: ViewDayIcon }
const LEVEL_ICON: Record<PhaseLevel, typeof FolderIcon> = { project: FolderIcon, book: BookFaceIcon, chapter: PageIcon }

export function PlanTimeline({ ownerId, planner, setPlanner, today, metGoals, goals = [], rows }: {
  ownerId: string
  planner: Planner
  setPlanner: (p: Planner) => void
  today: string
  metGoals: ReadonlySet<string>
  // The goals with their progress, for the words left in a drafting phase.
  goals?: GoalProgress[]
  rows: PlanRow[]
}) {
  const [view, setView] = useStoredState<View>('scriblr.writer.plan.view', 'dates')
  const [zoom, setZoom] = useStoredState<Zoom>('scriblr.writer.plan.zoom', 'month')
  const [collapsed, setCollapsed] = useStoredState<string[]>('scriblr.writer.plan.rows.collapsed', [])
  const [everyChapter, setEveryChapter] = useStoredState<boolean>('scriblr.writer.plan.rows.everyChapter', false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const scrollers = useRef(new Set<HTMLElement>())
  const numbers = useMemo(() => passNumbers(planner), [planner])
  const range = timelineRange(planner)
  // When it would be done, from the work left and the time scheduled for it (the plan itself is not changed).
  const projection = useMemo(() => projectPlan(planner, rows, today), [planner, rows, today])
  const width = range ? Math.max(120, range.days * PX_PER_DAY[zoom]) : 0

  // Every lane scrolls with the ruler: one chart, a lane for each row.
  const track = (el: HTMLElement | null) => { if (el) scrollers.current.add(el) }
  const follow = (e: UIEvent<HTMLElement>) => {
    const left = e.currentTarget.scrollLeft
    scrollers.current.forEach(s => { if (s !== e.currentTarget && s.isConnected && s.scrollLeft !== left) s.scrollLeft = left })
  }
  useEffect(() => {
    if (!openId) return
    const el = document.querySelector<HTMLElement>(`[data-phase="${CSS.escape(openId)}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [openId])

  const shown = rows.filter(r => r.level !== 'chapter' || everyChapter || planner.phases.some(p => p.nodeId === r.nodeId && p.level === 'chapter'))
  const hidden = rows.length - shown.length
  const off = phasesOffRows(planner, rows)
  const toggleRow = (key: string) => setCollapsed(collapsed.includes(key) ? collapsed.filter(k => k !== key) : [...collapsed, key])
  const create = (row: PlanRow) => { const r = addPhase(planner, row, 'New phase', today, newId); setPlanner(r.planner); setOpenId(r.id) }
  const open = (id: string) => setOpenId(cur => (cur === id ? null : id))
  const pass = (row: PlanRow, kindId: string) => {
    const kind = planner.phaseKinds.find(k => k.id === kindId)
    if (kind) setPlanner(newPass(planner, kind, row, newId, today))
  }

  return (
    <div className="wrSchedCard wrPlan">
      <div className="wrSchedHead">
        <div className="wrChoice" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'dates'} className={view === 'dates' ? 'on' : ''} aria-label="Dates view" title="Dates: a chart of days over the cards" onClick={() => setView('dates')}><CalendarIcon size={20} /></button>
          <button type="button" aria-pressed={view === 'sequence'} className={view === 'sequence' ? 'on' : ''} aria-label="Sequence view" title="Sequence: the cards in order, with their milestones" onClick={() => setView('sequence')}><ListIcon size={20} /></button>
        </div>
        {view === 'dates' && (
          <div className="wrChoice" role="radiogroup" aria-label="Zoom">
            {ZOOMS.map(z => { const Icon = ZOOM_ICON[z]; return <button key={z} type="button" role="radio" aria-checked={zoom === z} className={zoom === z ? 'on' : ''} aria-label={ZOOM_LABEL[z]} title={ZOOM_LABEL[z]} onClick={() => setZoom(z)}><Icon size={20} /></button> })}
          </div>
        )}
        <span className="wrSchedSpacer" />
        <IconBtn Icon={PageIcon} label={everyChapter ? 'Show only the chapters with phases' : 'Show every chapter'} aria-pressed={everyChapter} className={`wrSmallBtn${everyChapter ? ' on' : ''}`} onClick={() => setEveryChapter(!everyChapter)} />
      </div>
      {message && (
        <p className="wrSchedNotice" role="status">
          <span>{message}</span>
          <IconBtn Icon={CloseIcon} label="Dismiss" onClick={() => setMessage(null)} />
        </p>
      )}
      {view === 'dates' && range && (
        <PlanScroll track={track} follow={follow}>
          <div className="wrTimelineRuler wrPlanRuler" aria-hidden="true" style={{ width }}>
            {rulerMarks(range, zoom).map(m => <span key={m.date} className={m.major ? 'major' : ''} style={{ left: `${pct(m.date, range)}%` }}>{m.label}</span>)}
          </div>
        </PlanScroll>
      )}
      {view === 'dates' && !range && <p className="wrHint">Give a phase dates, or the project a start and an end, to see the chart.</p>}
      {shown.map(row => {
        const phases = phasesOnRow(planner, row.key)
        const folded = collapsed.includes(row.key)
        const Level = LEVEL_ICON[row.level]
        return (
          <section key={row.key} className={`wrPlanRow wrPlanRow--${row.level}`} aria-label={`${row.title} row`} data-row={row.key}>
            <div className="wrPlanRowHead">
              <button type="button" className="wrPlanRowName" aria-expanded={!folded} aria-label={`${row.title} phases`} onClick={() => toggleRow(row.key)}>
                {folded ? <ChevronRightIcon size={20} /> : <ChevronDownIcon size={20} />}
                <Level size={20} />
                <b>{row.title}</b>
                <small>{phases.length === 0 ? 'no phases' : `${phases.length} ${phases.length === 1 ? 'phase' : 'phases'}`}</small>
              </button>
              <ProjectionChip p={projection.get(row.key)?.projection} />
              {planner.phaseKinds.length > 0 && (
                <select className="wrField wrPassPick" aria-label={`New pass on ${row.title}`} value="" onChange={e => { if (e.target.value) pass(row, e.target.value) }}>
                  <option value="">New pass of…</option>
                  {planner.phaseKinds.map(k => <option key={k.id} value={k.id}>{k.title || 'Untitled kind'}</option>)}
                </select>
              )}
              <IconBtn Icon={PlusIcon} label={`New phase on ${row.title}`} className="wrSmallBtn wrSmallBtn--accent" onClick={() => create(row)} />
            </div>
            {!folded && (
              <>
                {view === 'dates' && range && phases.length > 0 && (
                  <PlanScroll track={track} follow={follow}>
                    <PlanLane planner={planner} setPlanner={setPlanner} today={today} phases={phases} range={range} width={width} rowTitle={row.title} onOpen={open} projected={projection.get(row.key)} />
                  </PlanScroll>
                )}
                {phases.map(ph => (
                  <PhaseCard
                    key={ph.id} planner={planner} setPlanner={setPlanner} today={today} phase={ph} metGoals={metGoals} rowKey={row.key} rows={rows} ownerId={ownerId}
                    projection={projection.get(row.key)?.phases.find(x => x.phase.id === ph.id)} goals={goals} passNo={numbers.get(ph.id)} open={openId === ph.id} onOpen={o => setOpenId(o ? ph.id : null)} showSections={view === 'sequence'} onRefuse={setMessage}
                  />
                ))}
              </>
            )}
          </section>
        )
      })}
      {planner.phases.length === 0 && <p className="wrMuted">No phases yet. A phase is a stage of the project, defined by the result it builds to; its milestones are reached by the work placed in them. Add one to a row with the plus.</p>}
      {hidden > 0 && !everyChapter && <p className="wrHint">{hidden} {hidden === 1 ? 'chapter with no phases is' : 'chapters with no phases are'} not shown. Press the page icon to show them, and give one a phase.</p>}
      {off.length > 0 && (
        <section className="wrPlanLoose" aria-label="Phases on no row">
          <h4 className="wrSchedSub">On a book or chapter that is gone · {off.length}</h4>
          {off.map((p: Phase) => (
            <div className="wrPlanMilestone" key={p.id}>
              <b>{p.title || 'Untitled phase'}</b>
              <small className="wrMuted">{p.level}</small>
              <IconBtn Icon={TrashIcon} label={`Delete ${p.title || 'the phase'}`} onClick={() => setPlanner(deletePhase(planner, p.id, today))} />
            </div>
          ))}
        </section>
      )}
      <KindsPanel planner={planner} setPlanner={setPlanner} today={today} />
      <ProjectDates planner={planner} setPlanner={setPlanner} />
    </div>
  )
}
