import type { PlotCustomFieldDef, PlotNode, PresetCard, PresetContent, PresetField } from '../../../api/types'
import { MAX_FIELDSETS, clampBody, clampFieldName, clampSetName, clampTitle, randomId, type MakeId } from './plotFields'
import { clampLabel, MAX_OPTIONS } from './plotKinds'

// Adding a plot preset to a project: a plain copy. The preset's category becomes a category node with its description (body), keywords, fields
// and fieldsets, and its subcategories and clusters become nodes under it, each with the same. A field that is a multi-select, dropdown or short
// text is made as that kind, with an id for each of its options. Nothing remembers which preset they came from, and no
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
    // A field of the preset as a field of the node (a blank name makes none); `setId` lists it in a set.
    const defOf = (field: PresetField, setId?: string): PlotCustomFieldDef | null => {
      const name = clampFieldName(typeof field === 'string' ? field : field.name)
      if (!name) return null
      const def: PlotCustomFieldDef = { id: makeId('field'), name, ...(setId ? { setId } : {}) }
      if (typeof field === 'string') return def
      if (field.kind === 'text') return { ...def, kind: 'text' }
      const labels = field.options.map(o => clampLabel(o.trim())).filter((label, i, all) => label !== '' && all.findIndex(l => l.toLowerCase() === label.toLowerCase()) === i)
      return { ...def, kind: field.kind, options: labels.slice(0, MAX_OPTIONS).map(label => ({ id: makeId('opt'), label })) }
    }
    const defs = (fields: PresetField[], setId?: string) => fields.map(field => defOf(field, setId)).filter((d): d is PlotCustomFieldDef => d !== null)
    const sets = (card.fieldsets ?? []).slice(0, MAX_FIELDSETS).map(set => ({ id: makeId('set'), name: clampSetName(set.name) || 'Untitled set', fields: set.fields }))
    made.push({
      id, kind, parentId, order, title: clampTitle(card.name), body: clampBody(card.description),
      sourceFieldId: null,
      customFieldDefs: [...defs(card.fields), ...sets.flatMap(set => defs(set.fields, set.id))],
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
