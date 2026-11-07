import type { CharacterCreate, CharacterDoc, CharacterSummary } from '../../../../api/types'
import { normalizePortrait } from './portrait/defaults'
import { emptyStory } from './story'

// Characters as a file, to move to another project or keep: JSON with the characters as the project holds them, except that the relationships to characters that are not in
// the file are cut and the tags on the outline (which belong to this project's chapters) are left out. Importing makes new characters (new ids, so nothing already there is
// touched) or, for one the project already has under the same id, replaces it when asked.

export const CHARACTER_FILE_FORMAT = 'scriblr-characters'
export const CHARACTER_FILE_VERSION = 1

export interface CharacterFile { format: typeof CHARACTER_FILE_FORMAT; version: number; exportedAt: string; characters: CharacterDoc[] }

export function buildCharacterFile(all: CharacterDoc[], ids: string[] | null = null, now = new Date()): CharacterFile {
  const keep = new Set(ids ?? all.map(c => c.id))
  const characters = all.filter(c => keep.has(c.id)).map(c => ({ ...c, appearances: [], relationships: c.relationships.filter(r => keep.has(r.targetId)) }))
  return { format: CHARACTER_FILE_FORMAT, version: CHARACTER_FILE_VERSION, exportedAt: now.toISOString(), characters }
}

export type ParsedCharacterFile = { ok: true; file: CharacterFile } | { ok: false; error: string }
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// A file's text: it must be a Scriblr character file of a version this app knows, with at least one character that has an id and a name (a portrait is repaired; a file from before portraits gets the default one, and keeps the old look as it was).
export function parseCharacterFile(text: string): ParsedCharacterFile {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'This is not a character file: it is not readable JSON.' } }
  if (!isRecord(raw) || raw.format !== CHARACTER_FILE_FORMAT) return { ok: false, error: 'This is not a Scriblr character file.' }
  if (typeof raw.version !== 'number' || raw.version > CHARACTER_FILE_VERSION) return { ok: false, error: 'This character file is from a newer version of Scriblr.' }
  if (!Array.isArray(raw.characters) || raw.characters.length === 0) return { ok: false, error: 'This character file has no characters in it.' }
  const characters: CharacterDoc[] = []
  const seen = new Set<string>()
  for (const item of raw.characters) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '' || typeof item.name !== 'string' || seen.has(item.id)) continue
    seen.add(item.id)
    characters.push({ ...emptyStory(), ...(item as unknown as CharacterDoc), portrait: normalizePortrait(item.portrait), appearances: [] })
  }
  if (characters.length === 0) return { ok: false, error: 'None of the characters in this file can be read.' }
  return { ok: true, file: { format: CHARACTER_FILE_FORMAT, version: raw.version, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', characters } }
}

export type CharacterChoice = 'both' | 'replace' | 'skip'
export interface CharacterImportRow { doc: CharacterDoc; clash: CharacterSummary | null }
export const importRows = (file: CharacterFile, existing: CharacterSummary[]): CharacterImportRow[] => {
  const taken = new Map(existing.map(c => [c.id, c]))
  return file.characters.map(doc => ({ doc, clash: taken.get(doc.id) ?? null }))
}

export interface CharacterImportApi { create: (body: CharacterCreate) => Promise<CharacterDoc>; put: (doc: CharacterDoc) => Promise<CharacterDoc> }
export interface CharacterImportResult { made: string[]; replaced: string[]; skipped: string[]; error?: string }

// Bring the characters in: each is made new (its own id) or, where it clashes and `replace` was chosen, written over the one that has its id; one that is skipped is not
// brought, nor are links to it. The relationships between the characters that came in are kept, on their new ids.
export async function importCharacters(file: CharacterFile, choices: Map<string, CharacterChoice>, existing: CharacterSummary[], api: CharacterImportApi): Promise<CharacterImportResult> {
  const rows = importRows(file, existing)
  const choiceOf = (r: CharacterImportRow): CharacterChoice => (r.clash ? choices.get(r.doc.id) ?? 'both' : 'both')
  const taking = rows.filter(r => choiceOf(r) !== 'skip')
  const result: CharacterImportResult = { made: [], replaced: [], skipped: rows.filter(r => choiceOf(r) === 'skip').map(r => r.doc.id) }
  const newId = new Map<string, string>()
  try {
    for (const r of taking) {
      if (choiceOf(r) === 'replace') { newId.set(r.doc.id, r.doc.id); continue }
      const made = await api.create({ name: r.doc.name, portrait: r.doc.portrait, look: r.doc.look })
      newId.set(r.doc.id, made.id)
    }
    for (const r of taking) {
      const id = newId.get(r.doc.id)!
      const relationships = r.doc.relationships.filter(x => newId.has(x.targetId)).map(x => ({ ...x, targetId: newId.get(x.targetId)! }))
      await api.put({ ...r.doc, id, relationships, appearances: [] })
      if (choiceOf(r) === 'replace') result.replaced.push(id)
      else result.made.push(id)
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'The characters could not be imported.'
  }
  return result
}

export const characterFileName = (name: string): string => `${name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'cast'}.scriblr-characters.json`
