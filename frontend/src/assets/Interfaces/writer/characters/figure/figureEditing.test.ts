import { describe, expect, it } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import { hexHsl } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import {
  ALL_LAYERS, NONE, WHOLE, chooseKind, chooseOption, figurePartOf, garmentsIn, groupPartsOf, hotspotsOf, kindsFor, layersIn, objectPartOf, pickColour, regionOfObject, regionsOf, rollPart,
  setBrightness, setFall, setForm, setMember, setOpacity, setPattern, setWorn, slotViewOf, wornIds,
} from './figureEditing'
import { atAge, blankFigure, colouringOf, drawFigure, normalizeFigure, solveFigure, spanOf, testOf, valuesOf, withTest } from './figureState'

// What the editor offers, on the design system's sample model: a rigged figure with frames (Head to hands, Bust, Face), sliders (some with a writer's limit), forms, a family of eyes,
// presets (Age, Build, Outfit, a Style for the head and for the shirt), a group state, authored fields, a fill pattern and a colour lock on the shirt.
const model: ModelContent = previewModels()[0].draft
const copy = copyOf(model)
const c = copy.content
const fresh = (): CharacterFigure => blankFigure(copy.id, c)
const frame = (name: string) => c.frames!.find(f => f.name === name)!.id
const kind = (label: string, scope: string | null = null, figure = fresh()) => kindsFor(c, testOf(c, figure), scope).find(k => k.label === label)!
const ids = (list: Array<{ id: string }>) => list.map(x => x.id)
const names = (list: Array<{ name: string }>) => list.map(x => x.name)

describe('the sheets of the card', () => {
  it('are the model\'s frames, the biggest first, so a smaller one lies in front', () => {
    expect(names(regionsOf(c))).toEqual(['Head to hands', 'Bust', 'Face'])
    expect(regionsOf(c).every(r => r.frame !== null)).toBe(true)
  })
  it('hold each part in the smallest frame that holds the middle of it', () => {
    expect(regionOfObject(c, 'o_head')).toBe(frame('Face'))
    expect(regionOfObject(c, 'o_neck')).toBe(frame('Bust'))
    expect(regionOfObject(c, 'o_chest')).toBe(frame('Head to hands'))
    expect(regionOfObject(c, 'o_shirt')).toBe(frame('Head to hands'))
  })
  it('a model with no frames has one sheet, the whole figure, with every part on it', () => {
    const bare: ModelContent = { ...c, frames: [] }
    expect(regionsOf(bare)).toEqual([{ id: WHOLE, name: 'Whole figure', frame: null }])
    expect(regionOfObject(bare, 'o_head')).toBe(WHOLE)
  })
  it('what lies in no frame goes on a sheet of the whole figure that lies behind the others', () => {
    const onlyFace: ModelContent = { ...c, frames: c.frames!.filter(f => f.name === 'Face') }
    expect(names(regionsOf(onlyFace))).toEqual(['Whole figure', 'Face'])
    expect(regionOfObject(onlyFace, 'o_shirt')).toBe(WHOLE)
    expect(regionOfObject(onlyFace, 'o_head')).toBe(frame('Face'))
  })
})

