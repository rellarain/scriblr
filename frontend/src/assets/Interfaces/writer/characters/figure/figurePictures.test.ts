import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { cropAround, kindCrop, partBox } from './figurePictures'
import { blankFigure } from './figureState'

// What the dropdowns of pictures look through (phase 6c-5), on the basic model that comes with the app.
const content: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const blank = blankFigure('seed1', content)
const withEyes = (shape: string): CharacterFigure => ({ ...blank, forms: { ...blank.forms, 'eyes.shape': shape } })

describe('partBox', () => {
  it('is the place a part takes, a pair of eyes both sides of the mirror line', () => {
    const box = partBox(content, blank, 'eyes')!
    expect(box).not.toBeNull()
    for (const n of [box.x, box.y, box.w, box.h]) expect(Number.isFinite(n)).toBe(true)
    const axis = content.axis ?? 100
    expect(box.x).toBeLessThan(axis)
    expect(box.x + box.w).toBeGreaterThan(axis)
    // eyes sit in the head, above the mouth
    expect(box.y + box.h).toBeLessThan(partBox(content, blank, 'mouth')!.y)
  })

  it('is null for a part that nothing shows of (horns that are off)', () => {
    expect(partBox(content, blank, 'horns')).toBeNull()
  })

  it('follows the choice: a large eye takes more room than a small one', () => {
    const large = partBox(content, withEyes('large'), 'eyes')!
    const small = partBox(content, withEyes('small'), 'eyes')!
    expect(large.w * large.h).toBeGreaterThan(small.w * small.h)
  })
})

describe('cropAround', () => {
  it('takes the room of the part with every choice, a little room round it, so the pictures line up', () => {
    const figures = ['almond', 'round', 'large', 'small', 'narrow'].map(withEyes)
    const crop = cropAround(content, figures, 'eyes')
    expect(typeof crop).toBe('object')
    const box = (crop as { box: { x: number; y: number; w: number; h: number } }).box
    for (const f of figures) {
      const part = partBox(content, f, 'eyes')!
      expect(box.x).toBeLessThanOrEqual(part.x)
      expect(box.y).toBeLessThanOrEqual(part.y)
      expect(box.x + box.w).toBeGreaterThanOrEqual(part.x + part.w)
      expect(box.y + box.h).toBeGreaterThanOrEqual(part.y + part.h)
    }
  })

  it('is never smaller than a small area, so a part as small as an eye is not blown up past recognition', () => {
    const box = (cropAround(content, [blank], 'eyes') as { box: { w: number; h: number } }).box
    expect(box.w).toBeGreaterThanOrEqual(30)
    expect(box.h).toBeGreaterThanOrEqual(30)
  })

  it('keeps the middle of the part in the middle', () => {
    const part = partBox(content, blank, 'mouth')!
    const box = (cropAround(content, [blank], 'mouth') as { box: { x: number; y: number; w: number; h: number } }).box
    expect(box.x + box.w / 2).toBeCloseTo(part.x + part.w / 2, 1)
    expect(box.y + box.h / 2).toBeCloseTo(part.y + part.h / 2, 1)
  })

  it('looks at the bust when nothing shows with any choice', () => {
    expect(cropAround(content, [blank], 'horns')).toBe('bust')
    expect(cropAround(content, [], 'eyes')).toBe('bust')
  })
})

describe('kindCrop', () => {
  it('gives the proportions and the pose the whole figure, the face its head and the rest the bust', () => {
    for (const label of ['Age', 'Build', 'Pose', 'Outfit']) expect(kindCrop(label), label).toBe('figure')
    for (const label of ['Expression', 'Facial hair']) expect(kindCrop(label), label).toBe('head')
    for (const label of ['Hair style', 'Top']) expect(kindCrop(label), label).toBe('bust')
  })
})
