import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import RUI from '../assets/Interfaces/RUI'
import { BorrowDialog, PlanDialog } from '../assets/Interfaces/reader/ReaderDialogs'
import { ReviewDialog } from '../assets/Interfaces/reader/ReviewDialog'
import type { ReaderCtx } from '../assets/Interfaces/reader/readerContext'
import { loadReader, useReader } from '../assets/Interfaces/reader/readerStore'
import * as Icons from '../assets/icons'
import { ReactionHeartIcon } from '../assets/icons'
import { SaveCluster } from '../components/SaveCluster'
import { ColorRange } from '../components/ColorRange'
import { PAGES_COMPONENTS } from '../assets/Interfaces/writer/consoleDefs'
import HueSlider from '../assets/Interfaces/writer/HueSlider'
import { PlotTray } from '../assets/Interfaces/writer/levels/PlotpointsTab'
import WriterLevels from '../assets/Interfaces/writer/levels/WriterLevels'
import { PlotpointTile } from '../assets/Interfaces/writer/PlotpointTile'
import { PlotNav } from '../assets/Interfaces/writer/PlotNav'
import PlotPresetsConsole from '../assets/Interfaces/admin/plot/PlotPresetsConsole'
import { shelfGroups } from '../assets/Interfaces/writer/outlineTree'
import { Shelf } from '../assets/Interfaces/writer/Shelf'
import SplitArea from '../assets/Interfaces/writer/SplitArea'
import { useWriterWorkspace, type WriterWorkspace } from '../assets/Interfaces/writer/useWriterWorkspace'
import { setKv, setTheme as setAccountTheme } from '../settings/settingsStore'
import LevelPanel from '../assets/Interfaces/writer/levels/LevelPanel'
import { defaultProjectHue } from '../assets/Interfaces/writer/levelHues'
import { useThemeState } from '../theme/useTheme'
import SkyToggle from '../theme/SkyToggle'
import ThemeSettingsPanel from '../theme/ThemeSettingsPanel'
import { CARD_META } from './cardMeta'
import { FIXTURE_IDS, FIXTURE_PROJECT_ID, createMockBackend, installMockBackend, previewTheme } from './mockBackend'
import type { CardDef } from './Preview'

// The design system's cards: each one a real part of the app, run against the pretend backend (mockBackend.ts). The labels are the app's
// own; the text inside fields, cards and notes is lorem ipsum.

// ---------------------------------------------------------------- the Writer, walked to a level

export type WriterView = 'dash' | 'project' | 'book' | 'chapter' | 'preview'

// The real Writer (useWriterWorkspace and the four levels), taken through its own navigation to the wanted level once its data has loaded.
function PreviewWriter({ view }: { view: WriterView }) {
  const w = useWriterWorkspace()
  const [pages, setPages] = useState<string>(PAGES_COMPONENTS[0].key)
  const latest = useRef(w)
  latest.current = w
  const stage = useRef(0)
  useEffect(() => {
    const s = latest.current
    if (view === 'dash') return
    if (stage.current === 0 && s.projects.length > 0) {
      stage.current = 1
      void s.openProject(FIXTURE_PROJECT_ID, view === 'project' ? undefined : FIXTURE_IDS.book)
    } else if (stage.current === 1 && s.hasOpenProject && s.outlineStatus === 'idle' && s.outlineNodes.length > 0) {
      if (view === 'chapter' || view === 'preview') { stage.current = 2; s.openChapter(FIXTURE_IDS.chapter) } else stage.current = 9
    } else if (stage.current === 2 && s.activeChapter) {
      stage.current = 9
      if (view === 'preview') s.showPreview()
    }
  })
  return <WriterLevels w={w} pagesComponent={pages} onPagesComponent={setPages} />
}

// Something that needs the Writer's workspace (a plotpoint tile, say), shown once the project has opened.
function WithWorkspace({ children }: { children: (w: WriterWorkspace) => ReactNode }) {
  const w = useWriterWorkspace()
  const latest = useRef(w)
  latest.current = w
  const opened = useRef(false)
  useEffect(() => {
    const s = latest.current
    if (!opened.current && s.projects.length > 0) { opened.current = true; void s.openProject(FIXTURE_PROJECT_ID, FIXTURE_IDS.book) }
  })
  return w.hasOpenProject && w.outlineNodes.length > 0 ? <>{children(w)}</> : <p className="wrMuted">Loading…</p>
}