describe('the figure as a whole', () => {
  it('has a dropdown for each kind of preset the model has (not the styles of a part), at the one that is on', () => {
    const part = figurePartOf(c, fresh())
    expect(part.kinds.map(k => k.label)).toEqual(['Pose', 'Expression', 'Build', 'Outfit', 'Weather', 'Age', 'Hand', 'Hand (other side)'])
    expect(part.kinds.find(k => k.label === 'Age')!.value).toBe('p_form43')
    expect(part.kinds.find(k => k.label === 'Expression')!.value).toBe('')
    expect(part.kinds.some(k => k.scoped)).toBe(false)
  })
  it('offers the sliders that no part holds, held to the writer\'s span', () => {
    const { sliders } = figurePartOf(c, fresh())
    expect(names(sliders)).toEqual(['Height'])
    expect(spanOf(sliders[0])).toEqual([80, 105])
  })
  it('never offers a slider the model does not show to writers', () => {
    const hidden: ModelContent = { ...c, ranges: c.ranges.map(r => (r.id === 'r_height' || r.id === 'r_tilt' ? { ...r, show: false } : r)) }
    expect(figurePartOf(hidden, fresh()).sliders).toEqual([])
    expect(groupPartsOf(hidden, fresh(), frame('Face'))[0].sliders.map(r => r.name)).toEqual(['Head size'])
  })
  it('choosing a preset changes what its kind controls and nothing else', () => {
    const f = fresh()
    const child = chooseKind(c, f, kind('Age'), 'p_form41')
    expect(kind('Age', null, child).value).toBe('p_form41')
    expect(child.values.r_head).not.toBe(f.values.r_head)
    expect(child.tile).toBe(f.tile)
    const noShirt = chooseKind(c, child, kind('Outfit', null, child), 'p_form36')
    expect(noShirt.hidden).toContain('o_shirt')
    expect(kind('Outfit', null, noShirt).value).toBe('p_form36')
    expect(kind('Age', null, noShirt).value).toBe('p_form41')
  })
  it('the sliders a preset gives stay inside the span a writer may choose within', () => {
    for (const p of c.presets ?? []) {
      const f = chooseKind(c, fresh(), { key: p.kind.toLowerCase(), label: p.kind, presets: [p], scoped: !!p.scope, value: '' }, p.id)
      for (const r of c.ranges) { const [lo, hi] = spanOf(r); expect(valuesOf(c, f)[r.id]).toBeGreaterThanOrEqual(lo); expect(valuesOf(c, f)[r.id]).toBeLessThanOrEqual(hi) }
    }
  })
})

describe('a sheet\'s groups', () => {
  it('lists the groups that lie on it with something to change, their sliders, poses and states, and not a twin', () => {
    const parts = groupPartsOf(c, fresh(), frame('Head to hands'))
    const arm = parts.find(g => g.group.name === 'Upper arm')!
    expect(names(arm.sliders)).toEqual(['Arm raise', 'Upper arm length'])
    expect(arm.states.map(s => [s.state.name, s.value])).toEqual([['Arm', 'op_arm2']])
    expect(parts.some(g => g.group.name.includes('(twin)'))).toBe(false)
    const head = groupPartsOf(c, fresh(), frame('Face'))
    expect(head.map(g => g.group.name)).toEqual(['Head'])
    expect(head[0].kinds.map(k => [k.label, k.value])).toEqual([['Style', NONE]])
    expect(groupPartsOf(c, fresh(), frame('Bust'))).toEqual([])
  })
  it('choosing an option of a state sets what it sets, and the state shows the option', () => {
    const f = chooseOption(c, fresh(), 'g_arm', 'st_arm1', 'op_arm3')
    expect(groupPartsOf(c, f, frame('Head to hands')).find(g => g.group.name === 'Upper arm')!.states[0].value).toBe('op_arm3')
    expect(f.values.r_raise).toBeGreaterThan(0)
  })
  it('a style of a group is chosen and put back to none', () => {
    const f = chooseKind(c, fresh(), kind('Style', 'g_head'), 'p_form39')
    expect(kind('Style', 'g_head', f).value).toBe('p_form39')
    expect(f.values.r_tilt).toBe(-8)
    const back = chooseKind(c, f, kind('Style', 'g_head', f), NONE)
    expect(kind('Style', 'g_head', back).value).toBe(NONE)
    expect(valuesOf(c, back)).toEqual(valuesOf(c, fresh()))
  })
})

