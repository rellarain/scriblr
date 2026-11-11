import { describe, expect, it } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import { hexHsl } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import {
  ALL_LAYERS, NONE, WHOLE, addSwatchTo, chooseKind, chooseOption, deleteMine, deleteSwatch, editSwatch, figurePartOf, groupPartsOf, hotspotsOf, isLocked, isMine, kindsFor, layerListIn, layersIn, lockSheet,
  moveLayer, objectPartOf, paletteFor, pickColour, presetContent, regionOfObject, regionsOf, renameMine, rollPart, saveMine, setBrightness, setFall, setForm, setLock, setMember, setOpacity, setPattern,
  setTile, setWorn, sheetLocked, slotViewOf, unlockAll, wornIds,
} from './figureEditing'
import { carryOver } from './figureCarry'
import { atAge, blankFigure, colouringOf, drawFigure, normalizeFigure, setValue, solveFigure, spanOf, testOf, valuesOf, withTest } from './figureState'

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
    expect(layerListIn(c, f, frame('Head to hands'), 'clothing').map(g => [g.name, g.worn])).toEqual([['Shirt', true], ['Undershirt', true]])
    const off = setWorn(c, f, 'o_shirt', false)
    expect(off.hidden).toEqual(['o_shirt'])
    expect(objectPartOf(c, off, 'o_shirt')!.worn).toBe(false)
    expect(layerListIn(c, off, frame('Head to hands'), 'clothing').find(g => g.name === 'Shirt')!.worn).toBe(false)
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

// A vest over the shirt (the shirt's shape, drawn after every shape of the shirt): a garment the model puts in no order with the others, so a writer may move it.
const vested: ModelContent = (() => {
  const shirt = c.shapes.find(s => s.id === 's_shirt')!
  const top = Math.max(...c.objects.find(o => o.id === 'o_shirt')!.shapes.map(id => c.shapes.find(s => s.id === id)!.z))
  return {
    ...c,
    shapes: [...c.shapes, { ...shirt, id: 's_vest', name: 'Vest', z: top }],
    objects: [...c.objects, { id: 'o_vest', name: 'Vest', layer: 'clothing', shapes: ['s_vest'] }],
    groups: c.groups.map(g => (g.id === 'g_shirt' ? { ...g, objects: [...g.objects, 'o_vest'] } : g)),
  }
})()
const vestFig = (over: Partial<CharacterFigure> = {}): CharacterFigure => ({ ...blankFigure(copyOf(vested).id, vested), ...over })
const region = () => frame('Head to hands')

