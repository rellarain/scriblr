import { useEffect, useId, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { SaveCluster } from '../../../../components/SaveCluster'
import type { SaveStatus } from '../../../../lib/useAutosave'
import { beginPointerDrag, dragJustEnded, zoneRef, type DropZone } from '../../../../lib/pointerDrag'
import type { AutosaveMode } from '../../../../theme/types'
import SideResizer from '../../writer/levels/SideResizer'
import {
  BackIcon, BodyIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, FitIcon, FocusIcon, FrontIcon, GridLinesIcon, MannequinIcon, PathIcon, PolygonIcon, RedoIcon, RulerIcon, StampIcon, SwapIcon, UndoIcon, WeightIcon, WrenchIcon,
  type IconProps,
} from '../../../icons'
import { isShown, layerInfo, moveLayer, nudgeLayer, toggleLayer, type LayerId, type LayerState } from './layerStack'
import type { ViewName } from './rigActions'
import { ZOOM_MAX, ZOOM_MIN, sliderToZoom, wheelZoom, zoomText, zoomToSlider } from './zoomMap'

// The edges of the Designer: the console toolbar (undo, redo, save, publish), the view toolbar (the canvas layers, the view, the zoom) and the panels on the left (the tree) and
// the right (the editor), which can be dragged wider or narrower and folded away. The canvas lies under all four.

// ---- the console toolbar ----

export interface ConsoleBarProps {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  saveStatus: SaveStatus
  onSave: () => void
  autosave: { mode: AutosaveMode; onChange: (mode: AutosaveMode) => void; nextSaveAt: number | null; wait: number | null }
  onPublish: () => void
  // Why Publish cannot be pressed now (the checks, or nothing to publish), or null when it can.
  publishBlocked: string | null
  busy: boolean
  // The switch for the advanced tools (Rig, Fields, Proportions, Frames), in a writer's designer; the admin's has every tool and no switch.
  advanced?: { on: boolean; onToggle: () => void }
}

export function ConsoleBar(p: ConsoleBarProps) {
  return (
    <div className="dzConsoleBar" role="toolbar" aria-label="Console tools">
      <button type="button" className="cmIconBtn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo}><UndoIcon size={14} /></button>
      <button type="button" className="cmIconBtn" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo}><RedoIcon size={14} /></button>
      <SaveCluster status={p.saveStatus} onSave={p.onSave} scope=".dzConsole" autosave={p.autosave} />
      {p.advanced && (
        <button
          type="button" className={`cmIconBtn${p.advanced.on ? ' cmIconBtn--on' : ''}`} aria-label="Show advanced tools" aria-pressed={p.advanced.on}
          title="Show advanced tools: the Rig, Fields, Proportions and Frames tabs, for models that need them" onClick={p.advanced.onToggle}
        ><WrenchIcon size={14} /></button>
      )}
      <button type="button" className="cmBtn cmBtn--primary" disabled={!!p.publishBlocked || p.busy} title={p.publishBlocked ?? 'Publish this draft as the next version'} onClick={p.onPublish}><CheckIcon size={12} /> Publish</button>
    </div>
  )
}

// ---- the view toolbar ----

const LAYER_ICONS: Record<LayerId, ComponentType<IconProps>> = {
  weights: WeightIcon, points: PolygonIcon, outlines: PathIcon, pivots: FocusIcon, guides: RulerIcon, mirror: SwapIcon, ghost: StampIcon, figure: MannequinIcon, gridlines: GridLinesIcon, heads: BodyIcon,
}

