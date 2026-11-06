import type { StoryPoint } from '../characters/story'
import { appliesLabel, familyOf, versionAt } from './mapVersions'
import type { MapDraft } from './mapModel'
import type { Maps } from './useMaps'

// Above the canvas of a map that has versions (or is one): the map and its versions as chips to open one, and a picker of a point of the story that opens the version
// that is true there.
export function VersionBar({ m, draft, points }: { m: Maps; draft: MapDraft; points: StoryPoint[] }) {
  const family = familyOf(m.maps, draft.id)
  if (family.length < 2) return null
  return (
    <div className="mapVersions" role="group" aria-label="Versions of this map">
      {family.map(v => (
        <button key={v.id} type="button" className="mapChip" aria-pressed={v.id === draft.id} title={`${v.title}, ${appliesLabel(v, points)}`} onClick={() => { void m.open(v.id) }}>{v.title}</button>
      ))}
      <select
        className="mapSelect mapSelect--auto" aria-label="Show the map as it is at" value="" disabled={points.length === 0}
        onChange={e => { if (e.target.value) void m.open(versionAt(m.maps, draft.id, points, e.target.value)) }}
      >
        <option value="">The map at…</option>
        {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  )
}
