import type { FlagType } from '../api/types'
import type { ActivityEvent, DayTotals } from './facets'

// Revision passes (the project's Schedule): a pass is a stretch of revision with a name, a first day and an optional last one, the kinds of
// flag it works through and goals of its own. It covers every book and chapter of the project. Its progress is worked out here from what the
// project already keeps: the revision flags (resolved in the pass, or still open), the daily word totals (the net change), and the chapters
// read in the Preview while it runs (an activity event, facet "revision", action "read").

export type PassGoalKind = 'flags' | 'words' | 'read'
// `words` is a word goal's change: negative to cut that many, positive to add them.
export interface PassGoal { id: string; kind: PassGoalKind; words: number | null }
export interface RevisionPass { id: string; name: string; start: string; end: string | null; kinds: FlagType[]; goals: PassGoal[] }

export type PassState = 'upcoming' | 'running' | 'done'

export function passState(pass: RevisionPass, today: string): PassState {
  if (today < pass.start) return 'upcoming'
  if (pass.end && today > pass.end) return 'done'
  return 'running'
}

// The local day of an ISO time (a flag's createdAt or resolvedAt).
export function localDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The last day the pass counts up to: its last day, or today while it has none (or has not reached it).
const lastCounted = (pass: RevisionPass, today: string) => (pass.end && pass.end < today ? pass.end : today)
const inPass = (pass: RevisionPass, day: string, today: string) => day >= pass.start && day <= lastCounted(pass, today)

export interface FlagLike { id: string; scope: 'passage' | 'project'; type: FlagType; resolvedAt: string | null }

// The pass's flags: those of its kinds that are open, and those resolved while it runs. A flag resolved before it started is not its.
export function passFlags<F extends FlagLike>(pass: RevisionPass, flags: F[], today: string): { open: F[]; resolved: F[]; total: number } {
  const kinds = new Set(pass.kinds)
  const mine = flags.filter(f => kinds.has(f.type))
  const open = mine.filter(f => f.resolvedAt === null)
  const resolved = mine.filter(f => f.resolvedAt !== null && inPass(pass, localDay(f.resolvedAt), today))
  return { open, resolved, total: open.length + resolved.length }
}

// The project's net change in words while the pass runs (negative when words were cut).
export function passWordChange(pass: RevisionPass, daily: Record<string, DayTotals>, today: string): number {
  if (passState(pass, today) === 'upcoming') return 0
  return Object.entries(daily).reduce((sum, [day, totals]) => (inPass(pass, day, today) ? sum + totals.draft : sum), 0)
}

// The chapters read in the Preview while the pass runs.
export function passReads(pass: RevisionPass, events: ActivityEvent[], today: string): Set<string> {
  const read = new Set<string>()
  for (const e of events) if (e.facet === 'revision' && e.action === 'read' && e.nodeId && inPass(pass, e.date, today)) read.add(e.nodeId)
  return read
}

const KIND_LABEL: Record<FlagType, string> = { review: 'Review', add: 'Add', remove: 'Remove', merge: 'Merge', change: 'Change', simplify: 'Simplify', expand: 'Expand' }
export const kindLabel = (kind: FlagType) => KIND_LABEL[kind]
const words = (n: number) => n.toLocaleString('en-US')

