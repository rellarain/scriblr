import { Fragment, useMemo } from 'react'
import type { OutlineNode } from '../../../../api/types'
import {
  axisAt, bookEstimate, durationPhrase, needsPhrase, PACE_WEEKS, paceLine, planParts, primaryUnit, rangePhrase, shareGoal, shortRange,
  timelineAxis, unitName, type BookCounts, type BookEstimate, type BookPart, type BookTargets, type GoalUnit, type PartPlan, type PartStatus,
} from '../../../../lib/bookGoals'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { localToday } from '../schedule/useSchedule'
import GoalField from './GoalField'
import { useDailyActivity } from './useDailyActivity'

// A book's goals (Book details, at Mid beside the book's facts and on the cover at Max). Two ways, the writer's choice per book: goals without
// dates (the words, and the outline to fill: chapters, scenes, moments), with an estimate of how long the rest would take at their usual pace
// (`lib/bookGoals.ts`, from the project's activity over the last weeks) and a timeline that follows it; or deadlines, a date for the book and
// for each arc, each with the pace it needs and whether that is within reach, the estimates beside them on the timeline. The goals and the
// dates are the book's and the arcs' own fields, saved with the outline.

const TAG: Record<PartStatus, string> = { done: 'Done', reach: 'Within reach', above: 'Above your pace', past: 'Past its date' }
const plural = (n: number, unit: GoalUnit) => `${n.toLocaleString('en-US')} ${unitName(unit, n)}`
const listOf = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
const dayName = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

// What the book holds today, and its parts: its arcs in order (each with its words and chapters), and the chapters outside any arc as one
// part after them. A book without arcs has no parts.
export function bookFacts(nodes: OutlineNode[], book: OutlineNode, nodeWords: Record<string, number>): { counts: BookCounts; parts: BookPart[]; arcs: OutlineNode[] } {
  const index = buildChildIndex(nodes)
  const all = descendantsOf(index, book.id)
  const count = (kind: string) => all.filter(n => n.kind === kind).length
  const counts: BookCounts = { words: nodeWords[book.id] ?? 0, chapter: count('chapter'), scene: count('scene'), moment: count('moment') }
  const arcs = all.filter(n => n.kind === 'arc')
  const inArc = new Set<string>()
  const parts: BookPart[] = arcs.map((arc, i) => {
    const chapters = descendantsOf(index, arc.id).filter(n => n.kind === 'chapter')
    for (const c of chapters) inArc.add(c.id)
    return { id: arc.id, label: `Arc ${i + 1}${arc.title.trim() ? ` · ${arc.title.trim()}` : ''}`, done: nodeWords[arc.id] ?? 0, chapters: chapters.length, due: arc.dueDate ?? null }
  })
  const loose = all.filter(n => n.kind === 'chapter' && !inArc.has(n.id))
  if (arcs.length > 0 && loose.length > 0) {
    parts.push({ id: 'loose', label: 'Chapters outside an arc', done: loose.reduce((s, c) => s + (nodeWords[c.id] ?? 0), 0), chapters: loose.length, due: null })
  }
  return { counts, parts, arcs }
}

function PaceNote({ estimate }: { estimate: BookEstimate }) {
  const line = paceLine(estimate.lines)
  return (
    <div className="wrBookGoalsPace">
      {line && <span><b>Your usual pace:</b> {line}, from your writing activity over the last {PACE_WEEKS} weeks.</span>}
      {estimate.noPace.length > 0 && (
        <span>Not enough activity in the last {PACE_WEEKS} weeks yet to know your pace for {listOf(estimate.noPace.map(u => unitName(u, 2)))}: two weeks with some are enough.</span>
      )}
    </div>
  )
}

function Status({ plan, unit }: { plan: PartPlan; unit: GoalUnit }) {
  if (!plan.due) return <span className="wrBookGoalsNote">No date</span>
  let text = ''
  if (plan.status === 'past') text = `${plural(plan.left, unit)} left`
  else if (plan.status !== 'done' && plan.needs !== null) {
    text = `${needsPhrase(plan.needs, unit)}${plan.after ? ` after ${plan.after}` : ''}`
    if (plan.status === 'above' && plan.early && plan.late) text += `; at your pace it ends ${shortRange(plan.early, plan.late)}`
  }
  return (
    <span className="wrBookGoalsNote">
      {plan.status && <span className={`wrBookGoalsTag wrBookGoalsTag--${plan.status}`}>{TAG[plan.status]}</span>}
      {text && <span>{text}</span>}
    </span>
  )
}

