// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../../api/types'
import { seededRng } from './previews'
import { defaultValues, solve, type Solved, type Values } from './rig'

// The golden drawing of the basic model: what the solver makes of it at rest, in the back view, with every slider at either end and at seeded random values, written down as one
// digest per case. A change to the solver that leaves a model without skin weights alone (phase O1, O2) must not change any of these; the new body of phase O4 replaces the seed,
// and these are written again then (vitest -u).
const seed: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))

// FNV-1a over the text, as eight hex digits.
function digest(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}
const drawing = (s: Solved): string => digest(s.order.join(',') + '|' + Object.keys(s.shapes).sort().map(id => `${id}:${s.shapes[id].d}:${s.shapes[id].visible ? 1 : 0}`).join('\n') + '|' + JSON.stringify(s.pivots))

describe('the basic model draws as it did before skin weights', () => {
  const at = (pick: (lo: number, rest: number, hi: number) => number): Values => Object.fromEntries(seed.ranges.map(r => [r.id, pick(r.min, r.rest, r.max)]))
  const cases: Array<[string, () => Solved]> = [
    ['at rest, from the front', () => solve(seed, defaultValues(seed), 'front')],
    ['at rest, from the back', () => solve(seed, defaultValues(seed), 'back')],
    ['every slider at its least', () => solve(seed, at(lo => lo), 'front')],
    ['every slider at its most', () => solve(seed, at((_, __, hi) => hi), 'front')],
    ['seeded random sliders', () => { const rng = seededRng(7); return solve(seed, at((lo, _, hi) => lo + (hi - lo) * rng()), 'front') }],
    ['seeded random sliders, from the back', () => { const rng = seededRng(11); return solve(seed, at((lo, _, hi) => lo + (hi - lo) * rng()), 'back') }],
  ]
  for (const [name, run] of cases) it(name, () => expect(drawing(run())).toMatchSnapshot())
})
