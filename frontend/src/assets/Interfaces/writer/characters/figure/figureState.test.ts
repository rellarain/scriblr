import { describe, expect, it } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import { seededRng } from '../../../admin/characters/engine/previews'
import {
  agePresets, ageOf, atAge, blankFigure, followHeight, clampToSpan, colouringOf, copyFigure, cropBox, describeFigure, drawFigure, figureDiff, frameFor, normalizeFigure, restBox, rollFigure, setValue,
  spanOf, squareBox, testOf, valuesOf, withTest, writerRanges,
} from './figureState'
import { describeFigureFields } from './figureWords'

// The sample model of the design system: a rigged figure with sliders (some with a writer's limit), forms, presets (Age, Build, Outfit...), frames (Face is one), genres and slots.
const model: ModelContent = previewModels()[0].draft
const KEY = copyOf(model).id
const fresh = (): CharacterFigure => blankFigure(KEY, model)
const range = (id: string) => model.ranges.find(r => r.id === id)!
const allFinite = (d: string) => !/NaN|undefined|Infinity/.test(d)

describe('the figure and its repairs', () => {
  it('a blank figure has nothing chosen and the model card colour', () => {
    expect(fresh()).toEqual({ model: KEY, values: {}, forms: {}, hidden: [], colours: {}, palette: null, tile: '#e6d6c3', fall: 'down', locks: [], zoff: {}, mine: [], genre: null, on: [], order: {} })
  })
  it('a figure read from a file is filled in, and one that points at no copy is none', () => {
    expect(normalizeFigure({ model: KEY, tile: '#ABCDEF', fall: 'left', genre: 'g_fantasy' })).toMatchObject({ model: KEY, tile: '#abcdef', fall: 'left', genre: 'g_fantasy', values: {}, locks: [], palette: null })
    expect(normalizeFigure({ model: KEY, tile: 'red', fall: 'sideways', genre: '' })).toMatchObject({ tile: '#e6d6c3', fall: 'down', genre: null })
    expect(normalizeFigure({ model: 'not a key' })).toBeNull()
    expect(normalizeFigure('x')).toBeNull()
    expect(normalizeFigure(null)).toBeNull()
  })
  it('a copy of a figure shares nothing with it', () => {
    const a = { ...fresh(), values: { r_head: 90 }, mine: [] }
    const b = copyFigure(a)
    b.values.r_head = 95
    expect(a.values.r_head).toBe(90)
  })
})

describe('the sliders a writer may move', () => {
  it('a span is the limit, else the range, and always holds the resting value', () => {
    expect(spanOf(range('r_head'))).toEqual([90, 115])
    expect(spanOf(range('r_tilt'))).toEqual([-20, 20])
    expect(spanOf({ ...range('r_head'), limit: [110, 120] })).toEqual([100, 120])
    expect(spanOf({ ...range('r_head'), limit: [60, 70] })).toEqual([85, 100])
  })
  it('a value is held to the span, and a missing one is rest', () => {
    expect(clampToSpan(range('r_head'), 200)).toBe(115)
    expect(clampToSpan(range('r_head'), 1)).toBe(90)
    expect(clampToSpan(range('r_head'), Number.NaN)).toBe(100)
  })
  it('values start at rest, take the figure\'s, hold them to the span and ignore ranges the copy does not have', () => {
    const v = valuesOf(model, { ...fresh(), values: { r_head: 200, r_tilt: 12, gone: 5 } })
    expect(v.r_head).toBe(115)
    expect(v.r_tilt).toBe(12)
    expect(v.r_height).toBe(100)
    expect('gone' in v).toBe(false)
  })
  it('setting a slider keeps it only while it is away from rest, within its span', () => {
    const away = setValue(model, fresh(), 'r_head', 500)
    expect(away.values).toEqual({ r_head: 115 })
    expect(setValue(model, away, 'r_head', 100).values).toEqual({})
    expect(setValue(model, fresh(), 'nope', 3)).toEqual(fresh())
  })
  it('the sliders shown to writers are the ones the model shows', () => {
    expect(writerRanges(model).length).toBe(model.ranges.filter(r => r.show).length)
    expect(writerRanges({ ...model, ranges: model.ranges.map(r => ({ ...r, show: r.id === 'r_tilt' })) }).map(r => r.id)).toEqual(['r_tilt'])
  })
})

