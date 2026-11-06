import { useState } from 'react'
import { MAP_MAX_JOURNEYS } from '../../../../api/types'
import { CloseIcon, FollowIcon, PlusIcon, TrashIcon } from '../../../icons'
import type { StoryPoint } from '../characters/story'
import { ColourInput, CommitText, Field } from './MapFields'
import { JOURNEY_COLOURS, addJourney, colourOf, editStop, journeysOf, removeJourney, removeStop, setJourneyColour } from './mapJourneys'
import type { MapDraft } from './mapModel'
import type { Maps } from './useMaps'

export interface JourneyState {
  // The chosen journey (null = none), whether the paths are drawn, the point of the story the markers show (none = no markers) and the point new stops are from.
  journeyId: string | null
  showPaths: boolean
  atPoint: string
  stopPoint: string
}

// The journeys of characters over this map: a path of stops, each from a point of the story, drawn with the Journey tool; and where everyone is at a point.
export function JourneysPanel({ m, draft, points, cast, state, onState, onTool }: {
  m: Maps
  draft: MapDraft
  points: StoryPoint[]
  // The characters of the project (id and name).
  cast: Array<{ id: string; name: string }>
  state: JourneyState
  onState: (patch: Partial<JourneyState>) => void
  onTool: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const journeys = journeysOf(draft)
  const names = new Map(cast.map(c => [c.id, c.name]))
  const nameOf = (id: string) => names.get(id) ?? 'A character that is gone'
  const chosen = journeys.find(j => j.id === state.journeyId) ?? null
  const chosenIndex = chosen ? journeys.indexOf(chosen) : -1
  const free = cast.filter(c => !journeys.some(j => j.characterId === c.id))
  const pointSelect = (label: string, value: string, onChange: (id: string) => void) => (
    <select className="mapSelect" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Not placed yet</option>
      {value !== '' && !points.some(p => p.id === value) && <option value={value}>A part of the book that is gone</option>}
      {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  )

  function add(characterId: string) {
    const made = addJourney(draft, characterId)
    if (!made) return
    m.apply(made.change)
    onState({ journeyId: made.id })
    onTool()
  }

  return (
    <section className="mapPanel" aria-label="Journeys">
      <header className="mapPanelHead">
        <h3 className="mapPanelTitle">Journeys</h3>
        <button type="button" className="mapIconBtn" aria-label="Add a stop to the chosen journey" title="Add stops by clicking the map (the Journey tool)" disabled={!chosen} onClick={onTool}><FollowIcon size={16} /></button>
      </header>
      {journeys.length === 0 && <p className="mapHint">Follow a character across the map: pick one below, then click the map to put down each stop, from a point of the story.</p>}
      {journeys.length > 0 && (
        <ul className="mapJourneyList" aria-label="Journeys on this map">
          {journeys.map((j, i) => (
            <li key={j.id} className="mapRow">
              <button type="button" className="mapChip" aria-pressed={j.id === state.journeyId} onClick={() => { onState({ journeyId: j.id === state.journeyId ? null : j.id }); setConfirming(false) }}>
                <span className="mapJourneyDot" style={{ background: colourOf(j, i) }} aria-hidden="true" />{nameOf(j.characterId)}
              </button>
              <span className="mapHint">{j.stops.length === 1 ? '1 stop' : `${j.stops.length} stops`}</span>
            </li>
          ))}
        </ul>
      )}
      {free.length > 0 && journeys.length < MAP_MAX_JOURNEYS && (
        <div className="mapRow">
          <select className="mapSelect" aria-label="Follow a character" value="" onChange={e => { if (e.target.value) add(e.target.value) }}>
            <option value="">Follow a character…</option>
            {free.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <PlusIcon size={14} />
        </div>
      )}
      {cast.length === 0 && <p className="mapHint">Make a character in the Characters tab to follow one.</p>}
      {chosen && (
        <div className="mapJourneyEdit" role="group" aria-label={`Journey of ${nameOf(chosen.characterId)}`}>
          <h4 className="mapSubTitle">{nameOf(chosen.characterId)}</h4>
          <Field label="Colour">
            <span className="mapRow">
              <ColourInput label={`Colour of the journey of ${nameOf(chosen.characterId)}`} value={colourOf(chosen, chosenIndex)} onCommit={c => m.apply(setJourneyColour(draft, chosen.id, c))} />
              {JOURNEY_COLOURS.slice(0, 4).map(c => <button key={c} type="button" className="mapSwatch" style={{ background: c }} aria-label={`Use ${c}`} title={c} onClick={() => m.apply(setJourneyColour(draft, chosen.id, c))} />)}
            </span>
          </Field>
          <Field label="New stops are from">{pointSelect('New stops are from', state.stopPoint, id => onState({ stopPoint: id }))}</Field>
          {chosen.stops.length === 0 && <p className="mapHint">Choose the Journey tool and click the map for the first stop.</p>}
          <ol className="mapStops" aria-label="Stops">
            {chosen.stops.map((s, i) => (
              <li key={s.id} className="mapStop">
                <span className="mapStopNo" aria-hidden="true">{i + 1}</span>
                <div className="mapStopBody">
                  {pointSelect(`Stop ${i + 1} is from`, s.at, id => m.apply(editStop(draft, chosen.id, s.id, { at: id }, points)))}
                  <CommitText label={`Note on stop ${i + 1}`} value={s.note} max={200} onCommit={note => m.apply(editStop(draft, chosen.id, s.id, { note }, points))} />
                </div>
                <button type="button" className="mapIconBtn" aria-label={`Remove stop ${i + 1}`} title="Remove this stop" onClick={() => m.apply(removeStop(draft, chosen.id, s.id))}><CloseIcon size={14} /></button>
              </li>
            ))}
          </ol>
          {confirming ? (
            <span className="mapConfirm" role="group" aria-label="Remove the journey?">
              <button type="button" className="mapIconBtn" aria-label="Confirm remove the journey" title="Confirm remove" onClick={() => { setConfirming(false); m.apply(removeJourney(draft, chosen.id)); onState({ journeyId: null }) }}><TrashIcon size={16} /></button>
              <button type="button" className="mapIconBtn" aria-label="Cancel remove the journey" title="Cancel" onClick={() => setConfirming(false)}><CloseIcon size={16} /></button>
            </span>
          ) : (
            <button type="button" className="mapIconBtn" aria-label={`Remove the journey of ${nameOf(chosen.characterId)}`} title="Remove this journey" onClick={() => setConfirming(true)}><TrashIcon size={16} /></button>
          )}
        </div>
      )}
      <label className="mapCheck"><input type="checkbox" checked={state.showPaths} onChange={e => onState({ showPaths: e.target.checked })} />Show the paths</label>
      <Field label="Where everyone is at">
        <select className="mapSelect" aria-label="Where everyone is at" value={state.atPoint} onChange={e => onState({ atPoint: e.target.value })}>
          <option value="">No point chosen</option>
          {points.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </Field>
      <p className="mapHint">Journeys are for you: readers never see them.</p>
    </section>
  )
}
