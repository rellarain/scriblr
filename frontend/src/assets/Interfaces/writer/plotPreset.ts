import type { PlotNode, PresetCard, PresetContent } from '../../../api/types'
import { clampBody, clampFieldName, clampTitle, randomId, type MakeId } from './plotFields'

// Adding a plot preset to a project: a plain copy. The preset's category becomes a category node with its description (body), keywords and
// fields, and its subcategories and clusters become nodes under it, each with the same. Nothing remembers which preset they came from, and no
// plotlines, values or colours are made (a category with no colour of its own takes the theme's, as a new one does).

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

export function nodesFromPreset(existing: PlotNode[], preset: PresetContent, makeId: MakeId = randomId): PresetNodes {
  const made: PlotNode[] = []
  const add = (kind: PlotNode['kind'], parentId: string | null, order: number, card: PresetCard): string => {
    const id = makeId('plot')
    made.push({
      id, kind, parentId, order, title: clampTitle(card.name), body: clampBody(card.description),
      assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
      customFieldDefs: card.fields.map(name => clampFieldName(name)).filter(Boolean).map(name => ({ id: makeId('field'), name })),
      customFieldValues: {}, keywords: [...new Set(card.keywords.map(k => k.trim()).filter(Boolean))], flag: null,
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