const writerCard = (view: WriterView) => () => <PreviewWriter view={view} />

// ---------------------------------------------------------------- static cards

// A level panel (the real LevelPanel) to hold a static card: the Dash is the app theme's own colour, the others take a hue.
function LevelFrame({ level, title, hue, children }: { level: 'dash' | 'project' | 'outline'; title: string; hue?: 'project' | number; children: ReactNode }) {
  const { settings, activeZone } = useThemeState()
  const themeHue = settings.zones[activeZone].palette.theme.h
  const code = hue === 'project' ? defaultProjectHue(themeHue) : hue
  return (
    <LevelPanel level={level} size="max" title={title} hue={code} onPromote={() => {}} onSetSize={() => {}}>
      <div className="wrTabPane">{children}</div>
    </LevelPanel>
  )
}

const TILES = [
  { id: 'schedule', title: 'Schedule', Icon: Icons.CalendarIcon },
  { id: 'checklist', title: 'Checklist', Icon: Icons.CheckboxIcon },
  { id: 'analytics', title: 'Analytics', Icon: Icons.BarChartIcon },
  { id: 'scratchpad', title: 'Scratchpad', Icon: Icons.PencilIcon },
  { id: 'help', title: 'Help', Icon: Icons.HelpIcon },
]
const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.'

function SplitGridCard() {
  return (
    <LevelFrame level="dash" title="Tiles on a split grid">
      <SplitArea
        gridId="design-system.split" label="Tiles"
        tiles={TILES.map(t => ({ ...t, children: <p className="wrMuted" style={{ opacity: 0.9 }}>{LOREM}</p> }))}
      />
    </LevelFrame>
  )
}

