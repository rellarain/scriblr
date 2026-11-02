import type { ShiftOccurrence } from '../../../../lib/recurrence'
import { durationText, type NextUp } from '../../../../lib/nextUp'
import { slotTime } from '../../../../lib/facets'

// The bar at the top of the Agenda: the shift running now (what is left of it and how many of its tasks are ticked off) or else the next one to start and
// the time until it. Pressing it opens the shift.

const dayName = (d: string): string => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

export function NextUpBar<T extends ShiftOccurrence>({ up, tasks, color, onOpen }: { up: NextUp<T>; tasks: { done: number; total: number }; color?: string; onOpen: () => void }) {
  const o = up.occ
  const name = o.title || 'New shift'
  const when = up.kind === 'running'
    ? `${durationText(up.minutes)} left`
    : up.days === 0 ? `in ${durationText(up.minutes)}` : up.days === 1 ? `tomorrow at ${slotTime(o.startSlot)}` : `${dayName(o.date)} at ${slotTime(o.startSlot)}`
  return (
    <button
      type="button" className={`wrNextUp wrNextUp--${up.kind}`} onClick={onOpen} style={{ ['--wr-bc' as string]: `var(--wr-f-${o.facet})`, ...(color ? { ['--wr-pc' as string]: color } : {}) }}
      aria-label={`${up.kind === 'running' ? 'Now' : 'Next'}: ${name}, ${when}${tasks.total ? `, ${tasks.done} of ${tasks.total} tasks ticked` : ''}`}
    >
      <span className="wrNextUpTag">{up.kind === 'running' ? 'Now' : 'Next'}</span>
      <b>{name}</b>
      <small>{when}{tasks.total > 0 ? ` · ${tasks.done}/${tasks.total} tasks` : ''}</small>
    </button>
  )
}
