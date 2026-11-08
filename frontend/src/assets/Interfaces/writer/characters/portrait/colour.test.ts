import { describe, expect, it } from 'vitest'
import { contrast, fromHsl, luminance, readableInk } from './colour'

describe('contrast', () => {
  it('is the WCAG ratio: 21 for black on white, 1 for a colour on itself, the same either way round', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#3a7bd5', '#3a7bd5')).toBe(1)
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 5)
    // a known pair: mid-grey #767676 on white is the classic 4.54 to 1
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 1)
  })
})

describe('readableInk', () => {
  it('is dark on a light colour and light on a dark one, in the colour of the background', () => {
    const onPastel = readableInk('#cfe0dc'), onNavy = readableInk('#1b2a4a')
    expect(luminance(onPastel)).toBeLessThan(0.1)
    expect(luminance(onNavy)).toBeGreaterThan(0.8)
    // a tone of the same hue, not a grey: the green pastel's ink is greener than it is red
    const [, g, b] = [1, 3, 5].map(i => parseInt(onPastel.slice(i, i + 2), 16))
    expect(g).toBeGreaterThanOrEqual(b - 2)
  })

  it('reaches 4.5 to 1 on every colour: a sweep of hue, saturation and lightness, mid-tones included', () => {
    let worst = Infinity
    for (let hue = 0; hue < 360; hue += 15) {
      for (const sat of [0, 0.15, 0.35, 0.6, 0.85, 1]) {
        for (let light = 0; light <= 1.0001; light += 0.025) {
          const bg = fromHsl(hue / 360, sat, Math.min(1, light))
          const ratio = contrast(readableInk(bg), bg)
          worst = Math.min(worst, ratio)
          expect(ratio, `${bg} (h${hue} s${sat} l${light.toFixed(3)})`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
    // (the mid-tone where black and white tie is 4.58 to 1: the sweep has to have been there)
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it('is black or white on the mid-tones that no tinted tone can be read on (luminance between about 0.164 and 0.207), and a tone of the hue either side of them', () => {
    for (const bg of ['#767676', '#777777', '#757575', '#7a7a7a']) {
      expect(['#000000', '#ffffff']).toContain(readableInk(bg))
      expect(contrast(readableInk(bg), bg)).toBeGreaterThanOrEqual(4.5)
    }
    for (const bg of ['#606060', '#909090']) expect(['#000000', '#ffffff']).not.toContain(readableInk(bg))
  })

  it('reads colours in the swatches of the tile', () => {
    for (const bg of ['#e6d6c3', '#cfe0dc', '#e9d39a', '#d9e6f2', '#cfd8e8', '#e7c9b8', '#d5dde2', '#ece0c8', '#f0d4c4', '#cfe0c8', '#d9d0ec', '#f2dcc0']) {
      expect(contrast(readableInk(bg), bg)).toBeGreaterThanOrEqual(7)
    }
  })
})