describe('the clothing and the hair of a sheet', () => {
  it('lists the parts of a layer with the one in front first, and says why a part cannot move', () => {
    const rows = layerListIn(vested, vestFig(), region(), 'clothing')
    expect(rows.map(r => r.name)).toEqual(['Vest', 'Shirt', 'Undershirt'])
    expect(rows.map(r => [r.front, r.behind])).toEqual([
      ['It is in front already.', null],
      [null, 'Undershirt is worn under Shirt: the model keeps it there.'],
      ['Undershirt is worn under Shirt: the model keeps it there.', 'It is at the back already.'],
    ])
  })
  it('moves a part behind the next one by changing places, and the offsets say exactly the order that is drawn', () => {
    const f = moveLayer(vested, vestFig(), 'clothing', 'o_vest', 'behind', region())
    expect(f.zoff).toEqual({ o_vest: -1, o_shirt: 1 })
    expect(layerListIn(vested, f, region(), 'clothing').map(r => r.name)).toEqual(['Shirt', 'Vest', 'Undershirt'])
    const order = solveFigure(vested, f).order
    expect(order.indexOf('s_vest')).toBeLessThan(order.indexOf('s_shirt'))
    expect(solveFigure(vested, vestFig()).order.indexOf('s_vest')).toBeGreaterThan(solveFigure(vested, vestFig()).order.indexOf('s_shirt'))
    // and back again: nothing is kept
    expect(moveLayer(vested, f, 'clothing', 'o_vest', 'front', region()).zoff).toEqual({})
  })
  it('does not move a part the model keeps in order, nor one past the end', () => {
    const f = vestFig()
    expect(moveLayer(vested, f, 'clothing', 'o_shirt', 'behind', region())).toBe(f)
    expect(moveLayer(vested, f, 'clothing', 'o_under', 'front', region())).toBe(f)
    expect(moveLayer(vested, f, 'clothing', 'o_vest', 'front', region())).toBe(f)
    expect(moveLayer(vested, f, 'clothing', 'o_nope', 'front', region())).toBe(f)
  })
  it('a garment that is not worn keeps its place in the list and in the order', () => {
    const off = setWorn(vested, vestFig(), 'o_vest', false)
    const rows = layerListIn(vested, off, region(), 'clothing')
    expect(rows.map(r => [r.name, r.worn])).toEqual([['Vest', false], ['Shirt', true], ['Undershirt', true]])
    expect(moveLayer(vested, off, 'clothing', 'o_vest', 'behind', region()).zoff).toEqual({ o_vest: -1, o_shirt: 1 })
  })
  it('lists the hair of a sheet without a worn switch', () => {
    const rows = layerListIn(c, fresh(), frame('Bust'), 'hair')
    expect(rows.map(r => [r.name, r.worn])).toEqual([['Ponytail', null]])
    expect(rows[0].open.id).toBe('o_hair')
    expect(layerListIn(c, fresh(), frame('Face'), 'hair')).toEqual([])
  })
  it('moves hair parts among the hair of the model the same way', () => {
    const fringe = { ...c.shapes.find(s => s.id === 's_lock')!, id: 's_fringe', name: 'Fringe' }
    const two: ModelContent = {
      ...c, shapes: [...c.shapes, fringe], objects: [...c.objects, { id: 'o_fringe', name: 'Fringe', layer: 'hair', shapes: ['s_fringe'] }],
      groups: c.groups.map(g => (g.id === 'g_head' ? { ...g, objects: [...g.objects, 'o_fringe'] } : g)),
    }
    const f = { ...blankFigure(copyOf(two).id, two) }
    const bust = frame('Bust')
    const rows = layerListIn(two, f, bust, 'hair')
    expect(rows.map(r => r.name).sort()).toEqual(['Fringe', 'Ponytail'])
    const front = rows[0]
    const moved = moveLayer(two, f, 'hair', front.key, 'behind', bust)
    expect(layerListIn(two, moved, bust, 'hair')[1].key).toBe(front.key)
  })
})

describe('locks', () => {
  it('are kept on the part, and a twin has its original\'s', () => {
    const f = setLock(c, fresh(), 'o_head', true)
    expect(f.locks).toEqual(['o_head'])
    expect(isLocked(c, f, 'o_head')).toBe(true)
    expect(setLock(c, f, 'o_head', false).locks).toEqual([])
    const twin = setLock(c, fresh(), 'o_twin2', true)
    expect(twin.locks).toEqual(['o_arm'])
    expect(isLocked(c, twin, 'o_twin2')).toBe(true)
    expect(setLock(c, fresh(), 'o_nope', true).locks).toEqual([])
  })
  it('a lock on a sheet covers every part on it, and is on only while every part is locked', () => {
    const f = lockSheet(c, fresh(), frame('Face'), true)
    expect(sheetLocked(c, f, frame('Face'))).toBe(true)
    expect(f.locks).toEqual(expect.arrayContaining(['o_head', 'o_eye', 'o_form15']))
    expect(f.locks).not.toContain('o_shirt')
    expect(sheetLocked(c, setLock(c, f, 'o_head', false), frame('Face'))).toBe(false)
    expect(lockSheet(c, f, frame('Face'), false).locks).toEqual([])
    expect(unlockAll(f).locks).toEqual([])
    expect(unlockAll(fresh())).toEqual(fresh())
  })
  it('show on the part\'s box, and Randomise leaves the part as it is', () => {
    const f = setLock(c, fresh(), 'o_head', true)
    const spots = hotspotsOf(c, f, solveFigure(c, f), frame('Face'))
    expect(spots.find(h => h.object.id === 'o_head')!.locked).toBe(true)
    expect(spots.find(h => h.object.id === 'o_form15')!.locked).toBe(false)
    expect(objectPartOf(c, f, 'o_twin2')!.locked).toBe(false)
    for (let i = 1; i <= 12; i += 1) expect(rollPart(c, f, 'g_head', seededRng(i)).forms['o_head.a_form1']).toBeUndefined()
  })
})

