// Undo into today's activity log. When the in-memory history of an edit is used up, Undo goes on into what the backend logged today (UTC,
// as the backend counts the day): the outline and plot snapshots, a chapter's revisions and the settings logs. Two kinds of entry:
//  - a snapshot (outline, plot, chapter revision) is a state AFTER a change: Undo goes to the entry older than the one the state is at;
//  - a settings entry holds the value BEFORE its change: Undo restores it.
// A cursor (the id of the entry last gone back to) keeps the place across saves, which add entries of their own on top.

export interface LogEntry { id: string; createdAt: string }

// The UTC date of a timestamp the backend wrote ("2026-10-10T20:03:21Z").
export const dayOf = (iso: string): string => iso.slice(0, 10)
export const todayUtc = (now: Date = new Date()): string => now.toISOString().slice(0, 10)
export const isToday = (iso: string, now: Date = new Date()): boolean => dayOf(iso) === todayUtc(now)

export const newestFirst = <T extends LogEntry>(list: T[]): T[] => [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

// A snapshot log (newest first): the state to go back to, or null when none is left. The state now is at `cursor` (the newest entry before
// the first Undo); the entry must be from today, and an older one has to exist to go back to.
export function nextSnapshot<T extends LogEntry>(list: T[], cursor: string | null, now?: Date): T | null {
  const at = cursor === null ? 0 : list.findIndex(e => e.id === cursor)
  if (at < 0 || at + 1 >= list.length) return null
  return isToday(list[at].createdAt, now) ? list[at + 1] : null
}

// A settings log (newest first): the entry to undo next, or null. `cursor` is the entry last undone (null before the first Undo).
export function nextSetting<T extends LogEntry>(list: T[], cursor: string | null, now?: Date): T | null {
  const at = cursor === null ? 0 : list.findIndex(e => e.id === cursor) + 1
  if (cursor !== null && at === 0) return null
  const entry = list[at]
  return entry && isToday(entry.createdAt, now) ? entry : null
}

// Is this value the one to go back to? A snapshot equal to what is shown changes nothing, so Undo goes past it.
export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
