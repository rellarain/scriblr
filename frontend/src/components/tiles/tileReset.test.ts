import { describe, expect, it } from 'vitest'
import { getKv, setKv } from '../../settings/settingsStore'
import { resetTileLayout, tileLayoutKey } from './tileReset'

describe('putting a grid back where it began', () => {
  it('keeps a grid\'s layout under its own key', () => {
    expect(tileLayoutKey('characters.designer')).toBe('scriblr.tiles.characters.designer')
  })

  it('forgets where the tiles sit, which are minimized or maximized, and the order of the tab icons', () => {
    setKv(tileLayoutKey('g'), { tree: { id: 'a' }, shapes: { a: 'mini' }, maximized: 'a', order: ['b', 'a'] })
    resetTileLayout('g')
    expect(getKv(tileLayoutKey('g'))).toEqual({ tree: null, shapes: {}, maximized: null })
  })

  it('leaves another grid alone', () => {
    setKv(tileLayoutKey('other'), { tree: { id: 'x' }, shapes: {}, maximized: null })
    resetTileLayout('g')
    expect(getKv(tileLayoutKey('other'))).toEqual({ tree: { id: 'x' }, shapes: {}, maximized: null })
  })
})
