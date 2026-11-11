// Builds the seed model, writes it (backend/app/seed/basic_model.json) and a preview page, and compares the body with the mockup's own solve at rest.
// Usage: npx vite-node scripts/seed-model/run.ts [preview-dir] [seed-file]
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CharacterFigure } from '../../src/api/types'
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
// the clothes have the mockup's ids too, and are not the body
const CLOTHES = new Set(['shirt', 'neckHole', 'collar', 'sleeveUpL', 'sleeveUpR', 'sleeveForeL', 'sleeveForeR', 'trouserHip', 'trouserL', 'trouserR', 'shoeL', 'shoeR'])
const M = (globalThis as any).Mannequin
const mres = M.solve(mock, M.defaultCfg(mock), 'front')
const ares = solve(content, defaultValues(content), 'front')
let worst = 0, worstId = ''
for (const s of content.shapes) {
  if (/^(ear|hd|brow|eye|nose|mouth|hr|hs|bd|mo)_/.test(s.id) || CLOTHES.has(s.id) || s.id === 'skull') continue
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
const hairs = content.presets!.filter(p => p.kind === 'Hair style').map(p => ({ label: p.name, figure: { values: p.values, forms: p.forms ?? {}, hidden: p.hidden }, crop: 'bust' }))
const beards = content.presets!.filter(p => p.kind === 'Facial hair').map(p => ({ label: p.name, figure: { values: p.values, forms: p.forms ?? {}, hidden: p.hidden }, crop: 'head' }))
// every form of the fantasy parts and the necklaces, on the default adult
const fantasy = [['ears', 'fantasy'], ['eyes', 'style'], ['extraEyes', 'count'], ['horns', 'style'], ['crown', 'style'], ['laurel', 'style'], ['flowers', 'style'], ['hood', 'style'], ['necklace', 'style']].flatMap(([oid, aid]) => {
  const axis = content.objects.find(o => o.id === oid)!.axes!.find(a => a.id === aid)!
  return axis.options.filter(f => f.id !== axis.initial).map(f => ({ label: `${oid}: ${f.name}`, figure: { forms: { [`${oid}.${aid}`]: f.id } }, crop: 'bust' }))
})
const tops = content.presets!.filter(p => p.kind === 'Top').map(p => ({ label: `Top: ${p.name}`, figure: { values: p.values, forms: p.forms ?? {}, hidden: p.hidden }, crop: 'bust' }))
const outfits: Array<{ label: string; figure: Partial<CharacterFigure>; crop: string }> = [
  ...content.presets!.filter(p => p.kind === 'Outfit').map(p => ({ label: `Outfit: ${p.name}`, figure: { values: p.values, forms: p.forms ?? {}, hidden: p.hidden }, crop: 'figure' })),
  { label: 'Skirt midi', figure: { forms: { 'skirt.length': 'midi' }, hidden: ['trousers'] }, crop: 'figure' },
  { label: 'Skirt maxi', figure: { forms: { 'skirt.length': 'maxi' }, hidden: ['trousers'] }, crop: 'figure' },
  { label: 'Coat buttoned', figure: { forms: { 'coat.style': 'shut', 'sleeves.length': 'long' } }, crop: 'figure' },
  { label: 'Jacket buttoned arms up', figure: { forms: { 'jacket.style': 'shut', 'sleeves.length': 'long' }, values: { shoulder: 50 } }, crop: 'figure' },
  { label: 'Outfit as it comes', figure: {}, crop: 'figure' },
  { label: 'Long sleeves', figure: { forms: { 'sleeves.length': 'long' } }, crop: 'figure' },
  { label: 'Sleeveless', figure: { forms: { 'sleeves.length': 'none' } }, crop: 'figure' },
  { label: 'Top loose 200%', figure: { values: { looseTop: 200, looseBottom: 200 } }, crop: 'figure' },
  { label: 'Top snug 0%', figure: { values: { looseTop: 0, looseBottom: 0 } }, crop: 'figure' },
  { label: 'Arms raised, legs apart', figure: { values: { shoulder: 60, legSpread: 25 } }, crop: 'figure' },
]
// every held item, in the left hand held up (the bust) and at the side (the whole figure), and a few in the right
const poseOf = (id: string): Record<string, number> => content.presets!.find(p => p.id === id)!.values
const itemOptions = content.objects.find(o => o.id === 'itemL')!.axes!.find(a => a.id === 'item')!.options.filter(f => f.id !== 'none')
const heldUp = itemOptions.map(f => ({ label: `${f.name}, left hand up`, figure: { values: poseOf('pose_left_up'), forms: { 'itemL.item': f.id } }, crop: 'bust' }))
const heldDown = itemOptions.map(f => ({ label: `${f.name}, at the side`, figure: { forms: { 'itemL.item': f.id } }, crop: 'figure' }))
const heldRight = ['staff', 'book', 'lantern', 'wand'].map(id => ({ label: `${id}, right hand up`, figure: { values: poseOf('pose_right_up'), forms: { 'itemR.item': id } }, crop: 'bust' }))
const heldBoth = [{ label: 'Both hands up, a staff and a lantern', figure: { values: poseOf('pose_both_up'), forms: { 'itemL.item': 'staff', 'itemR.item': 'lantern' } }, crop: 'figure' }]
const heads = ['oval', 'square', 'narrow', 'wide', 'pointed'].map(h => ({ label: `Short hair, ${h} head`, figure: { forms: { 'skull.headShape': h } }, crop: 'bust' }))
const ends = ['eyeSize', 'eyeSpacing', 'eyeTilt', 'eyeOpen', 'browHeight', 'browAngle', 'noseSize', 'mouthSize', 'mouthCurve', 'earSize', 'headTilt'].flatMap(id => {
  const r = content.ranges.find(x => x.id === id)!
  return [{ label: `${r.name} min`, figure: { values: { [id]: r.min } }, crop: 'head' }, { label: `${r.name} max`, figure: { values: { [id]: r.max } }, crop: 'head' }]
})
writePreview(`${out}/index.html`, 'Seed model', content, [...heldUp, ...heldRight, ...heldBoth, ...heldDown, ...outfits, ...tops, ...hairs, ...beards, ...fantasy, ...heads, ...ends, ...expressions, ...ages, ...builds], sheet)
