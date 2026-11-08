import type { CharacterPortrait } from '../../../../../api/types'
import { PORTRAIT_RANGES, type SliderKey } from './defaults'
import { fitHair } from './library'
import { SWATCHES, optionsFor, type ColourKey, type PartKey } from './registry'

// A random portrait: new choices for the sections that are not locked (and nothing else changes). Each section has the choices it owns, so a locked Hair leaves the hair as it
// is whatever is drawn for the face. The choices are made in the order the hair needs them (the length first, since it decides which styles, fronts, placements and ends are
// possible), and the result is made to fit. `rng` gives numbers from 0 up to (not including) 1: `Math.random` for the page, a seeded one for a test.

export type Rng = () => number

// The sections that are randomised, as the page names them.
export const RANDOM_SECTIONS = ['head', 'hair', 'face', 'body', 'fantasy', 'card'] as const
export type RandomSection = (typeof RANDOM_SECTIONS)[number]
// What is locked until the user unlocks it: the fantasy elements, so a randomised character stays a person.
export const LOCKED_BY_DEFAULT: readonly string[] = ['fantasy']

// A small seeded generator (mulberry32), for tests.
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The weights of the ages and the hair lengths a random portrait is drawn from (most people are adults with hair of ordinary length).
const AGE_WEIGHTS: Record<string, number> = { infant: 0.01, toddler: 0.01, child: 0.03, teen: 0.07, young: 0.28, adult: 0.3, middle: 0.17, older: 0.09, elderly: 0.04 }
const LENGTH_WEIGHTS: Record<string, number> = {
  bald: 0.03, buzzed: 0.07, short: 0.25, chin: 0.15, shoulder: 0.16, chest: 0.1, stomach: 0.07, hip: 0.07, knee: 0.04, body: 0.03, rapunzel: 0.03,
}

