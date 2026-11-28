import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup, normalizeContent } from '../modelContent'
import { LIMITS_FOR_DEFAULT, applyLimitsFor, jointName, jointRows, limitsOf, nameJoint, repairLimitsFor, setJointKind, twinJointName } from './jointLimits'
import { makeTwin } from './pairEdit'
import { NEW_JOINT, poseOf, repairJoint, setJointSetting } from './pivots'

// Joint limits (slice 9d): a pivot point named and standing for a joint of the body takes that joint's measured limits, adjusted for the body the model is.

const outline = (id: string, pts: Array<[number, number]>): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })),
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT } })
const bind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })
function arm(): ModelContent {
  let c = addGroup(blank('Limits'), newGroup('arm', 'Arm'))
  for (const o of ['oa', 'of']) c = addObject(c, 'arm', { id: o, name: o, layer: 'body', shapes: [] })
  c = addShape(c, 'oa', outline('upper', [[124, 100], [136, 100], [136, 160], [130, 160], [124, 160]]))
  return addShape(c, 'of', bind(outline('fore', [[124, 160], [130, 160], [136, 160], [136, 200], [124, 200]]), 1, weld('upper', 3)))
}
const joint = (c: ModelContent) => c.shapes.find(s => s.id === 'fore')!.pts[1].bind!.pivot!

describe('the table of limits', () => {
  it('gives the measured adult ranges, turned toward the middle', () => {
    expect(limitsOf('elbow')).toEqual({ lo: 0, hi: 145 })
    expect(limitsOf('knee')).toEqual({ lo: -140, hi: 0 })
    expect(limitsOf('shoulder')).toEqual({ lo: -180, hi: 30 })
    expect(limitsOf('neck')).toEqual({ lo: -45, hi: 45 })
  })
  it('is adjusted for women, children, hypermobility and age', () => {
    // women: 5 more at the bend, 5 past straight
    expect(limitsOf('elbow', { sex: 'women', age: 'adult', hyper: false })).toEqual({ lo: -5, hi: 150 })
    expect(limitsOf('knee', { sex: 'women', age: 'adult', hyper: false })).toEqual({ lo: -145, hi: 5 })
    // a child straightens 5 past; hypermobile 10 past and a tenth more
    expect(limitsOf('elbow', { sex: 'men', age: 'child', hyper: false })).toEqual({ lo: -5, hi: 145 })
    expect(limitsOf('elbow', { sex: 'men', age: 'adult', hyper: true })).toEqual({ lo: -10, hi: 160 })
    // an elder: a tenth less, and nothing past straight
    expect(limitsOf('elbow', { sex: 'women', age: 'elder', hyper: false })).toEqual({ lo: 0, hi: 135 })
    expect(limitsOf('neck', { sex: 'men', age: 'elder', hyper: false })).toEqual({ lo: -41, hi: 41 })
  })
  it('reads a body it does not know as the default', () => {
    expect(repairLimitsFor({ sex: 'x', age: 'teen', hyper: 'yes' })).toEqual(LIMITS_FOR_DEFAULT)
    expect(repairLimitsFor({ sex: 'women', age: 'elder', hyper: true })).toEqual({ sex: 'women', age: 'elder', hyper: true })
    expect(repairLimitsFor(null)).toBeNull()
  })
})

describe('a joint of the body', () => {
  it('is named, and takes the limits of the joint it stands for, its turn held inside them', () => {
    let c = setJointSetting(arm(), 'fore', 1, 'turn', -40)
    c = setJointKind(nameJoint(c, 'fore', 1, '  Elbow (left) '), 'fore', 1, 'elbow')
    expect(joint(c)).toEqual({ turn: 0, lo: 0, hi: 145, name: 'Elbow (left)', kind: 'elbow' })
    expect(jointRows(c).map(r => [r.id, jointName(r.joint)])).toEqual([['fore:1', 'Elbow (left)']])
    // changing the limits by hand keeps its name and kind
    expect(setJointSetting(c, 'fore', 1, 'hi', 120).shapes.find(s => s.id === 'fore')!.pts[1].bind!.pivot).toMatchObject({ hi: 120, name: 'Elbow (left)', kind: 'elbow' })
    // no name: what it stands for; standing for nothing keeps its limits
    expect(jointName(joint(nameJoint(c, 'fore', 1, '')))).toBe('Elbow')
    expect(joint(setJointKind(c, 'fore', 1, null))).toEqual({ turn: 0, lo: 0, hi: 145, name: 'Elbow (left)' })
  })
  it('follows the body the model is set for', () => {
    const c = applyLimitsFor(setJointKind(arm(), 'fore', 1, 'elbow'), { sex: 'women', age: 'adult', hyper: false })
    expect(c.limitsFor).toEqual({ sex: 'women', age: 'adult', hyper: false })
    expect(joint(c)).toMatchObject({ lo: -5, hi: 150 })
    // a joint standing for nothing is left as it is
    expect(joint(applyLimitsFor(arm(), { sex: 'women', age: 'elder', hyper: false }))).toEqual(NEW_JOINT)
    // a new kind takes the model's body
    expect(joint(setJointKind(applyLimitsFor(arm(), { sex: 'men', age: 'adult', hyper: true }), 'fore', 1, 'elbow'))).toMatchObject({ lo: -10, hi: 160 })
  })
  it('keeps its name and kind through a repair, and a twin’s own turn stays inside its original’s limits', () => {
    expect(repairJoint({ turn: 5, lo: 0, hi: 145, name: ' Knee ', kind: 'knee' })).toEqual({ turn: 5, lo: 0, hi: 145, name: 'Knee', kind: 'knee' })
    expect(repairJoint({ turn: 5, kind: 'tail' })).toEqual({ turn: 5, lo: -180, hi: 180 })
    let c = setJointKind(arm(), 'fore', 1, 'elbow')
    const twinned = makeTwin(c, 'group', 'arm', p => `${p}R`)
    if (!twinned.ok) throw new Error(twinned.reason)
    c = twinned.content
    const tf = c.shapes.find(s => s.mirrorOf === 'fore')!.id
    c = { ...c, shapes: c.shapes.map(s => (s.id === tf ? { ...s, twinTurns: { 1: 170 } } : s)) }
    expect(poseOf(c).joints.get(`${tf}:1`)!.turn).toBe(-145)
    expect(twinJointName('Elbow (left)')).toBe('Elbow (right)')
    expect(twinJointName('Neck')).toBe('Neck (twin)')
  })
  it('is kept through the model’s repair', () => {
    const c = normalizeContent(applyLimitsFor(setJointKind(arm(), 'fore', 1, 'elbow'), { sex: 'women', age: 'child', hyper: false }))
    expect(c.limitsFor).toEqual({ sex: 'women', age: 'child', hyper: false })
    expect(joint(c)).toMatchObject({ kind: 'elbow' })
  })
})
