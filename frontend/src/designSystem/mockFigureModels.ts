import type { FigureModel, FigureModelCreate, ModelContent, PublishedModelOut } from '../api/types'
import { normalizeContent } from '../assets/Interfaces/admin/characters/modelContent'
import type { MockAnswer } from './mockPresets'

// A pretend figure models API (`/api/projects/{id}/figure-models`), shared by the design system's previews (mockBackend.ts) and the tests (test/charactersBackend.ts): the
// copies of published models a project keeps for its characters' figures. A copy is kept once under a key that is a hash of its content, a model that is not published
// cannot be copied, and a copy over the size a character may keep is refused, as the server does.

const ok = (body: unknown, status = 200): MockAnswer => ({ status, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })
export const MOCK_COPY_MAX_BYTES = 1536 * 1024
export const MOCK_MAX_COPIES = 40

// Twelve hex digits of a hash of the normalised content (the server's own hash differs; only equal content having an equal key matters here).
export function contentKey(content: ModelContent): string {
  const text = JSON.stringify(normalizeContent(content))
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0
    b = Math.imul(b + text.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`.slice(0, 12)
}

export function copyOf(content: ModelContent, modelId = 'adult', version = 1, name = '', publishedAt: string | null = '2026-01-10T09:00:00.000Z'): FigureModel {
  const c = normalizeContent(structuredClone(content))
  return { id: contentKey(c), modelId, version, name: name || c.name, publishedAt, content: c }
}

export function createMockFigureModels(published: () => PublishedModelOut[] = () => [], initial: FigureModel[] = []) {
  const copies = new Map<string, FigureModel>(initial.map(m => [m.id, m]))

  function route(method: string, rest: string[], body: unknown): MockAnswer {
    if (rest.length !== 0) return fail(404, 'Not found')
    if (method === 'GET') return ok([...copies.values()])
    if (method !== 'POST') return fail(405, 'Method not allowed')
    const b = (body ?? {}) as FigureModelCreate
    let made: FigureModel
    if (b.content) made = copyOf(b.content, b.modelId, b.version ?? 0, b.name ?? '', null)
    else {
      const found = published().find(m => m.id === b.modelId)
      if (!found) return fail(404, `no published model '${b.modelId}'`)
      made = copyOf(found.content, found.id, found.version, found.content.name, found.publishedAt)
    }
    if (JSON.stringify(made.content).length > MOCK_COPY_MAX_BYTES) return fail(422, `a copy of a model may be at most ${MOCK_COPY_MAX_BYTES / 1024} KB`)
    const held = copies.get(made.id)
    if (held) return ok(held, 201)
    if (copies.size >= MOCK_MAX_COPIES) return fail(422, `a project holds at most ${MOCK_MAX_COPIES} copies of models`)
    copies.set(made.id, made)
    return ok(made, 201)
  }

  return { route, get copies() { return copies } }
}
