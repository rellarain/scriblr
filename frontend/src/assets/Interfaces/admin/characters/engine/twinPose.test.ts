import { describe, expect, it } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup, normalizeContent } from '../modelContent'
import { shapeMarks, toggleAnchor, togglePosable } from './anchors'
import { apply } from './geometry'
import { makeTwin } from './pairEdit'
import { NEW_JOINT, addJointTurn, poseOf, setJointSetting } from './pivots'
import { beginReach, isPosed, movePose, resetPose, type PoseDrag } from './posing'
import { solve, type Solved } from './rig'

// Twins pose (slice 9d): a twin takes its original's pivot links, reflected across the centre line, between the twin objects, with turns of its own (read as the original's),
// so the two sides of a figure pose apart; its posable points are its original's, reflected.

const outline = (id: string, pts: Array<[number, number]>): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })),
})
const lock = (s: string, e: number, t: number): ModelBind => ({ kind: 'edge', s, i: 0, d: [0, 0], e, t, o: 0, pivot: { ...NEW_JOINT } })
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT } })
const bind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })

// a body across the middle (60..140, 40..100); on the picture's right an arm (124..136, 100..160) locked onto the body's bottom at (130, 100), the shoulder, and a forearm
// (124..136, 160..200) welded to the arm's bottom middle (130, 160), the elbow (bending 0 to 145), with a posable point at its bottom right; the arm group twinned
function figure(zones = false): ModelContent {
  let c = addGroup(blank('Twins'), newGroup('torso', 'Torso'))
  c = addObject(c, 'torso', { id: 'ob', name: 'Body', layer: 'body', shapes: [] })
  c = addShape(c, 'ob', outline('body', [[60, 40], [140, 40], [140, 100], [60, 100]]))
  c = addGroup(c, { ...newGroup('arm', 'Arm'), parent: 'torso' })
  for (const o of ['oa', 'of']) c = addObject(c, 'arm', { id: o, name: o, layer: 'body', shapes: [] })
  c = addShape(c, 'oa', bind(outline('upper', [[124, 100], [130, 100], [136, 100], [136, 160], [130, 160], [124, 160]]), 1, lock('body', 2, 0.125)))
  c = addShape(c, 'of', bind(outline('fore', [[124, 160], [130, 160], [136, 160], [136, 200], [124, 200]]), 1, weld('upper', 4)))
  c = setJointSetting(setJointSetting(c, 'fore', 1, 'lo', 0), 'fore', 1, 'hi', 145)
  c = { ...c, shapes: c.shapes.map(s => { if (s.id !== 'fore') return s; const r = togglePosable(s, 3); if (!r.ok) throw new Error(r.reason); return r.shape }) }
  let n = 0
  const twinned = makeTwin(c, 'group', 'arm', p => `${p}R${++n}`)
  if (!twinned.ok) throw new Error(twinned.reason)
  c = twinned.content
  return zones ? normalizeContent({ ...c, zones: [{ id: 'z', name: 'Body', groups: c.groups.map(g => g.id) }] }) : c
}
const twinOf = (c: ModelContent, id: string) => c.shapes.find(s => s.mirrorOf === id)!.id
const drawn = (s: Solved, id: string) => s.shapes[id].local.map(p => apply(s.shapes[id].matrix, p.x, p.y))
const mirrored = (pts: Array<[number, number]>) => pts.map(([x, y]) => [Math.round((200 - x) * 100) / 100, Math.round(y * 100) / 100])
const rounded = (pts: Array<[number, number]>) => pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])
const sorted = (pts: number[][]) => [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('a twin’s pivot points', () => {
  it('are its original’s, reflected, between the twin objects, with the limits read the other way round', () => {
    const c = figure(), pose = poseOf(c)
    const elbow = pose.joints.get(`${twinOf(c, 'fore')}:1`)!, shoulder = pose.joints.get(`${twinOf(c, 'upper')}:1`)!
    expect(elbow).toMatchObject({ at: [70, 160], lo: -145, hi: 0, turn: 0, twin: true })
    expect(elbow.to).toBe(pose.bodyOf.get(twinOf(c, 'upper')))
    // the shoulder joins the twin arm to the body in the middle
    expect(shoulder).toMatchObject({ at: [70, 100], to: 'ob', twin: true })
    expect(pose.jointed.has(pose.bodyOf.get(twinOf(c, 'fore'))!)).toBe(true)
  })

  it('turn on their own, kept on the twin as its original’s would read, within the original’s limits', () => {
    const c = figure(), id = `${twinOf(c, 'fore')}:1`
    const bent = addJointTurn(c, id, -30)
    expect(bent.shapes.find(s => s.id === twinOf(c, 'fore'))!.twinTurns).toEqual({ 1: 30 })
    expect(bent.shapes.find(s => s.id === 'fore')!.pts[1].bind!.pivot!.turn).toBe(0)
    expect(poseOf(bent).joints.get(id)!.turn).toBe(-30)
    // held to 0..145
    expect(addJointTurn(bent, id, -500).shapes.find(s => s.id === twinOf(c, 'fore'))!.twinTurns).toEqual({ 1: 145 })
    expect(addJointTurn(bent, id, 500).shapes.find(s => s.id === twinOf(c, 'fore'))!.twinTurns).toBeUndefined()
    expect(isPosed(bent)).toBe(true)
    expect(resetPose(bent).shapes.find(s => s.id === twinOf(c, 'fore'))!.twinTurns).toBeUndefined()
    expect(isPosed(resetPose(bent))).toBe(false)
  })

  for (const zones of [false, true]) {
    it(`pose the two sides apart${zones ? ' (in a model with zones)' : ''}`, () => {
      const c = figure(zones), tf = twinOf(c, 'fore')
      const left = setJointSetting(c, 'fore', 1, 'turn', 40)
      const s = solve(left)
      // the original's elbow bent; the twin's forearm where it is drawn
      expect(sorted(rounded(drawn(s, tf)))).toEqual(sorted(mirrored(drawn(solve(c), 'fore'))))
      expect(sorted(rounded(drawn(s, 'fore')))).not.toEqual(sorted(rounded(drawn(solve(c), 'fore'))))
      // the twin's own 40 is the original's 40, mirrored
      const right = addJointTurn(c, `${tf}:1`, -40)
      expect(sorted(rounded(drawn(solve(right), tf)))).toEqual(sorted(mirrored(drawn(s, 'fore'))))
      expect(sorted(rounded(drawn(solve(right), 'fore')))).toEqual(sorted(rounded(drawn(solve(c), 'fore'))))
    })
  }
})

describe('a twin’s posable points', () => {
  it('are its original’s, reflected, and reach the twin’s arm toward the pointer', () => {
    // the body anchored: the arm reaches from it
    const c0 = figure(true), tf = twinOf(c0, 'fore')
    const c = { ...c0, shapes: c0.shapes.map(s => { if (s.id !== 'body') return s; const r = toggleAnchor(s, 0); if (!r.ok) throw new Error(r.reason); return r.shape }) }
    const [mark] = shapeMarks(c, c.shapes.find(s => s.id === tf))
    expect(mark).toMatchObject({ kind: 'pose', x: 64, y: 200, i: null })
    const r = beginReach(c, tf, mark.id, [64, 200])
    if (!r.ok) throw new Error(r.reason)
    const posed = movePose(c, r.drag as PoseDrag, [40, 180])
    const s = solve(posed), [x, y] = apply(s.shapes[tf].matrix, mark.x, mark.y)
    expect(Math.hypot(x - 40, y - 180)).toBeLessThan(Math.hypot(64 - 40, 200 - 180))
    // the original side stays where it is drawn
    expect(sorted(rounded(drawn(s, 'fore')))).toEqual(sorted(rounded(drawn(solve(c), 'fore'))))
  })
})