function ControlsCard() {
  const [seg, setSeg] = useState<'draft' | 'preview'>('draft')
  return (
    <LevelFrame level="project" title="Buttons, inputs and alerts" hue="project">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="wrLabel">Buttons</span>
        <div className="wrChipRow">
          <button type="button" className="wrSmallBtn">Small button</button>
          <button type="button" className="wrSmallBtn wrSmallBtn--accent">Accent button</button>
          <button type="button" className="wrSmallBtn" disabled>Disabled</button>
          <button type="button" className="wrIconBtn" aria-label="Write"><Icons.PencilIcon size={16} /></button>
          <span className="wrTabBar"><button type="button" className="wrTabBtn wrTabBtn--on" aria-label="Schedule"><Icons.CalendarIcon size={18} /></button><button type="button" className="wrTabBtn" aria-label="Checklist"><Icons.CheckboxIcon size={18} /></button></span>
          <span className="wrSegmented" role="group" aria-label="Chapter view">
            <button type="button" className={seg === 'draft' ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={() => setSeg('draft')}><Icons.PencilIcon size={16} /><span className="wrSegLabel">Draft</span></button>
            <button type="button" className={seg === 'preview' ? 'wrSegBtn wrSegBtn--active' : 'wrSegBtn'} onClick={() => setSeg('preview')}><Icons.EyeIcon size={16} /><span className="wrSegLabel">Preview</span></button>
          </span>
        </div>
        <span className="wrLabel">Inputs</span>
        <input className="wrField" aria-label="Field" placeholder="Field placeholder" defaultValue="" />
        <textarea className="wrField" aria-label="Notes" rows={2} defaultValue={LOREM} />
        <div className="wrChipRow"><span className="wrChip">Chip lorem</span><span className="wrChip wrChip--small">Chip ipsum</span></div>
        <span className="wrLabel">Alerts and hints</span>
        <p className="wrError">Save failed. Lorem ipsum dolor sit amet.</p>
        <p className="wrHint">Hint text: lorem ipsum dolor sit amet.</p>
        <p className="wrMuted">Muted text: lorem ipsum dolor sit amet.</p>
        <span className="wrLabel">Save, undo, redo and autosave</span>
        <div className="wrSaveDemo">
          <SaveCluster status={{ state: 'saved', dirty: false, saving: false, error: undefined, lastSavedAt: Date.UTC(2026, 0, 15, 15, 42) }} onSave={() => {}} buttonClassName="wrSmallBtn" />
          <SaveCluster
            status={{ state: 'unsaved', dirty: true, saving: false, error: undefined, lastSavedAt: null }} onSave={() => {}} buttonClassName="wrSmallBtn"
            history={{ canUndo: true, canRedo: true, onUndo: () => {}, onRedo: () => {} }}
            autosave={{ mode: 300, onChange: () => {}, nextSaveAt: Date.now() + 150_000, wait: 300_000 }}
          />
        </div>
      </div>
    </LevelFrame>
  )
}

function HueCard() {
  const [project, setProject] = useState(200)
  const [book, setBook] = useState(230)
  const [arc, setArc] = useState(260)
  const [chapter, setChapter] = useState(280)
  const [theme, setTheme] = useState(120)
  return (
    <LevelFrame level="outline" title="Hue slider and colour range" hue={book}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="wrLabel">The whole wheel, from 0: the project, no parent hue ({project}°)</span>
        <HueSlider label="Project colour" hue={project} centre={null} range={360} onChange={setProject} />
        <span className="wrLabel">A book, within 90° of the project ({book}°)</span>
        <HueSlider label="Book colour" hue={book} centre={project} range={90} onChange={setBook} />
        <span className="wrLabel">An arc, within 60° of its book ({arc}°)</span>
        <HueSlider label="Arc colour" hue={arc} centre={book} range={60} onChange={setArc} />
        <span className="wrLabel">A chapter, within 30° of its arc ({chapter}°)</span>
        <HueSlider label="Chapter colour" hue={chapter} centre={arc} range={30} onChange={setChapter} />
        <span className="wrLabel">Colour range (the theme editor: hue 0 to 360)</span>
        <ColorRange label="Hue" value={theme} onChange={setTheme} sat={30} light={50} />
      </div>
    </LevelFrame>
  )
}

const bar = (done: number, total: number) => ({ done, total })
// Sample bars for the shelf card: one book part-way, one barely begun, with the second book's planning complete.
const SHELF_PROGRESS = {
  [FIXTURE_IDS.book]: { plotting: bar(3, 4), outlining: bar(5, 5), planning: bar(2, 4), assignment: bar(6, 12), revision: bar(1, 5), published: bar(0, 5), words: bar(42000, 80000) },
  [FIXTURE_IDS.otherBook]: { plotting: bar(1, 4), outlining: bar(2, 5), planning: bar(4, 4), assignment: bar(0, 0), revision: bar(0, 0), published: bar(0, 0), words: bar(3000, 60000) },
}

function ShelfCard() {
  const nodes = [...createMockBackend().projects.values()][0].outline.nodes
  const [active, setActive] = useState<string | null>(FIXTURE_IDS.book)
  return (
    <LevelFrame level="dash" title="Book shelf">
      <Shelf label="Lorem ipsum project" meta="2 books" groups={shelfGroups(nodes)} progress={SHELF_PROGRESS} activeBookId={active} onOpenBook={setActive} onOpen={() => {}} />
    </LevelFrame>
  )
}

function PlotpointsCard() {
  return (
    <WithWorkspace>
      {w => {
        const points = w.plotNodes.filter(n => n.kind === 'plotpoint')
        return (
          <LevelFrame level="project" title="Plotpoints" hue="project">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
              <PlotTray w={w} />
              <span className="wrLabel">Placed on a moment</span>
              {points.flatMap(p => (p.placements ?? []).map((placement, i, all) => (
                <PlotpointTile key={placement.id} w={w} point={p} placement={placement} variant="placed" position={{ n: i + 1, of: all.length }} onUnassign={() => {}} />
              )))}
              <span className="wrLabel">In the margin</span>
              {points.slice(0, 2).map(p => <PlotpointTile key={p.id} w={w} point={p} variant="margin" count={(p.placements ?? []).length} onUnassign={() => {}} />)}
            </div>
          </LevelFrame>
        )
      }}
    </WithWorkspace>
  )
}

// The plot presets page as it sits in the admin panel (Configuration > Plot, in the admin accent), or the Plot sidebar with its "+ Category" and
// "+ Preset" buttons (press + Preset to see the list), which offers the presets published on the page.
function PlotPresetsCard({ view }: { view: string }) {
  if (view === 'sidebar') {
    return (
      <WithWorkspace>
        {w => (
          <LevelFrame level="project" title="Plot" hue="project">
            <div style={{ maxWidth: 360 }}><PlotNav w={w} /></div>
          </LevelFrame>
        )}
      </WithWorkspace>
    )
  }
  return (
    <div className="aUI" style={{ position: 'relative', width: '100%', height: '100%', flex: '0 0 auto', ['--aui-w' as string]: '100%' }}>
      <div className="aUIPanel" style={{ height: '100%', overflow: 'auto', boxSizing: 'border-box', padding: 14 }}>
        <PlotPresetsConsole />
      </div>
    </div>
  )
}

function IconsCard() {
  const icons = Object.entries(Icons).filter(([name, v]) => /Icon$/.test(name) && typeof v === 'function' && name !== 'ReactionHeartIcon')
  return (
    <LevelFrame level="dash" title="Icons">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
        <span className="wrLabel">Reactions: like 1-3, dislike 1-3</span>
        <div className="wrChipRow" style={{ gap: 14 }}>
          {([1, 2, 3] as const).map(l => <ReactionHeartIcon key={`l${l}`} kind="like" level={l} size={32} />)}
          {([1, 2, 3] as const).map(l => <ReactionHeartIcon key={`d${l}`} kind="dislike" level={l} size={32} />)}
        </div>
        <span className="wrLabel">{icons.length} icons</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 10 }}>
          {icons.map(([name, Icon]) => {
            const I = Icon as (props: { size?: number }) => ReactNode
            return (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10, textAlign: 'center' }}>
                <I size={24} /><span>{name.replace(/Icon$/, '')}</span>
              </div>
            )
          })}
        </div>
      </div>
    </LevelFrame>
  )
}

