import { MAP_MAX_JOURNEYS, MAP_MAX_STOPS, type MapJourney, type MapJourneyStop } from '../../../../api/types'
import type { StoryPoint } from '../characters/story'
import { change, type Change, type MakeId, type MapDraft } from './mapModel'

const randomId: MakeId = () => Math.random().toString(36).slice(2, 8)

// The journeys of characters over a map: a path of stops, each a place on the map from a point of the story (an outline chapter or scene). A character has one journey
// on a map. The stops are kept in the order of the story (a stop with no point yet goes last). Where everyone is at a point is the last stop at or before it.

// The colours a journey takes in turn when it has none of its own (the map's art, so fixed).
export const JOURNEY_COLOURS = ['#c0392b', '#2e86c1', '#1e8449', '#b9770e', '#7d3c98', '#117a8b', '#a04000', '#566573'] as const

export const journeysOf = (draft: Pick<MapDraft, 'journeys'>): MapJourney[] => draft.journeys ?? []
export const colourOf = (journey: MapJourney, index: number): string => journey.color ?? JOURNEY_COLOURS[index % JOURNEY_COLOURS.length]

const pointIndex = (points: StoryPoint[], at: string) => (at ? points.findIndex(p => p.id === at) : -1)

// The stops in the order of the story; one with no point (or a point that is gone) goes last, keeping its place among such stops.
export function orderStops(stops: MapJourneyStop[], points: StoryPoint[]): MapJourneyStop[] {
  const rank = (s: MapJourneyStop) => { const i = pointIndex(points, s.at); return i < 0 ? Number.MAX_SAFE_INTEGER : i }
  return stops.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(x => x.s)
}

// Every journey of the draft replaced (one undo step); null when nothing changed.
function setJourneys(draft: MapDraft, journeys: MapJourney[]): Change {
  const before = journeysOf(draft)
  if (JSON.stringify(before) === JSON.stringify(journeys)) return null
  // A map from before journeys had none: it is given the empty list first, so an undo has something to go back to.
  return change(draft.journeys ? draft : { ...draft, journeys: [] }, { journeys })
}

const edit = (draft: MapDraft, id: string, fn: (j: MapJourney) => MapJourney): Change => setJourneys(draft, journeysOf(draft).map(j => (j.id === id ? fn(j) : j)))

// A journey for a character (one each). Null when the character has one already or the map holds as many as it may.
export function addJourney(draft: MapDraft, characterId: string, makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const list = journeysOf(draft)
  if (list.length >= MAP_MAX_JOURNEYS || list.some(j => j.characterId === characterId)) return null
  const id = makeId()
  const made = setJourneys(draft, [...list, { id, characterId, color: null, stops: [] }])
  return made ? { change: made, id } : null
}

export const removeJourney = (draft: MapDraft, id: string): Change => setJourneys(draft, journeysOf(draft).filter(j => j.id !== id))
export const setJourneyColour = (draft: MapDraft, id: string, color: string | null): Change => edit(draft, id, j => ({ ...j, color }))

// A stop at a place of the map, from a point of the story ('' = not placed yet); it goes where the story puts it.
export function addStop(draft: MapDraft, journeyId: string, x: number, y: number, at: string, points: StoryPoint[], makeId: MakeId = randomId): { change: NonNullable<Change>; id: string } | null {
  const journey = journeysOf(draft).find(j => j.id === journeyId)
  if (!journey || journey.stops.length >= MAP_MAX_STOPS) return null
  const id = makeId()
  const stop: MapJourneyStop = { id, x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2, at, note: '' }
  const made = edit(draft, journeyId, j => ({ ...j, stops: orderStops([...j.stops, stop], points) }))
  return made ? { change: made, id } : null
}

export function editStop(draft: MapDraft, journeyId: string, stopId: string, patch: Partial<Pick<MapJourneyStop, 'x' | 'y' | 'at' | 'note'>>, points: StoryPoint[]): Change {
  return edit(draft, journeyId, j => ({ ...j, stops: orderStops(j.stops.map(s => (s.id === stopId ? { ...s, ...patch } : s)), points) }))
}

export const removeStop = (draft: MapDraft, journeyId: string, stopId: string): Change => edit(draft, journeyId, j => ({ ...j, stops: j.stops.filter(s => s.id !== stopId) }))

export interface Whereabouts { journeyId: string; characterId: string; x: number; y: number; stopId: string }

// Where each character is at a point of the story: the last stop of their journey whose point is at or before it. A character with no such stop is not on the map yet.
export function whereAt(journeys: MapJourney[], points: StoryPoint[], pointId: string): Whereabouts[] {
  const at = pointIndex(points, pointId)
  if (at < 0) return []
  const out: Whereabouts[] = []
  for (const j of journeys) {
    let best: { stop: MapJourneyStop; i: number } | null = null
    for (const stop of j.stops) {
      const i = pointIndex(points, stop.at)
      if (i >= 0 && i <= at && (!best || i >= best.i)) best = { stop, i }
    }
    if (best) out.push({ journeyId: j.id, characterId: j.characterId, x: best.stop.x, y: best.stop.y, stopId: best.stop.id })
  }
  return out
}