// "Remove, Merge and Simplify".
export function kindsList(kinds: FlagType[]): string {
  const names = kinds.map(kindLabel)
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// What a goal asks, in words.
export function goalTitle(goal: PassGoal, pass: RevisionPass): string {
  if (goal.kind === 'flags') return pass.kinds.length ? `Resolve every ${kindsList(pass.kinds)} flag` : 'Resolve the pass’s flags (choose their kinds)'
  if (goal.kind === 'words') {
    const n = goal.words ?? 0
    return n < 0 ? `Cut ${words(-n)} words across the project` : `Add ${words(n)} words across the project`
  }
  return 'Read every chapter once'
}

export interface PassFacts {
  flags: FlagLike[]
  daily: Record<string, DayTotals>
  events: ActivityEvent[]
  chapterIds: string[]
  today: string
}

// How far a goal has come: done of a target, and how it is said ("41 of 96", "3,150 cut", "14 of 36 chapters").
export function goalProgress(goal: PassGoal, pass: RevisionPass, facts: PassFacts): { done: number; target: number; text: string } {
  if (goal.kind === 'flags') {
    const { resolved, total } = passFlags(pass, facts.flags, facts.today)
    return { done: resolved.length, target: total, text: `${resolved.length} of ${total}` }
  }
  if (goal.kind === 'words') {
    const want = goal.words ?? 0
    const change = passWordChange(pass, facts.daily, facts.today)
    const done = want < 0 ? Math.max(0, -change) : Math.max(0, change)
    return { done, target: Math.abs(want), text: `${words(done)} ${want < 0 ? 'cut' : 'added'}` }
  }
  const read = passReads(pass, facts.events, facts.today)
  const done = facts.chapterIds.filter(id => read.has(id)).length
  return { done, target: facts.chapterIds.length, text: `${done} of ${facts.chapterIds.length} chapters` }
}

const dayName = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// A pass's card line: "Done 2 Nov · 28 of 28 flags", "14 Nov to 20 Dec · 41 of 96 flags", "From 14 Nov · 41 of 96 flags", "From 5 Jan · not started".
export function passSummary(pass: RevisionPass, flags: FlagLike[], today: string): string {
  const state = passState(pass, today)
  if (state === 'upcoming') return `From ${dayName(pass.start)} · not started`
  const { resolved, total } = passFlags(pass, flags, today)
  const count = pass.kinds.length ? ` · ${resolved.length} of ${total} flags` : ''
  if (state === 'done') return `Done ${dayName(pass.end as string)}${count}`
  return `${pass.end ? `${dayName(pass.start)} to ${dayName(pass.end)}` : `From ${dayName(pass.start)}`}${count}`
}

// The passes in the order they come (by first day): Pass 1, Pass 2, ...
export function passesInOrder(passes: RevisionPass[]): RevisionPass[] {
  return [...passes].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
}

// The pass to show first: the one running (the latest started), else the next to come, else the last done.
export function currentPass(passes: RevisionPass[], today: string): RevisionPass | null {
  const ordered = passesInOrder(passes)
  const running = ordered.filter(p => passState(p, today) === 'running')
  return running[running.length - 1] ?? ordered.find(p => passState(p, today) === 'upcoming') ?? ordered[ordered.length - 1] ?? null
}

export interface OutlineFact { id: string; kind: string; parentId: string | null; title: string; order?: number }

// The project's chapters in outline order, and where each is said short: "Book 1 · Ch 3" (a chapter outside any book is "Ch 3").
export function chapterPlaces(outline: OutlineFact[]): { chapterIds: string[]; whereOf: (chapterId: string) => string } {
  const kids = new Map<string | null, OutlineFact[]>()
  for (const n of outline) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  for (const list of kids.values()) list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const chapterIds: string[] = []
  const where = new Map<string, string>()
  let books = 0
  let loose = 0
  const walk = (parentId: string | null, book: { number: number; chapters: number } | null) => {
    for (const n of kids.get(parentId) ?? []) {
      if (n.kind === 'book') { books += 1; walk(n.id, { number: books, chapters: 0 }); continue }
      if (n.kind === 'chapter') {
        chapterIds.push(n.id)
        if (book) { book.chapters += 1; where.set(n.id, `Book ${book.number} · Ch ${book.chapters}`) } else { loose += 1; where.set(n.id, `Ch ${loose}`) }
        continue
      }
      walk(n.id, book)
    }
  }
  walk(null, null)
  return { chapterIds, whereOf: id => where.get(id) ?? '' }
}
