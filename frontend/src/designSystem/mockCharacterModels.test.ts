import { describe, expect, it } from 'vitest'
import { publishFaults } from '../assets/Interfaces/admin/characters/modelContent'
import { grayHex, paintOf, paletteOf, rollChoices, slotById } from '../assets/Interfaces/admin/characters/engine/colour'
import { classKey } from '../assets/Interfaces/admin/characters/engine/forms'
import { applyPreset, restState } from '../assets/Interfaces/admin/characters/engine/presets'
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
    expect(s.order).toHaveLength(14)   // five shapes, the sleeve, the shirt, the twins of the arm, its sleeve and the forearm, and the eye shown (two shapes) with its twin
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

  it('pairs the arm: the twin arm and forearm mirror the original and follow its raise and elbow', () => {
    const twinArm = adult.shapes.find(s => s.mirrorOf === 's_arm')!, twinFore = adult.shapes.find(s => s.mirrorOf === 's_fore')!
    for (const values of [{}, { r_raise: 80, r_elbow: 90 }] as Array<Record<string, number>>) {
      const out = solve(adult, values)
      const mirrored = (id: string, twin: string) => expect(out.shapes[twin].box.x + out.shapes[twin].box.w / 2).toBeCloseTo(200 - (out.shapes[id].box.x + out.shapes[id].box.w / 2), 3)
      mirrored('s_arm', twinArm.id); mirrored('s_fore', twinFore.id)
      expect(out.shapes[twinArm.id].box.y).toBeCloseTo(out.shapes.s_arm.box.y, 3)
    }
    expect(adult.groups.filter(g => g.mirrorOf).map(g => g.mirrorOf).sort()).toEqual(['g_arm', 'g_fore'])
  })

  it('locks the shirt to the chest, so it follows the shoulders, and loosens with its slider', () => {
    const shirt = adult.shapes.find(s => s.id === 's_shirt')!
    expect(shirt.pts.every(p => p.bind?.kind === 'edge' && p.bind.s === 's_chest')).toBe(true)
    expect(shirt.loose).toBe('r_fit')
    const rest = solve(adult, {}), wide = solve(adult, { r_shoulders: 120 }), loose = solve(adult, { r_fit: 200 }), tight = solve(adult, { r_fit: 0 })
    expect(wide.shapes.s_shirt.box.w).toBeGreaterThan(rest.shapes.s_shirt.box.w)
    expect(loose.shapes.s_shirt.box.w).toBeGreaterThan(rest.shapes.s_shirt.box.w)
    expect(tight.shapes.s_shirt.box.w).toBeLessThan(rest.shapes.s_shirt.box.w)
    expect(tight.shapes.s_shirt.box.w).toBeCloseTo(rest.shapes.s_chest.box.w, 0)   // fully tight: on the chest's own edge
  })

  it('draws the head wider from behind, with an outline of its own for the back view', () => {
    const front = solve(adult, {}, 'front').shapes.s_head, back = solve(adult, {}, 'back').shapes.s_head
    expect(back.box.w).toBeGreaterThan(front.box.w * 1.05)
    expect(solve(adult, {}, 'back').shapes.s_neck.box.w).toBeCloseTo(solve(adult, {}, 'front').shapes.s_neck.box.w, 3)
  })

  it('has forms: a head that is Oval, Square or Long, and a sleeve that is Short, Long or gone, which the other arm follows', () => {
    const head = adult.objects.find(o => o.id === 'o_head')!.axes![0], arm = adult.objects.find(o => o.id === 'o_arm')!.axes![0]
    expect(head.options.map(f => f.name)).toEqual(['Oval', 'Square', 'Long'])
    expect(arm.options.map(f => f.name)).toEqual(['Short', 'Long', 'None'])
    const form = (axis: typeof head, name: string) => ({ [`${axis === head ? 'o_head' : 'o_arm'}.${axis.id}`]: axis.options.find(f => f.name === name)!.id })
    const oval = solve(adult, {}).shapes.s_head, square = solve(adult, {}, 'front', { forms: form(head, 'Square') }).shapes.s_head, long = solve(adult, {}, 'front', { forms: form(head, 'Long') }).shapes.s_head
    expect(long.box.h).toBeGreaterThan(oval.box.h)
    expect(square.d).not.toBe(oval.d)
    const twin = adult.shapes.find(s => s.mirrorOf === 's_sleeve')!
    const short = solve(adult, {}).shapes, longer = solve(adult, {}, 'front', { forms: form(arm, 'Long') }).shapes, none = solve(adult, {}, 'front', { forms: form(arm, 'None') }).shapes
    expect(longer.s_sleeve.box.h).toBeGreaterThan(short.s_sleeve.box.h)
    expect(longer[twin.id].box.h).toBeCloseTo(longer.s_sleeve.box.h, 3)         // the other arm's sleeve follows
    expect(none.s_sleeve.visible).toBe(false)
    expect(none[twin.id].visible).toBe(false)
  })

  it('has presets: poses, an expression, a build, two outfits and a style of the head', () => {
    expect(adult.presets!.map(p => `${p.kind}: ${p.name}`)).toEqual(['Pose: At rest', 'Pose: Wave', 'Expression: Curious', 'Build: Broad', 'Outfit: Shirt on', 'Outfit: No shirt', 'Style: Sleepy'])
    let state = restState(adult)
    const apply = (name: string) => { state = applyPreset(adult, state, adult.presets!.find(p => p.name === name)!) }
    apply('Wave'); apply('Curious')
    expect(state.values).toMatchObject({ r_raise: 80, r_elbow: 50, r_tilt: 12 })
    apply('At rest')
    expect(state.values).toMatchObject({ r_raise: 0, r_elbow: 0, r_tilt: 12 })      // a pose is replaced, an expression stays
    apply('No shirt')
    expect(solve(adult, state.values, 'front', state).shapes.s_shirt.visible).toBe(false)
    apply('Shirt on')
    expect(solve(adult, state.values, 'front', state).shapes.s_shirt.visible).toBe(true)
  })

  it('has a family of eyes: one member shown at a time, each with a twin, and a style of the head that picks the hooded eye', () => {
    const [family] = adult.classes!, members = adult.objects.filter(o => o.classOf === family.id)
    expect(family).toMatchObject({ name: 'Eye', template: 'o_eye', exclusive: true })
    expect(members.map(m => m.name)).toEqual(['Almond', 'Round', 'Hooded'])
    const shapesOf = (name: string) => members.find(m => m.name === name)!.shapes
    const drawn = (forms: Record<string, string> = {}) => Object.entries(solve(adult, {}, 'front', { forms }).shapes).filter(([, r]) => r.visible).map(([id]) => id)
    // the pattern is not drawn; the first member is, with the twin of its shapes
    expect(drawn()).toEqual(expect.arrayContaining(shapesOf('Almond')))
    expect(drawn()).not.toContain('s_eye')
    expect(shapesOf('Round').some(id => drawn().includes(id))).toBe(false)
    const round = drawn({ [classKey(family.id)]: members.find(m => m.name === 'Round')!.id })
    expect(shapesOf('Round').every(id => round.includes(id))).toBe(true)
    expect(shapesOf('Almond').some(id => round.includes(id))).toBe(false)
    // Round has an outline of its own for the white; Almond follows the pattern
    const white = (name: string) => adult.shapes.find(s => shapesOf(name).includes(s.id) && s.copyOf === 's_eye')!
    expect(white('Almond').pts).toEqual([])
    expect(white('Round').pts.length).toBeGreaterThanOrEqual(3)
    expect(adult.shapes.filter(s => s.mirrorOf && shapesOf('Almond').includes(s.mirrorOf))).toHaveLength(2)
    // the style: the hooded eye, its lids closed (the iris is gone), the head turned
    const style = adult.presets!.find(p => p.name === 'Sleepy')!
    expect(style.scope).toBe('g_head')
    const state = applyPreset(adult, restState(adult), style)
    expect(state.values).toMatchObject({ r_tilt: -8 })
    const seen = solve(adult, state.values, 'front', state)
    const iris = shapesOf('Hooded').find(id => adult.shapes.find(s => s.id === id)!.copyOf === 's_iris')!
    expect(seen.shapes[shapesOf('Hooded').find(id => id !== iris)!].visible).toBe(true)
    expect(seen.shapes[iris].visible).toBe(false)
    expect(seen.shapes[shapesOf('Almond')[0]].visible).toBe(false)
  })

  it('is painted from the standard slots: gray until colours are chosen, the eye white a fixed white, copies and twins following', () => {
    const shape = (id: string) => adult.shapes.find(s => s.id === id)!
    const none = { palette: paletteOf(adult), choices: {} }
    expect(paintOf(adult, none, shape('s_head')).fill).toBe(grayHex(slotById(adult, 'k_skin')!.lRest))
    expect(paintOf(adult, none, shape('s_shirt')).fill).toBe(grayHex(slotById(adult, 'k_cloth')!.lRest))
    expect(paintOf(adult, none, shape('s_eye')).fill).toBe('#ffffff')
    const colouring = { palette: paletteOf(adult), choices: { k_eye: { src: 'colour' as const, id: 'c_eye_6' }, k_skin: { src: 'swatch' as const, id: 'k1' } } }
    const iris = paintOf(adult, colouring, shape('s_iris'))
    expect(iris.fill).toBe(slotById(adult, 'k_eye')!.colours[5].hex)
    // a member's iris follows the pattern's, and so does the twin of the arm
    const followers = adult.shapes.filter(s => s.copyOf === 's_iris')
    expect(followers).toHaveLength(3)
    for (const f of followers) expect(paintOf(adult, colouring, f)).toEqual(iris)
    const twinArm = adult.shapes.find(s => s.mirrorOf === 's_arm')!
    expect(paintOf(adult, colouring, twinArm)).toEqual(paintOf(adult, colouring, shape('s_arm')))
    const rolled = rollChoices(adult, () => 0.4, paletteOf(adult), {}, { genre: 'g_fantasy' })
    expect(Object.keys(rolled).sort()).toEqual(adult.slots!.map(s => s.id).sort())
  })

  it('keeps the older published versions simple and valid', () => {
    const live = previewModels()[0]
    expect(live.published?.version).toBe(2)
    expect(publishFaults(live.published!.content)).toEqual([])
    expect(live.history.map(h => publishFaults(h.content))).toEqual([[]])
  })
})
