import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../api/types'
import { ageOf, agePresets, atAge, blankFigure, cropBox, drawFigure, rollFigure, valuesOf } from '../../writer/characters/figure/figureState'
import { applyPreset, restState } from './engine/presets'
import { seededRng } from './engine/previews'
import { copyBytes, LIMITS, linkCount } from './engine/limits'
import { optionalObjects } from '../../writer/characters/figure/figureEditing'
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
    // the shape of a part is its own axis (the fantasy ears and the eye style are axes of their own, ahead of it)
    const count = (id: string, axis = id === 'skull' ? 'headShape' : id === 'ears' ? 'ears' : 'shape') => objectOf(id).axes!.find(a => a.id === axis)!.options.length
    expect([count('skull'), count('ears'), count('eyes'), count('brows'), count('nose'), count('mouth')]).toEqual([13, 12, 14, 13, 14, 13])
    expect(objectOf('eyes').axes!.find(a => a.id === 'shape')!.initial).toBe('almond')
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

  it('has the fantasy parts and the necklaces: ears, eye styles, extra eyes, horns, crowns, wreaths, hoods, each off until chosen and rolled only for the Fantasy genre', () => {
    const axisOf = (id: string, axis: string) => objectOf(id).axes!.find(a => a.id === axis)!
    const names = (id: string, axis: string) => axisOf(id, axis).options.map(f => f.id)
    expect(names('ears', 'fantasy')).toEqual(['none', 'pointed', 'elf', 'longelf', 'goblin', 'bat', 'fin'])
    expect(names('eyes', 'style')).toEqual(['normal', 'glowing', 'solid', 'slit', 'goat', 'blank'])   // two colours is not here: the twin of an eye cannot have a colour of its own
    expect(names('extraEyes', 'count')).toEqual(['two', 'third', 'four', 'six', 'cheeks', 'temples'])
    expect(names('horns', 'style')).toEqual(['none', 'nubs', 'devil', 'ram', 'bull', 'long', 'unicorn', 'antlers', 'stag', 'brow'])
    expect(names('crown', 'style')).toEqual(['none', 'circlet', 'gem', 'diadem', 'tiara', 'spikes', 'royal'])
    expect(names('laurel', 'style')).toEqual(['none', 'laurel'])
    expect(names('flowers', 'style')).toEqual(['none', 'flowers'])
    expect(names('hood', 'style')).toEqual(['none', 'hood', 'deep', 'pointed', 'cowl', 'down'])
    expect(names('necklace', 'style')).toEqual(['none', 'chain', 'choker', 'beads', 'pearls', 'pendant', 'amulet', 'locket', 'medallion', 'torc'])
    const parts: Array<[string, string]> = [['ears', 'fantasy'], ['eyes', 'style'], ['extraEyes', 'count'], ['horns', 'style'], ['crown', 'style'], ['laurel', 'style'], ['flowers', 'style'], ['hood', 'style'], ['necklace', 'style']]
    for (const [id, axis] of parts) { expect(axisOf(id, axis).genres, id).toEqual(['g_fantasy']); expect(axisOf(id, axis).roll, id).toBe(6) }
    // the objects that are off to begin with show nothing at rest, and every other form of them shows something
    const visible = (id: string, forms: Record<string, string> = {}) => objectOf(id).shapes.filter(sid => solve(seed, defaultValues(seed), 'front', { forms }).shapes[sid]?.visible)
    for (const id of ['extraEyes', 'horns', 'crown', 'laurel', 'flowers', 'hood', 'necklace']) {
      const axis = objectOf(id).axes![0]
      expect(visible(id), id).toEqual([])
      for (const f of axis.options.filter(o => o.id !== axis.initial)) expect(visible(id, { [`${id}.${axis.id}`]: f.id }).length, `${id}: ${f.id}`).toBeGreaterThan(0)
    }
    // a hood that hangs down lies behind the body, and one that is up over the hair
    const hood = (form: string) => seed.shapes.filter(sh => objectOf('hood').shapes.includes(sh.id) && visible('hood', { 'hood.style': form }).includes(sh.id))
    expect(Math.max(...hood('down').map(sh => sh.z))).toBeLessThan(20)
    expect(Math.min(...hood('hood').map(sh => sh.z))).toBeGreaterThan(51)
  })

  it('has a slot of its own for what the fantasy parts are made of: horn, metal, gems, the hood, leaves and blossoms', () => {
    const slots = new Map(seed.slots!.map(sl => [sl.id, sl]))
    for (const id of ['k_horn', 'k_metal', 'k_gem', 'k_hood', 'k_leaf', 'k_bloom']) {
      expect(slots.has(id), id).toBe(true)
      expect(slots.get(id)!.colours.length, id).toBeGreaterThan(3)
      expect(seed.shapes.some(sh => sh.slot === id), id).toBe(true)
    }
    expect(seed.slots!.length).toBeLessThanOrEqual(LIMITS.slotsWarn)
  })

  it('rolls the fantasy parts only for a figure set to the Fantasy genre, and then only now and then', () => {
    const rolled = (genre: string | null) => Array.from({ length: 120 }, (_, s) => rollFigure(seed, { ...blankFigure('basic', seed), genre }, seededRng(s + 1)).forms)
    const fantasy = (forms: Record<string, string>) => ['ears.fantasy', 'eyes.style', 'extraEyes.count', 'horns.style', 'crown.style', 'hood.style', 'necklace.style'].some(k => forms[k] && !['none', 'normal', 'two'].includes(forms[k]))
    expect(rolled(null).filter(fantasy)).toEqual([])
    expect(rolled('g_fiction').filter(fantasy)).toEqual([])
    const some = rolled('g_fantasy').filter(fantasy).length
    expect(some).toBeGreaterThan(10); expect(some).toBeLessThan(80)
  })

  it('offers a part that is off until chosen in the extras of the first step, and not a part that is drawn', () => {
    const extras = optionalObjects(seed).map(o => o.id)
    expect(extras).toEqual(expect.arrayContaining(['beard', 'moustache', 'extraEyes', 'horns', 'crown', 'laurel', 'flowers', 'hood', 'necklace']))
    expect(extras).not.toContain('eyes'); expect(extras).not.toContain('skull')
    expect(extras.some(id => seed.objects.find(o => o.id === id)!.mirrorOf)).toBe(false)
  })

  it('is dressed to begin with: a shirt with short sleeves, trousers and shoes, and underwear under them', () => {
    const clothing = seed.objects.filter(o => o.layer === 'clothing').map(o => o.id)
    expect(clothing).toEqual(expect.arrayContaining(['shirt', 'sleeves', 'trousers', 'shoes', 'jacket', 'coat', 'skirt', 'dress', 'briefs', 'bandeau', 'hood', 'crown', 'necklace']))
    const rest = solve(seed, defaultValues(seed), 'front')
    const drawn = (id: string) => objectOf(id).shapes.filter(sid => rest.shapes[sid]?.visible)
    for (const id of ['shirt', 'trousers', 'shoes', 'briefs', 'bandeau']) expect(drawn(id).length, id).toBeGreaterThan(0)
    // short sleeves: the upper arms, not the forearms
    expect(drawn('sleeves').sort()).toEqual(['sleeveUpL', 'sleeveUpR'])
    // the garments that are put on are off to begin with
    for (const id of ['jacket', 'coat', 'skirt', 'dress']) expect(drawn(id), id).toEqual([])
  })

  it('has the fifteen necklines of the old portrait as forms of the shirt, each one a hole cut out of it', () => {
    const axis = objectOf('shirt').axes!.find(a => a.id === 'neckline')!
    expect(axis.options.map(f => f.id)).toEqual(['crew', 'vneck', 'deepv', 'scoop', 'widescoop', 'boat', 'square', 'sweetheart', 'henley', 'polo', 'mock', 'turtle', 'cowl', 'offshoulder', 'strapless'])
    expect(axis.initial).toBe('crew')
    const holes = axis.options.map(f => solve(seed, defaultValues(seed), 'front', { forms: { 'shirt.neckline': f.id } }).shapes.neckHole.box)
    // every hole is a different one, and a deeper neckline is a deeper hole
    expect(new Set(holes.map(h => `${h.x.toFixed(1)},${h.y.toFixed(1)},${h.w.toFixed(1)},${h.h.toFixed(1)}`)).size).toBeGreaterThanOrEqual(12)
    const depth = (id: string) => holes[axis.options.findIndex(f => f.id === id)].h
    expect(depth('deepv')).toBeGreaterThan(depth('vneck')); expect(depth('vneck')).toBeGreaterThan(depth('crew'))
    expect(holes[axis.options.findIndex(f => f.id === 'widescoop')].w).toBeGreaterThan(holes[axis.options.findIndex(f => f.id === 'crew')].w)
    // and the fifteen come as ready tops, with the sleeves that go with them
    const tops = seed.presets!.filter(p => p.kind === 'Top')
    expect(tops).toHaveLength(15)
    expect(tops.find(p => p.id === 'top_strapless')!.forms).toEqual({ 'shirt.neckline': 'strapless', 'sleeves.length': 'none' })
    expect(tops.find(p => p.id === 'top_offshoulder')!.forms!['sleeves.length']).toBe('none')
  })

  it('has what a neckline brings: buttons, flaps, a drape and a roll round the neck, each only in its own', () => {
    const shown = (neck: string) => objectOf('shirt').shapes.filter(sid => !seed.shapes.find(sh => sh.id === sid)!.helper).filter(sid => solve(seed, defaultValues(seed), 'front', { forms: { 'shirt.neckline': neck } }).shapes[sid]?.visible)
    expect(shown('crew')).toEqual(['shirt', 'collar'])
    expect(shown('henley')).toEqual(expect.arrayContaining(['placket', 'button1', 'button2', 'button3']))
    expect(shown('polo')).toEqual(expect.arrayContaining(['flapL', 'flapR', 'poloPlacket']))
    expect(shown('cowl')).toContain('cowl'); expect(shown('turtle')).toContain('turtleCollar'); expect(shown('mock')).toContain('mockCollar')
    expect(shown('strapless')).not.toContain('collar')
  })

  it('has the sleeves of three lengths and the other garments in forms and lengths: a jacket, a coat, a skirt of four lengths and a dress of five necklines', () => {
    const names = (id: string, axis: string) => objectOf(id).axes!.find(a => a.id === axis)!.options.map(f => f.id)
    expect(names('sleeves', 'length')).toEqual(['none', 'short', 'long'])
    expect(names('jacket', 'style')).toEqual(['none', 'open', 'shut']); expect(names('coat', 'style')).toEqual(['none', 'open', 'shut'])
    expect(names('skirt', 'length')).toEqual(['none', 'mini', 'knee', 'midi', 'maxi'])
    expect(names('dress', 'style')).toEqual(['none', 'crew', 'vneck', 'scoop', 'boat', 'square'])
    // a longer skirt is longer, a coat is longer than a jacket, long sleeves reach the wrist
    const bottom = (forms: Record<string, string>, ids: string[]) => Math.max(...ids.map(id => { const b = solve(seed, defaultValues(seed), 'front', { forms }).shapes[id].box; return b.y + b.h }))
    expect(bottom({ 'skirt.length': 'maxi' }, ['skirtBody'])).toBeGreaterThan(bottom({ 'skirt.length': 'mini' }, ['skirtBody']) + 80)
    expect(bottom({ 'coat.style': 'open' }, ['coatBody'])).toBeGreaterThan(bottom({ 'jacket.style': 'open' }, ['jacketBody']) + 40)
    expect(bottom({ 'sleeves.length': 'long' }, ['sleeveForeL'])).toBeGreaterThan(190)
    // the jacket and the coat have an opening that shows the shirt, and lapels round it
    const lapel = (form: string) => solve(seed, defaultValues(seed), 'front', { forms: { 'jacket.style': form } }).shapes.jacketLapel.box
    expect(lapel('open').h).toBeGreaterThan(lapel('shut').h)
  })

  it('has the garments follow the body: wider shoulders widen the shirt, spread legs spread the trousers, and the two sides are the same at rest', () => {
    const at = (values: Record<string, number>) => solve(seed, { ...defaultValues(seed), ...values }, 'front').shapes
    const rest = at({}), wide = at({ shoulders: 120 }), apart = at({ legSpread: 25 })
    expect(wide.shirt.box.w).toBeGreaterThan(rest.shirt.box.w + 2)
    expect(apart.trouserL.box.x).not.toBeCloseTo(rest.trouserL.box.x, 0)
    expect(apart.trouserR.box.x).not.toBeCloseTo(rest.trouserR.box.x, 0)
    for (const [l, r] of [['sleeveUpL', 'sleeveUpR'], ['trouserL', 'trouserR'], ['shoeL', 'shoeR']]) {
      expect(rest[l].box.w, l).toBeCloseTo(rest[r].box.w, 0)
      expect(rest[l].box.x + rest[l].box.w / 2 + rest[r].box.x + rest[r].box.w / 2, `${l} and ${r} are mirror images`).toBeCloseTo(200, 0)
    }
    // a looser top is further from the body, a snug one closer
    expect(at({ looseTop: 200 }).shirt.box.w).toBeGreaterThan(rest.shirt.box.w); expect(at({ looseTop: 0 }).shirt.box.w).toBeLessThan(rest.shirt.box.w)
  })

  it('wears a shirt and its sleeves under a jacket or a coat, and underwear under what covers it', () => {
    expect(objectOf('shirt').under).toEqual(['jacket', 'coat']); expect(objectOf('sleeves').under).toEqual(['jacket', 'coat'])
    expect(objectOf('briefs').under).toEqual(expect.arrayContaining(['trousers', 'skirt', 'dress']))
    expect(objectOf('bandeau').under).toEqual(expect.arrayContaining(['shirt', 'dress', 'jacket']))
    const ids = new Set(seed.objects.map(o => o.id))
    for (const o of seed.objects) for (const u of o.under ?? []) expect(ids.has(u), `${o.id} is worn under ${u}`).toBe(true)
  })

  it('has the outfits as presets that take things off or put them on, and Randomise never takes a garment off or puts one on', () => {
    const outfits = seed.presets!.filter(p => p.kind === 'Outfit')
    expect(outfits.map(p => p.name)).toEqual(['Everyday', 'Jacket', 'Coat', 'Skirt and top', 'Dress', 'Underwear only'])
    const fig: CharacterFigure = blankFigure('basic', seed)
    for (let s = 1; s <= 60; s++) {
      const rolled = rollFigure(seed, fig, seededRng(s + 300))
      expect(rolled.hidden).toEqual([])
      for (const k of ['jacket.style', 'coat.style', 'skirt.length', 'dress.style']) expect(rolled.forms[k] ?? 'none', k).toBe('none')
    }
  })

  it('has a slot for the colours of the garments of its own: trousers and skirts, jackets and coats, underwear', () => {
    for (const id of ['k_trouser', 'k_outer', 'k_under']) {
      expect(seed.slots!.find(sl => sl.id === id)!.colours.length, id).toBeGreaterThan(3)
      expect(seed.shapes.some(sh => sh.slot === id), id).toBe(true)
    }
    expect(linkCount(seed)).toBeLessThan(LIMITS.linksWarn)
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
