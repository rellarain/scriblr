import { useMemo, useState } from 'react'
import type { ModelContent, ModelShape } from '../../../../api/types'
import type { PartKind } from './designerState'
import { allSmooth, fewestPoints, reshapeBlock, simplifyTo, smoothAll, smoothPoint } from './engine/outlineOps'
import { Stepper } from './Stepper'

// Drawing (slice 9b) in the shape editor's panel: the Outline section (smooth the selected point, smooth every point, simplify the outline to fewer points within a
// distance of it) and the Combine section (merge the shape with another, cut another out of it, split it along a line drawn on the canvas).

type EditShape = (id: string, next: ModelShape, selectPoint?: number, remember?: boolean) => void
const unitText = (v: number) => (v === 1 ? '1 unit' : `${v} units`)

export function OutlineSection({ content, shape, part, selPoint, mirror, axis, onEditShape }: {
  content: ModelContent; shape: ModelShape; part: PartKind; selPoint: number; mirror: boolean; axis: number; onEditShape: EditShape
}) {
  const block = reshapeBlock(content, shape)
  const now = shape.pts.length
  const fewest = useMemo(() => (block ? now : fewestPoints(shape)), [block, now, shape])
  const [want, setWant] = useState<number | null>(null)
  const target = Math.max(fewest, Math.min(now - 1, want ?? Math.max(fewest, Math.round(now * 0.6))))
  const result = useMemo(() => (block || now <= fewest ? null : simplifyTo(shape, target)), [block, now, fewest, shape, target])
  const pointOn = part === 'point' && selPoint >= 0 && selPoint < now
  const step = (dir: -1 | 1, big: boolean) => setWant(Math.max(fewest, Math.min(now - 1, target + dir * (big ? 5 : 1))))
  return (
    <div className="cmDraw" role="group" aria-label="Outline">
      <h3 className="cmInsSub">Outline</h3>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={!pointOn || (shape.pts[selPoint]?.m === 'c' && !shape.pts[selPoint]?.hi && !shape.pts[selPoint]?.ho)}
          title={pointOn ? 'Make the selected point a smooth curve point' : 'Select a point to smooth it'} onClick={() => onEditShape(shape.id, smoothPoint(shape, selPoint, { mirror, axis }), selPoint)}>Smooth the point</button>
        <button type="button" className="cmBtn cmBtn--small" disabled={allSmooth(shape)} title="Make every point a smooth curve point (its corners too)" onClick={() => onEditShape(shape.id, smoothAll(shape))}>Smooth it all</button>
      </div>
      {block ? <p className="cmInsText">{block}</p> : now <= fewest ? (
        <p className="cmInsText">{`${now} points: as few as its corners allow.`}</p>
      ) : (
        <>
          <div className="cmInline">
            <Stepper label="Points to keep" value={`${target} pts`} lowerOff={target <= fewest} raiseOff={target >= now - 1} bigBy={5} onStep={step} />
            <button type="button" className="cmBtn cmBtn--small cmBtn--primary" disabled={!result} onClick={() => { if (result) { onEditShape(shape.id, { ...shape, pts: result.pts }); setWant(null) } }}>Apply</button>
          </div>
          {result && <p className="cmInsText" role="status">{`${now} points now; ${result.pts.length} keep the outline within ${unitText(result.gap)}.`}</p>}
        </>
      )}
    </div>
  )
}

// What the Combine section needs from the page: the mode the canvas is in (picking a shape to merge or cut out, or drawing the line to split along), and setting it.
export type CombineMode = 'merge' | 'cut' | 'split'
export interface CombineActions {
  mode: CombineMode | null
  onMode: (mode: CombineMode | null) => void
}

const MODE_HINTS: Record<CombineMode, string> = {
  merge: 'Click the shape to merge with this one: the two become one outline. Escape stops.',
  cut: 'Click the shape to cut out of this one: where it lies over this one is taken away. Escape stops.',
  split: 'Click on the canvas to lay a line right across the shape, then press Enter or double-click to split it there. Backspace takes back a point; Escape stops.',
}

export function CombineSection({ content, shape, actions }: { content: ModelContent; shape: ModelShape; actions: CombineActions }) {
  const block = reshapeBlock(content, shape, true)
  const button = (mode: CombineMode, label: string, title: string) => (
    <button type="button" className={`cmBtn cmBtn--small${actions.mode === mode ? ' cmBtn--on' : ''}`} aria-pressed={actions.mode === mode} disabled={!!block} title={title}
      onClick={() => actions.onMode(actions.mode === mode ? null : mode)}>{label}</button>
  )
  return (
    <div className="cmDraw" role="group" aria-label="Combine">
      <h3 className="cmInsSub">Combine</h3>
      <div className="cmInline">
        {button('merge', 'Merge', 'Merge another shape into this one: one outline round both')}
        {button('cut', 'Cut out', 'Cut another shape out of this one')}
        {button('split', 'Split', 'Split this shape along a line you draw')}
      </div>
      <p className="cmInsText" role={actions.mode ? 'status' : undefined}>{block ?? (actions.mode ? MODE_HINTS[actions.mode] : 'Merge picks another shape and makes one outline round both; Cut out picks a shape and takes it out of this one; Split cuts this one along a line you draw.')}</p>
    </div>
  )
}
