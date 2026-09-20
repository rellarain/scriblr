// Dates in the chapter header: short ("Sep 19, 2026"), with the full date and
// time as the hover title.

export function shortDate(iso: string, locale?: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fullDate(iso: string, locale?: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

// The newest of some ISO timestamps (ignoring missing or invalid ones), or null.
export function latestOf(times: Array<string | null | undefined>): string | null {
  let best: string | null = null
  let bestMs = -Infinity
  for (const t of times) {
    if (!t) continue
    const ms = new Date(t).getTime()
    if (!Number.isNaN(ms) && ms > bestMs) { best = t; bestMs = ms }
  }
  return best
}

// What the chapter header shows under the title; a missing one is left out.
export interface ChapterMeta {
  created: string | null
  edited: string | null
  published: string | null
}
