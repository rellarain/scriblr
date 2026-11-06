import type { MapCreate, MapDoc, MapSummary } from '../../../../api/types'
import { descendantIds } from './mapModel'

// A map as a file: a map and the maps inside it, to move to another project or keep. The file is JSON; its maps are the maps as the project holds them,
// except that the links that point outside the file are cut (a place that opened a map that is not in the file opens nothing). Importing makes new maps
// (new ids, so nothing already there is touched) or, for a map the project already has under the same id, replaces it when asked.

export const MAP_FILE_FORMAT = 'scriblr-maps'
export const MAP_FILE_VERSION = 1

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
  const maps = all.filter(m => keep.has(m.id)).map(m => ({
    ...m,
    parentId: m.id === rootId ? null : m.parentId,
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
  const rows: ImportRow[] = []
  const done = new Set<string>()
  const visit = (m: MapDoc, depth: number) => {
    if (done.has(m.id)) return
    done.add(m.id)
    rows.push({ map: m, depth, clash: taken.get(m.id) ?? null })
    for (const child of file.maps) if (child.parentId === m.id) visit(child, depth + 1)
  }
  const root = byId.get(file.rootId) ?? file.maps[0]
  visit(root, 0)
  // Anything not reached from the root (its parent was not in the file) comes after, as a map of its own.
  for (const m of file.maps) visit(m, 0)
  return rows
}

export interface ImportApi {
  create: (body: MapCreate) => Promise<MapDoc>
  put: (doc: MapDoc) => Promise<MapDoc>
}

export interface ImportResult { made: string[]; replaced: string[]; skipped: string[]; rootId: string | null; error?: string }

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
      }
      await api.put(doc)
      if (choiceOf(row) === 'replace') result.replaced.push(id)
      else result.made.push(id)
    }
    result.rootId = newId.get(root.id) ?? [...newId.values()][0] ?? null
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'The maps could not be imported.'
  }
  return result
}

// The name of the file for a map: its title made safe for a file name.
export function mapFileName(title: string): string {
  const safe = title.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
  return `${safe || 'map'}.scriblr-map.json`
}
