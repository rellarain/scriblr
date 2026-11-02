import { useRef, useState, type ComponentType, type ReactNode } from 'react'
import { SearchIcon, type IconProps } from '../../../icons'
import { useStoredState } from '../storage'
import SplitArea, { columnsTree } from '../SplitArea'
import { dragJustEnded, startBarDrag } from '../../../../components/tiles/tileDragBus'
import { moveTab, orderTabs } from '../../../../components/tiles/tabOrder'

// What a tab's content is told: the header's search text. (The header has no New button: a tab adds things from its own body.)
// `titleSlot` is, for a tab that asks for one (`titleSlot: true`), the element at the right end of its tile's title bar, for what the tab puts there
// (null until it is drawn); it is undefined for a tab that has none, and at Mid (the tab has no tile title bar there, so a console draws its own bar above its tiles).
export interface TabContext { query: string; size: 'mid' | 'max'; titleSlot?: HTMLElement | null }

export interface LevelTab {
  id: string
  label: string
  Icon: ComponentType<IconProps>
  render: (ctx: TabContext) => ReactNode
  // The header's search box filters this tab.
  searchable?: boolean
  // The tab shows an editor on a light surface of the level's hue, in the ink colour (not the level's own on-accent text). A `fill` tab is on a surface
  // unless it says `surface: false` (the Schedule console is on the level's own fill, like the other consoles).
  surface?: boolean
  // The size of the grip and the icon in the tab's tile title bar (13 and 14 when not given).
  iconSize?: number
  // The tab's tile has a slot at the right end of its title bar (TabContext.titleSlot), where the tab puts its own controls.
  titleSlot?: boolean
  // The tab's tile takes the height that is left (an editor that scrolls itself) instead of the height of its content.
  fill?: boolean
  // The tab is a console of tiles: at Mid (the level beside the focused one) it is the same console, in one column, in a pane of its own height.
  console?: boolean
  // Starts the closing group of tabs (Settings, Help), set a little apart.
  end?: boolean
}

