import type { ModelContent } from '../../../../api/types'
import { CopyIcon, DiceIcon, LockIcon, RestoreIcon, TrashIcon, UnlockIcon } from '../../../icons'
import type { Selection } from './designerState'
import { groupById, objectById, shapeById } from './modelContent'
import { CARD_NAMES } from './treeNav'

// The top of the editor for what is open in the tree: which kind of thing it is and its name, the buttons that act on it as a whole (copy a shape, delete a shape, an object or a
// group, which takes what is in it along), and the randomize, lock and reset controls: roll a new look for the test character, lock this group or object so the roll leaves it as it
// is, and put the test values back to rest.
export function NodeBar({ content, sel, locked, away, busy, onToggleLock, onDelete, onCopyShape, onRoll, onReset }: {
  content: ModelContent
  sel: Selection
  locked: boolean
  // what is away from rest in the test state
  away: number
  busy: boolean
  onToggleLock: (id: string) => void
  onDelete: (sel: Selection) => void
  onCopyShape: (id: string) => void
  onRoll: () => void
  onReset: () => void
}) {
  const thing = sel.kind === 'shape' ? shapeById(content, sel.id) : sel.kind === 'object' ? objectById(content, sel.id) : sel.kind === 'group' ? groupById(content, sel.id) : null
  const kind = sel.kind === 'none' ? 'model' : sel.kind
  const name = sel.kind === 'none' ? content.name.trim() || 'Untitled model' : thing?.name.trim() || `Untitled ${kind}`
  const lockable = sel.kind === 'group' || sel.kind === 'object'
  return (
    <div className="dzNode" role="group" aria-label={`The ${kind} that is open`}>
      <div className="dzNodeHead">
        <span className="dzNodeKind">{CARD_NAMES[kind]}</span>
        <span className="dzNodeName">{name}</span>
        <span className="dzNodeTools">
          {sel.kind === 'shape' && thing && !('copyOf' in thing && thing.copyOf) && (
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Copy ${name}`} title="Copy the shape" disabled={busy} onClick={() => onCopyShape(sel.id)}><CopyIcon size={12} /></button>
          )}
          {sel.kind !== 'none' && thing && !(sel.kind === 'shape' && 'copyOf' in thing && thing.copyOf) && (
            <button
              type="button" className="cmIconBtn cmIconBtn--small" disabled={busy} onClick={() => onDelete(sel)}
              aria-label={sel.kind === 'shape' ? `Delete ${name}` : `Delete ${sel.kind} ${name}`}
              title={sel.kind === 'group' ? 'Delete the group with its objects and shapes' : sel.kind === 'object' ? 'Delete the object with its shapes' : 'Delete the shape'}
            ><TrashIcon size={12} /></button>
          )}
        </span>
      </div>
      <div className="dzRoll" role="group" aria-label="Randomize, lock and reset">
        <button type="button" className="cmBtn cmBtn--small" aria-label="Roll the look" disabled={busy} title="Roll a new look for the test character: colours, a form on every axis and the member of each family; what is locked stays" onClick={onRoll}><DiceIcon size={12} /> Roll</button>
        {lockable && thing && (
          <button
            type="button" className={`cmBtn cmBtn--small${locked ? ' cmBtn--on' : ''}`} aria-label={`Lock ${name}`} aria-pressed={locked}
            title={locked ? `${name} is locked: rolling the look leaves it as it is` : `Lock ${name}, so rolling the look leaves it as it is`} onClick={() => onToggleLock(sel.id)}
          >{locked ? <LockIcon size={12} /> : <UnlockIcon size={12} />} {locked ? 'Locked' : 'Lock'}</button>
        )}
        {away > 0 && (
          <button type="button" className="cmBtn cmBtn--small" aria-label="Reset test values" disabled={busy} title="Put every slider back at rest, every axis on its default form and show everything" onClick={onReset}><RestoreIcon size={12} /> {away} off rest</button>
        )}
      </div>
    </div>
  )
}
