import { describe, expect, it, vi } from 'vitest'
import type { ModelBind, ModelContent, ModelShape } from '../../../../../api/types'
import { content as blank } from '../../../../../test/characterModelsBackend'
import { addGroup, addObject, addShape, newGroup, normalizeContent } from '../modelContent'
import { makeTwin } from './pairEdit'
import { NEW_JOINT, addJointTurn, setJointSetting } from './pivots'
import { POSES_MAX, applyPose, deletePose, freshPoseName, poseNow, renamePose, repairPoses, savePose } from './poses'
import { isPosed } from './posing'

// Saved poses (slice 9d): the pose as it stands kept by name (every pivot's turn, a twin's own too, and each figure's place) and put back later.
// (twinned figures are slow to build when the whole suite runs at once)
vi.setConfig({ testTimeout: 30000 })

const outline = (id: string, pts: Array<[number, number]>): ModelShape => ({
  id, name: id, closed: true, z: 40, op: 1, view: 'both', half: 0, template: null, pts: pts.map(([x, y]) => ({ x, y, m: 's' as const })),
})
const weld = (s: string, i: number): ModelBind => ({ kind: 'point', s, i, d: [0, 0], e: 0, t: 0, o: 0, pivot: { ...NEW_JOINT, lo: 0, hi: 145 } })
const bind = (s: ModelShape, i: number, b: ModelBind): ModelShape => ({ ...s, pts: s.pts.map((p, k) => (k === i ? { ...p, bind: b } : p)) })
function arms(): ModelContent {
  let c = addGroup(blank('Poses'), newGroup('arm', 'Arm'))
  for (const o of ['oa', 'of']) c = addObject(c, 'arm', { id: o, name: o, layer: 'body', shapes: [] })
  c = addShape(c, 'oa', outline('upper', [[124, 100], [136, 100], [136, 160], [130, 160], [124, 160]]))
  c = addShape(c, 'of', bind(outline('fore', [[124, 160], [130, 160], [136, 160], [136, 200], [124, 200]]), 1, weld('upper', 3)))
  const twinned = makeTwin(c, 'group', 'arm', p => `${p}R`)
  if (!twinned.ok) throw new Error(twinned.reason)
  return twinned.content
}
const turnOf = (c: ModelContent) => c.shapes.find(s => s.id === 'fore')!.pts[1].bind!.pivot!.turn
const twinId = (c: ModelContent) => c.shapes.find(s => s.mirrorOf === 'fore')!.id

describe('saving a pose', () => {
  it('keeps every pivot’s turn, a twin’s own too, under a name', () => {
    let c = setJointSetting(arms(), 'fore', 1, 'turn', 60)
    c = addJointTurn(c, `${twinId(c)}:1`, -30)
    expect(poseNow(c).turns).toEqual({ 'fore:1': 60, [`${twinId(c)}:1`]: 30 })
    const r = savePose(c, '  Wave ')
    if (!r.ok) throw new Error(r.reason)
    expect(r.content.poses).toEqual([{ id: 'pose1', name: 'Wave', turns: { 'fore:1': 60, [`${twinId(c)}:1`]: 30 }, places: {} }])
    expect(freshPoseName(r.content)).toBe('Pose 1')
    // no name: the next free one
    expect((savePose(r.content, '') as { content: ModelContent }).content.poses![1]).toMatchObject({ id: 'pose2', name: 'Pose 1' })
  })
  it('is refused with nothing posed, or past the limit', () => {
    expect(savePose(arms(), 'Rest')).toEqual({ ok: false, reason: 'Nothing is posed: drag the figure into a pose first.' })
    const full = { ...setJointSetting(arms(), 'fore', 1, 'turn', 10), poses: Array.from({ length: POSES_MAX }, (_, n) => ({ id: `p${n}`, name: `P${n}`, turns: {} })) }
    expect(savePose(full, 'One more').ok).toBe(false)
  })
})

describe('putting a pose back', () => {
  it('puts every other pivot at rest and its own turns back, held to the limits as they are now', () => {
    const posed = addJointTurn(setJointSetting(arms(), 'fore', 1, 'turn', 60), `${twinId(arms())}:1`, -30)
    const saved = (savePose(posed, 'Wave') as { content: ModelContent }).content
    // moved on since, and the elbow's limit lowered
    let c = setJointSetting(saved, 'fore', 1, 'turn', 10)
    c = setJointSetting(c, 'fore', 1, 'hi', 45)
    const back = applyPose(c, 'pose1')
    expect(turnOf(back)).toBe(45)
    expect(back.shapes.find(s => s.id === twinId(c))!.twinTurns).toEqual({ 1: 30 })
    // a pose that is gone changes nothing
    expect(applyPose(c, 'nope')).toBe(c)
  })
  it('is renamed and deleted, and its turns are repaired on load', () => {
    const saved = (savePose(setJointSetting(arms(), 'fore', 1, 'turn', 20), 'Wave') as { content: ModelContent }).content
    expect(renamePose(saved, 'pose1', ' Salute ').poses![0].name).toBe('Salute')
    expect(renamePose(saved, 'pose1', '  ').poses![0].name).toBe('Wave')
    expect(deletePose(saved, 'pose1').poses).toEqual([])
    expect(repairPoses([{ id: 'p', name: '', turns: { 'a:1': 400, nope: 3, 'b:2': 0 }, places: { o: { dx: 1, dy: 2, turn: 3 }, 'x y': { dx: 1 } } }, { id: 'p' }, 'x']))
      .toEqual([{ id: 'p', name: 'Pose', turns: { 'a:1': 180 }, places: { o: { dx: 1, dy: 2, turn: 3 } } }])
    expect(normalizeContent(saved).poses).toHaveLength(1)
    expect(isPosed(applyPose(saved, 'pose1'))).toBe(true)
  })
})
