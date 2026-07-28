import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOutline, useSaveOutline } from '../../api/outline'
import type { OutlineNode, OutlineNodeKind, OutlineTree } from '../../types'
import AddChildForm from './AddChildForm'
import OutlineTreeView from './OutlineTreeView'
import { addNode, getBook, kindsDeeperThan, removeNode, renameNode, reorderSiblings } from './outlineTree'

const RENAME_SAVE_DELAY_MS = 500

function OutlineEditor() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useOutline(projectId)
  const saveOutline = useSaveOutline(projectId ?? '')

  const [nodes, setNodes] = useState<OutlineNode[]>([])
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

  function handleReorder(_parentId: string, orderedIds: string[]) {
    const next = reorderSiblings(nodes, orderedIds)
    setNodes(next)
    saveNow(next)
  }

  if (isLoading) return <p>Loading outline…</p>

  const book = getBook(nodes)
  if (!book) return null

  return (
    <div className="outline-editor">
      <h2>{book.title}</h2>

      <AddChildForm kindOptions={kindsDeeperThan('book')} onSubmit={(kind, title) => handleAddChild(book.id, kind, title)} />

      <OutlineTreeView
        nodes={nodes}
        parentId={book.id}
        depth={0}
        onRename={handleRename}
        onDelete={handleDelete}
        onAddChild={handleAddChild}
        onReorder={handleReorder}
      />
    </div>
  )
}

export default OutlineEditor
