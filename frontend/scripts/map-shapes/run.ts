// Writes the default map shapes that come with the app (src/assets/Interfaces/writer/maps/mapShapeSeed.ts) to backend/app/seed/map_shapes.json: the
// list a new install publishes as the admin's first version, and the markers the server turns old symbols into. Run with `npm run map-shapes`.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEED_VERSION, starterShapes } from '../../src/assets/Interfaces/writer/maps/mapShapeSeed'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.resolve(here, '../../../backend/app/seed/map_shapes.json')
const shapes = starterShapes()
writeFileSync(out, JSON.stringify({ seedVersion: SEED_VERSION, shapes }, null, 1) + '\n', 'utf-8')
console.log(`Wrote ${shapes.length} shapes to ${out}`)
