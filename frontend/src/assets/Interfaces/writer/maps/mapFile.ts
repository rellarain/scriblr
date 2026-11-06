import type { MapCreate, MapDoc, MapSummary } from '../../../../api/types'
import { descendantIds } from './mapModel'

// A map as a file: a map and the maps inside it, with their versions over the story and their journeys, to move to another project or keep. The file is JSON; its maps
// are the maps as the project holds them, except that the links that point outside the file are cut (a place that opened a map that is not in the file opens nothing).
// Importing makes new maps (new ids, so nothing already there is touched) or, for a map the project already has under the same id, replaces it when asked. A version
// comes with its map; a journey is of a character, so one whose character the project does not have is left out.

export const MAP_FILE_FORMAT = 'scriblr-maps'
// Version 2 holds the versions of the maps (a map with `versionOf`); a version 1 file has none.
export const MAP_FILE_VERSION = 2

export interface MapFile {
  format: typeof MAP_FILE_FORMAT
  version: number
  exportedAt: string
  // The map that was exported; the rest are inside it.
  rootId: string
  maps: MapDoc[]
}

// The file for a map and everything inside it. `all` are the project's maps (whole); the ones inside the map are found by their parents.
export function buildMapFile(rootId: string, all: MapDoc[], now = new Date()): MapFile | null {
  const root = all.find(m => m.id === rootId)
  if (!root) return null
  const inside = descendantIds(all, rootId)
  const keep = new Set([rootId, ...inside])
  // The versions of the maps that are kept come too (they are not in the tree, so they are not found by it).
  const maps = all.filter(m => keep.has(m.id) || (m.versionOf != null && keep.has(m.versionOf))).map(m => ({
    ...m,
    parentId: m.id === rootId || m.versionOf ? null : m.parentId,
    symbols: m.symbols.map(s => ({ ...s, mapIds: s.mapIds.filter(id => keep.has(id)) })),
  }))
  return { format: MAP_FILE_FORMAT, version: MAP_FILE_VERSION, exportedAt: now.toISOString(), rootId, maps }
}

export type ParsedFile = { ok: true; file: MapFile } | { ok: false; error: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Read a file's text: it must be a Scriblr map file of a version this app knows, with at least one map that has an id, a size and its cells.
export function parseMapFile(text: string): ParsedFile {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, error: 'This is not a map file: it is not readable JSON.' } }
  if (!isRecord(raw) || raw.format !== MAP_FILE_FORMAT) return { ok: false, error: 'This is not a Scriblr map file.' }
  if (typeof raw.version !== 'number' || raw.version > MAP_FILE_VERSION) return { ok: false, error: 'This map file is from a newer version of Scriblr.' }
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return { ok: false, error: 'This map file has no maps in it.' }
  const maps: MapDoc[] = []
  const seen = new Set<string>()
  for (const item of raw.maps) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '' || seen.has(item.id) || typeof item.width !== 'number' || typeof item.height !== 'number' || !Array.isArray(item.cells)) continue
    seen.add(item.id)
    maps.push(item as unknown as MapDoc)
  }
  if (maps.length === 0) return { ok: false, error: 'None of the maps in this file can be read.' }
  const rootId = typeof raw.rootId === 'string' && seen.has(raw.rootId) ? raw.rootId : maps[0].id
  return { ok: true, file: { format: MAP_FILE_FORMAT, version: raw.version, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '', rootId, maps } }
}

// ---- importing ----

export type Choice = 'both' | 'replace' | 'skip'
export interface ImportRow { map: MapDoc; depth: number; clash: MapSummary | null }

// The maps of a file in order (each map after the one it is inside), and, for each, the map of the project that has the same id (a clash).
export function importRows(file: MapFile, existing: MapSummary[]): ImportRow[] {
  const byId = new Map(file.maps.map(m => [m.id, m]))
  const taken = new Map(existing.map(m => [m.id, m]))
  // A version is brought with its map, so it is not a row of its own.
  const rows: ImportRow[] = []
  const done = new Set<string>()
  const visit = (m: MapDoc, depth: number) => {
    if (done.has(m.id)) return
    done.add(m.id)
    rows.push({ map: m, depth, clash: taken.get(m.id) ?? null })
    for (const child of file.maps) if (child.parentId === m.id && !child.versionOf) visit(child, depth + 1)
  }
  const root = byId.get(file.rootId) ?? file.maps[0]
  visit(root, 0)
  // Anything not reached from the root (its parent was not in the file) comes after, as a map of its own.
  for (const m of file.maps) if (!m.versionOf) visit(m, 0)
  return rows
}

