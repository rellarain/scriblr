import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CharacterPortrait, FigureModel, ModelContent } from '../../../../../api/types'
import { resolveColour, slotById } from '../../../admin/characters/engine/colour'
import { seededRng } from '../../../admin/characters/engine/previews'
import { defaultPortrait } from '../portrait/defaults'
import { randomPortrait } from '../portrait/random'
import { drawnOf } from '../portrait/scene'
import { hexRgb } from '../portrait/colour'
import { canConvertTo, convertLines, convertPortrait } from './figureConvert'
import { drawFigure, normalizeFigure, valuesOf } from './figureState'

// Convert on the basic model that comes with the app (backend/app/seed/basic_model.json): what an old portrait comes to.
const content: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const model: FigureModel = { id: 'aabbccddeeff', modelId: 'basic', version: 1, name: 'Adult (basic)', publishedAt: null, content }
const base = defaultPortrait()
const conv = (p: Partial<CharacterPortrait>) => convertPortrait({ ...base, ...p }, model)
const dist = (a: string, b: string): number => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }
const shown = (c: ReturnType<typeof conv>, slot: string): string => {
  const s = slotById(content, slot)!
  const ch = c.figure.colours[slot]
  return resolveColour(s, { ...ch, l: ch.l ?? undefined, a: ch.a ?? undefined }, c.figure.palette ?? []).css
}

