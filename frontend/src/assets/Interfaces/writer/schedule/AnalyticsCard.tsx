import { useMemo } from 'react'
import { addDays } from '../../../../lib/projection'
import type { ActivityEvent, DayTotals, FacetActivityData } from '../../../../lib/facets'
import { MONTH_NAMES, type WeekStart } from '../../../../lib/scheduleCalendar'

// Four charts from the activity: the words drafted a month by book, how many nodes of each kind were made, the revision flags put on and cleared a
// week, and when in the week the work happens (from the days whose events are still kept).

const OUTLINE_KINDS = ['series', 'book', 'arc', 'chapter', 'act', 'scene', 'moment']
const PLOT_KINDS = ['category', 'subcategory', 'cluster', 'plotline', 'plotpoint']
const monthKey = (d: string): string => d.slice(0, 7)

export function monthsBack(today: string, count: number): string[] {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  return Array.from({ length: count }, (_, i) => {
    const t = y * 12 + (m - 1) - (count - 1 - i)
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
  })
}

export interface BookWords { months: string[]; books: Array<{ id: string; title: string; words: number[] }> }
export function wordsByBook(data: FacetActivityData, today: string, titles: Record<string, string>, count = 12): BookWords {
  const months = monthsBack(today, count)
  const per = new Map<string, number[]>()
  const add = (key: string, d: DayTotals) => {
    const i = months.indexOf(key)
    if (i < 0) return
    for (const [book, w] of Object.entries(d.books)) {
      const row = per.get(book) ?? (Array(count).fill(0) as number[])
      row[i] += Math.max(0, w)
      per.set(book, row)
    }
  }
  for (const [date, d] of Object.entries(data.daily)) add(monthKey(date), d)
  for (const [key, d] of Object.entries(data.monthly)) add(key, d)
  return { months, books: [...per.entries()].map(([id, words]) => ({ id, title: titles[id] ?? 'Book', words })).sort((a, b) => b.words.reduce((x, y) => x + y, 0) - a.words.reduce((x, y) => x + y, 0)).slice(0, 5) }
}

// Nodes made so far, by kind, at the end of each of the last `count` months (a running total of what the activity saw).
export function growthByKind(data: FacetActivityData, today: string, kinds: string[], count = 12): Array<{ kind: string; totals: number[] }> {
  const months = monthsBack(today, count)
  const made = new Map<string, number[]>()
  const add = (key: string, d: DayTotals) => {
    const i = months.indexOf(key)
    for (const [kind, n] of Object.entries(d.kinds)) {
      if (!kinds.includes(kind)) continue
      const row = made.get(kind) ?? Array(count).fill(0)
      if (i >= 0) row[i] += n
      made.set(kind, row)
    }
  }
  for (const [date, d] of Object.entries(data.daily)) add(monthKey(date), d)
  for (const [key, d] of Object.entries(data.monthly)) add(key, d)
  return [...made.entries()].map(([kind, row]) => ({ kind, totals: row.map((_, i) => row.slice(0, i + 1).reduce((a, b) => a + b, 0)) })).filter(r => r.totals.at(-1))
}

export function flagsByWeek(daily: Record<string, DayTotals>, today: string, weekStart: WeekStart, count = 8): Array<{ from: string; applied: number; resolved: number }> {
  const back = (new Date(`${today}T00:00:00Z`).getUTCDay() + (weekStart === 'monday' ? 6 : 0)) % 7
  const first = addDays(today, -back - (count - 1) * 7)
  return Array.from({ length: count }, (_, w) => {
    const from = addDays(first, w * 7)
    let applied = 0
    let resolved = 0
    for (let i = 0; i < 7; i += 1) { const d = daily[addDays(from, i)]; applied += d?.flagsApplied ?? 0; resolved += d?.flagsResolved ?? 0 }
    return { from, applied, resolved }
  })
}

const BANDS = ['6–9 AM', '9–12', '12–3 PM', '3–6', '6–9', '9–12 PM']
// Events by weekday (Monday first) and three-hour band from 6 AM; the hours before 6 count with the last band.
export function rhythm(events: ActivityEvent[]): number[][] {
  const grid = BANDS.map(() => Array(7).fill(0) as number[])
  for (const e of events) {
    const hour = Math.floor(e.slot / 6)
    const band = hour < 6 ? 5 : Math.min(5, Math.floor((hour - 6) / 3))
    grid[band][(new Date(`${e.date}T00:00:00Z`).getUTCDay() + 6) % 7] += 1
  }
  return grid
}

const level = (n: number, max: number): 0 | 1 | 2 | 3 | 4 => (n <= 0 ? 0 : n / max <= 0.25 ? 1 : n / max <= 0.5 ? 2 : n / max <= 0.75 ? 3 : 4)
const DASHES = ['', '6 3', '2 3', '8 3 2 3', '1 3']

