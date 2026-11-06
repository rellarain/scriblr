import { describe, expect, it } from 'vitest'
import type { CharacterDoc, CharacterRelationship, CharacterState, OutlineNode } from '../../../../api/types'
import { newCharacter } from '../../../../designSystem/mockCharacters'
import { defaultLook } from './art/defaults'
import { appearanceGaps, familyTree, lookDiff, nextId, relationshipAt, stateAt, statesInOrder, storyPoints, webLinks } from './story'

const node = (id: string, kind: OutlineNode['kind'], parentId: string | null, order: number, title = id): OutlineNode => ({
  id, kind, parentId, order, title, synopsis: '', draftRef: null, flag: null, color: null, chapterCountTarget: null, plotlineIds: [], wordCountGoal: null,
})
const NODES = [
  node('b1', 'book', null, 0, 'Book One'), node('c2', 'chapter', 'b1', 1, 'Second'), node('c1', 'chapter', 'b1', 0, 'First'),
  node('s1', 'scene', 'c1', 0, 'Arrival'), node('s2', 'scene', 'c1', 1, ''), node('s3', 'scene', 'c2', 0, 'Storm'), node('m1', 'moment', 's1', 0),
]
const POINTS = storyPoints(NODES)

const state = (id: string, at: string, over: Partial<CharacterState> = {}): CharacterState => ({ id, at, storyTime: '', mood: '', goal: '', where: '', note: '', inventory: [], snapshot: null, ...over })
const rel = (id: string, targetId: string, over: Partial<CharacterRelationship> = {}): CharacterRelationship => ({ id, targetId, kind: 'friend', family: null, label: '', description: '', changes: [], ...over })
const person = (id: string, name: string, relationships: CharacterRelationship[] = []): CharacterDoc => ({ ...newCharacter(id, { name }, 0), relationships })

describe('the story points', () => {
  it('are the chapters and scenes in book order, with where they are', () => {
    expect(POINTS.map(p => p.id)).toEqual(['c1', 's1', 's2', 'c2', 's3'])
    expect(POINTS[1].label).toBe('Book One > First > Arrival')
    expect(POINTS[2].title).toBe('Untitled scene')
    expect(POINTS.every((p, i) => p.index === i)).toBe(true)
  })
  it('are empty for an empty outline', () => expect(storyPoints([])).toEqual([]))
  it('gives the next id of a kind', () => {
    expect(nextId([], 'r')).toBe('r1')
    expect(nextId([{ id: 'r1' }, { id: 'r3' }], 'r')).toBe('r2')
  })
})

describe('states carry forward', () => {
  const states = [state('b', 's3', { mood: 'grim' }), state('a', 'c1', { mood: 'calm' }), state('x', 'gone', { mood: 'lost' })]
  it('are in book order, the ones whose point is gone last', () => expect(statesInOrder(states, POINTS).map(s => s.id)).toEqual(['a', 'b', 'x']))
  it('are what is true until the next state', () => {
    expect(stateAt(states, POINTS, 's1')?.mood).toBe('calm')
    expect(stateAt(states, POINTS, 'c2')?.mood).toBe('calm')
    expect(stateAt(states, POINTS, 's3')?.mood).toBe('grim')
  })
  it('are nothing before the first state, or at a point that is not there', () => {
    expect(stateAt([state('b', 's3')], POINTS, 's1')).toBeNull()
    expect(stateAt(states, POINTS, 'nope')).toBeNull()
  })
})

describe('a relationship over the story', () => {
  const r = rel('r1', 'b', { label: 'friend', description: 'close', changes: [{ id: 'c1', at: 's3', label: 'rival', note: 'betrayed' }, { id: 'c2', at: 'gone', label: 'x', note: 'y' }] })
  it('reads as its own before any change, and after the last change at or before the point', () => {
    expect(relationshipAt(r, POINTS, null)).toEqual({ label: 'friend', note: 'close' })
    expect(relationshipAt(r, POINTS, 's1')).toEqual({ label: 'friend', note: 'close' })
    expect(relationshipAt(r, POINTS, 's3')).toEqual({ label: 'rival', note: 'betrayed' })
  })
})

describe('how a look differs', () => {
  it('lists the parts, colours, sliders, outfit and marks that changed', () => {
    const a = defaultLook()
    const b = { ...a, hair: 'braid', hairColor: '#ff0000', height: 1.2, expression: 'sad', outfit: { ...a.outfit, top: 'hoodie', accessories: ['hat'] }, marks: [{ id: 'm', kind: 'scar' as const, design: 'slash', area: 'cheeks', x: 0.5, y: 0.5, size: 1, color: null, strokes: [] }] }
    const lines = lookDiff(a, b)
    expect(lines).toContain('Hair: Short > Braid')
    expect(lines).toContain('Hair colour: #3b2a20 > #ff0000')
    expect(lines).toContain('Height: 100% > 120%')
    expect(lines).toContain('Top: T-shirt > Hoodie')
    expect(lines).toContain('Puts on: Brimmed hat')
    expect(lines).toContain('1 new mark')
    expect(lookDiff(a, a)).toEqual([])
  })
  it('is found between states that have a captured look, in book order', () => {
    const a = defaultLook()
    const gaps = appearanceGaps([state('b', 's3', { snapshot: { ...a, hair: 'bun' } }), state('n', 's2'), state('a', 'c1', { snapshot: a })], POINTS)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].from.id).toBe('a')
    expect(gaps[0].changes).toEqual(['Hair: Short > Top bun'])
  })
})

describe('the web and the family tree', () => {
  it('has one link for a pair and kind that both characters have', () => {
    const cast = [person('a', 'Ada', [rel('r', 'b')]), person('b', 'Bram', [rel('r', 'a'), rel('q', 'a', { kind: 'rival' })])]
    expect(webLinks(cast).map(l => l.kind)).toEqual(['friend', 'rival'])
  })

  const family = [
    person('gran', 'Gran'), person('mum', 'Mum', [rel('r', 'gran', { kind: 'family', family: 'parent' }), rel('s', 'dad', { kind: 'family', family: 'spouse' })]),
    person('dad', 'Dad'), person('me', 'Me', [rel('r', 'mum', { kind: 'family', family: 'parent' })]), person('bro', 'Bro', [rel('r', 'mum', { kind: 'family', family: 'parent' })]),
    person('kid', 'Kid', [rel('r', 'me', { kind: 'family', family: 'parent' })]), person('pal', 'Pal', [rel('r', 'me')]),
  ]
  it('puts parents above, children below, and siblings and spouses beside', () => {
    const rows = familyTree(family, 'me')
    expect(rows.map(r => [r.generation, r.people.map(p => p.name)])).toEqual([[-2, ['Gran']], [-1, ['Dad', 'Mum']], [0, ['Bro', 'Me']], [1, ['Kid']]])
    expect(rows[1].people.find(p => p.id === 'mum')?.partner).toBe('dad')
  })
  it('follows a link made from either side, and leaves out friends', () => {
    const rows = familyTree(family, 'gran')
    expect(rows.flatMap(r => r.people.map(p => p.name))).toContain('Kid')
    expect(rows.flatMap(r => r.people.map(p => p.name))).not.toContain('Pal')
  })
  it('is one row with one person for a character with no family', () => {
    expect(familyTree(family, 'pal')).toEqual([{ generation: 0, people: [{ id: 'pal', name: 'Pal', partner: null }] }])
  })
})
