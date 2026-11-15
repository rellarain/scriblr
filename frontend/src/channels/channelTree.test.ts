import { describe, expect, it } from 'vitest'
import type { ResourceNode } from '../api/types'
import { childrenOf, indexChannels, labelOf, movedBefore, nearest, nudged, pathOf, subtreeIds } from './channelTree'

const n = (id: string, kind: ResourceNode['kind'], order: number, name: string): ResourceNode => ({
  id, kind, order, name, parentId: id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : null,
})

const NODES = [
  n('writer', 'interface', 0, 'Writer'),
  n('writer/draft', 'console', 1, 'Draft'),
  n('writer/dashboard', 'console', 0, 'Dashboard'),
  n('writer/draft/draft', 'component', 0, 'Draft'),
  n('writer/draft/draft/autosave', 'feature', 0, 'Autosave'),
  n('writer/draft/settings', 'component', 1, ''),
  { ...n('lost/child', 'console', 0, 'Orphan'), parentId: 'lost' },
]

describe('the channel tree', () => {
  const index = indexChannels(NODES)

  it('lists children in order and leaves orphans out', () => {
    expect(childrenOf(index, null).map(c => c.id)).toEqual(['writer'])
    expect(childrenOf(index, 'writer').map(c => c.id)).toEqual(['writer/dashboard', 'writer/draft'])
  })

  it('names a node by its path, falling back to the kind for a blank name and to the id when unknown', () => {
    expect(pathOf(index, 'writer/draft/draft/autosave').map(p => p.name)).toEqual(['Writer', 'Draft', 'Draft', 'Autosave'])
    expect(labelOf(index, 'writer/draft/settings')).toBe('Writer > Draft > Component')
    expect(labelOf(index, 'nope/x')).toBe('nope/x')
    expect(labelOf(index, null)).toBe('')
  })

  it('finds the nearest node that still exists', () => {
    expect(nearest(index, 'writer/draft/draft/gone')?.id).toBe('writer/draft/draft')
    expect(nearest(index, 'writer/project/plot')?.id).toBe('writer')
    expect(nearest(index, 'reader/nook')).toBeNull()
  })

  it('collects a subtree', () => {
    expect(subtreeIds(index, 'writer/draft')).toEqual(['writer/draft', 'writer/draft/draft', 'writer/draft/draft/autosave', 'writer/draft/settings'])
    expect(subtreeIds(index, 'nope')).toEqual([])
  })

  it('reorders siblings by a nudge or a drop', () => {
    expect(nudged(index, 'writer/draft', -1)).toEqual(['writer/draft', 'writer/dashboard'])
    expect(nudged(index, 'writer/draft', 1)).toBeNull()
    expect(movedBefore(index, 'writer/draft', 'writer/dashboard')).toEqual(['writer/draft', 'writer/dashboard'])
    expect(movedBefore(index, 'writer/dashboard', null)).toEqual(['writer/draft', 'writer/dashboard'])
  })
})
