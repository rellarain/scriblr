import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOutline, useSaveOutline } from '../../api/outline'
import type { OutlineNode, OutlineTree } from '../../types'
import OutlineNodeRow from './OutlineNodeRow'
import { addChapter, addScene, getBook, getChapters, getScenes, removeNode, renameNode, reorderSiblings } from './outlineTree'

const RENAME_SAVE_DELAY_MS = 500

function OutlineMode() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useOutline(projectId)
  const saveOutline = useSaveOutline(projectId ?? '')

  const [nodes, setNodes] = useState<OutlineNode[]>([])
  const [newChapterTitle, setNewChapterTitle] = useState('')
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

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

  function handleAddChapter() {
    const book = getBook(nodes)
    const title = newChapterTitle.trim()
    if (!book || !title) return
    const next = addChapter(nodes, book.id, title)
    setNodes(next)
    saveNow(next)
    setNewChapterTitle('')
  }

  function handleAddScene(chapterId: string) {
    const next = addScene(nodes, chapterId, 'New scene')
    setNodes(next)
    saveNow(next)
  }

  function handleChapterDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const book = getBook(nodes)
    if (!book) return
    const ordered = getChapters(nodes).map((c) => c.id)
    const oldIndex = ordered.indexOf(String(active.id))
    const newIndex = ordered.indexOf(String(over.id))
    ordered.splice(newIndex, 0, ordered.splice(oldIndex, 1)[0])
    const next = reorderSiblings(nodes, book.id, ordered)
    setNodes(next)
    saveNow(next)
  }

  function handleSceneDragEnd(chapterId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ordered = getScenes(nodes, chapterId).map((s) => s.id)
    const oldIndex = ordered.indexOf(String(active.id))
    const newIndex = ordered.indexOf(String(over.id))
    ordered.splice(newIndex, 0, ordered.splice(oldIndex, 1)[0])
    const next = reorderSiblings(nodes, chapterId, ordered)
    setNodes(next)
    saveNow(next)
  }

  if (isLoading) return <p>Loading outline…</p>

  const book = getBook(nodes)
  const chapters = getChapters(nodes)

  return (
    <div className="outline-mode">
      <h2>{book?.title ?? 'Outline'}</h2>

      <div className="outline-mode__add">
        <input
          type="text"
          placeholder="New chapter title"
          value={newChapterTitle}
          onChange={(e) => setNewChapterTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddChapter()}
        />
        <button type="button" onClick={handleAddChapter}>
          Add chapter
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleChapterDragEnd}>
        <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {chapters.map((chapter) => {
            const scenes = getScenes(nodes, chapter.id)
            return (
              <div key={chapter.id}>
                <OutlineNodeRow node={chapter} onRename={handleRename} onDelete={handleDelete} />
                <DndContext
                  sensors={sensors}
                  onDragEnd={(event) => handleSceneDragEnd(chapter.id, event)}
                >
                  <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    {scenes.map((scene) => (
                      <OutlineNodeRow
                        key={scene.id}
                        node={scene}
                        onRename={handleRename}
                        onDelete={handleDelete}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <button
                  type="button"
                  className="outline-node__add-scene"
                  style={{ marginLeft: '2.5rem' }}
                  onClick={() => handleAddScene(chapter.id)}
                >
                  + Scene
                </button>
              </div>
            )
          })}
        </SortableContext>
      </DndContext>

      {chapters.length === 0 && <p>No chapters yet — add your first one above.</p>}
    </div>
  )
}

export default OutlineMode
