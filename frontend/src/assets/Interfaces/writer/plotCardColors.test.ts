import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../api/types'
import { DEFAULT_BOOK_HUE } from '../../../theme/bookColors'
import { bookHuesOf } from './plotCardColors'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, themeHue: number | null = null): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, themeHue } as OutlineNode)

describe('bookHuesOf', () => {
  it("is the chapter's book's colour: its own, else its series', else the project's", () => {
    const nodes = [
      node('s', 'series', null, 120), node('own', 'book', 's', 40), node('kin', 'book', 's'), node('lone', 'book', null),
      node('c1', 'chapter', 'own'), node('c2', 'chapter', 'kin'), node('c3', 'chapter', 'lone'),
    ]
    expect(['c1', 'c2', 'c3'].map(id => bookHuesOf(id, nodes, 300).themeHue)).toEqual([40, 120, 300])
    expect(bookHuesOf('c2', nodes, 300).book?.id).toBe('kin')
  })

  it("falls back to the project's hue when the series has none, and to the default with no project hue", () => {
    const nodes = [node('s', 'series', null), node('b', 'book', 's'), node('c', 'chapter', 'b')]
    expect(bookHuesOf('c', nodes, 300).themeHue).toBe(300)
    expect(bookHuesOf('c', nodes).themeHue).toBe(DEFAULT_BOOK_HUE)
  })
})
