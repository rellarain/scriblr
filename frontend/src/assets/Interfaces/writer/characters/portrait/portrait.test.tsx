import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CharacterPortrait } from '../../../../../api/types'
import { cropBox, type PortraitCrop } from './crops'
import { defaultPortrait, normalizePortrait, PORTRAIT_RANGES, type SliderKey } from './defaults'
import {
  AGES, BROWS, BUILDS, CHESTS, EARS, EDGES, ENDS, EXPRESSIONS, EYES, FACIAL, FRONTS, GREYING, HAIRLINES, HAIRLINE_HEIGHTS, HEADS, LENGTHS, MOUTHS, NOSES, PLACEMENTS, STYLES, TEXTURES, TOPS,
  endsFor, fitHair, frontsFor, placementsFor, stylesFor,
} from './library'
import { CROWNS, EYE_COUNTS, EYE_STYLES, FANTASY_EARS, HELD_SIDES, HOODS, HORNS, ITEMS, NECKLACES } from './fantasyLibrary'
import { Portrait } from './Portrait'
import { PART_KEYS, optionsFor, type PartKey } from './registry'
import { portraitShapes } from './scene'

const portrait = (over: Partial<CharacterPortrait> = {}): CharacterPortrait => normalizePortrait({ ...defaultPortrait(), ...over })
const shapesOf = (p: CharacterPortrait) => portraitShapes(normalizePortrait(p))
// Whether a drawing is whole: every path is made of finite numbers, every fill is a colour, every opacity is between 0 and 1.
function expectWhole(p: CharacterPortrait, what: string) {
  const shapes = shapesOf(p)
  expect(shapes.length, what).toBeGreaterThan(5)
  for (const s of shapes) {
    expect(s.d, what).not.toMatch(/NaN|undefined|Infinity/)
    expect(s.fill, what).toMatch(/^#[0-9a-f]{6}$/i)
    expect(s.opacity, what).toBeGreaterThanOrEqual(0)
    expect(s.opacity, what).toBeLessThanOrEqual(1)
  }
}

const LISTS: Record<Exclude<PartKey, 'hairStyle' | 'hairFront'>, readonly { id: string }[]> = {
  age: AGES, build: BUILDS, chest: CHESTS, headShape: HEADS, ears: EARS, expression: EXPRESSIONS, eyes: EYES, brows: BROWS, nose: NOSES, mouth: MOUTHS,
  hairLength: LENGTHS, hairTexture: TEXTURES, hairline: HAIRLINES, hairlineHeight: HAIRLINE_HEIGHTS, hairEdges: EDGES, hairEnds: ENDS, hairPlacement: PLACEMENTS, greying: GREYING, facialHair: FACIAL, top: TOPS,
  necklace: NECKLACES, fantasyEars: FANTASY_EARS, horns: HORNS, eyeStyle: EYE_STYLES, eyeCount: EYE_COUNTS, crown: CROWNS, hood: HOODS, heldItem: ITEMS, heldSide: HELD_SIDES,
}

describe('the portrait is drawn from its choices', () => {
  it('draws every option of every list, at an infant, an adult and an elder, as whole shapes', () => {
    for (const age of ['infant', 'adult', 'elderly']) {
      for (const [key, list] of Object.entries(LISTS)) {
        for (const o of list) {
          const p = portrait({ age, [key]: o.id, ...(key === 'age' ? { age: o.id } : {}) } as Partial<CharacterPortrait>)
          expectWhole(p, `${key}=${o.id} at ${age}`)
        }
      }
    }
  })

  it('draws every hair style at every length it allows, in every texture, with every front it allows', () => {
    for (const style of STYLES) {
      for (const length of LENGTHS) {
        const base = { hairLength: length.id, hairStyle: style.id }
        if (!stylesFor(base as never).some(s => s.id === style.id)) continue
        // The straightest and the tightest texture, with the first and the last front the style allows (every front is drawn in the next test).
        const fronts = frontsFor({ ...base, hairFront: 'none' })
        for (const texture of ['1A', '4C']) {
          for (const front of [fronts[0], fronts[fronts.length - 1]]) expectWhole(portrait({ ...base, hairTexture: texture, hairFront: front.id }), `${style.id} ${length.id} ${texture} ${front.id}`)
        }
      }
    }
  })

  it('draws every hair front, hairline and edge for hair that is long enough to have them', () => {
    for (const front of FRONTS) for (const hairline of HAIRLINES) for (const edges of EDGES) {
      expectWhole(portrait({ hairLength: 'shoulder', hairFront: front.id, hairline: hairline.id, hairEdges: edges.id }), `${front.id} ${hairline.id} ${edges.id}`)
    }
  })

  it('draws every placement and every end, on loose hair of every length that hangs, in three textures and in every style that allows them', () => {
    const hanging = LENGTHS.filter(l => l.i >= 3)
    for (const style of ['plain', 'halfup', 'shavedside', 'triangle']) {
      for (const length of hanging) for (const texture of ['1A', '2B', '3B']) {
        const base = { hairStyle: style, hairLength: length.id, hairTexture: texture, hairFront: 'none' }
        for (const placement of placementsFor(base).map(o => o.id)) for (const ends of endsFor(base).map(o => o.id)) {
          expectWhole(portrait({ ...base, hairPlacement: placement, hairEnds: ends }), `${style} ${length.id} ${texture} ${placement} ${ends}`)
        }
      }
    }
  })

  it('draws every placement and end even where the style or length does not allow it, as the hair that fits', () => {
    for (const placement of PLACEMENTS) for (const ends of ENDS) for (const style of ['twobraids', 'boxbraids', 'topbun', 'mohawk', 'cornrows']) {
      expectWhole(portrait({ hairLength: 'hip', hairStyle: style, hairPlacement: placement.id, hairEnds: ends.id, hairFront: 'none' }), `${style} ${placement.id} ${ends.id}`)
    }
    const short = { hairLength: 'short', hairStyle: 'plain', hairFront: 'none', hairTexture: '1A' }
    expect(shapesOf(portrait({ ...short, hairPlacement: 'allleft', hairEnds: 'in' }))).toEqual(shapesOf(portrait(short)))
  })

  it('draws every hair length and texture together', () => {
    for (const length of LENGTHS) for (const texture of TEXTURES) expectWhole(portrait({ hairLength: length.id, hairTexture: texture.id }), `${length.id} ${texture.id}`)
  })

  it('draws the sliders at either end of their range', () => {
    for (const key of Object.keys(PORTRAIT_RANGES) as SliderKey[]) {
      for (const value of PORTRAIT_RANGES[key]) expectWhole(portrait({ [key]: value } as Partial<CharacterPortrait>), `${key}=${value}`)
    }
  })

  it('is the same drawing every time for the same choices', () => {
    const p = portrait({ hairLength: 'hip', hairTexture: '3B', hairStyle: 'twobraids', age: 'older' })
    expect(shapesOf(p)).toEqual(shapesOf({ ...p }))
  })

  it('paints the colours that were chosen, with the tile first and no outline', () => {
    const p = portrait({ tileColor: '#123456', skin: '#a1b2c3', hairColor: '#654321', topColor: '#abcdef', facialHair: 'full' })
    const shapes = shapesOf(p)
    expect(shapes[0].fill).toBe('#123456')
    const fills = new Set(shapes.map(s => s.fill))
    for (const c of ['#a1b2c3', '#654321', '#abcdef']) expect(fills.has(c)).toBe(true)
  })

  it('draws no hair colour for bald hair, and greys hair, brows and beard with age', () => {
    const young = portrait({ hairColor: '#111111', facialHair: 'full' })
    const old = portrait({ hairColor: '#111111', facialHair: 'full', age: 'elderly' })
    expect(shapesOf(portrait({ hairLength: 'bald', hairColor: '#7f00ff' })).some(s => s.fill === '#7f00ff')).toBe(false)
    expect(shapesOf(young).some(s => s.fill === '#111111')).toBe(true)
    expect(shapesOf(old).some(s => s.fill === '#111111')).toBe(false)
    expect(portrait({ greying: 'none', age: 'elderly', hairColor: '#111111' })).toMatchObject({ greying: 'none' })
    expect(shapesOf(portrait({ greying: 'none', age: 'elderly', hairColor: '#111111' })).some(s => s.fill === '#111111')).toBe(true)
  })

  it('draws an id this build does not know as the default for it', () => {
    expect(shapesOf(portrait({ age: 'ancient' }))).toEqual(shapesOf(portrait({ age: 'adult' })))
    expect(shapesOf(portrait({ hairLength: 'cosmic' }))).toEqual(shapesOf(portrait({ hairLength: 'short' })))
    expect(shapesOf(portrait({ hairTexture: '9Z' }))).toEqual(shapesOf(portrait({ hairTexture: '1B' })))
    for (const key of PART_KEYS) expectWhole(portrait({ [key]: 'no-such-id' } as Partial<CharacterPortrait>), `unknown ${key}`)
  })

  it('draws a hair style and a front the length does not allow as hair that fits', () => {
    const p = { ...portrait({ hairLength: 'buzzed' }), hairStyle: 'twobraids', hairFront: 'curtain' }
    expectWhole(p, 'braids on buzzed hair')
    expect(shapesOf(p)).toEqual(shapesOf(fitHair(p)))
  })
})

describe('the crops', () => {
  const CROPS: PortraitCrop[] = ['card', 'head', 'top', 'face', 'ears', 'eyes', 'brows', 'nose', 'mouth', 'lower', 'neck']

  it('are squares of the tile, for every age', () => {
    for (const age of AGES) {
      const p = portrait({ age: age.id })
      for (const crop of CROPS) {
        const [x, y, w, h] = cropBox(p, crop)
        expect([x, y, w, h].every(Number.isFinite), `${crop} at ${age.id}`).toBe(true)
        expect(w).toBeGreaterThan(5)
        expect(w).toBe(h)
        expect(x).toBeGreaterThanOrEqual(-20)
        expect(x + w).toBeLessThanOrEqual(220)
      }
    }
    expect(cropBox(portrait(), 'card')).toEqual([0, 0, 200, 200])
  })

  it('show the eyes at the eyes and the mouth at the mouth', () => {
    const p = portrait()
    const [, eyesY, , eyesH] = cropBox(p, 'eyes')
    const [, mouthY, , mouthH] = cropBox(p, 'mouth')
    expect(mouthY + mouthH / 2).toBeGreaterThan(eyesY + eyesH / 2)
  })
})

describe('the Portrait component', () => {
  it('is a labelled picture, or hidden from a screen reader when it has no label', () => {
    const { container, rerender } = render(<Portrait portrait={defaultPortrait()} label="Ada, portrait" />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('role', 'img')
    expect(svg).toHaveAttribute('aria-label', 'Ada, portrait')
    expect(svg).not.toHaveAttribute('aria-hidden')
    rerender(<Portrait portrait={defaultPortrait()} label="" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('svg')).not.toHaveAttribute('role')
  })

  it('draws filled shapes only: no strokes, no scripts, no NaN', () => {
    for (const crop of ['card', 'head', 'face', 'eyes', 'mouth'] as PortraitCrop[]) {
      const { container, unmount } = render(<Portrait portrait={portrait({ age: 'elderly', facialHair: 'full', hairLength: 'chest', hairTexture: '3C' })} label="x" crop={crop} />)
      const html = container.innerHTML
      expect(html).not.toMatch(/stroke/i)
      expect(html).not.toMatch(/NaN|undefined/)
      expect(container.querySelectorAll('path').length).toBeGreaterThan(5)
      unmount()
    }
  })

  it('rounds the corners of the card, and nothing else', () => {
    const card = render(<Portrait portrait={defaultPortrait()} label="a" crop="card" />).container
    expect(card.querySelector('clipPath rect')).toHaveAttribute('rx', '16')
    const face = render(<Portrait portrait={defaultPortrait()} label="b" crop="face" />).container
    expect(face.querySelector('clipPath rect')).toHaveAttribute('rx', '0')
  })

  it('gives every picture a clip path of its own, so several can share a page', () => {
    const { container } = render(<><Portrait portrait={defaultPortrait()} label="a" /><Portrait portrait={defaultPortrait()} label="b" crop="face" /><Portrait portrait={defaultPortrait()} label="c" idPrefix="custom" /></>)
    const ids = [...container.querySelectorAll('clipPath')].map(c => c.id)
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    expect(ids[2]).toBe('pcustomclip')
    for (const g of container.querySelectorAll('g[clip-path]')) expect(ids).toContain(g.getAttribute('clip-path')!.slice(5, -1))
  })

  it('repairs a portrait that is not whole, and draws the default for one that is not there', () => {
    const broken = { ...defaultPortrait(), eyeSize: Number.NaN, skin: 'not-a-colour', hairColor: undefined } as unknown as CharacterPortrait
    const a = render(<Portrait portrait={broken} label="a" />).container
    expect(a.innerHTML).not.toMatch(/NaN|undefined/)
    const b = render(<Portrait portrait={null} label="b" />).container
    const c = render(<Portrait portrait={defaultPortrait()} label="c" />).container
    expect([...b.querySelectorAll('path')].map(p => p.getAttribute('d'))).toEqual([...c.querySelectorAll('path')].map(p => p.getAttribute('d')))
  })
})

describe('the registry', () => {
  it('offers every part a list of choices that has the current one in it', () => {
    // (Long loose hair, so that its placement and its ends are a choice too.)
    const p = portrait({ hairLength: 'chest' })
    for (const key of PART_KEYS) {
      const options = optionsFor(key, p)
      expect(options.length, key).toBeGreaterThanOrEqual(2)
      expect(options.some(o => o.id === p[key]), key).toBe(true)
      expect(new Set(options.map(o => o.id)).size, key).toBe(options.length)
    }
  })

  it('has the counts the design asks for: twenty or more hair styles, and a dozen or more of the other parts', () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(20)
    expect(AGES).toHaveLength(9)
    expect(AGES[0].id).toBe('infant')
    expect(AGES[AGES.length - 1].id).toBe('elderly')
    for (const [name, list] of Object.entries({ HEADS, EARS, EYES, BROWS, NOSES, MOUTHS, EXPRESSIONS, FACIAL })) expect(list.length, name).toBeGreaterThanOrEqual(12)
    expect(LENGTHS.map(l => l.id)).toEqual(['bald', 'buzzed', 'short', 'chin', 'shoulder', 'chest', 'stomach', 'hip', 'knee', 'body', 'rapunzel'])
    expect(TEXTURES.map(t => t.id)).toEqual(['1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '4C'])
  })

  it('shows only the styles and fronts a length allows, and puts an impossible choice right', () => {
    expect(stylesFor({ hairLength: 'bald', hairStyle: 'plain', hairFront: 'none' }).map(s => s.id)).toEqual(['plain'])
    expect(stylesFor({ hairLength: 'knee', hairStyle: 'plain', hairFront: 'none' }).map(s => s.id)).toContain('twobraids')
    expect(stylesFor({ hairLength: 'knee', hairStyle: 'plain', hairFront: 'none' }).map(s => s.id)).not.toContain('mohawk')
    expect(frontsFor({ hairLength: 'buzzed', hairStyle: 'plain', hairFront: 'none' }).map(f => f.id)).toEqual(['none'])
    expect(fitHair({ hairLength: 'bald', hairStyle: 'twobraids', hairFront: 'curtain' })).toEqual({ hairLength: 'bald', hairStyle: 'plain', hairFront: 'none' })
    // The placement and the ends are a choice only for loose hair that hangs: otherwise they go back to the usual.
    const short = { hairLength: 'short', hairStyle: 'plain', hairFront: 'none', hairEnds: 'in', hairPlacement: 'allleft' }
    expect(fitHair(short)).toEqual({ ...short, hairEnds: 'straight', hairPlacement: 'front' })
    const braids = { hairLength: 'hip', hairStyle: 'twobraids', hairFront: 'none', hairEnds: 'out', hairPlacement: 'left' }
    expect(fitHair(braids)).toEqual({ ...braids, hairEnds: 'straight', hairPlacement: 'front' })
    const coily = { hairLength: 'hip', hairStyle: 'plain', hairFront: 'none', hairTexture: '4C', hairEnds: 'out', hairPlacement: 'behind' }
    expect(fitHair(coily)).toEqual({ ...coily, hairEnds: 'straight', hairPlacement: 'front' })
    const triangle = { hairLength: 'chest', hairStyle: 'triangle', hairFront: 'none', hairEnds: 'in', hairPlacement: 'allright' }
    expect(fitHair(triangle)).toEqual({ ...triangle, hairEnds: 'straight', hairPlacement: 'front' })
    expect(fitHair({ ...triangle, hairPlacement: 'behind' }).hairPlacement).toBe('behind')
    const loose = { hairLength: 'hip', hairStyle: 'plain', hairFront: 'none', hairEnds: 'out', hairPlacement: 'right' }
    expect(fitHair(loose)).toEqual(loose)
    const whole = { hairLength: 'chest', hairStyle: 'twobraids', hairFront: 'side' }
    expect(fitHair(whole)).toEqual(whole)
  })
})