// The account's saved theme in a preview is the one in mockBackend.ts, with every time of day on (the store is not loaded from the mock backend here).
function useFourZones() {
  useEffect(() => { setAccountTheme(previewTheme()) }, [])
}

function ThemeSettingsCard() {
  useFourZones()
  return <div className="uiPvPanel" style={{ flex: '1 1 auto', overflow: 'auto', padding: 12 }}><ThemeSettingsPanel /></div>
}

// The Reader at a page, or one of its dialogs standing over it (the real RUI, run against the mock library).
const READER_PATHS: Record<string, string> = { nook: '/read', library: '/read/library', catalog: '/read/library/catalog', book: '/read/book/lorem-ipsum/cover', pages: '/read/book/lorem-ipsum/pages/3', face: '/read/book/lorem-ipsum/face', card: '/read/book/lorem-ipsum/card', delta: '/read/book/sit-amet/cover' }
function ReaderDialogHost({ kind }: { kind: 'plan' | 'borrow' | 'review' }) {
  const data = useReader()
  useEffect(() => { void loadReader() }, [])
  const book = data.bookById(kind === 'review' ? 'lorem-ipsum' : 'consectetur')
  const ctx: ReaderCtx = { data, today: new Date().toISOString().slice(0, 10), openBook: () => {}, openLibrary: () => {}, openPages: () => {}, borrow: () => {}, openPlan: () => {}, review: () => {} }
  return (
    <main className="rUI wr rdRoot">
      {data.status === 'ready' && kind === 'plan' && <PlanDialog ctx={ctx} onClose={() => {}} />}
      {data.status === 'ready' && kind === 'borrow' && book && <BorrowDialog ctx={ctx} book={book} onClose={() => {}} />}
      {data.status === 'ready' && kind === 'review' && book && <ReviewDialog ctx={ctx} book={book} onClose={() => {}} />}
    </main>
  )
}
function ReaderCard({ view }: { view: string }) {
  return (
    <div className="uiPvReader">
      {view === 'plan' || view === 'borrow' || view === 'review'
        ? <ReaderDialogHost kind={view} />
        : <MemoryRouter key={view} initialEntries={[READER_PATHS[view] ?? '/read']}><RUI /></MemoryRouter>}
    </div>
  )
}

