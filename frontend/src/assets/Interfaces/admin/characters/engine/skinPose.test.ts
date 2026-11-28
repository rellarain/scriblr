import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { apply } from './geometry'
import { NEW_JOINT, setJointSetting } from './pivots'
import { solve } from './rig'

// Smooth bends (slice 9d): skin weights follow a figure posed at its pivot points as they follow its sliders: a forearm's point that follows the upper arm stays with it
// when the elbow turns, one that follows it in part turns part of the way.

const outline = (id: string, pts: Array<[number, number]>, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...extra,
})
// an upper arm (group up) and a forearm (group fore, hanging from it at the elbow, 130, 160), joined by a pivot point that turns at the elbow; the forearm's first two
// points (its top corners) follow the upper arm, the first all the way and the second half
function arm(): ModelContent {
  let c = addGroup(blank('Bends'), newGroup('up', 'Upper arm'))
  c = addObject(c, 'up', { id: 'oa', name: 'Upper arm', layer: 'body', shapes: [] })
  c = addShape(c, 'oa', outline('upper', [[124, 100], [136, 100], [136, 164], [124, 164]]))
  c = addGroup(c, { ...newGroup('fore', 'Forearm'), parent: 'up', pivot: [130, 160] })
  c = addObject(c, 'fore', { id: 'of', name: 'Forearm', layer: 'body', shapes: [] })
  const elbow: ModelBind = { kind: 'point', s: 'upper', i: 2, d: [-6, -4], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT, at: [130, 160] } }
  const fore = outline('fore', [[124, 156], [136, 156], [136, 200], [124, 200]], { skin: [{ g: 'up', w: [1, 0.5, 0, 0] }] })
  return addShape(c, 'of', { ...fore, pts: fore.pts.map((p, i) => (i === 3 ? { ...p, bind: elbow } : p)) })
}
const at = (c: ModelContent, id: string, i: number) => { const s = solve(c).shapes[id], q = s.local[i]; return apply(s.matrix, q.x, q.y) }

describe('skin weights on a posed figure', () => {
  it('keep a point that follows the upper arm with it as the elbow turns, and turn one that follows it in part part of the way', () => {
    const rest = arm(), bent = setJointSetting(rest, 'fore', 3, 'turn', 90)
    // all the way with the upper arm: where it was
    expect(at(bent, 'fore', 0)[0]).toBeCloseTo(at(rest, 'fore', 0)[0], 3)
    expect(at(bent, 'fore', 0)[1]).toBeCloseTo(at(rest, 'fore', 0)[1], 3)
    // not at all: turned the whole 90° about the elbow, (136, 200) to (90, 166)
    const full = at(bent, 'fore', 2)
    expect(full[0]).toBeCloseTo(90, 1)
    expect(full[1]).toBeCloseTo(166, 1)
    // half: 45° about the elbow, (136, 156) about (130, 160)
    const half = at(bent, 'fore', 1), r = Math.hypot(6, -4), a0 = Math.atan2(-4, 6), a = a0 + Math.PI / 4
    expect(half[0]).toBeCloseTo(130 + r * Math.cos(a), 1)
    expect(half[1]).toBeCloseTo(160 + r * Math.sin(a), 1)
  })
})
