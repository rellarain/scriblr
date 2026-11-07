import { describe, expect, it } from 'vitest'
import { defaultPortrait } from './defaults'
import { AGES, BUILDS, HEADS } from './library'
import { agePortrait } from './age'
import { APEX, faceX, headOutline, rigOf, skull } from './rig'

const rig = (over: Record<string, unknown> = {}) => rigOf({ ...defaultPortrait(), ...over } as never)

describe('the proportions of the head', () => {
  it('put the eyes halfway down an adult head, and the head at about a half of the tile', () => {
    const g = rig()
    expect((g.eyeY - g.top) / g.H).toBeCloseTo(0.5, 2)
    expect(g.H).toBeGreaterThan(85)
    expect(g.H).toBeLessThan(100)
    expect(g.top).toBeGreaterThan(10)
    expect(g.chin).toBeLessThan(150)
  })

  it('go in order from the crown to the chin for every age, build and head shape', () => {
    for (const age of AGES) for (const build of BUILDS) for (const head of HEADS) {
      const g = rig({ age: age.id, build: build.id, headShape: head.id })
      const what = `${age.id} ${build.id} ${head.id}`
      expect(g.top, what).toBeLessThan(g.browY)
      expect(g.browY, what).toBeLessThan(g.eyeY)
      expect(g.eyeY, what).toBeLessThan(g.noseY)
      expect(g.noseY, what).toBeLessThan(g.mouthY)
      expect(g.mouthY, what).toBeLessThan(g.chin)
      expect(g.chin, what).toBeLessThan(g.neckBase)
      expect(g.neckBase, what).toBeLessThan(g.shoulderY + 1)
      expect(g.neck, what).toBeGreaterThan(5)
      expect(g.W, what).toBeGreaterThan(20)
      expect(g.W, what).toBeLessThan(60)
    }
  })

  it('give a child a larger head and lower eyes than an adult, a shorter neck and narrower shoulders', () => {
    const baby = rig({ age: 'infant' }), child = rig({ age: 'child' }), adult = rig()
    expect(baby.H).toBeGreaterThan(adult.H)
    expect((baby.eyeY - baby.top) / baby.H).toBeGreaterThan(0.55)
    expect((child.eyeY - child.top) / child.H).toBeGreaterThan(0.5)
    expect(baby.neckBase - baby.chin).toBeLessThan(child.neckBase - child.chin)
    expect(child.neckBase - child.chin).toBeLessThan(adult.neckBase - adult.chin)
    expect(baby.S).toBeLessThan(child.S)
    expect(child.S).toBeLessThan(adult.S)
  })

  it('draw lines on an older face and none on a young one', () => {
    expect(rig({ age: 'child' }).lines).toBe(0)
    expect(rig({ age: 'elderly' }).lines).toBeGreaterThan(rig({ age: 'middle' }).lines)
  })

  it('widen the head with the slider, and the eyes with their sliders', () => {
    expect(rig({ headWidth: 1.12 }).W).toBeGreaterThan(rig({ headWidth: 0.88 }).W)
    expect(rig({ eyeSize: 1.3 }).eyeHW).toBeGreaterThan(rig({ eyeSize: 0.75 }).eyeHW)
    expect(rig({ eyeSpacing: 1.18 }).eyeCX).toBeGreaterThan(rig({ eyeSpacing: 0.85 }).eyeCX)
  })
})

describe('the outline of the head', () => {
  it('is a superellipse at the crown, rounder than an egg', () => {
    expect(APEX).toBeGreaterThan(2.5)
    const g = rig()
    const [topX, topY] = skull(g, 90, 0)
    expect(topX).toBeCloseTo(100, 5)
    expect(topY).toBeCloseTo(g.top, 0)
    const [sideX] = skull(g, 0, 0)
    expect(sideX).toBeCloseTo(100 + g.sk.rx, 5)
    // At 45 degrees a superellipse of this exponent lies farther out than an ellipse does.
    const [dx, dy] = skull(g, 45, 0)
    const ellipse = (dx - 100) ** 2 / g.sk.rx ** 2 + (g.sk.cy - dy) ** 2 / g.sk.ry ** 2
    expect(ellipse).toBeGreaterThan(1.02)
  })

  it('runs from the crown down the right side to the chin, with finite points', () => {
    for (const age of AGES) {
      const g = rig({ age: age.id })
      const outline = headOutline(g)
      expect(outline[0][1]).toBeCloseTo(g.top, 0)
      expect(outline[outline.length - 1]).toEqual([100, g.chin])
      for (const [x, y] of outline) { expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true); expect(x).toBeGreaterThanOrEqual(100) }
    }
  })

  it('has a width at every height that is zero above the crown and the chin width at the bottom', () => {
    const g = rig()
    expect(faceX(g, g.top - 5)).toBe(0)
    expect(faceX(g, g.eyeY)).toBeGreaterThan(g.W * 0.8)
    expect(faceX(g, g.chin + 5)).toBeCloseTo(g.chinW, 5)
  })
})

describe('ageing a portrait', () => {
  it('moves the age and nothing else of a portrait that needs nothing', () => {
    const p = { ...defaultPortrait(), hairColor: '#202020' }
    const older = agePortrait(p, 'middle')
    expect(older).toMatchObject({ age: 'middle', hairColor: '#202020', skin: p.skin })
    expect(agePortrait(p, 'adult')).toBe(p)
    expect(agePortrait(p, 'nonsense')).toBe(p)
  })

  it('takes the beard off anyone younger than a teen, and leaves it from a teen on', () => {
    const p = { ...defaultPortrait(), facialHair: 'full' }
    expect(agePortrait(p, 'child').facialHair).toBe('none')
    expect(agePortrait(p, 'infant').facialHair).toBe('none')
    expect(agePortrait(p, 'teen').facialHair).toBe('full')
    expect(agePortrait(p, 'elderly').facialHair).toBe('full')
  })

  it('gives a greying set by hand back to the age when it would look wrong', () => {
    const none = { ...defaultPortrait(), greying: 'none' }
    expect(agePortrait(none, 'elderly').greying).toBe('auto')
    expect(agePortrait(none, 'teen').greying).toBe('none')
    const white = { ...defaultPortrait(), greying: 'white', age: 'elderly' }
    expect(agePortrait(white, 'child').greying).toBe('auto')
    expect(agePortrait(white, 'older').greying).toBe('auto')
    // Older, with as much grey as the age brings or more, keeps the greying that was chosen; with less, it is the age's again.
    const grey = { ...defaultPortrait(), greying: 'grey', age: 'middle' }
    expect(agePortrait(grey, 'older').greying).toBe('grey')
    const salt = { ...defaultPortrait(), greying: 'salt', age: 'middle' }
    expect(agePortrait(salt, 'older').greying).toBe('auto')
    expect(agePortrait(salt, 'elderly').greying).toBe('auto')
    expect(agePortrait({ ...defaultPortrait(), greying: 'auto' }, 'elderly').greying).toBe('auto')
  })

  it('never changes the portrait it was given', () => {
    const p = { ...defaultPortrait(), facialHair: 'full', greying: 'none' }
    const copy = structuredClone(p)
    agePortrait(p, 'child')
    expect(p).toEqual(copy)
  })
})