export interface ImportApi {
  create: (body: MapCreate) => Promise<MapDoc>
  put: (doc: MapDoc) => Promise<MapDoc>
  // Make a version of a map (a new map that is not in the tree); without it the versions in a file are left out.
  createVersion?: (mapId: string, body: { title?: string; appliesFrom?: string | null }) => Promise<MapDoc>
  // The ids of the characters the project has: a journey of any other character is left out (without it, all journeys stay).
  characterIds?: Set<string>
}

export interface ImportResult { made: string[]; replaced: string[]; skipped: string[]; rootId: string | null; versions?: number; error?: string }

// Bring the maps in. Each is made new (its own id) or, where it clashes and `replace` was chosen, written over the one that has its id; a map that is skipped
// is not brought, nor are its links (a place that opened it opens nothing). The root goes inside `parentId` (null = a top-level map).
export async function importMaps(file: MapFile, choices: Map<string, Choice>, existing: MapSummary[], parentId: string | null, api: ImportApi): Promise<ImportResult> {
  const rows = importRows(file, existing)
  const choiceOf = (row: ImportRow): Choice => (row.clash ? choices.get(row.map.id) ?? 'both' : 'both')
  const taking = rows.filter(r => choiceOf(r) !== 'skip')
  const result: ImportResult = { made: [], replaced: [], skipped: rows.filter(r => choiceOf(r) === 'skip').map(r => r.map.id), rootId: null }
  // The id each imported map has in the project.
  const newId = new Map<string, string>()
  try {
    for (const row of taking) {
      if (choiceOf(row) === 'replace') { newId.set(row.map.id, row.map.id); continue }
      const made = await api.create({ title: row.map.title, kind: row.map.kind, width: row.map.width, height: row.map.height })
      newId.set(row.map.id, made.id)
    }
    const root = file.maps.find(m => m.id === file.rootId) ?? file.maps[0]
    for (const row of taking) {
      const id = newId.get(row.map.id)!
      const own = row.map
      const parent = own.id === root.id ? parentId : own.parentId !== null && newId.has(own.parentId) ? newId.get(own.parentId)! : parentId
      const doc: MapDoc = {
        ...own, id, parentId: own.id === root.id && choiceOf(row) === 'replace' ? row.clash!.parentId : parent,
        symbols: own.symbols.map(s => ({ ...s, mapIds: s.mapIds.filter(m => newId.has(m)).map(m => newId.get(m)!) })),
        journeys: keepJourneys(own.journeys, api.characterIds),
      }
      await api.put(doc)
      if (choiceOf(row) === 'replace') result.replaced.push(id)
      else result.made.push(id)
    }
    // The versions of the maps that came: each is made again as a version of its map here (or, when its map was replaced and the project has a version of the same id, written over it).
    if (api.createVersion) {
      const takenIds = new Map(existing.map(m => [m.id, m]))
      let count = 0
      for (const version of file.maps.filter(m => m.versionOf && newId.has(m.versionOf))) {
        const base = newId.get(version.versionOf!)!
        const overwrite = choiceOf(rows.find(r => r.map.id === version.versionOf)!) === 'replace' && takenIds.get(version.id)?.versionOf === base
        const id = overwrite ? version.id : (await api.createVersion(base, { title: version.title, appliesFrom: version.appliesFrom ?? null })).id
        await api.put({
          ...version, id, parentId: null, versionOf: base,
          symbols: version.symbols.map(s => ({ ...s, mapIds: s.mapIds.filter(m => newId.has(m)).map(m => newId.get(m)!) })),
          journeys: keepJourneys(version.journeys, api.characterIds),
        })
        count += 1
      }
      result.versions = count
    }
    result.rootId = newId.get(root.id) ?? [...newId.values()][0] ?? null
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'The maps could not be imported.'
  }
  return result
}

// The journeys of a map for a project that has these characters (all of them when the set is not given).
function keepJourneys(journeys: MapDoc['journeys'], known?: Set<string>): MapDoc['journeys'] {
  return known && journeys ? journeys.filter(j => known.has(j.characterId)) : journeys
}

// The name of the file for a map: its title made safe for a file name.
export function mapFileName(title: string): string {
  const safe = title.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
  return `${safe || 'map'}.scriblr-map.json`
}
