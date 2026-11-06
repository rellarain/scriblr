import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CharacterLook, CharacterMark } from '../../../../../api/types'
import { CharacterArt } from './CharacterArt'
import { defaultLook, normalizeLook } from './defaults'
import { BROWS, EARS, EXPRESSIONS, EYES, FACIAL_HAIR, HAIR, HEAD_SHAPES, MOUTHS, NOSES } from './library'
import { VIEWS, type View } from './space'
import { ACCESSORIES, AREAS, BOTTOMS, BUILDS, DESIGNS, ITEMS, MARK_KINDS, OUTER, POSES, SHOES, TOPS } from './wardrobe'

const draw = (look: CharacterLook, mode: 'head' | 'closeup' | 'full', view: View = 'front') => renderToStaticMarkup(<CharacterArt look={look} mode={mode} view={view} label="x" />)
const clean = (svg: string) => {
  expect(svg).toContain('<svg')
  expect(svg).not.toMatch(/NaN|undefined|Infinity/)
}
const withLook = (patch: Partial<CharacterLook>): CharacterLook => ({ ...defaultLook(), ...patch })

describe('the art engine draws every part in every view', () => {
  it('draws the default character as a close-up, full body and head in all four views', () => {
    for (const v of VIEWS) for (const mode of ['head', 'closeup', 'full'] as const) clean(draw(defaultLook(), mode, v.id))
  })

  it.each([
    ['headShape', HEAD_SHAPES], ['ears', EARS], ['eyes', EYES], ['brows', BROWS], ['nose', NOSES], ['mouth', MOUTHS], ['facialHair', FACIAL_HAIR], ['hair', HAIR], ['expression', EXPRESSIONS],
  ] as const)('every %s', (key, list) => {
    for (const o of list) for (const v of VIEWS) clean(draw(withLook({ [key]: o.id } as Partial<CharacterLook>), 'head', v.id))
  })

  it('every build and pose, in every view', () => {
    for (const b of BUILDS) for (const v of VIEWS) clean(draw(withLook({ build: b.id }), 'full', v.id))
    for (const p of POSES) for (const v of VIEWS) clean(draw(withLook({ pose: p.id }), 'full', v.id))
  })

  it('every garment, accessory and held item', () => {
    const base = defaultLook()
    for (const t of TOPS) for (const v of VIEWS) clean(draw(withLook({ outfit: { ...base.outfit, top: t.id } }), 'full', v.id))
    for (const b of BOTTOMS) clean(draw(withLook({ outfit: { ...base.outfit, bottom: b.id } }), 'full'))
    for (const s of SHOES) clean(draw(withLook({ outfit: { ...base.outfit, shoes: s.id } }), 'full', 'side'))
    for (const o of OUTER) for (const v of VIEWS) clean(draw(withLook({ outfit: { ...base.outfit, outer: o.id } }), 'full', v.id))
    for (const a of ACCESSORIES) for (const v of VIEWS) clean(draw(withLook({ outfit: { ...base.outfit, accessories: [a.id] } }), 'full', v.id))
    for (const i of ITEMS) clean(draw(withLook({ heldLeft: i.id, heldRight: i.id }), 'full', 'threeQuarter'))
  })

  it('every kind and design of mark on every area it can go on', () => {
    for (const area of AREAS) {
      for (const kind of MARK_KINDS) {
        if (!area.marks.includes(kind.id)) continue
        for (const d of DESIGNS[kind.id]) {
          const m: CharacterMark = { id: 'm1', kind: kind.id, design: d.id, area: area.id, x: 0.4, y: 0.6, size: 1, color: null, strokes: [] }
          clean(draw(withLook({ marks: [m] }), area.zone === 'head' ? 'closeup' : 'full', area.id === 'back' ? 'back' : 'front'))
        }
      }
    }
  })

  it('a tattoo of your own is drawn from its strokes', () => {
    const m: CharacterMark = { id: 'm1', kind: 'tattoo', design: 'star', area: 'chest', x: 0.5, y: 0.5, size: 1, color: '#112233', strokes: [[[0.1, 0.1], [0.9, 0.9]]] }
    expect(draw(withLook({ marks: [m] }), 'full')).toContain('#112233')
  })

  it('streaks, a texture and a long beard still draw', () => {
    clean(draw(withLook({ hair: 'afro', streakColor: '#ff00aa', streakAmount: 1, facialHair: 'long' }), 'closeup', 'side'))
    clean(draw(withLook({ hair: 'curly', hairLength: 1, streakColor: '#00aaff' }), 'full', 'back'))
  })

  it('a look from a newer build (unknown ids) falls back and still draws', () => {
    clean(draw(withLook({ hair: 'nope', eyes: 'nope', pose: 'nope', build: 'nope', headShape: 'nope', outfit: { ...defaultLook().outfit, top: 'nope', accessories: ['nope'] } }), 'full'))
  })

  it('the colours of the look are the colours drawn, and a name is given to assistive technology', () => {
    const svg = draw(withLook({ skin: '#abcdef' }), 'closeup')
    expect(svg).toContain('role="img"')
    expect(svg).toContain('aria-label="x"')
    expect(svg).toContain('#abcdef')
  })

  it('a fixed frame is the same for every height; a fitted one follows the figure', () => {
    const box = (look: CharacterLook, frame: 'fit' | 'fixed') => /viewBox="([^"]+)"/.exec(renderToStaticMarkup(<CharacterArt look={look} mode="full" frame={frame} label="x" />))![1]
    expect(box(withLook({ height: 0.8 }), 'fixed')).toBe(box(withLook({ height: 1.3 }), 'fixed'))
    expect(box(withLook({ height: 0.8 }), 'fit')).not.toBe(box(withLook({ height: 1.3 }), 'fit'))
  })

  it('facing left mirrors the side view', () => {
    const left = renderToStaticMarkup(<CharacterArt look={defaultLook()} mode="full" view="side" facing="left" label="x" />)
    expect(left).toContain('scale(-1 1)')
    expect(renderToStaticMarkup(<CharacterArt look={defaultLook()} mode="full" view="front" facing="left" label="x" />)).not.toContain('scale(-1 1)')
  })
})

describe('normalizeLook', () => {
  it('gives every field a value of its own kind', () => {
    const look = normalizeLook({ skin: 'red', height: 9, width: 'wide', hair: ' ', eyeTilt: -90, streakColor: 'blue', marks: [{ id: 'a', kind: 'tattoo', strokes: [[[0, 0], [2, 3]]] }, 'x', { kind: 'bogus' }], outfit: { accessories: ['hat', 'hat', 3], colors: { top: '#112233', bottom: 'no' } } })
    expect(look.skin).toBe('#e0b08a')
    expect(look.height).toBe(1.3)
    expect(look.width).toBe(1)
    expect(look.hair).toBe('short')
    expect(look.eyeTilt).toBe(-20)
    expect(look.streakColor).toBeNull()
    expect(look.marks).toHaveLength(1)
    expect(look.marks[0].strokes).toEqual([[[0, 0], [1, 1]]])
    expect(look.outfit.accessories).toEqual(['hat'])
    expect(look.outfit.colors).toEqual({ top: '#112233' })
  })

  it('keeps an outfit slot that was taken off, and gives anything that is not a look the default', () => {
    expect(normalizeLook({ outfit: { top: null } }).outfit.top).toBeNull()
    expect(normalizeLook(null)).toEqual(defaultLook())
    expect(normalizeLook('x')).toEqual(defaultLook())
  })
})