describe('a style of the writer\'s own', () => {
  const squareHead = () => { const head = objectPartOf(c, fresh(), 'o_head')!; return setForm(fresh(), 'o_head', head.axes[0].axis, 'f_form3') }

  it('is kept from what is chosen for the part, and reads as the style that is on', () => {
    const made = saveMine(c, squareHead(), 'o_head', 'Square jaw')
    expect(typeof made).toBe('object')
    const f = made as CharacterFigure
    expect(f.mine).toHaveLength(1)
    expect(f.mine[0]).toMatchObject({ name: 'Square jaw', kind: 'Style', scope: 'o_head', forms: { 'o_head.a_form1': 'f_form3' } })
    const style = objectPartOf(c, f, 'o_head')!.kinds.find(k => k.label === 'Style')!
    expect(style.presets.map(p => p.name)).toEqual(['Square jaw'])
    expect(style.value).toBe(f.mine[0].id)
    expect(isMine(f, f.mine[0].id)).toBe(true)
  })
  it('is chosen again like the model\'s own, and a field kept in it comes back', () => {
    const head = objectPartOf(c, fresh(), 'o_head')!
    const start = setValue(c, squareHead(), 'r_f2', 120)
    const f = saveMine(c, start, 'o_head', 'Wide square') as CharacterFigure
    expect(f.mine[0].values).toEqual({ r_f2: 120 })
    const changed = setValue(c, setForm(f, 'o_head', head.axes[0].axis, 'f_form4'), 'r_f2', 60)
    const kind = objectPartOf(c, changed, 'o_head')!.kinds.find(k => k.label === 'Style')!
    expect(kind.value).toBe('')
    const again = chooseKind(c, changed, kind, f.mine[0].id)
    expect(again.forms['o_head.a_form1']).toBe('f_form3')
    expect(valuesOf(c, again).r_f2).toBe(120)
    expect(objectPartOf(c, again, 'o_head')!.kinds.find(k => k.label === 'Style')!.value).toBe(f.mine[0].id)
  })
  it('sits with the model\'s styles of the part in one dropdown, and is named My style 1 when no name is given', () => {
    const f = saveMine(c, setValue(c, fresh(), 'r_fit', 150), 'o_shirt', '  ') as CharacterFigure
    const kind = objectPartOf(c, f, 'o_shirt')!.kinds.find(k => k.label === 'Style')!
    expect(kind.presets.map(p => p.name)).toEqual(['Dark', 'My style 1'])
    expect(presetContent(c, f).presets).toHaveLength((c.presets ?? []).length + 1)
    expect(presetContent(c, fresh())).toBe(c)
  })
  it('is kept on the original of a twin', () => {
    const f = saveMine(c, setForm(fresh(), 'o_arm', objectPartOf(c, fresh(), 'o_arm')!.axes[0].axis, 'f_form7'), 'o_twin2', 'Long sleeves') as CharacterFigure
    expect(f.mine[0].scope).toBe('o_arm')
  })
  it('is refused when nothing about the part is away from the model\'s look, and past the limit', () => {
    expect(saveMine(c, fresh(), 'o_head', 'Nothing')).toBe('Change something about this part first: a style keeps its forms and sliders.')
    const full: CharacterFigure = { ...squareHead(), mine: Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, name: `S${i}`, kind: 'Style', values: {}, hidden: [] })) }
    expect(saveMine(c, full, 'o_head', 'One more')).toMatch(/at most 40 styles/)
    expect(saveMine(c, squareHead(), 'o_nope', 'x')).toBe('That part is not in this model.')
  })
  it('is renamed and deleted, and a deleted one is no longer on', () => {
    const f = saveMine(c, squareHead(), 'o_head', 'Square jaw') as CharacterFigure
    const id = f.mine[0].id
    expect(renameMine(f, id, '  Strong jaw ').mine[0].name).toBe('Strong jaw')
    expect(renameMine(f, id, '   ')).toBe(f)
    expect(renameMine(f, 'p_dark', 'x')).toBe(f)
    const gone = deleteMine({ ...f, on: [id, 'p_dark'] }, id)
    expect(gone.mine).toEqual([])
    expect(gone.on).toEqual(['p_dark'])
    expect(deleteMine(f, 'p_dark')).toBe(f)
  })
})

