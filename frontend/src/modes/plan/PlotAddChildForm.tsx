import { useState } from 'react'
import type { PlotNodeKind } from '../../types'

interface Props {
  kindOptions: PlotNodeKind[]
  onSubmit: (kind: PlotNodeKind, title: string) => void
  onCancel?: () => void
}

function PlotAddChildForm({ kindOptions, onSubmit, onCancel }: Props) {
  const [kind, setKind] = useState<PlotNodeKind | ''>('')
  const [title, setTitle] = useState('')

  function submit() {
    const trimmed = title.trim()
    if (!kind || !trimmed) return
    onSubmit(kind, trimmed)
    setKind('')
    setTitle('')
  }

  return (
    <div className="plot-node__add-form">
      <select value={kind} onChange={(e) => setKind(e.target.value as PlotNodeKind)}>
        <option value="">Add…</option>
        {kindOptions.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <button type="button" onClick={submit}>
        Add
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}

export default PlotAddChildForm
