import { useRef, useState } from 'react'
import { vi } from 'vitest'
import type { OutlineNode, PlotFieldKind, PlotNode, PlotPlacement, PresetContent } from '../../../api/types'
import {
  addOption, chooseOption, moveOption, removeAnswer, removeOption, renameOption, setFieldKind, setTextAnswer, toggleOption,
} from './plotAnswers'
import { cycleAwareness, movePlacement, placeValue, unplace } from './plotPlacement'
import { nodesFromPreset } from './plotPreset'
import {
  addField, addFieldset, addValue, deleteField, deleteFieldset, deleteValue, moveField, moveFieldset, moveValue, randomId, renameField,
  renameFieldset, setFieldSet, syncReferences, updateValue,
} from './plotFields'
import type { WriterWorkspace } from './useWriterWorkspace'

// A small stand-in for useWriterWorkspace in component tests: the plot lives in state and
// every mutator is the real pure function, so what the components do is what the app does.

export const base = { body: '', sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, fieldId: null, refId: null, placements: [] }
// A placement on an outline node (a test's way of placing a plotpoint: `placements: [placing('m1', 'back')]`).
export const placing = (targetId: string, awareness: PlotPlacement['awareness'] = null, id = `at-${targetId}`): PlotPlacement => ({ id, targetId, paragraphIndex: null, awareness })
export const plotNode = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ ...base, id, kind, parentId, order: 0, title: id, ...over } as PlotNode)
export const outlineNode = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

export const OUTLINE: OutlineNode[] = [
  outlineNode('series', 'series', null, { title: 'Saga' }),
  outlineNode('book', 'book', 'series', { title: 'Book One', themeHue: 200 }),
  outlineNode('arc', 'arc', 'book', { title: 'Setting out' }),
  outlineNode('ch1', 'chapter', 'arc', { title: 'Arrival' }),
  outlineNode('ch2', 'chapter', 'arc', { title: 'Storm', order: 1 }),
  outlineNode('act', 'act', 'ch1'), outlineNode('scene', 'scene', 'act'), outlineNode('m1', 'moment', 'scene'),
]

// A category with a Theme field (one value), a subcategory, and a plotline with a field of its own.
export function startingPlot(): PlotNode[] {
  return syncReferences([
    plotNode('cat', 'category', null, { title: 'Romance', hue: 200, customFieldDefs: [{ id: 'fTheme', name: 'Theme' }] }),
    plotNode('val', 'plotpoint', 'cat', { title: 'Trust', fieldId: 'fTheme' }),
    plotNode('sub', 'subcategory', 'cat', { title: 'Slow burn', hue: 230 }),
    plotNode('line', 'plotline', 'sub', { title: 'Meet cute', customFieldDefs: [{ id: 'fSet', name: 'Setback' }] }),
    plotNode('own', 'plotpoint', 'line', { title: 'Missed train', fieldId: 'fSet', order: 0 }),
  ], new Map(OUTLINE.map(n => [n.id, n])))
}

