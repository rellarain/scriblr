import { describeLocation, usePlaces } from './placesStore'

// A scene's location: a dropdown of the places of the project's maps, each shown with the maps it is inside ("The Known World > Port Veyra > The Harbour Inn").
// A scene whose location is old text (typed before places existed) shows it as the first, chosen, option, so it is seen and can be replaced; the Maps
// console has a tool that turns such texts into places. With nothing chosen the first option shows what the scene takes from the scenes before it.
export function PlacePicker({ projectId, value, inherited, label, className, title, onChange }: {
  projectId: string | null
  value: string
  // The location the scene would take from the scenes before it (its stored form).
  inherited?: string
  label: string
  className?: string
  title?: string
  onChange: (value: string) => void
}) {
  const { places, byKey, ready } = usePlaces(projectId)
  const own = describeLocation(value, byKey)
  const before = inherited ? describeLocation(inherited, byKey) : { kind: 'none' as const }
  const emptyText = before.kind === 'place' ? before.place.path : before.kind === 'old' ? before.text : label
  const none = ready && places.length === 0 && own.kind === 'none'
  return (
    <select
      className={className} aria-label={label} data-kf="" value={own.kind === 'none' ? '' : value.trim()} disabled={none}
      title={none ? 'No places yet: stamp a symbol on a map in Project > Maps and give it a name' : title}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{emptyText}</option>
      {own.kind === 'old' && <option value={own.text}>{`Old text: ${own.text} (pick a place to replace it)`}</option>}
      {places.map(p => <option key={p.key} value={p.key}>{p.path}</option>)}
      {own.kind === 'place' && !places.some(p => p.key === own.place.key) && <option value={own.place.key}>{own.place.path}</option>}
    </select>
  )
}

// The text a read-only chip shows for a stored location: the place's name (its path in the tooltip), or the old text as it was typed.
export function useLocationText(projectId: string | null, value: string): { text: string; title: string } {
  const { byKey } = usePlaces(projectId)
  const d = describeLocation(value, byKey)
  if (d.kind === 'place') return { text: d.place.name, title: d.place.path }
  return { text: d.kind === 'old' ? d.text : '', title: '' }
}
