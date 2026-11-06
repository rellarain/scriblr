import type { CharacterCreate, CharacterDoc, CharacterSummary } from '../api/types'
import { defaultLook, normalizeLook } from '../assets/Interfaces/writer/characters/art/defaults'
import { emptyStory } from '../assets/Interfaces/writer/characters/story'
import type { MockAnswer } from './mockPresets'

// A pretend Characters API (`/api/projects/{id}/characters`), shared by the design system previews (mockBackend.ts) and the tests (test/charactersBackend.ts): the cast
// lives in memory and answers the way the server does (a new character has the default look, a look that is sent is repaired, a character that is not there is a 404).

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'

export function summaryOf(c: CharacterDoc): CharacterSummary {
  return { id: c.id, name: c.name, order: c.order, updatedAt: c.updatedAt }
}

export function newCharacter(id: string, body: CharacterCreate, order: number): CharacterDoc {
  return { schemaVersion: 2, id, name: body.name?.trim() || 'Unnamed character', order, look: body.look ? normalizeLook(body.look) : defaultLook(), ...emptyStory(), updatedAt: AT }
}

export function createMockCharacters(initial: CharacterDoc[] = []) {
  const cast = new Map<string, CharacterDoc>(initial.map(c => [c.id, c]))
  let next = initial.length + 1
  // Every save stamps a new time, as the server does (the console reads the cast again when a time changes).
  let saves = 1

  function route(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length === 0) {
      if (method === 'GET') return ok([...cast.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map(summaryOf))
      if (method === 'POST') {
        const doc = newCharacter(`chr_mock${next++}`, (body ?? {}) as CharacterCreate, cast.size)
        cast.set(doc.id, doc)
        return ok(doc, 201)
      }
      return fail(405, 'Method not allowed')
    }
    const id = rest[0]
    const found = cast.get(id)
    if (method === 'GET') return found ? ok(found) : fail(404, 'Character not found')
    if (method === 'PUT') {
      if (!found) return fail(404, 'Character not found')
      const b = body as CharacterDoc
      if (b.id !== id) return fail(422, 'The id does not match.')
      // A relationship is with another character that is there, not with oneself.
      const relationships = (b.relationships ?? []).filter(r => cast.has(r.targetId) && r.targetId !== id)
      const saved: CharacterDoc = { ...emptyStory(), ...b, relationships, name: b.name.trim() || 'Unnamed character', look: normalizeLook(b.look), updatedAt: `2026-11-02T12:${String(Math.floor(saves / 60) % 60).padStart(2, '0')}:${String(saves++ % 60).padStart(2, '0')}.000Z` }
      cast.set(id, saved)
      return ok(saved)
    }
    if (method === 'DELETE') {
      if (!found) return fail(404, 'Character not found')
      cast.delete(id)
      for (const c of cast.values()) c.relationships = c.relationships.filter(r => r.targetId !== id)
      return { status: 204, body: undefined }
    }
    return fail(405, 'Method not allowed')
  }

  return { route, get cast() { return cast } }
}

// The cast a preview opens with: two characters with looks of their own.
export function seedCharacters(): CharacterDoc[] {
  const ada = newCharacter('chr_ada', { name: 'Ada Marsh' }, 0)
  ada.look = {
    ...ada.look, skin: '#c98f6b', hair: 'wavy', hairColor: '#7a3f22', hairLength: 0.7, eyes: 'almond', eyeColor: '#3e6b5a', brows: 'arched', mouth: 'heart', build: 'curvy', expression: 'smirk',
    outfit: { top: 'shirt', bottom: 'skirt', shoes: 'boots', outer: 'cape', accessories: ['belt', 'glasses'], colors: { top: '#d9d2c0', bottom: '#2f4a5a', shoes: '#4a3a30', outer: '#802020', accessory: '#c9a227' } },
    marks: [{ id: 'm1', kind: 'freckles', design: 'nose', area: 'cheeks', x: 0.5, y: 0.35, size: 1, color: null, strokes: [] }],
  }
  const bram = newCharacter('chr_bram', { name: 'Bram Quill' }, 1)
  bram.look = { ...bram.look, skin: '#8d5a3b', hair: 'buzz', hairColor: '#1f1a17', facialHair: 'full', build: 'broad', headShape: 'square', nose: 'broad', brows: 'thick', pose: 'relaxed' }
  ada.profile = { ...ada.profile, role: 'Navigator', age: '29', occupation: 'Ship’s cartographer', summary: 'Charts coasts nobody else will sail.', goal: 'Finish the chart of the Glass Sea.', fear: 'Open water at night.', fields: [{ id: 'f1', label: 'Motto', value: 'Measure twice.' }] }
  ada.relationships = [{ id: 'r1', targetId: 'chr_bram', kind: 'ally', family: null, label: 'First mate', description: 'Trusts him with the helm and nothing else.', changes: [] }]
  ada.possessions = [{ id: 'p1', name: 'Brass sextant', description: 'Her mother’s.' }]
  ada.arc = [{ id: 'a1', name: 'Denial', note: 'Insists the coast is safe.', at: null }]
  ada.events = [{ id: 'e1', when: 'Year 1', title: 'Born in Port Veyra', note: '' }]
  return [ada, bram]
}
