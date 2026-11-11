// Builds the seed model ("Adult (basic)") as model content: the face from the exact shapes of the old portrait engine, the body from the mockup, a rig, sliders, presets,
// colour slots and frames. Run by run.ts, which writes backend/app/seed/basic-model.json.
import type { ModelContent, ModelFrame, ModelGroup, ModelObject, ModelPreset, ModelShape, ModelSlot } from '../../src/api/types'
import { FANTASY_SWATCHES } from '../../src/assets/Interfaces/writer/characters/portrait/fantasyLibrary'
import { standardGenres, standardSlots, starterPalette } from '../../src/assets/Interfaces/admin/characters/engine/standardColours'
import type { MakeId } from '../../src/assets/Interfaces/admin/characters/modelContent'
import { bodyParts, bodyRanges, twinBody } from './body'
import { loadExact, loadMockupModel, type ExactData, type ExactShape } from './exact'
import { buildPart, pairUp, type PartSpec } from './face'
import { clothesParts, finishClothes } from './clothes'
import { hairParts } from './hair'
import { itemParts, itemSpec, mirrorItem, poseArmsApart, prepareItems } from './items'
import { AGES, BUILDS, EXPRESSIONS } from './presets'

export const TOLERANCE = 0.08

export function stableIds(): MakeId {
  let n = 0
  return prefix => `${prefix}_${++n}`
}

const partsOf = (): PartSpec[] => [
  // the ears of the fantasy ears (pointed, elf, goblin, fins) are a second axis of the same shapes, and win over the ear shape when chosen
  { part: 'ears', options: 'ears', objectId: 'ears', objectName: 'Ears', axisId: 'ears', axisName: 'Ear shape', defaultOption: 'average', z: 38.0, prefix: 'ear', names: ['Ear', 'Inner ear', 'Ear 3', 'Ear 4'],
    also: [{ options: 'fantasyEars', axisId: 'fantasy', axisName: 'Fantasy ears', defaultOption: 'none', roll: FANTASY_CHANCE, genres: FANTASY_GENRES }] },
  { part: 'head', options: 'headShape', objectId: 'skull', objectName: 'Head', axisId: 'headShape', axisName: 'Head shape', defaultOption: 'oval', z: 38.2, prefix: 'hd', firstId: 'skull', view: 'both', names: ['Head', 'Shade plane of the head'] },
  { part: 'brows', options: 'brows', objectId: 'brows', objectName: 'Brows', axisId: 'shape', axisName: 'Brow shape', defaultOption: 'soft', z: 38.4, prefix: 'brow' },
  { part: 'eyes', options: 'eyes', objectId: 'eyes', objectName: 'Eyes', axisId: 'shape', axisName: 'Eye shape', defaultOption: 'almond', z: 38.5, prefix: 'eye',
    also: [{ options: 'eyeStyleUsed', axisId: 'style', axisName: 'Eye style', defaultOption: 'normal', roll: FANTASY_CHANCE, genres: FANTASY_GENRES }] },
  { part: 'nose', options: 'nose', objectId: 'nose', objectName: 'Nose', axisId: 'shape', axisName: 'Nose shape', defaultOption: 'straight', z: 38.6, prefix: 'nose' },
  { part: 'mouth', options: 'mouth', objectId: 'mouth', objectName: 'Mouth', axisId: 'shape', axisName: 'Mouth shape', defaultOption: 'medium', z: 38.7, prefix: 'mouth', names: ['Shade under the lips', 'Shade of the lower lip', 'Lips', 'Mouth line'] },
  // facial hair is two parts of the old drawing: the beard goes under the mouth and the moustache over it, each with every one of its options (hidden by default)
  { part: 'beard', options: 'beard', objectId: 'beard', objectName: 'Beard', axisId: 'style', axisName: 'Beard style', defaultOption: 'none', z: 38.65, prefix: 'bd' },
  { part: 'moustache', options: 'moustache', objectId: 'moustache', objectName: 'Moustache', axisId: 'style', axisName: 'Moustache style', defaultOption: 'none', z: 38.75, prefix: 'mo' },
  // the fantasy parts: each hidden until chosen, and rolled only for the Fantasy genre
  { part: 'extraEyes', options: 'extraEyes', objectId: 'extraEyes', objectName: 'Extra eyes', axisId: 'count', axisName: 'Number of eyes', defaultOption: 'two', z: 38.52, prefix: 'xe', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, tol: FANTASY_TOLERANCE, coarse: true },
  { part: 'hood', options: 'hood', objectId: 'hood', objectName: 'Hood', axisId: 'style', axisName: 'Hood', defaultOption: 'none', z: 52, prefix: 'hood', layer: 'clothing', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, zOf: { hoodDown: 11 }, tol: FANTASY_TOLERANCE, coarse: true },
  { part: 'horns', options: 'horns', objectId: 'horns', objectName: 'Horns', axisId: 'style', axisName: 'Horns', defaultOption: 'none', z: 53, prefix: 'horn', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, tol: FANTASY_TOLERANCE, coarse: true },
  { part: 'crown', options: 'crownMetal', objectId: 'crown', objectName: 'Crown', axisId: 'style', axisName: 'Crown', defaultOption: 'none', z: 54, prefix: 'crown', layer: 'clothing', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, tol: FANTASY_TOLERANCE, coarse: true },
  { part: 'crown', options: 'laurel', objectId: 'laurel', objectName: 'Laurel wreath', axisId: 'style', axisName: 'Laurel wreath', defaultOption: 'none', z: 54.2, prefix: 'laurel', layer: 'clothing', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, tol: FANTASY_TOLERANCE, coarse: true },
  // a wreath of flowers is some sixty petals and leaves: too many for an object once each had a twin, so none is paired
  { part: 'crown', options: 'flowers', objectId: 'flowers', objectName: 'Flower crown', axisId: 'style', axisName: 'Flower crown', defaultOption: 'none', z: 54.4, prefix: 'bloom', layer: 'clothing', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, noPairs: true, tol: FANTASY_TOLERANCE, coarse: true },
  { part: 'necklace', options: 'necklace', objectId: 'necklace', objectName: 'Necklace', axisId: 'style', axisName: 'Necklace', defaultOption: 'none', z: 33, prefix: 'neck', layer: 'clothing', roll: FANTASY_CHANCE, genres: FANTASY_GENRES, tol: FANTASY_TOLERANCE, coarse: true },
]
// Randomise gives a face a beard or a moustache only now and then (the beard and the moustache are chosen apart: a goatee has a moustache over it only if the writer says so).
const FACIAL_PARTS = new Set(['beard', 'moustache'])
const FACIAL_CHANCE = 15
// The fantasy parts (ears, eye styles, extra eyes, horns, crowns, hoods) and the necklaces are rolled only for a figure set to the Fantasy genre, and then rarely (nine of them, so a few percent each makes two random fantasy characters in five odd somewhere).
const FANTASY_GENRES = ['g_fantasy']
const FANTASY_CHANCE = 6
// The fantasy parts are large and organic: an outline within a fifth of a unit of the old one (a hand's width on the card is a hundred times that) saves a third of the points.
const FANTASY_TOLERANCE = 0.22

