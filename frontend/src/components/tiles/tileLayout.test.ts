import { describe, expect, it } from 'vitest'
import { applyLayout, type TileMeta } from './tileLayout'

const defs: TileMeta[] = [
  { id: 'plot', defaultShape: 'mid' },
  { id: 'outline', defaultShape: 'mid' },
  { id: 'editor', defaultShape: 'mini' },
]
const ids = (l: ReturnType<typeof applyLayout>) => l.map(t => t.def.id)

describe('applyLayout', () => {
  it('uses the defaults when nothing is saved', () => {
    const l = applyLayout(defs, undefined)
    expect(ids(l)).toEqual(['plot', 'outline', 'editor'])
    expect(l.map(t => t.shape)).toEqual(['mid', 'mid', 'mini'])
  })

  it('follows the saved order and shapes', () => {
    const l = applyLayout(defs, { order: ['editor', 'plot', 'outline'], shapes: { plot: 'mini', outline: 'mid' } })
    expect(ids(l)).toEqual(['editor', 'plot', 'outline'])
    expect(l.find(t => t.def.id === 'plot')!.shape).toBe('mini')
    expect(l.find(t => t.def.id === 'outline')!.shape).toBe('mid')
  })

  it('drops tiles that no longer exist, ignores duplicates and appends new tiles', () => {
    const l = applyLayout(defs, { order: ['gone', 'outline', 'outline', 'plot'], shapes: {} })
    expect(ids(l)).toEqual(['outline', 'plot', 'editor'])
  })

  it('falls back to the default shape when the saved value is not a valid shape', () => {
    const l = applyLayout(defs, { order: [], shapes: { editor: 'landscape', plot: 'nonsense' } })
    expect(l.find(t => t.def.id === 'editor')!.shape).toBe('mini')
    expect(l.find(t => t.def.id === 'plot')!.shape).toBe('mid')
  })
})
