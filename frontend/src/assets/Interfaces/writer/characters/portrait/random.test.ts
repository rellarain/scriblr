import { describe, expect, it } from 'vitest'
import type { CharacterPortrait } from '../../../../../api/types'
import { defaultPortrait, normalizePortrait, PORTRAIT_RANGES, type SliderKey } from './defaults'
import { fitHair } from './library'
import { LOCKED_BY_DEFAULT, RANDOM_SECTIONS, randomPortrait, seededRng, type RandomSection } from './random'
import { PART_KEYS, optionsFor } from './registry'
import { portraitShapes } from './scene'

const base = (): CharacterPortrait => normalizePortrait({
  ...defaultPortrait(), age: 'older', hairLength: 'chest', hairStyle: 'twobraids', skin: '#855034', eyeColor: '#2f4a7a', top: 'scoop', topColor: '#802020', tileColor: '#cfe0dc',
  horns: 'ram', hood: 'deep', heldItem: 'staff', crown: 'tiara', fantasyEars: 'elf', eyeStyle: 'glowing', eyeCount: 'third', necklace: 'amulet',
})

// The keys each section owns (what Randomise may change when it is not locked).
const OWNED: Record<RandomSection, Array<keyof CharacterPortrait>> = {
  head: ['age', 'headShape', 'headWidth', 'ears', 'skin'],
  hair: ['hairLength', 'hairTexture', 'hairStyle', 'hairFront', 'hairline', 'hairlineHeight', 'hairEdges', 'hairEnds', 'hairPlacement', 'hairColor', 'highlightColor', 'facialHair', 'facialHairColor'],
  face: ['expression', 'eyes', 'eyeColor', 'eyeSize', 'eyeSpacing', 'eyeTilt', 'brows', 'browColor', 'nose', 'noseSize', 'noseWidth', 'mouth', 'lipColor', 'mouthSize'],
  body: ['build', 'chest', 'shoulderWidth', 'neckWidth', 'top', 'topColor', 'necklace', 'necklaceColor'],
  card: ['tileColor'],
  fantasy: ['fantasyEars', 'horns', 'hornColor', 'eyeStyle', 'eyeColor2', 'eyeCount', 'crown', 'crownColor', 'hood', 'hoodColor', 'heldItem', 'heldSide', 'itemColor'],
}
// The fantasy section may also set the skin and the eye colour (it offers the unusual ones); the head and the face set them too.
const SHARED = new Set<keyof CharacterPortrait>(['skin', 'eyeColor'])

describe('Randomise', () => {
  it('locks the fantasy by default, so a random character is a person', () => {
    expect(LOCKED_BY_DEFAULT).toEqual(['fantasy'])
    for (let seed = 1; seed <= 30; seed++) {
      const out = randomPortrait(base(), LOCKED_BY_DEFAULT, seededRng(seed))
      for (const key of OWNED.fantasy) if (!SHARED.has(key)) expect(out[key], `${key} at ${seed}`).toBe(base()[key])
    }
  })

  it('changes only the sections that are not locked', () => {
    for (const locked of RANDOM_SECTIONS) {
      let changed = false
      for (let seed = 1; seed <= 25; seed++) {
        const from = base()
        const out = randomPortrait(from, [locked], seededRng(seed))
        // hair that fits: the locked hair may be refitted by a new age or nothing, but its own choices stay
        for (const key of OWNED[locked]) {
          if (SHARED.has(key)) continue
          expect(out[key], `${locked} locked, ${key} at ${seed}`).toEqual(fitHair(from)[key])
        }
        for (const section of RANDOM_SECTIONS) if (section !== locked) for (const key of OWNED[section]) if (out[key] !== from[key]) changed = true
      }
      expect(changed, `${locked} locked: the rest changes`).toBe(true)
    }
  })

  it('changes nothing when everything is locked', () => {
    const from = base()
    expect(randomPortrait(from, [...RANDOM_SECTIONS], seededRng(5))).toEqual(fitHair(from))
  })

  it('is the same for the same seed, and not the same for another', () => {
    const a = randomPortrait(base(), [], seededRng(42)), b = randomPortrait(base(), [], seededRng(42)), c = randomPortrait(base(), [], seededRng(43))
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('gives choices the portrait knows, sliders in their range, and colours as #rrggbb', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const out = randomPortrait(base(), [], seededRng(seed))
      expect(out, `${seed}`).toEqual(normalizePortrait(out))
      for (const key of PART_KEYS) expect(optionsFor(key, out).some(o => o.id === out[key]), `${key}=${out[key]} at ${seed}`).toBe(true)
      for (const key of Object.keys(PORTRAIT_RANGES) as SliderKey[]) {
        expect(out[key]).toBeGreaterThanOrEqual(PORTRAIT_RANGES[key][0])
        expect(out[key]).toBeLessThanOrEqual(PORTRAIT_RANGES[key][1])
      }
      expect(out).toEqual(fitHair(out))
    }
  })

  it('gives something of the fantasy whenever the fantasy is unlocked, and nothing else when the rest is locked', () => {
    const locked = RANDOM_SECTIONS.filter(s => s !== 'fantasy')
    const plain = defaultPortrait()
    for (let seed = 1; seed <= 40; seed++) {
      const out = randomPortrait(plain, locked, seededRng(seed))
      const fantasy = ['fantasyEars', 'horns', 'eyeStyle', 'eyeCount', 'crown', 'hood', 'heldItem'] as const
      const somethingFantasy = fantasy.some(k => out[k] !== plain[k]) || out.skin !== plain.skin
      expect(somethingFantasy, `seed ${seed}`).toBe(true)
      // the head, hair, face, body and card are as they were
      for (const section of locked) for (const key of OWNED[section]) if (!SHARED.has(key)) expect(out[key], `${key} at ${seed}`).toEqual(plain[key])
    }
  })

  it('makes a portrait that draws whole, for every section unlocked, across many seeds and starting points', () => {
    const starts = [defaultPortrait(), base(), normalizePortrait({ ...defaultPortrait(), age: 'infant' })]
    for (const start of starts) for (let seed = 1; seed <= 70; seed++) {
      const out = randomPortrait(start, [], seededRng(seed * 7))
      for (const sh of portraitShapes(out)) {
        expect(sh.d, `seed ${seed}`).not.toMatch(/NaN|undefined|Infinity/)
        expect(sh.fill, `seed ${seed}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('gives a young child no beard', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const out = randomPortrait(base(), [], seededRng(seed))
      if (['infant', 'toddler', 'child', 'teen'].includes(out.age)) expect(out.facialHair, `seed ${seed}`).toBe('none')
    }
  })

  it('uses Math.random when it is given no generator', () => {
    const out = randomPortrait(base(), [])
    expect(out).toEqual(normalizePortrait(out))
  })
})

describe('the seeded generator', () => {
  it('gives numbers from 0 up to 1, the same series for a seed', () => {
    const a = seededRng(9), b = seededRng(9)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      expect(b()).toBe(x)
    }
  })
})
