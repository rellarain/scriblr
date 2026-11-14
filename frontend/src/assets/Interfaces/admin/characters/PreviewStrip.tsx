import { useMemo, useState, type CSSProperties } from 'react'
import { ANGLES, angleName, viewFor, type View } from './engine/angles'
import type { ModelContent } from '../../../../api/types'
import { DiceIcon } from '../../../icons'
import { shapesOf, showFor, type Selection } from './designerState'
import { framesOf, hiddenThrough, viewBoxOf } from './engine/frames'
import { drawable, paintDefs, paintShapes } from './engine/paint'
import { activeLocks } from './engine/locks'
import { previewSpecs, previewTransform, specState, type PreviewMode } from './engine/previews'
import type { Box } from './engine/geometry'
import { defaultValues, descendantsOf, solve } from './engine/rig'
import { TILE_DEFAULT, outlineSize } from './modelContent'
import { PaintDefs, PaintedPath, useSvgPrefix } from './PaintedPath'

// The always-on strip under the canvas: the selection (or, with nothing selected, the whole model) at random sizes, tilts and backgrounds, so the
// admin sees how it holds up. Re-roll draws a new set; Smallest and Largest are the stress previews (every value at the end of its range). Seen through a frame
// (phase 5a) the whole figure is cropped to the frame, without what the frame leaves out, on the card colour.
const SIZES = [{ id: 'S', px: 64 }, { id: 'M', px: 96 }, { id: 'L', px: 144 }] as const
const MODES: Array<{ id: PreviewMode; name: string }> = [{ id: 'rand', name: 'Random' }, { id: 'min', name: 'Smallest' }, { id: 'max', name: 'Largest' }]

