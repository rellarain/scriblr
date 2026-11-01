import { describe, expect, it } from 'vitest'
import { newTask, type ActivityEvent } from './facets'
import { facetOfTask, nodeProgress, progressOf, subtaskProgress, withDescendants } from './taskProgress'

const ev = (nodeId: string, date: string, amount: number, over: Partial<ActivityEvent> = {}): ActivityEvent => ({
  ts: `${date}T10:00:00`, date, slot: 60, facet: 'draft', action: 'words', nodeId, kind: 'moment', label: null, amount, ...over,
})

describe('subtaskProgress', () => {
  it('is null without subtasks and counts the ticked ones', () => {
    expect(subtaskProgress(newTask('a', 'A', null))).toBeNull()
    const t = newTask('a', 'A', null, { subtasks: [{ id: '1', label: 'x', done: true }, { id: '2', label: 'y', done: false }, { id: '3', label: 'z', done: true }] })
    expect(subtaskProgress(t)).toMatchObject({ done: 2, total: 3 })
    expect(subtaskProgress(t)?.pct).toBeCloseTo(2 / 3)
  })
})

describe('withDescendants', () => {
  it('collects the node and everything under it, however deep', () => {
    const nodes = [{ id: 'b', parentId: null }, { id: 'c', parentId: 'b' }, { id: 's', parentId: 'c' }, { id: 'm', parentId: 's' }, { id: 'c2', parentId: 'b' }]
    expect([...withDescendants(nodes, 'c')].sort()).toEqual(['c', 'm', 's'])
  })
})

describe('nodeProgress', () => {
  const task = newTask('t', 'Draft ch 3', '2026-11-02', { facet: 'draft', targetNodeId: 'c', targetTree: 'outline', aim: 1000 })
  const covered = new Set(['c', 'm1', 'm2'])
  it('adds up the words written on the node since the task was added', () => {
    const events = [ev('m1', '2026-11-01', 500), ev('m1', '2026-11-02', 300), ev('m2', '2026-11-03', 200), ev('other', '2026-11-03', 900)]
    expect(nodeProgress(task, events, covered)).toMatchObject({ done: 500, total: 1000, pct: 0.5 })
  })
  it('does not go below zero or above the aim', () => {
    expect(nodeProgress(task, [ev('m1', '2026-11-03', -400)], covered)?.done).toBe(0)
    expect(nodeProgress(task, [ev('m1', '2026-11-03', 5000)], covered)?.pct).toBe(1)
  })
  it('counts nodes added for an outline or plot facet', () => {
    const plot = newTask('p', 'Add beats', '2026-11-01', { targetNodeId: 'c', targetTree: 'plot', aim: 4 })
    expect(facetOfTask(plot)).toBe('plot')
    const events = [ev('x', '2026-11-02', 1, { facet: 'plot', action: 'create' }), ev('y', '2026-11-02', 1, { facet: 'plot', action: 'edit' })]
    expect(nodeProgress(plot, events, new Set(['x', 'y']))).toMatchObject({ done: 1, total: 4 })
  })
  it('is null without an aim or a node', () => {
    expect(nodeProgress({ ...task, aim: null }, [], covered)).toBeNull()
    expect(nodeProgress({ ...task, targetNodeId: null }, [], covered)).toBeNull()
  })
})

describe('progressOf', () => {
  it('prefers the node bar and falls back to the subtasks', () => {
    const t = newTask('t', 'T', '2026-11-01', { targetNodeId: 'c', aim: 100, subtasks: [{ id: '1', label: 'x', done: true }] })
    expect(progressOf(t, [ev('c', '2026-11-02', 25)], new Set(['c']))?.total).toBe(100)
    expect(progressOf(t, [], null)?.total).toBe(1)
  })
})
