// Writes the default map shapes that come with the app (src/assets/Interfaces/writer/maps/mapShapeSeed.ts) to backend/app/seed/map_shapes.json: the
// list a new install publishes as the admin's first version, and the markers the server turns old symbols into. Run with `npm run map-shapes`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MapLibraryShape } from '../../src/api/types'
import { SEED_VERSION, starterShapes } from '../../src/assets/Interfaces/writer/maps/mapShapeSeed'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, '../../../backend/app/seed/map_shapes.json')
const shapes = starterShapes()
// The earlier forms of the starter shapes this build changes (from the file as it was, with the ones it kept already): the server brings a shape an admin
// left as an earlier build gave it up to date (map_shapes_store.load_catalog).
type SeedFile = { seedVersion: number; shapes: MapLibraryShape[]; replaces?: Record<string, MapLibraryShape[]> }
const before: SeedFile | null = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf-8')) as SeedFile) : null
const replaces: Record<string, MapLibraryShape[]> = { ...(before?.replaces ?? {}) }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
for (const s of shapes) {
  const old = before?.shapes.find(o => o.id === s.id)
  if (old && !same(old, s) && !(replaces[s.id] ?? []).some(o => same(o, old))) replaces[s.id] = [...(replaces[s.id] ?? []), old]
}
const kept = Object.keys(replaces)
writeFileSync(out, JSON.stringify({ seedVersion: SEED_VERSION, shapes, ...(kept.length > 0 ? { replaces } : {}) }, null, 1) + '\n', 'utf-8')
console.log(`Wrote ${shapes.length} shapes to ${out}${kept.length > 0 ? ` (earlier forms kept of ${kept.join(', ')})` : ''}`)