export function useFakeWorkspace(initial: PlotNode[], focused = 'line', outlineNodes: OutlineNode[] = OUTLINE) {
  const [plotNodes, setPlotNodes] = useState<PlotNode[]>(initial)
  const [focusedId, setFocusedId] = useState<string | null>(focused)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const ref = useRef(plotNodes)
  const outlineById = new Map(outlineNodes.map(n => [n.id, n]))
  const commit = (next: PlotNode[]) => { const synced = syncReferences(next, outlineById); ref.current = synced; setPlotNodes(synced) }

  const plotNodeById = new Map(plotNodes.map(n => [n.id, n]))
  const children = new Map<string | null, PlotNode[]>()
  for (const n of plotNodes) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
  for (const list of children.values()) list.sort((a, b) => a.order - b.order)

  const w = {
    plotNodes, plotNodeById, plotChildrenByParentId: children, outlineNodes, plotStatus: 'idle', plotError: undefined, plotSaveError: undefined,
    activeProject: { settings: { timeSystems: [] } },
    focusedPlotNodeId: focusedId, focusedPlotNode: focusedId ? plotNodeById.get(focusedId) : undefined,
    highlightedPointId: highlighted,
    plotSelection: selection, setPlotSelection: setSelection,
    togglePlotSelection: (ids: string | string[], on?: boolean) => setSelection(prev => {
      const list = Array.isArray(ids) ? ids : [ids]
      const set = new Set(prev)
      const turnOn = on ?? !list.every(id => set.has(id))
      for (const id of list) { if (turnOn) set.add(id); else set.delete(id) }
      return [...set]
    }),
    highlightPlotpoint: (id: string | null) => setHighlighted(id),
    focusPlotNode: (id: string | null) => setFocusedId(id),
    openChapter: vi.fn(),
    addPlotField: (owner: string, name = '', after?: string, setId?: string | null) => { const r = addField(ref.current, owner, name, randomId, after, setId); if (r.id) commit(r.nodes); return r.id },
    addPlotFieldset: (owner: string, name = '', after?: string) => { const r = addFieldset(ref.current, owner, name, randomId, after); if (r.id) commit(r.nodes); return r.id },
    renamePlotFieldset: (owner: string, id: string, name: string) => commit(renameFieldset(ref.current, owner, id, name)),
    movePlotFieldset: (owner: string, id: string, before: string | null) => commit(moveFieldset(ref.current, owner, id, before)),
    removePlotFieldset: (owner: string, id: string) => commit(deleteFieldset(ref.current, owner, id)),
    setPlotFieldSet: (owner: string, field: string, setId: string | null, before: string | null = null, atEnd = false) => commit(setFieldSet(ref.current, owner, field, setId, before, atEnd)),
    renamePlotField: (owner: string, id: string, name: string) => commit(renameField(ref.current, owner, id, name)),
    movePlotField: (owner: string, id: string, before: string | null) => commit(moveField(ref.current, owner, id, before)),
    removePlotField: (owner: string, id: string) => commit(deleteField(ref.current, owner, id, outlineById)),
    setPlotFieldKind: (owner: string, field: string, kind: PlotFieldKind) => commit(setFieldKind(ref.current, owner, field, kind)),
    addPlotOption: (owner: string, field: string, label: string) => { const r = addOption(ref.current, owner, field, label, randomId); if (r.id) commit(r.nodes); return r.id },
    renamePlotOption: (owner: string, field: string, option: string, label: string) => commit(renameOption(ref.current, owner, field, option, label)),
    movePlotOption: (owner: string, field: string, option: string, before: string | null) => commit(moveOption(ref.current, owner, field, option, before)),
    removePlotOption: (owner: string, field: string, option: string) => commit(removeOption(ref.current, owner, field, option)),
    togglePlotOption: (holder: string, field: string, option: string, on: boolean) => commit(toggleOption(ref.current, holder, field, option, on, randomId)),
    choosePlotOption: (holder: string, field: string, option: string | null) => commit(chooseOption(ref.current, holder, field, option, randomId)),
    setPlotTextAnswer: (holder: string, field: string, text: string) => commit(setTextAnswer(ref.current, holder, field, text, randomId)),
    removePlotAnswer: (id: string) => commit(removeAnswer(ref.current, id)),
    addPlotValue: (holder: string, field: string, after?: string) => { const r = addValue(ref.current, holder, field, randomId, after); if (r.id) commit(r.nodes); return r.id },
    updatePlotValue: (id: string, patch: { title?: string; body?: string }) => commit(updateValue(ref.current, id, patch)),
    removePlotValue: (id: string) => commit(deleteValue(ref.current, id, outlineById)),
    movePlotValue: (id: string, to: string) => commit(moveValue(ref.current, id, to, outlineById)),
    cyclePlotAwareness: (id: string, placementId: string) => commit(cycleAwareness(ref.current, id, placementId)),
    placePlotpoint: (id: string, target: string) => commit(placeValue(ref.current, id, target, outlineById)),
    movePlotpointPlacement: (id: string, placementId: string, target: string) => commit(movePlacement(ref.current, id, placementId, target, outlineById)),
    unplacePlotpoint: (id: string, placementId: string) => commit(unplace(ref.current, id, placementId)),
    addPlotNode: (parent: string | null, kind: PlotNode['kind'], _title?: string, after?: string) => {
      const id = randomId('plot')
      const order = ref.current.filter(n => n.parentId === parent).length + (after ? 0.5 : 0)
      commit([...ref.current, plotNode(id, kind, parent, { title: '', order })])
      return id
    },
    addPlotPreset: (preset: PresetContent) => {
      const added = nodesFromPreset(ref.current, preset, randomId)
      commit(added.nodes)
      return added.id
    },
    updatePlotNodeField: (id: string, field: 'title' | 'body', value: string) => commit(ref.current.map(n => (n.id === id ? { ...n, [field]: value } : n))),
    deletePlotNode: (id: string) => { commit(ref.current.filter(n => n.id !== id)); setSelection(prev => prev.filter(s => s !== id)) },
    setPlotHue: vi.fn(), addPlotKeyword: vi.fn(), removePlotKeyword: vi.fn(),
  } as unknown as WriterWorkspace
  return { w, plotNodes }
}