// The option lists the parts are built from, got from the old engine's: the eye styles without the one that paints the two eyes in different colours (the twin of an eye cannot
// have a colour of its own), and the extra eyes alone (what each number of eyes draws besides the two eyes of the face; one eye is the face's two eyes made one, which a pair cannot be).
function prepare(data: ExactData): void {
  const key = (s: ExactShape): string => JSON.stringify(s.n)
  const standard = new Set(data.shapes.filter(s => s.p === 'eyes').map(key))
  data.options.eyeStyleUsed = data.options.eyeStyle.filter(o => o.id !== 'twocolour')
  // the crowns of metal, and the wreaths of leaves and flowers: apart, since together they would be more shapes than an object may have
  const wreaths = new Set(['laurel', 'flowers'])
  data.options.crownMetal = data.options.crown.filter(o => !wreaths.has(o.id))
  data.options.laurel = data.options.crown.filter(o => o.id === 'none' || o.id === 'laurel')
  data.options.flowers = data.options.crown.filter(o => o.id === 'none' || o.id === 'flowers')
  prepareItems(data)
  data.options.extraEyes = data.options.eyeCount.filter(o => o.id !== 'one').map(o => ({ ...o, shapes: o.shapes.filter(s => s.p === 'eyes' && !standard.has(key(s))) }))
}

// Every one of the old facial hair options as a ready preset: the beard and the moustache it is made of are chosen together (a goatee has a moustache over it). A beard is not
// on the card until it is chosen, so there is nothing there to point at: the writer reaches it from the first step.
function facialHairPresets(data: ExactData): ModelPreset[] {
  return data.options.beard.map(o => ({
    id: `facial_${o.id}`, name: o.name, kind: 'Facial hair', values: {}, hidden: [],
    forms: { 'beard.style': o.id, 'moustache.style': o.id },
  }))
}

