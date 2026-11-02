import type { ReactNode } from 'react'
import { FACETS, FACET_LABEL, type Facet, type Phase } from '../../../../lib/facets'
import { FacetIcon } from '../schedule/FacetIcon'

// Small fields the Project console's editors share.

// Several of a few things, as chips that are pressed or not (the facets of a process, its phases, the milestones it needs).
export function ChipSet<T extends string>({ label, options, value, onChange }: {
  label: string
  options: Array<{ id: T; label: string; icon?: ReactNode }>
  value: T[]
  onChange: (next: T[]) => void
}) {
  return (
    <div className="wrSchedTools" role="group" aria-label={label}>
      {options.map(o => {
        const on = value.includes(o.id)
        return (
          <button key={o.id} type="button" className={`wrSchedFacet${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o.id) : [...value, o.id])}>
            {o.icon}{o.label}
          </button>
        )
      })}
    </div>
  )
}

export function FacetChips({ label = 'Facets', value, onChange }: { label?: string; value: Facet[]; onChange: (next: Facet[]) => void }) {
  return <ChipSet<Facet> label={label} value={value} onChange={onChange} options={FACETS.map(f => ({ id: f, label: FACET_LABEL[f], icon: <FacetIcon facet={f} /> }))} />
}

// One phase from the list (or none), for something that builds to a phase's result.
export function PhaseSelect({ label, phases, value, onChange }: { label: string; phases: Phase[]; value: string | null | undefined; onChange: (id: string | null) => void }) {
  return (
    <select className="wrField" aria-label={label} value={value && phases.some(p => p.id === value) ? value : ''} onChange={e => onChange(e.target.value || null)}>
      <option value="">No phase</option>
      {phases.map(p => <option key={p.id} value={p.id}>{p.title || 'Untitled phase'}</option>)}
    </select>
  )
}

// A whole number of one or more, or nothing: an emptied field is none.
export const wholeOrNull = (v: string, max: number): number | null => (v === '' ? null : Math.min(max, Math.max(1, Math.floor(Number(v)) || 1)))
