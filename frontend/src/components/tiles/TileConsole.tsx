import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeftIcon } from '../../assets/icons'
import ConsoleCorner from './ConsoleCorner'
import TileGrid, { type CornerPanel, type Crumb } from './TileGrid'
import type { Box } from './tileNav'
import type { TileDef } from './tileTypes'

const CLOSE_MS = 260

const canAnimate = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

// A tile expanded into its console: it grows from the tile's own place to fill the
// grid's area. At the top are a back button and the breadcrumb, then a row of mini
// tiles for switching to another tile without going back; Settings and Help sit at
// the bottom right. A tile with child tiles shows them as a grid that can expand in
// turn; otherwise the tile's own editor fills the body.
function TileConsole({ gridId, tile, siblings, crumbs, from, initialPanel = null, maximized = false, onToggleMaximize, onSwitch, onClose }: {
  gridId: string
  tile: TileDef
  siblings: TileDef[]
  crumbs: Crumb[]
  // Where the tile was (in this area's coordinates), to grow from and shrink back to.
  from: Box | null
  // The Settings or Help panel to start with open.
  initialPanel?: CornerPanel | null
  // Double-clicking the header toggles this (only offered where the caller passed
  // `onToggleMaximize` -- the Writer hides its sidebar; other panels don't wire it up yet).
  maximized?: boolean
  onToggleMaximize?: () => void
  onSwitch: (id: string) => void
  onClose: () => void
}) {
  const [box, setBox] = useState<Box | null>(from)
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const rootRef = useRef<HTMLDivElement>(null)
  const animated = from !== null && canAnimate()

  // Grow to full size on the next frame.
  useLayoutEffect(() => {
    if (!animated) { setBox(null); return }
    const frame = requestAnimationFrame(() => setBox(null))
    return () => cancelAnimationFrame(frame)
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  // Focus moves into the console, so Escape and the other keys reach it (and a nested console before its parent).
  useEffect(() => { rootRef.current?.focus({ preventScroll: true }) }, [tile.id])

  function close() {
    if (!animated || !from || closing) { onClose(); return }
    setClosing(true)
    setBox(from)
    timer.current = setTimeout(onClose, CLOSE_MS)
  }

  const style: CSSProperties = box
    ? { left: box.left, top: box.top, width: box.width, height: box.height, opacity: 0.5 }
    : { left: 0, top: 0, width: '100%', height: '100%', opacity: 1 }

  const pieces = [...crumbs, { label: tile.title }]
  return (
    <div
      ref={rootRef} tabIndex={-1}
      className={animated ? 'tileConsole tileConsole--animated' : 'tileConsole'} style={style}
      role="region" aria-label={tile.title} data-maximized={maximized || undefined}
      onKeyDown={e => {
        const target = e.target as HTMLElement
        if (e.key === 'Escape') { e.stopPropagation(); close() }
        const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
        if ((e.key === '[' || e.key === ']') && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) {
          const i = siblings.findIndex(s => s.id === tile.id)
          const next = siblings[i + (e.key === ']' ? 1 : -1)]
          if (next) { e.stopPropagation(); onSwitch(next.id) }
        }
      }}
    >
      <div className="tcHead" onDoubleClick={onToggleMaximize}>
        <button type="button" className="tcBack" onClick={close} aria-label="Back to tiles">
          <ChevronLeftIcon size={14} /> Back
        </button>
        <nav className="tcCrumbs" aria-label="Breadcrumb">
          {pieces.map((c, i) => {
            const last = i === pieces.length - 1
            return (
              <span key={i} className="tcCrumb">
                {c.onClick && !last
                  ? <button type="button" className="tcCrumbLink" onClick={c.onClick}>{c.label}</button>
                  : <span className={last ? 'tcCrumbHere' : undefined} aria-current={last ? 'page' : undefined}>{c.label}</span>}
                {!last && <span aria-hidden="true"> › </span>}
              </span>
            )
          })}
        </nav>
      </div>

      {siblings.length > 1 && (
        <div className="tcStrip" role="tablist" aria-label="Tiles">
          {siblings.map(s => (
            <button
              key={s.id} type="button" role="tab" aria-selected={s.id === tile.id}
              className={s.id === tile.id ? 'tcChip tcChip--on' : 'tcChip'} onClick={() => onSwitch(s.id)}
            >
              <s.Icon size={14} /> {s.title}
            </button>
          ))}
        </div>
      )}

      {/* The Settings and Help panel covers just the body, so Back and the strip stay in reach. */}
      <div className="tcMain">
        <div className="tcBody">
          {tile.children
            ? <TileGrid key={tile.id} gridId={`${gridId}.${tile.id}`} tiles={tile.children} crumbs={pieces} />
            : tile.console?.()}
        </div>
        <ConsoleCorner key={tile.id} initial={initialPanel} settings={tile.settings} help={tile.help} />
      </div>
    </div>
  )
}

export default TileConsole