describe('a part', () => {
  it('offers its forms, sliders, fields, pattern, colours and whether it is worn', () => {
    const shirt = objectPartOf(c, fresh(), 'o_shirt')!
    expect(names(shirt.sliders)).toEqual(['Shirt fit'])
    expect(shirt.fieldsets.map(f => f.set.name)).toEqual(['Shirt colour', 'Pocket corners'])
    expect(shirt.patterns.map(p => [p.pattern.name, p.on])).toEqual([['Stripes', true]])
    expect(shirt.slots.map(s => s.id)).toEqual(['k_cloth'])
    expect(shirt.worn).toBe(true)
    const head = objectPartOf(c, fresh(), 'o_head')!
    expect(head.axes.map(a => [a.axis.name, a.value])).toEqual([['Head shape', 'f_form2']])
    expect(head.worn).toBeNull()
  })
  it('a field is offered as a field, never twice as a plain slider, and only while its owner is on', () => {
    const f = fresh()
    expect(objectPartOf(c, f, 'o_head')!.sliders).toEqual([])
    expect(objectPartOf(c, f, 'o_head')!.fieldsets.map(s => names(s.ranges))).toEqual([['Head width', 'Head height']])
    expect(objectPartOf(c, f, 'o_shirt')!.fieldsets.map(s => s.set.name)).not.toContain('Darker shirt')
    const dark = chooseKind(c, f, kind('Style', 'o_shirt'), 'p_dark')
    expect(objectPartOf(c, dark, 'o_shirt')!.fieldsets.map(s => s.set.name)).toContain('Darker shirt')
  })
  it('a field that is not shown to writers is not offered', () => {
    const quiet: ModelContent = { ...c, ranges: c.ranges.map(r => (r.id === 'r_f2' ? { ...r, show: false } : r)) }
    expect(objectPartOf(quiet, fresh(), 'o_head')!.fieldsets.map(s => names(s.ranges))).toEqual([['Head height']])
  })
  it('a form, and the member of a family, are chosen', () => {
    const head = objectPartOf(c, fresh(), 'o_head')!
    const square = setForm(fresh(), 'o_head', head.axes[0].axis, 'f_form3')
    expect(objectPartOf(c, square, 'o_head')!.axes[0].value).toBe('f_form3')
    expect(setForm(fresh(), 'o_head', head.axes[0].axis, 'f_nope')).toEqual(fresh())
    const eye = objectPartOf(c, fresh(), 'o_form15')!
    expect(eye.family!.members.map(m => m.name)).toEqual(['Almond', 'Round', 'Hooded'])
    const round = setMember(fresh(), eye.family!.klass, 'o_form18')
    expect(objectPartOf(c, round, 'o_form18')!.family!.value).toBe('o_form18')
  })
  it('a twin shows what its original shows, and its change is the original\'s', () => {
    const twin = objectPartOf(c, fresh(), 'o_twin2')!
    expect(twin.owner.id).toBe('o_arm')
    expect(twin.axes.map(a => a.axis.name)).toEqual(['Sleeve'])
  })
  it('a garment is worn or not, and a garment that is not worn is still listed to put it on again', () => {
    const f = fresh()
    expect(garmentsIn(c, f, frame('Head to hands')).map(g => [g.name, g.worn])).toEqual([['Shirt', true], ['Undershirt', true]])
    const off = setWorn(c, f, 'o_shirt', false)
    expect(off.hidden).toEqual(['o_shirt'])
    expect(objectPartOf(c, off, 'o_shirt')!.worn).toBe(false)
    expect(garmentsIn(c, off, frame('Head to hands')).find(g => g.name === 'Shirt')!.worn).toBe(false)
    expect(hotspotsOf(c, off, solveFigure(c, off), frame('Head to hands')).some(h => h.object.id === 'o_shirt')).toBe(false)
    expect(setWorn(c, off, 'o_shirt', true).hidden).toEqual([])
    expect(wornIds(c, c.objects.find(o => o.id === 'o_shirt')!)).toEqual(['o_shirt'])
  })
  it('a twin garment goes with its original, and a family of garments goes together', () => {
    const twin = { ...c.objects.find(o => o.id === 'o_shirt')!, id: 'o_shirt2', mirrorOf: 'o_shirt' }
    const two: ModelContent = { ...c, objects: [...c.objects, twin] }
    expect(wornIds(two, two.objects.find(o => o.id === 'o_shirt')!).sort()).toEqual(['o_shirt', 'o_shirt2'])
    expect(setWorn(two, fresh(), 'o_shirt2', false).hidden.sort()).toEqual(['o_shirt', 'o_shirt2'])
    const family: ModelContent = { ...c, classes: [...(c.classes ?? []), { id: 'k_tops', name: 'Tops', template: 'o_under', exclusive: true }], objects: c.objects.map(o => (o.id === 'o_shirt' || o.id === 'o_under' ? { ...o, classOf: 'k_tops' } : o)) }
    expect(wornIds(family, family.objects.find(o => o.id === 'o_shirt')!).sort()).toEqual(['o_shirt', 'o_under'])
  })
  it('a fill pattern is switched off like an object, and stays off when the look is changed', () => {
    const off = setPattern(fresh(), 'pt_stripes', false)
    expect(objectPartOf(c, off, 'o_shirt')!.patterns[0].on).toBe(false)
    expect(atAge(c, off, 'p_form41').hidden).toContain('pt_stripes')
    expect(setPattern(off, 'pt_stripes', true).hidden).toEqual([])
    expect(solveFigure(c, off).shapes.s_stripe1.visible).toBe(false)
    expect(solveFigure(c, fresh()).shapes.s_stripe1.visible).toBe(true)
  })
  it('the side hanging things fall to is chosen for the parts that hang', () => {
    expect(objectPartOf(c, fresh(), 'o_hair')!.falls).toBe(true)
    expect(objectPartOf(c, fresh(), 'o_head')!.falls).toBe(false)
    expect(setFall(fresh(), 'left').fall).toBe('left')
  })
})