// Reordering a row of toggles by dragging them sideways: the pointer's place in the row says which toggle the dragged one goes before (null: last).
function useRowDrag(onMove: (id: LayerId, before: LayerId | null) => void) {
  const kind = `layer-row:${useId()}`
  const row = useRef<HTMLElement | null>(null)
  const [dragId, setDragId] = useState<LayerId | null>(null)
  const [before, setBefore] = useState<LayerId | null | undefined>(undefined)
  const beforeAt = (x: number): LayerId | null => {
    const kids = Array.from(row.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ?? [])
    for (const k of kids) {
      const id = k.dataset.layerId as LayerId
      if (id === dragId) continue
      const r = k.getBoundingClientRect()
      if (x < r.left + r.width / 2) return id
    }
    return null
  }
  const zone: DropZone = {
    over: x => setBefore(beforeAt(x)),
    leave: () => setBefore(undefined),
    drop: x => {
      const at = beforeAt(x)
      const moving = dragId
      setBefore(undefined); setDragId(null)
      if (moving) onMove(moving, at)
    },
  }
  const register = zoneRef(kind, zone)
  return {
    dragId, before,
    listRef: (el: HTMLElement | null) => { row.current = el; register(el) },
    press: (id: LayerId) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      beginPointerDrag({ kind, source: e.currentTarget, event: e, onStart: () => setDragId(id), onEnd: () => { setDragId(null); setBefore(undefined) } })
    },
  }
}

export interface ViewBarProps {
  layers: LayerState
  onLayers: (next: LayerState) => void
  view: ViewName
  onView: (view: ViewName) => void
  viewOff: boolean
  fitAll: boolean
  onFit: () => void
  zoom: number
  onZoom: (zoom: number) => void
  drawerOpen: boolean
  onDrawer: () => void
  checks: number
  // A word about a layer that cannot draw yet (the head units with no head bone), added to its toggle's title.
  layerNotes?: Partial<Record<LayerId, string>>
}

