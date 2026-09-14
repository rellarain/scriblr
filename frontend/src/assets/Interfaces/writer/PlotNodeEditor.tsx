import { useState } from 'react'
import type { FlagType, PlotCustomFieldDef, PlotNode, PlotNodeKind } from '../../../api/types'
import { plotChildKindOptions } from '../../../api/types'

interface PlotNodeEditorProps {
  // Undefined = root view (lists only top-level categories).
  node?: PlotNode
  childNodes: PlotNode[]
  ancestryChain: PlotNode[]
  onUpdateField: (nodeId: string, field: 'title' | 'body', value: string) => void
  onDeleteNode: (nodeId: string) => void
  onToggleFlag: (nodeId: string, type: FlagType) => void
  onAddNode: (parentId: string | null, kind: PlotNodeKind) => void
  onFocusNode: (nodeId: string) => void
  onMoveUp: (nodeId: string) => void
  onMoveDown: (nodeId: string) => void
  onAddKeyword: (nodeId: string, keyword: string) => void
  onRemoveKeyword: (nodeId: string, keyword: string) => void
  onAddCustomFieldDef: (nodeId: string, name: string) => void
  onRemoveCustomFieldDef: (nodeId: string, fieldId: string) => void
  onUpdateCustomFieldValue: (nodeId: string, fieldId: string, value: string) => void
}

const FLAG_TYPES: FlagType[] = ['review', 'edit', 'add', 'delete']

function PlotSpine({
  node, siblingIndex, siblingCount, onFocusNode, onMoveUp, onMoveDown, onDelete,
}: {
  node: PlotNode
  siblingIndex: number
  siblingCount: number
  onFocusNode: (nodeId: string) => void
  onMoveUp: (nodeId: string) => void
  onMoveDown: (nodeId: string) => void
  onDelete: (nodeId: string) => void
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  return (
    <div className="bookSpineWrap">
      <div className="shelfMoveRow">
        <button type="button" className="tonePriorityMoveBtn" disabled={siblingIndex <= 0} onClick={() => onMoveUp(node.id)}>▲</button>
        <button type="button" className="tonePriorityMoveBtn" disabled={siblingIndex >= siblingCount - 1} onClick={() => onMoveDown(node.id)}>▼</button>
      </div>
      <span className="plotNodeKindBadge">{node.kind}</span>
      <button
        type="button"
        className="outlineChildTitle"
        onClick={() => onFocusNode(node.id)}
      >
        <span>{node.title}</span>
      </button>
      {confirmingDelete ? (
        <span className="shelfConfirmRow">
          <button type="button" className="toneBtn" onClick={() => { onDelete(node.id); setConfirmingDelete(false) }}>Confirm</button>
          <button type="button" className="toneBtn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="toneBtn shelfDeleteBtn" onClick={() => setConfirmingDelete(true)}>Delete</button>
      )}
    </div>
  )
}

function PlotNodeEditor({
  node, childNodes, ancestryChain, onUpdateField, onDeleteNode, onToggleFlag, onAddNode,
  onFocusNode, onMoveUp, onMoveDown, onAddKeyword, onRemoveKeyword,
  onAddCustomFieldDef, onRemoveCustomFieldDef, onUpdateCustomFieldValue,
}: PlotNodeEditorProps) {
  const [confirmingSelfDelete, setConfirmingSelfDelete] = useState(false)
  const [addKind, setAddKind] = useState<PlotNodeKind | ''>('')
  const [newKeyword, setNewKeyword] = useState('')
  const [newFieldName, setNewFieldName] = useState('')

  // Root view: just the top-level category list + a "+ Add category" form.
  if (!node) {
    return (
      <div className="bookCover">
        <div className="shelfRow">
          {childNodes.map((child, index) => (
            <PlotSpine
              key={child.id}
              node={child}
              siblingIndex={index}
              siblingCount={childNodes.length}
              onFocusNode={onFocusNode}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onDelete={onDeleteNode}
            />
          ))}
        </div>
        <div className="channelAddForm">
          <button type="button" className="toneBtn" onClick={() => onAddNode(null, 'category')}>+ Add category</button>
        </div>
      </div>
    )
  }

  const childKinds = plotChildKindOptions(node.kind)
  // A plotline's fillable custom fields come from its own subcategory AND
  // its parent category's templates (per scrilbrPlan.md's Plot Category
  // Component description) -- for any other kind, only its own defs apply.
  const applicableFieldDefs: PlotCustomFieldDef[] = node.kind === 'plotline'
    ? [...ancestryChain.flatMap(a => a.customFieldDefs), ...node.customFieldDefs]
    : node.customFieldDefs

  return (
    <div className="bookCover">
      <div className="wUIScreenHeader">
        <span className="plotNodeKindBadge">{node.kind}</span>
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

      {node.kind === 'plotpoint' && (
        <input
          className="inlineNoteInput"
          placeholder="Body…"
          value={node.body}
          onChange={e => onUpdateField(node.id, 'body', e.target.value)}
        />
      )}

      <div className="plotKeywordRow">
        {node.keywords.map(k => (
          <span key={k} className="plotKeywordChip">
            {k}
            <button type="button" onClick={() => onRemoveKeyword(node.id, k)} aria-label={`Remove keyword ${k}`}>×</button>
          </span>
        ))}
        <input
          className="inlineNoteInput"
          placeholder="Add keyword…"
          value={newKeyword}
          onChange={e => setNewKeyword(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newKeyword.trim()) { onAddKeyword(node.id, newKeyword); setNewKeyword('') }
          }}
        />
      </div>

      {(node.kind === 'category' || node.kind === 'subcategory') && (
        <div className="plotCustomFieldRow">
          {node.customFieldDefs.map(field => (
            <span key={field.id} className="plotKeywordChip">
              {field.name}
              <button type="button" onClick={() => onRemoveCustomFieldDef(node.id, field.id)} aria-label={`Remove field ${field.name}`}>×</button>
            </span>
          ))}
          <input
            className="inlineNoteInput"
            placeholder="Add custom field…"
            value={newFieldName}
            onChange={e => setNewFieldName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newFieldName.trim()) { onAddCustomFieldDef(node.id, newFieldName); setNewFieldName('') }
            }}
          />
        </div>
      )}

      {node.kind === 'plotline' && applicableFieldDefs.map(field => (
        <div key={field.id} className="plotFieldRow">
          <label>{field.name}</label>
          <input
            className="inlineNoteInput"
            value={node.customFieldValues[field.id] ?? ''}
            onChange={e => onUpdateCustomFieldValue(node.id, field.id, e.target.value)}
          />
        </div>
      ))}

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

      <div className="shelfRow">
        {childNodes.map((child, index) => (
          <PlotSpine
            key={child.id}
            node={child}
            siblingIndex={index}
            siblingCount={childNodes.length}
            onFocusNode={onFocusNode}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDeleteNode}
          />
        ))}
      </div>

      {childKinds.length > 0 && (
        <div className="channelAddForm">
          <select value={addKind} onChange={e => setAddKind(e.target.value as PlotNodeKind)}>
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

export default PlotNodeEditor
