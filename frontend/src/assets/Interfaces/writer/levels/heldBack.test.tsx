import { describe, expect, it, vi } from 'vitest'
import { makeWorkspace } from '../../../../test/makeWorkspace'
import { dashTabs } from './dashTabs'
import { outlineTabs } from './outlineTabs'
import { projectTabs } from './projectTabs'

// What is held back for WUI v2 (features.ts) comes back, where it was, when the switch is on.
vi.mock('../../../../features', () => ({ V2_FEATURES: true }))

const w = makeWorkspace({ projects: [{ projectId: 'p1', title: 'Saga' }], projectOutlines: { p1: [] } })
const ids = (tabs: Array<{ id: string }>) => tabs.map(t => t.id)

describe('the tabs held back for WUI v2', () => {
  it('come back when V2_FEATURES is on: Readers, Items and Publish', () => {
    expect(ids(dashTabs(w))).toEqual(['schedule', 'readers', 'scratchpad', 'project', 'settings', 'help'])
    expect(ids(projectTabs(w))).toEqual(['plot', 'outline', 'schedule', 'plan', 'maps', 'characters', 'items', 'history', 'settings', 'help'])
    expect(ids(outlineTabs(w))).toEqual(['outline', 'details', 'publish', 'settings', 'help'])
  })
})
