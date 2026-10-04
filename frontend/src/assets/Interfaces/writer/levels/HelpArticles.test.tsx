import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../../../api/resourcesApi'
import type { ResourceContent, ResourceNode, ResourcesFile } from '../../../../api/types'
import HelpArticles, { articlesFor } from './HelpArticles'

const node = (id: string, kind: ResourceNode['kind'], parentId: string | null, name: string, order = 0): ResourceNode => ({ id, kind, parentId, name, order })
const content = (over: Partial<ResourceContent> = {}): ResourceContent => ({ guide: '', tutorials: [], faq: [], ...over })
const file = (nodes: ResourceNode[], contents: Record<string, ResourceContent>): ResourcesFile => ({ schemaVersion: 1, nodes, content: contents, assessments: {} })

const FILE = file(
  [node('w', 'interface', null, 'Writer'), node('d', 'console', 'w', 'Dashboard'), node('s', 'component', 'd', 'Scratchpad'), node('p', 'console', 'w', 'Project', 1)],
  {
    d: content({ guide: 'The dashboard guide.' }),
    s: content({ faq: [{ id: 'f', question: 'Where do notes go?', answer: 'Here.', source: 'authored', sourceMessageId: null }] }),
    p: content({ guide: 'Project guide.' }),
  },
)

describe('articlesFor', () => {
  it("takes the nodes with the level's name and everything under them, skipping empty ones", () => {
    expect(articlesFor(FILE, ['dashboard']).map(a => a.node.id)).toEqual(['d', 's'])
    expect(articlesFor(FILE, ['DASH', ' Project ']).map(a => a.node.id)).toEqual(['p'])
    expect(articlesFor(FILE, ['nothing'])).toEqual([])
  })
})

describe('HelpArticles', () => {
  it('shows the written articles', async () => {
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(FILE)
    render(<HelpArticles names={['dashboard']} fallback="Default help." />)
    expect(await screen.findByText('The dashboard guide.')).toBeTruthy()
    expect(screen.getByText('Where do notes go?')).toBeTruthy()
    expect(screen.queryByText('Default help.')).toBeNull()
  })

  it('falls back to the default text when nothing is written, or the articles cannot load', async () => {
    vi.spyOn(resourcesApi, 'getResources').mockResolvedValue(file([], {}))
    const first = render(<HelpArticles names={['dashboard']} fallback="Default help." />)
    expect(await screen.findByText('Default help.')).toBeTruthy()
    first.unmount()
    vi.spyOn(resourcesApi, 'getResources').mockRejectedValue(new Error('offline'))
    render(<HelpArticles names={['dashboard']} fallback="Default help." />)
    expect(await screen.findByText('Default help.')).toBeTruthy()
  })
})
