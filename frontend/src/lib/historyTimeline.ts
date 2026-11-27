// The project's history as one timeline by day (the Project level's History tab, writer/history/HistoryTab.tsx): the writing (from the activity's
// word events while they are kept, then from each day's total), the outline's and the plot's snapshots, the chapters' revisions and the revision
// flags added and resolved. Each item knows what it is about (its books, for the book filter) and what can be done with it: a snapshot or a
// revision can be restored, a revision compared with the chapter now. Pure functions of what the backend lists.

import type { OutlineNode } from '../api/types'
import type { ChapterRevisionSummary, TreeSnapshotSummary } from '../types'
import type { ActivityEvent, DayTotals } from './facets'

export type HistoryKind = 'writing' | 'outline' | 'plot' | 'revision' | 'flags'
export const HISTORY_KINDS: HistoryKind[] = ['writing', 'outline', 'plot', 'revision', 'flags']
export const KIND_LABEL: Record<HistoryKind, string> = { writing: 'Writing', outline: 'Outline', plot: 'Plot', revision: 'Revision', flags: 'Flags' }
// The facet colour each kind is marked in (--wr-f-<facet>).
export const KIND_FACET: Record<HistoryKind, string> = { writing: 'draft', outline: 'outline', plot: 'plot', revision: 'revision', flags: 'project' }

export type Restore = { scope: 'outline' | 'plot'; snapshotId: string } | { scope: 'chapter'; chapterId: string; snapshotId: string }
export interface HistoryItem {
  id: string
  kind: HistoryKind
  ts: string // ISO, for the order
  day: string // the local day, YYYY-MM-DD
  time: string // "10:42", or "" when only the day is known
  text: string
  books: string[] // the books it is about; none: the whole project
  words?: number
  restore?: Restore
  compare?: { chapterId: string; snapshotId: string }
}
export interface HistoryDay { day: string; label: string; words: number; items: HistoryItem[] }

