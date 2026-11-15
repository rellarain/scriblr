import { describe, expect, it } from 'vitest'
import { boardColumns, childrenOf, movedBefore, myWork, nextStatus, openCounts, progressOf, timeline } from './planLogic'
import type { PlanItem } from './planTypes'

const item = (id: string, over: Partial<PlanItem> = {}): PlanItem => ({
  id, nodeId: 'writer/draft', kind: 'task', title: id, notes: '', parentId: null, ordered: true, order: 0, status: 'todo', priority: 'normal',
  start: null, due: null, assignee: null, claimedBy: '', statementIds: [], recurrence: null, createdAt: '', doneAt: null,
  can: { edit: true, status: true, claim: true }, ...over,
})

describe('planLogic', () => {
  it('lists a level in order and counts a container\'s tasks done', () => {
    const items = [item('p', { kind: 'process' }), item('b', { parentId: 'p', order: 1, status: 'done' }), item('a', { parentId: 'p', order: 0 }), item('c', { nodeId: 'reader' })]
    expect(childrenOf(items, 'writer/draft', 'p').map(i => i.id)).toEqual(['a', 'b'])
    expect(progressOf(items, 'p')).toEqual({ done: 1, total: 2 })
    expect(progressOf(items, 'a')).toBeNull()
    expect(openCounts(items).get('writer/draft')).toBe(2)
  })

  it('moves an id before another, or to the end', () => {
    expect(movedBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
    expect(movedBefore(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a'])
  })

  it('sorts my work by priority then due date, and offers what nobody has', () => {
    const items = [
      item('low', { assignee: { kind: 'staff', id: 'me' }, priority: 'low' }),
      item('urgent', { claimedBy: 'me', priority: 'urgent' }),
      item('soon', { assignee: { kind: 'staff', id: 'me' }, due: '2026-11-17' }),
      item('later', { assignee: { kind: 'staff', id: 'me' }, due: '2026-12-01' }),
      item('free'), item('theirs', { assignee: { kind: 'staff', id: 'them' } }), item('box', { kind: 'process' }),
      item('finished', { claimedBy: 'me', status: 'done', doneAt: '2026-11-10' }),
    ]
    const w = myWork(items, 'me')
    expect(w.mine.map(i => i.id)).toEqual(['urgent', 'soon', 'later', 'low'])
    expect(w.open.map(i => i.id)).toEqual(['free'])
    expect(w.done.map(i => i.id)).toEqual(['finished'])
  })

  it('splits the board by status and moves an item along', () => {
    const cols = boardColumns([item('a'), item('b', { status: 'inProgress' }), item('c', { status: 'done' })])
    expect(Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v.map(i => i.id)]))).toEqual({ todo: ['a'], claimed: [], inProgress: ['b'], done: ['c'] })
    expect(nextStatus('todo')).toBe('claimed')
    expect(nextStatus('done')).toBe('done')
  })

  it('lays dated items out as bars by node, a single date as one day', () => {
    const t = timeline([
      item('a', { start: '2026-11-01', due: '2026-11-10' }),
      item('b', { nodeId: 'reader', due: '2026-11-20' }),
      item('undated'),
    ], '2026-11-05')!
    expect([t.from, t.to, t.days]).toEqual(['2026-11-01', '2026-11-20', 20])
    expect(t.rows.map(r => r.nodeId)).toEqual(['reader', 'writer/draft'])
    expect(t.rows[1].bars[0]).toMatchObject({ left: 0, width: 50 })
    expect(t.rows[0].bars[0]).toMatchObject({ left: 95, width: 5 })
    expect(t.todayAt).toBeCloseTo(22.5)
    expect(t.rows.map(r => r.lanes)).toEqual([1, 1])
    expect(timeline([item('x')])).toBeNull()
    // Overlapping bars take lanes of their own; one that starts after another ends shares its lane.
    const lanes = timeline([
      item('long', { start: '2026-11-01', due: '2026-11-30' }), item('in', { start: '2026-11-05', due: '2026-11-08' }), item('after', { start: '2026-11-10', due: '2026-11-12' }),
    ])!
    expect(Object.fromEntries(lanes.rows[0].bars.map(b => [b.item.id, b.lane]))).toEqual({ long: 0, in: 1, after: 1 })
    expect(lanes.rows[0].lanes).toBe(2)
  })
})