describe('the parts that can be pointed at', () => {
  const region = frame('Head to hands')
  it('are the objects of a sheet that are shown and have something to change, in the order they are drawn so the one in front is in front', () => {
    const f = fresh()
    const solved = solveFigure(c, f)
    const spots = hotspotsOf(c, f, solved, region)
    expect(spots.length).toBeGreaterThan(5)
    expect(spots.every(h => h.changes.length > 0)).toBe(true)
    const at = (id: string) => spots.findIndex(h => h.object.id === id)
    expect(at('o_under')).toBeLessThan(at('o_shirt'))
    const top = (id: string) => Math.max(...c.objects.find(o => o.id === id)!.shapes.map(s => solved.order.indexOf(s)))
    const tops = spots.map(h => top(h.object.id))
    expect(tops).toEqual([...tops].sort((a, b) => a - b))
    expect(spots.some(h => h.object.id === 'o_head')).toBe(false)
  })
  it('say what can be changed', () => {
    const f = fresh()
    const shirt = hotspotsOf(c, f, solveFigure(c, f), region).find(h => h.object.id === 'o_shirt')!
    expect(shirt.changes).toEqual(expect.arrayContaining(['Shirt fit', 'Style', 'Pocket corners', 'Stripes', 'Clothing colour', 'Worn or not']))
  })
  it('follow the figure in the back view', () => {
    const f = fresh()
    const back = hotspotsOf(c, f, solveFigure(c, f, 'figure', 'back'), region)
    expect(back.some(h => h.object.id === 'o_shirt')).toBe(true)
  })
  it('a layer that is switched off has none, and the layers a sheet has are listed', () => {
    const f = fresh()
    expect(layersIn(c, f, region)).toEqual(['body', 'clothing'])
    expect(layersIn(c, f, frame('Bust'))).toEqual(['body', 'hair'])
    const noClothes = hotspotsOf(c, f, solveFigure(c, f), region, { ...ALL_LAYERS, clothing: false })
    expect(noClothes.some(h => h.object.layer === 'clothing')).toBe(false)
    expect(noClothes.some(h => h.object.layer === 'body')).toBe(true)
  })
  it('an object a family does not show has none', () => {
    const f = fresh()
    const eyes = hotspotsOf(c, f, solveFigure(c, f), frame('Face')).map(h => h.object.id)
    expect(eyes).toContain('o_form15')
    expect(eyes).not.toContain('o_form18')
  })
})

