import type { PlanItem, Planner } from './facets'

// A one-off shift that has ended (or been skipped) with tasks still undone sends them back to the backlog, at the top of their priority and marked
// "carried". A task on a repeating shift stays on it (it is ticked a day at a time), and routines never carry over.

// The tasks on a one-off shift that is over (an earlier day, today past its end, or skipped) and not done, each with the day of its shift.
export function endedItems(planner: Planner, today: string, nowSlot: number): { item: PlanItem; date: string }[] {
  const over = new Map(
    planner.shifts
      .filter(s => !s.recurrence && (s.skipped.includes(s.date) || s.date < today || (s.date === today && s.endSlot <= nowSlot)))
      .map(s => [s.id, s.date]),
  )
  return planner.items.flatMap(item => (item.shiftId && over.has(item.shiftId) && !item.doneOn ? [{ item, date: over.get(item.shiftId) as string }] : []))
}

// The planner with those tasks dealt with: back in the backlog (carried) unless they were ticked on the day of their shift, which makes them done that
// day. The same planner when there are none.
export function carryForward(planner: Planner, today: string, nowSlot: number, isTicked: (date: string, itemId: string) => boolean = () => false): Planner {
  const ended = new Map(endedItems(planner, today, nowSlot).map(e => [e.item.id, e.date]))
  if (ended.size === 0) return planner
  return {
    ...planner,
    items: planner.items.map((i: PlanItem) => {
      const date = ended.get(i.id)
      if (date === undefined) return i
      return isTicked(date, i.id) ? { ...i, doneOn: date } : { ...i, shiftId: null, carried: true }
    }),
  }
}
