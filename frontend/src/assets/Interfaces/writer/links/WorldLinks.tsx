import { useMemo, useState } from 'react'
import type { MapPlace, PlotNode } from '../../../../api/types'
import { CloseIcon, LinkIcon } from '../../../icons'
import { usePlaces } from '../maps/placesStore'
import { useCast } from '../characters/castStore'
import { pathLabel } from '../plotLinks'
import { KIND_HEADING, KIND_NAME, LINK_KINDS, idOf, kindOf, linkedTo, refOf, useWorldLinks, type LinkKind } from './linkStore'
import { requestOpen } from './worldNav'
import './links.scss'

interface Target { ref: string; kind: LinkKind; label: string }

// Every thing a link can end at: the project's plot nodes (by their place in the plot), characters and places (by the maps they are inside).
export function useLinkTargets(projectId: string | null, plotNodes: PlotNode[]): Target[] {
  const { cast } = useCast(projectId)
  const { places } = usePlaces(projectId)
  return useMemo(() => {
    const byId = new Map(plotNodes.map(n => [n.id, n]))
    return [
      ...plotNodes.map(n => ({ ref: refOf('plot', n.id), kind: 'plot' as const, label: pathLabel(n, byId) })),
      ...cast.map(c => ({ ref: refOf('char', c.id), kind: 'char' as const, label: c.name })),
      ...places.map((p: MapPlace) => ({ ref: refOf('place', p.key), kind: 'place' as const, label: p.path || p.name })),
    ]
  }, [plotNodes, cast, places])
}

// What a thing is linked to, as chips that open the other end, and a picker, grouped by kind, to link it to something else. A link is on both ends: the other
// end lists this one too. Things of its own kind are not offered (plot nodes have their own links, characters their relationships).
export function WorldLinks({ projectId, self, plotNodes, onOpenPlot, heading = 'Linked to' }: {
  projectId: string | null
  self: string
  plotNodes: PlotNode[]
  onOpenPlot?: (nodeId: string) => void
  heading?: string
}) {
  const store = useWorldLinks(projectId)
  const targets = useLinkTargets(projectId, plotNodes)
  const [failed, setFailed] = useState(false)
  if (!projectId) return null
  const selfKind = kindOf(self)
  const byRef = new Map(targets.map(t => [t.ref, t]))
  const mine = linkedTo(store.links, self).flatMap(ref => byRef.get(ref) ?? [])
  const taken = new Set(mine.map(t => t.ref))
  const offered = LINK_KINDS.filter(k => k !== selfKind).map(kind => ({ kind, items: targets.filter(t => t.kind === kind && !taken.has(t.ref)).sort((x, y) => x.label.localeCompare(y.label, undefined, { sensitivity: 'base', numeric: true })) })).filter(g => g.items.length > 0)

  const open = (t: Target) => {
    if (t.kind === 'plot') onOpenPlot?.(idOf(t.ref))
    else requestOpen(t.kind, idOf(t.ref))
  }
  const act = (run: () => Promise<boolean>) => { setFailed(false); void run().then(ok => { if (!ok) setFailed(true) }) }

  return (
    <div className="wlLinks" role="group" aria-label={heading}>
      <h4 className="wlTitle"><LinkIcon size={14} />{heading}</h4>
      {mine.length === 0 && <p className="wlHint">Nothing linked yet.</p>}
      {mine.length > 0 && (
        <ul className="wlList">
          {mine.map(t => (
            <li key={t.ref} className="wlItem">
              <button type="button" className="wlOpen" aria-label={`Open ${t.label}`} title={`Open ${t.label}`} onClick={() => open(t)}>
                <span className="wlKind">{KIND_NAME[t.kind]}</span><span className="wlName">{t.label}</span>
              </button>
              <button type="button" className="wlRemove" aria-label={`Remove the link to ${t.label}`} title="Remove this link (from both ends)" onClick={() => act(() => store.unlink(self, t.ref))}><CloseIcon size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <select className="wlSelect" aria-label="Link to" value="" disabled={offered.length === 0} onChange={e => { if (e.target.value) act(() => store.link(self, e.target.value)) }}>
        <option value="">{offered.length === 0 ? 'Nothing else to link' : 'Link to…'}</option>
        {offered.map(g => (
          <optgroup key={g.kind} label={KIND_HEADING[g.kind]}>
            {g.items.map(t => <option key={t.ref} value={t.ref}>{t.label}</option>)}
          </optgroup>
        ))}
      </select>
      {failed && <p className="wlHint" role="alert">That link could not be saved.</p>}
    </div>
  )
}
