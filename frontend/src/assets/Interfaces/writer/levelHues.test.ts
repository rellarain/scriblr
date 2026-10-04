import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { autoPickHue, defaultProjectHue, hueCentre, levelHue, reconcileHues } from './levelHues'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, themeHue?: number): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, themeHue } as OutlineNode)
const byId = (nodes: OutlineNode[]) => new Map(nodes.map(n => [n.id, n]))

const PROJECT = 150

describe('levelHue', () => {
  const nodes = [
    node('s', 'series', null), node('b', 'book', 's', 210), node('a', 'arc', 'b'), node('c', 'chapter', 'a'),
    node('a2', 'arc', 'b', 250), node('c2', 'chapter', 'a2'), node('c3', 'chapter', 'b', 190),
  ]
  const map = byId(nodes)

  it("falls back to the parent's hue until a node has its own", () => {
    expect(levelHue(nodes[0], map, PROJECT)).toBe(PROJECT) // a series with none shows the project's
    expect(levelHue(nodes[2], map, PROJECT)).toBe(210) // an arc with none shows its book's
    expect(levelHue(nodes[3], map, PROJECT)).toBe(210) // so does its chapter
    expect(levelHue(nodes[5], map, PROJECT)).toBe(250) // a chapter shows its arc's own
    expect(levelHue(nodes[6], map, PROJECT)).toBe(190) // and its own over that
  })

  it("keeps a book's own hue (or the book default) whatever its series is", () => {
    expect(levelHue(node('lone', 'book', null), byId([]), PROJECT)).toBe(28)
    expect(levelHue(nodes[1], map, PROJECT)).toBe(210)
  })
})

describe('hueCentre', () => {
  it('is the parent level for series, arcs and chapters, and none for a book', () => {
    const nodes = [node('s', 'series', null), node('b', 'book', 's', 210), node('a', 'arc', 'b', 250), node('c', 'chapter', 'a')]
    const map = byId(nodes)
    expect(hueCentre(nodes[0], map, PROJECT)).toBe(PROJECT)
    expect(hueCentre(nodes[1], map, PROJECT)).toBeNull()
    expect(hueCentre(nodes[2], map, PROJECT)).toBe(210)
    expect(hueCentre(nodes[3], map, PROJECT)).toBe(250)
  })
})

describe('autoPickHue', () => {
  it('spreads siblings out across the window', () => {
    const first = autoPickHue(200, [])
    expect(Math.abs(first - 200)).toBe(60) // the first sibling is as far from the centre as the window allows
    const second = autoPickHue(200, [first])
    expect(Math.abs(second - first)).toBeGreaterThanOrEqual(100)
    const third = autoPickHue(200, [first, second])
    expect([first, second]).not.toContain(third)
    for (const h of [first, second, third]) expect(Math.abs(((h - 200 + 540) % 360) - 180)).toBeLessThanOrEqual(60)
  })

  it('stays inside the window across the 0/360 wrap', () => {
    const h = autoPickHue(350, [])
    const d = ((h - 350 + 540) % 360) - 180
    expect(Math.abs(d)).toBeLessThanOrEqual(60)
  })
})

describe('reconcileHues', () => {
  it("pulls children back inside their window when a parent moves, top-down", () => {
    const nodes = [node('b', 'book', null, 200), node('a', 'arc', 'b', 230), node('c', 'chapter', 'a', 280)]
    expect(reconcileHues(nodes, PROJECT).map(n => n.themeHue)).toEqual([200, 230, 280])
    // The book moves to 100: its arc must come within 60 (to 160), then its chapter within 60 of that (to 220).
    const moved = nodes.map(n => (n.id === 'b' ? { ...n, themeHue: 100 } : n))
    expect(reconcileHues(moved, PROJECT).map(n => n.themeHue)).toEqual([100, 160, 220])
  })

  it('leaves nodes with no hue of their own, books, and an unchanged tree alone', () => {
    const nodes = [node('b', 'book', null, 10), node('a', 'arc', 'b'), node('c', 'chapter', 'a', 40)]
    const out = reconcileHues(nodes, PROJECT)
    expect(out[1].themeHue).toBeUndefined()
    expect(out[2]).toBe(nodes[2])
  })

  it('holds a series within the project hue window', () => {
    expect(reconcileHues([node('s', 'series', null, 300)], PROJECT)[0].themeHue).toBe(210)
  })
})

describe('defaultProjectHue', () => {
  it('is offset from the app theme hue and wraps', () => {
    expect(defaultProjectHue(330)).toBe(90)
  })
})
