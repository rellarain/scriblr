import type { TaskPriority } from './facets'
import { addDays } from './projection'

// The quick-add line of the backlog: `Revise ch 3 !high ~2h fri @chapter 3` is a task "Revise ch 3" of high priority, two hours long, due on the
// next Friday, about the node called "chapter 3". Every part is optional and the text that is not one of them stays in the label.
//   !high !medium !low !none (or !h !m !l !n)    the priority
//   ~2h  ~45m  ~1h30m  ~90                       the estimate (a bare number is minutes)
//   ^fri  fri  today  tomorrow  2027-02-01       the due day (a bare day word counts only as the last word)
//   @name                                        the node (what follows, up to the next marker or the end, matched against the nodes on offer)

export interface QuickTarget { id: string; title: string; tree: 'outline' | 'plot'; kind: string }
export interface QuickParse {
  label: string
  priority: TaskPriority | null
  estimateMinutes: number | null
  dueDate: string | null
  target: QuickTarget | null
}

const PRIORITY_WORD: Record<string, TaskPriority> = { high: 'high', h: 'high', medium: 'medium', med: 'medium', m: 'medium', low: 'low', l: 'low', none: 'none', n: 'none' }
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function estimateOf(text: string): number | null {
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m?)?$/i.exec(text)
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  // "90" and "45m" are minutes; "2h", "1.5h" and "1h30m" are hours and minutes.
  const hours = m[1] !== undefined ? Number(m[1]) : 0
  const minutes = m[2] !== undefined ? Number(m[2]) : 0
  const total = Math.round(hours * 60 + minutes)
  return total >= 1 && total <= 24 * 60 ? total : null
}

// An estimate as it reads: 45m, 2h, 1h 30m.
export function formatEstimate(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

// A day named by a word: `today`, `tomorrow`, a weekday (the next one after today) or a date.
export function dayOf(word: string, today: string): string | null {
  const w = word.toLowerCase()
  if (w === 'today') return today
  if (w === 'tomorrow' || w === 'tmrw') return addDays(today, 1)
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return Number.isNaN(Date.parse(`${w}T00:00:00Z`)) ? null : w
  const at = WEEKDAYS.indexOf(w.slice(0, 3))
  if (at < 0 || !(w.length === 3 || 'sunday monday tuesday wednesday thursday friday saturday'.split(' ')[at] === w)) return null
  const now = new Date(`${today}T00:00:00Z`).getUTCDay()
  return addDays(today, ((at - now + 6) % 7) + 1)
}

const isMarker = (t: string) => /^[!~^@]/.test(t)

export function parseQuickAdd(text: string, today: string, targets: QuickTarget[] = []): QuickParse {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const out: QuickParse = { label: '', priority: null, estimateMinutes: null, dueDate: null, target: null }
  const keep: string[] = []
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i]
    if (w.startsWith('!') && PRIORITY_WORD[w.slice(1).toLowerCase()]) { out.priority = PRIORITY_WORD[w.slice(1).toLowerCase()]; continue }
    if (w.startsWith('~') && estimateOf(w.slice(1)) !== null) { out.estimateMinutes = estimateOf(w.slice(1)); continue }
    if (w.startsWith('^') && dayOf(w.slice(1), today)) { out.dueDate = dayOf(w.slice(1), today); continue }
    if (w.startsWith('@') && w.length > 1) {
      // The name runs to the next marker; the longest run that names a node wins, and what is left over goes back to the label.
      let end = i + 1
      while (end < words.length && !isMarker(words[end])) end += 1
      let found: QuickTarget | null = null
      let used = i
      for (let stop = end; stop > i; stop -= 1) {
        const name = [words[i].slice(1), ...words.slice(i + 1, stop)].join(' ').toLowerCase()
        const hit = targets.find(t => t.title.toLowerCase() === name) ?? targets.find(t => t.title.toLowerCase().includes(name))
        if (hit) { found = hit; used = stop - 1; break }
      }
      if (found) { out.target = found; i = used; continue }
    }
    keep.push(w)
  }
  // A day word at the very end is the due day (and only there: "Email on Friday notes" keeps its words).
  if (out.dueDate === null && keep.length > 1) {
    const last = keep[keep.length - 1]
    const day = dayOf(last, today)
    if (day) { out.dueDate = day; keep.pop() }
  }
  out.label = keep.join(' ')
  return out
}
