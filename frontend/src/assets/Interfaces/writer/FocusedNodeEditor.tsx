import { useState } from 'react'
import type { FlagType, OutlineNode, OutlineNodeKind } from '../../../api/types'
import { childKindOptions } from '../../../api/types'

interface FocusedNodeEditorProps {
  node: OutlineNode
  onUpdateField: (nodeId: string, field: 'title' | 'synopsis', value: string) => void
  onDeleteNode: (nodeId: string) => void
  onToggleFlag: (nodeId: string, type: FlagType) => void
  onAddNode: (parentId: string | null, kind: OutlineNodeKind) => void
}

const FLAG_TYPES: FlagType[] = ['review', 'edit', 'add', 'delete']

// Pure editor for the focused node's own fields -- navigating to/among its
// children happens in WuiSidebar now (bookSidebar/chapterSidebar), not here.
function FocusedNodeEditor({
  node, onUpdateField, onDeleteNode, onToggleFlag, onAddNode,
}: FocusedNodeEditorProps) {
  const [confirmingSelfDelete, setConfirmingSelfDelete] = useState(false)
  const [addKind, setAddKind] = useState<OutlineNodeKind | ''>('')

  const childKinds = childKindOptions(node.kind)

  return (
    <div className="bookCover">
      <div className="wUIScreenHeader">
        <span className="outlineNodeKindBadge">{node.kind}</span>
        <input
          className="statementField outlineNodeTitleField"
          value={node.title}
          onChange={e => onUpdateField(node.id, 'title', e.target.value)}
        />
        {confirmingSelfDelete ? (
          <span className="shelfConfirmRow">
            <button type="button" className="toneBtn" onClick={() => onDeleteNode(node.id)}>Confirm delete</button>
            <button type="button" className="toneBtn" onClick={() => setConfirmingSelfDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="toneBtn" onClick={() => setConfirmingSelfDelete(true)}>Delete</button>
        )}
      </div>

      <input
        className="inlineNoteInput"
        placeholder="Synopsis…"
        value={node.synopsis}
        onChange={e => onUpdateField(node.id, 'synopsis', e.target.value)}
      />

      <div className="toneRow">
        {FLAG_TYPES.map(t => (
          <button
            key={t} type="button"
            className={node.flag?.type === t ? 'toneBtn toneBtn--active' : 'toneBtn'}
            onClick={() => onToggleFlag(node.id, t)}
          >
            {t}
          </button>
        ))}
      </div>

      {childKinds.length > 0 && (
        <div className="channelAddForm">
          <select value={addKind} onChange={e => setAddKind(e.target.value as OutlineNodeKind)}>
            <option value="">Add child…</option>
            {childKinds.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button
            type="button" className="toneBtn" disabled={!addKind}
            onClick={() => { if (addKind) { onAddNode(node.id, addKind); setAddKind('') } }}
          >
            + Add child
          </button>
        </div>
      )}
    </div>
  )
}

export default FocusedNodeEditor
