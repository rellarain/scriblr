import { useMemo, useState, type CSSProperties } from 'react'
import type { CharacterFigure, ModelContent } from '../../../../../api/types'
import { LockIcon } from '../../../../icons'
import { viewBoxOf } from '../../../admin/characters/engine/frames'
import type { Box } from '../../../admin/characters/engine/geometry'
import type { View } from '../../../admin/characters/engine/rig'
import { hotspotsOf, regionsOf, type Layers, type Region } from './figureEditing'
import { cropBox, followHeight, solveFigure, type Crop } from './figureState'
import { Figure } from './Figure'

// The card of the editor: the figure on its tile, looked at through the crop the writer chose, with the model's frames laid on it as stacked sheets (card-wide buttons, nested like
// paper, the smallest in front; invisible until the pointer or the keyboard is on one) and, once a sheet is open, a box over each part of it that can be changed. Clicking a sheet
// opens it; clicking a part opens that part. Only the card is clicked: there are no lists of groups or objects. In the front view the sheets lie behind the figure, in the back view in
// front of it (the hotspots are always on top, so a part can be reached in both).

const pct = (v: number): number => Math.round(v * 100) / 100
// A box as percentages of the card, held inside it (null when too little of it is on the card to click).
function onCard(b: Box, card: Box): { left: number; top: number; width: number; height: number } | null {
  const x0 = Math.max(b.x, card.x), y0 = Math.max(b.y, card.y), x1 = Math.min(b.x + b.w, card.x + card.w), y1 = Math.min(b.y + b.h, card.y + card.h)
  if (x1 - x0 < card.w * 0.02 || y1 - y0 < card.h * 0.02) return null
  return { left: pct(((x0 - card.x) / card.w) * 100), top: pct(((y0 - card.y) / card.h) * 100), width: pct(((x1 - x0) / card.w) * 100), height: pct(((y1 - y0) / card.h) * 100) }
}

export function FigureCard({ copy, figure, view, crop, region, objectId, layers, label, onRegion, onObject }: {
  copy: ModelContent
  figure: CharacterFigure
  view: View
  crop: Crop
  region: string | null
  objectId: string | null
  layers: Layers
  label: string
  onRegion: (id: string) => void
  onObject: (id: string) => void
}) {
  const solved = useMemo(() => solveFigure(copy, figure, crop, view), [copy, figure, crop, view])
  const box = useMemo(() => cropBox(copy, crop, view, solved.global), [copy, crop, view, solved.global])
  const regions: Region[] = useMemo(() => regionsOf(copy), [copy])
  const [tip, setTip] = useState<string | null>(null)

  const sheets = useMemo(() => regions.flatMap(r => {
    const at = onCard(r.frame ? followHeight(viewBoxOf(r.frame, view, copy.axis ?? 100), solved.global, copy.axis ?? 100) : box, box)
    return at ? [{ region: r, at }] : []
  }), [regions, view, copy.axis, box, solved.global])
  const spots = useMemo(() => (region ? hotspotsOf(copy, figure, solved, region, layers).flatMap(h => { const at = onCard(h.box, box); return at ? [{ h, at }] : [] }) : []), [copy, figure, solved, region, layers, box])
  const shown = spots.find(s => s.h.object.id === tip)

  return (
    <div className={`charFigCard charFigCard--${view}`} style={{ '--ar': box.w / box.h } as CSSProperties}>
      <Figure copy={copy} figure={figure} crop={crop} view={view} square={false} layer="tile" label="" className="charFigLayer charFigLayer--tile" />
      {sheets.map(({ region: r, at }) => (
        <button
          key={r.id} type="button" className={`charFigSheet${region === r.id ? ' charFigSheet--on' : ''}`} aria-pressed={region === r.id} aria-label={`${r.name} sheet`} title={r.name}
          style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${at.width}%`, height: `${at.height}%` }} onClick={() => onRegion(r.id)}
        ><span className="charFigTag">{r.name}</span></button>
      ))}
      <Figure copy={copy} figure={figure} crop={crop} view={view} square={false} layer="figure" label={label} className="charFigLayer charFigLayer--figure" />
      {spots.map(({ h, at }) => (
        <button
          key={h.object.id} type="button" className={`charFigHot${objectId === h.object.id ? ' charFigHot--on' : ''}${h.locked ? ' charFigHot--locked' : ''}`} aria-pressed={objectId === h.object.id}
          aria-label={`${h.object.name}: ${h.changes.join(', ')}${h.locked ? ', locked' : ''}`} style={{ left: `${at.left}%`, top: `${at.top}%`, width: `${at.width}%`, height: `${at.height}%` }}
          onClick={() => onObject(h.object.id)} onMouseEnter={() => setTip(h.object.id)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(h.object.id)} onBlur={() => setTip(null)}
        >{h.locked && <span className="charFigLockMark" aria-hidden="true"><LockIcon size={10} /></span>}</button>
      ))}
      {shown && (
        <div className="charFigTip" role="tooltip" style={{ left: `${Math.min(80, Math.max(20, shown.at.left + shown.at.width / 2))}%`, top: `${shown.at.top}%` }}>
          <b>{shown.h.object.name}</b>
          <span>{shown.h.changes.join(', ')}</span>
        </div>
      )}
    </div>
  )
}
