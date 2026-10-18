import { useState } from 'react'
import type { PlotNode } from '../../../api/types'
import { ChevronDownIcon, ChevronRightIcon } from '../../icons'
import { plotColors, plotColorVars } from './plotColors'
import { nodeLabel, plotTrail } from './plotTree'

// The parents of a plot node as read-only chips, top-down (category, subcategory, cluster), each in its own plot colour.
//   a chip shows its title only (its description is the hover text); the stripes at its left are its tree's: category, subcategory, cluster
//   a chip with a description opens on a click to the whole description; its title then opens that parent's editor
//   a chip with no description is just its title, and clicking it opens that parent's editor
export function PlotParents({ node, byId, onOpen }: { node: PlotNode; byId: Map<string, PlotNode>; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const parents = plotTrail(node, byId)
  if (parents.length === 0) return null
  const flip = (id: string) => setOpen(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  return (
    <div className="wrParents" role="group" aria-label="Parents">
      {parents.map(parent => {
        const label = nodeLabel(parent)
        const body = parent.body.trim()
        const expanded = body !== '' && open.has(parent.id)
        const cls = `wrParent wrParent--${parent.kind}${expanded ? ' wrParent--open' : ''}`
        const vars = plotColorVars(plotColors(parent, byId))
        if (body === '') {
          return (
            <div key={parent.id} className={cls} style={vars}>
              <button type="button" className="wrParentLink" aria-label={`Open ${label}`} title={`Open ${label}`} onClick={() => onOpen(parent.id)}>{label}</button>
            </div>
          )
        }
        if (!expanded) {
          return (
            <div key={parent.id} className={cls} style={vars}>
              <button type="button" className="wrParentMain" aria-expanded={false} title={body} onClick={() => flip(parent.id)}>
                <span className="wrParentLabel">{label}</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          )
        }
        return (
          <div key={parent.id} className={cls} style={vars}>
            <div className="wrParentHead">
              <button type="button" className="wrParentLink" aria-label={`Open ${label}`} title={`Open ${label}`} onClick={() => onOpen(parent.id)}>{label}</button>
              <button type="button" className="wrParentFold" aria-expanded aria-label={`Collapse ${label}`} onClick={() => flip(parent.id)}><ChevronDownIcon size={14} /></button>
            </div>
            <p className="wrParentBody">{body}</p>
          </div>
        )
      })}
    </div>
  )
}
