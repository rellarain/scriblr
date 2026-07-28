import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOutline } from '../../api/outline'
import { usePlot, useSavePlot } from '../../api/plot'
import type { PlotNode, PlotNodeKind, PlotTree } from '../../types'
import { getAllMoments } from '../outline/outlineTree'
import PlotAddChildForm from './PlotAddChildForm'
import PlotTreeView from './PlotTreeView'
import { addNode, removeNode, renameNode, reorderSiblings, updatePlotpoint } from './plotTree'

const EDIT_SAVE_DELAY_MS = 500

function PlotSidebar() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = usePlot(projectId)
  const { data: outline } = useOutline(projectId)
  const savePlot = useSavePlot(projectId ?? '')

  const [nodes, setNodes] = useState<PlotNode[]>([])
  const schemaVersionRef = useRef(1)
  const nodesRef = useRef<PlotNode[]>([])
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

  const moments = getAllMoments(outline?.nodes ?? [])

  function saveNow(next: PlotNode[]) {
    const tree: PlotTree = { schemaVersion: schemaVersionRef.current, nodes: next }
    savePlot.mutate(tree)
  }

  function scheduleSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => saveNow(nodesRef.current), EDIT_SAVE_DELAY_MS)
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

  function handleAddChild(parentId: string | null, kind: PlotNodeKind, title: string) {
    const next = addNode(nodes, parentId, kind, title)
    setNodes(next)
    saveNow(next)
  }

  function handleUpdatePlotpoint(nodeId: string, patch: { body?: string; assignedMomentId?: string | null }) {
    const next = updatePlotpoint(nodes, nodeId, patch)
    setNodes(next)
    if (patch.assignedMomentId !== undefined) {
      saveNow(next)
    } else {
      scheduleSave()
    }
  }

  function handleReorder(orderedIds: string[]) {
    const next = reorderSiblings(nodes, orderedIds)
    setNodes(next)
    saveNow(next)
  }

  if (isLoading) return <p>Loading plot…</p>

  return (
    <div className="plot-sidebar">
      <h3>Plot</h3>

      <PlotAddChildForm kindOptions={['category']} onSubmit={(kind, title) => handleAddChild(null, kind, title)} />

      <PlotTreeView
        nodes={nodes}
        parentId={null}
        depth={0}
        moments={moments}
        onRename={handleRename}
        onDelete={handleDelete}
        onAddChild={handleAddChild}
        onUpdatePlotpoint={handleUpdatePlotpoint}
        onReorder={handleReorder}
      />

      {nodes.length === 0 && <p className="plot-sidebar__empty">No categories yet.</p>}
    </div>
  )
}

export default PlotSidebar
