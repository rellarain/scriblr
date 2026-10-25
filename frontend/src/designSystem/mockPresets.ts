import type { PresetContent, PresetEntry, PublishedPreset, PublishedPresetList } from '../api/types'
import { normalizeContent, publishFaults } from '../assets/Interfaces/admin/plot/presetModel'

// A pretend plot presets API (`/api/presets`), shared by the design system's previews (mockBackend.ts) and the tests (test/presetsBackend.ts):
// the catalog lives in memory and answers the way the server does -- drafts saved in order with their published copies kept, and publish,
// unpublish, discard and restore as whole-preset operations. A route returns its status and JSON body.

export interface MockAnswer { status: number; body: unknown }
const ok = (body: unknown): MockAnswer => ({ status: 200, body })
const fail = (status: number, detail: string): MockAnswer => ({ status, body: { detail } })

const published = (version: number, c: PresetContent, at = '2026-01-12T09:00:00.000Z'): PublishedPreset => ({ version, publishedAt: at, content: normalizeContent(c) })

// An entry that is published (its draft is what was published unless `draft` says otherwise).
export function liveEntry(id: string, c: PresetContent, over: Partial<PresetEntry> = {}): PresetEntry {
  return { id, draft: c, published: published(1, c), history: [], nextVersion: 2, ...over }
}
export const draftEntry = (id: string, c: PresetContent): PresetEntry => ({ id, draft: c, published: null, history: [], nextVersion: 1 })
export const presetContent = (name: string, over: Partial<PresetContent> = {}): PresetContent => ({ name, description: '', keywords: [], fields: [], subcategories: [], ...over })

export function createMockPresets(initial: PresetEntry[]) {
  const state = { entries: structuredClone(initial) }
  const catalog = () => ({ schemaVersion: 2, presets: structuredClone(state.entries) })

  // `parts` is the path after `/presets`: [], ['published'], [id, 'publish'], [id, 'restore', '2'] ...
  function route(method: string, parts: string[], body: unknown): MockAnswer {
    if (parts.length === 0 && method === 'GET') return ok(catalog())
    if (parts.length === 0 && method === 'PUT') {
      const drafts = (body as { presets: Array<{ id: string; draft: PresetContent }> }).presets
      const byId = new Map(state.entries.map(e => [e.id, e]))
      state.entries = drafts.map(p => ({ ...(byId.get(p.id) ?? { id: p.id, published: null, history: [], nextVersion: 1 }), draft: normalizeContent(p.draft) }))
      return ok(catalog())
    }
    if (parts[0] === 'published' && method === 'GET') {
      const list: PublishedPresetList = {
        presets: state.entries.filter(e => e.published).map(e => ({ id: e.id, version: e.published!.version, publishedAt: e.published!.publishedAt, content: e.published!.content })),
      }
      return ok(list)
    }
    if (parts.length >= 2 && method === 'POST') {
      const entry = state.entries.find(e => e.id === parts[0])
      if (!entry) return fail(404, 'no such preset')
      if (parts[1] === 'publish') {
        const faults = publishFaults(entry.draft)
        if (faults.length) return fail(422, faults.map(f => f.message).join(' '))
        if (entry.published) entry.history = [entry.published, ...entry.history].slice(0, 10)
        entry.published = published(entry.nextVersion, entry.draft, new Date().toISOString())
        entry.nextVersion += 1
      } else if (parts[1] === 'unpublish') {
        if (!entry.published) return fail(409, 'The preset is not published.')
        entry.history = [entry.published, ...entry.history].slice(0, 10)
        entry.published = null
      } else if (parts[1] === 'discard') {
        if (!entry.published) return fail(409, 'The preset has no published copy to go back to.')
        entry.draft = structuredClone(entry.published.content)
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

// The catalog the design system's previews open with: the ten built-ins (with the text of a few filled in), one with changes since it was
// published, one never published and one unpublished.
export function previewPresets(): PresetEntry[] {
  const heroes = { id: 'heroes', name: 'Protagonists', description: 'Lorem ipsum dolor sit amet.', keywords: ['lorem'], fields: ['Want', 'Need', 'Flaw'], clusters: [{ id: 'core', name: 'Consectetur', description: '', keywords: [], fields: ['Dynamic'] }] }
  const characters = presetContent('Characters', {
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', keywords: ['cast', 'ipsum'],
    fields: ['Name', 'Role', 'Physical Description', 'Personality', 'Backstory', 'Motivation', 'Internal Conflict', 'Relationships', 'Arc'],
    subcategories: [heroes, { id: 'villains', name: 'Antagonists', description: 'Sed do eiusmod tempor.', keywords: [], fields: ['Goal', 'Methods'], clusters: [] }, { id: 'extra', name: 'Supporting', description: '', keywords: [], fields: [], clusters: [] }],
  })
  const changed = liveEntry('characters', { ...characters, description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' }, { nextVersion: 4 })
  changed.published = published(3, { ...characters, subcategories: characters.subcategories.slice(0, 2), fields: characters.fields.slice(0, 6) })
  changed.history = [published(2, { ...characters, subcategories: [], fields: characters.fields.slice(0, 4) }, '2026-01-05T09:00:00.000Z'), published(1, { ...characters, subcategories: [], fields: ['Name'] }, '2025-12-20T09:00:00.000Z')]
  const off = draftEntry('clues', presetContent('Mystery clues', { description: 'Ut enim ad minim veniam.', fields: ['Clue', 'Found in'] }))
  off.history = [published(1, off.draft, '2026-01-03T09:00:00.000Z')]
  off.nextVersion = 2
  return [
    changed,
    liveEntry('settings', presetContent('Settings', { description: 'Duis aute irure dolor.', fields: ['Location', 'Time Period', 'Atmosphere'] })),
    liveEntry('themes', presetContent('Themes', { fields: ['Statement', 'Symbols and Motifs'] })),
    liveEntry('conflicts', presetContent('Conflicts', { fields: ['Type', 'Stakes', 'Opposing Forces', 'Resolution'] })),
    draftEntry('heist', presetContent('Heist crew', { description: 'Excepteur sint occaecat.', keywords: ['crew'], fields: ['Specialty'] })),
    off,
  ]
}
