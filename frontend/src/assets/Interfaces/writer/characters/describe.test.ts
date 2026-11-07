import { describe, expect, it } from 'vitest'
import type { CharacterLook } from '../../../../api/types'
import { defaultLook } from './art/defaults'
import { APPEARANCE_FIELDS, appearanceText, colourName, describeLook, emptyAppearanceFields, heightWords, writeFromLook } from './describe'
import { emptyProfile } from './story'

const look = (over: Partial<CharacterLook> = {}): CharacterLook => ({ ...defaultLook(), ...over })

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
    expect(colourName('#3e6b5a', 'eye')).toBe('green')
    expect(colourName('#2f4a7a', 'eye')).toBe('blue')
    expect(colourName('#802020', 'cloth')).toBe('red')
    expect(colourName('not a colour', 'cloth')).toBeTruthy()
  })
})

describe('the look in words', () => {
  it('says how tall', () => {
    expect([0.8, 0.93, 1, 1.08, 1.25].map(heightWords)).toEqual(['short', 'a little under average height', 'of average height', 'tall', 'very tall'])
  })

  it('describes every part from the choices of the look', () => {
    const words = describeLook(look({
      height: 1.2, build: 'broad', hair: 'long', hairColor: '#111111', hairLength: 0.9, eyes: 'almond', eyeColor: '#3e6b5a', skin: '#8d5a3b', facialHair: 'full', facialHairColor: '#111111',
      marks: [{ id: 'm1', kind: 'scar', design: 'slash', area: 'forehead', x: 0.5, y: 0.5, size: 1, color: null, strokes: [] }],
      outfit: { top: 'shirt', bottom: 'trousers', shoes: 'boots', outer: null, accessories: ['belt'], colors: { top: '#802020' } },
    }))
    expect(words.height).toBe('Very tall')
    expect(words.build).toContain('Broad build')
    expect(words.skin).toBe('Brown skin')
    expect(words.hair).toMatch(/^Long black hair; full beard in black$/i)
    expect(words.eyes).toMatch(/^Green, .*almond.* eyes/)
    expect(words.face).toMatch(/face with .* brows, a?n? ?.* nose and a?n? ?.* mouth/)
    expect(words.style).toMatch(/^Wears a red shirt, .*trousers.* and .*boots, with belt$/)
    expect(words.style).not.toMatch(/ an? (\w+ )?trousers/)
    expect(words.marks).toBe('Scar (forehead)')
    expect(words.voice).toBe('')
    expect(words.appearance).toContain('Very tall')
    expect(words.appearance).toContain('Scar (forehead).')
  })

  it('says bald for no hair', () => {
    expect(describeLook(look({ hair: 'bald', facialHair: 'none' })).hair).toBe('Bald')
  })
})

describe('the appearance text of a profile', () => {
  it('is the paragraph, or the pieces joined into sentences, or nothing', () => {
    const p = emptyProfile()
    expect(appearanceText(p)).toBe('')
    expect(appearanceText({ ...p, hair: 'Black, cropped', eyes: 'Grey.' })).toBe('Black, cropped. Grey.')
    expect(appearanceText({ ...p, appearance: '  A tall woman.  ', hair: 'Black' })).toBe('A tall woman.')
  })

  it('lists the empty fields, and writes only the asked-for ones from the look, leaving what is written', () => {
    const p = { ...emptyProfile(), hair: 'My own words' }
    expect(emptyAppearanceFields(p)).toEqual(APPEARANCE_FIELDS.map(f => f.key).filter(k => k !== 'hair'))
    const next = writeFromLook(p, look(), emptyAppearanceFields(p))
    expect(next.hair).toBe('My own words')
    expect(next.eyes).not.toBe('')
    expect(next.voice).toBe('') // the look has nothing to say about a voice
    expect(p.eyes).toBe('')
    expect(writeFromLook(p, look(), ['hair']).hair).not.toBe('My own words')
  })
})