export function PreviewStrip({ content, sel, view = 'front', tile = TILE_DEFAULT }: { content: ModelContent; sel: Selection; view?: View; tile?: string }) {
  const [seed, setSeed] = useState(1)
  const [frameId, setFrameId] = useState<string | null>(null)
  const frames = framesOf(content)
  const frame = frames.find(f => f.id === frameId)
  const [mode, setMode] = useState<PreviewMode>('rand')
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('M')
  // phase A3: the previews seen from the view being edited, or each from one of the named angles (a new set turns them anew)
  const [turned, setTurned] = useState(false)
  // what is drawn: the selection (or the whole model), each tile with its own slider values
  // (a selected group is drawn with everything hung from it: a hand with its fingers)
  const ids = useMemo(() => {
    const scoped = sel.kind === 'none' || frame ? content.shapes
      : sel.kind === 'group' ? [sel.id, ...descendantsOf(content, sel.id)].flatMap(id => shapesOf(content, { kind: 'group', id }))
      : shapesOf(content, sel)
    return new Set(scoped.filter(s => outlineSize(content, s) >= 3).map(s => s.id))
  }, [content, sel, frame])
  const specs = useMemo(() => previewSpecs(seed, mode, 6, content.ranges, content), [seed, mode, content])
  // a selected pattern, or a member of a family that a preview would not choose, is drawn all the same
  const show = useMemo(() => showFor(content, sel), [content, sel])
  const views = useMemo<View[]>(() => specs.map((_, i) => (turned ? viewFor(ANGLES[(seed * 7 + i * 3) % ANGLES.length].at) : view)), [specs, turned, seed, view])
  const tiles = useMemo(() => specs.map((spec, i) => solve(content, spec.values, views[i], { forms: spec.forms, hidden: hiddenThrough(frame, spec.hidden), show, fall: spec.fall, order: spec.order })), [specs, content, views, show, frame])
  // every tile is fitted to the selection as it stands at rest (from its own angle), so what a slider does shows as a change in the tile
  const boxes = useMemo<Array<Box | null>>(() => {
    const byView = new Map<string, Box | null>()
    const fit = (v: View): Box | null => {
      if (frame) return viewBoxOf(frame, v, content.axis)
      const rest = solve(content, defaultValues(content), v, { show })
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false
      for (const id of ids) {
        const r = rest.shapes[id]
        if (!r?.visible) continue
        any = true
        x0 = Math.min(x0, r.box.x); y0 = Math.min(y0, r.box.y); x1 = Math.max(x1, r.box.x + r.box.w); y1 = Math.max(y1, r.box.y + r.box.h)
      }
      return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
    }
    return views.map(v => { const k = String(v); if (!byView.has(k)) byView.set(k, fit(v)); return byView.get(k)! })
  }, [content, ids, views, show, frame])
  const box = boxes[0] ?? null
  // what each tile draws: the paint of every shape of the selection under the tile's own colours (and forms), minus helpers and shapes with nothing to lie in
  const prefix = useSvgPrefix()
  const painted = useMemo(() => specs.map((spec, i) => drawable(paintShapes(content, tiles[i], { palette: spec.palette, choices: spec.choices, forms: spec.forms, locks: activeLocks(content, specState(spec)), values: spec.values }, tiles[i].order.filter(id => ids.has(id))))), [specs, tiles, content, ids])
  const px = SIZES.find(s => s.id === size)!.px

  return (
    <section className="cmStrip" aria-label="Previews">
      <div className="cmStripBar">
        <button type="button" className="cmIconBtn" aria-label="Draw a new set of previews" title="Draw a new set of previews" onClick={() => { setSeed(s => s + 1); setMode('rand') }}><DiceIcon size={14} /></button>
        <div className="cmChips" role="group" aria-label="Kind of preview">
          {MODES.map(m => <button key={m.id} type="button" className={`cmChip cmChip--wide${mode === m.id ? ' cmChip--on' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.name}</button>)}
        </div>
        <button
          type="button" className={`cmChip cmChip--wide${turned ? ' cmChip--on' : ''}`} aria-pressed={turned}
          title="Show each preview from one of the named angles (a new set turns them anew)" onClick={() => setTurned(t => !t)}
        >Turned</button>
        <div className="cmChips" role="group" aria-label="Size of the previews">
          {SIZES.map(s => <button key={s.id} type="button" className={`cmChip${size === s.id ? ' cmChip--on' : ''}`} aria-pressed={size === s.id} aria-label={`Size ${s.id}`} onClick={() => setSize(s.id)}>{s.id}</button>)}
        </div>
      </div>
      {frames.length > 0 && (
        <div className="cmChips" role="group" aria-label="Frame to look through">
          <button type="button" className={`cmChip cmChip--wide${frameId === null ? ' cmChip--on' : ''}`} aria-pressed={frameId === null} onClick={() => setFrameId(null)}>Whole</button>
          {frames.map(f => <button key={f.id} type="button" className={`cmChip cmChip--wide${frameId === f.id ? ' cmChip--on' : ''}`} aria-pressed={frameId === f.id} onClick={() => setFrameId(f.id)}>{f.name.trim() || 'Frame'}</button>)}
        </div>
      )}
      {box ? (
        <div className="cmTiles">
          {specs.map((spec, i) => (
            <svg key={i} className={`cmTile cmTile--${spec.bg}`} viewBox="0 0 100 100" width={px} height={px} role="img" aria-label={turned ? `Preview ${i + 1}, ${angleName(views[i])}` : `Preview ${i + 1}`}>
              <PaintDefs defs={paintDefs(painted[i], `${prefix}-${i}`)} />
              <g transform={previewTransform(boxes[i] ?? box, spec)}>
                {frame && (
                  <>
                    <defs><clipPath id={`${prefix}-${i}-frame`}><rect x={(boxes[i] ?? box).x} y={(boxes[i] ?? box).y} width={(boxes[i] ?? box).w} height={(boxes[i] ?? box).h} /></clipPath></defs>
                    <rect x={(boxes[i] ?? box).x} y={(boxes[i] ?? box).y} width={(boxes[i] ?? box).w} height={(boxes[i] ?? box).h} className="cmFrameTile" style={{ '--tile': tile } as CSSProperties} data-tile="" />
                  </>
                )}
                <g clipPath={frame ? `url(#${prefix}-${i}-frame)` : undefined}>
                  {painted[i].map(item => <PaintedPath key={item.id} item={item} prefix={`${prefix}-${i}`} className="cmTileShape" />)}
                </g>
              </g>
            </svg>
          ))}
        </div>
      ) : <p className="cmInsText">Nothing to preview yet: draw a shape.</p>}
    </section>
  )
}
