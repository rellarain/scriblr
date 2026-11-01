import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { autoPickHue, defaultProjectHue, dropSeriesHues, fitToParent, hueCentre, levelHue, levelRange, levelTint, rangeCapOf, reconcileHues } from './levelHues'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, themeHue?: number, hueRange?: number): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, themeHue, hueRange } as OutlineNode)
const byId = (nodes: OutlineNode[]) => new Map(nodes.map(n => [n.id, n]))

const PROJECT = 150

describe('levelHue', () => {
  const nodes = [
    node('s', 'series', null), node('b', 'book', 's', 210), node('a', 'arc', 'b'), node('c', 'chapter', 'a'),
    node('a2', 'arc', 'b', 250), node('c2', 'chapter', 'a2'), node('c3', 'chapter', 'b', 190),
  ]
  const map = byId(nodes)

  it("falls back to the parent's colour until a node has its own", () => {
    expect(levelHue(nodes[0], map, PROJECT)).toBe(PROJECT) // a series shows the project's
    expect(levelHue(nodes[2], map, PROJECT)).toBe(210) // an arc with none shows its book's
    expect(levelHue(nodes[3], map, PROJECT)).toBe(210) // so does its chapter
    expect(levelHue(nodes[5], map, PROJECT)).toBe(250) // a chapter shows its arc's own
    expect(levelHue(nodes[6], map, PROJECT)).toBe(190) // and its own over that
  })

  it("keeps a book's own colour (a book with none inherits the project's) whatever its series is", () => {
    expect(levelHue(node('lone', 'book', null), byId([]), PROJECT)).toBe(PROJECT)
    expect(levelHue(nodes[1], map, PROJECT)).toBe(210)
  })

  it('has no colour for a series, whatever is stored on it: it shows the project\'s', () => {
    expect(levelHue(node('s2', 'series', null, 300), byId([]), PROJECT)).toBe(PROJECT)
  })
})

describe('hueCentre', () => {
  it('is the hue the parent shows: the project\'s for a book (its series has no colour), a book\'s for an arc, an arc\'s for a chapter', () => {
    const nodes = [node('s', 'series', null), node('b', 'book', 's', 210), node('a', 'arc', 'b', 250), node('c', 'chapter', 'a')]
    const map = byId(nodes)
    expect(hueCentre(nodes[0], map, PROJECT)).toBeNull() // a series has no colour
    expect(hueCentre(nodes[1], map, PROJECT)).toBe(150) // a book is measured from the project through its series
    expect(hueCentre(nodes[2], map, PROJECT)).toBe(210)
    expect(hueCentre(nodes[3], map, PROJECT)).toBe(250)
  })

  it('is the project\'s hue for a book outside any series, and the book\'s for a chapter outside an arc', () => {
    const nodes = [node('b', 'book', null, 100), node('c', 'chapter', 'b')]
    const map = byId(nodes)
    expect(hueCentre(nodes[0], map, PROJECT)).toBe(150)
    expect(hueCentre(nodes[1], map, PROJECT)).toBe(100)
  })
})

describe('autoPickHue', () => {
  it('spreads siblings out across the range', () => {
    const first = autoPickHue(200, [], 60)
    expect(Math.abs(first - 200)).toBe(60)
    const second = autoPickHue(200, [first], 60)
    expect(Math.abs(second - first)).toBeGreaterThanOrEqual(100)
    const third = autoPickHue(200, [first, second], 60)
    expect([first, second]).not.toContain(third)
    for (const h of [first, second, third]) expect(Math.abs(((h - 200 + 540) % 360) - 180)).toBeLessThanOrEqual(60)
  })

  it('stays inside a narrower range, and across the 0/360 wrap', () => {
    const h = autoPickHue(350, [], 30)
    expect(Math.abs(((h - 350 + 540) % 360) - 180)).toBeLessThanOrEqual(30)
    expect(Math.abs(((autoPickHue(350, [], 60) - 350 + 540) % 360) - 180)).toBeLessThanOrEqual(60)
  })
})

describe('fitToParent', () => {
  it('holds the hue in its range', () => {
    expect(fitToParent(300, 200, 60)).toBe(260)
    expect(fitToParent(230, 200, 60)).toBe(230)
    expect(fitToParent(300, 200, 30)).toBe(230)
    expect(fitToParent(300, 200, 90)).toBe(290)
  })

  it('does not hold a node with no centre', () => {
    expect(fitToParent(300, null, 60)).toBe(300)
  })
})