// The colour slots of the fantasy parts, with the old drawing's own lists of colours for them (all genres: whoever wears a horn picks its colour).
const SLOT_COLOURS = (prefix: string, hexes: readonly string[]): ModelSlot['colours'] => hexes.map((hex, i) => ({ id: `c_${prefix}_${i + 1}`, name: '', hex, genres: [] }))
const fantasySlots = (): ModelSlot[] => [
  { id: 'k_horn', name: 'Horns', lMin: 8, lRest: 70, lMax: 92, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('horn', FANTASY_SWATCHES.horn) },
  { id: 'k_metal', name: 'Metal and jewellery', lMin: 12, lRest: 58, lMax: 92, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('metal', FANTASY_SWATCHES.metal) },
  { id: 'k_gem', name: 'Gems', lMin: 10, lRest: 45, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('gem', ['#2882c0', '#b5473a', '#3e8a5a', '#8a5ab0', '#d6b030', '#3fe0e0', '#c4c8cf', '#2e8094']) },
  { id: 'k_hood', name: 'Hood', lMin: 8, lRest: 28, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('hood', FANTASY_SWATCHES.hood) },
  { id: 'k_leaf', name: 'Leaves', lMin: 10, lRest: 34, lMax: 80, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('leaf', ['#4f7a3a', '#5f8a3e', '#3e5a3a', '#7ea65e']) },
  { id: 'k_bloom', name: 'Blossoms', lMin: 30, lRest: 72, lMax: 96, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('bloom', ['#f3d27a', '#bdd94a', '#e49aae', '#f3efea', '#b5473a', '#8a6aa8']) },
]

// The colour slots of the clothes besides the shirt's (Clothing) and the shoes': trousers and skirts, the outer layer and underwear, with default colours of their own.
const clothingSlots = (): ModelSlot[] => [
  { id: 'k_outer', name: 'Jacket and coat', lMin: 8, lRest: 28, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('outer', ['#2b2b33', '#5a4a38', '#3e5a3a', '#2f4a5a', '#802020', '#6b6b6b', '#d9d2c0', '#4a3f5e']) },
  { id: 'k_under', name: 'Underwear', lMin: 20, lRest: 80, lMax: 98, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('under', ['#f2eee4', '#d9d2c0', '#9a9a9a', '#2b2b33', '#e8c3c3', '#c9a0a0']) },
  { id: 'k_trouser', name: 'Trousers and skirts', lMin: 8, lRest: 30, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('trouser', ['#3a4658', '#2b2b33', '#5a4a38', '#6b6b6b', '#8a7a5a', '#2f3a4a', '#d9d2c0', '#4a3f5e']) },
]

// The colour slots of the held items: the item's own colour, and the materials of the old drawing (wood, parchment, a flame and a glow, a drink; a crystal is a gem).
const itemSlots = (): ModelSlot[] => [
  { id: 'k_item', name: 'Held item', lMin: 8, lRest: 40, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('item', FANTASY_SWATCHES.item) },
  { id: 'k_wood', name: 'Wood', lMin: 8, lRest: 25, lMax: 70, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('wood', ['#6b4a2a', '#8a5a2b', '#4a3220', '#a67836', '#5c4a32']) },
  { id: 'k_paper', name: 'Paper and parchment', lMin: 55, lRest: 90, lMax: 99, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('paper', ['#f2ead6', '#e8dcc0', '#faf4e2', '#d9c9a0', '#ece3cf']) },
  { id: 'k_flame', name: 'Flame', lMin: 30, lRest: 64, lMax: 90, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('flame', ['#ffb347', '#ff8a3d', '#ffd34d', '#7fd6ff', '#b9f58a']) },
  { id: 'k_wine', name: 'Drink', lMin: 10, lRest: 26, lMax: 60, aMin: 100, aRest: 100, aMax: 100, colours: SLOT_COLOURS('wine', ['#7a1f2e', '#4a2a6a', '#2a6a3a', '#8a5a2b']) },
]

export interface Report { part: string; channels: number; pairs: string; points: number }

// The groups and objects a frame hides (a group takes everything under it with it), with their twins.
function framesOf(c: ModelContent): ModelFrame[] {
  const withTwins = (ids: string[]): string[] => ids.flatMap(id => [id, ...c.groups.filter(g => g.mirrorOf === id).map(g => g.id)])
  const legs = withTwins(['legL']), arms = withTwins(['shoulderL'])
  const trunk = ['chest', 'abdomen', 'pelvis']
  return [
    { id: 'full', name: 'Full body', x: 0, y: 0, w: 200, h: 400, hide: [] },
    { id: 'bust', name: 'Bust', x: 38, y: -22, w: 124, h: 134, hide: legs },
    { id: 'face', name: 'Face', x: 66, y: -22, w: 68, h: 90, hide: [...legs, ...arms, ...trunk] },
    { id: 'hands', name: 'Hands', x: 30, y: 120, w: 140, h: 120, hide: [...legs, 'head'] },
    { id: 'feet', name: 'Feet', x: 70, y: 330, w: 60, h: 70, hide: [...arms, 'neck', ...trunk, 'head'] },
  ]
}

