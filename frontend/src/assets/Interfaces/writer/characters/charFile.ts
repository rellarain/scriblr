import type { CharacterCreate, CharacterDoc, CharacterFigure, CharacterSummary, FigureModel } from '../../../../api/types'
import { normalizeFigure } from './figure/figureState'
import { normalizePortrait } from './portrait/defaults'
import { emptyStory } from './story'

// Characters as a file, to move to another project or keep: JSON with the characters as the project holds them, except that the relationships to characters that are not in
// the file are cut and the tags on the outline (which belong to this project's chapters) are left out. Importing makes new characters (new ids, so nothing already there is
// touched) or, for one the project already has under the same id, replaces it when asked.

export const CHARACTER_FILE_FORMAT = 'scriblr-characters'
export const CHARACTER_FILE_VERSION = 1

// A character with a figure carries a copy of its model (`figureModels`, only the copies the characters in the file use), so the file stands alone: importing it keeps the copy
// in the project (see importCharacters). A file from before figures has none, and the characters in it keep their portraits.
export interface CharacterFile { format: typeof CHARACTER_FILE_FORMAT; version: number; exportedAt: string; characters: CharacterDoc[]; figureModels?: FigureModel[] }

// The keys of the model copies some characters point at (their figures and the figures kept in their story states).
export function figureKeys(docs: CharacterDoc[]): string[] {
  const keys = new Set<string>()
  for (const d of docs) {
    if (d.figure) keys.add(d.figure.model)
    for (const s of d.states) if (s.figure) keys.add(s.figure.model)
  }
  return [...keys]
}

export function buildCharacterFile(all: CharacterDoc[], ids: string[] | null = null, now = new Date(), copies: Iterable<FigureModel> = []): CharacterFile {
  const keep = new Set(ids ?? all.map(c => c.id))
  const characters = all.filter(c => keep.has(c.id)).map(c => ({ ...c, appearances: [], relationships: c.relationships.filter(r => keep.has(r.targetId)) }))
  const used = new Set(figureKeys(characters))
  const figureModels = [...copies].filter((m, i, list) => used.has(m.id) && list.findIndex(x => x.id === m.id) === i)
  return { format: CHARACTER_FILE_FORMAT, version: CHARACTER_FILE_VERSION, exportedAt: now.toISOString(), characters, ...(figureModels.length > 0 ? { figureModels } : {}) }
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
    const doc = { ...emptyStory(), ...(item as unknown as CharacterDoc), portrait: normalizePortrait(item.portrait), figure: normalizeFigure(item.figure), appearances: [] }
    // A figure kept in a story state is read the same way.
    characters.push({ ...doc, states: (Array.isArray(doc.states) ? doc.states : []).map(s => ({ ...s, figure: normalizeFigure((s as { figure?: unknown }).figure) })) })
  }
  if (characters.length === 0) return { ok: false, error: 'None of the characters in this file can be read.' }
  const figureModels = (Array.isArray(raw.figureModels) ? raw.figureModels : []).filter((m): m is FigureModel =>
    isRecord(m) && typeof m.id === 'string' && /^[0-9a-f]{12}$/.test(m.id) && isRecord(m.content) && Array.isArray(m.content.shapes))
  return { ok: true, file: { format: CHARACTER_FILE_FORMAT, version: raw.version, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', characters, ...(figureModels.length > 0 ? { figureModels } : {}) } }
}

export type CharacterChoice = 'both' | 'replace' | 'skip'
export interface CharacterImportRow { doc: CharacterDoc; clash: CharacterSummary | null }
export const importRows = (file: CharacterFile, existing: CharacterSummary[]): CharacterImportRow[] => {
  const taken = new Map(existing.map(c => [c.id, c]))
  return file.characters.map(doc => ({ doc, clash: taken.get(doc.id) ?? null }))
}

// `keepCopy` keeps a model copy of the file in the project and returns the entry (its key is the one the project knows it by); without it figures are left as they are.
export interface CharacterImportApi { create: (body: CharacterCreate) => Promise<CharacterDoc>; put: (doc: CharacterDoc) => Promise<CharacterDoc>; keepCopy?: (copy: FigureModel) => Promise<FigureModel> }
// `note` says what was imported with less than the file had (a figure whose model copy could not be kept is left out, and the character keeps its portrait).
export interface CharacterImportResult { made: string[]; replaced: string[]; skipped: string[]; error?: string; note?: string }

// Bring the characters in: each is made new (its own id) or, where it clashes and `replace` was chosen, written over the one that has its id; one that is skipped is not
// brought, nor are links to it. The relationships between the characters that came in are kept, on their new ids.
export async function importCharacters(file: CharacterFile, choices: Map<string, CharacterChoice>, existing: CharacterSummary[], api: CharacterImportApi): Promise<CharacterImportResult> {
  const rows = importRows(file, existing)
  const choiceOf = (r: CharacterImportRow): CharacterChoice => (r.clash ? choices.get(r.doc.id) ?? 'both' : 'both')
  const taking = rows.filter(r => choiceOf(r) !== 'skip')
  const result: CharacterImportResult = { made: [], replaced: [], skipped: rows.filter(r => choiceOf(r) === 'skip').map(r => r.doc.id) }
  const newId = new Map<string, string>()
  // The model copies the characters use are kept in the project first; a figure follows its copy to the key the project knows it by, or is left out when the copy cannot be kept.
  const kept = new Map<string, string | null>()
  if (api.keepCopy) {
    const wanted = new Set(figureKeys(taking.map(r => r.doc)))
    for (const copy of file.figureModels ?? []) {
      if (!wanted.has(copy.id)) continue
      try { kept.set(copy.id, (await api.keepCopy(copy)).id) } catch { kept.set(copy.id, null) }
    }
  }
  const dropped = new Set<string>()
  const follow = (f: CharacterFigure | null | undefined, characterId: string): CharacterFigure | null => {
    if (!f) return null
    if (!kept.has(f.model)) return f
    const key = kept.get(f.model)
    if (key) return { ...f, model: key }
    dropped.add(characterId)
    return null
  }
  try {
    for (const r of taking) {
      if (choiceOf(r) === 'replace') { newId.set(r.doc.id, r.doc.id); continue }
      const made = await api.create({ name: r.doc.name, portrait: r.doc.portrait, figure: follow(r.doc.figure, r.doc.id), look: r.doc.look })
      newId.set(r.doc.id, made.id)
    }
    for (const r of taking) {
      const id = newId.get(r.doc.id)!
      const relationships = r.doc.relationships.filter(x => newId.has(x.targetId)).map(x => ({ ...x, targetId: newId.get(x.targetId)! }))
      await api.put({ ...r.doc, id, relationships, appearances: [], figure: follow(r.doc.figure, r.doc.id), states: r.doc.states.map(s => ({ ...s, figure: follow(s.figure, r.doc.id) })) })
      if (choiceOf(r) === 'replace') result.replaced.push(id)
      else result.made.push(id)
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'The characters could not be imported.'
  }
  if (dropped.size > 0) result.note = `The figure${dropped.size === 1 ? '' : 's'} of ${dropped.size} character${dropped.size === 1 ? '' : 's'} could not be brought in (the model is too big, or the project holds as many models as it may); the portrait is kept instead.`
  return result
}

export const characterFileName = (name: string): string => `${name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'cast'}.scriblr-characters.json`
