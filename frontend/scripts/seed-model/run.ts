// Builds the seed model, writes it (backend/app/seed/basic_model.json) and a preview page, and compares the body with the mockup's own solve at rest.
// Usage: npx vite-node scripts/seed-model/run.ts [preview-dir] [seed-file]
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyBytes } from '../../src/assets/Interfaces/admin/characters/engine/limits'
import { defaultValues, solve } from '../../src/assets/Interfaces/admin/characters/engine/rig'
import { publishFaults } from '../../src/assets/Interfaces/admin/characters/modelContent'
import { buildSeed } from './build'
import { loadExact, loadMockupModel } from './exact'
import { optionSheet, writePreview } from './preview'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(tmpdir(), 'scriblr-seed-preview')
const seedFile = process.argv[3] ?? resolve(here, '../../../backend/app/seed/basic_model.json')
const { content, report } = buildSeed()
console.log(report.map(r => `${r.part}: ${r.channels} shapes, ${r.pairs}, ${r.points} points`).join('\n'))
console.log(`shapes ${content.shapes.length}, objects ${content.objects.length}, size ${(copyBytes(content) / 1024).toFixed(0)} KB`)
console.log('faults', publishFaults(content))

// the body against the mockup's own solve at rest: the box of every shape the two share
const mock = loadMockupModel()
const M = (globalThis as any).Mannequin
const mres = M.solve(mock, M.defaultCfg(mock), 'front')
const ares = solve(content, defaultValues(content), 'front')
let worst = 0, worstId = ''
for (const s of content.shapes) {
  if (/^(ear|hd|brow|eye|nose|mouth)_/.test(s.id) || s.id === 'skull') continue
  const a = ares.shapes[s.id]?.box, m = mres.shapes[s.id]?.box
  if (!a || !m) continue
  const d = Math.max(Math.abs(a.x - m.x), Math.abs(a.y - m.y), Math.abs(a.w - m.w), Math.abs(a.h - m.h))
  if (d > 0.5) console.log(`  box differs by ${d.toFixed(2)}: ${s.id}`)
  if (d > worst) { worst = d; worstId = s.id }
}
console.log(`worst box difference of the body from the mockup ${worst.toFixed(2)} at ${worstId}`)

mkdirSync(dirname(seedFile), { recursive: true })
writeFileSync(seedFile, JSON.stringify(content))
console.log(`wrote ${seedFile}
preview: ${out}/index.html`)

const data = loadExact()
const sheet = optionSheet(content, [
  { object: 'skull', axis: 'headShape', key: 'headShape', options: data.options.headShape },
  { object: 'ears', axis: 'ears', key: 'ears', options: data.options.ears },
  { object: 'eyes', axis: 'shape', key: 'eyes', options: data.options.eyes },
  { object: 'brows', axis: 'shape', key: 'brows', options: data.options.brows },
  { object: 'nose', axis: 'shape', key: 'nose', options: data.options.nose },
  { object: 'mouth', axis: 'shape', key: 'mouth', options: data.options.mouth },
])
const expressions = content.presets!.filter(p => p.kind === 'Expression').map(p => ({ label: p.name, figure: { values: p.values }, crop: 'head' }))
const ages = content.presets!.filter(p => p.kind === 'Age').flatMap(p => [{ label: p.name + ' (bust)', figure: { values: p.values }, crop: 'bust' }, { label: p.name, figure: { values: p.values }, crop: 'figure' }])
const builds = content.presets!.filter(p => p.kind === 'Build').map(p => ({ label: p.name, figure: { values: p.values }, crop: 'figure' }))
const ends = ['eyeSize', 'eyeSpacing', 'eyeTilt', 'eyeOpen', 'browHeight', 'browAngle', 'noseSize', 'mouthSize', 'mouthCurve', 'earSize', 'headTilt'].flatMap(id => {
  const r = content.ranges.find(x => x.id === id)!
  return [{ label: `${r.name} min`, figure: { values: { [id]: r.min } }, crop: 'head' }, { label: `${r.name} max`, figure: { values: { [id]: r.max } }, crop: 'head' }]
})
writePreview(`${out}/index.html`, 'Seed model', content, [...ends, ...expressions, ...ages, ...builds], sheet)
