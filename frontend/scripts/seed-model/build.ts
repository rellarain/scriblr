// Builds the seed model ("Adult (basic)") as model content: the face from the exact shapes of the old portrait engine, the body from the mockup, a rig, sliders, presets,
// colour slots and frames. Run by run.ts, which writes backend/app/seed/basic-model.json.
import type { ModelContent, ModelFrame, ModelGroup, ModelObject, ModelShape } from '../../src/api/types'
import { standardGenres, standardSlots, starterPalette } from '../../src/assets/Interfaces/admin/characters/engine/standardColours'
import type { MakeId } from '../../src/assets/Interfaces/admin/characters/modelContent'
import { bodyParts, bodyRanges, twinBody } from './body'
import { loadExact, loadMockupModel } from './exact'
import { buildPart, pairUp, type PartSpec } from './face'
import { AGES, BUILDS, EXPRESSIONS } from './presets'

export const TOLERANCE = 0.08

export function stableIds(): MakeId {
  let n = 0
  return prefix => `${prefix}_${++n}`
}

const PARTS: PartSpec[] = [
  { part: 'ears', options: 'ears', objectId: 'ears', objectName: 'Ears', axisId: 'ears', axisName: 'Ear shape', defaultOption: 'average', z: 38.0, prefix: 'ear', names: ['Ear', 'Inner ear', 'Ear 3', 'Ear 4'] },
  { part: 'head', options: 'headShape', objectId: 'skull', objectName: 'Head', axisId: 'headShape', axisName: 'Head shape', defaultOption: 'oval', z: 38.2, prefix: 'hd', firstId: 'skull', view: 'both', names: ['Head', 'Shade plane of the head'] },
  { part: 'brows', options: 'brows', objectId: 'brows', objectName: 'Brows', axisId: 'shape', axisName: 'Brow shape', defaultOption: 'soft', z: 38.4, prefix: 'brow' },
  { part: 'eyes', options: 'eyes', objectId: 'eyes', objectName: 'Eyes', axisId: 'shape', axisName: 'Eye shape', defaultOption: 'almond', z: 38.5, prefix: 'eye' },
  { part: 'nose', options: 'nose', objectId: 'nose', objectName: 'Nose', axisId: 'shape', axisName: 'Nose shape', defaultOption: 'straight', z: 38.6, prefix: 'nose' },
  { part: 'mouth', options: 'mouth', objectId: 'mouth', objectName: 'Mouth', axisId: 'shape', axisName: 'Mouth shape', defaultOption: 'medium', z: 38.7, prefix: 'mouth', names: ['Shade under the lips', 'Shade of the lower lip', 'Lips', 'Mouth line'] },
]

export interface Report { part: string; channels: number; pairs: string; points: number }

// The groups and objects a frame hides (a group takes everything under it with it), with their twins.
function framesOf(c: ModelContent): ModelFrame[] {
  const withTwins = (ids: string[]): string[] => ids.flatMap(id => [id, ...c.groups.filter(g => g.mirrorOf === id).map(g => g.id)])
  const legs = withTwins(['legL']), arms = withTwins(['shoulderL'])
  const trunk = ['chest', 'abdomen', 'pelvis']
  return [
    { id: 'full', name: 'Full body', x: 0, y: 0, w: 200, h: 400, hide: [] },
    { id: 'bust', name: 'Bust', x: 38, y: -22, w: 124, h: 134, hide: legs },
    { id: 'face', name: 'Face', x: 66, y: -22, w: 68, h: 90, hide: [...legs, ...arms, ...trunk] },
    { id: 'hands', name: 'Hands', x: 30, y: 120, w: 140, h: 120, hide: [...legs, 'head'] },
    { id: 'feet', name: 'Feet', x: 70, y: 330, w: 60, h: 70, hide: [...arms, 'neck', ...trunk, 'head'] },
  ]
}

// The two sides are named for the character's: the original is the left (the picture's right) and its twin the right. makeTwin calls a twin "(twin)", which a writer reading the
// parts of the figure would not understand.
function nameSides(c: ModelContent): ModelContent {
  const twinOf = <T extends { id: string; name: string; mirrorOf?: string | null }>(list: T[]): T[] => {
    const originals = new Set(list.flatMap(x => (x.mirrorOf ? [x.mirrorOf] : [])))
    const base = new Map(list.map(x => [x.id, x.name.replace(/ \((twin|left|right)\)$/, '')]))
    return list.map(x => {
      if (x.mirrorOf) return { ...x, name: `${base.get(x.mirrorOf) ?? base.get(x.id)} (right)` }
      return originals.has(x.id) ? { ...x, name: `${base.get(x.id)} (left)` } : x
    })
  }
  return { ...c, shapes: twinOf(c.shapes), objects: twinOf(c.objects), groups: twinOf(c.groups) }
}

export function buildSeed(): { content: ModelContent; report: Report[] } {
  const data = loadExact(), mock = loadMockupModel(), make = stableIds()
  const report: Report[] = []
  const results = PARTS.map(spec => buildPart(data, spec, TOLERANCE))
  const faceShapes: ModelShape[] = [], faceObjects: ModelObject[] = []
  PARTS.forEach((spec, i) => {
    const r = results[i]
    faceShapes.push(...r.shapes); faceObjects.push(r.object)
    report.push({ part: spec.objectName, channels: r.channels, pairs: r.pairs, points: r.points })
  })
  const body = bodyParts(mock)
  const head: ModelGroup = { id: 'head', name: 'Head', parent: 'torso', objects: faceObjects.map(o => o.id), pivot: [100, 54], attach: { shape: 'neck', kind: 'point', i: 0, t: 1, slider: null, rx: 0.5, ry: 0 } }
  let content: ModelContent = {
    name: 'Adult (basic)', description: 'A basic adult, bare: the body, the head and its features, with the ages, builds and expressions as presets.',
    shapes: [...body.shapes, ...faceShapes], objects: [...body.objects, ...faceObjects], groups: [...body.groups, head], axis: 100, ranges: bodyRanges(mock),
    presets: [...AGES, ...BUILDS, ...EXPRESSIONS], classes: [], genres: standardGenres(), palette: starterPalette(), slots: standardSlots(), bones: [], headBone: null,
    frames: [], tile: '#e6d6c3', grips: [], fieldsets: [], patterns: [],
  }
  results.forEach(r => { content = pairUp(content, r, make) })
  content = twinBody(content, body, make)
  content = nameSides(content)
  content = { ...content, frames: framesOf(content) }
  return { content, report }
}
