import { describe, expect, it } from 'vitest'
import type { PlotNode, PresetContent } from '../../../api/types'
import { nodesFromPreset } from './plotPreset'

const counter = () => { let n = 0; return (prefix: string) => `${prefix}-${(n += 1)}` }
const node = (id: string, kind: PlotNode['kind'], parentId: string | null, order = 0): PlotNode => ({
  id, kind, parentId, order, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
  customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
})
const preset = (over: Partial<PresetContent> = {}): PresetContent => ({
  name: 'Characters', description: 'The cast', keywords: ['cast', 'people'], fields: ['Name', 'Role'],
  subcategories: [
    { id: 'x1', name: 'Heroes', description: 'Those we follow', keywords: ['lead'], fields: ['Want'], clusters: [
      { id: 'x2', name: 'Core', description: 'The few', keywords: [], fields: ['Dynamic', 'Bond'] },
      { id: 'x3', name: 'Reserve', description: '', keywords: [], fields: [] },
    ] },
    { id: 'x4', name: 'Villains', description: '', keywords: [], fields: [], clusters: [] },
  ],
  ...over,
})

describe('nodesFromPreset', () => {
  it('makes a category with its text, keywords and fields, and its subcategories and clusters under it', () => {
    const { nodes, id } = nodesFromPreset([], preset(), counter())
    expect(nodes.map(n => [n.kind, n.title, n.parentId === null ? null : nodes.find(p => p.id === n.parentId)?.title])).toEqual([
      ['category', 'Characters', null], ['subcategory', 'Heroes', 'Characters'], ['cluster', 'Core', 'Heroes'], ['cluster', 'Reserve', 'Heroes'], ['subcategory', 'Villains', 'Characters'],
    ])
    expect(nodes[0].id).toBe(id)
    expect(nodes[0]).toMatchObject({ body: 'The cast', keywords: ['cast', 'people'] })
    expect(nodes[0].customFieldDefs.map(f => f.name)).toEqual(['Name', 'Role'])
    expect(nodes[1]).toMatchObject({ body: 'Those we follow', keywords: ['lead'] })
    expect(nodes[2].customFieldDefs.map(f => f.name)).toEqual(['Dynamic', 'Bond'])
    expect(nodes[3].customFieldDefs).toEqual([])
  })

  it('gives every node and field a new id of its own, and nothing remembers the preset', () => {
    const { nodes } = nodesFromPreset([], preset(), counter())
    const all = [...nodes.map(n => n.id), ...nodes.flatMap(n => n.customFieldDefs.map(f => f.id))]
    expect(new Set(all).size).toBe(all.length)
    expect(all.some(id => ['x1', 'x2', 'x3', 'x4'].includes(id))).toBe(false)
    for (const n of nodes) expect(Object.keys(n).sort()).toEqual(['assignedMomentId', 'assignedParagraphIndex', 'body', 'customFieldDefs', 'customFieldValues', 'flag', 'id', 'keywords', 'kind', 'order', 'parentId', 'sourceFieldId', 'title'])
  })

  it('numbers the siblings in the preset\'s order, and puts the category after the ones already there', () => {
    const existing = [node('c1', 'category', null, 0), node('c2', 'category', null, 4), node('s', 'subcategory', 'c1', 0)]
    const { nodes } = nodesFromPreset(existing, preset(), counter())
    expect(nodes.slice(0, 3).map(n => n.id)).toEqual(['c1', 'c2', 's'])
    const added = nodes.slice(3)
    expect(added[0]).toMatchObject({ kind: 'category', order: 5 })
    expect(added.filter(n => n.kind === 'subcategory').map(n => n.order)).toEqual([0, 1])
    expect(added.filter(n => n.kind === 'cluster').map(n => n.order)).toEqual([0, 1])
  })

  it('leaves the project\'s own nodes untouched', () => {
    const existing = [node('c1', 'category', null)]
    const { nodes } = nodesFromPreset(existing, preset())
    expect(nodes[0]).toBe(existing[0])
  })

  it('cuts text to what the Plot editor holds, and drops blank field names and repeated keywords', () => {
    const { nodes } = nodesFromPreset([], preset({ name: 'N'.repeat(60), description: 'D'.repeat(300), keywords: ['a', ' a ', ''], fields: ['F'.repeat(40), '  ', 'ok'], subcategories: [] }), counter())
    expect(nodes[0].title).toHaveLength(50)
    expect(nodes[0].body).toHaveLength(255)
    expect(nodes[0].keywords).toEqual(['a'])
    expect(nodes[0].customFieldDefs.map(f => f.name)).toEqual(['F'.repeat(30), 'ok'])
  })

  it('makes only the category for a preset with nothing under it, and no colour, plotline or value', () => {
    const { nodes } = nodesFromPreset([], preset({ subcategories: [] }), counter())
    expect(nodes).toHaveLength(1)
    expect(nodes[0].hue).toBeUndefined()
    expect(nodes.some(n => n.kind === 'plotline' || n.kind === 'plotpoint')).toBe(false)
  })
})
