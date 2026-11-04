import { describe, expect, it } from 'vitest'
import { PLOT_MAX_LINKS, linkChoices, linkNodes, linksOf, pathLabel, syncLinks, unlinkNodes } from './plotLinks'
import { plotNode } from './plotTestWorkspace'

// Romance > Slow burn > (Meet cute); Romance > Cold open (a plotline); Heist (a category) > Crew (a cluster, straight under it) > Safe-cracker.
const plot = () => [
  plotNode('cat', 'category', null, { title: 'Romance' }),
  plotNode('sub', 'subcategory', 'cat', { title: 'Slow burn' }),
  plotNode('line', 'plotline', 'sub', { title: 'Meet cute' }),
  plotNode('cold', 'plotline', 'cat', { title: 'Cold open' }),
  plotNode('heist', 'category', null, { title: 'Heist' }),
  plotNode('crew', 'cluster', 'heist', { title: 'Crew' }),
  plotNode('safe', 'plotline', 'crew', { title: 'Safe-cracker' }),
  plotNode('pt', 'plotpoint', 'line', { title: 'A point' }),
]
const links = (nodes: ReturnType<typeof plot>, id: string) => linksOf(nodes.find(n => n.id === id)!)

describe('linkNodes and unlinkNodes', () => {
  it('links two nodes on both ends, and unlinks them from both', () => {
    const linked = linkNodes(plot(), 'line', 'crew')
    expect(links(linked, 'line')).toEqual(['crew'])
    expect(links(linked, 'crew')).toEqual(['line'])
    const apart = unlinkNodes(linked, 'crew', 'line')
    expect(links(apart, 'line')).toEqual([])
    expect(links(apart, 'crew')).toEqual([])
  })

  it('links nodes of any of the four kinds, never a plotpoint, itself or a repeat', () => {
    let nodes = plot()
    for (const other of ['cat', 'sub', 'crew', 'cold']) nodes = linkNodes(nodes, 'line', other)
    expect(links(nodes, 'line')).toEqual(['cat', 'sub', 'crew', 'cold'])
    expect(linkNodes(nodes, 'line', 'pt')).toBe(nodes)
    expect(linkNodes(nodes, 'pt', 'line')).toBe(nodes)
    expect(linkNodes(nodes, 'line', 'line')).toBe(nodes)
    expect(linkNodes(nodes, 'cat', 'line')).toBe(nodes)
    expect(linkNodes(nodes, 'line', 'missing')).toBe(nodes)
  })

  it('does nothing to unlink what is not linked', () => {
    const nodes = plot()
    expect(unlinkNodes(nodes, 'line', 'cat')).toBe(nodes)
  })

  it('refuses a link that would take either end past the most', () => {
    const many = Array.from({ length: PLOT_MAX_LINKS }, (_, i) => plotNode(`x${i}`, 'plotline', 'cat', { links: ['line'] }))
    const nodes = syncLinks([...plot(), ...many])
    expect(links(nodes, 'line')).toHaveLength(PLOT_MAX_LINKS)
    expect(linkNodes(nodes, 'line', 'cold')).toBe(nodes)
    expect(linkNodes(nodes, 'cold', 'line')).toBe(nodes)
  })
})

describe('syncLinks', () => {
  it('returns the same array when every link is already on both ends', () => {
    const nodes = linkNodes(plot(), 'line', 'crew')
    expect(syncLinks(nodes)).toBe(nodes)
    expect(syncLinks(plot())).toEqual(plot())
  })

  it('adds a link held by one end to the other, after the links it already has', () => {
    const nodes = plot().map(n => (n.id === 'line' ? { ...n, links: ['crew'] } : n.id === 'crew' ? { ...n, links: ['cat'] } : n))
    const synced = syncLinks(nodes)
    expect(links(synced, 'crew')).toEqual(['cat', 'line'])
    expect(links(synced, 'cat')).toEqual(['crew'])
    expect(links(synced, 'line')).toEqual(['crew'])
  })

  it('drops links to itself, to a node that is gone, to or from a plotpoint, and repeats', () => {
    const nodes = plot().map(n => (n.id === 'line' ? { ...n, links: ['line', 'gone', 'pt', 'cat', 'cat'] } : n.id === 'pt' ? { ...n, links: ['line'] } : n))
    const synced = syncLinks(nodes)
    expect(links(synced, 'line')).toEqual(['cat'])
    expect(links(synced, 'pt')).toEqual([])
    expect(links(synced, 'cat')).toEqual(['line'])
  })

  it('cleans the other end when a node is deleted', () => {
    const linked = linkNodes(plot(), 'line', 'crew')
    const synced = syncLinks(linked.filter(n => n.id !== 'crew'))
    expect(links(synced, 'line')).toEqual([])
  })
})

describe('pathLabel and linkChoices', () => {
  it('names a node by where it sits', () => {
    const byId = new Map(plot().map(n => [n.id, n]))
    expect(pathLabel(byId.get('line')!, byId)).toBe('Romance › Slow burn › Meet cute')
    expect(pathLabel(byId.get('cat')!, byId)).toBe('Romance')
    expect(pathLabel(byId.get('safe')!, byId)).toBe('Heist › Crew › Safe-cracker')
  })

  it('offers each kind in turn, with paths, leaving out itself, what it sits under, what it holds, and plotpoints', () => {
    const nodes = plot()
    const choices = linkChoices(nodes.find(n => n.id === 'line')!, nodes)
    expect(choices.map(c => c.heading)).toEqual(['Categories', 'Clusters', 'Plotlines'])
    expect(choices[0].items.map(i => i.label)).toEqual(['Heist'])
    expect(choices[1].items.map(i => i.label)).toEqual(['Heist › Crew'])
    expect(choices[2].items.map(i => i.label)).toEqual(['Heist › Crew › Safe-cracker', 'Romance › Cold open'])
    const ofCategory = linkChoices(nodes.find(n => n.id === 'cat')!, nodes)
    expect(ofCategory.flatMap(c => c.items.map(i => i.id))).toEqual(['heist', 'crew', 'safe']) // not its own subcategory or plotlines
  })

  it('leaves out what is already linked, and has nothing to offer a plotpoint', () => {
    const nodes = linkNodes(plot(), 'line', 'heist')
    expect(linkChoices(nodes.find(n => n.id === 'line')!, nodes).map(c => c.heading)).toEqual(['Clusters', 'Plotlines'])
    expect(linkChoices(nodes.find(n => n.id === 'pt')!, nodes)).toEqual([])
  })
})