describe('Convert', () => {
  it('is made for the basic model only', () => {
    expect(canConvertTo(model)).toBe(true)
    expect(canConvertTo({ ...model, modelId: 'other' })).toBe(false)
  })

  it('carries over what has the same name in the model: the head, ears, eyes, brows, nose, mouth, the top, the facial hair and the necklace', () => {
    const f = conv({ headShape: 'square', ears: 'small', eyes: 'hooded', brows: 'thick', nose: 'roman', mouth: 'full', top: 'vneck', facialHair: 'goatee', necklace: 'pearls' }).figure
    expect(f.forms).toMatchObject({ 'skull.headShape': 'square', 'ears.ears': 'small', 'eyes.shape': 'hooded', 'brows.shape': 'thick', 'nose.shape': 'roman', 'mouth.shape': 'full', 'necklace.style': 'pearls', 'shirt.neckline': 'vneck', 'beard.style': 'goatee', 'moustache.style': 'goatee' })
    // a form the model has as its own is not kept
    expect(conv({}).figure.forms['eyes.shape']).toBeUndefined()
    expect(f.converted).toBe(true)
    expect(f.model).toBe(model.id)
  })

  it('takes the age and the build from the model\'s presets, and the expression too', () => {
    const infant = valuesOf(content, conv({ age: 'infant' }).figure)
    expect(infant.height).toBe(36); expect(infant.headSize).toBe(160)
    expect(valuesOf(content, conv({ age: 'elderly' }).figure).height).toBe(92)
    // slight is the model's slim build
    expect(valuesOf(content, conv({ build: 'slight' }).figure).waist).toBe(88)
    // the build goes over the age, it does not put it back: a heavy infant is an infant with a wide waist
    expect(valuesOf(content, conv({ age: 'infant', build: 'average' }).figure).waist).toBe(112)
    expect(valuesOf(content, conv({ age: 'infant', build: 'slight' }).figure).waist).toBeCloseTo(112 * 0.88, 0)
    expect(valuesOf(content, conv({ build: 'heavy' }).figure).waist).toBe(122)
    expect(valuesOf(content, conv({ expression: 'surprised' }).figure).eyeOpen).toBe(130)
    for (const age of ['infant', 'toddler', 'child', 'teen', 'young', 'adult', 'middle', 'older', 'elderly']) expect(conv({ age }).notes, age).toEqual([])
  })

  it('scales the size the age gives the eyes, the nose and the mouth by the portrait\'s sliders, and sets the spacing, the tilt and the shoulders', () => {
    const v = valuesOf(content, conv({ age: 'infant', eyeSize: 1.1, noseSize: 0.8, mouthSize: 1.2, eyeSpacing: 1.18, eyeTilt: 6, shoulderWidth: 1.1, build: 'broad' }).figure)
    expect(v.eyeSize).toBeCloseTo(137.5, 1)
    expect(v.noseSize).toBeCloseTo(80, 0); expect(v.mouthSize).toBeCloseTo(108, 0)
    expect(v.eyeSpacing).toBeCloseTo(3, 0); expect(v.eyeTilt).toBe(6)
    expect(v.shoulders).toBeCloseTo(88 * 1.12 * 1.1, 0)   // the infant's shoulders, a broad build over them, the portrait's own factor over both
    // every slider stays inside its range
    for (const r of content.ranges) expect(v[r.id], r.id).toBeGreaterThanOrEqual(r.min - 1e-6)
  })

  it('makes the hair the nearest ready hairstyle with the lengths and the texture of the old hair', () => {
    const lens = (p: Partial<CharacterPortrait>) => valuesOf(content, conv(p).figure)
    expect(conv({ hairLength: 'bald' }).figure.hidden).toEqual(expect.arrayContaining(['hair.front.center', 'hair.back.center', 'hair.top.center']))
    expect(conv({ hairStyle: 'undercut', hairLength: 'short' }).figure.hidden).toEqual(expect.arrayContaining(['hair.left.center', 'hair.right.center']))
    expect(conv({ hairStyle: 'mohawk' }).figure.hidden).toEqual(expect.arrayContaining(['hair.left.center']))
    const chest = lens({ hairLength: 'chest', hairTexture: '3B' })
    expect(chest.len_back_center).toBe(content.presets!.find(x => x.id === 'hair_long')!.values.len_back_center)   // chest-length is the ready long hairstyle
    expect(chest.tex_back_center).toBeCloseTo(55, 0)
    // longer hair is longer, and shorter is shorter
    expect(lens({ hairLength: 'hip' }).len_back_center).toBeGreaterThan(chest.len_back_center)
    expect(lens({ hairLength: 'chin' }).len_back_center).toBeLessThan(chest.len_back_center)
    expect(lens({ hairLength: 'buzzed' }).len_top_center).toBeLessThan(lens({ hairLength: 'short' }).len_top_center ?? 100)
    // straight hair has no texture, coily the most
    expect(lens({ hairLength: 'chest', hairTexture: '1B' }).tex_back_center ?? 0).toBe(0)
    expect(lens({ hairLength: 'chest', hairTexture: '4C' }).tex_back_center).toBe(99)
    // the front: bangs are a longer front, swept back a shorter one
    expect(lens({ hairLength: 'short', hairFront: 'bangs' }).len_front_center).toBeGreaterThanOrEqual(85)
    expect(lens({ hairLength: 'chest', hairFront: 'back' }).len_front_center).toBeLessThan(lens({ hairLength: 'chest' }).len_front_center)
    // the afro keeps its own texture
    expect(lens({ hairStyle: 'triangle', hairTexture: '1A' }).tex_top_center).toBe(99)
  })

  it('says which old hairstyles are drawn as something else, and what of the hair the model has no counterpart for', () => {
    expect(convertLines(conv({ hairStyle: 'twobraids', hairLength: 'chest' }))).toEqual(['Hair: 2 braids is not in the model: it is drawn as loose hair.'])
    expect(convertLines(conv({ hairStyle: 'triangle', hairTexture: '4B', hairLength: 'chin' }))[0]).toMatch(/Triangle shape is drawn as an afro/)
    const lost = convertLines(conv({ hairline: 'widow', hairlineHeight: 'high', hairEdges: 'baby', highlightColor: '#d9b04a' }))
    expect(lost).toEqual(['Hair: The hairline and the edges (widow’s peak, high hairline, baby hairs) are not in the model.', 'Hair: The highlight colour is not in the model.'])
  })

  it('puts the fantasy parts on the figure, and the held item in the hand on its side, held up beside the head', () => {
    const f = conv({ fantasyEars: 'elf', horns: 'ram', eyeStyle: 'glowing', eyeCount: 'third', crown: 'laurel', hood: 'cowl', necklace: 'amulet' }).figure
    expect(f.forms).toMatchObject({ 'ears.fantasy': 'elf', 'horns.style': 'ram', 'eyes.style': 'glowing', 'extraEyes.count': 'third', 'laurel.style': 'laurel', 'hood.style': 'cowl', 'necklace.style': 'amulet' })
    expect(conv({ crown: 'tiara' }).figure.forms['crown.style']).toBe('tiara')
    // the picture's right is the figure's left hand
    const right = conv({ heldItem: 'staff', heldSide: 'right' }).figure
    expect(right.forms['itemL.item']).toBe('staff'); expect(right.values).toMatchObject({ shoulder: 25, elbow: 150, armDepth: 75, holdL: 175 }); expect(right.values.shoulderR).toBeUndefined()
    const left = conv({ heldItem: 'lantern', heldSide: 'left' }).figure
    expect(left.forms['itemR.item']).toBe('lantern'); expect(left.values).toMatchObject({ shoulderR: 25, elbowR: 150, armDepthR: 75, holdR: -175 }); expect(left.values.shoulder).toBeUndefined()
    expect(Object.keys(conv({}).figure.forms).filter(k => k.startsWith('item'))).toEqual([])
  })

  it('lists what the model has no counterpart for, and nothing for a portrait that carries over whole', () => {
    expect(conv({}).notes).toEqual([])
    const lost = convertLines(conv({ chest: 'full', neckWidth: 1.2, headWidth: 1.1, noseWidth: 1.2, eyeStyle: 'twocolour', eyeCount: 'one' }))
    expect(lost).toEqual([
      'Body: The full chest is not in the model: the chest is the average one.', 'Body: The neck width is not in the model: the neck is the usual width.',
      'Head: The head width is not in the model: use another head shape for a wider or narrower head.', 'Nose: The nose width is not in the model: the nose is as wide as its size makes it.',
      'Eyes: Two-coloured eyes are not in the model: both eyes have the eye colour.', 'Eyes: A single eye is not in the model: the figure has two.',
    ])
    // the necklace and the crown share the metal of the model; the brows and the facial hair follow the hair
    expect(convertLines(conv({ crown: 'diadem', necklace: 'chain', crownColor: '#d9b04a', necklaceColor: '#2b2b33' })).join('|')).toMatch(/share one colour of metal/)
    expect(convertLines(conv({ browColor: '#d9b04a', facialHair: 'full', facialHairColor: '#aa2222' })).join('|')).toMatch(/The brows take the colour of the hair.*Facial hair takes the colour of the hair/)
  })

  it('gives each slot the colour of the old portrait: a default colour where it is one, else a swatch of the character\'s palette', () => {
    // the portrait's own default colours are the model's default colours
    const plain = conv({})
    expect(plain.figure.colours.k_skin.src).toBe('colour'); expect(plain.figure.colours.k_cloth.src).toBe('colour')
    for (const [slot, hex] of [['k_skin', base.skin], ['k_cloth', base.topColor]] as const) expect(shown(plain, slot), slot).toBe(hex.toLowerCase())
    // one the model does not list (the default eye colour, the lips the old drawing worked out from the skin) is a swatch close to it
    expect(dist(shown(plain, 'k_eye'), base.eyeColor)).toBeLessThan(12); expect(dist(shown(plain, 'k_lip'), drawnOf(base).lipColor)).toBeLessThan(12)
    expect(plain.notes).toEqual([])
    // a colour the model does not list is a swatch with the hue and saturation of it, and its own brightness
    const custom = conv({ skin: '#7a4f33', eyeColor: '#2a6a8a', topColor: '#801f6a', hairColor: '#e8d890' })
    expect(custom.figure.palette!.length).toBeGreaterThan(0); expect(custom.figure.palette!.length).toBeLessThanOrEqual(10)
    for (const [slot, hex] of [['k_skin', '#7a4f33'], ['k_eye', '#2a6a8a'], ['k_cloth', '#801f6a']] as const) expect(dist(shown(custom, slot), hex), slot).toBeLessThan(12)
    expect(dist(shown(custom, 'k_hair'), drawnOf({ ...base, hairColor: '#e8d890' }).hairColor)).toBeLessThan(12)
    // the tile
    expect(conv({ tileColor: '#336699' }).figure.tile).toBe('#336699')
    // a slot the portrait says nothing of takes the first default colour of the slot
    expect(custom.figure.colours.k_shoe).toEqual({ src: 'colour', id: content.slots!.find(s => s.id === 'k_shoe')!.colours[0].id })
  })

  it('converts whatever portrait it is given: every figure is valid, inside its limits and draws', () => {
    const rng = seededRng(11)
    for (let i = 0; i < 40; i++) {
      const p = randomPortrait(base, [], rng)
      const c = convertPortrait(p, model)
      expect(normalizeFigure(c.figure), `portrait ${i}`).not.toBeNull()
      expect(c.figure.palette === null || c.figure.palette.length <= 10).toBe(true)
      expect(c.figure.tile).toBe(p.tileColor.toLowerCase())
      for (const r of content.ranges) { const v = c.figure.values[r.id]; if (v !== undefined) { expect(v).toBeGreaterThanOrEqual(r.min - 1e-6); expect(v).toBeLessThanOrEqual(r.max + 1e-6) } }
      const items = [...drawFigure(content, c.figure, 'bust').items, ...drawFigure(content, c.figure, 'figure').items]
      expect(items.length).toBeGreaterThan(20)
      for (const item of items) expect(item.d, item.id).not.toMatch(/NaN|undefined|Infinity/)
      for (const n of c.notes) expect(n.text.length).toBeGreaterThan(10)
    }
  })
})
