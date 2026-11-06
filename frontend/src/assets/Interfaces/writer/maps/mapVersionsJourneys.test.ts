import { describe, expect, it } from 'vitest'
import type { MapSummary } from '../../../../api/types'
import { newMap } from '../../../../designSystem/mockMaps'
import type { StoryPoint } from '../characters/story'
import { JOURNEY_COLOURS, addJourney, addStop, colourOf, editStop, journeysOf, orderStops, removeJourney, removeStop, setJourneyColour, whereAt } from './mapJourneys'
import { MapHistory, draftOf, mapRows, setAppliesFrom, summaryOf } from './mapModel'
import { appliesLabel, baseIdOf, familyOf, isVersion, versionAt, versionsOf } from './mapVersions'

const point = (id: string, index: number): StoryPoint => ({ id, kind: 'chapter', title: `Chapter ${index + 1}`, label: `Book > Chapter ${index + 1}`, index })
const POINTS = ['c1', 'c2', 'c3', 'c4'].map(point)
const summary = (id: string, over: Partial<MapSummary> = {}): MapSummary => ({ id, title: id, kind: 'town', parentId: null, order: 0, width: 4, height: 4, updatedAt: '', ...over })

describe('versions of a map', () => {
  const maps = [
    summary('base'), summary('v1', { versionOf: 'base', appliesFrom: 'c2', order: 0 }), summary('v2', { versionOf: 'base', appliesFrom: 'c4', order: 1 }),
    summary('loose', { versionOf: 'base', appliesFrom: null, order: 2 }), summary('other'),
  ]

  it('knows the first map of a version, and the versions in the order they were made', () => {
    expect(isVersion(maps[1])).toBe(true)
    expect(isVersion(maps[0])).toBe(false)
    expect(baseIdOf(maps, 'v2')).toBe('base')
    expect(baseIdOf(maps, 'base')).toBe('base')
    expect(versionsOf(maps, 'base').map(m => m.id)).toEqual(['v1', 'v2', 'loose'])
    expect(familyOf(maps, 'v1').map(m => m.id)).toEqual(['base', 'v1', 'v2', 'loose'])
    expect(familyOf(maps, 'other').map(m => m.id)).toEqual(['other'])
  })

  it('chooses the version that is true at a point: the last one at or before it, else the first map', () => {
    expect(versionAt(maps, 'base', POINTS, 'c1')).toBe('base')
    expect(versionAt(maps, 'base', POINTS, 'c2')).toBe('v1')
    expect(versionAt(maps, 'v2', POINTS, 'c3')).toBe('v1')
    expect(versionAt(maps, 'base', POINTS, 'c4')).toBe('v2')
    expect(versionAt(maps, 'base', POINTS, 'nowhere')).toBe('base')
  })

  it('never chooses a version that is not placed, or whose point is gone from the outline', () => {
    const gone = [...maps, summary('v3', { versionOf: 'base', appliesFrom: 'deleted', order: 3 })]
    expect(versionAt(gone, 'base', POINTS, 'c4')).toBe('v2')
    expect(versionAt(maps, 'base', [], 'c2')).toBe('base')
  })

  it('says where each begins to be true', () => {
    expect(appliesLabel(maps[0], POINTS)).toBe('from the start')
    expect(appliesLabel(maps[1], POINTS)).toBe('from Chapter 2')
    expect(appliesLabel(maps[3], POINTS)).toBe('not placed yet')
    expect(appliesLabel(summary('x', { versionOf: 'base', appliesFrom: 'deleted' }), POINTS)).toBe('from a part of the book that is gone')
  })

  it('are not in the tree of maps inside maps', () => {
    expect(mapRows(maps).map(r => r.map.id)).toEqual(['base', 'other'])
  })

  it('keep what they are of in the summary, and a version is placed with one undoable change', () => {
    const doc = { ...newMap('v', { title: 'Later' }, 0), versionOf: 'base', appliesFrom: null }
    expect(summaryOf(doc)).toMatchObject({ versionOf: 'base', appliesFrom: null })
    const draft = draftOf(doc)
    expect(setAppliesFrom(draft, null)).toBeNull()
    const made = setAppliesFrom(draft, 'c3')!
    expect(made.draft.appliesFrom).toBe('c3')
    const history = new MapHistory()
    history.push(made.edit)
    expect(history.canUndo).toBe(true)
  })
})

