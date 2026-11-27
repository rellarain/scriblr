import { describe, expect, it } from 'vitest'
import type { OutlineNode } from '../../../../api/types'
import { outlineNode, plotNode } from '../plotTestWorkspace'
import {
  becameLine, chapterOf, chaptersOf, fieldsOf, momentsOf, noteParagraph, noteParts, parentsFor, placesOf, withNodeFlag, withOutlineNode, withParagraph,
  withPlotpoint,
} from './noteConversion'

const OUTLINE: OutlineNode[] = [
  outlineNode('s', 'series', null, { title: 'Saga' }),
  outlineNode('b1', 'book', 's', { title: 'The Lantern Road' }),
  outlineNode('a1', 'arc', 'b1', { title: 'Crossing' }),
  outlineNode('c1', 'chapter', 'a1', { title: 'The Courier' }),
  outlineNode('fd', 'moment', 'c1', { freeDraft: true, title: '' }),
  outlineNode('sc1', 'scene', 'c1', { title: '', location: 'The landing', order: 1 }),
  outlineNode('m1', 'moment', 'sc1', { title: "The ferryman's price" }),
  outlineNode('c2', 'chapter', 'b1', { title: '', order: 1 }),
  outlineNode('b2', 'book', null, { title: 'Salt', order: 1 }),
  outlineNode('c3', 'chapter', 'b2', { title: 'Tide' }),
]
const PLOT = [
  plotNode('cat', 'category', null, { title: 'Characters', customFieldDefs: [{ id: 'f-choice', name: 'Role', kind: 'dropdown', options: [] }] }),
  plotNode('line', 'plotline', 'cat', { title: 'Mara Quell', customFieldDefs: [{ id: 'f1', name: 'Her mother', kind: 'points' }] }),
]

describe('what a note says', () => {
  it('is its title and the rest, or the first line of its text when it has no title', () => {
    expect(noteParts({ title: ' The ferryman ', body: 'He says it first.' })).toEqual({ title: 'The ferryman', rest: 'He says it first.' })
    expect(noteParts({ title: '', body: 'The ferryman knows.\nHe says it first.\nUse it?' })).toEqual({ title: 'The ferryman knows.', rest: 'He says it first.\nUse it?' })
  })

  it('makes one paragraph of it', () => {
    expect(noteParagraph({ title: 'The ferryman knows.', body: 'He says it first.\nUse it?' })).toBe('The ferryman knows. He says it first. Use it?')
    expect(noteParagraph({ title: '', body: '  ' })).toBe('')
  })

  it('says what it became', () => {
    expect(becameLine({ target: 'plot', projectId: 'p', projectTitle: 'Harbour Lights', at: 'now' })).toBe('Became a plotpoint in Harbour Lights')
  })
})

describe('the places in a project', () => {
  it('are named by their paths, from the book, with the title last', () => {
    const p = placesOf(OUTLINE)
    expect(p.get('s')?.label).toBe('Series 1 · Saga')
    expect(p.get('b1')?.label).toBe('Book 1 · The Lantern Road')
    expect(p.get('c1')?.label).toBe('Book 1 · Arc 1 · Chapter 1 · The Courier')
    expect(p.get('sc1')?.label).toBe('Book 1 · Arc 1 · Chapter 1 · Scene 1 · The landing')
    expect(p.get('m1')?.label).toBe("Book 1 · Arc 1 · Chapter 1 · Scene 1 · Moment 1 · The ferryman's price")
    expect(p.get('c2')?.label).toBe('Book 1 · Chapter 2')
    expect(p.get('c3')?.label).toBe('Book 2 · Chapter 1 · Tide')
  })

  it('a new node can go under any shallower kind, a book under a series or at the top', () => {
    expect(parentsFor(OUTLINE, 'moment').map(p => p.id)).toEqual(['b1', 'a1', 'c1', 'sc1', 'c2', 'b2', 'c3'])
    expect(parentsFor(OUTLINE, 'chapter').map(p => p.id)).toEqual(['b1', 'a1', 'b2'])
    expect(parentsFor(OUTLINE, 'book')).toEqual([{ id: null, label: 'The top of the project' }, { id: 's', label: 'Series 1 · Saga' }])
  })

  it('lists the moments and the chapters, and finds a moment’s chapter', () => {
    expect(momentsOf(OUTLINE).map(m => m.id)).toEqual(['fd', 'm1'])
    expect(momentsOf(OUTLINE)[0].label).toBe('Book 1 · Arc 1 · Chapter 1 · Free draft')
    expect(chaptersOf(OUTLINE).map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(chapterOf(OUTLINE, 'm1')).toBe('c1')
    expect(chapterOf(OUTLINE, 'b1')).toBeNull()
  })

  it('lists the plot fields that take plotpoints, by their paths (not a choice field)', () => {
    expect(fieldsOf(PLOT)).toEqual([{ holderId: 'line', fieldId: 'f1', label: 'Characters · Mara Quell · Her mother' }])
  })
})

describe('the trees with the note in them', () => {
  it('add an outline node last under its parent', () => {
    const { nodes, id } = withOutlineNode(OUTLINE, 'c1', 'scene', { action: 'She pays' })
    const made = nodes.find(n => n.id === id)
    expect(made).toMatchObject({ kind: 'scene', parentId: 'c1', order: 2, action: 'She pays', title: '', draftRef: null })
  })

  it('add a plotpoint to a field, placed on a moment when asked', () => {
    const { nodes, id } = withPlotpoint(PLOT, OUTLINE, 'line', 'f1', 'The ferryman knows', 'He says it first.', 'm1')
    const point = nodes.find(n => n.id === id)
    expect(point).toMatchObject({ kind: 'plotpoint', parentId: 'line', fieldId: 'f1', title: 'The ferryman knows', body: 'He says it first.' })
    expect(point?.placements?.map(p => p.targetId)).toEqual(['m1'])
    expect(withPlotpoint(PLOT, OUTLINE, 'line', 'f1', 'x', '', null).nodes.find(n => n.kind === 'plotpoint')?.placements).toEqual([])
  })

  it('refuse a plotpoint in a choice field', () => {
    expect(withPlotpoint(PLOT, OUTLINE, 'cat', 'f-choice', 'x', '', null).id).toBeNull()
  })

  it('flag a chapter, in place of the flag it had', () => {
    const flagged = withNodeFlag(withNodeFlag(OUTLINE, 'c1', 'review', 'old'), 'c1', 'merge', 'Merge it')
    expect(flagged.find(n => n.id === 'c1')?.flag).toEqual({ type: 'merge', note: 'Merge it' })
  })

  it('add a paragraph at the start or the end of a moment', () => {
    expect(withParagraph('One.\n\nTwo.\n', 'New.', 'end')).toBe('One.\n\nTwo.\n\nNew.')
    expect(withParagraph('One.', 'New.', 'start')).toBe('New.\n\nOne.')
    expect(withParagraph('  ', 'New.', 'start')).toBe('New.')
  })
})
