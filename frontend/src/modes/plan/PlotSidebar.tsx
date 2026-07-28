import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePlot, useSavePlot } from '../../api/plot'
import { useProject, useUpdateProject } from '../../api/projects'
import { PLOT_KIND_ORDER } from '../../types'
import type { PlotNode, PlotNodeKind, PlotTree } from '../../types'
import PlotTreeView from './PlotTreeView'
import {
  addCategory,
  createChildNode,
  createSiblingNode,
  escalateToChild,
  getNextSibling,
  getPreviousSibling,
  hasChildren,
  removeNode,
  renameNode,
  reorderSiblings,
  updatePlotpointBody,
} from './plotTree'

const EDIT_SAVE_DELAY_MS = 500

interface PendingSibling {
  anchorId: string
  pendingId: string
}

function PlotSidebar() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error } = usePlot(projectId)
  const { data: project } = useProject(projectId)
  const savePlot = useSavePlot(projectId ?? '')
  const updateProject = useUpdateProject(projectId ?? '')

  const [nodes, setNodes] = useState<PlotNode[]>([])
  const [newCategoryTitle, setNewCategoryTitle] = useState('')
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const schemaVersionRef = useRef(1)
  const nodesRef = useRef<PlotNode[]>([])
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const pendingSibling = useRef<PendingSibling | null>(null)

  const levels = project?.index.settings.plotLevels ?? PLOT_KIND_ORDER

  useEffect(() => {
    if (data) {
      setNodes(data.nodes)
      nodesRef.current = data.nodes
      schemaVersionRef.current = data.schemaVersion
    }
  }, [data])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    if (pendingFocus && inputRefs.current[pendingFocus]) {
      const el = inputRefs.current[pendingFocus]!
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
      setPendingFocus(null)
    }
  }, [pendingFocus, nodes])

  const registerInput = useCallback((nodeId: string, el: HTMLInputElement | null) => {
    inputRefs.current[nodeId] = el
  }, [])

  function handleToggleCollapse(nodeId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  function saveNow(next: PlotNode[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    const tree: PlotTree = { schemaVersion: schemaVersionRef.current, nodes: next }
    savePlot.mutate(tree)
  }

  function scheduleSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => saveNow(nodesRef.current), EDIT_SAVE_DELAY_MS)
  }

  function handleRename(nodeId: string, title: string) {
    pendingSibling.current = null
    setNodes((prev) => renameNode(prev, nodeId, title))
    scheduleSave()
  }

  function handleDelete(node: PlotNode) {
    if (hasChildren(nodesRef.current, node.id)) {
      const ok = confirm(
        `Delete "${node.title || 'Untitled'}" and everything nested under it? This cannot be undone.`
      )
      if (!ok) return
    }
    pendingSibling.current = null
    const next = removeNode(nodesRef.current, node.id)
    setNodes(next)
    saveNow(next)
  }

  function handleBackspaceDelete(node: PlotNode) {
    if (hasChildren(nodesRef.current, node.id)) {
      const ok = confirm(
        `Delete "${node.title || 'Untitled'}" and everything nested under it? This cannot be undone.`
      )
      if (!ok) return
    }
    pendingSibling.current = null
    const prev = getPreviousSibling(nodesRef.current, node.id)
    const focusTarget = prev && prev.id !== node.id ? prev.id : node.parentId
    const next = removeNode(nodesRef.current, node.id)
    setNodes(next)
    saveNow(next)
    if (focusTarget) setPendingFocus(focusTarget)
  }

  function handleAddChild(node: PlotNode) {
    pendingSibling.current = null
    const result = createChildNode(nodesRef.current, levels, node)
    if (!result) return
    setNodes(result.nodes)
    saveNow(result.nodes)
    setPendingFocus(result.newNode.id)
  }

  function handleNextSibling(node: PlotNode) {
    pendingSibling.current = null
    const next = getNextSibling(nodesRef.current, node.id)
    if (next) setPendingFocus(next.id)
  }

  function handlePreviousSibling(node: PlotNode) {
    pendingSibling.current = null
    const prev = getPreviousSibling(nodesRef.current, node.id)
    if (prev) setPendingFocus(prev.id)
  }

  function handleNavigateToParent(node: PlotNode) {
    pendingSibling.current = null
    if (node.parentId) setPendingFocus(node.parentId)
  }

  function handleEnter(node: PlotNode) {
    const pending = pendingSibling.current
    if (pending && pending.pendingId === node.id && node.title.trim() === '') {
      pendingSibling.current = null
      const next = escalateToChild(nodesRef.current, levels, pending.anchorId, node.id)
      if (next) {
        setNodes(next)
        saveNow(next)
        setPendingFocus(node.id)
      }
      return
    }
    const result = createSiblingNode(nodesRef.current, node)
    setNodes(result.nodes)
    saveNow(result.nodes)
    setPendingFocus(result.newNode.id)
    pendingSibling.current = { anchorId: node.id, pendingId: result.newNode.id }
  }

  function handleUpdateBody(nodeId: string, body: string) {
    pendingSibling.current = null
    const next = updatePlotpointBody(nodesRef.current, nodeId, body)
    setNodes(next)
    scheduleSave()
  }

  function handleReorder(orderedIds: string[]) {
    pendingSibling.current = null
    const next = reorderSiblings(nodes, orderedIds)
    setNodes(next)
    saveNow(next)
  }

  function handleAddCategory() {
    const title = newCategoryTitle.trim()
    if (!title) return
    const next = addCategory(nodes, title)
    setNodes(next)
    saveNow(next)
    setNewCategoryTitle('')
  }

  function toggleLevel(kind: PlotNodeKind) {
    if (kind === 'category') return
    const set = new Set(levels)
    if (set.has(kind)) set.delete(kind)
    else set.add(kind)
    const ordered = PLOT_KIND_ORDER.filter((k) => k === 'category' || set.has(k))
    updateProject.mutate({ plotLevels: ordered })
  }

  if (isLoading) return <p>Loading plot…</p>
  if (error) return <p className="plot-sidebar__error">Failed to load plot. Retrying…</p>

  return (
    <div className="plot-sidebar">
      <h3>Plot</h3>

      <div className="level-config">
        <span className="level-config__label">Levels:</span>
        {PLOT_KIND_ORDER.map((kind) => (
          <label key={kind} className="level-config__option">
            <input
              type="checkbox"
              checked={levels.includes(kind)}
              disabled={kind === 'category'}
              onChange={() => toggleLevel(kind)}
            />
            {kind}
          </label>
        ))}
      </div>

      {nodes.length === 0 && (
        <div className="plot-sidebar__add-category">
          <input
            type="text"
            placeholder="New category title"
            value={newCategoryTitle}
            onChange={(e) => setNewCategoryTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <button type="button" onClick={handleAddCategory}>
            Add category
          </button>
        </div>
      )}

      <PlotTreeView
        nodes={nodes}
        parentId={null}
        levels={levels}
        collapsedIds={collapsedIds}
        onToggleCollapse={handleToggleCollapse}
        onRename={handleRename}
        onDelete={handleDelete}
        onAddChild={handleAddChild}
        onNextSibling={handleNextSibling}
        onPreviousSibling={handlePreviousSibling}
        onEnter={handleEnter}
        onNavigateToParent={handleNavigateToParent}
        onBackspaceDelete={handleBackspaceDelete}
        onUpdateBody={handleUpdateBody}
        registerInput={registerInput}
        onReorder={handleReorder}
      />

      {nodes.length === 0 && <p className="plot-sidebar__empty">No categories yet.</p>}
    </div>
  )
}

export default PlotSidebar
