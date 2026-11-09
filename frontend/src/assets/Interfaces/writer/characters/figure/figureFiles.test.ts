import { describe, expect, it } from 'vitest'
import type { CharacterDoc, CharacterFigure, FigureModel } from '../../../../../api/types'
import { previewModels } from '../../../../../designSystem/mockCharacterModels'
import { newCharacter } from '../../../../../designSystem/mockCharacters'
import { copyOf } from '../../../../../designSystem/mockFigureModels'
import { buildCharacterFile, figureKeys, importCharacters, parseCharacterFile, type CharacterFile } from '../charFile'
import { blankFigure } from './figureState'

// Characters as a file carry their figures and the copies of the models the figures are drawn from, and importing keeps the copies in the project and follows the figures to the
// key the project knows each copy by.
const model = previewModels()[0].draft
const copy = copyOf(model)
const other = copyOf({ ...model, description: 'Another model' }, 'other')
const figure = (over: Partial<CharacterFigure> = {}): CharacterFigure => ({ ...blankFigure(copy.id, model), ...over })
const person = (id: string, name: string, over: Partial<CharacterDoc> = {}): CharacterDoc => ({ ...newCharacter(id, { name }, 0), ...over })

describe('a character file with figures', () => {
  it('lists the keys of the copies the figures and the states point at', () => {
    const doc = person('a', 'Ada', { figure: figure(), states: [{ id: 's1', at: '', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], figure: figure({ model: other.id }) }] })
    expect(figureKeys([doc, person('b', 'Bram')]).sort()).toEqual([copy.id, other.id].sort())
  })

  it('carries only the copies the exported characters use, once each', () => {
    const ada = person('a', 'Ada', { figure: figure() }), bram = person('b', 'Bram', { figure: figure() }), cleo = person('c', 'Cleo', { figure: figure({ model: other.id }) })
    const file = buildCharacterFile([ada, bram, cleo], ['a', 'b'], new Date(), [copy, other, copy])
    expect(file.figureModels?.map(m => m.id)).toEqual([copy.id])
    expect(buildCharacterFile([person('p', 'Plain')], null, new Date(), [copy])).not.toHaveProperty('figureModels')
  })

  it('reads back through the text: the figure, the figure of a state and the copies; a figure with no copy to point at is none', () => {
    const doc = person('a', 'Ada', { figure: figure({ values: { r_head: 95 } }), states: [{ id: 's1', at: '', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], figure: figure() }] })
    const parsed = parseCharacterFile(JSON.stringify(buildCharacterFile([doc], null, new Date(), [copy])))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.characters[0].figure).toMatchObject({ model: copy.id, values: { r_head: 95 } })
    expect(parsed.file.characters[0].states[0].figure?.model).toBe(copy.id)
    expect(parsed.file.figureModels?.[0].id).toBe(copy.id)
    const broken = JSON.parse(JSON.stringify(buildCharacterFile([doc], null, new Date(), [copy])))
    broken.characters[0].figure = { model: 'x' }
    broken.figureModels = [{ id: 'nope', content: {} }, { id: copy.id, content: { shapes: 'no' } }, 'junk']
    const again = parseCharacterFile(JSON.stringify(broken))
    expect(again.ok && again.file.characters[0].figure).toBeNull()
    expect(again.ok && again.file.figureModels).toBeUndefined()
  })

  it('a file from before figures has none and its characters keep their portraits', () => {
    const old = { format: 'scriblr-characters', version: 1, exportedAt: '', characters: [{ id: 'a', name: 'Ada' }] }
    const parsed = parseCharacterFile(JSON.stringify(old))
    expect(parsed.ok && parsed.file.characters[0].figure).toBeNull()
    expect(parsed.ok && parsed.file.characters[0].portrait.skin).toBeTruthy()
  })
})

describe('importing a character file with figures', () => {
  const file = (): CharacterFile => buildCharacterFile([person('a', 'Ada', { figure: figure(), states: [{ id: 's1', at: '', storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], figure: figure() }] })], null, new Date(), [copy])
  function api(keep: (m: FigureModel) => Promise<FigureModel>) {
    const created: unknown[] = [], put: CharacterDoc[] = [], kept: string[] = []
    return {
      created, put, kept,
      api: {
        create: async (body: unknown) => { created.push(body); return person('new1', 'Ada') },
        put: async (d: CharacterDoc) => { put.push(d); return d },
        keepCopy: async (m: FigureModel) => { kept.push(m.id); return keep(m) },
      },
    }
  }

  it('keeps each copy the characters use once and follows the figures to the key the project knows it by', async () => {
    const { api: stub, created, put, kept } = api(async m => ({ ...m, id: '0123456789ab' }))
    const result = await importCharacters(file(), new Map(), [], stub)
    expect(result.error).toBeUndefined()
    expect(result.note).toBeUndefined()
    expect(kept).toEqual([copy.id])
    expect((created[0] as { figure: CharacterFigure }).figure.model).toBe('0123456789ab')
    expect(put[0].figure?.model).toBe('0123456789ab')
    expect(put[0].states[0].figure?.model).toBe('0123456789ab')
  })

  it('leaves the figure out, and says so, when the copy cannot be kept; the character keeps its portrait', async () => {
    const { api: stub, created, put } = api(async () => { throw new Error('too big') })
    const result = await importCharacters(file(), new Map(), [], stub)
    expect(result.error).toBeUndefined()
    expect(result.note).toMatch(/^The figure of 1 character could not be brought in/)
    expect((created[0] as { figure: unknown }).figure).toBeNull()
    expect(put[0].figure).toBeNull()
    expect(put[0].states[0].figure).toBeNull()
    expect(put[0].portrait.skin).toBeTruthy()
  })

  it('skips the copies of characters that are not brought in', async () => {
    const { api: stub, kept } = api(async m => m)
    await importCharacters(file(), new Map([['a', 'skip']]), [{ id: 'a', name: 'Ada', order: 0, updatedAt: '', portrait: person('a', 'Ada').portrait }], stub)
    expect(kept).toEqual([])
  })

  it('without a way to keep copies the figures are left as they are', async () => {
    const { api: stub, put } = api(async m => m)
    await importCharacters(file(), new Map(), [], { create: stub.create, put: stub.put })
    expect(put[0].figure?.model).toBe(copy.id)
  })
})
