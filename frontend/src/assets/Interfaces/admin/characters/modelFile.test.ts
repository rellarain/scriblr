import { describe, expect, it } from 'vitest'
import type { ModelContent } from '../../../../api/types'
import { newShape } from './engine/edit'
import { templateBox } from './engine/templates'
import { addTurn, addRange, attachGroup, newRange, reparent } from './engine/rigEdit'
import { ModelFileError, FILE_MARKER, exportFileName, parseModelFile, serializeModels } from './modelFile'
import { addGroup, addObject, addShape, blankContent, newGroup, normalizeContent } from './modelContent'

function rigged(): ModelContent {
  let c = blankContent('Adult')
  c = addGroup(c, newGroup('torso', 'Torso')); c = addGroup(c, newGroup('head', 'Head'))
  c = addObject(c, 'torso', { id: 'oNeck', name: 'Neck', layer: 'body', shapes: [] }); c = addObject(c, 'head', { id: 'oHead', name: 'Head', layer: 'clothing', shapes: [] })
  c = addShape(c, 'oNeck', newShape('neck', 'Neck', 'rounded', templateBox('rounded', 100, 74, 22)))
  c = addShape(c, 'oHead', newShape('skull', 'Skull', 'oval', templateBox('oval', 100, 46, 40)))
  const ok = (e: { ok: boolean; content?: ModelContent; reason?: string }) => { if (!e.ok) throw new Error(e.reason); return e.content! }
  c = ok(reparent(c, 'head', 'torso'))
  c = ok(addRange(c, newRange('tilt', 'Head tilt', 'turn', 'head')))
  c = ok(addTurn(c, 'tilt', 'head'))
  c = ok(attachGroup(c, 'head', { shape: 'neck', kind: 'edge', i: 0, t: 0.5, slider: null, rx: 0.5, ry: 0.5 }))
  return { ...c, axis: 96 }
}
const file = (models: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ [FILE_MARKER]: 1, models, ...extra })

describe('writing and reading a model file', () => {
  it('gives back the models as they were, rig and all', () => {
    const c = rigged()
    const back = parseModelFile(serializeModels([c, blankContent('Empty')]))
    expect(back.skipped).toEqual([])
    expect(back.models).toHaveLength(2)
    expect(back.models[0]).toEqual(normalizeContent(c))
    expect(back.models[0].ranges[0].drives[0]).toMatchObject({ kind: 'turn', group: 'head' })
    expect(back.models[0].groups.find(g => g.id === 'head')?.attach?.kind).toBe('edge')
    expect(back.models[0].axis).toBe(96)
  })
  it('marks the file with its kind and version, and names it after a single model', () => {
    const parsed = JSON.parse(serializeModels([rigged()], new Date('2026-11-08T10:00:00Z')))
    expect(parsed[FILE_MARKER]).toBe(1); expect(parsed.exportedAt).toBe('2026-11-08T10:00:00.000Z')
    expect(exportFileName([rigged()])).toBe('scriblr-character-model-adult.json')
    expect(exportFileName([blankContent('')])).toBe('scriblr-character-model-model.json')
    expect(exportFileName([rigged(), rigged()])).toBe('scriblr-character-models.json')
  })
})

describe('a file that cannot be read', () => {
  it('is refused in words: not JSON, not ours, newer, with no models', () => {
    expect(() => parseModelFile('{nope')).toThrow(ModelFileError)
    expect(() => parseModelFile('{nope')).toThrow(/not valid JSON/)
    expect(() => parseModelFile('[]')).toThrow(/not a Scriblr character model file/)
    expect(() => parseModelFile(JSON.stringify({ scriblrPlotPresets: 1, presets: [] }))).toThrow(/not a Scriblr character model file/)
    expect(() => parseModelFile(JSON.stringify({ [FILE_MARKER]: 0, models: [] }))).toThrow(/not a Scriblr character model file/)
    expect(() => parseModelFile(JSON.stringify({ [FILE_MARKER]: 99, models: [] }))).toThrow(/newer version/)
    expect(() => parseModelFile(JSON.stringify({ [FILE_MARKER]: 1 }))).toThrow(/no models/)
  })
})

