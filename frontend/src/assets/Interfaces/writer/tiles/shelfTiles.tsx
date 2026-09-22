import { BarChartIcon, CalendarIcon, CheckboxIcon, ClockIcon, ListIcon, PencilIcon, PlotIcon } from '../../../icons'
import type { TileDef } from '../../../../components/tiles/tileTypes'
import type { TileShape } from '../../../../components/tiles/tileShapes'
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
// placeholders until they are built.

const body = (key: string) => SHELF_COMPONENTS.find(c => c.key === key)?.body
const label = (key: string) => SHELF_COMPONENTS.find(c => c.key === key)?.label ?? ''
const placeholder = (key: string) => () => <Placeholder title={label(key)} body={body(key)} />

function PlotBody({ shape, w }: { shape: TileShape; w: WriterWorkspace }) {
  const counts = plotCounts(w.plotNodes)
  const cats = categoryRows(w.plotNodes)
  if (shape === 'landscape') {
    return (
      <>
        <TileBars rows={[{ key: 'placed', label: 'Placed', value: counts.placed, text: `${counts.placed} of ${counts.values}` }]} />
        <TileSub>{counts.categories} categories · {counts.plotlines} plotlines · {counts.waiting} waiting</TileSub>
      </>
    )
  }
  const shown = cats.slice(0, shape === 'large' ? 6 : 4)
  return (
    <>
      {cats.length === 0 && <TileSub>No plot yet.</TileSub>}
      <TileRows rows={shown.map(c => ({ key: c.id, label: c.title, value: `${c.plotlines} ${c.plotlines === 1 ? 'plotline' : 'plotlines'}` }))} />
      {shape === 'large' && <TileSub>{counts.placed} {counts.placed === 1 ? 'value' : 'values'} placed, {counts.waiting} waiting</TileSub>}
    </>
  )
}

function OutlineBody({ shape, w }: { shape: TileShape; w: WriterWorkspace }) {
  const books = bookRows(w.outlineNodes)
  const chapters = books.reduce((n, b) => n + b.chapters, 0)
  if (shape === 'small') return <TileBig value={chapters} label={chapters === 1 ? 'chapter' : 'chapters'} />
  return (
    <>
      {books.length === 0 && <TileSub>No books yet.</TileSub>}
      <TileRows
        rows={books.map(b => ({ key: b.id, label: b.title, value: `${b.chapters} ch` }))}
        onOpen={id => w.openBook(id)}
      />
      {shape === 'large' && <TileSub>{books.length} books · {chapters} chapters</TileSub>}
    </>
  )
}

function AnalyticsBody({ shape, w }: { shape: TileShape; w: WriterWorkspace }) {
  const books = bookRows(w.outlineNodes)
  const chapters = books.reduce((n, b) => n + b.chapters, 0)
  if (shape === 'small') return <TileBig value={chapters} label="chapters" />
  return (
    <>
      {books.length === 0 && <TileSub>No books yet.</TileSub>}
      <TileBars rows={books.slice(0, 4).map(b => ({ key: b.id, label: b.title, value: b.chapters, text: `${b.chapters} chapters` }))} />
      {shape === 'large' && <TileSub>Word counts and progress are coming.</TileSub>}
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
      id: 'plot', title: 'Plot', Icon: PlotIcon, shapes: ['landscape', 'portrait', 'large'], defaultShape: 'large',
      summary: `${counts.categories} categories, ${counts.plotlines} plotlines`,
      render: ({ shape }) => <PlotBody shape={shape} w={w} />,
      console: () => <PlotView w={w} />,
    },
    {
      id: 'outline', title: 'Outline', Icon: ListIcon, shapes: ['small', 'portrait', 'large'], defaultShape: 'portrait',
      summary: `${books.length} ${books.length === 1 ? 'book' : 'books'}, ${chapters} chapters`,
      render: ({ shape }) => <OutlineBody shape={shape} w={w} />,
      console: () => <ProjectOutline w={w} />,
    },
    {
      id: 'schedule', title: 'Schedule', Icon: CalendarIcon, shapes: ['small', 'landscape'], defaultShape: 'small',
      summary: 'Goals, routines, checklists and revisions',
      render: ({ shape }) => (shape === 'small' ? <TileBig value="Soon" label="goals and routines" /> : <TileSub>{body('projectSchedule')}</TileSub>),
      console: placeholder('projectSchedule'),
    },
    {
      id: 'analytics', title: 'Analytics', Icon: BarChartIcon, shapes: ['small', 'landscape', 'large'], defaultShape: 'landscape',
      summary: `${chapters} chapters`,
      render: ({ shape }) => <AnalyticsBody shape={shape} w={w} />,
      console: placeholder('projectAnalytics'),
    },
    {
      id: 'history', title: 'History', Icon: ClockIcon, shapes: ['small', 'landscape'], defaultShape: 'small',
      summary: 'Versions and activity',
      render: ({ shape }) => (shape === 'small' ? <TileBig value="Soon" label="versions and activity" /> : <TileSub>{body('projectHistory')}</TileSub>),
      console: placeholder('projectHistory'),
    },
    {
      id: 'editor', title: 'Project editor', Icon: PencilIcon, shapes: ['link'], defaultShape: 'link',
      summary: `${timeSystems} ${timeSystems === 1 ? 'time system' : 'time systems'}`,
      console: () => <TimeSystemEditor w={w} />,
    },
    { id: 'template', title: 'Templates', Icon: CheckboxIcon, shapes: ['link'], defaultShape: 'link', summary: 'Book templates', console: placeholder('outlineTemplate') },
  ]
}
