import { describe, expect, it } from 'vitest'
import type { CharacterDoc } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { defaultLook } from './art/defaults'
import { AGE_RANGE, ageLook } from './age'
import { buildCharacterFile, importCharacters, importRows, parseCharacterFile } from './charFile'
import { SHEET_H, SHEET_W, sheetFileName, sheetSvg, wrapText } from './sheet'

const person = (id: string, name: string, over: Partial<CharacterDoc> = {}): CharacterDoc => ({ ...newCharacter(id, { name }, 0), ...over })
const rel = (id: string, targetId: string) => ({ id, targetId, kind: 'friend' as const, family: null, label: '', description: '', changes: [] })

describe('ageing a look', () => {
  const look = { ...defaultLook(), hairColor: '#202020', facialHair: 'full', eyes: 'round', mouth: 'full' }
  it('is no change at zero years', () => expect(ageLook(look, 0)).toBe(look))
  it('greys the hair, brows and beard, and the more the older', () => {
    const a = ageLook(look, 20), b = ageLook(look, 50)
    const grey = (hex: string) => parseInt(hex.slice(1, 3), 16)
    expect(grey(a.hairColor)).toBeGreaterThan(grey(look.hairColor))
    expect(grey(b.hairColor)).toBeGreaterThan(grey(a.hairColor))
    expect(grey(b.facialHairColor)).toBeGreaterThan(grey(look.facialHairColor))
    expect(b.height).toBeLessThan(look.height)
    expect(b.width).toBeGreaterThan(look.width)
  })
  it('hoods the eyes and thins the lips at an advanced age', () => {
    expect(ageLook(look, 20).eyes).toBe('round')
    expect(ageLook(look, 40)).toMatchObject({ eyes: 'hooded', mouth: 'thin' })
  })
  it('makes a younger figure smaller, with larger eyes and no beard', () => {
    const y = ageLook(look, -30)
    expect(y.height).toBeLessThan(look.height)
    expect(y.eyeSize).toBeGreaterThan(look.eyeSize)
    expect(y).toMatchObject({ eyes: 'large', facialHair: 'none' })
  })
  it('keeps every slider in its range, at either end', () => {
    for (const years of [AGE_RANGE.min, AGE_RANGE.max]) {
      const a = ageLook({ ...look, height: 0.7, width: 1.4, shoulders: 0.8, eyeSize: 0.6 }, years)
      expect(a.height).toBeGreaterThanOrEqual(0.7)
      expect(a.width).toBeLessThanOrEqual(1.4)
      expect(a.shoulders).toBeGreaterThanOrEqual(0.8)
      expect(a.eyeSize).toBeGreaterThanOrEqual(0.6)
    }
  })
})

describe('character files', () => {
  const cast = [person('a', 'Ada', { relationships: [rel('r1', 'b'), rel('r2', 'c')], appearances: ['ch1'] }), person('b', 'Bram'), person('c', 'Cleo')]

  it('keep only the links between the characters in the file, and leave out the tags on the outline', () => {
    const file = buildCharacterFile(cast, ['a', 'b'], new Date('2026-11-01T00:00:00Z'))
    expect(file).toMatchObject({ format: 'scriblr-characters', version: 1, exportedAt: '2026-11-01T00:00:00.000Z' })
    expect(file.characters.map(c => c.id)).toEqual(['a', 'b'])
    expect(file.characters[0].relationships.map(r => r.targetId)).toEqual(['b'])
    expect(file.characters[0].appearances).toEqual([])
    expect(buildCharacterFile(cast).characters).toHaveLength(3)
  })

  it('are read back, with the look repaired', () => {
    const text = JSON.stringify({ ...buildCharacterFile(cast), characters: [{ ...cast[0], look: { skin: 'red', hair: 'braid' } }, { id: '', name: 'x' }, 'bad'] })
    const parsed = parseCharacterFile(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.file.characters).toHaveLength(1)
      expect(parsed.file.characters[0].look).toMatchObject({ skin: '#e0b08a', hair: 'braid' })
    }
  })

  it('are refused with a reason when they are not character files', () => {
    expect(parseCharacterFile('nope')).toMatchObject({ ok: false, error: expect.stringContaining('JSON') })
    expect(parseCharacterFile('{"format":"other"}')).toMatchObject({ ok: false, error: expect.stringContaining('not a Scriblr character file') })
    expect(parseCharacterFile('{"format":"scriblr-characters","version":9,"characters":[1]}')).toMatchObject({ ok: false, error: expect.stringContaining('newer') })
    expect(parseCharacterFile('{"format":"scriblr-characters","version":1,"characters":[]}')).toMatchObject({ ok: false })
    expect(parseCharacterFile('{"format":"scriblr-characters","version":1,"characters":[{"nope":1}]}')).toMatchObject({ ok: false, error: expect.stringContaining('None') })
  })

  it('import as new characters, with the links between them on the new ids, or replace one that clashes', async () => {
    const file = buildCharacterFile(cast, ['a', 'b'])
    const existing = [{ id: 'b', name: 'Bram', order: 0, updatedAt: '' }]
    expect(importRows(file, existing).map(r => !!r.clash)).toEqual([false, true])
    const created: string[] = []
    const put: CharacterDoc[] = []
    const api = {
      create: async (body: { name?: string }) => { const id = `new${created.length + 1}`; created.push(body.name ?? ''); return person(id, body.name ?? '') },
      put: async (d: CharacterDoc) => { put.push(d); return d },
    }
    const both = await importCharacters(file, new Map(), existing, api)
    expect(both.made).toEqual(['new1', 'new2'])
    expect(put[0].relationships.map(r => r.targetId)).toEqual(['new2'])
    created.length = 0; put.length = 0
    const mixed = await importCharacters(file, new Map([['b', 'replace' as const]]), existing, api)
    expect(mixed).toMatchObject({ made: ['new1'], replaced: ['b'] })
    expect(put.map(d => d.id)).toEqual(['new1', 'b'])
    expect(put[0].relationships.map(r => r.targetId)).toEqual(['b'])
    const skipped = await importCharacters(file, new Map([['b', 'skip' as const]]), existing, api)
    expect(skipped.skipped).toEqual(['b'])
    expect(put.at(-1)!.relationships).toEqual([])
  })

  it('say what went wrong when the server refuses', async () => {
    const r = await importCharacters(buildCharacterFile(cast, ['b']), new Map(), [], { create: async () => { throw new Error('full') }, put: async d => d })
    expect(r.error).toBe('full')
  })
})

describe('the character sheet', () => {
  const doc = person('a', 'Ada & <Co>', { profile: { ...person('a', 'x').profile, role: 'Navigator', age: '29', personality: 'Dry '.repeat(60), goal: 'Chart the Glass Sea' } })
  it('is an SVG document with the name, the profile and every drawing, with ids that do not meet', () => {
    const svg = sheetSvg(doc)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain(`width="${SHEET_W}" height="${SHEET_H}"`)
    expect(svg).toContain('Ada &amp; &lt;Co&gt;')
    expect(svg).toContain('Navigator · age 29')
    expect(svg).toContain('Chart the Glass Sea')
    expect((svg.match(/<svg /g) ?? []).length).toBe(6)
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    expect(svg).not.toMatch(/NaN|undefined/)
  })
  it('wraps text at spaces and names its file safely', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four'])
    expect(wrapText('a\n\nb', 20)).toEqual(['a', 'b'])
    expect(sheetFileName('Ada: the "Navigator"')).toBe('Ada-the-Navigator-sheet.png')
    expect(sheetFileName('???')).toBe('character-sheet.png')
  })
})
