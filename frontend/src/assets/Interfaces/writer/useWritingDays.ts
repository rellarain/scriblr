import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api/client'

// What was written each day across some projects (the backend's daily activity log, summed): words (the day's net change in the draft, never
// below zero), edits (saves of the outline and the plot) and revisions saved.

export interface WritingDay { words: number; edits: number; revisions: number }
export type WritingDays = Record<string, WritingDay>

interface ActivityPayload {
  daily?: { days?: Record<string, { wordCountDelta?: number; outlineSaves?: number; plotSaves?: number; draftRevisions?: number }> }
}

export function mergeDays(payloads: ActivityPayload[]): WritingDays {
  const out: WritingDays = {}
  for (const p of payloads) {
    for (const [date, d] of Object.entries(p?.daily?.days ?? {})) {
      const day = out[date] ?? { words: 0, edits: 0, revisions: 0 }
      day.words += d.wordCountDelta ?? 0
      day.edits += (d.outlineSaves ?? 0) + (d.plotSaves ?? 0)
      day.revisions += d.draftRevisions ?? 0
      out[date] = day
    }
  }
  // A day's words are its net change; a day that took words out is a quiet one for the calendar.
  for (const day of Object.values(out)) day.words = Math.max(0, day.words)
  return out
}

export function useWritingDays(projectIds: string[]) {
  const key = projectIds.join(',')
  const [payloads, setPayloads] = useState<ActivityPayload[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setPayloads(null)
    setError(null)
    if (projectIds.length === 0) { setPayloads([]); return undefined }
    Promise.all(projectIds.map(id => api.get<ActivityPayload>(`/projects/${encodeURIComponent(id)}/activity`)))
      .then(list => { if (live) setPayloads(list) })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not load your writing activity.') })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const days = useMemo(() => (payloads ? mergeDays(payloads) : null), [payloads])
  return { days, error }
}