export function randomPortrait(from: CharacterPortrait, locked: readonly string[] = LOCKED_BY_DEFAULT, rng: Rng = Math.random): CharacterPortrait {
  const q: Record<string, unknown> = { ...from }
  const free = (s: RandomSection) => !locked.includes(s)
  const chance = (p: number) => rng() < p
  const oneOf = <T,>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
  const weighted = (ids: readonly string[], weights: Record<string, number>, fallback: string): string => {
    const total = ids.reduce((sum, id) => sum + (weights[id] ?? 0.05), 0)
    let at = rng() * total
    for (const id of ids) { at -= weights[id] ?? 0.05; if (at <= 0) return id }
    return fallback
  }
  const cur = () => q as unknown as CharacterPortrait
  // A part from the list the portrait allows for it now; with `skip`, never one of those (the usual, "none").
  const part = (key: PartKey, skip: readonly string[] = []) => {
    const options = optionsFor(key, cur()).filter(o => !skip.includes(o.id))
    if (options.length > 0) q[key] = oneOf(options).id
  }
  const colour = (key: ColourKey, swatches: readonly string[]) => { q[key] = oneOf(swatches) }
  // A slider: somewhere near the middle of its range (the sliders refine a face, they do not distort it).
  const slider = (key: SliderKey) => {
    const [low, high] = PORTRAIT_RANGES[key], mid = key === 'eyeTilt' ? 0 : 1
    q[key] = Math.round((mid + (rng() * 2 - 1) * Math.min(mid - low, high - mid) * 0.6) * 100) / 100
  }

  if (free('head')) {
    q.age = weighted(optionsFor('age', cur()).map(o => o.id), AGE_WEIGHTS, 'adult')
    part('headShape'); slider('headWidth'); part('ears'); colour('skin', SWATCHES.skin)
  }
  if (free('hair')) {
    q.hairLength = weighted(optionsFor('hairLength', cur()).map(o => o.id), LENGTH_WEIGHTS, 'short')
    part('hairTexture')
    // Most hair is plain; the rest takes one of the styles that this length allows.
    const styles = optionsFor('hairStyle', cur())
    q.hairStyle = chance(0.55) ? styles[0].id : oneOf(styles).id
    q.hairFront = chance(0.35) ? optionsFor('hairFront', cur())[0].id : oneOf(optionsFor('hairFront', cur())).id
    q.hairline = chance(0.7) ? 'rounded' : oneOf(optionsFor('hairline', cur())).id
    part('hairlineHeight'); q.hairEdges = chance(0.8) ? 'none' : oneOf(optionsFor('hairEdges', cur())).id
    part('hairPlacement'); part('hairEnds')
    colour('hairColor', SWATCHES.hair)
    q.highlightColor = chance(0.2) ? oneOf(SWATCHES.highlight) : null
    // A beard on an adult now and then; none on a child.
    const young = ['infant', 'toddler', 'child', 'teen'].includes(String(q.age))
    q.facialHair = !young && chance(0.25) ? oneOf(optionsFor('facialHair', cur()).filter(o => o.id !== 'none')).id : 'none'
    q.facialHairColor = null
  }
  if (free('face')) {
    part('expression'); part('eyes'); colour('eyeColor', SWATCHES.eye); slider('eyeSize'); slider('eyeSpacing'); slider('eyeTilt')
    part('brows'); q.browColor = chance(0.2) ? oneOf(SWATCHES.hair) : null
    part('nose'); slider('noseSize'); slider('noseWidth')
    part('mouth'); q.lipColor = chance(0.4) ? oneOf(SWATCHES.lip) : null; slider('mouthSize')
  }
  if (free('body')) {
    part('build'); part('chest'); slider('shoulderWidth'); slider('neckWidth'); part('top'); colour('topColor', SWATCHES.cloth)
    q.necklace = chance(0.3) ? oneOf(optionsFor('necklace', cur()).filter(o => o.id !== 'none')).id : 'none'
    colour('necklaceColor', SWATCHES.metal)
  }
  if (free('card')) colour('tileColor', SWATCHES.tile)
  if (free('fantasy')) {
    // Each element comes with its own chance; if none does, one of them is chosen so that unlocking the fantasy and rolling always gives something.
    const elements = ['ears', 'horns', 'skin', 'eyes', 'crown', 'hood', 'item'] as const
    let chosen = elements.filter(() => chance(0.3))
    if (chosen.length === 0) chosen = [oneOf(elements)]
    for (const e of chosen) {
      switch (e) {
        case 'ears': part('fantasyEars', ['none']); break
        case 'horns': part('horns', ['none']); colour('hornColor', SWATCHES.horn); break
        case 'skin': colour('skin', SWATCHES.skinFantasy); break
        case 'eyes':
          part('eyeStyle', ['normal']); colour('eyeColor', SWATCHES.eyeFantasy); colour('eyeColor2', SWATCHES.eyeFantasy)
          if (chance(0.4)) part('eyeCount', ['two'])
          break
        case 'crown': part('crown', ['none']); colour('crownColor', SWATCHES.metal); break
        case 'hood': part('hood', ['none']); colour('hoodColor', SWATCHES.hood); break
        case 'item': part('heldItem', ['none']); part('heldSide'); colour('itemColor', SWATCHES.item); break
      }
    }
    // What was not chosen is as it was, except that a fantasy section that is rolled starts from nothing: the elements it did not choose are cleared.
    const keep = new Set<string>()
    for (const e of chosen) ({ ears: ['fantasyEars'], horns: ['horns', 'hornColor'], skin: ['skin'], eyes: ['eyeStyle', 'eyeColor', 'eyeColor2', 'eyeCount'], crown: ['crown', 'crownColor'], hood: ['hood', 'hoodColor'], item: ['heldItem', 'heldSide', 'itemColor'] } as Record<string, string[]>)[e].forEach(k => keep.add(k))
    const clear: Record<string, unknown> = { fantasyEars: 'none', horns: 'none', eyeStyle: 'normal', eyeCount: 'two', crown: 'none', hood: 'none', heldItem: 'none' }
    for (const [k, v] of Object.entries(clear)) if (!keep.has(k)) q[k] = v
  }
  return fitHair(cur())
}
