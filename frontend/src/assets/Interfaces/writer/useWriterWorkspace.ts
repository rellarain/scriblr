import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  FlagType, NodeFlag, OutlineNode, OutlineNodeKind, PlotNode, PlotNodeKind, ProjectIndex, TimeSystem,
} from '../../../api/types'
import {
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  getProject as apiGetProject,
  listProjects as apiListProjects,
  updateProject as apiUpdateProject,
} from '../../../api/projectsApi'
import { putOutline as apiPutOutline } from '../../../api/outlineApi'
import { putPlot as apiPutPlot } from '../../../api/plotApi'
import { booksOf, buildChildIndex, chaptersOfBook, dissolveSeries, moveNodeTo, nearestOfKind } from './outlineTree'
import { isAssignedPlotpoint } from './plotTree'
import { useStoredState } from './storage'
import { combineSaveStatus, useAutosave } from '../../../lib/useAutosave'
import { insertAfter } from '../../../lib/siblingOrder'
import { clampHueToWindow, wrapHue } from '../../../theme/bookColors'

type AsyncStatus = 'idle' | 'loading' | 'error'

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
  const [focusedPlotNodeId, setFocusedPlotNodeId] = useState<string | null>(null)

  const activeProjectIdRef = useRef<string | null>(null)
  const outlineNodesRef = useRef<OutlineNode[]>([])
  const plotNodesRef = useRef<PlotNode[]>([])
  activeProjectIdRef.current = activeProjectId

  outlineNodesRef.current = outlineNodes
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

  // --- persistence (autosave, see lib/useAutosave.ts) ---
  // Text edits save after a pause; structural edits (add/delete/move) save at
  // once; navigation flushes whatever is waiting. The value carries its own
  // project id, so a save that finishes after switching projects can never
  // land on the wrong one.
  const outlineSave = useAutosave<{ projectId: string; schemaVersion: number; nodes: OutlineNode[] }>({
    save: async ({ projectId, schemaVersion, nodes }) => {
      const tree = await apiPutOutline(projectId, { schemaVersion, nodes })
      // Adopt the server's copy only if nothing newer is waiting or queued (it would
      // otherwise briefly revert keystrokes typed while this save ran).
      if (activeProjectIdRef.current === projectId && !outlineSave.hasNewer()) setOutlineNodes(tree.nodes)
    },
  })
  const plotSave = useAutosave<{ projectId: string; schemaVersion: number; nodes: PlotNode[] }>({
    save: async ({ projectId, schemaVersion, nodes }) => {
      const tree = await apiPutPlot(projectId, { schemaVersion, nodes })
      if (activeProjectIdRef.current === projectId && !plotSave.hasNewer()) setPlotNodes(tree.nodes)
    },
  })

  // The project's time systems (Project Editor): saved like the trees.
  const settingsSave = useAutosave<{ projectId: string; timeSystems: TimeSystem[] }>({
    save: async ({ projectId, timeSystems }) => {
      const index = await apiUpdateProject(projectId, { timeSystems })
      if (activeProjectIdRef.current === projectId && !settingsSave.hasNewer()) setActiveProject(index)
    },
  })

  function updateTimeSystems(next: TimeSystem[], immediate: boolean) {
    setActiveProject(prev => (prev ? { ...prev, settings: { ...prev.settings, timeSystems: next } } : prev))
    const projectId = activeProjectIdRef.current
    if (!projectId) return
    if (immediate) void settingsSave.saveNow({ projectId, timeSystems: next })
    else settingsSave.schedule({ projectId, timeSystems: next })
  }

  // Apply an edit to the outline: `immediate` saves now (structural edits),
  // otherwise after a pause. Computed from the ref so edits in the same tick
  // compose, and kept out of state updaters (which run twice in StrictMode).
  function commitOutline(next: OutlineNode[], immediate: boolean) {
    outlineNodesRef.current = next
    setOutlineNodes(next)
    const projectId = activeProjectIdRef.current
    if (!projectId) return
    const value = { projectId, schemaVersion: outlineSchemaVersion, nodes: next }
    if (immediate) void outlineSave.saveNow(value)
    else outlineSave.schedule(value)
  }

  function commitPlot(next: PlotNode[], immediate: boolean) {
    plotNodesRef.current = next
    setPlotNodes(next)
    const projectId = activeProjectIdRef.current
    if (!projectId) return
    const value = { projectId, schemaVersion: plotSchemaVersion, nodes: next }
    if (immediate) void plotSave.saveNow(value)
    else plotSave.schedule(value)
  }

  // Save everything waiting: navigation calls this, and so does the Save button.
  function saveNow(): Promise<void> {
    return Promise.all([outlineSave.flush(), plotSave.flush(), settingsSave.flush()]).then(() => undefined)
  }
  function flushAll() { void saveNow() }

  // Throw away what has not been saved and reload the last saved outline, plot
  // and project settings (the Save control's restore button).
  async function restoreSaved(): Promise<void> {
    const projectId = activeProjectIdRef.current
    await Promise.all([outlineSave.discard(), plotSave.discard(), settingsSave.discard()])
    if (!projectId) return
    try {
      const summary = await apiGetProject(projectId)
      if (activeProjectIdRef.current !== projectId) return
      const outline = summary.outline?.nodes ?? []
      const plot = summary.plot?.nodes ?? []
      outlineNodesRef.current = outline
      plotNodesRef.current = plot
      setOutlineNodes(outline)
      setPlotNodes(plot)
      setActiveProject(summary.index)
    } catch (err) {
      setOutlineError(errMessage(err, 'Failed to restore the last saved version'))
    }
  }
  const saveStatus = combineSaveStatus(outlineSave, plotSave, settingsSave)

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
    flushAll()
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
    flushAll()
    setActiveProjectId(null)
    setActiveProject(null)
    setOutlineNodes([])
    setOutlineStatus('idle')
    setOutlineError(undefined)
    setWarnings([])

    setPlotNodes([])
    setPlotStatus('idle')
    setPlotError(undefined)
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
    flushAll()
    setView('project')
    setActiveBookId(null)
    setActiveChapterId(null)
  }

  function openBook(bookId: string) {
    flushAll()
    setActiveBookId(bookId)
    setActiveChapterId(null)
    setView('book')
  }

  // Selects a chapter without leaving the current console (the chapter tabs
  // in the Book console pick which chapter's outline shows).
  function selectChapter(chapterId: string) {
    flushAll()
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
    flushAll()
    setChapterMode(mode)
    if (activeChapterId) setView('page')
  }

  function showPreview() {
    flushAll()
    if (activeChapterId) setView('pages')
  }

  function backToBook() {
    if (activeBookId) openBook(activeBookId)
  }

  // --- outline node mutators ---
  // `afterId` places the new node right after that sibling (keyboard shortcuts);
  // otherwise it goes last. Returns the new node's id.
  function addOutlineNode(parentId: string | null, kind: OutlineNodeKind, patch: Partial<OutlineNode> = {}, afterId?: string): string {
    const prev = outlineNodesRef.current
    const node: OutlineNode = {
      id: newId('node'), kind, parentId, order: nextOrderAmong(prev, parentId),
      // New nodes have no title: the input shows a placeholder until something is typed.
      title: '',
      synopsis: '', draftRef: null, flag: null,
      color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
      location: '', timeValue: {}, action: '',
      createdAt: new Date().toISOString(),
      ...patch,
    }
    commitOutline(afterId ? insertAfter(prev, node, afterId, n => n.parentId === parentId) : [...prev, node], true)
    return node.id
  }

  function updateOutlineNode(nodeId: string, patch: Partial<OutlineNode>) {
    commitOutline(outlineNodesRef.current.map(n => (n.id === nodeId ? { ...n, ...patch } : n)), false)
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
    const prev = outlineNodesRef.current
    const node = prev.find(n => n.id === nodeId)
    const toRemove = collectDescendantIds(nodeId, prev)

    // Plotpoints assigned to what is being deleted: those inside a chapter fall
    // back to the chapter (still assigned to it), the rest are unassigned.
    const plots = plotNodesRef.current
    const affected = (p: PlotNode) => p.kind === 'plotpoint' && p.assignedMomentId != null && toRemove.has(p.assignedMomentId)
    if (plots.some(affected)) {
      const inner = node && (node.kind === 'act' || node.kind === 'scene' || node.kind === 'moment')
      const chapter = inner && node.parentId ? nearestOfKind(prev, node.parentId, 'chapter') : undefined
      commitPlot(plots.map(p => (affected(p) ? { ...p, assignedMomentId: chapter?.id ?? null, assignedParagraphIndex: null } : p)), true)
    }

    commitOutline(prev.filter(n => !toRemove.has(n.id)), true)
  }

  // Drag and drop: place a node under `parentId`, before its child `beforeId` (last when null).
  function moveOutlineNodeInto(nodeId: string, parentId: string | null, beforeId: string | null) {
    const next = moveNodeTo(outlineNodesRef.current, nodeId, parentId, beforeId)
    // A free draft dropped among the outline becomes an ordinary moment.
    if (next) commitOutline(next.map(n => (n.id === nodeId && n.freeDraft ? { ...n, freeDraft: false } : n)), true)
  }

  // Delete a series but keep its books (they stay where the series was, no longer grouped).
  function deleteSeries(seriesId: string) {
    commitOutline(dissolveSeries(outlineNodesRef.current, seriesId), true)
  }

  function toggleNodeFlag(nodeId: string, flagType: FlagType) {
    commitOutline(outlineNodesRef.current.map(n => {
      if (n.id !== nodeId) return n
      const nextFlag: NodeFlag | null = n.flag?.type === flagType ? null : { type: flagType, note: n.flag?.note ?? '' }
      return { ...n, flag: nextFlag }
    }), true)
  }

  // --- plot node mutators ---
  function focusPlotNode(nodeId: string | null) {
    setFocusedPlotNodeId(nodeId)
  }

  function addPlotNode(parentId: string | null, kind: PlotNodeKind, title?: string, afterId?: string) {
    const id = newId('plot')
    const prev = plotNodesRef.current
    const node: PlotNode = {
      id, kind, parentId, order: nextOrderAmong(prev, parentId),
      title: title ?? '', body: '', assignedMomentId: null, assignedParagraphIndex: null,
      sourceFieldId: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null,
    }
    commitPlot(afterId ? insertAfter(prev, node, afterId, n => n.parentId === parentId) : [...prev, node], true)
    return id
  }

  function updatePlotNodeField(nodeId: string, field: 'title' | 'body', value: string) {
    commitPlot(plotNodesRef.current.map(n => (n.id === nodeId ? { ...n, [field]: value } : n)), false)
  }

  // Set a category's or subcategory's colour hue. A category's new hue pulls its
  // subcategories' own hues back within 60 degrees of it; a subcategory's stays
  // within 60 degrees of its category's (`categoryHue`: the category's hue as
  // shown, which is stored on the category too when it had none of its own).
  function setPlotHue(nodeId: string, hue: number, categoryHue?: number) {
    const prev = plotNodesRef.current
    const target = prev.find(n => n.id === nodeId)
    if (!target || (target.kind !== 'category' && target.kind !== 'subcategory')) return
    const wrapped = wrapHue(hue)
    if (target.kind === 'category') {
      commitPlot(prev.map(n => {
        if (n.id === nodeId) return { ...n, hue: wrapped }
        if (n.parentId === nodeId && n.kind === 'subcategory' && n.hue != null) return { ...n, hue: clampHueToWindow(wrapped, n.hue) }
        return n
      }), false)
      return
    }
    const parent = target.parentId ? prev.find(n => n.id === target.parentId) : undefined
    const centre = parent?.hue ?? categoryHue
    const value = centre != null ? clampHueToWindow(centre, wrapped) : wrapped
    commitPlot(prev.map(n => {
      if (n.id === nodeId) return { ...n, hue: value }
      if (parent && n.id === parent.id && parent.hue == null && centre != null) return { ...n, hue: wrapHue(centre) }
      return n
    }), false)
  }

  function addPlotKeyword(nodeId: string, keyword: string) {
    const trimmed = keyword.trim()
    if (!trimmed) return
    commitPlot(plotNodesRef.current.map(n => (n.id === nodeId && !n.keywords.includes(trimmed) ? { ...n, keywords: [...n.keywords, trimmed] } : n)), true)
  }

  function removePlotKeyword(nodeId: string, keyword: string) {
    commitPlot(plotNodesRef.current.map(n => (n.id === nodeId ? { ...n, keywords: n.keywords.filter(k => k !== keyword) } : n)), true)
  }

  function addPlotCustomFieldDef(nodeId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    commitPlot(plotNodesRef.current.map(n => (n.id === nodeId ? { ...n, customFieldDefs: [...n.customFieldDefs, { id: newId('field'), name: trimmed }] } : n)), true)
  }

  function removePlotCustomFieldDef(nodeId: string, fieldId: string) {
    commitPlot(plotNodesRef.current.map(n => (n.id === nodeId ? { ...n, customFieldDefs: n.customFieldDefs.filter(f => f.id !== fieldId) } : n)), true)
  }

  function updatePlotCustomFieldValue(nodeId: string, fieldId: string, value: string) {
    commitPlot(plotNodesRef.current.map(n => (n.id === nodeId ? { ...n, customFieldValues: { ...n.customFieldValues, [fieldId]: value } } : n)), false)
  }

  // A plotpoint is assigned to a book or chapter by storing that outline
  // node's id in assignedMomentId (the backend treats it as an opaque id);
  // null unassigns it.
  function assignPlotpoint(pointId: string, outlineNodeId: string | null) {
    commitPlot(plotNodesRef.current.map(n => (n.id === pointId ? { ...n, assignedMomentId: outlineNodeId, assignedParagraphIndex: null } : n)), true)
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
    const prev = plotNodesRef.current
    const target = prev.find(n => n.id === nodeId)
    if (!target) return

    // Only unassigned plotpoints can be deleted, so a plotline holding an
    // assigned one cannot be deleted either until it is unassigned.
    const outlineById = new Map(outlineNodesRef.current.map(n => [n.id, n]))
    if (target.kind === 'plotpoint' && isAssignedPlotpoint(target, outlineById)) return
    if (target.kind === 'plotline'
      && prev.some(n => n.parentId === target.id && n.kind === 'plotpoint' && isAssignedPlotpoint(n, outlineById))) return

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
    commitPlot(next, true)
    if (focusedPlotNodeId != null && removed.has(focusedPlotNodeId)) setFocusedPlotNodeId(null)
  }

  return {
    projects, projectsStatus, projectsError, projectOutlines,
    activeProjectId, activeProject, hasOpenProject,
    outlineNodes, outlineStatus, outlineError, warnings, saving: outlineSave.saving, saveError: outlineSave.error,
    saveStatus, saveNow, flushAll, restoreSaved, updateTimeSystems,
    childrenByParentId, projectRoot, books, activeBook, activeBookChapters, activeChapter,
    activeConsole, activeBookId, activeChapterId,
    loadProjects, createProject, openProject, backToShelves, deleteProject,
    showProject, openBook, selectChapter, openChapter, showChapter, showPreview, backToBook,
    chapterMode,
    addOutlineNode, updateOutlineNode, deleteOutlineNode, deleteSeries, moveOutlineNodeInto, toggleNodeFlag,

    plotNodes, plotStatus, plotError, plotSaving: plotSave.saving, plotSaveError: plotSave.error,
    focusedPlotNodeId, focusedPlotNode, plotChildrenByParentId, plotNodeById,
    focusPlotNode, addPlotNode, updatePlotNodeField, setPlotHue, deletePlotNode,
    addPlotKeyword, removePlotKeyword,
    addPlotCustomFieldDef, removePlotCustomFieldDef, updatePlotCustomFieldValue,
    assignPlotpoint,
  }
}

export type WriterWorkspace = ReturnType<typeof useWriterWorkspace>
