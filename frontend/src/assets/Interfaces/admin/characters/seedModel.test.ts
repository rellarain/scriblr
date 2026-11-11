import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../api/types'
import { ageOf, agePresets, atAge, blankFigure, cropBox, drawFigure, rollFigure, valuesOf } from '../../writer/characters/figure/figureState'
import { applyPreset, restState } from './engine/presets'
import { seededRng } from './engine/previews'
import { copyBytes, LIMITS } from './engine/limits'
import { defaultValues, solve } from './engine/rig'
import { publishFaults } from './modelContent'

// The basic adult that comes with the app (backend/app/seed/basic_model.json, written by frontend/scripts/seed-model from the old portrait engine's exact shapes and the
// mockup's body): a published model has to be sound, small enough to copy, and complete for what it promises.
const seed: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const allFinite = (d: string) => !/NaN|undefined|Infinity/.test(d)
const objectOf = (id: string) => seed.objects.find(o => o.id === id)!

describe('the basic model', () => {
  it('can be published and is inside the size limit of a copy', () => {
    expect(publishFaults(seed)).toEqual([])
    expect(copyBytes(seed)).toBeLessThan(LIMITS.copyMaxBytes)
    expect(seed.shapes.length).toBeLessThan(LIMITS.shapesMax)
  })

  it('has every option of the old portrait as a form of its part: head, ears, eyes, brows, nose and mouth', () => {
    const count = (id: string) => objectOf(id).axes![0].options.length
    expect([count('skull'), count('ears'), count('eyes'), count('brows'), count('nose'), count('mouth')]).toEqual([13, 12, 14, 13, 14, 13])
    expect(objectOf('eyes').axes![0].initial).toBe('almond')
    // the eyes and the brows are one object and its twin, so each eye turns and sizes about its own middle
    expect(seed.objects.filter(o => o.mirrorOf === 'eyes')).toHaveLength(1)
    expect(seed.objects.filter(o => o.mirrorOf === 'brows')).toHaveLength(1)
  })

  it('has a body that stands, with twins of the arms and legs and the frames of a card', () => {
    expect(seed.groups.filter(g => g.mirrorOf).map(g => g.mirrorOf).sort()).toEqual(['armL', 'foreL', 'handL', 'legL', 'shinL', 'footL', 'shoulderL'].sort())
    expect(seed.frames!.map(f => f.name)).toEqual(['Full body', 'Bust', 'Face', 'Hands', 'Feet'])
    const rest = solve(seed, defaultValues(seed), 'front')
    const drawn = Object.values(rest.shapes).filter(s => s.visible)
    expect(drawn.length).toBeGreaterThan(60)
    for (const s of drawn) expect(allFinite(s.d)).toBe(true)
    // the figure is about as tall as the card is (a head, a body, legs and feet)
    const top = Math.min(...drawn.map(s => s.box.y)), bottom = Math.max(...drawn.map(s => s.box.y + s.box.h))
    expect(top).toBeLessThan(15)
    expect(bottom).toBeGreaterThan(385)
  })

  it('has the nine ages, the four builds and the thirteen expressions, each a preset of sliders the model has', () => {
    const kinds = (kind: string) => seed.presets!.filter(p => p.kind === kind)
    expect([kinds('Age').length, kinds('Build').length, kinds('Expression').length]).toEqual([9, 4, 13])
    expect(kinds('Age').map(p => p.name)).toEqual(['Infant', 'Toddler', 'Child', 'Teen', 'Young adult', 'Adult', 'Middle-aged', 'Older', 'Elderly'])
    const sliders = new Set(seed.ranges.map(r => r.id))
    for (const p of seed.presets!) for (const id of Object.keys(p.values)) expect(sliders.has(id), `${p.name}: ${id}`).toBe(true)
  })

  it('draws every age, build and expression without a broken number', () => {
    for (const p of seed.presets!) {
      const state = applyPreset(seed, restState(seed), p)
      const solved = solve(seed, state.values, 'front', { forms: state.forms })
      for (const s of Object.values(solved.shapes)) if (s.visible) expect(allFinite(s.d), `${p.name}: ${s.id}`).toBe(true)
    }
  })

  it('draws every form of every part without a broken number', () => {
    for (const o of seed.objects) for (const axis of o.axes ?? []) for (const f of axis.options) {
      const solved = solve(seed, defaultValues(seed), 'front', { forms: { [`${o.id}.${axis.id}`]: f.id } })
      for (const s of Object.values(solved.shapes)) if (s.visible) expect(allFinite(s.d), `${o.id}.${axis.id}=${f.id}: ${s.id}`).toBe(true)
    }
  })

  it('lets a child be framed as a child: the bust frame follows the height of the figure', () => {
    const fig: CharacterFigure = blankFigure('basic', seed)
    const small = atAge(seed, fig, 'age_child')
    const grown = drawFigure(seed, fig, 'bust'), kid = drawFigure(seed, small, 'bust')
    // the frame shrinks about the feet with the figure, so it is lower and smaller than the adult's
    expect(kid.box.h).toBeLessThan(grown.box.h)
    const adult = cropBox(seed, 'bust', 'front'), shrunk = cropBox(seed, 'bust', 'front', solve(seed, valuesOf(seed, small), 'front').global)
    expect(shrunk.y).toBeGreaterThan(adult.y)
    expect(shrunk.w).toBeLessThan(adult.w)
  })

  it('knows each age it is at: choosing an age and asking for it gives the same age back', () => {
    const fig: CharacterFigure = blankFigure('basic', seed)
    expect(agePresets(seed)).toHaveLength(9)
    for (const age of agePresets(seed)) expect(ageOf(seed, atAge(seed, fig, age.id))?.id, age.name).toBe(age.id)
  })

  it('rolls a look that draws', () => {
    const fig = rollFigure(seed, blankFigure('basic', seed), seededRng(7))
    const drawn = drawFigure(seed, fig, 'bust')
    expect(drawn.items.length).toBeGreaterThan(20)
    for (const item of drawn.items) expect(allFinite(item.d)).toBe(true)
  })
})
