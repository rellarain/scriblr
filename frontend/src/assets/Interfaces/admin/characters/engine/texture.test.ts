import { describe, expect, it } from 'vitest'
import type { ModelPoint } from '../../../../../api/types'
import { build, pathText } from './geometry'
import { textureSpec, texturedPath } from './texture'

// a lock of hair: three roots across the top (no weight), the sides and the tip below (weighted)
const lock: ModelPoint[] = [
  { x: 80, y: 10, m: 's' }, { x: 100, y: 10, m: 's' }, { x: 120, y: 10, m: 's' },
  { x: 122, y: 30, m: 'c', w: 0.5 }, { x: 118, y: 52, m: 'c', w: 1 }, { x: 100, y: 58, m: 'c', w: 1 }, { x: 82, y: 52, m: 'c', w: 1 }, { x: 78, y: 30, m: 'c', w: 0.5 },
]
const built = build(lock, true)
const weights = lock.map(p => p.w)
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('the texture of hair (phase O7)', () => {
  it("reads an amount as straight or one of the old portrait's textures, 2A to 4C (4B a zigzag)", () => {
    expect(textureSpec(0)).toBeNull()
    expect(textureSpec(Number.NaN)).toBeNull()
    expect(textureSpec(-5)).toBeNull()
    expect(textureSpec(20)?.kind).toBe('wavy')
    expect(textureSpec(50)?.kind).toBe('curly')
    expect(textureSpec(75)?.kind).toBe('curly')
    expect(textureSpec(85)?.kind).toBe('zig')
    expect(textureSpec(99)?.kind).toBe('curly')
    // the old 2B: its waves 2.8 out and 16 apart in the old portrait's units, at 54/92 of the size
    expect(textureSpec(22)!.amp).toBeCloseTo(2.8 * 54 / 92, 5)
    expect(textureSpec(22)!.sp).toBeCloseTo(16 * 54 / 92, 5)
    // the curls close up as the amount rises
    expect(textureSpec(66)!.sp).toBeLessThan(textureSpec(34)!.sp)
    expect(textureSpec(99)!.sp).toBeLessThan(textureSpec(67)!.sp)
    for (let t = 0.5; t <= 120; t += 3.5) {
      const s = textureSpec(t)!
      expect(s.amp).toBeGreaterThan(0)
      expect(s.sp).toBeGreaterThan(0)
    }
  })

  it('draws the plain outline with no texture', () => {
    expect(texturedPath(built, true, weights, 0, 'lock')).toBe(pathText(built, true))
    expect(texturedPath(built, true, weights, Number.NaN, 'lock')).toBe(pathText(built, true))
    expect(texturedPath(built.slice(0, 2), true, weights, 50, 'lock')).toBe(pathText(built.slice(0, 2), true))
  })

  it('textures only the edges that hang: the roots stay a smooth line', () => {
    for (const amount of [15, 50, 80, 85, 99]) {
      const d = texturedPath(built, true, weights, amount, 'lock')
      expect(d).not.toBe(pathText(built, true))
      expect(d).not.toMatch(/NaN|undefined|Infinity/)
      // the path starts at the first root and runs along the roots as drawn
      expect(d.startsWith('M80 10L100 10L120 10')).toBe(true)
      expect(d.endsWith('Z')).toBe(true)
    }
    expect(texturedPath(built, true, weights, 50, 'lock')).toMatch(/Q/)       // curls bulge
    expect(texturedPath(built, true, weights, 85, 'lock')).toMatch(/L[^Z]*L/)  // a zigzag
  })

  it('stays close to the outline it textures', () => {
    for (const amount of [10, 30, 50, 70, 99]) {
      const n = numbers(texturedPath(built, true, weights, amount, 'lock')), spec = textureSpec(amount)!, pad = spec.amp * 3 + 1
      for (let i = 0; i < n.length; i += 2) {
        expect(n[i]).toBeGreaterThan(78 - pad); expect(n[i]).toBeLessThan(122 + pad)
        expect(n[i + 1]).toBeGreaterThan(10 - pad); expect(n[i + 1]).toBeLessThan(58 + pad)
      }
    }
  })

  it('is the same every time, and differs from one shape to another', () => {
    expect(texturedPath(built, true, weights, 50, 'lock')).toBe(texturedPath(built, true, weights, 50, 'lock'))
    expect(texturedPath(built, true, weights, 50, 'lock')).not.toBe(texturedPath(built, true, weights, 50, 'another lock'))
  })

  it('textures the whole outline of a shape with no weighted point, and an open outline along its run', () => {
    const cloud = build(lock.map(p => ({ ...p, w: undefined })), true)
    const d = texturedPath(cloud, true, [], 50, 'cloud')
    expect(d.startsWith('M80 10Q')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const open = texturedPath(build(lock, false), false, weights, 50, 'lock')
    expect(open.startsWith('M80 10')).toBe(true)
    expect(open.endsWith('Z')).toBe(false)
    expect(open).not.toMatch(/NaN|undefined/)
  })
})
