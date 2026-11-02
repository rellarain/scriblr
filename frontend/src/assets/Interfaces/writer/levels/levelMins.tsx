import { useEffect, useMemo, useState } from 'react'
import { dayValue } from '../../../../lib/facets'
import { durationText, nextUp } from '../../../../lib/nextUp'
import { addDays } from '../../../../lib/projection'
import { shiftOccurrences } from '../../../../lib/recurrence'
import { slotOfDate } from '../../../../lib/ribbon'
import { nodeLabel } from '../plotTree'
import { localToday, useSchedule } from '../schedule/useSchedule'
import { useWordCounts } from '../useWordCounts'
import type { WriterWorkspace } from '../useWriterWorkspace'

// What a level shows under its header strip when it is Min (the level beside the focused one, folded): the few facts that say where things stand.

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

function Bar({ label, value, of, unit }: { label: string; value: number; of: number; unit: string }) {
  const pct = of > 0 ? Math.min(100, (value / of) * 100) : 0
  return (
    <div className="wrBarRow">
      <div className="wrBarLabel"><span>{label}</span><span>{value.toLocaleString('en-US')} of {of.toLocaleString('en-US')} {unit}</span></div>
      <div className="wrBarTrack" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><div className="wrBarFill" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

// The Dash: the shift running now (with what is left of it) or the next one, the words written today against the day's goal, and the tasks waiting.
export function DashMin({ w }: { w: WriterWorkspace }) {
  const ids = useMemo(() => w.projects.map(p => p.projectId), [w.projects])
  const s = useSchedule(ids)
  const today = s.loading ? localToday() : s.facets.today
  const [nowSlot, setNowSlot] = useState(() => slotOfDate(new Date()))
  useEffect(() => { const t = setInterval(() => setNowSlot(slotOfDate(new Date())), 30_000); return () => clearInterval(t) }, [])
  const planners = Object.values(s.planners)
  const up = useMemo(
    () => nextUp(planners.flatMap(p => shiftOccurrences(p.shifts, p.restDays, today, addDays(today, 14))), today, nowSlot),
    [s.planners, today, nowSlot], // eslint-disable-line react-hooks/exhaustive-deps
  )
  if (s.error) return <p className="wrError" role="alert">{s.error}</p>
  const words = dayValue(s.facets.daily[today], 'draft')
  const daily = planners.flatMap(p => p.goals).find(g => g.facet === 'draft' && g.daily)?.daily ?? 0
  const waiting = planners.reduce((n, p) => n + p.items.filter(i => !i.shiftId && !i.doneOn).length, 0)
  return (
    <div className="wrLevelMinBody">
      <div className="wrSummary">
        {s.loading && <p className="wrMuted">Loading…</p>}
        {!s.loading && !up && <p className="wrMuted">No shifts coming up.</p>}
        {up && (
          <div className="wrKv">
            <span>{up.kind === 'running' ? 'Now' : 'Next'} · {up.occ.title || 'Shift'}</span>
            <span>{up.kind === 'running' ? `${durationText(up.minutes)} left` : `in ${durationText(up.minutes)}`}</span>
          </div>
        )}
        {daily > 0 ? <Bar label="Written today" value={words} of={daily} unit="words" /> : <div className="wrKv"><span>Written today</span><span>{plural(words, 'word')}</span></div>}
        <div className="wrKv"><span>Tasks waiting</span><span>{waiting}</span></div>
      </div>
    </div>
  )
}

// The Outline: how far the open book is (its chapters against the target, its words against the goal), and, once a chapter is open, where you are in it.
export function OutlineMin({ w }: { w: WriterWorkspace }) {
  const counts = useWordCounts(w.activeProjectId)
  const ids = useMemo(() => (w.activeProjectId ? [w.activeProjectId] : []), [w.activeProjectId])
  const s = useSchedule(ids)
  const book = w.activeBook
  if (!book) return null
  const chapters = w.activeBookChapters
  const words = counts.books[book.id] ?? 0
  const chapter = w.activeChapter
  const number = chapter ? chapters.findIndex(c => c.id === chapter.id) + 1 : 0
  const today = s.loading ? localToday() : s.facets.today
  return (
    <div className="wrLevelMinBody">
      <div className="wrSummary">
        {book.chapterCountTarget ? <Bar label="Chapters" value={chapters.length} of={book.chapterCountTarget} unit="" /> : <div className="wrKv"><span>Chapters</span><span>{chapters.length}</span></div>}
        {book.wordCountGoal ? <Bar label="Words" value={words} of={book.wordCountGoal} unit="" /> : <div className="wrKv"><span>Words</span><span>{words.toLocaleString('en-US')}</span></div>}
        {chapter && (
          <>
            <div className="wrKv"><span>Open · Chapter {number}</span><span>{plural(counts.chapters[chapter.id] ?? 0, 'word')}</span></div>
            <p className="wrHint">{nodeLabel(chapter)} · {plural(dayValue(s.facets.daily[today], 'draft'), 'word')} written today</p>
          </>
        )}
      </div>
    </div>
  )
}
