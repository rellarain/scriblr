import { useState } from 'react'
import { PlusIcon } from '../../../icons'
import { buildingOf, floorName, floorsOf, nextFloorOrder } from './mapFloors'
import type { MapDraft } from './mapModel'
import type { Maps } from './useMaps'

// Above the canvas of a building (an architectural map) and of each of its floors: the building and its floors, lowest first, as chips that open one, and
// Add a floor (a map inside the building, the same size and scale, one floor above the highest).
export function FloorBar({ m, draft }: { m: Maps; draft: MapDraft }) {
  const [busy, setBusy] = useState(false)
  // The open map as it is now (its floor's place and name may not be saved yet).
  const maps = m.maps.map(r => (r.id === draft.id ? { ...r, title: draft.title, floor: draft.floor ?? null } : r))
  const building = buildingOf(maps, draft.id)
  if (!building) return null
  const floors = floorsOf(maps, building.id)
  const next = nextFloorOrder(floors)

  async function addFloor() {
    if (next === null || !building) return
    setBusy(true)
    try {
      const name = floorName({ order: next, name: '' })
      await m.create({
        title: `${building.title}: ${name}`, level: 'architectural', units: draft.units, width: draft.width, height: draft.height,
        cellSize: draft.cellSize, unit: draft.unit, base: draft.base, parentId: building.id, floor: { order: next, name: '' },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mapVersions" role="group" aria-label={`Floors of ${building.title}`}>
      <button type="button" className="mapChip" aria-pressed={building.id === draft.id} title={`${building.title}: the building`} onClick={() => { void m.open(building.id) }}>{building.title}</button>
      {floors.map(f => (
        <button key={f.id} type="button" className="mapChip" aria-pressed={f.id === draft.id} title={f.title} onClick={() => { void m.open(f.id) }}>{floorName(f.floor)}</button>
      ))}
      <button
        type="button" className="mapIconBtn" aria-label="Add a floor" disabled={busy || next === null}
        title={next === null ? 'A building has at most 24 floors' : `Add ${floorName({ order: next, name: '' }).toLowerCase()}: a map inside the building, the same size and scale`}
        onClick={() => { void addFloor() }}
      ><PlusIcon size={16} /></button>
    </div>
  )
}
