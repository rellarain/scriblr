import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuiConfigNode, AuiConfigNodeKind, PublishedTab } from '../../../api/types'
import { getAdminConfig, publishAdminTab, putAdminConfig } from '../../../api/adminConfigApi'
import { combineSaveStatus, useAutosave } from '../../../lib/useAutosave'

type AsyncStatus = 'idle' | 'loading' | 'error'

// Which copy of the config a read looks at: the working draft (the editor), or
// the published snapshot (what read-only views show).
export type ConfigView = 'draft' | 'published'

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

// A tab's nodes in a stable form, for comparing the draft with what was published.
function canonical(nodes: AuiConfigNode[]): string {
  return JSON.stringify([...nodes].sort((a, b) => a.id.localeCompare(b.id)))
}

// tab -> parentId ('' stands in for the tab's own root) -> children in order.
function buildChildren(all: AuiConfigNode[]): Map<string, Map<string, AuiConfigNode[]>> {
  const map = new Map<string, Map<string, AuiConfigNode[]>>()
  for (const node of all) {
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
}

const CHILD_KIND: Record<AuiConfigNodeKind, AuiConfigNodeKind | null> = {
  console: 'component',
  component: 'feature',
  feature: null,
}

// Two copies of every tab: the DRAFT (what the editor changes and Save draft
// writes) and the PUBLISHED snapshot (what Publish freezes, and what read-only
// views show). Draft edits autosave like the Writer's (see lib/useAutosave.ts):
// structural changes (add/delete/move) save at once, text-field edits after a
// pause, and switching tabs/locking flushes whatever is waiting.
export function useAuiConfig() {
  const [nodes, setNodes] = useState<AuiConfigNode[]>([])
  const [published, setPublished] = useState<Record<string, PublishedTab>>({})
  const [status, setStatus] = useState<AsyncStatus>('idle')
  const [error, setError] = useState<string | undefined>(undefined)
  const [publishing, setPublishing] = useState<boolean>(false)
  const [publishError, setPublishError] = useState<string | undefined>(undefined)

  const nodesRef = useRef<AuiConfigNode[]>(nodes)
  nodesRef.current = nodes

  const draftSave = useAutosave<AuiConfigNode[]>({
    save: async draft => {
      const config = await putAdminConfig({ schemaVersion: 1, nodes: draft })
      setPublished(config.published ?? {})
      // Adopt the server's copy only if nothing newer is waiting.
      if (!draftSave.isPending()) setNodes(config.nodes)
    },
  })

  // Apply an edit to the draft; `immediate` saves now, otherwise after a pause.
  function commit(next: AuiConfigNode[], immediate: boolean) {
    nodesRef.current = next
    setNodes(next)
    if (immediate) void draftSave.saveNow(next)
    else draftSave.schedule(next)
  }

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
      setPublished(config.published ?? {})
      setStatus('idle')
    } catch (err) {
      setStatus('error')
      setError(errMessage(err, 'Failed to load admin configuration'))
    }
  }
  useEffect(() => { void loadConfig() }, [])

  // Publish one tab: save the draft first, then freeze the tab's draft as its
  // published copy.
  async function publishTab(tab: AuiConfigTabKey) {
    setPublishing(true)
    setPublishError(undefined)
    try {
      await draftSave.flush()
      if (draftSave.isPending()) throw new Error('The draft could not be saved, so it was not published.')
      const config = await publishAdminTab(tab)
      setPublished(config.published ?? {})
    } catch (err) {
      setPublishError(errMessage(err, 'Failed to publish'))
    } finally {
      setPublishing(false)
    }
  }

  function saveNow(): Promise<void> {
    return draftSave.flush()
  }

  // Throw away the unsaved edits and reload the saved draft.
  async function restoreDraft(): Promise<void> {
    await draftSave.discard()
    try {
      const config = await getAdminConfig()
      nodesRef.current = config.nodes
      setNodes(config.nodes)
      setPublished(config.published ?? {})
    } catch (err) {
      setError(errMessage(err, 'Failed to restore the saved draft'))
    }
  }

  // Where a tab stands: its published version (null = never published) and
  // whether the draft differs from it.
  function publishInfo(tab: AuiConfigTabKey): { version: number | null; publishedAt: string | null; unpublished: boolean } {
    const snapshot = published[tab]
    const draft = nodes.filter(n => n.tab === tab)
    return {
      version: snapshot?.version ?? null,
      publishedAt: snapshot?.publishedAt ?? null,
      unpublished: !snapshot || canonical(draft) !== canonical(snapshot.nodes),
    }
  }

  // tab -> parentId ('' stands in for the tab's own root) -> children,
  // mirroring useWriterWorkspace.ts's childrenByParentId build.
  const draftChildren = useMemo(() => buildChildren(nodes), [nodes])
  // The published snapshot of each tab; a tab that was never published shows
  // its draft, so nothing disappears from read-only views on upgrade.
  const publishedChildren = useMemo(() => {
    const flat: AuiConfigNode[] = []
    const tabs = new Set(nodes.map(n => n.tab))
    for (const tab of tabs) flat.push(...(published[tab]?.nodes ?? nodes.filter(n => n.tab === tab)))
    return buildChildren(flat)
  }, [nodes, published])

  function childrenOf(tab: AuiConfigTabKey, parentId: string | null, view: ConfigView = 'draft'): AuiConfigNode[] {
    const map = view === 'published' ? publishedChildren : draftChildren
    return map.get(tab)?.get(parentId ?? '') ?? []
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
    const prev = nodesRef.current
    const siblings = prev.filter(n => n.tab === tab && n.parentId === parentId)
    // New nodes land at the top of their siblings, not the bottom --
    // order just needs to sort lower than everything already there.
    const nextOrder = siblings.length === 0 ? 0 : Math.min(...siblings.map(s => s.order)) - 1
    const node: AuiConfigNode = {
      id, tab, kind, parentId, order: nextOrder,
      name: '', idea: '',
    }
    commit([...prev, node], true)
    ensureExpandedAncestors(parentId)
    return id
  }

  function updateNodeField(nodeId: string, field: 'name' | 'idea', value: string) {
    commit(nodesRef.current.map(n => (n.id === nodeId ? { ...n, [field]: value } : n)), false)
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
    const prev = nodesRef.current
    const toRemove = collectDescendantIds(nodeId, prev)
    commit(prev.filter(n => !toRemove.has(n.id)), true)
  }

  // Drag-and-drop reorder (mirrors OutlineTreeView.tsx's onReorder): given
  // the sibling group's ids in their new order after a drag, reassign
  // order = index across just that group.
  function reorderNodes(tab: AuiConfigTabKey, parentId: string | null, orderedIds: string[]) {
    const orderById = new Map(orderedIds.map((id, index) => [id, index]))
    commit(nodesRef.current.map(n => {
      if (n.tab !== tab || n.parentId !== parentId) return n
      const order = orderById.get(n.id)
      return order === undefined ? n : { ...n, order }
    }), true)
  }

  return {
    status, error, saving: draftSave.saving, saveError: draftSave.error,
    saveStatus: combineSaveStatus(draftSave), saveNow, restoreDraft,
    publishing, publishError, publishTab, publishInfo,
    childrenOf, findNode, addNode, updateNodeField, deleteNode, reorderNodes,
    childKindOf: (kind: AuiConfigNodeKind) => CHILD_KIND[kind],
    isCollapsed, toggleCollapsed,
  }
}

export type AuiConfigWorkspace = ReturnType<typeof useAuiConfig>
