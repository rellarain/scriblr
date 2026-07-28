import { useState } from 'react'
import type { FlagType, NodeFlag } from '../../types'

const FLAG_LABELS: Record<FlagType, string> = {
  review: 'Review',
  edit: 'Edit',
  add: 'Add',
  delete: 'Delete',
}

interface Props {
  flag: NodeFlag | null
  onSetFlag: (flag: NodeFlag | null) => void
}

function NodeFlagControl({ flag, onSetFlag }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="node-flag">
      <button
        type="button"
        className={`node-flag__toggle${flag ? ` node-flag__toggle--${flag.type}` : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={flag ? `${FLAG_LABELS[flag.type]}${flag.note ? `: ${flag.note}` : ''}` : 'Flag for revision'}
      >
        {flag ? FLAG_LABELS[flag.type] : '⚑'}
      </button>

      {open && (
        <div className="node-flag__editor">
          <select
            value={flag?.type ?? 'review'}
            onChange={(e) => onSetFlag({ type: e.target.value as FlagType, note: flag?.note ?? '' })}
          >
            <option value="review">Review</option>
            <option value="edit">Edit</option>
            <option value="add">Add</option>
            <option value="delete">Delete</option>
          </select>
          <input
            className="node-flag__note"
            placeholder="Note (optional)"
            value={flag?.note ?? ''}
            onChange={(e) => onSetFlag({ type: flag?.type ?? 'review', note: e.target.value })}
          />
          <div className="node-flag__actions">
            {flag && (
              <button
                type="button"
                className="node-flag__remove"
                onClick={() => {
                  onSetFlag(null)
                  setOpen(false)
                }}
              >
                Remove
              </button>
            )}
            <button type="button" className="node-flag__done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default NodeFlagControl
