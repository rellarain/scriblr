import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { outlineNode, plotNode } from '../plotTestWorkspace'
import { ChapterPoints } from './ChapterPoints'

// The Plotpoints tile says where a plotpoint pinned to a paragraph is.

describe("the Plotpoints tile and a plotpoint's pin", () => {
  it('names the moment and the paragraph a pinned placement is on, and nothing for one not pinned', () => {
    const outline = [
      outlineNode('book', 'book', null), outlineNode('c1', 'chapter', 'book'),
      outlineNode('m1', 'moment', 'c1'), outlineNode('m2', 'moment', 'c1', { order: 1 }),
    ]
    const plot = [
      plotNode('pinned', 'plotpoint', null, { title: 'The unopened letter', placements: [{ id: 'a', targetId: 'm2', paragraphIndex: 2, awareness: 'front' }] }),
      plotNode('loose', 'plotpoint', null, { title: 'The debt comes due', order: 1, placements: [{ id: 'b', targetId: 'm1', paragraphIndex: null, awareness: 'front' }] }),
    ]
    const w = makeWorkspace({
      outlineNodes: outline, plotNodes: plot, plotNodeById: new Map(plot.map(n => [n.id, n])), activeProject: { settings: { timeSystems: [] } }, projectHue: 200,
    })
    render(<ChapterPoints w={w} chapter={outline[1]} />)
    expect(screen.getByText('Moment 2, paragraph 3')).toBeTruthy()
    expect(screen.getAllByText(/paragraph/)).toHaveLength(1)
  })
})
