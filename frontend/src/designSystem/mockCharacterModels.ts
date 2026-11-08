import type { ModelContent, ModelEntry, PublishedModel } from '../api/types'
import { blankContent, normalizeContent, publishFaults } from '../assets/Interfaces/admin/characters/modelContent'
import { newShape } from '../assets/Interfaces/admin/characters/engine/edit'
import { templateBox } from '../assets/Interfaces/admin/characters/engine/templates'

// A pretend character models API (`/api/character-models`), shared by the design system's previews (mockBackend.ts) and the tests
// (test/characterModelsBackend.ts): the catalog lives in memory and answers the way the server does -- drafts saved in order with their
// published copies kept, and publish, unpublish, discard and restore as whole-model operations. A route returns its status and JSON body.

export interface MockAnswer { status: number; body: unknown }
const ok = (body: unknown): MockAnswer => ({ status: 200, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })

const published = (version: number, c: ModelContent, at = '2026-01-12T09:00:00.000Z'): PublishedModel => ({ version, publishedAt: at, content: normalizeContent(c) })

// An entry that is published (its draft is what was published unless `over` says otherwise).
export function liveEntry(id: string, c: ModelContent, over: Partial<ModelEntry> = {}): ModelEntry {
  return { id, draft: c, published: published(1, c), history: [], nextVersion: 2, ...over }
}
export const draftEntry = (id: string, c: ModelContent): ModelEntry => ({ id, draft: c, published: null, history: [], nextVersion: 1 })
export const modelContent = (name: string, over: Partial<ModelContent> = {}): ModelContent => ({ ...blankContent(name), ...over })

export function createMockModels(initial: ModelEntry[]) {
  const state = { entries: structuredClone(initial) }
  const catalog = () => ({ schemaVersion: 1, models: structuredClone(state.entries) })

  // `parts` is the path after `/character-models`: [], ['published'], [id, 'publish'], [id, 'restore', '2'] ...
  function route(method: string, parts: string[], body: unknown): MockAnswer {
    if (parts.length === 0 && method === 'GET') return ok(catalog())
    if (parts.length === 0 && method === 'PUT') {
      const drafts = (body as { models: Array<{ id: string; draft: ModelContent }> }).models
      const byId = new Map(state.entries.map(e => [e.id, e]))
      state.entries = drafts.map(m => ({ ...(byId.get(m.id) ?? { id: m.id, published: null, history: [], nextVersion: 1 }), draft: normalizeContent(m.draft) }))
      return ok(catalog())
    }
    if (parts[0] === 'published' && method === 'GET') {
      return ok({ models: state.entries.filter(e => e.published).map(e => ({ id: e.id, version: e.published!.version, publishedAt: e.published!.publishedAt, content: e.published!.content })) })
    }
    if (parts.length >= 2 && method === 'POST') {
      const entry = state.entries.find(e => e.id === parts[0])
      if (!entry) return fail(404, 'no such model')
      if (parts[1] === 'publish') {
        const faults = publishFaults(entry.draft)
        if (faults.length) return fail(422, faults.join(' '))
        const taken = state.entries.find(o => o.id !== entry.id && o.published && o.published.content.name.toLowerCase() === entry.draft.name.toLowerCase())
        if (taken) return fail(422, `Another model is already published as '${taken.published!.content.name}'. Rename this one first.`)
        if (entry.published) entry.history = [entry.published, ...entry.history].slice(0, 10)
        entry.published = published(entry.nextVersion, entry.draft, new Date().toISOString())
        entry.nextVersion += 1
      } else if (parts[1] === 'unpublish') {
        if (!entry.published) return fail(409, 'The model is not published.')
        entry.history = [entry.published, ...entry.history].slice(0, 10)
        entry.published = null
      } else if (parts[1] === 'discard') {
        entry.draft = entry.published ? structuredClone(entry.published.content) : blankContent(entry.draft.name)
      } else if (parts[1] === 'restore') {
        const found = [entry.published, ...entry.history].find(v => v?.version === Number(parts[2]))
        if (!found) return fail(404, 'no such version')
        entry.draft = structuredClone(found.content)
      } else {
        return fail(404, 'Not found')
      }
      return ok(catalog())
    }
    return fail(404, 'Not found')
  }

  return { state, route }
}

// The catalog the design system's previews open with: a model with a head and a torso drawn from templates (published, with changes since), and
// a blank one that was never published.
export function previewModels(): ModelEntry[] {
  const head = newShape('s_head', 'Head', 'oval', templateBox('oval', 100, 46, 40))
  const neck = newShape('s_neck', 'Neck', 'rounded', templateBox('rounded', 100, 74, 22))
  const chest = newShape('s_chest', 'Chest', 'trapezoid', templateBox('trapezoid', 100, 108, 64))
  const adult = modelContent('Adult (basic)', {
    description: 'Lorem ipsum dolor sit amet.',
    shapes: [head, neck, chest],
    objects: [
      { id: 'o_head', name: 'Head', layer: 'body', shapes: ['s_head'] },
      { id: 'o_neck', name: 'Neck', layer: 'body', shapes: ['s_neck'] },
      { id: 'o_chest', name: 'Chest', layer: 'body', shapes: ['s_chest'] },
    ],
    groups: [
      { id: 'g_head', name: 'Head', parent: null, objects: ['o_head'] },
      { id: 'g_torso', name: 'Torso', parent: null, objects: ['o_neck', 'o_chest'] },
    ],
  })
  const live = liveEntry('adult', { ...adult, description: 'Lorem ipsum dolor sit amet, consectetur.' }, { nextVersion: 3 })
  live.published = published(2, { ...adult, shapes: adult.shapes.slice(0, 2), objects: adult.objects.slice(0, 2), groups: [{ id: 'g_head', name: 'Head', parent: null, objects: ['o_head', 'o_neck'] }] })
  live.history = [published(1, { ...adult, shapes: adult.shapes.slice(0, 1), objects: adult.objects.slice(0, 1), groups: [{ id: 'g_head', name: 'Head', parent: null, objects: ['o_head'] }] }, '2026-01-05T09:00:00.000Z')]
  return [live, draftEntry('stylised', modelContent('Stylised (draft)', { description: 'Ut enim ad minim veniam.' }))]
}
