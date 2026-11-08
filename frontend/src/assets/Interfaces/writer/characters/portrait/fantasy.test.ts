import { describe, expect, it } from 'vitest'
import type { CharacterPortrait } from '../../../../../api/types'
import { colourName, describePortrait, metalName } from '../describe'
import { defaultPortrait, normalizePortrait } from './defaults'
import { portraitDiff } from './diff'
import { CROWNS, EYE_COUNTS, EYE_STYLES, FANTASY_EARS, HOODED, HOODS, HORNS, ITEMS, NECKLACES } from './fantasyLibrary'
import { LENGTHS, TOPS } from './library'
import { optionsFor, previewBase } from './registry'
import { rigOf } from './rig'
import { portraitShapes } from './scene'

const portrait = (over: Partial<CharacterPortrait> = {}): CharacterPortrait => normalizePortrait({ ...defaultPortrait(), ...over })
const shapesOf = (p: CharacterPortrait) => portraitShapes(p)
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
// The y coordinates of a path made of moves, curves and lines (the fantasy shapes use no arcs except ellipses, which are skipped).
const ys = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 1)
const xs = (d: string): number[] => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0)
// Where a shape starts (its first point): enough to say which side of the picture it is on.
const startX = (d: string): number => Number(/^M(-?\d+(?:\.\d+)?)/.exec(d)?.[1] ?? 100)
// Whether a colour is green (hair, in these tests) or magenta (the hood).
const rgb = (hex: string): number[] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const isGreen = (hex: string) => { const [r, g, b] = rgb(hex); return g > r + 20 && g > b + 20 }
const isMagenta = (hex: string) => { const [r, g, b] = rgb(hex); return r > g + 20 && b > g + 20 }

describe('the fantasy lists', () => {
  it('start with the usual (nothing added), so a portrait without them is drawn as it was', () => {
    expect(FANTASY_EARS[0].id).toBe('none')
    for (const list of [HORNS, CROWNS, HOODS, ITEMS, NECKLACES]) expect(list[0].id).toBe('none')
    expect(EYE_STYLES[0].id).toBe('normal')
    expect(EYE_COUNTS[0].id).toBe('two')
    const before = shapesOf(portrait())
    expect(shapesOf(portrait({ horns: 'none', crown: 'none', hood: 'none', heldItem: 'none', necklace: 'none', fantasyEars: 'none', eyeStyle: 'normal', eyeCount: 'two' }))).toEqual(before)
    expect(before.length).toBeGreaterThan(20)
  })

  it('have the choices the author asked for', () => {
    const ids = (l: readonly { id: string }[]) => l.map(o => o.id)
    expect(ids(EYE_COUNTS)).toEqual(expect.arrayContaining(['one', 'third', 'four', 'six', 'cheeks', 'temples']))
    expect(ids(EYE_STYLES)).toEqual(expect.arrayContaining(['glowing', 'solid', 'twocolour', 'slit', 'goat']))
    expect(ids(HORNS)).toEqual(expect.arrayContaining(['ram', 'unicorn', 'antlers', 'stag']))
    expect(ids(ITEMS)).toEqual(expect.arrayContaining(['staff', 'crook', 'crystal', 'wand', 'book', 'openbook', 'scroll', 'lantern', 'torch', 'candle', 'goblet', 'flower', 'quill']))
    expect(ids(CROWNS)).toEqual(expect.arrayContaining(['circlet', 'tiara', 'royal']))
    expect(ids(HOODS)).toEqual(expect.arrayContaining(['hood', 'deep', 'pointed', 'cowl', 'down']))
    expect(ids(NECKLACES)).toEqual(expect.arrayContaining(['chain', 'pearls', 'pendant']))
  })
})

