import { describe, expect, it } from 'vitest'
import { publishFaults } from '../assets/Interfaces/admin/characters/modelContent'
import { rigCheck } from '../assets/Interfaces/admin/characters/engine/rigCheck'
import { solve } from '../assets/Interfaces/admin/characters/engine/rig'
import { previewModels } from './mockCharacterModels'

// The rigged figure the design system's card opens with must be a model the Designer would accept and publish, and its sliders must do what they are named for.
describe('the rigged preview model', () => {
  const adult = previewModels()[0].draft

  it('is complete: nothing stops it being published, and the rig check has nothing to say', () => {
    expect(publishFaults(adult)).toEqual([])
    expect(rigCheck(adult)).toEqual([])
  })

  it('stands as drawn at rest, with every shape in the picture', () => {
    const s = solve(adult, {})
    expect(s.order).toHaveLength(5)
    for (const g of adult.groups) s.mats[g.id].forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 1, 0, 0][i], 1))
  })

  it('tilts the head, raises the arm, and the forearm follows the arm', () => {
    const rest = solve(adult, {}), tilted = solve(adult, { r_tilt: 20 }), raised = solve(adult, { r_raise: 95 }), bent = solve(adult, { r_raise: 95, r_elbow: 130 })
    expect(tilted.shapes.s_head.box.x).not.toBeCloseTo(rest.shapes.s_head.box.x, 1)
    expect(tilted.shapes.s_neck.box).toEqual(rest.shapes.s_neck.box)
    expect(raised.shapes.s_arm.box.y).toBeLessThan(rest.shapes.s_arm.box.y)
    expect(raised.shapes.s_fore.box.y).toBeLessThan(rest.shapes.s_fore.box.y)
    expect(bent.shapes.s_fore.box.x).not.toBeCloseTo(raised.shapes.s_fore.box.x, 1)
  })

  it('widens the shoulders by moving the recorded points, and shrinks the whole figure with Height', () => {
    const rest = solve(adult, {}), wide = solve(adult, { r_shoulders: 120 }), narrow = solve(adult, { r_shoulders: 85 }), small = solve(adult, { r_height: 70 })
    expect(wide.shapes.s_chest.box.w).toBeGreaterThan(rest.shapes.s_chest.box.w)
    expect(narrow.shapes.s_chest.box.w).toBeLessThan(rest.shapes.s_chest.box.w)
    expect(small.shapes.s_head.box.h).toBeCloseTo(rest.shapes.s_head.box.h * 0.7, 1)
  })

  it('keeps the older published versions simple and valid', () => {
    const live = previewModels()[0]
    expect(live.published?.version).toBe(2)
    expect(publishFaults(live.published!.content)).toEqual([])
    expect(live.history.map(h => publishFaults(h.content))).toEqual([[]])
  })
})