describe('a model in the file that cannot be used', () => {
  it('is skipped and named by its place, and the others still come in', () => {
    const pts = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: i, m: 's' }))
    const good = { name: 'Fine', shapes: [{ id: 's1', pts: pts(4) }] }
    const r = parseModelFile(file([
      { shapes: [] },                                                           // no name
      'junk',
      { name: 'Many points', shapes: [{ id: 's1', pts: pts(61) }] },
      { name: 'Bad id', shapes: [{ id: 'has space', pts: pts(3) }] },
      { name: 'Twins', shapes: [{ id: 's1', pts: pts(3) }, { id: 's1', pts: pts(3) }] },
      { name: 'Crowd', groups: [{ id: 'g', objects: Array.from({ length: 49 }, (_, i) => `o${i}`) }] },
      { name: 'Busy', ranges: [{ id: 'r', drives: Array.from({ length: 25 }, () => ({ kind: 'turn', group: 'g' })) }] },
      good,
    ]))
    expect(r.models.map(m => m.name)).toEqual(['Fine'])
    expect(r.skipped).toEqual([
      'The model at position 1 has no name.',
      'The model at position 2 is not a model.',
      'The model at position 3 has more than 60 points in a shape.',
      'The model at position 4 has shapes with an id that is not allowed.',
      'The model at position 5 has two shapes with the same id.',
      'The model at position 6 has more than 48 objects in a group.',
      'The model at position 7 has more than 24 drives in a slider.',
    ])
  })
})

describe('what is held to the limits', () => {
  it('repairs numbers, modes, names and unknown values the way the server does', () => {
    const r = parseModelFile(file([{
      name: `  ${'x'.repeat(100)}  `, description: 5, axis: 999,
      shapes: [{ id: 's', name: 'S', z: 900, op: -4, view: 'sideways', pts: [{ x: 'a', y: 1e9, m: 'zz', hi: [1, 'b'], w: 7 }, { x: 5, y: 5 }, { x: 6, y: 6 }] }],
      objects: [{ id: 'o', layer: 'moon', shapes: ['s', 4] }],
      groups: [{ id: 'g', parent: 7, pivot: ['p', 3], attach: { kind: 'edge' }, objects: ['o'] }],
      ranges: [{ id: 'r', name: 'R', min: 50, max: 10, rest: 400, unit: 'cm', rand: [9, 1], drives: [{ kind: 'turn', group: 'g', atMax: 9999 }, { kind: 'turn' }, { kind: 'scale', target: 'model' }, { kind: 'wiggle' }, 'x'] }],
    }]))
    expect(r.skipped).toEqual([])
    const m = r.models[0]
    expect(m.name).toHaveLength(60); expect(m.description).toBe(''); expect(m.axis).toBe(160)
    expect(m.shapes[0]).toMatchObject({ z: 100, op: 0, view: 'both' })
    expect(m.shapes[0].pts[0]).toMatchObject({ x: 0, y: 450, m: 'c', hi: [1, 0], w: 1 })
    expect(m.objects[0]).toMatchObject({ layer: 'body', shapes: ['s'] })
    expect(m.groups[0]).toMatchObject({ parent: null, pivot: [100, 3], attach: null })
    expect(m.ranges[0]).toMatchObject({ unit: '' })
    expect(m.ranges[0].max).toBeGreaterThan(m.ranges[0].min)
    expect(m.ranges[0].rest).toBeLessThanOrEqual(m.ranges[0].max)
    expect(m.ranges[0].rand![0]).toBeLessThanOrEqual(m.ranges[0].rand![1])
    expect(m.ranges[0].drives.map(d => d.kind)).toEqual(['turn', 'scale'])
    expect(m.ranges[0].drives[0].atMax).toBe(360)
    expect(m.ranges[0].drives[1]).toMatchObject({ atMin: 100, atMax: 100 })
  })
  it('keeps a model with no rig as one with defaults', () => {
    const m = parseModelFile(file([{ name: 'Old', shapes: [], objects: [], groups: [{ id: 'g', name: 'G', parent: null, objects: [] }] }])).models[0]
    expect(m.ranges).toEqual([]); expect(m.axis).toBe(100); expect(m.groups[0]).toMatchObject({ pivot: null, attach: null })
  })
})