describe('colour', () => {
  it('a default colour or a swatch is chosen for a slot; one that is not there is refused', () => {
    const f = pickColour(c, fresh(), 'k_hair', 'colour', 'c_hair_3')
    expect(f.colours.k_hair).toEqual({ src: 'colour', id: 'c_hair_3' })
    expect(pickColour(c, fresh(), 'k_hair', 'colour', 'c_nope')).toEqual(fresh())
    expect(pickColour(c, fresh(), 'k_hair', 'swatch', 'k_nope')).toEqual(fresh())
    expect(pickColour(c, fresh(), 'k_nope', 'colour', 'c_hair_3')).toEqual(fresh())
    expect(pickColour(c, fresh(), 'k_hair', 'swatch', 'k2').colours.k_hair).toEqual({ src: 'swatch', id: 'k2' })
  })
  it('brightness and opacity are held to the slot\'s range, and need a colour first', () => {
    const f = pickColour(c, fresh(), 'k_hair', 'colour', 'c_hair_3')
    expect(setBrightness(c, f, 'k_hair', 500).colours.k_hair.l).toBe(96)
    expect(setBrightness(c, f, 'k_hair', -5).colours.k_hair.l).toBe(4)
    expect(setOpacity(c, f, 'k_hair', 10).colours.k_hair.a).toBe(60)
    expect(setBrightness(c, fresh(), 'k_hair', 50)).toEqual(fresh())
  })
  it('a swatch keeps the brightness the slot had, a default colour starts at its own', () => {
    const lit = setBrightness(c, pickColour(c, fresh(), 'k_hair', 'colour', 'c_hair_3'), 'k_hair', 70)
    expect(pickColour(c, lit, 'k_hair', 'swatch', 'k2').colours.k_hair).toEqual({ src: 'swatch', id: 'k2', l: 70 })
    expect(pickColour(c, lit, 'k_hair', 'colour', 'c_hair_5').colours.k_hair.l).toBeUndefined()
  })
  it('a part the model locks is fixed in the figure, and the editor says so', () => {
    const skin = c.slots!.find(s => s.id === 'k_cloth')!
    const f = pickColour(c, fresh(), 'k_cloth', 'colour', skin.colours[0].id)
    expect(colouringOf(c, f).locks).toEqual({ o_shirt: { k_cloth: { h: null, s: 35, l: null } } })
    const v = slotViewOf(c, f, 'o_shirt', skin)
    expect(v.locked).toEqual({ h: false, s: true, l: false, all: false })
    const drawn = drawFigure(c, f).items.find(i => i.id === 's_shirt')!
    expect(Math.abs(hexHsl(drawn.fill)[1] - 35)).toBeLessThan(2)
    const free: ModelContent = { ...c, objects: c.objects.map(o => (o.id === 'o_shirt' ? { ...o, hsl: {} } : o)) }
    expect(Math.abs(hexHsl(drawFigure(free, f).items.find(i => i.id === 's_shirt')!.fill)[1] - 35)).toBeGreaterThan(2)
  })
  it('a style that holds a lightness is on until another is chosen, and fixes the lightness', () => {
    const skin = c.slots!.find(s => s.id === 'k_cloth')!
    const f = chooseKind(c, pickColour(c, fresh(), 'k_cloth', 'colour', skin.colours[0].id), kind('Style', 'o_shirt'), 'p_dark')
    expect(f.on).toEqual(['p_dark'])
    expect(kind('Style', 'o_shirt', f).value).toBe('p_dark')
    const v = slotViewOf(c, f, 'o_shirt', skin)
    expect(v.locked).toEqual({ h: false, s: true, l: true, all: false })
    expect(Math.round(v.resolved.l)).toBe(18)
    const none = chooseKind(c, f, kind('Style', 'o_shirt', f), NONE)
    expect(none.on).toEqual([])
    expect(slotViewOf(c, none, 'o_shirt', skin).locked.l).toBe(false)
  })
  it('a twin has the locks of its original', () => {
    const skin = c.slots!.find(s => s.id === 'k_cloth')!
    expect(slotViewOf(c, fresh(), 'o_twin2', skin).locked).toEqual(slotViewOf(c, fresh(), 'o_arm', skin).locked)
  })
})

describe('what a style keeps', () => {
  it('the styles that are on and the order a style gave survive a conversion of the figure', () => {
    const f: CharacterFigure = { ...fresh(), on: ['p_dark', 'p_gone'], order: { o_shirt: ['s_shirt', 's_pocket'], o_gone: ['x'], o_head: [] } }
    const back = withTest(c, f, testOf(c, f))
    expect(back.on).toEqual(['p_dark'])
    expect(back.order).toEqual({ o_shirt: ['s_shirt', 's_pocket'] })
    expect(normalizeFigure({ model: copy.id, on: ['p_dark'], order: { o_shirt: ['s_shirt'] } })).toMatchObject({ on: ['p_dark'], order: { o_shirt: ['s_shirt'] } })
    expect(normalizeFigure({ model: copy.id, on: 'x', order: [1] })).toMatchObject({ on: [], order: {} })
  })
  it('the order a style gave is how the shapes of the object are drawn', () => {
    const f = fresh()
    const plain = solveFigure(c, f).order
    const flipped = solveFigure(c, { ...f, order: { o_shirt: ['s_pocket', 's_shirt'] } }).order
    expect(plain.indexOf('s_shirt')).toBeLessThan(plain.indexOf('s_pocket'))
    expect(flipped.indexOf('s_pocket')).toBeLessThan(flipped.indexOf('s_shirt'))
  })
})