function SkyCard() {
  useFourZones()
  return (
    <div className="header" style={{ position: 'static', display: 'flex', justifyContent: 'center', alignItems: 'center', height: 70 }}>
      <SkyToggle />
    </div>
  )
}

// ---------------------------------------------------------------- the registry

const WRITER_VIEWS = [{ id: 'dash', label: 'Dash' }, { id: 'project', label: 'Project' }, { id: 'book', label: 'Outline' }, { id: 'chapter', label: 'Draft' }, { id: 'preview', label: 'Preview' }]

const READER_VIEWS = [{ id: 'nook', label: 'Nook' }, { id: 'library', label: 'Library' }, { id: 'catalog', label: 'Catalog' }, { id: 'book', label: 'Book' }, { id: 'face', label: 'Bookface' }, { id: 'card', label: 'Bookcard' }, { id: 'delta', label: 'Delta invite' }, { id: 'pages', label: 'Pages' }, { id: 'plan', label: 'Plan' }, { id: 'borrow', label: 'Borrow' }, { id: 'review', label: 'Review' }]

const META = new Map(CARD_META.map(m => [m.id, m]))
const card = (id: string, rest: Omit<CardDef, 'id' | 'title' | 'group' | 'summary' | 'height'>): CardDef => {
  const m = META.get(id)
  if (!m) throw new Error(`No card meta for ${id}`)
  return { id, title: m.title, group: m.group, summary: m.summary, height: m.height, ...rest }
}

export const CARDS: CardDef[] = [
  card('level-panels', { views: WRITER_VIEWS, defaults: { view: 'project', zones: ['day'] }, render: ({ view }) => <PreviewWriter key={view} view={view as WriterView} /> }),
  card('split-tiles', { frame: 'writer', render: () => <SplitGridCard /> }),
  card('dashboard', { defaults: { zones: ['day'] }, render: writerCard('dash') }),
  card('book-cover', { defaults: { zones: ['day'] }, render: writerCard('book') }),
  card('outline-cards', { defaults: { zones: ['day'] }, render: writerCard('book') }),
  card('plotpoint-tiles', { defaults: { zones: ['day'] }, render: () => <PlotpointsCard /> }),
  card('plot-presets', { frame: 'plain', views: [{ id: 'admin', label: 'Admin page' }, { id: 'sidebar', label: 'Plot sidebar' }], defaults: { view: 'admin', zones: ['day', 'night'], width: 1200 }, render: ({ view }) => <PlotPresetsCard key={view} view={view} /> }),
  card('shelf', { defaults: { zones: ['day', 'night'] }, render: () => <ShelfCard /> }),
  card('draft-page', { views: WRITER_VIEWS.slice(3), defaults: { view: 'chapter', zones: ['day'] }, render: ({ view }) => <PreviewWriter key={view} view={view as WriterView} /> }),
  card('controls', { defaults: { zones: ['day', 'night'] }, render: () => <ControlsCard /> }),
  card('hue-slider', { defaults: { zones: ['day', 'night'] }, render: () => <HueCard /> }),
  card('reader', { frame: 'plain', views: READER_VIEWS, defaults: { view: 'nook', zones: ['day', 'night'], width: 1200 }, render: ({ view }) => <ReaderCard view={view} /> }),
  card('app-shell', { frame: 'plain', defaults: { zones: ['day'], width: 1200 }, render: () => <MemoryRouter initialEntries={['/write']}><App /></MemoryRouter> }),
  card('sky-toggle', { frame: 'plain', defaults: { zones: ['dawn', 'day', 'dusk', 'night'], width: 400 }, render: () => <SkyCard /> }),
  card('theme-settings', { frame: 'plain', defaults: { zones: ['day'], width: 800 }, render: () => <ThemeSettingsCard /> }),
  card('icons', { defaults: { zones: ['day', 'night'] }, render: () => <IconsCard /> }),
]

export function ensureBackend(): void {
  installMockBackend()
  // Open the tabs the cards talk about: the Project level on its Plot, the Dash with its tiles.
  setKv('scriblr.writer.levelSizes', {})
  // The Plot contents with the full descriptions shown (the alert-lit circle on), as the Plot presets page describes them.
  setKv('scriblr.writer.plotNavDescriptions', true)
}
