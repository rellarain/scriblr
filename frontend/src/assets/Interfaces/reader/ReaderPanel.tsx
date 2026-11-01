import type { ComponentType, ReactNode } from 'react'
import TileArea, { type AreaTile } from '../../../components/tiles/TileArea'
import TileTabBar from '../../../components/tiles/TileTabBar'
import type { SplitNode } from '../../../components/tiles/splitTree'
import type { IconProps } from '../../icons'
import { grow, shrink, toggleIcon, type ConsoleState, type ConsoleStates } from './consoleStates'

// One Reader page: a header with the page's title and the tab bar of its consoles, then the consoles as the global tile
// (components/tiles/TileArea.tsx): an icon in the bar is a minimized console, an open one is a tile, and the title bar's
// Maximize button makes one the full console (the others become icons).

export interface ConsoleDef {
  id: string
  label: string
  Icon: ComponentType<IconProps>
  render: (size: Exclude<ConsoleState, 'min'>) => ReactNode
  // Takes the whole row of the grid (the e-reader's page).
  wide?: boolean
}

interface ReaderPanelProps {
  // Names where the page's tiles are remembered.
  gridId: string
  title: string
  Icon: ComponentType<IconProps>
  // The level's fill (a CSS colour); white text is on it.
  color: string
  consoles: ConsoleDef[]
  states: ConsoleStates
  onStates: (next: ConsoleStates) => void
  right?: ReactNode
  // Shown above the consoles (a badge, a notice).
  notice?: ReactNode
  // Edge tabs down the panel's right edge.
  edge?: ReactNode
  className?: string
}

// Where the consoles sit until one is moved: two to a row, a wide console (the e-reader's page) on a row of its own.
function rowsTree(consoles: ConsoleDef[]): SplitNode {
  const rows: string[][] = []
  for (const c of consoles) {
    const last = rows[rows.length - 1]
    if (c.wide || !last || last.length === 2 || consoles.find(x => x.id === last[0])?.wide) rows.push([c.id])
    else last.push(c.id)
  }
  const row = (ids: string[]): SplitNode => (ids.length === 1 ? { id: ids[0] } : { dir: 'row', ratio: 0.5, a: { id: ids[0] }, b: { id: ids[1] } })
  const stack = (list: string[][]): SplitNode => (list.length === 1 ? row(list[0]) : { dir: 'col', ratio: 1 / list.length, a: row(list[0]), b: stack(list.slice(1)) })
  return stack(rows)
}

export function ReaderPanel({ gridId, title, Icon, color, consoles, states, onStates, right, notice, edge, className }: ReaderPanelProps) {
  const isOpen = (id: string) => (states[id] ?? 'min') !== 'min'
  const full = consoles.find(c => states[c.id] === 'full')?.id ?? null
  const tiles: AreaTile[] = consoles.map(c => ({
    id: c.id, title: c.label, Icon: c.Icon, iconSize: 20, className: 'rdCon', bodyClassName: 'rdConBody', maximizable: true,
    children: isOpen(c.id) ? c.render(states[c.id] === 'full' ? 'full' : 'tile') : null,
  }))
  return (
    <section className={['rdLevel', edge ? 'rdLevel--edge' : '', className ?? ''].filter(Boolean).join(' ')} style={{ ['--rd-f' as string]: color }} aria-label={title}>
      {edge}
      <header className="rdLevelHead">
        <h2 className="rdLevelTitle"><Icon size={20} />{title}</h2>
        <div className="rdBar">
          <TileTabBar
            gridId={gridId} label={`${title} consoles`} size={20} isOpen={isOpen}
            tiles={consoles.map(c => ({ id: c.id, label: c.label, Icon: c.Icon }))}
            onToggle={id => onStates(toggleIcon(states, id))}
          />
        </div>
        <div className="rdLevelRight">{right}</div>
      </header>
      {notice}
      {consoles.every(c => !isOpen(c.id)) && <p className="rdEmpty">Every console is an icon. Open one from the bar above.</p>}
      <TileArea
        gridId={gridId} label={`${title} consoles`} tiles={tiles} iconSize={20} defaultTree={rowsTree(consoles)}
        minimized={consoles.filter(c => !isOpen(c.id)).map(c => c.id)}
        onMinimizedChange={(id, minimized) => onStates(minimized ? { ...states, [id]: 'min' } : toggleIcon(states, id))}
        maximized={full}
        onMaximizedChange={id => onStates(id ? grow(states, id) : shrink(states, full ?? ''))}
      />
    </section>
  )
}
