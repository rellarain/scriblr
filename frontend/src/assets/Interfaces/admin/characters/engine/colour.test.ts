import { describe, expect, it } from 'vitest'
import type { ModelContent, ModelShape } from '../../../../../api/types'
import { addGroup, addObject, addShape, newGroup, normalizeContent, publishFaults, starterContent } from '../modelContent'
import {
  NEUTRAL_GRAY, addColour, addGenre, addSlot, addStandardSlots, addSwatch, fitsGenre, grayHex, hexHsl, hslHex, paintOf, paletteOf, randomPalette, removeColour, removeGenre, removeSlot, removeSwatch, renameColour,
  resolveColour, rollChoices, setColourHex, setStarterPalette, setSwatch, slotById, slotOfShape, stepSlot, toggleColourGenre, type Colouring, type SlotChoices,
} from './colour'
import { newShape } from './edit'
import { makeTwin } from './pairEdit'
import { limitNotes, LIMITS } from './limits'
import { previewSpecs, seededRng } from './previews'
import { lockedSlots, lockedThings, rollLook } from './roll'
import type { Edit } from './rigEdit'
import { standardSlots } from './standardColours'

const must = (e: Edit): ModelContent => { if (!e.ok) throw new Error(e.reason); return e.content }
const refused = (e: Edit): string => { if (e.ok) throw new Error('expected a refusal'); return e.reason }
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })
let n = 0
const make = (prefix: string) => `${prefix}_${++n}`

