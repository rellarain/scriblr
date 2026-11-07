import { describe, expect, it } from 'vitest'
import type { CharacterPortrait } from '../../../../api/types'
import { APPEARANCE_FIELDS, appearanceText, colourName, describePortrait, emptyAppearanceFields, writeFromPortrait } from './describe'
import { defaultPortrait } from './portrait/defaults'
import { emptyProfile } from './story'

const portrait = (over: Partial<CharacterPortrait> = {}): CharacterPortrait => ({ ...defaultPortrait(), ...over })

describe('colours in words', () => {
  it('name skin by how light it is', () => {
    expect(colourName('#2b1a12', 'skin')).toBe('deep brown')
    expect(colourName('#8d5a3b', 'skin')).toBe('brown')
    expect(colourName('#e0b08a', 'skin')).toBe('light')
    expect(colourName('#efcdb4', 'skin')).toBe('fair')
  })

  it('name hair, eyes and cloth in the words an author would use', () => {
    expect(colourName('#111111', 'hair')).toBe('black')
    expect(colourName('#c9a063', 'hair')).toBe('golden')
    expect(colourName('#c0301c', 'hair')).toBe('red')
    expect(colourName('#cccccc', 'hair')).toBe('silver')
    expect(colourName('#eeece8', 'hair')).toBe('white')
    expect(colourName('#ecd9a6', 'hair')).toBe('blond')
    expect(colourName('#3e6b5a', 'eye')).toBe('green')
    expect(colourName('#2f4a7a', 'eye')).toBe('blue')
    expect(colourName('#802020', 'cloth')).toBe('red')
    expect(colourName('not a colour', 'cloth')).toBeTruthy()
  })
})

describe('the portrait in words', () => {
  it('describes every part from the choices of the portrait', () => {
    const words = describePortrait(portrait({
      age: 'middle', build: 'broad', skin: '#8d5a3b', hairLength: 'chest', hairTexture: '3B', hairStyle: 'twobraids', hairFront: 'side', hairColor: '#111111', highlightColor: '#b5482a',
      greying: 'none', facialHair: 'full', facialHairColor: '#111111', eyes: 'almond', eyeColor: '#3e6b5a', top: 'vneck', topColor: '#802020', expression: 'stern',
    }))
    expect(words.height).toBe('')
    expect(words.build).toContain('Broad build')
    expect(words.skin).toBe('Brown skin')
    expect(words.hair).toBe('Chest-length curly black hair, in two braids, with a side part, red highlights; a full beard')
    expect(words.eyes).toMatch(/^Green, .*almond.* eyes/)
    expect(words.face).toMatch(/face with .* brows, a?n? ?.* nose and a?n? ?.* mouth/)
    expect(words.bearing).toBe('Usually looks stern')
    expect(words.style).toMatch(/^Wears a red .*neck top$/i)
    expect(words.appearance).toMatch(/^A middle-aged person, with a broad build/)
    expect(words.appearance).toContain('Brown skin')
  })

  it('leaves the height, the voice and the marks to the author', () => {
    const words = describePortrait(portrait())
    expect(words.height).toBe('')
    expect(words.voice).toBe('')
    expect(words.marks).toBe('')
  })

  it('says the exact length and the texture of long, tightly coiled hair, in words', () => {
    expect(describePortrait(portrait({ hairLength: 'knee', hairTexture: '4C' })).hair).toBe('Knee-length tightly coiled dark brown hair')
    expect(describePortrait(portrait({ hairLength: 'rapunzel', hairTexture: '1A' })).hair).toMatch(/^Rapunzel-length fine straight /)
  })

  it('says bald for no hair, and the beard after it', () => {
    expect(describePortrait(portrait({ hairLength: 'bald' })).hair).toBe('Bald')
    expect(describePortrait(portrait({ hairLength: 'bald', facialHair: 'full' })).hair).toMatch(/^Bald; an? .*beard|^Bald; a /i)
  })

  it('gives a child no beard in words, and an elder lined skin', () => {
    expect(describePortrait(portrait({ age: 'child', facialHair: 'full' })).hair).not.toMatch(/beard/i)
    expect(describePortrait(portrait({ age: 'elderly' })).skin).toMatch(/lined with age/)
    expect(describePortrait(portrait({ age: 'adult' })).skin).not.toMatch(/lined/)
  })

  it('says the hairline only when it is not the plain rounded one', () => {
    expect(describePortrait(portrait()).hair).not.toMatch(/hairline/)
    expect(describePortrait(portrait({ hairline: 'receding' })).hair).toMatch(/receding hairline/)
  })

  it('names the grey of old age in the hair colour', () => {
    expect(describePortrait(portrait({ age: 'elderly', hairColor: '#111111' })).hair).toMatch(/grey|silver|white/)
  })

  it('does not fail on an id the library does not know', () => {
    const words = describePortrait(portrait({ age: 'ancient', hairStyle: 'nope', top: 'toga', expression: 'smug' }))
    expect(Object.values(words).join(' ')).not.toMatch(/undefined|NaN/)
  })
})

describe('the appearance text of a profile', () => {
  it('is the paragraph, or the pieces joined into sentences, or nothing', () => {
    const p = emptyProfile()
    expect(appearanceText(p)).toBe('')
    expect(appearanceText({ ...p, hair: 'Black, cropped', eyes: 'Grey.' })).toBe('Black, cropped. Grey.')
    expect(appearanceText({ ...p, appearance: '  A tall woman.  ', hair: 'Black' })).toBe('A tall woman.')
  })

  it('lists the empty fields, and writes only the asked-for ones from the portrait, leaving what is written', () => {
    const p = { ...emptyProfile(), hair: 'My own words' }
    expect(emptyAppearanceFields(p)).toEqual(APPEARANCE_FIELDS.map(f => f.key).filter(k => k !== 'hair'))
    const next = writeFromPortrait(p, portrait(), emptyAppearanceFields(p))
    expect(next.hair).toBe('My own words')
    expect(next.eyes).not.toBe('')
    expect(next.voice).toBe('') // the portrait has nothing to say about a voice
    expect(next.height).toBe('') // nor about a height
    expect(next.marks).toBe('') // nor about marks
    expect(p.eyes).toBe('')
    expect(writeFromPortrait(p, portrait(), ['hair']).hair).not.toBe('My own words')
  })
})
