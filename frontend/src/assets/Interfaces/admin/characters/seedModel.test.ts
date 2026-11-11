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

  it('has the hair as fourteen sections by plane and side, each with its own length, texture and cut', () => {
    const sections = seed.objects.filter(o => o.id.startsWith('hair.'))
    expect(sections).toHaveLength(14)
    for (const o of sections) {
      expect(o.layer).toBe('hair')
      const mine = seed.ranges.filter(r => r.scope === o.id)
      expect(mine.map(r => r.name).sort(), o.id).toEqual(['Length', 'Texture'])
      // Randomise leaves the length and texture of a section to a hairstyle, and its cut with them
      for (const r of mine) expect(r.rand, `${o.id} ${r.name}`).toEqual(r.name === 'Length' ? [r.rest, r.rest] : [0, 0])
      expect(o.axes![0].roll).toBe(0)
      expect(o.axes![0].options.length).toBeGreaterThan(1)
    }
    expect(seed.groups.find(g => g.id === 'hair')!.objects).toHaveLength(14)
  })

  it('stretches a section from its roots with its Length slider, and waves it with its Texture slider', () => {
    const at = (values: Record<string, number>) => solve(seed, { ...defaultValues(seed), ...values }, 'front').shapes
    const short = at({ len_back_center: 12 }).hr_back_center, long = at({ len_back_center: 90 }).hr_back_center
    expect(long.box.h).toBeGreaterThan(short.box.h * 2)
    expect(long.box.y).toBeCloseTo(short.box.y, 0)   // the roots stay where they are
    const straight = at({ tex_back_center: 0, len_back_center: 90 }).hr_back_center, curly = at({ tex_back_center: 66, len_back_center: 90 }).hr_back_center
    expect(curly.d).not.toBe(straight.d)
    expect(allFinite(curly.d)).toBe(true)
  })

  it('has fourteen ready hairstyles that set whole heads of hair: shorter and longer, textured, shaved and bald', () => {
    const styles = seed.presets!.filter(p => p.kind === 'Hair style')
    expect(styles.map(p => p.name)).toEqual(['Short', 'Buzzed', 'Pixie', 'Undercut', 'Mohawk', 'Shaved on one side', 'Bob', 'Shoulder-length', 'Long and straight', 'Long and wavy', 'Curls', 'Coils', 'Afro', 'Bald'])
    // what a style names is there: a cut that exists on a section that exists
    for (const p of styles) for (const [key, form] of Object.entries(p.forms ?? {})) {
      const [objectId, axisId] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)]
      expect(objectOf(objectId).axes!.find(a => a.id === axisId)!.options.some(f => f.id === form), `${p.name}: ${key}`).toBe(true)
    }
    const drawn = (name: string) => {
      const p = styles.find(x => x.name === name)!, state = applyPreset(seed, restState(seed), p)
      return solve(seed, state.values, 'front', { forms: state.forms, hidden: state.hidden }).shapes
    }
    const hairBox = (shapes: ReturnType<typeof drawn>) => Math.max(...Object.entries(shapes).filter(([id, s]) => /^hr_/.test(id) && s.visible).map(([, s]) => s.box.y + s.box.h))
    expect(hairBox(drawn('Buzzed'))).toBeLessThan(hairBox(drawn('Short')))
    expect(hairBox(drawn('Long and straight'))).toBeGreaterThan(hairBox(drawn('Bob')) + 10)
    expect(Object.entries(drawn('Bald')).filter(([id, s]) => /^h[rs]_/.test(id) && s.visible)).toEqual([])
    expect(Object.entries(drawn('Short')).filter(([id, s]) => /^hr_/.test(id) && s.visible).length).toBeGreaterThan(8)
  })

  it('has a beard and a moustache with every facial hair of the old portrait, off until chosen and only now and then rolled', () => {
    for (const id of ['beard', 'moustache']) {
      const o = objectOf(id), axis = o.axes![0]
      expect(axis.options.map(f => f.id)).toEqual(['none', 'stubble', 'moustache', 'handlebar', 'horseshoe', 'goatee', 'circle', 'vandyke', 'soulpatch', 'chinstrap', 'chops', 'short', 'full', 'long'])
      expect(axis.initial).toBe('none')
      expect(axis.roll).toBe(15)
      expect(o.layer).toBe('hair')
    }
    // and the old fourteen come as ready presets that choose the beard and the moustache of the option together
    const ready = seed.presets!.filter(p => p.kind === 'Facial hair')
    expect(ready.map(p => p.name)).toEqual(['None', 'Stubble', 'Moustache', 'Handlebar', 'Horseshoe', 'Goatee', 'Circle beard', 'Van Dyke', 'Soul patch', 'Chin strap', 'Mutton chops', 'Short beard', 'Full beard', 'Long beard'])
    expect(ready.find(p => p.name === 'Goatee')!.forms).toEqual({ 'beard.style': 'goatee', 'moustache.style': 'goatee' })
    const mine = new Set([...objectOf('beard').shapes, ...objectOf('moustache').shapes])
    const shown = (forms: Record<string, string>) => Object.entries(solve(seed, defaultValues(seed), 'front', { forms }).shapes).filter(([id, s]) => mine.has(id) && s.visible).map(([id]) => id)
    expect(shown({})).toEqual([])
    expect(shown({ 'beard.style': 'full' }).length).toBeGreaterThan(0)
    expect(shown({ 'moustache.style': 'handlebar' }).every(id => objectOf('moustache').shapes.includes(id))).toBe(true)
    expect(shown({ 'beard.style': 'chops' })).toHaveLength(2)   // the two mutton chops, one the twin of the other
  })

  it('rolls a face that has no beard most of the time and always some hair', () => {
    const fig: CharacterFigure = blankFigure('basic', seed)
    const beards = Array.from({ length: 60 }, (_, s) => rollFigure(seed, fig, seededRng(s + 100)).forms['beard.style']).filter(f => f && f !== 'none' && f !== 'moustache' && f !== 'handlebar' && f !== 'horseshoe' && f !== 'soulpatch').length
    expect(beards).toBeLessThan(25)
  })

  it('rolls a look that draws', () => {
    const fig = rollFigure(seed, blankFigure('basic', seed), seededRng(7))
    const drawn = drawFigure(seed, fig, 'bust')
    expect(drawn.items.length).toBeGreaterThan(20)
    for (const item of drawn.items) expect(allFinite(item.d)).toBe(true)
  })
})