describe('journeys', () => {
  const draft = draftOf(newMap('m', { title: 'World', width: 10, height: 10 }, 0))
  const mk = () => { let n = 0; return () => `id${++n}` }

  it('give each character one journey, with a colour from the map\'s own palette until chosen', () => {
    const id = mk()
    const first = addJourney(draft, 'chr_a', id)!
    expect(journeysOf(first.change.draft)).toEqual([{ id: 'id1', characterId: 'chr_a', color: null, stops: [] }])
    expect(addJourney(first.change.draft, 'chr_a', id)).toBeNull()
    const second = addJourney(first.change.draft, 'chr_b', id)!
    const list = journeysOf(second.change.draft)
    expect(colourOf(list[0], 0)).toBe(JOURNEY_COLOURS[0])
    expect(colourOf(list[1], 1)).toBe(JOURNEY_COLOURS[1])
    expect(colourOf({ ...list[0], color: '#123456' }, 0)).toBe('#123456')
    expect(colourOf(list[0], JOURNEY_COLOURS.length)).toBe(JOURNEY_COLOURS[0])
  })

  it('keep the stops in the order of the story, those with no point last', () => {
    const stops = [
      { id: 'a', x: 1, y: 1, at: 'c3', note: '' }, { id: 'b', x: 2, y: 2, at: '', note: '' }, { id: 'c', x: 3, y: 3, at: 'c1', note: '' }, { id: 'd', x: 4, y: 4, at: 'gone', note: '' },
    ]
    expect(orderStops(stops, POINTS).map(s => s.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('add a stop at a cell centre where the story puts it, change it, and take it away', () => {
    const id = mk()
    let d = addJourney(draft, 'chr_a', id)!.change.draft
    d = addStop(d, 'id1', 3.5, 4.5, 'c3', POINTS, id)!.change.draft
    d = addStop(d, 'id1', 6.25, 2.75, 'c1', POINTS, id)!.change.draft
    expect(journeysOf(d)[0].stops.map(s => [s.at, s.x, s.y])).toEqual([['c1', 6.5, 3], ['c3', 3.5, 4.5]])
    d = editStop(d, 'id1', 'id2', { at: 'c4', note: 'Crosses the pass' }, POINTS)!.draft
    expect(journeysOf(d)[0].stops.map(s => s.at)).toEqual(['c1', 'c4'])
    d = removeStop(d, 'id1', 'id2')!.draft
    expect(journeysOf(d)[0].stops).toHaveLength(1)
    expect(addStop(d, 'nope', 1, 1, '', POINTS)).toBeNull()
    expect(setJourneyColour(d, 'id1', '#abcdef')!.draft.journeys![0].color).toBe('#abcdef')
    expect(journeysOf(removeJourney(d, 'id1')!.draft)).toEqual([])
    expect(removeJourney(d, 'nope')).toBeNull()
  })

  it('are one undoable change each, also on a map from before there were journeys', () => {
    const old = { ...draft }
    delete (old as { journeys?: unknown }).journeys
    const made = addJourney(old, 'chr_a')!
    const history = new MapHistory()
    history.push(made.change.edit)
    expect(made.change.edit).toMatchObject({ kind: 'meta' })
    expect(JSON.stringify(made.change.edit)).toContain('"journeys":[]')
  })

  it('say where everyone is at a point: the last stop at or before it, and nobody who has not set out', () => {
    const journeys = [
      { id: 'j1', characterId: 'chr_a', color: null, stops: [{ id: 's1', x: 1, y: 1, at: 'c1', note: '' }, { id: 's2', x: 5, y: 5, at: 'c3', note: '' }] },
      { id: 'j2', characterId: 'chr_b', color: null, stops: [{ id: 's3', x: 2, y: 2, at: 'c2', note: '' }, { id: 's4', x: 9, y: 9, at: '', note: '' }] },
    ]
    expect(whereAt(journeys, POINTS, 'c1').map(w => [w.characterId, w.stopId])).toEqual([['chr_a', 's1']])
    expect(whereAt(journeys, POINTS, 'c2').map(w => [w.characterId, w.stopId])).toEqual([['chr_a', 's1'], ['chr_b', 's3']])
    expect(whereAt(journeys, POINTS, 'c4').map(w => [w.characterId, w.x, w.y])).toEqual([['chr_a', 5, 5], ['chr_b', 2, 2]])
    expect(whereAt(journeys, POINTS, 'nowhere')).toEqual([])
  })
})
