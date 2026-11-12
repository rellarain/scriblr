// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { readableInk } from '../portrait/colour'
import { cardFileName, cardPng, cardSvg, downloadCard, type CardOptions } from './figureExport'
import { blankFigure, drawFigure } from './figureState'

const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('../../maps/mapExport', () => ({ saveBlob }))
vi.setConfig({ testTimeout: 30000 })

// The card as a PNG (phase 6c-5): the SVG it is drawn from, and the drawing and saving of it.
const content: ModelContent = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../../../../backend/app/seed/basic_model.json'), 'utf-8'))
const figure: CharacterFigure = { ...blankFigure('seed1', content), tile: '#2a3b5c' }
const plain: CardOptions = { transparent: false, name: null, caption: '' }
const named: CardOptions = { transparent: false, name: 'Ada Marsh', caption: 'Navigator · age 29' }

afterEach(() => { vi.restoreAllMocks(); saveBlob.mockClear() })

describe('cardSvg', () => {
  it('is the card framed as chosen, 1024 pixels on its longer side, in the aspect of the frame', () => {
    for (const crop of ['figure', { frame: content.frames![1].id }] as const) {
      const { width, height } = cardSvg(content, figure, crop, 'front', plain)
      const { box } = drawFigure(content, figure, crop, 'front', false)
      expect(Math.max(width, height)).toBe(1024)
      expect(width / height).toBeCloseTo(box.w / box.h, 2)
    }
  })

  it('is well-formed SVG with every number finite and no stylesheet to depend on', () => {
    const { svg } = cardSvg(content, figure, 'figure', 'front', named)
    expect(svg).not.toMatch(/NaN|undefined|Infinity|null/)
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(svg).not.toMatch(/var\(|class=/)
    // every shape that is drawn (not a clip or a cut-out) carries its own fill
    const drawn = [...doc.querySelectorAll('path')].filter(p => !p.closest('clipPath') && !p.closest('mask'))
    expect(drawn.length).toBeGreaterThan(20)
    for (const p of drawn) expect(p.getAttribute('fill'), p.getAttribute('d')?.slice(0, 20)).toBeTruthy()
  })

  it('has the tile colour behind the figure, and none when the background is transparent', () => {
    const solid = cardSvg(content, figure, 'figure', 'front', plain).svg
    const clear = cardSvg(content, figure, 'figure', 'front', { ...plain, transparent: true }).svg
    expect(solid).toContain('fill="#2a3b5c"')
    expect(clear).not.toContain('#2a3b5c')
    // the card is still a rounded tile either way
    expect(clear).toMatch(/<clipPath id="card"><rect [^>]*rx="\d+"/)
  })

  it('writes the name and the line under it on the tile colour, in an ink that can be read on it', () => {
    const without = cardSvg(content, figure, 'figure', 'front', plain)
    const withName = cardSvg(content, figure, 'figure', 'front', named)
    expect(without.svg).not.toContain('<text')
    expect(withName.svg).toContain('>Ada Marsh</text>')
    expect(withName.svg).toContain('>Navigator · age 29</text>')
    expect(withName.svg).toContain(`fill="${readableInk('#2a3b5c')}"`)
    expect(withName.width).toBe(without.width)
    expect(withName.height).toBeGreaterThan(without.height)
    // a name with no line under it is a shorter strip
    const bare = cardSvg(content, figure, 'figure', 'front', { ...named, caption: '' })
    expect(bare.height).toBeLessThan(withName.height)
    expect(bare.svg).not.toContain('age 29')
  })

  it('escapes the name and keeps a very long one short', () => {
    const odd = cardSvg(content, figure, 'figure', 'front', { transparent: false, name: 'A & <B> "C"', caption: '' }).svg
    expect(odd).toContain('A &amp; &lt;B&gt; &quot;C&quot;')
    expect(new DOMParser().parseFromString(odd, 'image/svg+xml').querySelector('parsererror')).toBeNull()
    const long = cardSvg(content, figure, 'figure', 'front', { transparent: false, name: 'N'.repeat(80), caption: '' }).svg
    const shown = /<text[^>]*>(N+…?)<\/text>/.exec(long)![1]
    expect(shown.length).toBeLessThanOrEqual(36)
    expect(shown.endsWith('…')).toBe(true)
  })

  it('is the card as it looks from behind in the back view', () => {
    expect(cardSvg(content, figure, 'figure', 'back', plain).svg).not.toBe(cardSvg(content, figure, 'figure', 'front', plain).svg)
  })

  it('has a name that is only spaces count for no name', () => {
    expect(cardSvg(content, figure, 'figure', 'front', { transparent: false, name: '   ', caption: 'x' }).svg).not.toContain('<text')
  })
})

describe('cardFileName', () => {
  it('is the name with what a file cannot hold left out', () => {
    expect(cardFileName('Ada Marsh')).toBe('Ada-Marsh-card.png')
    expect(cardFileName('a/b:c?')).toBe('abc-card.png')
    expect(cardFileName('')).toBe('character-card.png')
    expect(cardFileName('???')).toBe('character-card.png')
    expect(cardFileName('x'.repeat(100)).length).toBeLessThanOrEqual(60 + '-card.png'.length)
  })
})

// jsdom draws nothing, so the browser's parts are stood in for: a picture that loads when it is given something to load, and a canvas that hands back a PNG.
function browser(o: { loads?: boolean; context?: boolean } = {}) {
  const drawn: unknown[][] = []
  const size = { w: 0, h: 0 }
  URL.createObjectURL = vi.fn(() => 'blob:card')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(_: string) { queueMicrotask(() => (o.loads === false ? this.onerror?.() : this.onload?.())) }
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    size.w = this.width; size.h = this.height
    return o.context === false ? null : ({ drawImage: (...a: unknown[]) => { drawn.push(a) } } as unknown as CanvasRenderingContext2D)
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob(['png'], { type: 'image/png' })))
  return { drawn, size }
}

describe('cardPng', () => {
  it('draws the card on a canvas of its own size and gives the PNG', async () => {
    const b = browser()
    const { width, height } = cardSvg(content, figure, 'figure', 'front', named)
    const blob = await cardPng(content, figure, 'figure', 'front', named)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob!.type).toBe('image/png')
    expect(b.size).toEqual({ w: width, h: height })
    expect(b.drawn).toHaveLength(1)
    expect(b.drawn[0].slice(1)).toEqual([0, 0, width, height])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card')
  })

  it('is null, and lets the object URL go, when the picture cannot be loaded, the canvas cannot draw or the browser cannot make a URL', async () => {
    browser({ loads: false })
    expect(await cardPng(content, figure, 'figure', 'front', plain)).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card')
    browser({ context: false })
    expect(await cardPng(content, figure, 'figure', 'front', plain)).toBeNull()
    URL.createObjectURL = vi.fn(() => { throw new Error('no') })
    const revoke = (URL.revokeObjectURL = vi.fn())
    expect(await cardPng(content, figure, 'figure', 'front', plain)).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
  })
})

describe('downloadCard', () => {
  it('saves the PNG under the file name', async () => {
    browser()
    expect(await downloadCard(content, figure, 'figure', 'front', plain, 'Ada-card.png')).toBe('saved')
    expect(saveBlob).toHaveBeenCalledTimes(1)
    expect(saveBlob.mock.calls[0][1]).toBe('Ada-card.png')
  })

  it('says it is unavailable, and saves nothing, when the card cannot be drawn', async () => {
    browser({ loads: false })
    expect(await downloadCard(content, figure, 'figure', 'front', plain, 'x.png')).toBe('unavailable')
    expect(saveBlob).not.toHaveBeenCalled()
  })
})
