import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuiConfigNode, AuiConfigNodeKind } from '../../../api/types'
import { getAdminConfig, putAdminConfig } from '../../../api/adminConfigApi'

type AsyncStatus = 'idle' | 'loading' | 'error'
const DEBOUNCE_MS = 800

// AUI's 8 Configuration sub-tabs -- each partitions the same flat node
// list via its own `tab` value, matching AUI.tsx's existing AuiSubSectionKey
// literals so no new key vocabulary is introduced.
export type AuiConfigTabKey =
  | 'projectPlan' | 'visitorConfig' | 'userPageConfig' | 'readerPageConfig'
  | 'translatorPageConfig' | 'writerPageConfig' | 'helperPageConfig' | 'adminPageConfig'

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

const CHILD_KIND: Record<AuiConfigNodeKind, AuiConfigNodeKind | null> = {
  console: 'component',
  component: 'feature',
  feature: null,
}

// Mirrors useWriterWorkspace.ts's outline persistence exactly (same
// local-mutate-then-persist shape, same debounce convention): structural
// changes (add/delete/move) persist immediately, text-field edits debounce.
export function useAuiConfig() {
  const [nodes, setNodes] = useState<AuiConfigNode[]>([])
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)

  const nodesRef = useRef<AuiConfigNode[]>(nodes)
  nodesRef.current = nodes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Collapse/expand state, keyed by node id -- lives here (not in a local
  // useState inside NodeCard/ReadOnlyConsole/ReadOnlyComponent) so it's
  // one shared source both the editor and read-only tree read from, and
  // survives toggling between them (this hook instance is created once in
  // AUI.tsx and passed to both, never remounted by that toggle). A node
  // with no entry yet falls back to its kind's default -- collapsed for
  // everything except components, which default expanded.
  const [collapsedIds, setCollapsedIds] = useState<Map<string, boolean>>(new Map())
  function isCollapsed(nodeId: string, kind: AuiConfigNodeKind): boolean {
    return collapsedIds.get(nodeId) ?? kind !== 'component'
  }
  function setNodeCollapsed(nodeId: string, value: boolean) {
    setCollapsedIds(prev => {
      const next = new Map(prev)
      next.set(nodeId, value)
      return next
    })
  }
  function toggleCollapsed(nodeId: string, kind: AuiConfigNodeKind) {
    setNodeCollapsed(nodeId, !isCollapsed(nodeId, kind))
  }

  async function loadConfig() {
    setStatus('loading')
    setError(undefined)
    try {
      const config = await getAdminConfig()
      setNodes(config.nodes)
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(errMessage(err, 'Failed to load admin configuration'))
    }
  }
  useEffect(() => { void loadConfig() }, [])

  async function persist(next: AuiConfigNode[]) {
    setSaving(true)
    setSaveError(undefined)
    try {
      const config = await putAdminConfig({ schemaVersion: 1, nodes: next })
      setNodes(config.nodes)
    } catch (err) {
      setSaveError(errMessage(err, 'Failed to save admin configuration'))
    } finally {
      setSaving(false)
    }
  }

  function persistNow(next: AuiConfigNode[]) {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    void persist(next)
  }

  function scheduleDebouncedSave(next: AuiConfigNode[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void persist(nodesRef.current)
    }, DEBOUNCE_MS)
  }

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  // tab -> parentId ('' stands in for the tab's own root) -> children,
  // mirroring useWriterWorkspace.ts's childrenByParentId build.
  const childrenByTabAndParent = useMemo(() => {
    const map = new Map<string, Map<string, AuiConfigNode[]>>()
    for (const node of nodes) {
      let byParent = map.get(node.tab)
      if (!byParent) { byParent = new Map(); map.set(node.tab, byParent) }
      const key = node.parentId ?? ''
      const bucket = byParent.get(key)
      if (bucket) bucket.push(node)
      else byParent.set(key, [node])
    }
    for (const byParent of map.values()) {
      for (const bucket of byParent.values()) bucket.sort((a, b) => a.order - b.order)
    }
    return map
  }, [nodes])

  function childrenOf(tab: AuiConfigTabKey, parentId: string | null): AuiConfigNode[] {
    return childrenByTabAndParent.get(tab)?.get(parentId ?? '') ?? []
  }

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])
  function findNode(nodeId: string): AuiConfigNode | undefined {
    return nodeById.get(nodeId)
  }

  // Expands every ancestor from parentId up to the tab's own root, so a
  // newly added node (however deeply nested) actually lands somewhere
  // visible instead of inside a still-collapsed ancestor.
  function ensureExpandedAncestors(parentId: string | null) {
    let currentId = parentId
    while (currentId) {
      setNodeCollapsed(currentId, false)
      const current = findNode(currentId)
      currentId = current ? current.parentId : null
    }
  }

  function addNode(tab: AuiConfigTabKey, parentId: string | null, kind: AuiConfigNodeKind): string {
    const id = newId('auiNode')
    setNodes(prev => {
      const siblings = prev.filter(n => n.tab === tab && n.parentId === parentId)
      // New nodes land at the top of their siblings, not the bottom --
      // order just needs to sort lower than everything already there.
      const nextOrder = siblings.length === 0 ? 0 : Math.min(...siblings.map(s => s.order)) - 1
      const node: AuiConfigNode = {
        id, tab, kind, parentId, order: nextOrder,
        name: '', idea: '',
      }
      const next = [...prev, node]
      persistNow(next)
      return next
    })
    ensureExpandedAncestors(parentId)
    return id
  }

  function updateNodeField(nodeId: string, field: 'name' | 'idea', value: string) {
    setNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, [field]: value } : n))
      scheduleDebouncedSave(next)
      return next
    })
  }

  function collectDescendantIds(nodeId: string, all: AuiConfigNode[]): Set<string> {
    const ids = new Set<string>([nodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const n of all) {
        if (n.parentId != null && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true }
      }
    }
    return ids
  }

  function deleteNode(nodeId: string) {
    setNodes(prev => {
      const toRemove = collectDescendantIds(nodeId, prev)
      const next = prev.filter(n => !toRemove.has(n.id))
      persistNow(next)
      return next
    })
  }

  // Drag-and-drop reorder (mirrors OutlineTreeView.tsx's onReorder): given
  // the sibling group's ids in their new order after a drag, reassign
  // order = index across just that group.
  function reorderNodes(tab: AuiConfigTabKey, parentId: string | null, orderedIds: string[]) {
    setNodes(prev => {
      const orderById = new Map(orderedIds.map((id, index) => [id, index]))
      const next = prev.map(n => {
        if (n.tab !== tab || n.parentId !== parentId) return n
        const order = orderById.get(n.id)
        return order === undefined ? n : { ...n, order }
      })
      persistNow(next)
      return next
    })
  }

  return {
    status, error, saving, saveError,
    childrenOf, findNode, addNode, updateNodeField, deleteNode, reorderNodes,
    childKindOf: (kind: AuiConfigNodeKind) => CHILD_KIND[kind],
    isCollapsed, toggleCollapsed,
  }
}

export type AuiConfigWorkspace = ReturnType<typeof useAuiConfig>
