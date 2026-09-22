import { BarChartIcon, CalendarIcon, CheckboxIcon, ClockIcon, ListIcon, PencilIcon, PlotIcon } from '../../../icons'
import type { TileDef } from '../../../../components/tiles/tileTypes'
import { TileBars, TileBig, TileRows, TileSub } from '../../../../components/tiles/tileParts'
import { SHELF_COMPONENTS } from '../consoleDefs'
import { Placeholder } from '../shared'
import PlotView from '../PlotView'
import ProjectOutline from '../ProjectOutline'
import TimeSystemEditor from '../TimeSystemEditor'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { bookRows, categoryRows, plotCounts } from './tileData'

// The tiles of the Shelf screen (a project is open). The working editors (Plot,
// Outline, the time systems) expand from tiles that summarise them; the rest are
// placeholders until they are built. A mid tile's content scales with its actual
// measured size (small and cramped up through roomy).
const COMPACT_H = 140
const WIDE_W = 280
const ROOMY_H = 160

const body = (key: string) => SHELF_COMPONENTS.find(c => c.key === key)?.body
const label = (key: string) => SHELF_COMPONENTS.find(c => c.key === key)?.label ?? ''
const placeholder = (key: string) => () => <Placeholder title={label(key)} body={body(key)} />

function PlotBody({ width, height, w }: { width: number; height: number; w: WriterWorkspace }) {
  const counts = plotCounts(w.plotNodes)
  const cats = categoryRows(w.plotNodes)
  const roomy = width >= WIDE_W && height >= ROOMY_H
  if (width >= WIDE_W && height < ROOMY_H) {
    return (
      <>
        <TileBars rows={[{ key: 'placed', label: 'Placed', value: counts.placed, text: `${counts.placed} of ${counts.values}` }]} />
        <TileSub>{counts.categories} categories · {counts.plotlines} plotlines · {counts.waiting} waiting</TileSub>
      </>
    )
  }
  const shown = cats.slice(0, roomy ? 6 : 4)
  return (
    <>
      {cats.length === 0 && <TileSub>No plot yet.</TileSub>}
      <TileRows rows={shown.map(c => ({ key: c.id, label: c.title, value: `${c.plotlines} ${c.plotlines === 1 ? 'plotline' : 'plotlines'}` }))} />
      {roomy && <TileSub>{counts.placed} {counts.placed === 1 ? 'value' : 'values'} placed, {counts.waiting} waiting</TileSub>}
    </>
  )
}

function OutlineBody({ width, height, w }: { width: number; height: number; w: WriterWorkspace }) {
  const books = bookRows(w.outlineNodes)
  const chapters = books.reduce((n, b) => n + b.chapters, 0)
  if (height < COMPACT_H) return <TileBig value={chapters} label={chapters === 1 ? 'chapter' : 'chapters'} />
  return (
    <>
      {books.length === 0 && <TileSub>No books yet.</TileSub>}
      <TileRows
        rows={books.map(b => ({ key: b.id, label: b.title, value: `${b.chapters} ch` }))}
        onOpen={id => w.openBook(id)}
      />
      {width >= WIDE_W && height >= ROOMY_H && <TileSub>{books.length} books · {chapters} chapters</TileSub>}
    </>
  )
}

function AnalyticsBody({ width, height, w }: { width: number; height: number; w: WriterWorkspace }) {
  const books = bookRows(w.outlineNodes)
  const chapters = books.reduce((n, b) => n + b.chapters, 0)
  if (height < COMPACT_H) return <TileBig value={chapters} label="chapters" />
  return (
    <>
      {books.length === 0 && <TileSub>No books yet.</TileSub>}
      <TileBars rows={books.slice(0, 4).map(b => ({ key: b.id, label: b.title, value: b.chapters, text: `${b.chapters} chapters` }))} />
      {width >= WIDE_W && height >= ROOMY_H && <TileSub>Word counts and progress are coming.</TileSub>}
    </>
  )
}

export function shelfTiles(w: WriterWorkspace): TileDef[] {
  const counts = plotCounts(w.plotNodes)
  const books = bookRows(w.outlineNodes)
  const chapters = books.reduce((n, b) => n + b.chapters, 0)
  const timeSystems = w.activeProject?.settings.timeSystems.length ?? 0
  return [
    {
      id: 'plot', title: 'Plot', Icon: PlotIcon, defaultShape: 'mid',
      summary: `${counts.categories} categories, ${counts.plotlines} plotlines`,
      render: ({ width, height }) => <PlotBody width={width} height={height} w={w} />,
      console: () => <PlotView w={w} />,
    },
    {
      id: 'outline', title: 'Outline', Icon: ListIcon, defaultShape: 'mid',
      summary: `${books.length} ${books.length === 1 ? 'book' : 'books'}, ${chapters} chapters`,
      render: ({ width, height }) => <OutlineBody width={width} height={height} w={w} />,
      console: () => <ProjectOutline w={w} />,
    },
    {
      id: 'schedule', title: 'Schedule', Icon: CalendarIcon, defaultShape: 'mini',
      summary: 'Goals, routines, checklists and revisions',
      render: ({ height }) => (height < COMPACT_H ? <TileBig value="Soon" label="goals and routines" /> : <TileSub>{body('projectSchedule')}</TileSub>),
      console: placeholder('projectSchedule'),
    },
    {
      id: 'analytics', title: 'Analytics', Icon: BarChartIcon, defaultShape: 'mid',
      summary: `${chapters} chapters`,
      render: ({ width, height }) => <AnalyticsBody width={width} height={height} w={w} />,
      console: placeholder('projectAnalytics'),
    },
    {
      id: 'history', title: 'History', Icon: ClockIcon, defaultShape: 'mini',
      summary: 'Versions and activity',
      render: ({ height }) => (height < COMPACT_H ? <TileBig value="Soon" label="versions and activity" /> : <TileSub>{body('projectHistory')}</TileSub>),
      console: placeholder('projectHistory'),
    },
    {
      id: 'editor', title: 'Project editor', Icon: PencilIcon, defaultShape: 'mini',
      summary: `${timeSystems} ${timeSystems === 1 ? 'time system' : 'time systems'}`,
      console: () => <TimeSystemEditor w={w} />,
    },
    { id: 'template', title: 'Templates', Icon: CheckboxIcon, defaultShape: 'mini', summary: 'Book templates', console: placeholder('outlineTemplate') },
  ]
}
