import { useRef, useState } from 'react'
import { vi } from 'vitest'
import type { OutlineNode, PlotNode } from '../../../api/types'
import { awarenessNext } from './awareness'
import {
  addField, addValue, assignPoint, deleteField, deleteValue, moveField, moveValue, randomId, renameField, syncReferences, updateValue,
} from './plotFields'
import type { WriterWorkspace } from './useWriterWorkspace'

// A small stand-in for useWriterWorkspace in component tests: the plot lives in state and
// every mutator is the real pure function, so what the components do is what the app does.

export const base = { body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, fieldId: null, refId: null, awareness: null }
export const plotNode = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ ...base, id, kind, parentId, order: 0, title: id, ...over } as PlotNode)
export const outlineNode = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)

export const OUTLINE: OutlineNode[] = [
  outlineNode('series', 'series', null, { title: 'Saga' }),
  outlineNode('book', 'book', 'series', { title: 'Book One', themeHue: 200, accentHue: 260 }),
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
    highlightPlotpoint: (id: string | null) => setHighlighted(id),
    focusPlotNode: (id: string | null) => setFocusedId(id),
    openChapter: vi.fn(),
    addPlotField: (owner: string, name = '', after?: string) => { const r = addField(ref.current, owner, name, randomId, after); if (r.id) commit(r.nodes); return r.id },
    renamePlotField: (owner: string, id: string, name: string) => commit(renameField(ref.current, owner, id, name)),
    movePlotField: (owner: string, id: string, before: string | null) => commit(moveField(ref.current, owner, id, before)),
    removePlotField: (owner: string, id: string) => commit(deleteField(ref.current, owner, id, outlineById)),
    addPlotValue: (holder: string, field: string, after?: string) => { const r = addValue(ref.current, holder, field, randomId, after); if (r.id) commit(r.nodes); return r.id },
    updatePlotValue: (id: string, patch: { title?: string; body?: string }) => commit(updateValue(ref.current, id, patch)),
    removePlotValue: (id: string) => commit(deleteValue(ref.current, id, outlineById)),
    movePlotValue: (id: string, to: string) => commit(moveValue(ref.current, id, to, outlineById)),
    cyclePlotAwareness: (id: string) => commit(ref.current.map(n => (n.id === id && n.awareness ? { ...n, awareness: awarenessNext(n.awareness) } : n))),
    assignPlotpoint: (id: string, target: string | null) => commit(assignPoint(ref.current, id, target, outlineById)),
    addPlotNode: (parent: string | null, kind: PlotNode['kind'], _title?: string, after?: string) => {
      const id = randomId('plot')
      const order = ref.current.filter(n => n.parentId === parent).length + (after ? 0.5 : 0)
      commit([...ref.current, plotNode(id, kind, parent, { title: '', order })])
      return id
    },
    updatePlotNodeField: (id: string, field: 'title' | 'body', value: string) => commit(ref.current.map(n => (n.id === id ? { ...n, [field]: value } : n))),
    deletePlotNode: (id: string) => commit(ref.current.filter(n => n.id !== id)),
    setPlotHue: vi.fn(), addPlotKeyword: vi.fn(), removePlotKeyword: vi.fn(),
  } as unknown as WriterWorkspace
  return { w, plotNodes }
}