describe('Randomise this part only', () => {
  const rolls = (scope: string, locks: string[] = []): CharacterFigure[] => Array.from({ length: 24 }, (_, i) => rollPart(c, { ...fresh(), locks }, scope, seededRng(i + 1)))
  const start = fresh()

  it('changes what is in the group and leaves the rest of the figure alone', () => {
    const results = rolls('g_head')
    for (const f of results) {
      const v = valuesOf(c, f), before = valuesOf(c, start)
      for (const id of ['r_raise', 'r_elbow', 'r_arm_len', 'r_height', 'r_shoulders', 'r_fit', 'r_f5']) expect(v[id]).toBe(before[id])
      expect(f.forms['o_arm.a_form5'] ?? 'f_form6').toBe('f_form6')
      expect(f.hidden).toEqual([])
      for (const slot of ['k_skin', 'k_cloth', 'k_shoe']) expect(f.colours[slot]).toBeUndefined()
      expect(f.tile).toBe(start.tile)
    }
    expect(results.some(f => valuesOf(c, f).r_tilt !== 0)).toBe(true)
    expect(results.some(f => f.forms['o_head.a_form1'] && f.forms['o_head.a_form1'] !== 'f_form2')).toBe(true)
    expect(results.some(f => f.colours.k_eye)).toBe(true)
  })
  it('rolls a part\'s own sliders inside the span a writer may move them in', () => {
    for (const f of rolls('g_head')) for (const id of ['r_tilt', 'r_head']) { const [lo, hi] = spanOf(c.ranges.find(r => r.id === id)!); expect(valuesOf(c, f)[id]).toBeGreaterThanOrEqual(lo); expect(valuesOf(c, f)[id]).toBeLessThanOrEqual(hi) }
  })
  it('rolls one object, with the family it is the member of, and not its neighbours', () => {
    const results = rolls('o_form15')
    for (const f of results) {
      expect(valuesOf(c, f)).toEqual(valuesOf(c, start))
      expect(f.forms['o_head.a_form1'] ?? 'f_form2').toBe('f_form2')
    }
    expect(results.some(f => f.forms['class:k_form12'] && f.forms['class:k_form12'] !== 'o_form15')).toBe(true)
  })
  it('leaves a part the figure locks alone', () => {
    for (const f of rolls('g_head', ['o_head'])) expect(f.forms['o_head.a_form1']).toBeUndefined()
    for (const f of rolls('o_head', ['o_head'])) expect(f).toEqual({ ...start, locks: ['o_head'] })
  })
  it('stays in the genre of the figure', () => {
    for (let i = 1; i <= 20; i += 1) {
      const f = rollPart(c, { ...fresh(), genre: 'g_fiction' }, 'g_head', seededRng(i))
      const eye = c.slots!.find(s => s.id === 'k_eye')!
      const chosen = f.colours.k_eye
      if (chosen?.src === 'colour') expect(eye.colours.find(k => k.id === chosen.id)!.genres.length === 0 || eye.colours.find(k => k.id === chosen.id)!.genres.includes('g_fiction')).toBe(true)
    }
  })
  it('does nothing for a part the model does not have, and is the same for the same seed', () => {
    expect(rollPart(c, fresh(), 'o_nope', seededRng(1))).toEqual(fresh())
    expect(rollPart(c, fresh(), 'g_head', seededRng(5))).toEqual(rollPart(c, fresh(), 'g_head', seededRng(5)))
  })
  it('a roll of the whole figure keeps what is on and the order', () => {
    const f: CharacterFigure = { ...fresh(), on: ['p_dark'], order: { o_shirt: ['s_pocket', 's_shirt'] } }
    const rolled = rollPart(c, f, 'g_head', seededRng(3))
    expect(rolled.on).toEqual(['p_dark'])
    expect(rolled.order).toEqual({ o_shirt: ['s_pocket', 's_shirt'] })
  })
})
