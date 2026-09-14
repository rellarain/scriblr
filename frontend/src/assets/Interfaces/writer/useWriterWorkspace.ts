import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  FlagType, NodeFlag, OutlineNode, OutlineNodeKind, PlotNode, PlotNodeKind, ProjectIndex,
} from '../../../api/types'
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProject as apiGetProject,
  listProjects as apiListProjects,
} from '../../../api/projectsApi'
import { putOutline as apiPutOutline } from '../../../api/outlineApi'
import { putPlot as apiPutPlot } from '../../../api/plotApi'

type AsyncStatus = 'idle' | 'loading' | 'error'
const DEBOUNCE_MS = 800

// Which of scrilbrPlan.md's 5 WUI consoles is showing -- always derived
// from what's focused, never an independently-clickable tab the way AUI's
// consoles are. See useWriterWorkspace's activeConsole below for the exact
// derivation.
export type WuiConsole = 'shelves' | 'shelf' | 'book' | 'page' | 'pages'
export type PageMode = 'draft' | 'preview'

// The sliderPages transition WUI.tsx plays around a WuiSidebar navigation
// click that crosses a book<->chapter boundary ('opening') or toggles
// draft/preview for the focused chapter ('flipping'). Owned by WUI.tsx,
// not this hook -- declared here alongside the rest of the shared writer
// vocabulary since both BookLayer and WuiSidebar need the type.
export type TransitionState = 'idle' | 'opening' | 'flipping'

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function useWriterWorkspace() {
  const [projects, setProjects] = useState<ProjectIndex[]>([])
  const [projectsStatus, setProjectsStatus] = useState<AsyncStatus>('idle')
  const [projectsError, setProjectsError] = useState<string | undefined>(undefined)

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectIndex | null>(null)
  const hasOpenProject = activeProjectId != null && activeProject != null

  const [outlineNodes, setOutlineNodes] = useState<OutlineNode[]>([])
  const [outlineSchemaVersion, setOutlineSchemaVersion] = useState<number>(2)
  const [outlineStatus, setOutlineStatus] = useState<AsyncStatus>('idle')
  const [outlineError, setOutlineError] = useState<string | undefined>(undefined)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saving, setSaving] = useState<boolean>(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)

  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  // --- plot tree (Shelf Console's Project Plot) ---
  const [plotNodes, setPlotNodes] = useState<PlotNode[]>([])
  const [plotSchemaVersion, setPlotSchemaVersion] = useState<number>(1)
  const [plotStatus, setPlotStatus] = useState<AsyncStatus>('idle')
  const [plotError, setPlotError] = useState<string | undefined>(undefined)
  const [plotSaving, setPlotSaving] = useState<boolean>(false)
  const [plotSaveError, setPlotSaveError] = useState<string | undefined>(undefined)
  const [focusedPlotNodeId, setFocusedPlotNodeId] = useState<string | null>(null)

  // Only meaningful when the focused outline node is a chapter -- toggles
  // Page Console (draft) vs. Pages Console (preview/export).
  const [pageMode, setPageMode] = useState<PageMode>('draft')

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const outlineNodesRef = useRef<OutlineNode[]>([])
  activeProjectIdRef.current = activeProjectId
  outlineNodesRef.current = outlineNodes

  const plotSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const plotNodesRef = useRef<PlotNode[]>([])
  plotNodesRef.current = plotNodes

  // --- derived outline data ---
  const nodeById = useMemo(() => new Map(outlineNodes.map(n => [n.id, n])), [outlineNodes])

  const childrenByParentId = useMemo(() => {
    const map = new Map<string | null, OutlineNode[]>()
    for (const n of outlineNodes) {
      const bucket = map.get(n.parentId)
      if (bucket) bucket.push(n)
      else map.set(n.parentId, [n])
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.order - b.order)
    return map
  }, [outlineNodes])

  const focusedNode = focusedNodeId ? nodeById.get(focusedNodeId) : undefined
  const focusedChildren = childrenByParentId.get(focusedNodeId ?? null) ?? []

  const ancestryChain = useMemo(() => {
    const chain: OutlineNode[] = []
    let current = focusedNode
    while (current && current.parentId) {
      const parent = nodeById.get(current.parentId)
      if (!parent) break
      chain.unshift(parent)
      current = parent
    }
    return chain
  }, [focusedNode, nodeById])

  // Nearest-first (self, then immediate parent, ... then root) -- used to
  // find the closest book/chapter ancestor for console routing below.
  const nearestFirstChain = useMemo(() => {
    const chain: OutlineNode[] = []
    if (focusedNode) chain.push(focusedNode)
    for (let i = ancestryChain.length - 1; i >= 0; i--) chain.push(ancestryChain[i])
    return chain
  }, [focusedNode, ancestryChain])

  const bookAncestorId = useMemo(
    () => nearestFirstChain.find(n => n.kind === 'book')?.id ?? null,
    [nearestFirstChain],
  )
  const chapterAncestorId = useMemo(
    () => nearestFirstChain.find(n => n.kind === 'chapter')?.id ?? null,
    [nearestFirstChain],
  )

  // Book Console owns all outline-structure editing below the book itself
  // (arc/chapter/act/scene/moment); only a focused chapter leaves outline
  // editing for chapter-level draft/preview (Page/Pages). Shelf Console
  // covers the outline as a whole, so it's keyed on focus sitting at the
  // actual root of the outline tree -- not on kind === 'series' specifically,
  // since a single-book project's root is kind 'book' directly (no series
  // wrapper) and Shelf-only features (Project Plot chief among them) must
  // stay reachable for those projects too.
  const activeConsole: WuiConsole = useMemo(() => {
    if (!hasOpenProject) return 'shelves'
    if (!focusedNode || focusedNode.parentId === null) return 'shelf'
    if (focusedNode.kind === 'chapter') return pageMode === 'preview' ? 'pages' : 'page'
    return 'book'
  }, [hasOpenProject, focusedNode, pageMode])

  // Reset pageMode to 'draft' whenever focus leaves chapter-kind entirely,
  // or lands on a *different* chapter -- but not on every re-render while
  // staying on the same chapter (outlineNodes/focusedNode's object identity
  // changes on every save, even unrelated ones).
  const lastChapterIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (focusedNode?.kind === 'chapter') {
      if (lastChapterIdRef.current !== focusedNode.id) {
        lastChapterIdRef.current = focusedNode.id
        setPageMode('draft')
      }
    } else {
      lastChapterIdRef.current = null
      setPageMode('draft')
    }
  }, [focusedNode])

  // --- derived plot data (mirrors the outline block above exactly) ---
  const plotNodeById = useMemo(() => new Map(plotNodes.map(n => [n.id, n])), [plotNodes])

  const plotChildrenByParentId = useMemo(() => {
    const map = new Map<string | null, PlotNode[]>()
    for (const n of plotNodes) {
      const bucket = map.get(n.parentId)
      if (bucket) bucket.push(n)
      else map.set(n.parentId, [n])
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.order - b.order)
    return map
  }, [plotNodes])

  const focusedPlotNode = focusedPlotNodeId ? plotNodeById.get(focusedPlotNodeId) : undefined
  const focusedPlotChildren = plotChildrenByParentId.get(focusedPlotNodeId ?? null) ?? []

  const plotAncestryChain = useMemo(() => {
    const chain: PlotNode[] = []
    let current = focusedPlotNode
    while (current && current.parentId) {
      const parent = plotNodeById.get(current.parentId)
      if (!parent) break
      chain.unshift(parent)
      current = parent
    }
    return chain
  }, [focusedPlotNode, plotNodeById])

  // --- outline persistence ---
  async function persistOutline(projectId: string, nodes: OutlineNode[]) {
    setSaving(true)
    setSaveError(undefined)
    try {
      const tree = await apiPutOutline(projectId, { schemaVersion: outlineSchemaVersion, nodes })
      if (activeProjectIdRef.current === projectId) setOutlineNodes(tree.nodes)
    } catch (err) {
      setSaveError(errMessage(err, 'Failed to save outline'))
    } finally {
      setSaving(false)
    }
  }

  function persistNow(nodes: OutlineNode[]) {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    const projectId = activeProjectIdRef.current
    if (projectId) void persistOutline(projectId, nodes)
  }

  function scheduleDebouncedSave(nodes: OutlineNode[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const projectId = activeProjectIdRef.current
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      if (projectId) void persistOutline(projectId, nodes)
    }, DEBOUNCE_MS)
  }

  function flushPendingSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      const projectId = activeProjectIdRef.current
      if (projectId) void persistOutline(projectId, outlineNodesRef.current)
    }
  }

  // --- plot persistence (mirrors outline persistence exactly) ---
  async function persistPlot(projectId: string, nodes: PlotNode[]) {
    setPlotSaving(true)
    setPlotSaveError(undefined)
    try {
      const tree = await apiPutPlot(projectId, { schemaVersion: plotSchemaVersion, nodes })
      if (activeProjectIdRef.current === projectId) setPlotNodes(tree.nodes)
    } catch (err) {
      setPlotSaveError(errMessage(err, 'Failed to save plot'))
    } finally {
      setPlotSaving(false)
    }
  }

  function persistPlotNow(nodes: PlotNode[]) {
    if (plotSaveTimerRef.current) { clearTimeout(plotSaveTimerRef.current); plotSaveTimerRef.current = null }
    const projectId = activeProjectIdRef.current
    if (projectId) void persistPlot(projectId, nodes)
  }

  function schedulePlotDebouncedSave(nodes: PlotNode[]) {
    if (plotSaveTimerRef.current) clearTimeout(plotSaveTimerRef.current)
    const projectId = activeProjectIdRef.current
    plotSaveTimerRef.current = setTimeout(() => {
      plotSaveTimerRef.current = null
      if (projectId) void persistPlot(projectId, nodes)
    }, DEBOUNCE_MS)
  }

  function flushPendingPlotSave() {
    if (plotSaveTimerRef.current) {
      clearTimeout(plotSaveTimerRef.current)
      plotSaveTimerRef.current = null
      const projectId = activeProjectIdRef.current
      if (projectId) void persistPlot(projectId, plotNodesRef.current)
    }
  }

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (plotSaveTimerRef.current) clearTimeout(plotSaveTimerRef.current)
  }, [])

  // --- projects ---
  async function loadProjects() {
    setProjectsStatus('loading')
    setProjectsError(undefined)
    try {
      const list = await apiListProjects()
      setProjects(list)
      setProjectsStatus('idle')
    } catch (err) {
      setProjectsStatus('error')
      setProjectsError(errMessage(err, 'Failed to load projects'))
    }
  }
  useEffect(() => { void loadProjects() }, [])

  async function createProject(title: string) {
    if (!title.trim()) return
    try {
      const created = await apiCreateProject(title.trim())
      setProjects(prev => [...prev, created])
      await openProject(created.projectId)
    } catch (err) {
      setProjectsStatus('error')
      setProjectsError(errMessage(err, 'Failed to create project'))
    }
  }

  async function openProject(id: string) {
    flushPendingSave()
    flushPendingPlotSave()
    setOutlineStatus('loading')
    setOutlineError(undefined)
    setPlotStatus('loading')
    setPlotError(undefined)
    try {
      const summary = await apiGetProject(id)
      setActiveProjectId(id)
      setActiveProject(summary.index)

      const nodes = summary.outline?.nodes ?? []
      setOutlineNodes(nodes)
      setOutlineSchemaVersion(summary.outline?.schemaVersion ?? 2)
      setWarnings(summary.warnings)
      setOutlineStatus('idle')
      const root = nodes.find(n => n.parentId === null)
      setFocusedNodeId(root ? root.id : null)

      setPlotNodes(summary.plot?.nodes ?? [])
      setPlotSchemaVersion(summary.plot?.schemaVersion ?? 1)
      setPlotStatus('idle')
      setFocusedPlotNodeId(null)
      setPageMode('draft')
    } catch (err) {
      setOutlineStatus('error')
      setOutlineError(errMessage(err, 'Failed to open project'))
      setPlotStatus('error')
      setPlotError(errMessage(err, 'Failed to open project'))
    }
  }

  function backToShelves() {
    flushPendingSave()
    flushPendingPlotSave()
    setActiveProjectId(null)
    setActiveProject(null)
    setOutlineNodes([])
    setOutlineStatus('idle')
    setOutlineError(undefined)
    setWarnings([])
    setSaveError(undefined)
    setFocusedNodeId(null)

    setPlotNodes([])
    setPlotStatus('idle')
    setPlotError(undefined)
    setPlotSaveError(undefined)
    setFocusedPlotNodeId(null)
    setPageMode('draft')
  }

  async function deleteProject(id: string) {
    try {
      await apiDeleteProject(id)
      setProjects(prev => prev.filter(p => p.projectId !== id))
      if (activeProjectId === id) backToShelves()
    } catch (err) {
      setProjectsStatus('error')
      setProjectsError(errMessage(err, 'Failed to delete project'))
    }
  }

  function focusNode(nodeId: string) {
    setFocusedNodeId(nodeId)
  }

  // Sidebar/subNav shortcuts: jump straight to the outline root (Shelf
  // Console), or reveals chapter draft/preview from wherever you are.
  function focusProjectRoot() {
    const root = outlineNodes.find(n => n.parentId === null)
    setFocusedNodeId(root ? root.id : null)
  }

  function viewChapterDraft() {
    if (focusedNode?.kind === 'chapter') setPageMode('draft')
  }

  function viewChapterPages() {
    if (focusedNode?.kind === 'chapter') setPageMode('preview')
  }

  // Book Console's sub-tabs (Arc/Chapter/Act/Scene/Moment Outline) all
  // share one FocusedNodeEditor -- clicking one focuses the nearest node
  // of that kind (self/ancestor first, then a BFS over descendants),
  // rather than introducing a second, parallel focus mechanism.
  function focusNearestOfKind(kind: OutlineNodeKind) {
    const ancestorMatch = nearestFirstChain.find(n => n.kind === kind)
    if (ancestorMatch) { setFocusedNodeId(ancestorMatch.id); return }

    const startId = focusedNodeId ?? outlineNodes.find(n => n.parentId === null)?.id ?? null
    if (startId == null) return
    const queue = [startId]
    const seen = new Set<string>([startId])
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const child of childrenByParentId.get(current) ?? []) {
        if (child.kind === kind) { setFocusedNodeId(child.id); return }
        if (!seen.has(child.id)) { seen.add(child.id); queue.push(child.id) }
      }
    }
    // No node of this kind reachable from the current focus -- leave focus
    // unchanged; the routed view shows its own "nothing focused" state.
  }

  // --- outline node mutators ---
  function addOutlineNode(parentId: string | null, kind: OutlineNodeKind) {
    setOutlineNodes(prev => {
      const siblings = prev.filter(n => n.parentId === parentId)
      const nextOrder = siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.order)) + 1
      const node: OutlineNode = {
        id: newId('node'), kind, parentId, order: nextOrder,
        title: `New ${kind}`, synopsis: '', draftRef: null, flag: null,
        color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
      }
      const next = [...prev, node]
      persistNow(next)
      return next
    })
  }

  function updateOutlineNodeField(nodeId: string, field: 'title' | 'synopsis', value: string) {
    setOutlineNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, [field]: value } : n))
      scheduleDebouncedSave(next)
      return next
    })
  }

  function collectDescendantIds(nodeId: string, nodes: OutlineNode[]): Set<string> {
    const ids = new Set<string>([nodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const n of nodes) {
        if (n.parentId != null && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true }
      }
    }
    return ids
  }

  function deleteOutlineNode(nodeId: string) {
    setOutlineNodes(prev => {
      const target = prev.find(n => n.id === nodeId)
      const toRemove = collectDescendantIds(nodeId, prev)
      const next = prev.filter(n => !toRemove.has(n.id))
      persistNow(next)
      if (focusedNodeId != null && toRemove.has(focusedNodeId)) {
        const fallback = target?.parentId ?? next.find(n => n.parentId === null)?.id ?? null
        setFocusedNodeId(fallback)
      }
      return next
    })
  }

  function moveOutlineNode(nodeId: string, direction: 'up' | 'down') {
    setOutlineNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const siblings = prev.filter(n => n.parentId === node.parentId).sort((a, b) => a.order - b.order)
      const idx = siblings.findIndex(s => s.id === nodeId)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= siblings.length) return prev
      const other = siblings[swapIdx]
      const next = prev.map(n => {
        if (n.id === node.id) return { ...n, order: other.order }
        if (n.id === other.id) return { ...n, order: node.order }
        return n
      })
      persistNow(next)
      return next
    })
  }
  const moveOutlineNodeUp = (nodeId: string) => moveOutlineNode(nodeId, 'up')
  const moveOutlineNodeDown = (nodeId: string) => moveOutlineNode(nodeId, 'down')

  function toggleNodeFlag(nodeId: string, flagType: FlagType) {
    setOutlineNodes(prev => {
      const next = prev.map(n => {
        if (n.id !== nodeId) return n
        const nextFlag: NodeFlag | null = n.flag?.type === flagType ? null : { type: flagType, note: n.flag?.note ?? '' }
        return { ...n, flag: nextFlag }
      })
      persistNow(next)
      return next
    })
  }

  // --- plot node mutators ---
  function focusPlotNode(nodeId: string | null) {
    setFocusedPlotNodeId(nodeId)
  }

  function addPlotNode(parentId: string | null, kind: PlotNodeKind) {
    setPlotNodes(prev => {
      const siblings = prev.filter(n => n.parentId === parentId)
      const nextOrder = siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.order)) + 1
      const node: PlotNode = {
        id: newId('plot'), kind, parentId, order: nextOrder,
        title: `New ${kind}`, body: '', assignedMomentId: null, assignedParagraphIndex: null,
        sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
      }
      const next = [...prev, node]
      persistPlotNow(next)
      return next
    })
  }

  function updatePlotNodeField(nodeId: string, field: 'title' | 'body', value: string) {
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, [field]: value } : n))
      schedulePlotDebouncedSave(next)
      return next
    })
  }

  function addPlotKeyword(nodeId: string, keyword: string) {
    const trimmed = keyword.trim()
    if (!trimmed) return
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === nodeId && !n.keywords.includes(trimmed) ? { ...n, keywords: [...n.keywords, trimmed] } : n))
      persistPlotNow(next)
      return next
    })
  }

  function removePlotKeyword(nodeId: string, keyword: string) {
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, keywords: n.keywords.filter(k => k !== keyword) } : n))
      persistPlotNow(next)
      return next
    })
  }

  function addPlotCustomFieldDef(nodeId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, customFieldDefs: [...n.customFieldDefs, { id: newId('field'), name: trimmed }] } : n))
      persistPlotNow(next)
      return next
    })
  }

  function removePlotCustomFieldDef(nodeId: string, fieldId: string) {
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, customFieldDefs: n.customFieldDefs.filter(f => f.id !== fieldId) } : n))
      persistPlotNow(next)
      return next
    })
  }

  function updatePlotCustomFieldValue(nodeId: string, fieldId: string, value: string) {
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, customFieldValues: { ...n.customFieldValues, [fieldId]: value } } : n))
      schedulePlotDebouncedSave(next)
      return next
    })
  }

  // Ensures a top-level "Unassigned" category (and an "Unassigned"
  // subcategory under it) exist, creating whichever are missing. Returns
  // the subcategory's id -- the landing spot for rescued plotlines.
  function ensureUnassignedBucket(nodes: PlotNode[]): { nodes: PlotNode[]; subcategoryId: string } {
    let working = nodes
    let category = working.find(n => n.parentId === null && n.kind === 'category' && n.title === 'Unassigned')
    if (!category) {
      const topSiblings = working.filter(n => n.parentId === null)
      const order = topSiblings.length === 0 ? 0 : Math.max(...topSiblings.map(s => s.order)) + 1
      category = {
        id: newId('plot'), kind: 'category', parentId: null, order, title: 'Unassigned', body: '',
        assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
        customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
      }
      working = [...working, category]
    }
    let subcategory = working.find(n => n.parentId === category!.id && n.kind === 'subcategory' && n.title === 'Unassigned')
    if (!subcategory) {
      const siblings = working.filter(n => n.parentId === category!.id)
      const order = siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.order)) + 1
      subcategory = {
        id: newId('plot'), kind: 'subcategory', parentId: category.id, order, title: 'Unassigned', body: '',
        assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null,
        customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
      }
      working = [...working, subcategory]
    }
    return { nodes: working, subcategoryId: subcategory.id }
  }

  function collectPlotDescendantIds(nodeId: string, nodes: PlotNode[]): Set<string> {
    const ids = new Set<string>([nodeId])
    let changed = true
    while (changed) {
      changed = false
      for (const n of nodes) {
        if (n.parentId != null && ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true }
      }
    }
    return ids
  }

  // Deleting a category/subcategory does NOT cascade-delete its plotline
  // descendants -- per scrilbrPlan.md, "orphaned plotlines get assigned to
  // an unassigned category or subcategory" instead. Nested subcategories
  // (and any other non-plotline descendants) ARE removed along with their
  // parent; a plotline's own plotpoint children stay with it, untouched,
  // since only the plotline's own parentId changes.
  function deletePlotNode(nodeId: string) {
    setPlotNodes(prev => {
      const target = prev.find(n => n.id === nodeId)
      if (!target) return prev

      if (target.kind === 'plotline' || target.kind === 'plotpoint') {
        const toRemove = collectPlotDescendantIds(nodeId, prev)
        const next = prev.filter(n => !toRemove.has(n.id))
        persistPlotNow(next)
        if (focusedPlotNodeId != null && toRemove.has(focusedPlotNodeId)) {
          setFocusedPlotNodeId(target.parentId ?? null)
        }
        return next
      }

      // category/subcategory: walk descendants, but don't descend INTO a
      // plotline (its plotpoints stay put) -- just mark the plotline
      // itself for rescue instead of removal.
      const toRemove = new Set<string>([nodeId])
      const rescuePlotlineIds: string[] = []
      const queue = [nodeId]
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const n of prev) {
          if (n.parentId !== current || toRemove.has(n.id) || rescuePlotlineIds.includes(n.id)) continue
          if (n.kind === 'plotline') rescuePlotlineIds.push(n.id)
          else { toRemove.add(n.id); queue.push(n.id) }
        }
      }

      let working = prev
      let subcategoryId: string | undefined
      if (rescuePlotlineIds.length > 0) {
        const bucket = ensureUnassignedBucket(working)
        working = bucket.nodes
        subcategoryId = bucket.subcategoryId
      }
      const next = working
        .filter(n => !toRemove.has(n.id))
        .map(n => (subcategoryId && rescuePlotlineIds.includes(n.id) ? { ...n, parentId: subcategoryId } : n))
      persistPlotNow(next)
      if (focusedPlotNodeId != null && toRemove.has(focusedPlotNodeId)) {
        setFocusedPlotNodeId(target.parentId ?? null)
      }
      return next
    })
  }

  function movePlotNode(nodeId: string, direction: 'up' | 'down') {
    setPlotNodes(prev => {
      const node = prev.find(n => n.id === nodeId)
      if (!node) return prev
      const siblings = prev.filter(n => n.parentId === node.parentId).sort((a, b) => a.order - b.order)
      const idx = siblings.findIndex(s => s.id === nodeId)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= siblings.length) return prev
      const other = siblings[swapIdx]
      const next = prev.map(n => {
        if (n.id === node.id) return { ...n, order: other.order }
        if (n.id === other.id) return { ...n, order: node.order }
        return n
      })
      persistPlotNow(next)
      return next
    })
  }
  const movePlotNodeUp = (nodeId: string) => movePlotNode(nodeId, 'up')
  const movePlotNodeDown = (nodeId: string) => movePlotNode(nodeId, 'down')

  function togglePlotNodeFlag(nodeId: string, flagType: FlagType) {
    setPlotNodes(prev => {
      const next = prev.map(n => {
        if (n.id !== nodeId) return n
        const nextFlag: NodeFlag | null = n.flag?.type === flagType ? null : { type: flagType, note: n.flag?.note ?? '' }
        return { ...n, flag: nextFlag }
      })
      persistPlotNow(next)
      return next
    })
  }

  return {
    projects, projectsStatus, projectsError,
    activeProjectId, activeProject, hasOpenProject,
    outlineNodes, outlineStatus, outlineError, warnings, saving, saveError,
    focusedNodeId, focusedNode, focusedChildren, ancestryChain,
    childrenByParentId,
    bookAncestorId, chapterAncestorId, activeConsole, pageMode,
    loadProjects, createProject, openProject, backToShelves, deleteProject, focusNode,
    focusProjectRoot, focusNearestOfKind, viewChapterDraft, viewChapterPages,
    addOutlineNode, updateOutlineNodeField, deleteOutlineNode,
    moveOutlineNodeUp, moveOutlineNodeDown, toggleNodeFlag,

    plotNodes, plotStatus, plotError, plotSaving, plotSaveError,
    focusedPlotNodeId, focusedPlotNode, focusedPlotChildren, plotAncestryChain,
    plotChildrenByParentId,
    focusPlotNode, addPlotNode, updatePlotNodeField, deletePlotNode,
    movePlotNodeUp, movePlotNodeDown, togglePlotNodeFlag,
    addPlotKeyword, removePlotKeyword,
    addPlotCustomFieldDef, removePlotCustomFieldDef, updatePlotCustomFieldValue,
  }
}

export type WriterWorkspace = ReturnType<typeof useWriterWorkspace>
