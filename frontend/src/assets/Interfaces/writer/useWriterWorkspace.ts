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
import { booksOf, buildChildIndex, chaptersOfBook, moveNode, nearestOfKind } from './outlineTree'
import { useStoredState } from './storage'

type AsyncStatus = 'idle' | 'loading' | 'error'
const DEBOUNCE_MS = 800

// Which of the five Writer consoles is showing.
export type WuiConsole = 'shelves' | 'shelf' | 'book' | 'page' | 'pages'
type ProjectView = 'project' | 'book' | 'page' | 'pages'
// The two modes of the chapter page (Preview is its own console, 'pages').
export type ChapterMode = 'outline' | 'draft'

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function nextOrderAmong<T extends { order: number; parentId: string | null }>(nodes: T[], parentId: string | null): number {
  const siblings = nodes.filter(n => n.parentId === parentId)
  return siblings.length === 0 ? 0 : Math.max(...siblings.map(s => s.order)) + 1
}

// Everything the Writer interface needs: the project list (with each
// project's outline, for the sidebar shelves), the open project's outline
// and plot trees with debounced/immediate autosave, and the navigation state
// (which book/chapter is selected and which console shows).
export function useWriterWorkspace() {
  const [projects, setProjects] = useState<ProjectIndex[]>([])
  const [projectsStatus, setProjectsStatus] = useState<AsyncStatus>('idle')
  const [projectsError, setProjectsError] = useState<string | undefined>(undefined)
  // Every project's outline nodes, loaded once for the sidebar shelves and
  // the Shelves dashboard; the open project's entry is kept in sync below.
  const [projectOutlines, setProjectOutlines] = useState<Record<string, OutlineNode[]>>({})

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

  // --- navigation: what is selected, and which console shows it ---
  const [view, setView] = useState<ProjectView>('project')
  const [activeBookId, setActiveBookId] = useState<string | null>(null)
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  // The last-used chapter mode is remembered across sessions.
  const [storedMode, setChapterMode] = useStoredState<ChapterMode>('scriblr.writer.chapterMode', 'outline')
  const chapterMode: ChapterMode = storedMode === 'draft' ? 'draft' : 'outline'

  // --- plot tree (Shelf console's Project Plot) ---
  const [plotNodes, setPlotNodes] = useState<PlotNode[]>([])
  const [plotSchemaVersion, setPlotSchemaVersion] = useState<number>(1)
  const [plotStatus, setPlotStatus] = useState<AsyncStatus>('idle')
  const [plotError, setPlotError] = useState<string | undefined>(undefined)
  const [plotSaving, setPlotSaving] = useState<boolean>(false)
  const [plotSaveError, setPlotSaveError] = useState<string | undefined>(undefined)
  const [focusedPlotNodeId, setFocusedPlotNodeId] = useState<string | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeProjectIdRef = useRef<string | null>(null)
  const outlineNodesRef = useRef<OutlineNode[]>([])
  activeProjectIdRef.current = activeProjectId
  outlineNodesRef.current = outlineNodes

  const plotSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const plotNodesRef = useRef<PlotNode[]>([])
  plotNodesRef.current = plotNodes

  // --- derived outline data ---
  const childrenByParentId = useMemo(() => buildChildIndex(outlineNodes), [outlineNodes])
  const projectRoot = useMemo(() => outlineNodes.find(n => n.parentId === null), [outlineNodes])
  const books = useMemo(() => booksOf(outlineNodes), [outlineNodes])
  const activeBook = useMemo(() => books.find(b => b.id === activeBookId), [books, activeBookId])
  const activeBookChapters = useMemo(
    () => (activeBookId ? chaptersOfBook(outlineNodes, activeBookId) : []),
    [outlineNodes, activeBookId],
  )
  const activeChapter = useMemo(
    () => outlineNodes.find(n => n.id === activeChapterId && n.kind === 'chapter'),
    [outlineNodes, activeChapterId],
  )

  const activeConsole: WuiConsole = !hasOpenProject ? 'shelves' : view === 'project' ? 'shelf' : view

  // A selected book/chapter that no longer exists (deleted, or the project
  // changed) falls back one level instead of leaving the interface on a
  // dead selection.
  useEffect(() => {
    if (!hasOpenProject) return
    if (activeChapterId && !activeChapter) {
      setActiveChapterId(null)
      setView(v => (v === 'page' || v === 'pages' ? 'book' : v))
    }
    if (activeBookId && !activeBook) {
      setActiveBookId(null)
      setActiveChapterId(null)
      setView('project')
    }
  }, [hasOpenProject, activeBook, activeBookId, activeChapter, activeChapterId])

  // Keep the sidebar/dashboard copy of the open project's outline current.
  useEffect(() => {
    if (activeProjectId && outlineStatus === 'idle') {
      setProjectOutlines(prev => ({ ...prev, [activeProjectId]: outlineNodes }))
    }
  }, [activeProjectId, outlineNodes, outlineStatus])

  // --- derived plot data ---
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
  const plotNodeById = useMemo(() => new Map(plotNodes.map(n => [n.id, n])), [plotNodes])
  const focusedPlotNode = focusedPlotNodeId ? plotNodeById.get(focusedPlotNodeId) : undefined

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

  // --- plot persistence (mirrors outline persistence) ---
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
      // One summary per project fills the sidebar shelves (books) and the
      // dashboard's counts; a project that fails to load just shows empty.
      const entries = await Promise.all(list.map(async p => {
        try {
          const summary = await apiGetProject(p.projectId)
          return [p.projectId, summary.outline?.nodes ?? []] as const
        } catch {
          return [p.projectId, [] as OutlineNode[]] as const
        }
      }))
      setProjectOutlines(prev => ({ ...Object.fromEntries(entries), ...prev }))
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

  // Opens a project at the project level, or straight into one of its books.
  async function openProject(id: string, bookId?: string) {
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

      setPlotNodes(summary.plot?.nodes ?? [])
      setPlotSchemaVersion(summary.plot?.schemaVersion ?? 1)
      setPlotStatus('idle')
      setFocusedPlotNodeId(null)

      setActiveChapterId(null)
      if (bookId && nodes.some(n => n.id === bookId && n.kind === 'book')) {
        setActiveBookId(bookId)
        setView('book')
      } else {
        setActiveBookId(null)
        setView('project')
      }
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

    setPlotNodes([])
    setPlotStatus('idle')
    setPlotError(undefined)
    setPlotSaveError(undefined)
    setFocusedPlotNodeId(null)

    setView('project')
    setActiveBookId(null)
    setActiveChapterId(null)
  }

  async function deleteProject(id: string) {
    try {
      await apiDeleteProject(id)
      setProjects(prev => prev.filter(p => p.projectId !== id))
      setProjectOutlines(prev => {
        const { [id]: _removed, ...rest } = prev
        return rest
      })
      if (activeProjectId === id) backToShelves()
    } catch (err) {
      setProjectsStatus('error')
      setProjectsError(errMessage(err, 'Failed to delete project'))
    }
  }

  // --- navigation ---
  function showProject() {
    setView('project')
    setActiveBookId(null)
    setActiveChapterId(null)
  }

  function openBook(bookId: string) {
    setActiveBookId(bookId)
    setActiveChapterId(null)
    setView('book')
  }

  // Selects a chapter without leaving the current console (the chapter tabs
  // in the Book console pick which chapter's outline shows).
  function selectChapter(chapterId: string) {
    const book = nearestOfKind(outlineNodes, chapterId, 'book')
    if (book) setActiveBookId(book.id)
    setActiveChapterId(chapterId)
  }

  // Opens a chapter on the chapter page (Page console), in the remembered
  // mode unless one is given.
  function openChapter(chapterId: string, mode?: ChapterMode) {
    selectChapter(chapterId)
    if (mode) setChapterMode(mode)
    setView('page')
  }

  // Switches the open chapter to Outline or Draft mode.
  function showChapter(mode: ChapterMode) {
    setChapterMode(mode)
    if (activeChapterId) setView('page')
  }

  function showPreview() {
    if (activeChapterId) setView('pages')
  }

  function backToBook() {
    if (activeBookId) openBook(activeBookId)
  }

  // --- outline node mutators ---
  function addOutlineNode(parentId: string | null, kind: OutlineNodeKind, patch: Partial<OutlineNode> = {}) {
    setOutlineNodes(prev => {
      const node: OutlineNode = {
        id: newId('node'), kind, parentId, order: nextOrderAmong(prev, parentId),
        title: kind === 'act' || kind === 'scene' || kind === 'moment' ? '' : `New ${kind}`,
        synopsis: '', draftRef: null, flag: null,
        color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
        location: '', time: '', action: '',
        ...patch,
      }
      const next = [...prev, node]
      persistNow(next)
      return next
    })
  }

  function updateOutlineNode(nodeId: string, patch: Partial<OutlineNode>) {
    setOutlineNodes(prev => {
      const next = prev.map(n => (n.id === nodeId ? { ...n, ...patch } : n))
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
      const toRemove = collectDescendantIds(nodeId, prev)
      const next = prev.filter(n => !toRemove.has(n.id))
      persistNow(next)
      return next
    })
  }

  // Drag and drop: reparent/reorder a node relative to a target.
  function moveOutlineNodeTo(nodeId: string, targetId: string, mode: 'inside' | 'before') {
    setOutlineNodes(prev => {
      const next = moveNode(prev, nodeId, targetId, mode)
      if (!next) return prev
      persistNow(next)
      return next
    })
  }

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

  function addPlotNode(parentId: string | null, kind: PlotNodeKind, title?: string) {
    const id = newId('plot')
    setPlotNodes(prev => {
      const node: PlotNode = {
        id, kind, parentId, order: nextOrderAmong(prev, parentId),
        title: title ?? `New ${kind}`, body: '', assignedMomentId: null, assignedParagraphIndex: null,
        sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
      }
      const next = [...prev, node]
      persistPlotNow(next)
      return next
    })
    return id
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

  // A plotpoint is assigned to a book or chapter by storing that outline
  // node's id in assignedMomentId (the backend treats it as an opaque id);
  // null unassigns it.
  function assignPlotpoint(pointId: string, outlineNodeId: string | null) {
    setPlotNodes(prev => {
      const next = prev.map(n => (n.id === pointId ? { ...n, assignedMomentId: outlineNodeId, assignedParagraphIndex: null } : n))
      persistPlotNow(next)
      return next
    })
  }

  // Ensures a top-level "Unassigned" category (and an "Unassigned"
  // subcategory under it) exist, creating whichever are missing. Returns
  // the subcategory's id -- the landing spot for rescued plotlines.
  function ensureUnassignedBucket(nodes: PlotNode[]): { nodes: PlotNode[]; subcategoryId: string } {
    let working = nodes
    const blank = { body: '', assignedMomentId: null, assignedParagraphIndex: null, sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null }
    let category = working.find(n => n.parentId === null && n.kind === 'category' && n.title === 'Unassigned')
    if (!category) {
      category = { id: newId('plot'), kind: 'category', parentId: null, order: nextOrderAmong(working, null), title: 'Unassigned', ...blank }
      working = [...working, category]
    }
    let subcategory = working.find(n => n.parentId === category!.id && n.kind === 'subcategory' && n.title === 'Unassigned')
    if (!subcategory) {
      subcategory = { id: newId('plot'), kind: 'subcategory', parentId: category.id, order: nextOrderAmong(working, category.id), title: 'Unassigned', ...blank }
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

  // Deleting a category/subcategory does NOT cascade-delete its plotlines --
  // per scrilbrPlan.md, orphaned plotlines get assigned to an "Unassigned"
  // category/subcategory instead. Nested subcategories are removed with their
  // parent; a plotline keeps its own plotpoints (only its parentId changes).
  function deletePlotNode(nodeId: string) {
    setPlotNodes(prev => {
      const target = prev.find(n => n.id === nodeId)
      if (!target) return prev

      let next: PlotNode[]
      let removed: Set<string>
      if (target.kind === 'plotline' || target.kind === 'plotpoint') {
        removed = collectPlotDescendantIds(nodeId, prev)
        next = prev.filter(n => !removed.has(n.id))
      } else {
        removed = new Set<string>([nodeId])
        const rescue: string[] = []
        const queue = [nodeId]
        while (queue.length > 0) {
          const current = queue.shift()!
          for (const n of prev) {
            if (n.parentId !== current || removed.has(n.id) || rescue.includes(n.id)) continue
            if (n.kind === 'plotline') rescue.push(n.id)
            else { removed.add(n.id); queue.push(n.id) }
          }
        }
        let working = prev
        let bucketId: string | undefined
        if (rescue.length > 0) {
          const bucket = ensureUnassignedBucket(working)
          working = bucket.nodes
          bucketId = bucket.subcategoryId
        }
        next = working
          .filter(n => !removed.has(n.id))
          .map(n => (bucketId && rescue.includes(n.id) ? { ...n, parentId: bucketId } : n))
      }
      persistPlotNow(next)
      if (focusedPlotNodeId != null && removed.has(focusedPlotNodeId)) setFocusedPlotNodeId(null)
      return next
    })
  }

  return {
    projects, projectsStatus, projectsError, projectOutlines,
    activeProjectId, activeProject, hasOpenProject,
    outlineNodes, outlineStatus, outlineError, warnings, saving, saveError,
    childrenByParentId, projectRoot, books, activeBook, activeBookChapters, activeChapter,
    activeConsole, activeBookId, activeChapterId,
    loadProjects, createProject, openProject, backToShelves, deleteProject,
    showProject, openBook, selectChapter, openChapter, showChapter, showPreview, backToBook,
    chapterMode,
    addOutlineNode, updateOutlineNode, deleteOutlineNode, moveOutlineNodeTo, toggleNodeFlag,

    plotNodes, plotStatus, plotError, plotSaving, plotSaveError,
    focusedPlotNodeId, focusedPlotNode, plotChildrenByParentId, plotNodeById,
    focusPlotNode, addPlotNode, updatePlotNodeField, deletePlotNode,
    addPlotKeyword, removePlotKeyword,
    addPlotCustomFieldDef, removePlotCustomFieldDef, updatePlotCustomFieldValue,
    assignPlotpoint,
  }
}

export type WriterWorkspace = ReturnType<typeof useWriterWorkspace>