// A head group with a skin shape and an eye (iris + white), a body group with a shirt: painted from Skin, Eye, a fixed white and Clothing.
function painted(): ModelContent {
  let c = starterContent('Adult')
  c = addGroup(c, newGroup('gH', 'Head')); c = addGroup(c, newGroup('gB', 'Body'))
  c = addObject(c, 'gH', { id: 'oS', name: 'Skull', layer: 'body', shapes: [] })
  c = addShape(c, 'oS', { ...newShape('skull', 'Skull', 'oval', box(76, 20, 48, 56)), slot: 'k_skin' })
  c = addObject(c, 'gH', { id: 'oE', name: 'Eye', layer: 'body', shapes: [] })
  c = addShape(c, 'oE', { ...newShape('white', 'White', 'oval', box(84, 41, 12, 8)), gray: 100 })
  c = addShape(c, 'oE', { ...newShape('iris', 'Iris', 'oval', box(88, 42, 5, 5)), slot: 'k_eye' })
  c = addObject(c, 'gB', { id: 'oT', name: 'Shirt', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oT', { ...newShape('shirt', 'Shirt', 'rounded', box(66, 86, 68, 70)), slot: 'k_cloth', op: 0.8 })
  return c
}
const shape = (c: ModelContent, id: string): ModelShape => c.shapes.find(s => s.id === id)!
const none: Colouring = { palette: [], choices: {} }

describe('the standard colours of a new model', () => {
  const c = starterContent('New')
  it('has genres, a starter palette and six slots that publish cleanly', () => {
    expect(c.genres?.map(g => g.name)).toEqual(['Fiction', 'Fantasy', 'Non-fiction'])
    expect(c.palette).toHaveLength(5)
    expect(c.slots?.map(s => s.name)).toEqual(['Skin', 'Hair', 'Eye', 'Lip', 'Clothing', 'Shoes'])
    expect(publishFaults(c)).toEqual([])
    expect(limitNotes(c)).toEqual([])
  })
  it('keeps every slot\'s ranges in order and every default colour a valid hex that fits only known genres', () => {
    const genres = new Set(c.genres!.map(g => g.id))
    for (const s of c.slots!) {
      expect(s.lMin).toBeLessThanOrEqual(s.lRest); expect(s.lRest).toBeLessThanOrEqual(s.lMax)
      expect(s.aMin).toBeLessThanOrEqual(s.aRest); expect(s.aRest).toBeLessThanOrEqual(s.aMax)
      expect(s.colours.length).toBeGreaterThan(0)
      for (const k of s.colours) { expect(k.hex).toMatch(/^#[0-9a-f]{6}$/); expect(k.genres.every(g => genres.has(g))).toBe(true) }
    }
    const saved = normalizeContent(c)   // a new model is already what a save would return, as far as colour goes
    expect([saved.genres, saved.palette, saved.slots]).toEqual([c.genres, c.palette, c.slots])
  })
  it('tags the fantasy skins and eyes with Fantasy only', () => {
    const skin = slotById(c, 'k_skin')!
    expect(skin.colours.filter(k => k.genres.length).every(k => k.genres.join() === 'g_fantasy')).toBe(true)
    expect(skin.colours.filter(k => fitsGenre(k, 'g_fiction')).length).toBeLessThan(skin.colours.length)
    expect(skin.colours.filter(k => fitsGenre(k, 'g_fantasy'))).toHaveLength(skin.colours.length)
    expect(skin.colours.filter(k => fitsGenre(k, null))).toHaveLength(skin.colours.length)
  })
})

describe('what a choice comes to', () => {
  const c = painted(), skin = slotById(c, 'k_skin')!, palette = paletteOf(c)
  it('is a gray at the slot\'s resting brightness when nothing is chosen, or the choice is gone', () => {
    const r = resolveColour(skin, undefined, palette)
    expect(r).toMatchObject({ s: 0, l: skin.lRest, a: 1 })
    expect(r.css).toBe(grayHex(skin.lRest))
    expect(resolveColour(skin, { src: 'colour', id: 'gone' }, palette).css).toBe(r.css)
    expect(resolveColour(skin, { src: 'swatch', id: 'gone' }, palette).css).toBe(r.css)
  })
  it('keeps a default colour exactly, and moves its brightness only inside the slot\'s range', () => {
    const first = skin.colours[0]
    expect(resolveColour(skin, { src: 'colour', id: first.id }, palette).css).toBe(first.hex)
    const moved = resolveColour(skin, { src: 'colour', id: first.id, l: 40 }, palette)
    expect(moved.l).toBe(40)
    expect(hexHsl(moved.css)[0]).toBeCloseTo(hexHsl(first.hex)[0], -1)
    expect(resolveColour(skin, { src: 'colour', id: first.id, l: 100 }, palette).l).toBe(skin.lMax)
    expect(resolveColour(skin, { src: 'colour', id: first.id, l: 0 }, palette).l).toBe(skin.lMin)
  })
  it('takes hue and saturation from a swatch, and the brightness from the choice or the slot\'s rest', () => {
    const sw = palette[3]
    const r = resolveColour(skin, { src: 'swatch', id: sw.id }, palette)
    expect(r.h).toBe(sw.h); expect(r.s).toBe(sw.s); expect(r.l).toBe(skin.lRest)
    expect(resolveColour(skin, { src: 'swatch', id: sw.id, l: 20 }, palette).l).toBe(20)
    expect(resolveColour(skin, { src: 'swatch', id: sw.id, l: 5 }, palette).l).toBe(skin.lMin)
  })
  it('holds opacity to the slot\'s range', () => {
    const hair = slotById(c, 'k_hair')!
    expect(resolveColour(hair, { src: 'colour', id: hair.colours[0].id, a: 10 }, palette).a).toBe(hair.aMin / 100)
    expect(resolveColour(hair, { src: 'colour', id: hair.colours[0].id, a: 80 }, palette).a).toBe(0.8)
    expect(resolveColour(skin, { src: 'colour', id: skin.colours[0].id, a: 10 }, palette).a).toBe(1)   // the skin's range is one value
  })
  it('converts between hex and hue, saturation and lightness without drifting', () => {
    for (const hex of ['#f6dcc8', '#3a1f16', '#5b8a3a', '#808080', '#ffffff', '#000000']) {
      const [h, s, l] = hexHsl(hex)
      expect(hslHex(h, s, l)).toMatch(/^#[0-9a-f]{6}$/)
      const back = hexHsl(hslHex(h, s, l))
      expect(Math.abs(back[2] - l)).toBeLessThan(1)
    }
    expect(grayHex(0)).toBe('#000000'); expect(grayHex(100)).toBe('#ffffff')
  })
})

describe('what a shape is painted with', () => {
  const c = painted(), palette = paletteOf(c)
  const choices: SlotChoices = { k_skin: { src: 'swatch', id: palette[0].id, l: 70 }, k_cloth: { src: 'colour', id: 'c_cloth_1' } }
  const colouring: Colouring = { palette, choices }
  it('is gray with nothing chosen: a neutral gray for a shape with no slot, a fixed gray for a gray one, the slot\'s rest for a slot', () => {
    expect(paintOf(c, none, { ...shape(c, 'skull'), slot: null })).toEqual({ fill: grayHex(NEUTRAL_GRAY), opacity: 1 })
    expect(paintOf(c, none, shape(c, 'white'))).toEqual({ fill: '#ffffff', opacity: 1 })
    expect(paintOf(c, none, shape(c, 'skull')).fill).toBe(grayHex(slotById(c, 'k_skin')!.lRest))
  })
  it('uses the slot\'s chosen colour, and multiplies the shape\'s opacity by the colour\'s', () => {
    expect(paintOf(c, colouring, shape(c, 'skull')).fill).toBe(resolveColour(slotById(c, 'k_skin')!, choices.k_skin, palette).css)
    expect(paintOf(c, colouring, shape(c, 'shirt'))).toEqual({ fill: slotById(c, 'k_cloth')!.colours[0].hex, opacity: 0.8 })
    const hair = { ...shape(c, 'skull'), slot: 'k_hair', op: 0.5 }
    const r = paintOf(c, { palette, choices: { k_hair: { src: 'colour', id: 'c_hair_1', a: 60 } } }, hair)
    expect(r.opacity).toBe(0.3)
  })
  it('does not use a gray for a slot that is gone', () => {
    expect(paintOf(c, colouring, { ...shape(c, 'skull'), slot: 'k_gone' })).toEqual({ fill: grayHex(NEUTRAL_GRAY), opacity: 1 })
  })
  it('lets a twin follow its original and a shape that follows the pattern follow its template shape, and an own colour win', () => {
    const twinned = must(makeTwin(c, 'shape', 'skull', make))
    const twin = twinned.shapes.find(s => s.mirrorOf === 'skull')!
    expect(paintOf(twinned, colouring, twin)).toEqual(paintOf(twinned, colouring, shape(twinned, 'skull')))
    expect(slotOfShape(twinned, twin)?.id).toBe('k_skin')
    const followed = { ...twin, mirrorOf: null, copyOf: 'skull' }
    expect(paintOf(twinned, colouring, followed)).toEqual(paintOf(twinned, colouring, shape(twinned, 'skull')))
    expect(paintOf(twinned, colouring, { ...followed, slot: 'k_cloth' }).fill).toBe(slotById(c, 'k_cloth')!.colours[0].hex)
    expect(paintOf(twinned, colouring, { ...followed, gray: 0 }).fill).toBe('#000000')
  })
  it('recolours every shape that uses a swatch when the swatch changes', () => {
    let wide = painted()
    wide = { ...wide, shapes: wide.shapes.map(s => (s.id === 'shirt' ? { ...s, slot: 'k_skin' } : s)) }
    const sw = paletteOf(wide)[0]
    const before: Colouring = { palette: paletteOf(wide), choices: { k_skin: { src: 'swatch', id: sw.id } } }
    const after: Colouring = { ...before, palette: setSwatch(before.palette, sw.id, { h: 200 }) }
    for (const id of ['skull', 'shirt']) expect(paintOf(wide, after, shape(wide, id)).fill).not.toBe(paintOf(wide, before, shape(wide, id)).fill)
    expect(paintOf(wide, after, shape(wide, 'skull')).fill).toBe(paintOf(wide, after, { ...shape(wide, 'shirt'), op: 1 }).fill)
  })
})

describe('editing the slots, colours and genres of a model', () => {
  it('adds a slot, renames it, steps its ranges inside the limits, and refuses past the most', () => {
    let c = starterContent('X')
    const made = addSlot(c, '  Scales ', make)
    c = must(made)
    const id = made.slotId!
    expect(slotById(c, id)).toMatchObject({ name: 'Scales', colours: [] })
    c = stepSlot(c, id, 'lMin', 1); expect(slotById(c, id)!.lMin).toBe(12)
    c = stepSlot(c, id, 'lMin', 1, true); expect(slotById(c, id)!.lMin).toBe(22)
    for (let i = 0; i < 30; i++) c = stepSlot(c, id, 'lMin', 1)
    expect(slotById(c, id)!.lMin).toBe(slotById(c, id)!.lRest)    // the smallest never passes the resting value
    for (let i = 0; i < 30; i++) c = stepSlot(c, id, 'lMax', -1)
    expect(slotById(c, id)!.lMax).toBe(slotById(c, id)!.lRest)
    for (let i = 0; i < 30; i++) c = stepSlot(c, id, 'aMin', -1)
    expect(slotById(c, id)!.aMin).toBe(0)
    c = stepSlot(c, id, 'aRest', -1); expect(slotById(c, id)!.aRest).toBe(slotById(c, id)!.aMin === 0 ? 95 : 95)
    for (let i = 0; i < 30; i++) c = stepSlot(c, id, 'aRest', 1)
    expect(slotById(c, id)!.aRest).toBe(100)
    let full = c
    for (let i = c.slots!.length; i < LIMITS.slotsMax; i++) full = must(addSlot(full, 'More', make))
    expect(refused(addSlot(full, 'One more', make))).toMatch(/at most 32 colour slots/)
  })
  it('deletes a slot and leaves the shapes painted from it with none', () => {
    const c = must(removeSlot(painted(), 'k_skin'))
    expect(slotById(c, 'k_skin')).toBeUndefined()
    expect(shape(c, 'skull').slot).toBeNull()
    expect(shape(c, 'iris').slot).toBe('k_eye')
    expect(refused(removeSlot(c, 'k_skin'))).toMatch(/no such colour slot/)
    expect(publishFaults(c)).toEqual([])
  })
  it('adds, recolours, renames, tags and removes a default colour', () => {
    let c = starterContent('X')
    const made = addColour(c, 'k_hair', '#AABBCC', make)
    c = must(made)
    const id = made.colourId!
    const get = () => slotById(c, 'k_hair')!.colours.find(k => k.id === id)!
    expect(get().hex).toBe('#aabbcc')
    c = setColourHex(c, 'k_hair', id, '#112233'); expect(get().hex).toBe('#112233')
    c = setColourHex(c, 'k_hair', id, 'not a colour'); expect(get().hex).toBe('#112233')
    c = renameColour(c, 'k_hair', id, 'Ash'); expect(get().name).toBe('Ash')
    c = toggleColourGenre(c, 'k_hair', id, 'g_fantasy'); expect(get().genres).toEqual(['g_fantasy'])
    c = toggleColourGenre(c, 'k_hair', id, 'g_fantasy'); expect(get().genres).toEqual([])
    c = removeColour(c, 'k_hair', id); expect(slotById(c, 'k_hair')!.colours.find(k => k.id === id)).toBeUndefined()
    expect(refused(addColour(c, 'gone', '#000000', make))).toMatch(/no such colour slot/)
    let full = c
    for (let i = slotById(c, 'k_hair')!.colours.length; i < LIMITS.coloursMax; i++) full = must(addColour(full, 'k_hair', '#101010', make))
    expect(refused(addColour(full, 'k_hair', '#101010', make))).toMatch(/at most 64 default colours/)
  })
  it('adds and removes a genre, and a colour that fitted only it then fits every genre', () => {
    let c = starterContent('X')
    const made = addGenre(c, 'Sci-fi', make)
    c = must(made)
    expect(c.genres).toHaveLength(4)
    c = toggleColourGenre(c, 'k_hair', 'c_hair_1', made.genreId!)
    expect(slotById(c, 'k_hair')!.colours[0].genres).toEqual([made.genreId])
    expect(publishFaults(c)).toEqual([])
    // an axis rolled only in that genre is rolled in every genre once the genre is gone
    const axed: ModelContent = { ...c, objects: [{ id: 'o', name: 'O', layer: 'body', shapes: [], axes: [{ id: 'a', name: 'A', initial: 'f', roll: 50, genres: [made.genreId!], options: [{ id: 'f', name: 'F', ovr: [] }] }] }] }
    expect(removeGenre(axed, made.genreId!).objects[0].axes![0].genres).toEqual([])
    c = removeGenre(c, made.genreId!)
    expect(slotById(c, 'k_hair')!.colours[0].genres).toEqual([])
    expect(c.genres).toHaveLength(3)
    let full = c
    for (let i = 3; i < LIMITS.genresMax; i++) full = must(addGenre(full, 'G', make))
    expect(refused(addGenre(full, 'G', make))).toMatch(/at most 12 genres/)
  })
  it('adds the standard slots to an older model, keeping what it has', () => {
    const old: ModelContent = { ...painted(), slots: [{ ...standardSlots()[0], name: 'My skin', colours: [] }], genres: [], palette: [] }
    const c = must(addStandardSlots(old))
    expect(c.slots!.find(s => s.id === 'k_skin')!.name).toBe('My skin')
    expect(c.slots!.map(s => s.id)).toEqual(['k_skin', 'k_hair', 'k_eye', 'k_lip', 'k_cloth', 'k_shoe'])
    expect(c.genres).toHaveLength(3); expect(c.palette).toHaveLength(5)
    expect(must(addStandardSlots(c))).toEqual(c)
  })
  it('saves the test palette as the starter palette, as a copy', () => {
    const c = starterContent('X')
    const test = setSwatch(paletteOf(c), 'k1', { h: 10 })
    const saved = setStarterPalette(c, test)
    expect(saved.palette![0].h).toBe(10)
    test[0].h = 99
    expect(saved.palette![0].h).toBe(10)
  })
})

describe('a palette', () => {
  it('grows to ten swatches and no further, each new hue a step round the wheel', () => {
    let palette = paletteOf(starterContent('X'))
    for (let i = palette.length; i < LIMITS.paletteMax; i++) { const r = addSwatch(palette, make); expect(r.id).toBeTruthy(); palette = r.palette }
    expect(palette).toHaveLength(10)
    const r = addSwatch(palette, make)
    expect(r.palette).toBe(palette); expect(r.reason).toMatch(/at most 10 swatches/)
    expect(new Set(palette.map(p => p.id)).size).toBe(10)
  })
  it('holds hue and saturation to their ranges, and changes only the one swatch', () => {
    const palette = paletteOf(starterContent('X'))
    const next = setSwatch(palette, 'k2', { h: 500, s: -4 })
    expect(next.find(p => p.id === 'k2')).toMatchObject({ h: 359, s: 0 })
    expect(next.filter(p => p.id !== 'k2')).toEqual(palette.filter(p => p.id !== 'k2'))
  })
  it('loses a swatch and the choices that used it, but never its last swatch', () => {
    const palette = paletteOf(starterContent('X'))
    const choices: SlotChoices = { k_skin: { src: 'swatch', id: 'k1' }, k_hair: { src: 'swatch', id: 'k2' }, k_eye: { src: 'colour', id: 'c_eye_1' } }
    const r = removeSwatch(palette, choices, 'k1')
    expect(r.palette.map(p => p.id)).toEqual(['k2', 'k3', 'k4', 'k5'])
    expect(Object.keys(r.choices).sort()).toEqual(['k_eye', 'k_hair'])
    const one = [palette[0]]
    expect(removeSwatch(one, choices, 'k1')).toEqual({ palette: one, choices })
  })
})

describe('rolling colours', () => {
  const c = painted(), palette = paletteOf(c)
  it('is the same for the same seed, and different for another', () => {
    const a = rollChoices(c, seededRng(7), palette), b = rollChoices(c, seededRng(7), palette), other = rollChoices(c, seededRng(8), palette)
    expect(a).toEqual(b)
    expect(a).not.toEqual(other)
  })
  it('chooses something for every slot and keeps brightness inside the range', () => {
    for (let seed = 1; seed < 40; seed++) {
      const out = rollChoices(c, seededRng(seed), palette)
      expect(Object.keys(out).sort()).toEqual(c.slots!.map(s => s.id).sort())
      for (const s of c.slots!) {
        const ch = out[s.id]
        if (ch.l !== undefined) { expect(ch.l).toBeGreaterThanOrEqual(s.lMin); expect(ch.l).toBeLessThanOrEqual(s.lMax) }
        const r = resolveColour(s, ch, palette)
        expect(r.css).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
  it('gives a skin or an eye a default colour, never a swatch', () => {
    for (let seed = 1; seed < 60; seed++) {
      const out = rollChoices(c, seededRng(seed), palette)
      expect(out.k_skin.src).toBe('colour'); expect(out.k_eye.src).toBe('colour')
    }
    const swatches = Array.from({ length: 80 }, (_, seed) => rollChoices(c, seededRng(seed + 100), palette).k_cloth.src)
    expect(swatches).toContain('swatch'); expect(swatches).toContain('colour')
  })
  it('draws only from the colours that fit the genre', () => {
    const fantasy = slotById(c, 'k_skin')!.colours.filter(k => k.genres.length).map(k => k.id)
    const seen = (genre: string | null) => new Set(Array.from({ length: 120 }, (_, seed) => rollChoices(c, seededRng(seed), palette, {}, { genre }).k_skin.id))
    expect(fantasy.some(id => seen('g_fantasy').has(id))).toBe(true)
    expect(fantasy.some(id => seen('g_fiction').has(id))).toBe(false)
    expect(fantasy.some(id => seen('g_nonfiction').has(id))).toBe(false)
  })
  it('leaves a slot with nothing to choose from gray, and a kept slot as it was', () => {
    const bare: ModelContent = { ...c, slots: [{ ...slotById(c, 'k_cloth')!, colours: [] }], palette: [] }
    expect(rollChoices(bare, seededRng(1), [])).toEqual({})
    const current: SlotChoices = { k_skin: { src: 'colour', id: 'c_skin_3' } }
    const out = rollChoices(c, seededRng(1), palette, current, { keep: new Set(['k_skin']) })
    expect(out.k_skin).toEqual(current.k_skin)
    expect(out.k_hair).toBeDefined()
  })
  it('puts brightness and opacity at the end of the range for the stress previews', () => {
    const min = rollChoices(c, seededRng(3), palette, {}, { extreme: 'min' }), max = rollChoices(c, seededRng(3), palette, {}, { extreme: 'max' })
    for (const s of c.slots!) {
      expect(min[s.id].l).toBe(s.lMin); expect(max[s.id].l).toBe(s.lMax)
      if (s.aMax > s.aMin) { expect(min[s.id].a).toBe(s.aMin); expect(max[s.id].a).toBe(s.aMax) } else expect(min[s.id].a).toBeUndefined()
    }
  })
  it('makes a random palette of five valid swatches', () => {
    const p = randomPalette(seededRng(5))
    expect(p).toHaveLength(5)
    for (const sw of p) { expect(sw.h).toBeGreaterThanOrEqual(0); expect(sw.h).toBeLessThan(360); expect(sw.s).toBeGreaterThanOrEqual(28); expect(sw.s).toBeLessThanOrEqual(72) }
  })
})

describe('rolling the whole look, with locks', () => {
  // the head group with an Eye object (an axis of two forms) that is the pattern of a family of two members, and a Shirt
  function look(): ModelContent {
    let c = painted()
    c = { ...c, objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: [{ id: 'aLid', name: 'Lids', initial: 'open', options: [{ id: 'open', name: 'Open', ovr: [] }, { id: 'shut', name: 'Shut', ovr: [] }] }] } : o)) }
    c = { ...c, classes: [{ id: 'kEye', name: 'Eye', template: 'oE', exclusive: true }] }
    c = { ...c, objects: [...c.objects, { id: 'oE1', name: 'Almond', layer: 'body', shapes: [], classOf: 'kEye' }, { id: 'oE2', name: 'Round', layer: 'body', shapes: [], classOf: 'kEye' }] }
    return { ...c, groups: c.groups.map(g => (g.id === 'gH' ? { ...g, objects: [...g.objects, 'oE1', 'oE2'] } : g)) }
  }
  const c = look(), palette = paletteOf(c)
  const input = { genre: null, locks: [] as string[], forms: {}, choices: {} as SlotChoices, palette }
  it('rolls a form on every axis (members included) and the member shown, deterministically', () => {
    const a = rollLook(c, seededRng(11), input), b = rollLook(c, seededRng(11), input)
    expect(a).toEqual(b)
    expect(Object.keys(a.forms)).toEqual(expect.arrayContaining(['oE.aLid', 'oE1.aLid', 'oE2.aLid', 'class:kEye']))
    expect(['oE1', 'oE2']).toContain(a.forms['class:kEye'])
    const seen = new Set(Array.from({ length: 40 }, (_, s) => rollLook(c, seededRng(s), input).forms['class:kEye']))
    expect(seen).toEqual(new Set(['oE1', 'oE2']))
  })
  it('leaves a locked object\'s forms and the colours of the slots it uses alone, and rolls the rest', () => {
    const forms = { 'oE.aLid': 'shut' }, choices: SlotChoices = { k_eye: { src: 'colour', id: 'c_eye_2' }, k_skin: { src: 'colour', id: 'c_skin_1' }, k_cloth: { src: 'colour', id: 'c_cloth_1' } }
    const locked = { ...input, locks: ['oE'], forms, choices }
    const outs = Array.from({ length: 30 }, (_, s) => rollLook(c, seededRng(s), locked))
    for (const o of outs) { expect(o.forms['oE.aLid']).toBe('shut'); expect(o.choices.k_eye).toEqual(choices.k_eye) }
    expect(new Set(outs.map(o => o.forms['oE1.aLid'])).size).toBe(2)
    expect(new Set(outs.map(o => o.choices.k_skin.id)).size).toBeGreaterThan(1)
  })
  it('lets a lock on a group cover its objects, its sub-groups and their slots, and a family with a locked member stays', () => {
    const things = lockedThings(c, ['gH'])
    expect([...things.objects].sort()).toEqual(['oE', 'oE1', 'oE2', 'oS'])
    expect([...lockedSlots(c, things.objects)].sort()).toEqual(['k_eye', 'k_skin'])
    const locked = { ...input, locks: ['gH'], forms: { 'class:kEye': 'oE2' } }
    for (let s = 0; s < 20; s++) expect(rollLook(c, seededRng(s), locked).forms['class:kEye']).toBe('oE2')
    const member = { ...input, locks: ['oE1'], forms: { 'class:kEye': 'oE2' } }
    for (let s = 0; s < 20; s++) expect(rollLook(c, seededRng(s), member).forms['class:kEye']).toBe('oE2')
  })
  it('rolls an axis only as often as its chance says: never at 0, now and then at a few percent, every time without one', () => {
    const withRoll = (roll: number | undefined): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: o.axes!.map(a => ({ ...a, initial: 'open', roll })) } : o)) })
    const shown = (content: ModelContent) => Array.from({ length: 200 }, (_, s) => rollLook(content, seededRng(s), input).forms['oE.aLid'] ?? 'open')   // a form that is not rolled is not set: the axis shows its own
    expect(new Set(shown(withRoll(0)))).toEqual(new Set(['open']))
    const some = shown(withRoll(15)).filter(f => f === 'shut').length
    expect(some).toBeGreaterThan(0); expect(some).toBeLessThan(40)
    expect(new Set(shown(withRoll(100)))).toEqual(new Set(['open', 'shut']))
    expect(new Set(shown(withRoll(undefined)))).toEqual(new Set(['open', 'shut']))
    // an axis that is not rolled keeps the form the figure already shows, not only the form it starts with
    const kept = rollLook(withRoll(0), seededRng(1), { ...input, forms: { 'oE.aLid': 'shut' } })
    expect(kept.forms['oE.aLid']).toBe('shut')
  })
  it('rolls an axis that has genres only for a figure set to one of them', () => {
    const only = (genres: string[]): ModelContent => ({ ...c, objects: c.objects.map(o => (o.id === 'oE' ? { ...o, axes: o.axes!.map(a => ({ ...a, initial: 'open', roll: 100, genres })) } : o)) })
    const shown = (content: ModelContent, genre: string | null) => new Set(Array.from({ length: 80 }, (_, s) => rollLook(content, seededRng(s), { ...input, genre }).forms['oE.aLid'] ?? 'open'))
    expect(shown(only(['g_fantasy']), null)).toEqual(new Set(['open']))
    expect(shown(only(['g_fantasy']), 'g_fiction')).toEqual(new Set(['open']))
    expect(shown(only(['g_fantasy']), 'g_fantasy')).toEqual(new Set(['open', 'shut']))
    expect(shown(only(['g_fiction', 'g_fantasy']), 'g_fiction')).toEqual(new Set(['open', 'shut']))
    expect(shown(only([]), null)).toEqual(new Set(['open', 'shut']))
  })
  it('ignores a lock on something that is gone, and a locked thing nothing paints from a slot', () => {
    expect(lockedThings(c, ['gone'])).toEqual({ groups: new Set(), objects: new Set() })
    expect(lockedSlots(c, new Set(['oNothing'])).size).toBe(0)
  })
})

describe('the preview strip\'s colourings', () => {
  const c = painted()
  it('gives each random preview a palette and a choice for every slot', () => {
    const specs = previewSpecs(5, 'rand', 6, [], c)
    expect(specs).toHaveLength(6)
    for (const s of specs) { expect(s.palette).toHaveLength(5); expect(Object.keys(s.choices).sort()).toEqual(c.slots!.map(x => x.id).sort()) }
    expect(new Set(specs.map(s => JSON.stringify(s.choices))).size).toBeGreaterThan(1)
  })
  it('uses the model\'s palette and the ends of each range for the stress previews', () => {
    for (const mode of ['min', 'max'] as const) {
      const [first] = previewSpecs(5, mode, 3, [], c)
      expect(first.palette).toEqual(paletteOf(c))
      expect(Object.values(first.choices).every(ch => ch.l !== undefined)).toBe(true)
    }
  })
  it('has no colouring for a model with no slots, and leaves the sizes and tilts of a seed as they were', () => {
    const bare = { ...c, slots: [] }
    expect(previewSpecs(5, 'rand', 3, [], bare).every(s => s.palette.length === 0 && Object.keys(s.choices).length === 0)).toBe(true)
    const strip = (list: ReturnType<typeof previewSpecs>) => list.map(s => [s.scale, s.tilt, s.skew, s.flip, s.bg])
    expect(strip(previewSpecs(5, 'rand', 6, [], c))).toEqual(strip(previewSpecs(5, 'rand', 6, [], bare)))
    expect(previewSpecs(5, 'rand', 6, [], c)).toEqual(previewSpecs(5, 'rand', 6, [], c))
  })
})