describe('the character\'s own palette and card colour', () => {
  it('starts as the model\'s and becomes the character\'s own with the first change', () => {
    expect(fresh().palette).toBeNull()
    expect(paletteFor(c, fresh()).map(p => p.id)).toEqual(['k1', 'k2', 'k3', 'k4', 'k5'])
    const f = editSwatch(c, fresh(), 'k2', { h: 400, s: -5 })
    expect(f.palette!.find(p => p.id === 'k2')).toMatchObject({ h: 359, s: 0 })
    expect(f.palette).toHaveLength(5)
    expect(c.palette!.find(p => p.id === 'k2')!.h).not.toBe(359)
  })
  it('a swatch is renamed, with a name that is not empty', () => {
    expect(editSwatch(c, fresh(), 'k1', { name: '  Honey ' }).palette!.find(p => p.id === 'k1')!.name).toBe('Honey')
    expect(editSwatch(c, fresh(), 'k1', { name: '   ' }).palette!.find(p => p.id === 'k1')!.name).toBe(c.palette!.find(p => p.id === 'k1')!.name)
  })
  it('gets swatches added up to ten, and says so at the limit', () => {
    let f = fresh()
    for (let i = 0; i < 5; i += 1) { const made = addSwatchTo(c, f); expect(typeof made).toBe('object'); f = made as CharacterFigure }
    expect(f.palette).toHaveLength(10)
    expect(addSwatchTo(c, f)).toMatch(/at most 10 swatches/)
  })
  it('loses a swatch, and the colours that used it go gray; the last one stays', () => {
    const f = pickColour(c, { ...fresh(), palette: paletteFor(c, fresh()) }, 'k_hair', 'swatch', 'k3')
    expect(f.colours.k_hair).toMatchObject({ src: 'swatch', id: 'k3' })
    const gone = deleteSwatch(c, f, 'k3')
    expect(gone.palette!.map(p => p.id)).toEqual(['k1', 'k2', 'k4', 'k5'])
    expect(gone.colours.k_hair).toBeUndefined()
    const one: CharacterFigure = { ...fresh(), palette: [{ id: 'k1', name: 'Only', h: 10, s: 10 }] }
    expect(deleteSwatch(c, one, 'k1')).toBe(one)
    expect(deleteSwatch(c, f, 'k_none')).toBe(f)
  })
  it('a swatch changed recolours every colour that uses it', () => {
    const f = pickColour(c, fresh(), 'k_hair', 'swatch', 'k2')
    const before = drawFigure(c, f).items.find(i => i.id === 's_lock')!.fill
    const after = drawFigure(c, editSwatch(c, f, 'k2', { h: 200 })).items.find(i => i.id === 's_lock')!.fill
    expect(after).not.toBe(before)
  })
  it('the card colour is a colour', () => {
    expect(setTile(fresh(), '#A1B2C3').tile).toBe('#a1b2c3')
    expect(setTile(fresh(), 'red')).toEqual(fresh())
    expect(drawFigure(c, setTile(fresh(), '#112233')).tile).toBe('#112233')
  })
})