const pad = (n: number) => String(n).padStart(2, '0')
export const localDayOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const localTimeOf = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const num = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? '' : 's'}`

// Where the chapters of a project are: each chapter's name ("Chapter 3 · The Ferry at Dusk", numbered across its book), its book, and the chapter
// a node is in.
export interface ChapterPlaces { name: (chapterId: string) => string; bookOf: (nodeId: string) => string | null; chapterOf: (nodeId: string) => string | null; numberOf: (chapterId: string) => number }
export function chapterPlacesOf(nodes: OutlineNode[]): ChapterPlaces {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const kids = new Map<string | null, OutlineNode[]>()
  for (const n of nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  for (const list of kids.values()) list.sort((a, b) => a.order - b.order)
  const number = new Map<string, number>()
  for (const book of nodes.filter(n => n.kind === 'book')) {
    let count = 0
    const walk = (id: string) => { for (const k of kids.get(id) ?? []) { if (k.kind === 'chapter') number.set(k.id, ++count); else if (k.kind === 'arc') walk(k.id) } }
    walk(book.id)
  }
  const up = (id: string, kind: string): string | null => {
    for (let at = byId.get(id), guard = 0; at && guard < 12; at = at.parentId ? byId.get(at.parentId) : undefined, guard += 1) if (at.kind === kind) return at.id
    return null
  }
  return {
    name: id => {
      const c = byId.get(id)
      if (!c) return 'A chapter no longer in the outline'
      return `Chapter ${number.get(id) ?? '?'}${c.title.trim() ? ` · ${c.title.trim()}` : ''}`
    },
    bookOf: id => up(id, 'book'),
    chapterOf: id => up(id, 'chapter'),
    numberOf: id => number.get(id) ?? 0,
  }
}

// "Chapter 3", "Chapters 2 and 3", "Chapters 2, 3 and 5".
function chaptersPhrase(ids: string[], places: ChapterPlaces): string {
  if (ids.length === 1) return places.name(ids[0])
  const nums = ids.map(id => places.numberOf(id)).filter(n => n > 0).sort((a, b) => a - b)
  if (nums.length === 0) return `${ids.length} chapters`
  const list = nums.length === 1 ? String(nums[0]) : `${nums.slice(0, -1).join(', ')} and ${nums[nums.length - 1]}`
  return `Chapters ${list}`
}

// The writing of the days the activity still holds events for: the word events of a day in sittings (a gap of over an hour starts another), each
// an item at its last word, with the words and the chapters written in.
const SITTING_GAP_MS = 60 * 60 * 1000
function writingItems(events: ActivityEvent[], places: ChapterPlaces): HistoryItem[] {
  const words = events.filter(e => e.facet === 'draft' && e.action === 'words').sort((a, b) => a.ts.localeCompare(b.ts))
  const items: HistoryItem[] = []
  let run: ActivityEvent[] = []
  const close = () => {
    if (run.length === 0) return
    const last = run[run.length - 1]
    const total = run.reduce((s, e) => s + e.amount, 0)
    const chapters = [...new Set(run.map(e => (e.nodeId ? places.chapterOf(e.nodeId) : null)).filter((c): c is string => !!c))]
    const books = [...new Set(run.map(e => (e.nodeId ? places.bookOf(e.nodeId) : null)).filter((b): b is string => !!b))]
    const where = chapters.length ? ` in ${chaptersPhrase(chapters, places)}` : ''
    items.push({
      id: `w-${last.ts}`, kind: 'writing', ts: last.ts, day: last.date, time: localTimeOf(last.ts),
      text: total < 0 ? `${plural(-total, 'word')} cut${where}` : `${plural(total, 'word')}${where}`, books, words: total,
    })
    run = []
  }
  for (const e of words) {
    const prev = run[run.length - 1]
    if (prev && (prev.date !== e.date || Date.parse(e.ts) - Date.parse(prev.ts) > SITTING_GAP_MS)) close()
    run.push(e)
  }
  close()
  return items
}

// The days before the events: a day's net words, with no time or chapter.
function olderWriting(daily: Record<string, DayTotals>, eventDays: Set<string>, firstEventDay: string | null): HistoryItem[] {
  return Object.entries(daily)
    .filter(([day, t]) => t.draft !== 0 && !eventDays.has(day) && (!firstEventDay || day < firstEventDay))
    .map(([day, t]) => ({
      id: `wd-${day}`, kind: 'writing' as const, ts: `${day}T23:59:59`, day, time: '',
      text: t.draft < 0 ? `${plural(-t.draft, 'word')} cut that day` : `${plural(t.draft, 'word')} written that day`, books: [], words: t.draft,
    }))
}

// Flags added and resolved, a line for each on each day, at the last of them.
function flagItems(events: ActivityEvent[]): HistoryItem[] {
  const groups = new Map<string, ActivityEvent[]>()
  for (const e of events) {
    if (e.facet !== 'revision' || (e.action !== 'flag' && e.action !== 'resolve')) continue
    const k = `${e.date}|${e.action}`
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  return [...groups.values()].map(list => {
    const last = list.reduce((a, b) => (b.ts > a.ts ? b : a))
    const n = list.length
    return {
      id: `f-${last.date}-${last.action}`, kind: 'flags' as const, ts: last.ts, day: last.date, time: localTimeOf(last.ts),
      text: last.action === 'flag' ? `${plural(n, 'flag')} added` : `${plural(n, 'flag')} resolved`, books: [],
    }
  })
}

// "+2 added, 1 modified" -> "2 added, 1 changed".
const changes = (summary: string) => summary.replace(/\+(\d+) added/, '$1 added').replace(/-(\d+) removed/, '$1 removed').replace(/(\d+) modified/, '$1 changed')

function snapshotItems(list: TreeSnapshotSummary[], scope: 'outline' | 'plot'): HistoryItem[] {
  // The oldest snapshot kept (the first save, or the oldest left once the history was pruned) has nothing before it: its "added" is the whole
  // tree. The backend lists the newest first.
  const oldest = list.reduce<TreeSnapshotSummary | null>((a, s) => (!a || s.createdAt < a.createdAt ? s : a), null)
  return list.map(s => ({
    id: `${scope}-${s.snapshotId}`, kind: scope, ts: s.createdAt, day: localDayOf(s.createdAt), time: localTimeOf(s.createdAt),
    text: s.trigger === 'revert-safety'
      ? `The ${scope} kept before it was put back · ${plural(s.nodeCount, 'node')}`
      : s === oldest ? `The ${scope}’s oldest snapshot · ${plural(s.nodeCount, 'node')}` : `${changes(s.summary)} · the ${scope} then: ${plural(s.nodeCount, 'node')}`,
    books: [], restore: { scope, snapshotId: s.snapshotId },
  }))
}

function revisionItems(list: ChapterRevisionSummary[], places: ChapterPlaces): HistoryItem[] {
  return list.map(r => {
    const what = r.trigger === 'auto' ? 'the rolling snapshot after 5 minutes idle'
      : r.trigger === 'session' ? (r.label.startsWith('Before') ? 'before an editing session' : 'an editing session')
        : r.label.startsWith('Before revert') ? `kept before it was put back (${plural(r.wordCount, 'word')})` : `saved by you, ${r.label} (${plural(r.wordCount, 'word')})`
    const book = places.bookOf(r.chapterId)
    return {
      id: `r-${r.chapterId}-${r.snapshotId}`, kind: 'revision' as const, ts: r.createdAt, day: localDayOf(r.createdAt), time: localTimeOf(r.createdAt),
      text: `${places.name(r.chapterId)} · ${what}`, books: book ? [book] : [],
      restore: { scope: 'chapter' as const, chapterId: r.chapterId, snapshotId: r.snapshotId }, compare: { chapterId: r.chapterId, snapshotId: r.snapshotId },
    }
  })
}

export interface HistoryInputs {
  events: ActivityEvent[]
  daily: Record<string, DayTotals>
  outline: TreeSnapshotSummary[]
  plot: TreeSnapshotSummary[]
  revisions: ChapterRevisionSummary[]
  nodes: OutlineNode[]
}

// Every item, newest first.
export function historyItems(input: HistoryInputs): HistoryItem[] {
  const places = chapterPlacesOf(input.nodes)
  const eventDays = new Set(input.events.map(e => e.date))
  const firstEventDay = [...eventDays].sort()[0] ?? null
  return [
    ...writingItems(input.events, places),
    ...olderWriting(input.daily, eventDays, firstEventDay),
    ...flagItems(input.events),
    ...snapshotItems(input.outline, 'outline'),
    ...snapshotItems(input.plot, 'plot'),
    ...revisionItems(input.revisions, places),
  ].sort((a, b) => b.ts.localeCompare(a.ts))
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// "Today, Thursday 26 November", "Yesterday, Wednesday 25 November", "Monday 23 November", "Friday 26 December 2025".
export function dayLabel(day: string, today: string): string {
  const d = new Date(`${day}T12:00:00`)
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${day.slice(0, 4) !== today.slice(0, 4) ? ` ${day.slice(0, 4)}` : ''}`
  const y = new Date(`${today}T12:00:00`)
  y.setDate(y.getDate() - 1)
  const yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`
  return day === today ? `Today, ${base}` : day === yesterday ? `Yesterday, ${base}` : base
}

// The items kept by the kinds and the book chosen (a book keeps what is about it; what is about the whole project shows only for every book), and
// by the words searched for (each word somewhere in the item's text, any case).
export function filterItems(items: HistoryItem[], kinds: HistoryKind[] | null, book: string | null, search = ''): HistoryItem[] {
  const words = search.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(i => (!kinds || kinds.includes(i.kind)) && (!book || i.books.includes(book))
    && words.every(word => i.text.toLocaleLowerCase().includes(word)))
}

// The items by day, newest first, each day with its words (the day's net words) and its items.
export function historyDays(items: HistoryItem[], daily: Record<string, DayTotals>, today: string): HistoryDay[] {
  const byDay = new Map<string, HistoryItem[]>()
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i])
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => ({ day, label: dayLabel(day, today), words: daily[day]?.draft ?? 0, items: list }))
}

// A day's line: "Today, Thursday 26 November · 186 words · 3 changes".
export const dayLine = (d: HistoryDay) => [d.label, ...(d.words ? [d.words < 0 ? `${plural(-d.words, 'word')} cut` : plural(d.words, 'word')] : []), plural(d.items.length, 'change')].join(' · ')
