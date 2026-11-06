import type { ItemCreate, ItemDoc, ItemSummary } from '../api/types'
import { ITEM_KINDS } from '../api/types'
import type { MockAnswer } from './mockPresets'

// A pretend Items API (`/api/projects/{id}/items`), shared by the design system previews (mockBackend.ts) and the tests (test/itemsBackend.ts): the library lives in memory
// and answers the way the server does (a kind that is not known is "other", a blank name is put back, an item that is not there is a 404).

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
const AT = '2026-11-02T12:00:00.000Z'

export function itemSummaryOf(i: ItemDoc): ItemSummary {
  return { id: i.id, name: i.name, kind: i.kind, order: i.order, updatedAt: i.updatedAt }
}

export function newItem(id: string, body: ItemCreate, order: number): ItemDoc {
  const kind = (ITEM_KINDS as readonly string[]).includes(body.kind ?? '') ? body.kind! : 'other'
  return { schemaVersion: 2, id, name: body.name?.trim() || 'Unnamed item', order, kind, description: '', notes: '', color: '', holdings: [], updatedAt: AT }
}

export function createMockItems(initial: ItemDoc[] = []) {
  const items = new Map<string, ItemDoc>(initial.map(i => [i.id, i]))
  let next = initial.length + 1
  let saves = 1
  const sorted = () => [...items.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))

  function route(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length === 0) {
      if (method === 'GET') return ok(sorted().map(itemSummaryOf))
      if (method === 'POST') {
        const doc = newItem(`itm_mock${next++}`, (body ?? {}) as ItemCreate, items.size)
        items.set(doc.id, doc)
        return ok(doc, 201)
      }
      return fail(405, 'Method not allowed')
    }
    if (rest[0] === 'all' && method === 'GET') return ok(sorted())
    const id = rest[0]
    const found = items.get(id)
    if (method === 'GET') return found ? ok(found) : fail(404, 'Item not found')
    if (method === 'PUT') {
      if (!found) return fail(404, 'Item not found')
      const b = body as ItemDoc
      if (b.id !== id) return fail(422, 'The id does not match.')
      const saved: ItemDoc = { ...b, name: b.name.trim() || 'Unnamed item', updatedAt: `2026-11-02T12:${String(Math.floor(saves / 60) % 60).padStart(2, '0')}:${String(saves++ % 60).padStart(2, '0')}.000Z` }
      items.set(id, saved)
      return ok(saved)
    }
    if (method === 'DELETE') {
      if (!found) return fail(404, 'Item not found')
      items.delete(id)
      return { status: 204, body: undefined }
    }
    return fail(405, 'Method not allowed')
  }

  return { route, get items() { return items } }
}

// The library a preview opens with: a sword that changes hands and a letter nobody has yet (it goes with the cast of mockCharacters.ts).
export function seedItems(): ItemDoc[] {
  const sword = newItem('itm_sunblade', { name: 'The Sunblade', kind: 'weapon' }, 0)
  sword.description = 'A long blade forged at dawn; it is warm to the touch.'
  sword.color = '#c9a227'
  sword.holdings = [{ id: 'h1', holder: '', at: '', note: 'Still in the forge.' }, { id: 'h2', holder: 'char:chr_bram', at: '', note: 'Given to him by his captain.' }]
  const letter = newItem('itm_letter', { name: 'A sealed letter', kind: 'document' }, 1)
  letter.description = 'Addressed to no one. The seal is a heron.'
  return [sword, letter]
}