export function ViewBar(p: ViewBarProps) {
  const drag = useRowDrag((id, before) => p.onLayers(moveLayer(p.layers, id, before)))
  const zoomRef = useRef(p.zoom)
  zoomRef.current = p.zoom
  const zoomBox = useRef<HTMLSpanElement>(null)
  const onZoom = useRef(p.onZoom)
  onZoom.current = p.onZoom
  // The wheel over the zoom slider zooms in when it scrolls down and out when it scrolls up (a non-passive listener, so the page does not scroll as well).
  useEffect(() => {
    const el = zoomBox.current
    if (!el) return
    const wheel = (e: WheelEvent) => { e.preventDefault(); onZoom.current(wheelZoom(zoomRef.current, e.deltaY)) }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const last = p.layers.order[p.layers.order.length - 1]
  return (
    <div className="dzViewBar" role="toolbar" aria-label="View controls">
      <div className="dzLayers" role="group" aria-label="Canvas layers (the leftmost is drawn on top)" ref={drag.listRef}>
        {p.layers.order.map(id => {
          const info = layerInfo(id), Icon = LAYER_ICONS[id], on = isShown(p.layers, id)
          return (
            <button
              key={id} type="button" data-layer-id={id}
              className={`cmIconBtn dzLayer${on ? ' cmIconBtn--on' : ''}${drag.dragId === id ? ' dzLayer--lifted' : ''}${drag.before === id ? ' dzLayer--before' : ''}${drag.before === null && drag.dragId !== null && last === id ? ' dzLayer--after' : ''}${info.fixed ? ' dzLayer--fixed' : ''}`}
              aria-label={info.name} aria-pressed={on}
              title={`${info.name}: ${info.hint}. ${p.layerNotes?.[id] ? `${p.layerNotes[id]} ` : ''}${info.fixed ? 'Drag to move it' : 'Click to hide or show it; drag to move it'} (the leftmost is drawn on top; Alt+Left and Alt+Right move it too).`}
              onPointerDown={drag.press(id)}
              onClick={() => { if (dragJustEnded()) return; p.onLayers(toggleLayer(p.layers, id)) }}
              onKeyDown={e => {
                if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
                e.preventDefault()
                p.onLayers(nudgeLayer(p.layers, id, e.key === 'ArrowLeft' ? -1 : 1))
              }}
            ><Icon size={14} /></button>
          )
        })}
      </div>
      <span className="cmSep" aria-hidden="true" />
      <button type="button" className={`cmIconBtn${p.view === 'front' ? ' cmIconBtn--on' : ''}`} aria-label="Front view" title="Front view" aria-pressed={p.view === 'front'} disabled={p.viewOff} onClick={() => p.onView('front')}><FrontIcon size={14} /></button>
      <button type="button" className={`cmIconBtn${p.view === 'back' ? ' cmIconBtn--on' : ''}`} aria-label="Back view" title="Back view: the figure turned round" aria-pressed={p.view === 'back'} disabled={p.viewOff} onClick={() => p.onView('back')}><BackIcon size={14} /></button>
      <span className="cmSpacer" />
      <button
        type="button" className={`cmIconBtn${p.fitAll ? ' cmIconBtn--on' : ''}`} aria-label="Fit to screen" aria-pressed={p.fitAll}
        title="Fit everything that is drawn to the screen, with little blank space (press again to fit the selection instead)" onClick={p.onFit}
      ><FitIcon size={14} /></button>
      <span className="dzZoom" ref={zoomBox}>
        <input
          type="range" min={0} max={1} step={0.005} value={zoomToSlider(p.zoom)} aria-label="Zoom" aria-valuetext={zoomText(p.zoom)}
          title={`Zoom (${Math.round(ZOOM_MIN * 100)}% to ${Math.round(ZOOM_MAX * 100)}%): scroll down over it to zoom in, up to zoom out`}
          onChange={e => p.onZoom(sliderToZoom(Number(e.target.value)))}
        />
        <output aria-hidden="true">{zoomText(p.zoom)}</output>
      </span>
      <span className="cmSep" aria-hidden="true" />
      <button
        type="button" className={`cmBtn cmBtn--small${p.drawerOpen ? ' dzDrawerBtn--on' : ''}`} aria-expanded={p.drawerOpen} aria-controls="dz-drawer"
        title="Previews of how the model holds up at random sizes, and the checks it has to pass to be published" onClick={p.onDrawer}
      >{p.drawerOpen ? <ChevronDownIcon size={12} /> : <ChevronUpIcon size={12} />} Previews and checks{p.checks > 0 ? ` (${p.checks})` : ''}</button>
    </div>
  )
}

// ---- the side panels ----

export const PANEL_REST = 34
export interface PanelState { open: boolean; w: number }

export function ToolbarPanel({ side, title, label, state, min, max, onOpen, onWidth, children }: {
  side: 'left' | 'right'
  title: string
  label: string
  state: PanelState
  min: number
  max: number
  onOpen: (open: boolean) => void
  // The width while it is dragged, then settled.
  onWidth: (w: number, settled: boolean) => void
  children: ReactNode
}) {
  const Fold = side === 'left' ? ChevronLeftIcon : ChevronRightIcon, Unfold = side === 'left' ? ChevronRightIcon : ChevronLeftIcon
  if (!state.open) {
    return (
      <aside className={`dzSide dzSide--${side} dzSide--shut`} aria-label={label} style={{ width: PANEL_REST }}>
        <button type="button" className="cmIconBtn" aria-label={`Open the ${title}`} title={`Open the ${title}`} aria-expanded={false} onClick={() => onOpen(true)}><Unfold size={14} /></button>
        <span className="dzSideRest" aria-hidden="true">{title}</span>
      </aside>
    )
  }
  return (
    <aside className={`dzSide dzSide--${side}`} aria-label={label} style={{ width: state.w }}>
      <div className="dzSideHead">
        <h3 className="dzSideTitle">{title}</h3>
        <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Fold the ${title}`} title={`Fold the ${title} away`} aria-expanded onClick={() => onOpen(false)}><Fold size={12} /></button>
      </div>
      <div className="dzSideBody">{children}</div>
      <SideResizer
        edge={side === 'right' ? 'left' : 'right'} className="dzResizer" label={`${title} width`} what={`the ${title}`} value={state.w} keyStep={16}
        clamp={(w, container) => Math.round(Math.min(container > 0 ? Math.min(max, container * 0.45) : max, Math.max(min, w)))}
        onDrag={w => onWidth(w, false)} onCommit={w => onWidth(w, true)}
      />
    </aside>
  )
}