export function AnalyticsCard({ data, today, titles, weekStart }: { data: FacetActivityData; today: string; titles: Record<string, string>; weekStart: WeekStart }) {
  const words = useMemo(() => wordsByBook(data, today, titles), [data, today, titles])
  const outline = useMemo(() => growthByKind(data, today, OUTLINE_KINDS), [data, today])
  const plot = useMemo(() => growthByKind(data, today, PLOT_KINDS), [data, today])
  const flags = useMemo(() => flagsByWeek(data.daily, today, weekStart), [data.daily, today, weekStart])
  const heat = useMemo(() => rhythm(data.events), [data.events])
  const wMax = Math.max(1, ...words.months.map((_, i) => words.books.reduce((n, b) => n + b.words[i], 0)))
  const fMax = Math.max(1, ...flags.flatMap(f => [f.applied, f.resolved]))
  const hMax = Math.max(1, ...heat.flat())
  const line = (rows: Array<{ kind: string; totals: number[] }>, max: number) => rows.map((r, k) => ({
    kind: r.kind, dash: DASHES[k % DASHES.length], points: r.totals.map((v, i) => `${(i / 11) * 216 + 2},${(96 - (v / max) * 92).toFixed(1)}`).join(' '),
  }))
  const growth = (title: string, rows: Array<{ kind: string; totals: number[] }>, facet: 'outline' | 'plot') => {
    const max = Math.max(1, ...rows.flatMap(r => r.totals))
    return (
      <div className="wrSchedChart">
        <h4>{title}</h4>
        {rows.length === 0 ? <p className="wrMuted">Nothing made yet.</p> : (
          <>
            <svg viewBox="0 0 220 100" role="img" aria-label={`${title}: ${rows.map(r => `${r.totals.at(-1)} ${r.kind}`).join(', ')}`}>
              <line className="wrSchedGrid" x1="0" x2="220" y1="98" y2="98" />
              {line(rows, max).map(l => <polyline key={l.kind} className="wrSchedGrowth" style={{ stroke: `var(--wr-f-${facet})`, strokeDasharray: l.dash }} points={l.points} />)}
            </svg>
            <div className="wrSchedMini">{line(rows, max).map(l => <span key={l.kind}><svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" style={{ stroke: `var(--wr-f-${facet})`, strokeWidth: 2, strokeDasharray: l.dash }} /></svg>{l.kind}</span>)}</div>
          </>
        )}
      </div>
    )
  }
  return (
    <div className="wrSchedCard wrSchedAnalytics">
      <div className="wrSchedCharts">
        <div className="wrSchedChart">
          <h4>Words drafted by book</h4>
          {words.books.length === 0 ? <p className="wrMuted">No words drafted yet.</p> : (
            <>
              <div className="wrSchedStacks" role="img" aria-label={`Words drafted a month over the last 12 months, by book: ${words.books.map(b => `${b.title} ${b.words.reduce((x, y) => x + y, 0)}`).join(', ')}`}>
                {words.months.map((m, i) => (
                  <div key={m} className="wrSchedStack" title={`${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}: ${words.books.reduce((n, b) => n + b.words[i], 0).toLocaleString('en-US')} words`}>
                    {words.books.map((b, k) => <i key={b.id} style={{ height: `${(b.words[i] / wMax) * 100}%`, background: `color-mix(in srgb, var(--wr-f-draft) ${100 - k * 17}%, transparent)` }} />)}
                  </div>
                ))}
              </div>
              <div className="wrSchedMini">{words.books.map((b, k) => <span key={b.id}><i className="wrSchedDot" style={{ background: `color-mix(in srgb, var(--wr-f-draft) ${100 - k * 17}%, transparent)` }} />{b.title}</span>)}</div>
            </>
          )}
        </div>
        {growth('Outline growth', outline, 'outline')}
        {growth('Plot growth', plot, 'plot')}
        <div className="wrSchedChart">
          <h4>Flags applied and resolved</h4>
          <div className="wrSchedPairs" role="img" aria-label={`Revision flags a week: ${flags.map(f => `${f.applied} applied, ${f.resolved} resolved`).join('; ')}`}>
            {flags.map(f => (
              <div key={f.from} className="wrSchedPair" title={`Week of ${f.from}: ${f.applied} applied, ${f.resolved} resolved`}>
                <i className="wrSchedPair--applied" style={{ height: `${(f.applied / fMax) * 100}%` }} /><i className="wrSchedPair--resolved" style={{ height: `${(f.resolved / fMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="wrSchedMini"><span><i className="wrSchedDot wrSchedDot--ring" />Applied</span><span><i className="wrSchedDot" style={{ background: 'var(--wr-f-revision)' }} />Resolved</span></div>
        </div>
        <div className="wrSchedChart">
          <h4>When you work</h4>
          <div className="wrSchedHeat" role="img" aria-label="Events by weekday and time of day over the days still kept">
            <span />{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => <span key={i} className="wrSchedHeatLabel">{l}</span>)}
            {heat.map((row, b) => [<span key={`l${b}`} className="wrSchedHeatLabel wrSchedHeatLabel--row">{BANDS[b]}</span>, ...row.map((n, d) => <i key={`${b}${d}`} className={`wrSchedCalCell wrSchedCalCell--${level(n, hMax)}`} title={`${n} events`} />)])}
          </div>
          <p className="wrMuted">The last 14 days.</p>
        </div>
      </div>
    </div>
  )
}