interface TimelineRow { id: string; label: string; done: boolean; start: string | null; early: string | null; late: string | null; due: string | null }

function Timeline({ rows, today, dated }: { rows: TimelineRow[]; today: string; dated: boolean }) {
  const axis = timelineAxis(today, rows.flatMap(r => [r.late, r.due]))
  const at = (day: string) => axisAt(axis, day)
  // Narrow, every second month is left out: a month shown then has the year when it is the first or the year has changed since the last shown.
  const narrowYear = (i: number) => (i % 2 ? null : i === 0 || axis.months[i].key.slice(0, 4) !== axis.months[i - 2].key.slice(0, 4) ? axis.months[i].key.slice(0, 4) : null)
  const describe = (r: TimelineRow) => {
    const parts = [r.done ? 'done' : r.early && r.late ? `done ${rangePhrase(r.early, r.late)} at your pace` : 'no estimate yet']
    if (r.due) parts.push(`your date ${dayName(r.due)}`)
    return `${r.label}: ${parts.join(', ')}`
  }
  return (
    <div className="wrBookTimeline">
      <span className="wrLabel">{dated ? 'Timeline: your dates and the estimates beside them' : 'Timeline from the estimates'}</span>
      <div className="wrBookTimelineGrid">
        <span />
        <div className="wrBookTimelineMonths" aria-hidden="true">
          {axis.months.map((m, i) => (
            <span key={m.key} className={i % 2 ? 'wrBookTimelineMonth wrBookTimelineMonth--odd' : 'wrBookTimelineMonth'} style={{ left: `${m.at}%` }}>
              {m.label}
              {m.year && <small className="wrBookTimelineYear">{m.year}</small>}
              {narrowYear(i) && <small className="wrBookTimelineYear wrBookTimelineYear--narrow">{narrowYear(i)}</small>}
            </span>
          ))}
        </div>
        {rows.map(r => (
          <Fragment key={r.id}>
            <span className="wrBookTimelineLabel" title={r.label}>{r.label}</span>
            <div className="wrBookTimelineTrack" role="img" aria-label={describe(r)}>
              {r.done && <span className="wrBookTimelineDone" style={{ left: 0, width: `${at(today)}%` }} />}
              {!r.done && r.start && r.early && <span className="wrBookTimelineLikely" style={{ left: `${at(r.start)}%`, width: `${at(r.early) - at(r.start)}%` }} />}
              {!r.done && r.early && r.late && <span className="wrBookTimelineRange" style={{ left: `${at(r.early)}%`, width: `${at(r.late) - at(r.early)}%` }} />}
              {r.due && <span className="wrBookTimelineDue" style={{ left: `${at(r.due)}%` }} />}
              <span className="wrBookTimelineToday" style={{ left: `${at(today)}%` }} />
            </div>
          </Fragment>
        ))}
      </div>
      <div className="wrBookTimelineLegend">
        <span><i className="wrBookTimelineKey wrBookTimelineKey--likely" />At your faster pace</span>
        <span><i className="wrBookTimelineKey wrBookTimelineKey--range" />Up to your slower pace</span>
        <span><i className="wrBookTimelineKey wrBookTimelineKey--today" />Today</span>
        {dated && <span><i className="wrBookTimelineKey wrBookTimelineKey--due" />Your dates</span>}
      </div>
    </div>
  )
}

