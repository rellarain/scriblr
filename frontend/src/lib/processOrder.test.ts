import { describe, expect, it } from 'vitest'
import { newMilestone, newProcess, type ProcessLink } from './facets'
import { isBlocked, openSteps, processStages, unmetMilestones } from './processOrder'

const proc = (id: string, links: ProcessLink[] = []) => newProcess(id, id, { links })

describe('processStages', () => {
  it('puts processes that come before and after one another in a sequence', () => {
    const r = processStages([proc('c', [{ otherId: 'b', relation: 'after' }]), proc('a', [{ otherId: 'b', relation: 'before' }]), proc('b')])
    expect(r.stages).toEqual([['a'], ['b'], ['c']])
    expect(r.cyclic).toEqual([])
  })

  it('keeps processes that go with each other in one stage, ahead of the one that follows them', () => {
    const r = processStages([proc('a', [{ otherId: 'b', relation: 'with' }, { otherId: 'c', relation: 'before' }]), proc('b'), proc('c')])
    expect(r.stages).toEqual([['a', 'b'], ['c']])
  })

  it('leaves unlinked processes in the first stage and ignores links to what is gone', () => {
    expect(processStages([proc('a'), proc('b', [{ otherId: 'gone', relation: 'before' }])]).stages).toEqual([['a', 'b']])
  })

  it('names the processes that go round in a circle instead of ordering them', () => {
    const r = processStages([proc('a', [{ otherId: 'b', relation: 'before' }]), proc('b', [{ otherId: 'a', relation: 'before' }]), proc('c')])
    expect(r.stages).toEqual([['c']])
    expect(r.cyclic.sort()).toEqual(['a', 'b'])
  })
})

describe('openSteps', () => {
  const step = (id: string) => ({ id, label: id, estimateMinutes: null, facet: null })
  it('opens only the next step of an ordered group, and every step left of an unordered one', () => {
    const steps = [step('1'), step('2'), step('3')]
    expect(openSteps({ id: 'g', ordered: true, steps }, new Set(['1']))).toEqual(['2'])
    expect(openSteps({ id: 'g', ordered: false, steps }, new Set(['1']))).toEqual(['2', '3'])
    expect(openSteps({ id: 'g', ordered: true, steps }, new Set(['1', '2', '3']))).toEqual([])
  })
})

describe('required milestones', () => {
  const p = newProcess('p', 'P', { requiredMilestoneIds: ['m1', 'm2', 'gone'] })
  it('are unmet until done, and one that no longer exists still blocks', () => {
    const ms = [newMilestone('m1', 'One', { done: true }), newMilestone('m2', 'Two')]
    expect(unmetMilestones(p, ms)).toEqual(['m2', 'gone'])
    expect(isBlocked(p, ms)).toBe(true)
    expect(isBlocked(newProcess('q', 'Q'), ms)).toBe(false)
  })
})