describe('colour', () => {
  it('the colouring keeps the choices for slots the copy has, as numbers only, and uses the model palette unless the figure has its own', () => {
    const f = { ...fresh(), colours: { k_skin: { src: 'colour' as const, id: 'c_skin_2', l: 40, a: null }, k_gone: { src: 'colour' as const, id: 'x' } } }
    const c = colouringOf(model, f)
    expect(c.choices).toEqual({ k_skin: { src: 'colour', id: 'c_skin_2', l: 40 } })
    expect(c.palette).toEqual(model.palette)
    expect(colouringOf(model, { ...f, palette: [{ id: 'z', name: 'Z', h: 10, s: 20 }] }).palette).toEqual([{ id: 'z', name: 'Z', h: 10, s: 20 }])
  })
})

describe('the picture', () => {
  it('draws shapes with finite outlines, back to front, and the card colour', () => {
    const d = drawFigure(model, fresh())
    expect(d.items.length).toBeGreaterThan(10)
    for (const i of d.items) { expect(allFinite(i.d), i.id).toBe(true); expect(i.helper).toBe(false) }
    expect(d.tile).toBe('#e6d6c3')
    expect(d.box.w).toBeCloseTo(d.box.h, 6)
  })
  it('the whole figure is looked at through the same box for every figure of a copy, and the head through the smallest frame about the face', () => {
    expect(cropBox(model, 'figure')).toEqual(restBox(model))
    const face = model.frames!.find(f => f.name === 'Face')!
    expect(frameFor(model, 'head')?.id).toBe(face.id)
    expect(cropBox(model, 'head')).toEqual({ x: face.x, y: face.y, w: face.w, h: face.h })
    expect(cropBox(model, { frame: 'f_frame2' })).toMatchObject({ x: 50, y: 14, w: 100, h: 96 })
    expect(frameFor(model, { frame: 'nope' })).toBeUndefined()
  })
  it('a bust is the Bust frame of the model, else its head, else the top of the figure', () => {
    expect(frameFor(model, 'bust')?.name).toBe('Bust')
    const noBust: ModelContent = { ...model, frames: model.frames!.filter(f => f.name !== 'Bust') }
    expect(frameFor(noBust, 'bust')?.name).toBe('Face')
    expect(cropBox({ ...model, frames: [] }, 'bust')).toEqual(cropBox({ ...model, frames: [] }, 'head'))
  })
  it('a model with no frames shows the top of the figure as its head', () => {
    const bare: ModelContent = { ...model, frames: [] }
    const whole = restBox(bare)
    expect(cropBox(bare, 'head')).toEqual({ x: whole.x, y: whole.y, w: whole.w, h: Math.min(whole.h, whole.w) })
    expect(drawFigure(bare, fresh(), 'head').items.length).toBeGreaterThan(0)
  })
  it('the back view turns the frame about the axis', () => {
    const front = cropBox(model, 'head', 'front'), back = cropBox(model, 'head', 'back')
    expect(back.x).toBeCloseTo(2 * 100 - (front.x + front.w), 6)
  })
  it('a square box is the same box grown on its short side', () => {
    expect(squareBox({ x: 10, y: 0, w: 20, h: 60 })).toEqual({ x: -10, y: 0, w: 60, h: 60 })
    expect(squareBox({ x: 0, y: 5, w: 40, h: 20 })).toEqual({ x: 0, y: -5, w: 40, h: 40 })
  })
  it('what a figure has switched off is not drawn, and a frame leaves out what it hides', () => {
    const shirt = model.objects.find(o => o.id === 'o_shirt')!.shapes
    const on = drawFigure(model, fresh()).items.map(i => i.id)
    expect(shirt.some(id => on.includes(id))).toBe(true)
    const off = drawFigure(model, { ...fresh(), hidden: ['o_shirt'] }).items.map(i => i.id)
    expect(shirt.some(id => off.includes(id))).toBe(false)
    // the Face frame hides the shirt whatever the figure says
    expect(shirt.some(id => drawFigure(model, fresh(), 'head').items.map(i => i.id).includes(id))).toBe(false)
  })
  it('a slider away from rest changes the picture, and a value past its span does not go further than the span', () => {
    const at = (v: number) => drawFigure(model, setValue(model, fresh(), 'r_head', v)).items.map(i => i.d).join('|')
    expect(at(115)).not.toBe(at(100))
    expect(at(500)).toBe(at(115))
  })
  it('a form changes the picture', () => {
    const base = drawFigure(model, fresh()).items.map(i => i.d).join('|')
    const square = drawFigure(model, { ...fresh(), forms: { 'o_head.a_form1': 'f_form3' } }).items.map(i => i.d).join('|')
    expect(square).not.toBe(base)
  })
  it('a colour chosen for a slot paints the shapes that use it', () => {
    const skin = model.shapes.find(s => s.id === 's_head')!
    const fillOf = (f: CharacterFigure) => drawFigure(model, f).items.find(i => i.id === skin.id)?.fill
    const chosen = fillOf({ ...fresh(), colours: { k_skin: { src: 'colour', id: 'c_skin_2' } } })
    expect(chosen).toBeTruthy()
    expect(chosen).not.toBe(fillOf(fresh()))
  })
  it('a drawing is remembered for the same figure and copy, and drawn again for another', () => {
    const f = fresh()
    expect(drawFigure(model, f)).toBe(drawFigure(model, f))
    expect(drawFigure(model, { ...f })).not.toBe(drawFigure(model, f))
    expect(drawFigure(model, f, 'head')).not.toBe(drawFigure(model, f))
  })
  it('a figure draws in the back view too', () => {
    expect(drawFigure(model, fresh(), 'figure', 'back').items.length).toBeGreaterThan(0)
  })
})