// The tabs of a level and what they show. At Mid one tab at a time, in one column; at Max each tab is the
// minimised form of a tile, clicking it opens or closes that tile, and the open tiles are laid out on a split
// grid the user rearranges (drag a title bar to move a tile, a divider to resize).
// The tab strip and quick actions (New, Search, Save) go in the level's header; the body is the tiles.
export function useTabbedLevel({ storageKey, tabs, size, defaultOpen, defaultTab, save, flush, customMax = false }: {
  storageKey: string
  tabs: LevelTab[]
  size: 'min' | 'mid' | 'max'
  defaultOpen: string[]
  // The tab that is current at first (the first one when not given).
  defaultTab?: string
  // The quick actions' last item (the Save component). A function is told the focused tab: the tile the pointer or keyboard was last in
  // (at Max), else the current tab, so Undo and Redo can act on it.
  save?: ReactNode | ((focusedTab: string | undefined) => ReactNode)
  // Called when another tab is picked (leaving the tab saves what is waiting).
  flush?: () => void
  // The level lays its Max tiles out itself, by `isOpen`; no two-column body is made.
  customMax?: boolean
}): { headerExtras: ReactNode; body: ReactNode; isOpen: (id: string) => boolean } {
  const [active, setActive] = useStoredState<string>(`${storageKey}.tab`, defaultTab ?? tabs[0].id)
  const [open, setOpen] = useStoredState<string[]>(`${storageKey}.open`, defaultOpen)
  // The order of the tab icons, when the user has dragged one (at Max).
  const [order, setOrder] = useStoredState<string[]>(`${storageKey}.order`, [])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [focusedTile, setFocusedTile] = useState<string | undefined>(undefined)
  // The title-bar slots of the tabs that ask for one: a callback ref for each (kept, so it is not called again on every render).
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({})
  const slotRefs = useRef<Record<string, (el: HTMLElement | null) => void>>({})
  const slotRef = (id: string) => (slotRefs.current[id] ??= el => setSlots(prev => (prev[id] === el ? prev : { ...prev, [id]: el })))

  if (size === 'min') return { headerExtras: null, body: null, isOpen: () => false }

  const max = size === 'max'
  const shown = tabs.filter(t => open.includes(t.id))
  const known = (id: string) => tabs.some(t => t.id === id)
  const current = max
    ? (shown.find(t => t.id === active) ?? shown[0])
    : (tabs.find(t => t.id === active && known(active)) ?? tabs[0])

  function pick(id: string) {
    if (dragJustEnded()) return
    flush?.()
    setActive(id)
    setFocusedTile(id)
    if (max) setOpen(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }
  const focused = max && focusedTile && shown.some(t => t.id === focusedTile) ? focusedTile : current?.id
  const ctxOf = (tab: LevelTab): TabContext => ({ query: query.trim().toLowerCase(), size: max ? 'max' : 'mid', ...(max && tab.titleSlot ? { titleSlot: slots[tab.id] ?? null } : {}) })

  const headerExtras = (
    <div className="wrHeaderExtras">
      {/* At Max the bar is where a tile is dropped to minimize it, and the icons are dragged out to put a tile back (TileArea.tsx). */}
      <div className="wrTabBar" role="toolbar" aria-label="Tabs" data-tile-bar={max ? storageKey : undefined}>
        {orderTabs(tabs.map(t => t.id), order).map(id => tabs.find(t => t.id === id)!).map(t => {
          const on = max ? open.includes(t.id) : current?.id === t.id
          return (
            <button
              key={t.id} type="button" data-tab-id={t.id} className={`wrTabBtn${on ? ' wrTabBtn--on' : ''}${t.end ? ' wrTabBtn--end' : ''}`}
              aria-label={t.label} title={t.label} aria-pressed={on} onClick={() => pick(t.id)}
              onPointerDown={max ? e => { if (e.button === 0) startBarDrag(storageKey, t.id, e) } : undefined}
            >
              <t.Icon size={18} />
            </button>
          )
        })}
      </div>
      <div className="wrQuickActions">
        {searching && current?.searchable && (
          <input className="wrQuickSearch" aria-label="Search" placeholder="Search" value={query} autoFocus onChange={e => setQuery(e.target.value)} />
        )}
        {current?.searchable && (
          <button
            type="button" className={`wrTabBtn${searching ? ' wrTabBtn--on' : ''}`} aria-label="Search this tab" title="Search" aria-pressed={searching}
            onClick={() => { setSearching(s => !s); setQuery('') }}
          >
            <SearchIcon size={18} />
          </button>
        )}
        {typeof save === 'function' ? save(focused) : save}
      </div>
    </div>
  )

  let body: ReactNode
  if (!max) {
    body = current
      ? <div className={`wrTabPane${current.surface ?? current.fill ? ' wrTabPane--surface' : ''}${current.console ? ' wrTabPane--console' : ''}`} role="region" aria-label={current.label}>{current.render(ctxOf(current))}</div>
      : null
  } else if (customMax) {
    body = null
  } else {
    // The tiles on a split grid: drag a title bar to move a tile, a divider to resize (TileArea.tsx). A closed tab is a minimized tile: it keeps its slot.
    body = shown.length === 0
      ? <p className="wrMuted">Pick a tab above to open it.</p>
      : (
        <SplitArea
          gridId={storageKey} label="Tiles" defaultTree={columnsTree(shown.map(t => t.id))} onFocusTile={setFocusedTile}
          minimized={tabs.filter(t => !open.includes(t.id)).map(t => t.id)}
          onReorderTabs={(id, beforeId) => setOrder(moveTab(orderTabs(tabs.map(t => t.id), order), id, beforeId))}
          onMinimizedChange={(id, minimized) => setOpen(prev => (minimized ? prev.filter(x => x !== id) : prev.includes(id) ? prev : [...prev, id]))}
          tiles={tabs.map(t => ({
            id: t.id, title: t.label, Icon: t.Icon, children: open.includes(t.id) ? t.render(ctxOf(t)) : null,
            titleExtras: t.titleSlot ? <span ref={slotRef(t.id)} className="wrTabTileTitleSlot" /> : undefined,
            iconSize: t.iconSize,
            bodyClassName: [(t.surface ?? t.fill) ? 'wrTabTileBody--surface' : '', t.fill ? 'wrTabTileBody--fill' : ''].filter(Boolean).join(' ') || undefined,
          }))}
        />
      )
  }

  return { headerExtras, body, isOpen: id => (max ? open.includes(id) : current?.id === id) }
}
