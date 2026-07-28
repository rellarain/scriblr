import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOutline, useSaveOutline } from '../../api/outline'
import type { OutlineNode, OutlineNodeKind, OutlineTree } from '../../types'
import OutlineTreeView from './OutlineTreeView'
import { addBook, addNode, removeNode, renameNode, reorderSiblings } from './outlineTree'

const RENAME_SAVE_DELAY_MS = 500

function OutlineEditor() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useOutline(projectId)
  const saveOutline = useSaveOutline(projectId ?? '')

  const [nodes, setNodes] = useState<OutlineNode[]>([])
  const [newBookTitle, setNewBookTitle] = useState('')
  const schemaVersionRef = useRef(1)
  const nodesRef = useRef<OutlineNode[]>([])
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

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

  function saveNow(next: OutlineNode[]) {
    const tree: OutlineTree = { schemaVersion: schemaVersionRef.current, nodes: next }
    saveOutline.mutate(tree)
  }

  function scheduleSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => saveNow(nodesRef.current), RENAME_SAVE_DELAY_MS)
  }

  function handleRename(nodeId: string, title: string) {
    setNodes((prev) => renameNode(prev, nodeId, title))
    scheduleSave()
  }

  function handleDelete(nodeId: string) {
    const next = removeNode(nodes, nodeId)
    setNodes(next)
    saveNow(next)
  }

  function handleAddChild(parentId: string, kind: OutlineNodeKind, title: string) {
    const next = addNode(nodes, parentId, kind, title)
    setNodes(next)
    saveNow(next)
  }

  function handleReorder(_parentId: string | null, orderedIds: string[]) {
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

  if (isLoading) return <p>Loading outline…</p>

  return (
    <div className="outline-editor">
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
        onRename={handleRename}
        onDelete={handleDelete}
        onAddChild={handleAddChild}
        onReorder={handleReorder}
      />

      {nodes.length === 0 && <p>No books yet — add your first one above.</p>}
    </div>
  )
}

export default OutlineEditor