describe('age', () => {
  it('the ages are the model\'s own Age presets, in its order', () => {
    expect(agePresets(model).map(p => p.name)).toEqual(['Infant', 'Child', 'Teen', 'Adult', 'Elder'])
    expect(agePresets({ ...model, presets: [] })).toEqual([])
  })
  it('a figure at rest is an adult, and another age moves what the kind controls and leaves the rest', () => {
    const f = { ...fresh(), colours: { k_skin: { src: 'colour' as const, id: 'c_skin_2' } }, tile: '#112233' }
    expect(ageOf(model, f)?.name).toBe('Adult')
    const elder = atAge(model, f, 'p_form44')
    expect(ageOf(model, elder)?.name).toBe('Elder')
    expect(elder.colours).toEqual({ ...f.colours, k_hair: { src: 'colour', id: 'c_hair_11' } })       // the age picks gray hair; the skin colour is the writer's own
    expect(elder.tile).toBe('#112233')
    expect(drawFigure(model, elder).items.map(i => i.d).join()).not.toBe(drawFigure(model, f).items.map(i => i.d).join())
    expect(atAge(model, f, 'nope')).toBe(f)
  })
})

describe('Randomise', () => {
  const roll = (f: CharacterFigure, seed: number) => rollFigure(model, f, seededRng(seed))
  it('is the same for the same seed and keeps the palette and the card colour', () => {
    const f = { ...fresh(), tile: '#334455', palette: [{ id: 'z', name: 'Z', h: 10, s: 20 }] }
    expect(roll(f, 7)).toEqual(roll(f, 7))
    for (let s = 1; s <= 12; s += 1) { const r = roll(f, s); expect(r.tile).toBe('#334455'); expect(r.palette).toEqual(f.palette); expect(r.model).toBe(KEY) }
  })
  it('keeps every slider inside the span a writer may move it within, and every colour a slot has', () => {
    for (let s = 1; s <= 25; s += 1) {
      const r = roll(fresh(), s)
      for (const [id, v] of Object.entries(r.values)) {
        const [lo, hi] = spanOf(range(id))
        expect(Number.isFinite(v)).toBe(true)
        expect(v, id).toBeGreaterThanOrEqual(lo); expect(v, id).toBeLessThanOrEqual(hi)
      }
      for (const [slot, c] of Object.entries(r.colours)) expect(model.slots!.some(x => x.id === slot && (c.src === 'swatch' || x.colours.some(k => k.id === c.id)))).toBe(true)
      expect(drawFigure(model, r).items.every(i => allFinite(i.d))).toBe(true)
    }
  })
  it('leaves what is locked as it is: the forms of a locked object and the colour of a slot it uses', () => {
    const start: CharacterFigure = { ...fresh(), locks: ['o_head'], forms: { 'o_head.a_form1': 'f_form4' }, colours: { k_skin: { src: 'colour', id: 'c_skin_3' } } }
    for (let s = 1; s <= 15; s += 1) {
      const r = roll(start, s)
      expect(r.forms['o_head.a_form1']).toBe('f_form4')
      expect(r.colours.k_skin).toEqual({ src: 'colour', id: 'c_skin_3' })
    }
  })
  it('a locked group keeps the sliders listed under it', () => {
    const start: CharacterFigure = { ...fresh(), locks: ['g_head'], values: { r_head: 95, r_tilt: -5 } }
    for (let s = 1; s <= 15; s += 1) {
      const r = roll(start, s)
      expect(r.values.r_head).toBe(95)
      expect(r.values.r_tilt).toBe(-5)
    }
  })
  it('stays within the genre: a Fiction look never takes a colour that is for Fantasy only', () => {
    for (let s = 1; s <= 40; s += 1) {
      const r = roll({ ...fresh(), genre: 'g_fiction' }, s)
      for (const c of Object.values(r.colours)) if (c.src === 'colour') expect(c.id).not.toMatch(/_f\d+$/)
    }
  })
  it('leaves a kind of preset alone when it sets a form that Randomise only sometimes changes, as the axis has its own chance', () => {
    const tilt = (c: ModelContent): ModelContent => ({ ...c, ranges: c.ranges!.map(r => (r.id === 'r_tilt' ? { ...r, rand: [0, 0] as [number, number] } : r)) })
    const withLook = (roll: number): ModelContent => tilt({
      ...model,
      objects: model.objects.map(o => (o.id === 'o_head' ? { ...o, axes: o.axes!.map(a => (a.id === 'a_form1' ? { ...a, roll } : a)) } : o)),
      presets: [...model.presets!, { id: 'p_look', name: 'Square look', kind: 'Look', values: { r_tilt: 17.3 }, hidden: [], forms: { 'o_head.a_form1': 'f_form3' } }],
    })
    const tilts = (c: ModelContent) => Array.from({ length: 60 }, (_, s) => rollFigure(c, fresh(), seededRng(s + 1)).values.r_tilt)
    expect(tilts(withLook(100))).toContain(17.3)                              // an axis that is always rolled: the kind is drawn now and then
    expect(new Set(tilts(withLook(10)))).not.toContain(17.3)                  // one that is sometimes rolled: the kind is the writer's
  })
  it('never takes clothes off: a preset that hides something is not drawn, and what was off stays off', () => {
    for (let s = 1; s <= 30; s += 1) expect(roll(fresh(), s).hidden).toEqual([])
    expect(roll({ ...fresh(), hidden: ['o_shirt'] }, 3).hidden).toEqual(['o_shirt'])
  })
})