describe('using another model', () => {
  const to: ModelContent = {
    ...c,
    ranges: c.ranges.filter(r => r.id !== 'r_tilt'),
    objects: c.objects.filter(o => o.id !== 'o_hair'),
    genres: c.genres!.filter(g => g.id !== 'g_fantasy'),
    presets: (c.presets ?? []).filter(p => p.id !== 'p_dark'),
  }
  const long = (): CharacterFigure => ({
    ...fresh(), values: { r_tilt: 10, r_head: 95, r_height: 99 }, forms: { 'o_head.a_form1': 'f_form3', 'o_head.a_gone': 'x', 'o_gone.a_form1': 'f', 'class:k_form12': 'o_form18', 'class:k_none': 'o_form18' },
    hidden: ['o_shirt', 'o_hair', 'pt_stripes'], colours: { k_hair: { src: 'swatch', id: 'k2', l: 40 }, k_skin: { src: 'colour', id: 'c_skin_3' }, k_gone: { src: 'colour', id: 'x' }, k_eye: { src: 'colour', id: 'c_gone' } },
    palette: [{ id: 'k2', name: 'Mine', h: 10, s: 50 }], tile: '#445566', fall: 'left', locks: ['o_head', 'o_hair', 'g_head', 'g_gone'], zoff: { o_shirt: 1, o_hair: -1 },
    mine: [{ id: 'm1', name: 'Mine', kind: 'Style', scope: 'o_head', values: { r_tilt: 4, r_head: 100 }, hidden: ['o_hair', 's_head'], forms: { 'o_head.a_form1': 'f_form3', 'o_head.a_gone': 'x' } }, { id: 'm2', name: 'Hair', kind: 'Style', scope: 'o_hair', values: {}, hidden: [] }],
    genre: 'g_fantasy', on: ['p_dark', 'p_form43', 'm1'], order: { o_shirt: ['s_shirt', 's_gone'], o_hair: ['s_lock'] },
  })
  it('keeps what the new model has under the same name, and leaves the rest behind', () => {
    const f = carryOver(to, long(), 'abcdef012345')
    expect(f.model).toBe('abcdef012345')
    expect(f.values).toEqual({ r_head: 95, r_height: 99 })
    expect(f.forms).toEqual({ 'o_head.a_form1': 'f_form3', 'class:k_form12': 'o_form18' })
    expect(f.hidden).toEqual(['o_shirt', 'pt_stripes'])
    expect(f.colours).toEqual({ k_hair: { src: 'swatch', id: 'k2', l: 40 }, k_skin: { src: 'colour', id: 'c_skin_3' } })
    expect(f.locks).toEqual(['o_head', 'g_head'])
    expect(f.zoff).toEqual({ o_shirt: 1 })
    expect(f.order).toEqual({ o_shirt: ['s_shirt'] })
    expect(f.genre).toBeNull()
    expect(f.on).toEqual(['p_form43', 'm1'])
  })
  it('keeps the character\'s own: its palette, card colour, fall side, and its own styles for the parts that are there', () => {
    const f = carryOver(to, long(), 'abcdef012345')
    expect(f.palette).toEqual([{ id: 'k2', name: 'Mine', h: 10, s: 50 }])
    expect(f.tile).toBe('#445566')
    expect(f.fall).toBe('left')
    expect(f.mine.map(p => p.id)).toEqual(['m1'])
    expect(f.mine[0]).toMatchObject({ values: { r_head: 100 }, hidden: ['s_head'], forms: { 'o_head.a_form1': 'f_form3' } })
  })
  it('holds a slider to the span the new model lets a writer choose within', () => {
    const narrow: ModelContent = { ...to, ranges: to.ranges.map(r => (r.id === 'r_head' ? { ...r, limit: [98, 110] as [number, number] } : r)) }
    expect(carryOver(narrow, long(), 'abcdef012345').values.r_head).toBe(98)
  })
  it('does not change the figure it is given, and draws something', () => {
    const f = long()
    const before = JSON.stringify(f)
    const moved = carryOver(to, f, 'abcdef012345')
    expect(JSON.stringify(f)).toBe(before)
    expect(drawFigure(to, moved).items.length).toBeGreaterThan(10)
    expect(carryOver(c, fresh(), 'abcdef012345')).toEqual({ ...fresh(), model: 'abcdef012345' })
  })
})
