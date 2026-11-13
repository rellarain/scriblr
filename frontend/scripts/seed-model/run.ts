// Builds the seed model, writes it (backend/app/seed/basic_model.json) and a preview page, and reports the body against the canon (phase O4b: how many heads tall it stands,
// and where its landmarks are against where a figure seven and a half heads tall has them).
// Usage: npx vite-node scripts/seed-model/run.ts [preview-dir] [seed-file]
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CharacterFigure } from '../../src/api/types'
import { copyBytes } from '../../src/assets/Interfaces/admin/characters/engine/limits'
import { headGuide } from '../../src/assets/Interfaces/admin/characters/engine/guides'
import { defaultValues, solve } from '../../src/assets/Interfaces/admin/characters/engine/rig'
import { LANDMARKS } from './body'
import { publishFaults } from '../../src/assets/Interfaces/admin/characters/modelContent'
import { buildSeed } from './build'
import { loadExact } from './exact'
import { optionSheet, writePreview } from './preview'

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ?? join(tmpdir(), 'scriblr-seed-preview')
const seedFile = process.argv[3] ?? resolve(here, '../../../backend/app/seed/basic_model.json')
const { content, report } = buildSeed()
console.log(report.map(r => `${r.part}: ${r.channels} shapes, ${r.pairs}, ${r.points} points`).join('\n'))
console.log(`shapes ${content.shapes.length}, objects ${content.objects.length}, size ${(copyBytes(content) / 1024).toFixed(0)} KB`)
console.log('faults', publishFaults(content))

// the body against the canon: heads from the crown, and each landmark as drawn against where it should be
const rest = solve(content, defaultValues(content), 'front')
const guide = headGuide(content, rest)
console.log(`the figure stands ${guide?.heads ?? '?'} heads tall from the crown (a head is ${guide?.unit.toFixed(2) ?? '?'} units)`)
const box = (id: string) => rest.shapes[id].box
const drawn: Record<string, number> = {
  chin: rest.pivots.head[1], elbow: rest.pivots.foreL[1], wrist: rest.pivots.handL[1], knees: rest.pivots.shinL[1], ankles: rest.pivots.footL[1],
  crotch: Math.max(...rest.shapes.pelvis.pre.filter(q => Math.abs(q.x - 100) < 0.5).map(q => q.y)), fingertips: box('handL').y + box('handL').h, soles: box('instepL').y + box('instepL').h,
}
for (const [name, want] of Object.entries(LANDMARKS)) {
  if (drawn[name] == null) continue
  const off = drawn[name] - want
  console.log(`  ${name.padEnd(11)} ${drawn[name].toFixed(1).padStart(6)} (canon ${want.toFixed(1)})${Math.abs(off) > 2 ? `  off by ${off.toFixed(1)}` : ''}`)
}

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
