import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../../api/types'
import { normalizeContent } from '../modelContent'
import { shapeMarks } from './anchors'
import { apply, rotate } from './geometry'
import { jointRows } from './jointLimits'
import { poseOf } from './pivots'
import { beginReach, movePose, type PoseDrag } from './posing'
import { solve } from './rig'

// The body templates' rig (slice 9d), read from the seed the server serves: every part joined to the one it hangs from at its pivot, the pelvis anchored, the right side
// the twin of the left; a hand dragged reaches with its own arm only, each joint within its limits.

const seed = JSON.parse(readFileSync(new URL('../../../../../../../backend/app/seed/body_templates.json', import.meta.url), 'utf-8')) as { templates: Array<{ id: string; content: ModelContent }> }
const templates = seed.templates.map(t => ({ id: t.id, content: normalizeContent(t.content) }))
const markAt = (c: ModelContent, shapeId: string, name: string) => {
  const m = shapeMarks(c, c.shapes.find(s => s.id === shapeId))!.find(k => k.name === name)!
  const s = solve(c)
  return { m, at: apply(s.shapes[shapeId].matrix, m.x, m.y) as [number, number] }
}
const twinOf = (c: ModelContent, id: string) => c.shapes.find(s => s.mirrorOf === id)!.id

describe.each(templates)('the $id template’s rig', ({ content: c }) => {
  it('joins every part, the right side as the twin of the left, with nothing held still but the pelvis', () => {
    const pose = poseOf(c)
    // waist, neck, head, five parts of the face, and six joints of each arm and leg on each side
    expect(pose.joints.size).toBe(20)
    expect(pose.blocked.size).toBe(0)
    expect(pose.rootOf.get(pose.bodyOf.get('palmL')!)).toBe('o_pelvis')
    expect(pose.rootOf.get(pose.bodyOf.get(twinOf(c, 'palmL'))!)).toBe('o_pelvis')
    // the Joint limits list: the joints that turn, the face's parts held fast left out
    expect(jointRows(c).map(r => r.joint.name)).toEqual(expect.arrayContaining(['Waist', 'Neck', 'Head', 'Shoulder (left)', 'Elbow (left)', 'Wrist (left)', 'Hip (left)', 'Knee (left)', 'Ankle (left)']))
    expect(jointRows(c)).toHaveLength(9)
  })

  it('reaches with each hand on its own side from the shoulder, within the limits', () => {
    for (const shapeId of ['palmL', twinOf(c, 'palmL')]) {
      const name = shapeId === 'palmL' ? 'Hand (left)' : 'Hand (right)'
      const { m, at } = markAt(c, shapeId, name)
      const r = beginReach(c, shapeId, m.id, at, 'limb')
      if (!r.ok) throw new Error(r.reason)
      // where the hand is with the elbow bent 60° toward the middle (the other way round on the twin's side)
      const elbow = poseOf(c).joints.get((r.drag as Extract<PoseDrag, { kind: 'reach' }>).chain[1])!.at
      const goal = apply(rotate(at[0] < 100 ? -60 : 60, elbow[0], elbow[1]), at[0], at[1]) as [number, number]
      const posed = movePose(c, r.drag as PoseDrag, goal)
      const after = markAt(posed, shapeId, name).at
      expect(Math.hypot(after[0] - goal[0], after[1] - goal[1])).toBeLessThan(Math.hypot(at[0] - goal[0], at[1] - goal[1]) / 2)
      // the other hand where it was
      const other = shapeId === 'palmL' ? twinOf(c, 'palmL') : 'palmL'
      expect(markAt(posed, other, other === 'palmL' ? 'Hand (left)' : 'Hand (right)').at).toEqual(markAt(c, other, other === 'palmL' ? 'Hand (left)' : 'Hand (right)').at)
      for (const j of poseOf(posed).joints.values()) { expect(j.turn).toBeGreaterThanOrEqual(j.lo - 1e-6); expect(j.turn).toBeLessThanOrEqual(j.hi + 1e-6) }
      // only the wrist, elbow and shoulder turned
      expect([...poseOf(posed).joints.values()].filter(j => j.turn !== 0).every(j => ['wrist', 'elbow', 'shoulder'].includes(j.kind ?? ''))).toBe(true)
    }
  })

  it('reaches from the anchor when nothing else holds still: the waist bends too', () => {
    const { m, at } = markAt(c, 'palmL', 'Hand (left)')
    const r = beginReach(c, 'palmL', m.id, at, 'anchor')
    if (!r.ok) throw new Error(r.reason)
    expect((r.drag as Extract<PoseDrag, { kind: 'reach' }>).chain.map(id => poseOf(c).joints.get(id)!.kind)).toEqual(['wrist', 'elbow', 'shoulder', null])
  })
})