describe('words', () => {
  it('a figure at rest is described by the presets that are on, and one at another age by that age', () => {
    const lines = describeFigure(model, fresh())
    expect(lines).toContainEqual(['Age', 'Adult'])
    expect(lines).toContainEqual(['Build', 'Average'])
    expect(describeFigure(model, atAge(model, fresh(), 'p_form44'))).toContainEqual(['Age', 'Elder'])
  })
  it('a form that is not the model\'s own and the colour of a slot are told', () => {
    const lines = describeFigure(model, { ...fresh(), forms: { 'o_head.a_form1': 'f_form3' }, colours: { k_skin: { src: 'colour', id: 'c_skin_2' }, k_hair: { src: 'swatch', id: 'k2' } } })
    expect(lines).toContainEqual(['Head shape', 'Square'])
    expect(lines.find(([l]) => l === 'Skin')?.[1]).toBeTruthy()
    expect(lines).toContainEqual(['Hair', 'Rose'])
  })
  it('two figures differ by their lines, and the same figure by none', () => {
    const a = describeFigure(model, fresh()), b = describeFigure(model, atAge(model, fresh(), 'p_form44'))
    const diff = figureDiff(a, b)
    expect(diff).toHaveLength(2)
    expect(diff).toContain('Age: Adult > Elder')
    expect(diff.find(l => l !== 'Age: Adult > Elder')).toMatch(/^Hair: /)          // Elder also picks a hair colour
    expect(figureDiff(a, a)).toEqual([])
    expect(figureDiff([['Hair', 'Rose']], [])).toEqual(['Hair: Rose > none'])
  })
  it('the Appearance fields are written from the same lines', () => {
    const words = describeFigureFields(model, { ...fresh(), forms: { 'o_head.a_form1': 'f_form3' }, colours: { k_skin: { src: 'colour', id: 'c_skin_2' } } })
    expect(words.build).toBe('Average')
    expect(words.skin).toMatch(/ skin$/)
    expect(words.face).toMatch(/head shape: square/i)
    expect(words.appearance).toMatch(/^Adult, average build/)
    expect(words.height).toBe('')
    expect(words.voice).toBe('')
  })
})

