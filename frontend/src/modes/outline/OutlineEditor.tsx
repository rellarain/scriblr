import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOutline, useSaveOutline } from '../../api/outline'
import { useProject, useUpdateProject } from '../../api/projects'
import { OUTLINE_KIND_ORDER } from '../../types'
import type { OutlineNode, OutlineNodeKind, OutlineTree } from '../../types'
import OutlineTreeView from './OutlineTreeView'
import {
  addBook,
  createChildNode,
  createSiblingNode,
  escalateToChild,
  getNextSibling,
  getPreviousSibling,
  hasChildren,
  removeNode,
  renameNode,
  reorderSiblings,
} from './outlineTree'

const RENAME_SAVE_DELAY_MS = 500

interface PendingSibling {
  anchorId: string
  pendingId: string
}

function OutlineEditor() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading, error } = useOutline(projectId)
  const { data: project } = useProject(projectId)
  const saveOutline = useSaveOutline(projectId ?? '')
  const updateProject = useUpdateProject(projectId ?? '')

  const [nodes, setNodes] = useState<OutlineNode[]>([])
  const [newBookTitle, setNewBookTitle] = useState('')
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)
  const schemaVersionRef = useRef(1)
  const nodesRef = useRef<OutlineNode[]>([])
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Tracks a just-created empty sibling so a second, immediate Enter can
  // escalate it into a child of the node it was created from instead of
  // creating yet another sibling. Cleared by any other action (typing,
  // navigation, deletion) so escalation only fires on truly consecutive Enters.
  const pendingSibling = useRef<PendingSibling | null>(null)

  const levels = project?.index.settings.outlineLevels ?? OUTLINE_KIND_ORDER

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
      inputRefs.current[pendingFocus]!.focus()
      setPendingFocus(null)
    }
  }, [pendingFocus, nodes])

  const registerInput = useCallback((nodeId: string, el: HTMLInputElement | null) => {
    inputRefs.current[nodeId] = el
  }, [])

  function saveNow(next: OutlineNode[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    const tree: OutlineTree = { schemaVersion: schemaVersionRef.current, nodes: next }
    saveOutline.mutate(tree)
  }

  function scheduleSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => saveNow(nodesRef.current), RENAME_SAVE_DELAY_MS)
  }

  function handleRename(nodeId: string, title: string) {
    pendingSibling.current = null
    setNodes((prev) => renameNode(prev, nodeId, title))
    scheduleSave()
  }

  function handleDelete(node: OutlineNode) {
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

  function handleAddChild(node: OutlineNode) {
    pendingSibling.current = null
    const result = createChildNode(nodesRef.current, levels, node)
    if (!result) return
    setNodes(result.nodes)
    saveNow(result.nodes)
    setPendingFocus(result.newNode.id)
  }

  function handleNextSibling(node: OutlineNode) {
    pendingSibling.current = null
    const next = getNextSibling(nodesRef.current, node.id)
    if (next) setPendingFocus(next.id)
  }

  function handlePreviousSibling(node: OutlineNode) {
    pendingSibling.current = null
    const prev = getPreviousSibling(nodesRef.current, node.id)
    if (prev) setPendingFocus(prev.id)
  }

  function handleNavigateToParent(node: OutlineNode) {
    pendingSibling.current = null
    if (node.parentId) setPendingFocus(node.parentId)
  }

  function handleEnter(node: OutlineNode) {
    const pending = pendingSibling.current
    if (pending && pending.pendingId === node.id && node.title.trim() === '') {
      // Second consecutive Enter on the still-empty node just created below
      // `anchorId` -- turn it into a child of that anchor instead.
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

  function handleReorder(_parentId: string | null, orderedIds: string[]) {
    pendingSibling.current = null
    const next = reorderSiblings(nodes, orderedIds)
    setNodes(next)
    saveNow(next)
  }

  function handleAddBook() {
    const title = newBookTitle.trim()
    if (!title) return
    const next = addBook(nodes, title)
    setNodes(next)
    saveNow(next)
    setNewBookTitle('')
  }

  function toggleLevel(kind: OutlineNodeKind) {
    if (kind === 'book') return
    const set = new Set(levels)
    if (set.has(kind)) set.delete(kind)
    else set.add(kind)
    const ordered = OUTLINE_KIND_ORDER.filter((k) => k === 'book' || set.has(k))
    updateProject.mutate({ outlineLevels: ordered })
  }

  if (isLoading) return <p>Loading outline…</p>
  if (error) return <p className="outline-editor__error">Failed to load outline. Retrying…</p>

  return (
    <div className="outline-editor">
      <div className="level-config">
        <span className="level-config__label">Levels:</span>
        {OUTLINE_KIND_ORDER.map((kind) => (
          <label key={kind} className="level-config__option">
            <input
              type="checkbox"
              checked={levels.includes(kind)}
              disabled={kind === 'book'}
              onChange={() => toggleLevel(kind)}
            />
            {kind}
          </label>
        ))}
      </div>

      <div className="outline-editor__add-book">
        <input
          type="text"
          placeholder="New book title"
          value={newBookTitle}
          onChange={(e) => setNewBookTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddBook()}
        />
        <button type="button" onClick={handleAddBook}>
          Add book
        </button>
      </div>

      <OutlineTreeView
        nodes={nodes}
        parentId={null}
        depth={0}
        levels={levels}
        onRename={handleRename}
        onDelete={handleDelete}
        onAddChild={handleAddChild}
        onNextSibling={handleNextSibling}
        onPreviousSibling={handlePreviousSibling}
        onEnter={handleEnter}
        onNavigateToParent={handleNavigateToParent}
        registerInput={registerInput}
        onReorder={handleReorder}
      />

      {nodes.length === 0 && <p>No books yet — add your first one above.</p>}
    </div>
  )
}

export default OutlineEditor
