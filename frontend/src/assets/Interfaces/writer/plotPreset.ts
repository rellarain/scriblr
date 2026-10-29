import type { PlotNode, PresetCard, PresetContent } from '../../../api/types'
import { MAX_FIELDSETS, clampBody, clampFieldName, clampSetName, clampTitle, randomId, type MakeId } from './plotFields'

// Adding a plot preset to a project: a plain copy. The preset's category becomes a category node with its description (body), keywords, fields
// and fieldsets, and its subcategories and clusters become nodes under it, each with the same. Nothing remembers which preset they came from, and no
// plotlines or values are made, and the colours are not the preset's: the category starts at `categoryHue` (the project's hue, as a new category
// does), and its subcategories and clusters show their parent's.

const nextOrder = (nodes: PlotNode[], parentId: string | null) => {
  const siblings = nodes.filter(n => n.parentId === parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.order)) + 1
}

export interface PresetNodes {
  // The project's plot with the preset's nodes added (the existing nodes are untouched).
  nodes: PlotNode[]
  // The new category's id.
  id: string
}

export function nodesFromPreset(existing: PlotNode[], preset: PresetContent, makeId: MakeId = randomId, categoryHue: number | null = null): PresetNodes {
  const made: PlotNode[] = []
  const add = (kind: PlotNode['kind'], parentId: string | null, order: number, card: PresetCard): string => {
    const id = makeId('plot')
    const names = (list: string[]) => list.map(name => clampFieldName(name)).filter(Boolean)
    const sets = (card.fieldsets ?? []).slice(0, MAX_FIELDSETS).map(set => ({ id: makeId('set'), name: clampSetName(set.name) || 'Untitled set', fields: names(set.fields) }))
    made.push({
      id, kind, parentId, order, title: clampTitle(card.name), body: clampBody(card.description),
      assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
      customFieldDefs: [
        ...names(card.fields).map(name => ({ id: makeId('field'), name })),
        ...sets.flatMap(set => set.fields.map(name => ({ id: makeId('field'), name, setId: set.id }))),
      ],
      ...(sets.length > 0 ? { customFieldSets: sets.map(({ id: setId, name }) => ({ id: setId, name })) } : {}),
      customFieldValues: {}, keywords: [...new Set(card.keywords.map(k => k.trim()).filter(Boolean))], flag: null,
      ...(kind === 'category' && categoryHue !== null ? { hue: categoryHue } : {}),
    })
    return id
  }
  const category = add('category', null, nextOrder(existing, null), preset)
  preset.subcategories.forEach((sub, i) => {
    const subId = add('subcategory', category, i, sub)
    sub.clusters.forEach((cluster, j) => add('cluster', subId, j, cluster))
  })
  return { nodes: [...existing, ...made], id: category }
}
