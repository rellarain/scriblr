import { useEffect, useRef, useState } from 'react'
import { useDraft, useSaveDraft } from '../../api/draft'

const AUTOSAVE_DELAY_MS = 1500

interface Props {
  projectId: string
  sceneId: string
  title: string
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

function SceneEditor({ projectId, sceneId, title }: Props) {
  const { data, isLoading } = useDraft(projectId, sceneId)
  const saveDraft = useSaveDraft(projectId, sceneId)

  const [body, setBody] = useState('')
  const bodyRef = useRef('')
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data) {
      setBody(data.body)
      bodyRef.current = data.body
      setDirty(false)
    }
  }, [data, sceneId])

  function handleChange(value: string) {
    setBody(value)
    bodyRef.current = value
    setDirty(true)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveDraft.mutate(bodyRef.current, { onSuccess: () => setDirty(false) })
    }, AUTOSAVE_DELAY_MS)
  }

  function handleBlur() {
    if (dirty) {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveDraft.mutate(bodyRef.current, { onSuccess: () => setDirty(false) })
    }
  }

  if (isLoading) return <p>Loading scene…</p>

  return (
    <div className="scene-editor">
      <div className="scene-editor__header">
        <h3>{title}</h3>
        <span className="scene-editor__status">
          {saveDraft.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
        </span>
      </div>
      <textarea
        className="scene-editor__textarea"
        value={body}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Start writing…"
      />
      <p className="scene-editor__word-count">{countWords(body)} words</p>
    </div>
  )
}

export default SceneEditor
