import { FACETS, FACET_LABEL } from '../../../../lib/facets'
import { DONE_LABEL, DONE_MODES, SORT_LABEL, SORT_MODES, type BacklogFilter, type DoneMode, type SortMode } from '../../../../lib/backlog'
import { FacetIcon } from './FacetIcon'
import { ICON_PX, IconBtn } from './IconBtn'
import { CloseIcon, SearchIcon, StackIcon } from '../../../icons'

// The Backlog's search, facet chips, project choice, sort and done choices. The choices (not the search) are remembered by the tile.
export function BacklogToolbar({ filter, owners, onChange }: {
  filter: BacklogFilter
  // The projects (and the account) to choose between; one or none hides the choice.
  owners: { id: string; label: string }[]
  onChange: (next: BacklogFilter) => void
}) {
  const set = (patch: Partial<BacklogFilter>) => onChange({ ...filter, ...patch })
  return (
    <div className="wrBacklogBar">
      <div className="wrBacklogSearch">
        <SearchIcon size={20} />
        <input className="wrField" type="search" aria-label="Search the backlog" placeholder="Search tasks and routines…" value={filter.search} onChange={e => set({ search: e.target.value })} />
        {filter.search && <IconBtn Icon={CloseIcon} label="Clear the search" onClick={() => set({ search: '' })} />}
      </div>
      <div className="wrBacklogChoices">
        <div className="wrSchedTools" role="group" aria-label="Filter by facet">
          <button type="button" className={`wrSchedFacet${filter.facet === null ? ' on' : ''}`} aria-pressed={filter.facet === null} onClick={() => set({ facet: null })}>
            <span className="wrFacetIcon" aria-hidden="true"><StackIcon size={ICON_PX} /></span>All
          </button>
          {FACETS.map(f => (
            <button key={f} type="button" className={`wrSchedFacet${filter.facet === f ? ' on' : ''}`} aria-pressed={filter.facet === f} onClick={() => set({ facet: filter.facet === f ? null : f })}>
              <FacetIcon facet={f} />{FACET_LABEL[f]}
            </button>
          ))}
        </div>
        {owners.length > 1 && (
          <select className="wrField" aria-label="Show project" value={filter.project ?? ''} onChange={e => set({ project: e.target.value || null })}>
            <option value="">All projects</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}
        <select className="wrField" aria-label="Sort by" value={filter.sort} onChange={e => set({ sort: e.target.value as SortMode })}>
          {SORT_MODES.map(m => <option key={m} value={m}>Sort: {SORT_LABEL[m]}</option>)}
        </select>
        <select className="wrField" aria-label="Done tasks" value={filter.done} onChange={e => set({ done: e.target.value as DoneMode })}>
          {DONE_MODES.map(m => <option key={m} value={m}>{DONE_LABEL[m]}</option>)}
        </select>
      </div>
    </div>
  )
}
