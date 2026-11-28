import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup } from '../modelContent'
import { NO_COLOURING } from './colour'
import { apply } from './geometry'
import { BLADE_AFTER, BLADE_SHARE, setFollow } from './jointLimits'
import { makeTwin } from './pairEdit'
import { paintShapes } from './paint'
import { NEW_JOINT, addJointTurn, followTurn, poseOf, setJointSetting } from './pivots'
import { solve } from './rig'

// Smooth bends (slice 9d): the shoulder blade following the arm (past 30° it takes a third of the turn, turning about its own place, so a raised arm lifts the shoulder,
// the arm still turning the joint's turn in all), on a twin too; and a joint cap drawn where the figure is posed.

const outline = (id: string, pts: Array<[number, number]>, extra: Partial<ModelShape> = {}): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })), ...extra,
})
// a body in the middle; an arm (group arm) hanging from its shoulder (130, 100), with a forearm (group fore, capped) from its elbow (130, 160), both joined by pivot points
// that turn at the joints; the arm twinned
function figure(): ModelContent {
  let c = addGroup({ ...blank('Bends'), joins: true }, newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', outline('body', [[60, 40], [140, 40], [140, 110], [60, 110]], { join: 'Body' }))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso', pivot: [130, 100] })
  c = addObject(c, 'arm', { id: 'oa', name: 'Arm', layer: 'body', shapes: [] })
  const shoulder: ModelBind = { kind: 'point', s: 'body', i: 2, d: [-10, -10], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT, kind: 'shoulder', at: [130, 100] } }
  c = addShape(c, 'oa', { ...outline('upper', [[124, 100], [136, 100], [136, 164], [124, 164]], { join: 'Arms' }), pts: outline('upper', [[124, 100], [136, 100], [136, 164], [124, 164]]).pts.map((p, i) => (i === 1 ? { ...p, bind: shoulder } : p)) })
  c = addGroup(c, { ...newGroup('fore', 'Forearm'), parent: 'arm', pivot: [130, 160], cap: 1.05 })
  c = addObject(c, 'fore', { id: 'of', name: 'Forearm', layer: 'body', shapes: [] })
  const elbow: ModelBind = { kind: 'point', s: 'upper', i: 2, d: [-6, -4], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT, at: [130, 160] } }
  const fore = outline('fore', [[124, 156], [136, 156], [136, 200], [124, 200]], { join: 'Arms' })
  c = addShape(c, 'of', { ...fore, pts: fore.pts.map((p, i) => (i === 3 ? { ...p, bind: elbow } : p)) })
  const twinned = makeTwin(c, 'group', 'arm', p => `${p}R`)
  if (!twinned.ok) throw new Error(twinned.reason)
  return twinned.content
}
const drawnAt = (c: ModelContent, id: string, i: number) => { const s = solve(c).shapes[id], q = s.local[i]; return apply(s.matrix, q.x, q.y) }

describe('the shoulder blade following the arm', () => {
  it('is turned on with its place, after and share, and off again', () => {
    const on = setFollow(figure(), 'upper', 1, true)
    expect(on.shapes.find(s => s.id === 'upper')!.pts[1].bind!.pivot!.follow).toEqual({ at: [106, 100], after: BLADE_AFTER, share: BLADE_SHARE })
    expect(setFollow(on, 'upper', 1, false).shapes.find(s => s.id === 'upper')!.pts[1].bind!.pivot!.follow).toBeUndefined()
  })
  it('takes a third of the turn past 30°, so the arm turns as far in all but its shoulder rises', () => {
    expect(followTurn({ at: [0, 0], after: 30, share: 0.33 }, -120)).toBeCloseTo(-29.7)
    expect(followTurn({ at: [0, 0], after: 30, share: 0.33 }, 20)).toBe(0)
    const plain = setJointSetting(figure(), 'upper', 1, 'turn', -120), follows = setJointSetting(setFollow(figure(), 'upper', 1, true), 'upper', 1, 'turn', -120)
    const angle = (c: ModelContent) => { const m = poseOf(c).objectMats.get('oa')!; return (Math.atan2(m[1], m[0]) * 180) / Math.PI }
    expect(angle(follows)).toBeCloseTo(angle(plain), 6)
    // the shoulder lifted (up is smaller y) and the hand higher with it
    expect(poseOf(follows).points.get('upper:1')![1]).toBeLessThan(poseOf(plain).points.get('upper:1')![1] - 5)
    expect(drawnAt(follows, 'fore', 2)[1]).toBeLessThan(drawnAt(plain, 'fore', 2)[1])
  })
  it('follows the twin’s arm the other way round', () => {
    let c = setFollow(figure(), 'upper', 1, true)
    const tu = c.shapes.find(s => s.mirrorOf === 'upper')!.id
    expect(poseOf(c).joints.get(`${tu}:1`)!.follow).toEqual({ at: [94, 100], after: BLADE_AFTER, share: BLADE_SHARE })
    const left = setJointSetting(c, 'upper', 1, 'turn', -120)
    c = addJointTurn(c, `${tu}:1`, 120)
    // the twin's points run the other way round: its outline as a whole is the mirror image
    const tf = c.shapes.find(s => s.mirrorOf === 'fore')!.id
    const all = (m: ModelContent, id: string, flip: boolean) => solve(m).shapes[id].local.map(q => apply(solve(m).shapes[id].matrix, q.x, q.y)).map(([x, y]) => [Math.round((flip ? 200 - x : x) * 10) / 10, Math.round(y * 10) / 10]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    expect(all(c, tf, false)).toEqual(all(left, 'fore', true))
  })
})

describe('a joint cap on a posed figure', () => {
  it('is drawn at the elbow where the shoulder has taken it', () => {
    const c = setJointSetting(figure(), 'upper', 1, 'turn', -90)
    const cap = paintShapes(c, solve(c), NO_COLOURING).find(i => i.id === 'cap-fore')!
    // the arm out to the picture's right: the elbow 60 out from the shoulder, at (190, 100)
    const [cx, cy] = cap.d.slice(1).split('A')[0].split(' ').map(Number), r = Number(cap.d.split('A')[1].split(' ')[0])
    expect(cx + r).toBeCloseTo(190, 0)
    expect(cy).toBeCloseTo(100, 0)
    expect(r).toBeLessThan(8)
  })
})
