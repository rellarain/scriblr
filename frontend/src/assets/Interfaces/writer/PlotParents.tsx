import type { ReactNode } from 'react'
import type { PlotNode } from '../../../api/types'
import { ChevronDownIcon, ChevronRightIcon, PencilIcon } from '../../icons'
import { plotColors, plotColorVars } from './plotColors'
import { nodeLabel, plotTrail } from './plotTree'

// The parents of a plot node as chips, top-down (category, subcategory, cluster), each in its own plot colour. A chip has three states:
//   minimized: the title and the keywords (small chips); a click on it expands it
//   expanded:  the title (a link to that parent's own editor), the keywords and the whole description; a pencil opens the editor, the chevron minimizes it
//   editor:    the parent's own fields to change in place (given `renderEditor`, the editors of the Plot console), reached only from expanded
// The stripes at a chip's left are its tree's: category, subcategory, cluster.
// Without `renderEditor` (Compare's group headers) there is no editor state, and a chip with no description is only a link to the parent.
// The state belongs to the tool (PlotView), by level: a category chip left expanded is expanded on every editor's category chip, and so
// for subcategory and cluster chips, whichever node is opened next.
export type ParentState = 'minimized' | 'expanded' | 'editor'
export type ParentStates = ReadonlyMap<string, ParentState>

// The keywords of a node as small read-only chips (all of them), tinted from the ink of the surface they sit on.
export function ParentKeywords({ parent, label }: { parent: PlotNode; label: string }) {
  if (parent.keywords.length === 0) return null
  return (
    <span className="wrParentChips" role="list" aria-label={`Keywords of ${label}`}>
      {parent.keywords.map(k => <span key={k} className="wrParentChip" role="listitem">{k}</span>)}
    </span>
  )
}

export function PlotParents({ node, byId, projectHue, states, onState, onOpen, renderEditor }: {
  node: PlotNode
  byId: Map<string, PlotNode>
  // What a category with no colour of its own shows.
  projectHue?: number
  states: ParentStates
  onState: (kind: PlotNode['kind'], state: ParentState) => void
  onOpen: (id: string) => void
  renderEditor?: (parent: PlotNode) => ReactNode
}) {
  const parents = plotTrail(node, byId)
  if (parents.length === 0) return null

  return (
    <div className="wrParents" role="group" aria-label="Parents">
      {parents.map(parent => {
        const label = nodeLabel(parent)
        const body = parent.body.trim()
        const foldable = renderEditor !== undefined || body !== ''
        const asked = states.get(parent.kind) ?? 'minimized'
        // The editor is only there where there is one to show.
        const state: ParentState = !foldable ? 'minimized' : asked === 'editor' && renderEditor === undefined ? 'expanded' : asked
        const cls = `wrParent wrParent--${parent.kind}${state !== 'minimized' ? ' wrParent--open' : ''}${state === 'editor' ? ' wrParent--editing' : ''}`
        const vars = plotColorVars(plotColors(parent, byId, projectHue))
        if (!foldable) {
          return (
            <div key={parent.id} className={cls} style={vars}>
              <button type="button" className="wrParentLink" aria-label={`Open ${label}`} title={`Open ${label}`} onClick={() => onOpen(parent.id)}>{label}</button>
              <ParentKeywords parent={parent} label={label} />
            </div>
          )
        }
        if (state === 'minimized') {
          return (
            <div key={parent.id} className={cls} style={vars}>
              <button type="button" className="wrParentMain" aria-expanded={false} aria-label={`Expand ${label}`} title={`Expand ${label}`} onClick={() => onState(parent.kind, 'expanded')}>
                <span className="wrParentLabel">{label}</span>
                <ChevronRightIcon size={14} />
              </button>
              <ParentKeywords parent={parent} label={label} />
            </div>
          )
        }
        const editing = state === 'editor'
        return (
          <div key={parent.id} className={cls} style={vars}>
            <div className="wrParentHead">
              <button type="button" className="wrParentLink" aria-label={`Open ${label}`} title={`Open ${label}`} onClick={() => onOpen(parent.id)}>{label}</button>
              {renderEditor && (
                <button type="button" className="wrParentFold" aria-pressed={editing} aria-label={editing ? `Stop editing ${label}` : `Edit ${label}`} title={editing ? `Stop editing ${label}` : `Edit ${label}`}
                  onClick={() => onState(parent.kind, editing ? 'expanded' : 'editor')}><PencilIcon size={14} /></button>
              )}
              <button type="button" className="wrParentFold" aria-expanded aria-label={`Collapse ${label}`} title={`Collapse ${label}`} onClick={() => onState(parent.kind, 'minimized')}><ChevronDownIcon size={14} /></button>
            </div>
            {editing && renderEditor ? renderEditor(parent) : (
              <>
                <ParentKeywords parent={parent} label={label} />
                {body !== '' && <p className="wrParentBody">{body}</p>}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
