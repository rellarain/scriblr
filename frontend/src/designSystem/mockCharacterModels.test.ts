import { describe, expect, it } from 'vitest'
import { publishFaults } from '../assets/Interfaces/admin/characters/modelContent'
import { grayHex, paintOf, paletteOf, rollChoices, slotById } from '../assets/Interfaces/admin/characters/engine/colour'
import { classKey } from '../assets/Interfaces/admin/characters/engine/forms'
import { boneLength, headHeights, measures } from '../assets/Interfaces/admin/characters/engine/bones'
import { framesOf, hiddenThrough } from '../assets/Interfaces/admin/characters/engine/frames'
import { activeLocks } from '../assets/Interfaces/admin/characters/engine/locks'
import { applyPreset, restState } from '../assets/Interfaces/admin/characters/engine/presets'
import { hangCheck, paintCheck, proportionCheck, rigCheck } from '../assets/Interfaces/admin/characters/engine/rigCheck'
import { drawable, paintDefs, paintShapes } from '../assets/Interfaces/admin/characters/engine/paint'
import { solve } from '../assets/Interfaces/admin/characters/engine/rig'
import { previewModels } from './mockCharacterModels'

// The rigged figure the design system's card opens with must be a model the Designer would accept and publish, and its sliders must do what they are named for.
describe('the rigged preview model', () => {
  const adult = previewModels()[0].draft

  it('is complete: nothing stops it being published, and the rig check has nothing to say', () => {
    expect(publishFaults(adult)).toEqual([])
    expect(rigCheck(adult)).toEqual([])
    expect(hangCheck(adult)).toEqual([])
  })

  it('stands as drawn at rest, with every shape in the picture', () => {
    const s = solve(adult, {})
    expect(s.order).toHaveLength(52)   // five shapes, the sleeve, the shirt, the twins of the arm, its sleeve and the forearm, and the eye shown (two shapes) with its twin, the neckline, two bands of shading, the bridge of the elbow and its twin, the crease of the elbow and its twin, the ponytail, and the two hands (fifteen shapes each)
    for (const g of adult.groups) s.mats[g.id].forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0, 1, 0, 0][i], 1))
  })

  it('tilts the head, raises the arm, and the forearm follows the arm', () => {
    const rest = solve(adult, {}), tilted = solve(adult, { r_tilt: 20 }), raised = solve(adult, { r_raise: 70 }), bent = solve(adult, { r_raise: 70, r_elbow: 130 })
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

  it('pairs the arm: the twin arm and forearm mirror the original at rest, and each arm and hand is posed on its own slider', () => {
    const twinArm = adult.shapes.find(s => s.mirrorOf === 's_arm')!, twinFore = adult.shapes.find(s => s.mirrorOf === 's_fore')!
    const mirrored = (out: ReturnType<typeof solve>, id: string, twin: string) => expect(out.shapes[twin].box.x + out.shapes[twin].box.w / 2).toBeCloseTo(200 - (out.shapes[id].box.x + out.shapes[id].box.w / 2), 3)
    const rest = solve(adult, {})
    mirrored(rest, 's_arm', twinArm.id); mirrored(rest, 's_fore', twinFore.id)
    expect(rest.shapes[twinArm.id].box.y).toBeCloseTo(rest.shapes.s_arm.box.y, 3)
    // the arm and the hand are two groups of the pair; the hand brings fifteen more groups each
    expect(adult.groups.filter(g => g.mirrorOf).length).toBe(2 + 15)
    expect(adult.groups.filter(g => g.mirrorOf).map(g => g.mirrorOf)).toEqual(expect.arrayContaining(['g_arm', 'g_fore']))
    // the original raise moves the original arm only, the slider of the other side moves the twin, as the mirror image
    const other = (name: string) => adult.ranges.find(r => r.name === name)!.id
    const raiseOther = other('Arm raise (other side)'), elbowOther = other('Elbow bend (other side)')
    expect(adult.ranges.find(r => r.id === 'r_raise')!.drives.every(d => d.mirror === false)).toBe(true)
    const mine = solve(adult, { r_raise: 60, r_elbow: 90 })
    expect(mine.shapes.s_arm.box.y).toBeLessThan(rest.shapes.s_arm.box.y)
    expect(mine.shapes[twinArm.id].box.y).toBeCloseTo(rest.shapes[twinArm.id].box.y, 3)
    expect(mine.shapes[twinFore.id].box.x).toBeCloseTo(rest.shapes[twinFore.id].box.x, 3)
    const theirs = solve(adult, { [raiseOther]: 60, [elbowOther]: 90 })
    const centre = (b: { x: number; w: number }) => b.x + b.w / 2
    expect(centre(theirs.shapes[twinArm.id].box)).toBeCloseTo(200 - centre(mine.shapes.s_arm.box), 3)
    expect(centre(theirs.shapes[twinFore.id].box)).toBeCloseTo(200 - centre(mine.shapes.s_fore.box), 3)
    expect(theirs.shapes[twinFore.id].box.y).toBeCloseTo(mine.shapes.s_fore.box.y, 3)
    expect(theirs.shapes[twinArm.id].box.y).toBeCloseTo(mine.shapes.s_arm.box.y, 3)
    expect(theirs.shapes.s_arm.box.y).toBeCloseTo(rest.shapes.s_arm.box.y, 3)
  })

  it('has a hand on each arm: a palm, four fingers of three joints and a thumb, each hand curled on its own', () => {
    const palm = adult.groups.find(g => g.name === 'Hand' && !g.mirrorOf)!, twinPalm = adult.groups.find(g => g.mirrorOf === palm.id)!
    expect(palm.parent).toBe('g_fore'); expect(twinPalm.parent).toBe(adult.groups.find(g => g.mirrorOf === 'g_fore')!.id)
    const roles = adult.ranges.map(r => r.role).filter(Boolean) as string[]
    expect(roles.filter(r => !r.endsWith('~')).sort()).toEqual(['curl-index', 'curl-little', 'curl-middle', 'curl-ring', 'curl-thumb', 'oppose-thumb', 'spread', 'swing-thumb'])
    expect(roles.filter(r => r.endsWith('~'))).toHaveLength(8)
    const curl = (role: string) => adult.ranges.find(r => r.role === role)!.id
    const tip = (name: string) => adult.shapes.find(s => s.name === name)!.id
    const rest = solve(adult, {}), fist = solve(adult, { [curl('curl-middle')]: 100 }), otherFist = solve(adult, { [curl('curl-middle~')]: 100 })
    const twinTip = adult.shapes.find(s => s.mirrorOf === tip('Middle finger 3'))!.id
    expect(fist.shapes[tip('Middle finger 3')].box.y).toBeLessThan(rest.shapes[tip('Middle finger 3')].box.y - 3)
    expect(fist.shapes[twinTip].box.y).toBeCloseTo(rest.shapes[twinTip].box.y, 3)                      // the other hand stays open
    expect(otherFist.shapes[twinTip].box.y).toBeCloseTo(fist.shapes[tip('Middle finger 3')].box.y, 3)   // and curls just the same with its own slider
    // the hand is painted as the forearm (skin), and its parts are in the picture
    expect(adult.shapes.find(s => s.name === 'Hand')!.slot).toBe('k_skin')
  })

  it('has hand poses of the two hands, and a grip point on each that the Grip pose holds with', () => {
    expect(adult.grips!.map(g => g.name)).toEqual(['Staff grip', 'Staff grip (other side)'])
    const palm = adult.groups.find(g => g.name === 'Hand' && !g.mirrorOf)!, twinPalm = adult.groups.find(g => g.mirrorOf === palm.id)!
    expect(adult.grips!.map(g => g.group)).toEqual([palm.id, twinPalm.id])
    expect(adult.grips![1].x).toBeCloseTo(200 - adult.grips![0].x, 2)
    const fistOf = (kind: string) => adult.presets!.find(p => p.kind === kind && p.name === 'Fist')!
    let state = applyPreset(adult, restState(adult), fistOf('Hand'))
    state = applyPreset(adult, state, adult.presets!.find(p => p.kind === 'Hand (other side)' && p.name === 'Open')!)
    const closed = solve(adult, state.values), rest = solve(adult, {})
    const tip = (name: string) => adult.shapes.find(s => s.name === name)!.id
    expect(closed.shapes[tip('Index finger 3')].box.y).toBeLessThan(rest.shapes[tip('Index finger 3')].box.y - 3)
    // a pose holds with its grip, and the grip is carried by the hand
    const grip = adult.presets!.find(p => p.kind === 'Hand' && p.name === 'Grip')!
    expect(grip.grip).toBe(adult.grips![0].id)
    expect(applyPreset(adult, restState(adult), grip).grip).toBe(adult.grips![0].id)
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
    expect(adult.presets!.map(p => `${p.kind}: ${p.name}`)).toEqual([
      'Pose: At rest', 'Pose: Wave', 'Expression: Curious', 'Build: Broad', 'Outfit: Shirt on', 'Outfit: No shirt', 'Weather: Calm', 'Weather: Windswept', 'Style: Sleepy', 'Style: Dark',
      'Age: Infant', 'Age: Child', 'Age: Teen', 'Age: Adult', 'Age: Elder', 'Build: Slim', 'Build: Average', 'Build: Heavy',
      'Hand: Open', 'Hand: Fist', 'Hand: Point', 'Hand: Pinch', 'Hand: Grip', 'Hand (other side): Open', 'Hand (other side): Fist', 'Hand (other side): Point', 'Hand (other side): Pinch', 'Hand (other side): Grip',
    ])
    let state = restState(adult)
    const apply = (name: string) => { state = applyPreset(adult, state, adult.presets!.find(p => p.name === name)!) }
    apply('Wave'); apply('Curious')
    expect(state.values).toMatchObject({ r_raise: 65, r_elbow: 50, r_tilt: 12 })
    apply('At rest')
    expect(state.values).toMatchObject({ r_raise: 0, r_elbow: 0, r_tilt: 12 })      // a pose is replaced, an expression stays
    apply('No shirt')
    expect(solve(adult, state.values, 'front', state).shapes.s_shirt.visible).toBe(false)
    apply('Shirt on')
    expect(solve(adult, state.values, 'front', state).shapes.s_shirt.visible).toBe(true)
  })

  it('has a variant that is a bundle: Elder turns the Dark shirt style on and picks gray hair, and the shirt keeps its saturation', () => {
    const elder = adult.presets!.find(p => p.name === 'Elder')!, dark = adult.presets!.find(p => p.name === 'Dark')!
    expect(elder).toMatchObject({ kind: 'Age', styles: { o_shirt: dark.id }, picks: { k_hair: 'c_hair_11' } })
    expect(dark.scope).toBe('o_shirt')
    expect(adult.objects.find(o => o.id === 'o_shirt')!.hsl).toEqual({ k_cloth: { h: null, s: 35, l: null } })
    const on = applyPreset(adult, restState(adult), elder)
    expect(on.colours?.k_hair).toEqual({ src: 'colour', id: 'c_hair_11' })
    expect(activeLocks(adult, restState(adult)).o_shirt.k_cloth).toEqual({ h: null, s: 35, l: null })                 // Dark is not on yet, or is it? it sets nothing, so it holds
    expect(activeLocks(adult, on).o_shirt.k_cloth).toEqual({ h: null, s: 35, l: 18 })
    const shirt = adult.shapes.find(x => x.id === 's_shirt')!
    const colouring = { palette: paletteOf(adult), choices: { k_cloth: { src: 'colour', id: 'c_cloth_2' } } as const, locks: activeLocks(adult, on) }
    expect(paintOf(adult, colouring, shirt).fill).toMatch(/^#[0-9a-f]{6}$/)
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

  it('has paint effects: a neckline cut out of the shirt, shading that lies on its shapes, a gradient in the iris of every eye', () => {
    const solved = solve(adult, {}), colouring = { palette: paletteOf(adult), choices: {} }
    const items = paintShapes(adult, solved, colouring)
    // the neckline is a helper that something cuts: drawn on the canvas, never in the previews, and nothing in the checks about it
    const neckline = items.find(i => i.id === 's_neckline')!
    expect(neckline.helper).toBe(true)
    expect(drawable(items).map(i => i.id)).not.toContain('s_neckline')
    expect(items.find(i => i.id === 's_shirt')!.cutDs).toEqual([solved.shapes.s_neckline.d])
    expect(paintCheck(adult)).toEqual([])
    // four shading shapes (the shirt's, the head's, and the crease of the elbow with its twin), each kept inside the base shapes of its object, the shirt's blended with what is under it
    const shading = items.filter(i => i.shading)
    expect(shading).toHaveLength(4)
    for (const band of shading) { expect(band.blank).toBe(false); expect(band.compDs.length).toBeGreaterThan(0) }
    expect(shading.filter(b => b.blend === 'multiply')).toHaveLength(1)
    expect(shading.filter(b => b.blend === null)).toHaveLength(3)
    // every member of the eye family follows the pattern's iris, and so has its radial gradient
    const irises = adult.shapes.filter(s => s.id === 's_iris' || s.copyOf === 's_iris')
    expect(irises).toHaveLength(4)
    for (const i of items.filter(x => irises.some(s => s.id === x.id))) expect(i.gradient?.dir).toBe('radial')
    expect(paintDefs(drawable(items), 'x').length).toBeGreaterThan(0)
    expect(JSON.stringify(items)).not.toMatch(/NaN|undefined/)
  })

  it('has a skeleton: bones along the head, the upper arm and the forearm, with the head as the unit', () => {
    expect(adult.bones!.map(b => b.name)).toEqual(['Head', 'Upper arm', 'Forearm'])
    expect(adult.headBone).toBe(adult.bones![0].id)
    const rest = solve(adult, {})
    expect(measures(adult, rest).every(m => m.length != null && m.length > 5 && m.percent === 100)).toBe(true)
    const heads = headHeights(adult, rest)!
    expect(heads).toBeGreaterThan(2); expect(heads).toBeLessThan(6)
    expect(proportionCheck(adult).map(l => l.text)).toEqual([expect.stringMatching(/keeps its size/), expect.stringMatching(/keeps its size/), expect.stringMatching(/keeps its size/)])
  })

  it('lengthens an arm with its Length slider, and the other arm with it', () => {
    const [, upper] = adult.bones!
    const rest = solve(adult, {}), long = solve(adult, { r_arm_len: 120 })
    expect(boneLength(long, upper)! / boneLength(rest, upper)!).toBeCloseTo(1.2, 5)
    const twin = adult.shapes.find(s => s.mirrorOf === 's_arm')!
    expect(long.shapes[twin.id].box.h).toBeGreaterThan(rest.shapes[twin.id].box.h)
    expect(long.shapes.s_arm.box.h).toBeCloseTo(long.shapes[twin.id].box.h, 5)
    // the forearm hangs from the arm, so it is carried down; it is lengthened by its own slider
    expect(long.shapes.s_fore.box.y).toBeGreaterThan(rest.shapes.s_fore.box.y)
    expect(long.shapes.s_fore.box.h).toBeGreaterThan(rest.shapes.s_fore.box.h)
  })

  it('offers writers a span of the sliders that change the proportions, and always the resting value', () => {
    const limited = adult.ranges.filter(r => r.limit)
    expect(limited.map(r => r.id).sort()).toEqual(['r_arm_len', 'r_fore_len', 'r_head', 'r_height', 'r_shoulders'])
    for (const r of limited) { expect(r.limit![0]).toBeGreaterThanOrEqual(r.min); expect(r.limit![1]).toBeLessThanOrEqual(r.max); expect(r.limit![0]).toBeLessThanOrEqual(r.rest); expect(r.limit![1]).toBeGreaterThanOrEqual(r.rest) }
  })

  it('has Age and Build presets that change the proportions, each inside the span a writer may choose', () => {
    let state = restState(adult)
    const apply = (name: string) => { state = applyPreset(adult, state, adult.presets!.find(p => p.name === name)!) }
    const tall = (v: Record<string, number>) => solve(adult, v).shapes.s_head.box.h
    apply('Infant')
    expect(state.values).toMatchObject({ r_height: 80, r_head: 115 })
    const infant = solve(adult, state.values)
    apply('Adult')
    expect(state.values).toMatchObject({ r_height: 100, r_head: 100 })   // an age replaces the last age
    const grown = solve(adult, state.values)
    expect(infant.shapes.s_head.box.h / (infant.shapes.s_fore.box.y + infant.shapes.s_fore.box.h - infant.shapes.s_head.box.y)).toBeGreaterThan(grown.shapes.s_head.box.h / (grown.shapes.s_fore.box.y + grown.shapes.s_fore.box.h - grown.shapes.s_head.box.y))
    expect(tall({ r_head: 115 })).toBeGreaterThan(tall({}))
    for (const p of adult.presets!.filter(x => x.kind === 'Age')) for (const [id, v] of Object.entries(p.values)) {
      const r = adult.ranges.find(x => x.id === id)!
      if (r.limit) { expect(v).toBeGreaterThanOrEqual(r.limit[0]); expect(v).toBeLessThanOrEqual(r.limit[1]) }
    }
    apply('Slim'); apply('Heavy')
    expect(state.values).toMatchObject({ r_shoulders: 118, r_fit: 130 })
  })

  it('keeps the eyes the size they are drawn when the head grows', () => {
    const eyes = adult.objects.filter(o => o.classOf)
    expect(eyes.map(o => o.fit)).toEqual(['keep', 'keep', 'keep'])
    const members = new Set(eyes.flatMap(o => o.shapes))
    const forms = { [classKey(adult.classes![0].id)]: eyes[0].id }
    const rest = solve(adult, {}, 'front', { forms }), big = solve(adult, { r_head: 115 }, 'front', { forms })
    const shown = [...members].filter(id => rest.shapes[id]?.visible)
    expect(shown.length).toBeGreaterThan(0)
    for (const id of shown) { expect(big.shapes[id].box.w).toBeCloseTo(rest.shapes[id].box.w, 5); expect(big.shapes[id].box.h).toBeCloseTo(rest.shapes[id].box.h, 5) }
    expect(big.shapes.s_head.box.w).toBeGreaterThan(rest.shapes.s_head.box.w)
  })

  it('has frames: head to hands, a bust and a face that leaves out the arms and the shirt', () => {
    expect(framesOf(adult).map(f => f.name)).toEqual(['Head to hands', 'Bust', 'Face'])
    const face = framesOf(adult)[2]
    expect(face.hide).toEqual(expect.arrayContaining(['g_arm', 'g_shirt']))
    const through = solve(adult, {}, 'front', { hidden: hiddenThrough(face, []) })
    expect(through.shapes.s_shirt.visible).toBe(false); expect(through.shapes.s_arm.visible).toBe(false); expect(through.shapes.s_head.visible).toBe(true)
    const [whole, bust] = framesOf(adult)
    expect(whole).toMatchObject({ x: 30, y: 10, w: 140, h: 215 })
    expect(bust.w).toBeLessThan(whole.w)
    // the first frame holds every drawn shape of the figure
    const rest = solve(adult, {})
    for (const id of rest.order) { const b = rest.shapes[id].box; expect(b.x).toBeGreaterThanOrEqual(whole.x - 0.5); expect(b.x + b.w).toBeLessThanOrEqual(whole.x + whole.w + 0.5); expect(b.y + b.h).toBeLessThanOrEqual(whole.y + whole.h + 0.5) }
  })

  it('has a bridge of skin across the elbow, its twin on the other arm, and it runs on from the arm to the forearm along their edges', () => {
    const bridge = adult.shapes.find(x => x.pts.some(p => p.bind?.tan))!
    expect(bridge.name).toBe('Bridge')
    expect(bridge.pts.map(p => p.bind?.s)).toEqual(['s_arm', 's_fore', 's_fore', 's_arm'])
    expect(adult.shapes.filter(x => x.mirrorOf === bridge.id)).toHaveLength(1)
    const bent = solve(adult, { r_raise: 70, r_elbow: 130 })
    const b = bent.shapes[bridge.id]
    expect(b.local[0].ho).toBeDefined(); expect(b.local[1].hi).toBeDefined()
    expect(b.d).not.toMatch(/NaN|undefined/)
    // the bridge follows the bent forearm: its lower points are where the forearm is
    const fore = bent.shapes.s_fore.box, lowest = Math.max(...b.poly.map(p => p[1]))
    expect(lowest).toBeGreaterThan(fore.y - 2)
  })

  it('has a crease in the elbow that shows as the elbow bends, on both arms', () => {
    const crease = adult.shapes.find(x => x.opBy?.slider === 'r_elbow')!
    expect(crease.shade).toBeTruthy()
    const twin = adult.shapes.find(x => x.mirrorOf === crease.id)!
    const fade = (v: number, id: string) => solve(adult, { r_elbow: v }).shapes[id].fade
    expect(fade(0, crease.id)).toBe(0); expect(fade(130, crease.id)).toBe(1)
    expect(fade(60, crease.id)).toBeGreaterThan(0); expect(fade(60, crease.id)).toBeLessThan(1)
    expect(fade(60, twin.id)).toBeCloseTo(fade(60, crease.id))
    const items = paintShapes(adult, solve(adult, { r_elbow: 130 }), { palette: paletteOf(adult), choices: {} })
    expect(items.find(i => i.id === crease.id)!.opacity).toBeCloseTo(1)
    expect(paintShapes(adult, solve(adult, {}), { palette: paletteOf(adult), choices: {} }).find(i => i.id === crease.id)!.opacity).toBe(0)
  })

  it('has a ponytail that hangs with the Hair fall slider, to the side the figure is turned to', () => {
    const rest = solve(adult, {}), down = solve(adult, { r_fall: 100 }), left = solve(adult, { r_fall: 100 }, 'front', { fall: 'left' }), behind = solve(adult, { r_fall: 100 }, 'front', { fall: 'behind' })
    expect(rest.shapes.s_lock.box.w).toBeGreaterThan(rest.shapes.s_lock.box.h)   // it sticks out sideways at rest
    expect(down.shapes.s_lock.box.h).toBeGreaterThan(down.shapes.s_lock.box.w)   // and hangs down
    expect(left.shapes.s_lock.box.x).toBeLessThan(down.shapes.s_lock.box.x)
    expect(behind.shapes.s_lock.box.w).toBeLessThan(down.shapes.s_lock.box.w)    // narrower when it falls behind
    // each side of it keeps the length it was drawn with
    const was = adult.shapes.find(x => x.id === 's_lock')!.pts
    const now = down.shapes.s_lock.local
    for (const [a, b] of [[0, 1], [1, 2], [5, 4], [4, 3]]) expect(Math.hypot(now[a].x - now[b].x, now[a].y - now[b].y)).toBeCloseTo(Math.hypot(was[a].x - was[b].x, was[a].y - was[b].y), 4)
    // a preset keeps the side: Windswept swings it to the left, Calm puts it back
    let state = restState(adult)
    state = applyPreset(adult, state, adult.presets!.find(p => p.name === 'Windswept')!)
    expect(state.fall).toBe('left'); expect(state.values.r_fall).toBe(100)
    state = applyPreset(adult, state, adult.presets!.find(p => p.name === 'Calm')!)
    expect(state.fall).toBe('down'); expect(state.values.r_fall).toBe(0)
  })

  it('is finite and valid at every end of every slider, on every side, in both views', () => {
    for (const view of ['front', 'back'] as const) for (const fall of ['down', 'left', 'right', 'behind'] as const) for (const end of ['min', 'max'] as const) {
      const values = Object.fromEntries(adult.ranges.map(r => [r.id, r[end]]))
      const s = solve(adult, values, view, { fall })
      for (const id of s.order) { expect(s.shapes[id].d).not.toMatch(/NaN|undefined/); expect(Number.isFinite(s.shapes[id].fade)).toBe(true) }
    }
  })

  it('keeps the older published versions simple and valid', () => {
    const live = previewModels()[0]
    expect(live.published?.version).toBe(2)
    expect(publishFaults(live.published!.content)).toEqual([])
    expect(live.history.map(h => publishFaults(h.content))).toEqual([[]])
  })
})
