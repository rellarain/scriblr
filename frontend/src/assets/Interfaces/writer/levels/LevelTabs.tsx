import { useState, type ComponentType, type ReactNode } from 'react'
import { SearchIcon, type IconProps } from '../../../icons'
import { useStoredState } from '../storage'
import SplitArea, { columnsTree } from '../SplitArea'

// What a tab's content is told: the header's search text. (The header has no New button: a tab adds things from its own body.)
export interface TabContext { query: string; size: 'mid' | 'max' }

export interface LevelTab {
  id: string
  label: string
  Icon: ComponentType<IconProps>
  render: (ctx: TabContext) => ReactNode
  // The header's search box filters this tab.
  searchable?: boolean
  // The tab shows an editor on a light surface of the level's hue, in the ink colour (not the level's own on-accent text).
  surface?: boolean
  // The tab's tile takes the height that is left (an editor that scrolls itself) instead of the height of its content.
  fill?: boolean
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
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [focusedTile, setFocusedTile] = useState<string | undefined>(undefined)

  if (size === 'min') return { headerExtras: null, body: null, isOpen: () => false }

  const max = size === 'max'
  const shown = tabs.filter(t => open.includes(t.id))
  const known = (id: string) => tabs.some(t => t.id === id)
  const current = max
    ? (shown.find(t => t.id === active) ?? shown[0])
    : (tabs.find(t => t.id === active && known(active)) ?? tabs[0])

  function pick(id: string) {
    flush?.()
    setActive(id)
    setFocusedTile(id)
    if (max) setOpen(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }
  const focused = max && focusedTile && shown.some(t => t.id === focusedTile) ? focusedTile : current?.id
  const ctxOf = (_tab: LevelTab): TabContext => ({ query: query.trim().toLowerCase(), size: max ? 'max' : 'mid' })

  const headerExtras = (
    <div className="wrHeaderExtras">
      <div className="wrTabBar" role="toolbar" aria-label="Tabs">
        {tabs.map(t => {
          const on = max ? open.includes(t.id) : current?.id === t.id
          return (
            <button
              key={t.id} type="button" className={`wrTabBtn${on ? ' wrTabBtn--on' : ''}${t.end ? ' wrTabBtn--end' : ''}`}
              aria-label={t.label} title={t.label} aria-pressed={on} onClick={() => pick(t.id)}
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
      ? <div className={`wrTabPane${current.surface ?? current.fill ? ' wrTabPane--surface' : ''}`} role="region" aria-label={current.label}>{current.render(ctxOf(current))}</div>
      : null
  } else if (customMax) {
    body = null
  } else {
    // The open tiles on a split grid: drag a title bar to move a tile, a divider to resize (SplitArea.tsx).
    body = shown.length === 0
      ? <p className="wrMuted">Pick a tab above to open it.</p>
      : (
        <SplitArea
          gridId={storageKey} label="Tiles" defaultTree={columnsTree(shown.map(t => t.id))} onFocusTile={setFocusedTile}
          tiles={shown.map(t => ({
            id: t.id, title: t.label, Icon: t.Icon, children: t.render(ctxOf(t)),
            bodyClassName: t.fill ? 'wrTabTileBody--surface wrTabTileBody--fill' : t.surface ? 'wrTabTileBody--surface' : undefined,
          }))}
        />
      )
  }

  return { headerExtras, body, isOpen: id => (max ? open.includes(id) : current?.id === id) }
}
