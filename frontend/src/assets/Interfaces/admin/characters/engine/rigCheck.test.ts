import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelGroup, ModelShape } from '../../../../../api/types'
import { blankContent, newGroup } from '../modelContent'
import { rigCheck } from './rigCheck'
import { addRange, addTurn, addScale, attachGroup, newRange, reparent, setPivot } from './rigEdit'

const poly = (id: string, pts: Array<[number, number]>): ModelShape => ({ id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })) })
const g = (id: string, objects: string[]): ModelGroup => newGroup(id, id, null, objects)
const ok = (e: { ok: boolean; content?: ModelContent; reason?: string }): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content! }

const figure = (): ModelContent => ({
  ...blankContent('Fig'),
  shapes: [poly('neck', [[90, 60], [110, 60], [110, 90], [90, 90]]), poly('head', [[80, 20], [120, 20], [120, 60], [80, 60]])],
  objects: [{ id: 'oNeck', name: 'Neck', layer: 'body', shapes: ['neck'] }, { id: 'oHead', name: 'Head', layer: 'body', shapes: ['head'] }],
  groups: [g('torso', ['oNeck']), g('headG', ['oHead'])],
})

describe('the rig check', () => {
  it('says nothing about a model with no rig', () => { expect(rigCheck(figure())).toEqual([]) })

  it('notices a slider that drives nothing', () => {
    const c = ok(addRange(figure(), newRange('r1', 'Nodding', 'turn')))
    expect(rigCheck(c).map(l => l.text)).toEqual(['Slider Nodding drives nothing yet.'])
  })

  it('notices a group the anchor moves away from where it was drawn, and not one that sits on its anchor', () => {
    let c = ok(reparent(figure(), 'headG', 'torso'))
    c = ok(attachGroup(c, 'headG', { shape: 'neck', kind: 'point', i: 0, t: 0, slider: null, rx: 0.5, ry: 0.5 }))
    expect(rigCheck(c)).toEqual([])                                    // attaching put the pivot on the anchor
    expect(rigCheck(setPivot(c, 'headG', 120, 60)).map(l => l.text)).toEqual(['Group headG is moved by its anchor at rest: its pivot is not on the anchor.'])
  })

  it('notices a slider that sends a shape out of the picture', () => {
    let c = ok(addRange(figure(), newRange('r1', 'Size', 'scale')))
    c = ok(addScale(c, 'r1', 'group', 'headG'))
    c = { ...c, ranges: c.ranges.map(r => ({ ...r, max: 1000, drives: r.drives.map(d => ({ ...d, atMax: 1000 })) })) }
    expect(rigCheck(c).some(l => /Slider Size at its maximum sends head outside the picture/.test(l.text))).toBe(true)
  })

  it('stays quiet for a slider that keeps everything in the picture', () => {
    let c = ok(addRange(figure(), newRange('r1', 'Tilt', 'turn')))
    c = ok(addTurn(c, 'r1', 'headG'))
    expect(rigCheck(c)).toEqual([])
  })

  it('lists at most eight lines', () => {
    let c = figure()
    for (let i = 0; i < 12; i++) c = ok(addRange(c, newRange(`r${i}`, `R${i}`, 'turn')))
    expect(rigCheck(c)).toHaveLength(8)
  })
})