describe('the fantasy elements are drawn', () => {
  it('draws every item on either side of the picture, with every kind of top, as whole shapes', () => {
    for (const item of ITEMS) for (const side of ['left', 'right']) for (const top of ['crew', 'strapless', 'turtle']) {
      expectWhole(portrait({ heldItem: item.id, heldSide: side, top }), `${item.id} ${side} ${top}`)
    }
  })

  it('puts the hand on the side that was chosen, and nothing else of the picture moves', () => {
    for (const item of ITEMS.slice(1)) {
      const base = shapesOf(portrait())
      const right = shapesOf(portrait({ heldItem: item.id, heldSide: 'right' })).slice(base.length)
      const left = shapesOf(portrait({ heldItem: item.id, heldSide: 'left' })).slice(base.length)
      expect(right.length, item.id).toBeGreaterThan(3)
      expect(left.length, item.id).toBe(right.length)
      const mean = (list: ReturnType<typeof shapesOf>) => list.reduce((sum, sh) => sum + startX(sh.d), 0) / list.length
      expect(mean(right), item.id).toBeGreaterThan(100)
      expect(mean(left), item.id).toBeLessThan(100)
    }
    // the picture below the held thing is the same as without it
    const base = shapesOf(portrait())
    expect(shapesOf(portrait({ heldItem: 'staff' })).slice(0, base.length)).toEqual(base)
  })

  it('draws every crown on hair of every length, with and without a hood and horns', () => {
    for (const crown of CROWNS) for (const length of LENGTHS) {
      expectWhole(portrait({ crown: crown.id, hairLength: length.id, hairFront: 'none' }), `${crown.id} ${length.id}`)
    }
    for (const crown of CROWNS) expectWhole(portrait({ crown: crown.id, hood: 'hood', horns: 'ram' }), `${crown.id} hood horns`)
  })

  it('draws every hood over every length of hair and every style that hangs or ties, at every age', () => {
    for (const hood of HOODS) for (const age of ['infant', 'adult', 'elderly']) {
      for (const [style, length, texture] of [['plain', 'bald', '1A'], ['plain', 'short', '1A'], ['plain', 'hip', '1A'], ['plain', 'chest', '3B'], ['twobraids', 'hip', '1B'], ['topbun', 'shoulder', '2B'], ['puff', 'short', '4C'], ['mohawk', 'short', '1A'], ['pigtails', 'chest', '1A'], ['highpony', 'hip', '1A']]) {
        expectWhole(portrait({ hood: hood.id, age, hairStyle: style, hairLength: length, hairTexture: texture, hairFront: 'none' }), `${hood.id} ${age} ${style} ${length}`)
      }
    }
  })

  it('covers the top of the hair with a hood, and lets the length of it fall out over the hood', () => {
    // green hair and a magenta hood, so that each can be told in the list of shapes
    const hooded = (over: Partial<CharacterPortrait>) => shapesOf(portrait({ hood: 'hood', hoodColor: '#c040c0', hairColor: '#20c040', hairFront: 'none', hairTexture: '1A', ...over }))
    const lastHood = (list: ReturnType<typeof shapesOf>) => list.reduce((at, sh, i) => (isMagenta(sh.fill) ? i : at), -1)
    const long = hooded({ hairLength: 'hip' })
    expect(lastHood(long)).toBeGreaterThan(0)
    // some hair is painted after the hood (the fall), and some before it (the cap, which the hood covers)
    expect(long.slice(lastHood(long) + 1).filter(sh => isGreen(sh.fill)).length).toBeGreaterThan(0)
    expect(long.slice(0, long.findIndex(sh => isMagenta(sh.fill))).filter(sh => isGreen(sh.fill)).length).toBeGreaterThan(0)
    // short hair has nothing that hangs: nothing is painted over the hood
    const short = hooded({ hairLength: 'short' })
    expect(short.slice(lastHood(short) + 1).filter(sh => isGreen(sh.fill))).toHaveLength(0)
    // braids hang from under the hood too; a hood down covers nothing, so the hair is drawn as it is
    expect(hooded({ hairLength: 'hip', hairStyle: 'twobraids' }).slice(lastHood(hooded({ hairLength: 'hip', hairStyle: 'twobraids' })) + 1).filter(sh => isGreen(sh.fill)).length).toBeGreaterThan(0)
    const down = shapesOf(portrait({ hood: 'down', hoodColor: '#c040c0', hairColor: '#20c040', hairLength: 'hip', hairFront: 'none', hairTexture: '1A' }))
    expect(shapesOf(portrait({ hairColor: '#20c040', hairLength: 'hip', hairFront: 'none', hairTexture: '1A' })).filter(sh => isGreen(sh.fill)).length).toBe(down.filter(sh => isGreen(sh.fill)).length)
  })

  it('does not draw a bun above a hood', () => {
    const bun = portrait({ hairLength: 'shoulder', hairStyle: 'topbun', hairFront: 'none' })
    const topOf = (p: CharacterPortrait) => Math.min(...shapesOf(p).slice(1).flatMap(s => ys(s.d)))
    expect(topOf(portrait({ ...bun, hood: 'hood' }))).toBeGreaterThan(topOf(bun) - 1)
  })

  it('draws the hood down behind the neck without covering the head', () => {
    const base = shapesOf(portrait())
    const down = shapesOf(portrait({ hood: 'down', hoodColor: '#3e5a3a' }))
    expect(down.length).toBeGreaterThan(base.length)
    expect(down.some(s => s.fill === '#3e5a3a')).toBe(true)
    expect(HOODED).not.toContain('down')
  })

  it('draws horns inside the tile for every kind of horn, at every age and head size', () => {
    for (const horn of HORNS.slice(1)) for (const age of ['infant', 'adult', 'elderly']) for (const hairLength of ['bald', 'chest']) {
      const base = portrait({ age, hairLength, hairFront: 'none' })
      const without = shapesOf(base)
      const extra = shapesOf({ ...base, horns: horn.id }).slice(without.length)
      expect(extra.length, `${horn.id} ${age}`).toBeGreaterThan(1)
      const y = extra.flatMap(s => ys(s.d)), x = extra.flatMap(s => xs(s.d))
      expect(Math.min(...y), `${horn.id} ${age} reaches above the tile`).toBeGreaterThanOrEqual(-1)
      expect(Math.min(...x), `${horn.id} ${age} left`).toBeGreaterThanOrEqual(-1)
      expect(Math.max(...x), `${horn.id} ${age} right`).toBeLessThanOrEqual(201)
    }
  })

  it('draws horns and antlers in their colour, and the second eye in its own colour only for two colours', () => {
    expect(shapesOf(portrait({ horns: 'ram', hornColor: '#112233' })).some(s => s.fill === '#112233')).toBe(true)
    const two = shapesOf(portrait({ eyeStyle: 'twocolour', eyeColor: '#445566', eyeColor2: '#aa22cc' })).map(s => s.fill)
    expect(two).toContain('#aa22cc')
    expect(two).toContain('#445566')
    const one = shapesOf(portrait({ eyeStyle: 'normal', eyeColor: '#445566', eyeColor2: '#aa22cc' })).map(s => s.fill)
    expect(one).not.toContain('#aa22cc')
  })

  it('draws more eyes where they were asked for, and one eye for one', () => {
    const count = (id: string) => shapesOf(portrait({ eyeCount: id })).length
    const two = count('two')
    expect(count('one')).toBeLessThan(two)
    for (const id of ['third', 'four', 'six', 'cheeks', 'temples']) expect(count(id), id).toBeGreaterThan(two)
    expect(count('six')).toBeGreaterThan(count('four'))
    expect(count('four')).toBeGreaterThan(count('third'))
    for (const id of EYE_COUNTS.map(o => o.id)) for (const style of EYE_STYLES.map(o => o.id)) expectWhole(portrait({ eyeCount: id, eyeStyle: style }), `${id} ${style}`)
  })

  it('draws the ears of the fantasy in place of the ears of the head', () => {
    const plain = shapesOf(portrait({ hairLength: 'buzzed' }))
    for (const ear of FANTASY_EARS.slice(1)) {
      const made = shapesOf(portrait({ hairLength: 'buzzed', fantasyEars: ear.id }))
      expect(made, ear.id).not.toEqual(plain)
      expectWhole(portrait({ hairLength: 'buzzed', fantasyEars: ear.id }), ear.id)
    }
    // the tip of the highest ear on the right: an elf's is far above the brow, a human's is not
    const tip = (p: CharacterPortrait) => {
      const g = rigOf(p)
      const ears = shapesOf(p).filter(sh => sh.fill === p.skin && xs(sh.d).every(x => x > 100 + g.cheek * 0.9 - 5))
      return { y: Math.min(...ears.flatMap(sh => ys(sh.d))), brow: g.browY }
    }
    const elf = tip(portrait({ hairLength: 'buzzed', fantasyEars: 'longelf' })), human = tip(portrait({ hairLength: 'buzzed' }))
    expect(elf.y).toBeLessThan(elf.brow - 10)
    expect(human.y).toBeGreaterThan(human.brow - 6)
  })

  it('draws every necklace on every top', () => {
    for (const necklace of NECKLACES) for (const top of TOPS) expectWhole(portrait({ necklace: necklace.id, top: top.id }), `${necklace.id} ${top.id}`)
    for (const necklace of NECKLACES.slice(1)) expect(shapesOf(portrait({ necklace: necklace.id })).length, necklace.id).toBeGreaterThan(shapesOf(portrait()).length)
  })

  it('draws a whole picture with every fantasy element at once', () => {
    expectWhole(portrait({
      fantasyEars: 'elf', horns: 'stag', eyeStyle: 'glowing', eyeCount: 'six', crown: 'royal', hood: 'cowl', heldItem: 'lantern', heldSide: 'left', necklace: 'amulet',
      skin: '#6f94bf', hairLength: 'hip', age: 'elderly',
    }), 'everything')
  })
})