describe('reconcileHues', () => {
  it('pulls children back inside their ranges when a parent moves, top-down', () => {
    const nodes = [node('b', 'book', null, 200), node('a', 'arc', 'b', 230), node('c', 'chapter', 'a', 250)]
    expect(reconcileHues(nodes, PROJECT).map(n => n.themeHue)).toEqual([200, 230, 250])
    // The book moves to 100: its arc must come within 60 (to 160), then its chapter within 30 of that (to 190).
    const moved = nodes.map(n => (n.id === 'b' ? { ...n, themeHue: 100 } : n))
    expect(reconcileHues(moved, PROJECT).map(n => n.themeHue)).toEqual([100, 160, 190])
  })

  it('holds a book within 90 of the project\'s hue', () => {
    expect(reconcileHues([node('b', 'book', null, 10)], PROJECT)[0].themeHue).toBe(60)
    expect(reconcileHues([node('b', 'book', null, 300)], PROJECT)[0].themeHue).toBe(240)
    expect(reconcileHues([node('b', 'book', null, 100)], PROJECT)[0].themeHue).toBe(100)
  })

  it('leaves nodes with no colour of their own, and an unchanged tree, alone', () => {
    const nodes = [node('b', 'book', null, 120), node('a', 'arc', 'b'), node('c', 'chapter', 'a', 140)]
    const out = reconcileHues(nodes, PROJECT)
    expect(out[1].themeHue).toBeUndefined()
    expect(out[2]).toBe(nodes[2])
  })

  it('moves only what is under `fromId`: a colour already outside its range elsewhere stays until it, or its parent, is changed', () => {
    const nodes = [node('b1', 'book', null, 200), node('a1', 'arc', 'b1', 350), node('b2', 'book', null, 200), node('a2', 'arc', 'b2', 350)]
    expect(reconcileHues(nodes, PROJECT, 'b1').map(n => n.themeHue)).toEqual([200, 260, 200, 350])
    expect(reconcileHues(nodes, PROJECT).map(n => n.themeHue)).toEqual([200, 260, 200, 260])
    // The node itself is not moved, even when it is outside its range.
    expect(reconcileHues([node('b', 'book', null, 10), node('a', 'arc', 'b', 40)], PROJECT, 'b').map(n => n.themeHue)).toEqual([10, 40])
  })

  it('clears a series colour, and dropSeriesHues does the same without a project hue', () => {
    expect(reconcileHues([node('s', 'series', null, 300)], PROJECT)[0].themeHue).toBeNull()
    const nodes = [node('s', 'series', null, 300), node('b', 'book', 's', 100)]
    expect(dropSeriesHues(nodes).map(n => n.themeHue)).toEqual([null, 100])
    const clean = [node('s', 'series', null), node('b', 'book', 's', 100)]
    expect(dropSeriesHues(clean)).toBe(clean)
  })
})

describe('levelTint', () => {
  it('is a colour in CSS', () => {
    expect(levelTint(node('b', 'book', null, 100), byId([]), PROJECT)).toMatch(/hsl/)
  })
})

describe('defaultProjectHue', () => {
  it('is a hue offset from the app theme hue, and wraps', () => {
    expect(defaultProjectHue(330)).toBe(90)
    expect(defaultProjectHue(240)).toBe(0)
  })
})

describe('levelRange', () => {
  it('is the range a node chose, else its kind default, never wider than its parent', () => {
    const nodes = [node('s', 'series', null), node('b', 'book', 's', 210), node('a', 'arc', 'b'), node('c', 'chapter', 'a'), node('c2', 'chapter', 'a', 200, 120)]
    const map = byId(nodes)
    expect(levelRange(nodes[1], map, 360)).toBe(90) // a book, the default
    expect(levelRange(nodes[2], map, 360)).toBe(60)
    expect(levelRange(nodes[3], map, 360)).toBe(30)
    expect(levelRange(nodes[4], map, 360)).toBe(60) // chose 120 under an arc of 60
    expect(rangeCapOf(nodes[3], map, 360)).toBe(60)
    expect(rangeCapOf(nodes[1], map, 360)).toBe(360) // a book's parent is a series with no colour: the project's
    expect(rangeCapOf(nodes[1], map, 60)).toBe(60)
    expect(levelRange(nodes[1], map, 60)).toBe(60) // the project's range holds a book of 90 to 60
  })
})

describe('reconcileHues with ranges of their own', () => {
  it('holds an own hue in the range the node chose, not the default', () => {
    const nodes = [node('b', 'book', null, 200, 120), node('a', 'arc', 'b', 330, 120)]
    // The arc may reach 120 either side of 200 only if its parent allows: the book's 120 holds
    expect(reconcileHues(nodes, PROJECT, 'b').map(n => n.themeHue)).toEqual([200, 320])
  })

  it('lowers a stored range wider than its parent, and the hue with it', () => {
    const nodes = [node('b', 'book', null, 200, 30), node('a', 'arc', 'b', 260, 90)]
    const [book, arc] = reconcileHues(nodes, PROJECT, 'b')
    expect(book.hueRange).toBe(30)
    expect(arc.hueRange).toBe(30)
    expect(arc.themeHue).toBe(230)
  })

  it('never moves a node whose range is 180 or 360, whatever the parent does', () => {
    const wide = [node('b', 'book', null, 10, 180), node('a', 'arc', 'b', 190, 180), node('c', 'chapter', 'a', 20, 180)]
    expect(reconcileHues(wide, PROJECT, 'b').map(n => n.themeHue)).toEqual([10, 190, 20])
    const whole = [node('b', 'book', null, 10, 360), node('a', 'arc', 'b', 190, 360)]
    expect(reconcileHues(whole, PROJECT).map(n => n.themeHue)).toEqual([10, 190])
  })

  it('holds the books to the range of the project', () => {
    const nodes = [node('b', 'book', null, 200, 90)]
    expect(reconcileHues(nodes, PROJECT, undefined, 30)[0].hueRange).toBe(30)
    expect(reconcileHues(nodes, PROJECT, undefined, 30)[0].themeHue).toBe(180)
  })

  it('leaves an inheriting node alone (it follows the parent live)', () => {
    const nodes = [node('b', 'book', null), node('a', 'arc', 'b')]
    expect(reconcileHues(nodes, PROJECT)).toEqual(nodes)
  })
})
