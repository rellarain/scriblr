import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as resourcesApi from '../../../../api/resourcesApi'
import type { OutlineNode, PlotNode } from '../../../../api/types'
import { __resetSettingsForTests } from '../../../../settings/settingsStore'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { useProjectTabs } from './projectTabs'

// The big editors are stood in for: they have their own tests.
vi.mock('../PlotView', () => ({ default: () => <div>plot editor</div> }))
vi.mock('../ProjectOutline', () => ({ default: () => <div>outline editor</div> }))
vi.mock('../ProjectEditor', () => ({ default: () => <div>project editor</div> }))

beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })))
  vi.spyOn(resourcesApi, 'getResources').mockResolvedValue({ schemaVersion: 1, nodes: [], content: {}, assessments: {} })
})

const outline = (id: string, kind: OutlineNode['kind'], parentId: string | null, over: Partial<OutlineNode> = {}): OutlineNode =>
  ({ id, kind, parentId, order: 0, title: id, synopsis: '', draftRef: null, ...over } as OutlineNode)
const plot = (id: string, kind: PlotNode['kind'], parentId: string | null, over: Partial<PlotNode> = {}): PlotNode =>
  ({ id, kind, parentId, order: 0, title: id, body: '', assignedMomentId: null, assignedParagraphIndex: null, customFieldDefs: [], customFieldValues: {}, keywords: [], flag: null, sourceFieldId: null, fieldId: null, refId: null, awareness: null, ...over } as PlotNode)

const outlineNodes = [outline('b1', 'book', null, { title: 'Book One' }), outline('c1', 'chapter', 'b1'), outline('c2', 'chapter', 'b1')]
const plotNodes = [plot('cat', 'category', null, { title: 'Romance' }), plot('line', 'plotline', 'cat'), plot('v1', 'plotpoint', 'line'), plot('v2', 'plotpoint', 'line', { assignedMomentId: 'c1' })]
const w = {
  outlineNodes, plotNodes, openBook: vi.fn(), addOutlineNode: vi.fn(),
  saveStatus: { dirty: false, saving: false, error: undefined, lastSavedAt: null }, saveNow: async () => {}, restoreSaved: async () => {},
} as unknown as WriterWorkspace

function Harness({ size }: { size: 'mid' | 'max' }) {
  const t = useProjectTabs(w, size)
  return <div><header>{t.headerExtras}</header><main>{t.body}</main></div>
}

describe('the Project tabs', () => {
  it('are plot, outline, plotpoints, schedule, history and analytics, ending with Settings and Help', () => {
    render(<Harness size="max" />)
    const names = within(screen.getByRole('toolbar', { name: 'Tabs' })).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(names).toEqual(['Plot', 'Outline', 'Plotpoints', 'Schedule', 'History', 'Analytics', 'Settings', 'Help'])
  })

  it('open the plot editor, full width, at Max, and the outline beside it from its tab', async () => {
    const user = userEvent.setup()
    render(<Harness size="max" />)
    expect(screen.getByText('plot editor')).toBeTruthy()
    expect(document.querySelector('[role="separator"]')).toBeNull() // one tile, the whole area
    await user.click(screen.getByRole('button', { name: 'Outline' }))
    expect(screen.getByText('outline editor')).toBeTruthy()
    expect(document.querySelector('[role="separator"]')).toBeTruthy() // two tiles share it, with a divider
  })

  it('summarise the plot at Mid, and open a book from the outline summary', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    expect(screen.queryByText('plot editor')).toBeNull()
    expect(screen.getByText('Romance')).toBeTruthy()
    expect(screen.getByText('1 of 2')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Outline' }))
    await user.click(screen.getByRole('button', { name: /Book One/ }))
    expect(w.openBook).toHaveBeenCalledWith('b1')
  })

  it('add a book from the Outline tab, and show the project editor under Settings', async () => {
    const user = userEvent.setup()
    render(<Harness size="mid" />)
    await user.click(screen.getByRole('button', { name: 'Outline' }))
    await user.click(screen.getByRole('button', { name: 'New book' }))
    expect(w.addOutlineNode).toHaveBeenCalledWith(null, 'book', expect.objectContaining({ themeHue: expect.any(Number) }))
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByText('project editor')).toBeTruthy()
  })
})