describe('the fantasy elements in the registry', () => {
  it('offers each part its list, and shows the top of the head and the neck for the ones that sit there', () => {
    const p = portrait()
    for (const key of ['necklace', 'fantasyEars', 'horns', 'eyeStyle', 'eyeCount', 'crown', 'hood', 'heldItem', 'heldSide'] as const) {
      expect(optionsFor(key, p).length, key).toBeGreaterThanOrEqual(2)
      expect(optionsFor(key, p).some(o => o.id === p[key]), key).toBe(true)
    }
    // the ears are looked at with the hair out of the way, and a hood does not hide a horn or a crown being chosen
    expect(previewBase('fantasyEars', portrait({ hairLength: 'chest', hood: 'hood' }))).toMatchObject({ hairLength: 'buzzed', hood: 'none' })
    expect(previewBase('horns', portrait({ hood: 'deep' })).hood).toBe('none')
    expect(previewBase('crown', portrait({ hood: 'deep' })).hood).toBe('none')
    expect(previewBase('hood', portrait({ crown: 'tiara' })).crown).toBe('none')
  })
})

describe('the fantasy elements in words and in a comparison', () => {
  it('names an unusual skin by its hue, and an ordinary one as before', () => {
    expect(colourName('#6f94bf', 'skin')).toBe('blue')
    expect(colourName('#7ea65e', 'skin')).toBe('green')
    expect(colourName('#8a6aa8', 'skin')).toBe('purple')
    expect(colourName('#9d9ea4', 'skin')).toBe('grey')
    expect(colourName('#b5473a', 'skin')).toBe('red')
    expect(colourName('#d6b04a', 'skin')).toBe('golden')
    expect(colourName('#d9a07a', 'skin')).toBe('light')
    expect(colourName('#3a1f16', 'skin')).toBe('deep brown')
    expect(colourName('#8a5ab0', 'eye')).toBe('purple')
    expect(colourName('#d6b030', 'eye')).toBe('gold')
    expect(colourName('#b02a2a', 'eye')).toBe('red')
    expect(metalName('#d9b04a')).toBe('gold')
    expect(metalName('#c0c0c0')).toBe('silver')
    expect(metalName('#b87333')).toBe('copper')
  })

  it('says the fantasy in the fields of the appearance', () => {
    const words = describePortrait(portrait({
      skin: '#6f94bf', fantasyEars: 'elf', horns: 'ram', eyeStyle: 'twocolour', eyeColor: '#3e6b5a', eyeColor2: '#8a5ab0', eyeCount: 'third',
      crown: 'circlet', crownColor: '#d9b04a', hood: 'deep', hoodColor: '#2b2b33', necklace: 'pearls', heldItem: 'staff', heldSide: 'left',
    }))
    expect(words.skin).toMatch(/^Blue skin/)
    expect(words.face).toMatch(/elf ears, ram horns/)
    expect(words.eyes).toMatch(/green and purple.*one of each colour/i)
    expect(words.eyes).toMatch(/third eye in the middle of the forehead/)
    expect(words.style).toMatch(/gold circlet/)
    expect(words.style).toMatch(/deep hood pulled low/)
    expect(words.style).toMatch(/pearl necklace/)
    expect(words.style).toMatch(/holds a staff in the hand on the left of the portrait/)
    // a plain portrait says none of it
    const plain = describePortrait(portrait())
    expect(plain.style).not.toMatch(/holds|hood|circlet/)
    expect(plain.eyes).not.toMatch(/third|glowing|slit/)
  })

  it('names one eye, and the styles of the eyes', () => {
    expect(describePortrait(portrait({ eyeCount: 'one', eyeColor: '#3e6b5a' })).eyes).toMatch(/single great eye in the middle of the face/)
    expect(describePortrait(portrait({ eyeStyle: 'slit', eyeColor: '#d6b030' })).eyes).toMatch(/slit pupils/)
    expect(describePortrait(portrait({ eyeStyle: 'glowing', eyeColor: '#3fe0e0' })).eyes).toMatch(/^Glowing/)
    expect(describePortrait(portrait({ eyeStyle: 'blank' })).eyes).toMatch(/^Blank white/)
  })

  it('lists a change of the fantasy in a comparison, and a colour only where there is the thing', () => {
    const a = portrait(), b = portrait({ horns: 'ram', hornColor: '#112233', heldItem: 'wand', heldSide: 'left', crown: 'tiara', crownColor: '#c0c0c0' })
    const lines = portraitDiff(a, b)
    expect(lines).toContain('Horns: None > Ram horns')
    expect(lines).toContain('Held item: None > Wand')
    expect(lines).toContain('Crown: None > Tiara')
    expect(lines.some(l => l.startsWith('Hand holding the item'))).toBe(true)
    // a colour of something neither has is not a difference
    expect(portraitDiff(a, portrait({ hornColor: '#112233', hoodColor: '#ffffff', itemColor: '#ffffff', necklaceColor: '#ffffff', crownColor: '#ffffff', eyeColor2: '#ffffff', heldSide: 'left' }))).toEqual([])
    // and one that is shown when the thing is there
    expect(portraitDiff(portrait({ horns: 'ram' }), portrait({ horns: 'ram', hornColor: '#112233' }))).toEqual(['Horn colour: bone > black'.replace('bone', colourName('#d8cdb4', 'cloth')).replace('black', colourName('#112233', 'cloth'))])
  })
})