export function BookGoals({ w, book, nodeWords }: { w: WriterWorkspace; book: OutlineNode; nodeWords: Record<string, number> }) {
  const daily = useDailyActivity(w.activeProjectId)
  const today = localToday()
  const { counts, parts, arcs } = useMemo(() => bookFacts(w.outlineNodes, book, nodeWords), [w.outlineNodes, book, nodeWords])
  const targets: BookTargets = {
    words: book.wordCountGoal ?? null, chapter: book.chapterCountTarget ?? null, scene: book.sceneCountTarget ?? null, moment: book.momentCountTarget ?? null,
  }
  const estimate = bookEstimate(targets, counts, daily, today)
  const dated = book.goalsDated ?? false
  const unit = primaryUnit(targets)
  const unitPace = unit ? estimate.lines.find(l => l.unit === unit)?.pace ?? null : null
  const set = (patch: Partial<OutlineNode>) => w.updateOutlineNode(book.id, patch)
  const goal = (n: number | null) => (n !== null && n > 0 ? Math.round(n) : null)

  // The book as one part, in the unit it is planned in, and its arcs sharing the word goal (only with a word goal, and chapters to share by).
  const bookPlan = unit ? planParts([{ id: book.id, label: 'The book', target: targets[unit] as number, done: counts[unit], due: dated ? book.dueDate ?? null : null }], unitPace, today)[0] : null
  const partPlans = unit === 'words' ? planParts(shareGoal(parts.map(p => ({ ...p, due: dated ? p.due : null })), targets.words as number), unitPace, today) : []
  const rows: TimelineRow[] = partPlans.length > 0
    ? partPlans.map(p => ({ id: p.id, label: p.label, done: p.left === 0, start: p.start, early: p.early, late: p.late, due: p.due }))
    : [{ id: 'book', label: 'The book', done: estimate.met, start: estimate.span ? today : null, early: estimate.span?.early ?? null, late: estimate.span?.late ?? null, due: dated ? book.dueDate ?? null : null }]
  // Only with something to place: an estimate or a date (parts already done alone say nothing about the rest).
  const showTimeline = rows.some(r => r.late || r.due)

  return (
    <section className="wrBookGoals" aria-label="Goals">
      <div className="wrBookGoalsHead">
        <h3 className="wrBookGoalsTitle">Goals</h3>
        <div className="wrChoice" role="group" aria-label="Kind of goals">
          <button type="button" aria-pressed={!dated} className={dated ? undefined : 'on'} onClick={() => set({ goalsDated: false })}>Goals without dates</button>
          <button type="button" aria-pressed={dated} className={dated ? 'on' : undefined} onClick={() => set({ goalsDated: true })}>Deadlines</button>
        </div>
      </div>
      <div className="wrBookGoalsFields">
        <GoalField label="Word count" current={counts.words} goal={targets.words} onChange={n => set({ wordCountGoal: goal(n) })} />
        <GoalField label="Chapters" current={counts.chapter} goal={targets.chapter} onChange={n => set({ chapterCountTarget: goal(n) })} />
        <GoalField label="Scenes" current={counts.scene} goal={targets.scene} onChange={n => set({ sceneCountTarget: goal(n) })} />
        <GoalField label="Moments" current={counts.moment} goal={targets.moment} onChange={n => set({ momentCountTarget: goal(n) })} />
      </div>
      {estimate.lines.length === 0 ? (
        <p className="wrBookGoalsNote">Set a goal for the words or for the outline to fill, and how long the rest would take at your usual pace shows here.</p>
      ) : (
        <>
          <PaceNote estimate={estimate} />
          {!dated && estimate.met && <strong className="wrBookGoalsBig">Every goal is met</strong>}
          {!dated && !estimate.met && estimate.span && (
            <div className="wrBookGoalsEstimate">
              <strong className="wrBookGoalsBig">{durationPhrase(estimate.span.weeksMin, estimate.span.weeksMax)} at your usual pace</strong>
              <span>The book would be done {rangePhrase(estimate.span.early, estimate.span.late)}. The timeline below follows these estimates.</span>
            </div>
          )}
          {dated && unit && bookPlan && (
            <div className="wrBookGoalsDates">
              <span className="wrBookGoalsPart">The book</span>
              <input className="wrField" type="date" aria-label="The book's date" value={book.dueDate ?? ''} onChange={e => set({ dueDate: e.target.value || null })} />
              <Status plan={bookPlan} unit={unit} />
              {partPlans.filter(p => p.id !== 'loose').map(p => (
                <Fragment key={p.id}>
                  <span className="wrBookGoalsPart">{p.label}</span>
                  <input
                    className="wrField" type="date" aria-label={`${p.label}'s date`} value={p.due ?? ''}
                    onChange={e => w.updateOutlineNode(p.id, { dueDate: e.target.value || null })}
                  />
                  <Status plan={p} unit="words" />
                </Fragment>
              ))}
            </div>
          )}
          {dated && unit !== 'words' && arcs.length > 0 && <span className="wrBookGoalsNote">With a word count goal, each arc can have a date of its own.</span>}
          {showTimeline && <Timeline rows={rows} today={today} dated={dated} />}
        </>
      )}
    </section>
  )
}

export default BookGoals
