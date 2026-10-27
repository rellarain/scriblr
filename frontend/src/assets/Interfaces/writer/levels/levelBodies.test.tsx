import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fillColorCss } from '../../../../theme/bookColors'
import { makeWorkspace, type WorkspaceOverrides } from '../../../../test/makeWorkspace'
import { ProjectTiles } from './levelBodies'

// The project shelves beside the Dash: one tile per project.

const DEFAULT_HUE = 300
const project = (projectId: string, title: string, themeHue?: number) => ({ projectId, title, settings: themeHue === undefined ? {} : { themeHue } })

function tiles(projects: Array<ReturnType<typeof project>>, over: WorkspaceOverrides = {}) {
  return makeWorkspace({
    projects, projectsStatus: 'idle', projectOutlines: {}, projectProgress: {}, activeProjectId: null, activeBookId: null,
    // (The workspace's own rule: a project's colour, else the default.)
    projectHueOf: (p: { settings: { themeHue?: number | null } }) => p.settings.themeHue ?? DEFAULT_HUE,
    ...over,
  } as WorkspaceOverrides)
}
const fills = () => Array.from(document.querySelectorAll<HTMLElement>('.wrProjectTile')).map(t => t.style.getPropertyValue('--wr-fill'))

describe('ProjectTiles: the colour of each shelf', () => {
  it('is its own project\'s colour, and the default for a project that has none', () => {
    render(<ProjectTiles w={tiles([project('a', 'Alpha', 200), project('b', 'Beta', 10), project('c', 'Gamma')])} />)
    expect(fills()).toEqual([fillColorCss(200), fillColorCss(10), fillColorCss(DEFAULT_HUE)])
    expect(new Set(fills()).size).toBe(3)
  })

  it('is not the open project\'s colour: the tiles do not all take the colour of the one that is open', () => {
    render(<ProjectTiles w={tiles([project('a', 'Alpha', 200), project('b', 'Beta', 10)], { activeProjectId: 'a', projectHue: 200 })} />)
    expect(fills()).toEqual([fillColorCss(200), fillColorCss(10)])
  })

  it('follows a change of a project\'s colour', () => {
    const { rerender } = render(<ProjectTiles w={tiles([project('a', 'Alpha', 200), project('b', 'Beta', 10)])} />)
    rerender(<ProjectTiles w={tiles([project('a', 'Alpha', 90), project('b', 'Beta', 10)])} />)
    expect(fills()).toEqual([fillColorCss(90), fillColorCss(10)])
  })
})