// The two sides are named for the character's: the original is the left (the picture's right) and its twin the right. makeTwin calls a twin "(twin)", which a writer reading the
// parts of the figure would not understand.
function nameSides(c: ModelContent): ModelContent {
  const twinOf = <T extends { id: string; name: string; mirrorOf?: string | null }>(list: T[]): T[] => {
    const originals = new Set(list.flatMap(x => (x.mirrorOf ? [x.mirrorOf] : [])))
    const base = new Map(list.map(x => [x.id, x.name.replace(/ \((twin|left|right)\)$/, '')]))
    return list.map(x => {
      if (x.mirrorOf) return { ...x, name: `${base.get(x.mirrorOf) ?? base.get(x.id)} (right)` }
      return originals.has(x.id) ? { ...x, name: `${base.get(x.id)} (left)` } : x
    })
  }
  return { ...c, shapes: twinOf(c.shapes), objects: twinOf(c.objects), groups: twinOf(c.groups) }
}

export function buildSeed(): { content: ModelContent; report: Report[] } {
  const data = loadExact(), mock = loadMockupModel(), make = stableIds()
  const report: Report[] = []
  prepare(data)
  const PARTS = partsOf()
  const results = PARTS.map(spec => buildPart(data, spec, TOLERANCE))
  if (process.env.SEED_DEBUG) results.forEach((r, i) => console.log(PARTS[i].objectId, 'channels', r.channels, 'paired', r.paired.size, r.pairs))
  const faceShapes: ModelShape[] = [], faceObjects: ModelObject[] = []
  PARTS.forEach((spec, i) => {
    const r = results[i]
    faceShapes.push(...r.shapes); faceObjects.push(FACIAL_PARTS.has(spec.part) ? { ...r.object, layer: 'hair', axes: r.object.axes!.map(a => ({ ...a, roll: FACIAL_CHANCE })) } : r.object)
    report.push({ part: spec.objectName, channels: r.channels, pairs: r.pairs, points: r.points })
  })
  const body = bodyParts(mock)
  const clothes = clothesParts(mock)
  const hair = hairParts(mock, faceShapes.find(s => s.id === 'skull')!.pts)
  const head: ModelGroup = { id: 'head', name: 'Head', parent: 'torso', objects: faceObjects.map(o => o.id), pivot: [100, 54], attach: { shape: 'neck', kind: 'point', i: 0, t: 1, slider: null, rx: 0.5, ry: 0 } }
  let content: ModelContent = {
    name: 'Adult (basic)', description: 'A basic adult in everyday clothes: the body, the head and its features, hair, clothes, fantasy parts and held items, with the ages, builds, expressions, hairstyles, outfits and poses as presets.',
    shapes: [...body.shapes, ...faceShapes, ...hair.shapes, ...clothes.shapes], objects: [...body.objects, ...faceObjects, ...hair.objects, ...clothes.objects],
    groups: [...body.groups.map(g => (g.id === 'torso' ? { ...g, objects: [...g.objects, ...clothes.objects.map(o => o.id)] } : g)), head, hair.group], axis: 100, ranges: [...bodyRanges(mock), ...hair.ranges, ...clothes.ranges],
    presets: [...AGES, ...BUILDS, ...EXPRESSIONS, ...hair.presets, ...facialHairPresets(data), ...clothes.presets], classes: [], genres: standardGenres(), palette: starterPalette(), slots: [...standardSlots(), ...fantasySlots(), ...clothingSlots(), ...itemSlots()], bones: [], headBone: null,
    frames: [], tile: '#e6d6c3', grips: [], fieldsets: [], patterns: [],
  }
  results.forEach(r => { content = pairUp(content, r, make) })
  content = twinBody(content, body, make)
  content = finishClothes(content)
  content = nameSides(content)
  // each arm is posed on its own, and each hand has an item of its own, in a group hung from the hand
  content = poseArmsApart(content)
  const leftItem = buildPart(data, itemSpec('L'), TOLERANCE)
  report.push({ part: leftItem.object.name, channels: leftItem.channels, pairs: leftItem.pairs, points: leftItem.points })
  const items = itemParts(content, leftItem, mirrorItem(leftItem))
  content = {
    ...content, shapes: [...content.shapes, ...items.shapes], objects: [...content.objects, ...items.objects], groups: [...content.groups, ...items.groups],
    ranges: [...content.ranges, ...items.ranges], presets: [...(content.presets ?? []), ...items.presets], grips: items.grips,
  }
  content = { ...content, frames: framesOf(content) }
  return { content, report }
}