describe('the test state', () => {
  it('goes to the admin\'s engine and back without losing what is chosen', () => {
    const f: CharacterFigure = { ...fresh(), values: { r_head: 90, r_tilt: 5 }, forms: { 'o_head.a_form1': 'f_form4' }, hidden: ['o_shirt', 'gone'], fall: 'left' }
    const back = withTest(model, f, testOf(model, f))
    expect(back.values).toEqual({ r_head: 90, r_tilt: 5 })
    expect(back.forms).toEqual(f.forms)
    expect(back.hidden).toEqual(['o_shirt'])
    expect(back.fall).toBe('left')
    expect(back.model).toBe(KEY)
  })
})

describe("a frame follows the figure's height", () => {
  const box = { x: 60, y: 10, w: 80, h: 100 }
  it('is the same box for a figure at its full height, and with no matrix', () => {
    expect(followHeight(box, [1, 0, 0, 1, 0, 0])).toEqual(box)
    expect(cropBox(model, { frame: model.frames![0].id }, 'front')).toEqual(cropBox(model, { frame: model.frames![0].id }, 'front', [1, 0, 0, 1, 0, 0]))
  })
  it('shrinks about the feet and the middle line with a figure scaled to half its height', () => {
    const half = followHeight(box, [0.5, 0, 0, 0.5, 50, 196])   // a scale of one half about (100, 392)
    expect(half).toEqual({ x: 80, y: 201, w: 40, h: 50 })
  })
  it("reads only the size of the matrix: the back view's mirror is the frame's own business", () => {
    expect(followHeight(box, [-0.5, 0, 0, 0.5, 150, 196])).toEqual(followHeight(box, [0.5, 0, 0, 0.5, 50, 196]))
  })
  it('leaves a box alone when the matrix is not a size', () => {
    expect(followHeight(box, [NaN, 0, 0, 1, 0, 0])).toEqual(box)
    expect(followHeight(box, [0, 0, 0, 0, 0, 0])).toEqual(box)
  })
})
