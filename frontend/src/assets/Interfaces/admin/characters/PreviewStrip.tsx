import { useMemo, useState } from 'react'
import type { ModelContent } from '../../../../api/types'
import { DiceIcon } from '../../../icons'
import { shapesOf, type Selection } from './designerState'
import { previewSpecs, previewTransform, type PreviewMode } from './engine/previews'
import { shapePath, shapesBox } from './engine/svgText'

// The always-on strip under the canvas: the selection (or, with nothing selected, the whole model) at random sizes, tilts and backgrounds, so the
// admin sees how it holds up. Re-roll draws a new set; Smallest and Largest are the stress previews (every value at the end of its range).
const SIZES = [{ id: 'S', px: 64 }, { id: 'M', px: 96 }, { id: 'L', px: 144 }] as const
const MODES: Array<{ id: PreviewMode; name: string }> = [{ id: 'rand', name: 'Random' }, { id: 'min', name: 'Smallest' }, { id: 'max', name: 'Largest' }]

export function PreviewStrip({ content, sel }: { content: ModelContent; sel: Selection }) {
  const [seed, setSeed] = useState(1)
  const [mode, setMode] = useState<PreviewMode>('rand')
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('M')
  const shapes = useMemo(() => {
    const picked = sel.kind === 'none' ? content.shapes : shapesOf(content, sel)
    return [...picked].filter(s => s.pts.length >= 3).sort((a, b) => a.z - b.z)
  }, [content, sel])
  const box = shapesBox(shapes)
  const specs = useMemo(() => previewSpecs(seed, mode, 6), [seed, mode])
  const px = SIZES.find(s => s.id === size)!.px

  return (
    <section className="cmStrip" aria-label="Previews">
      <div className="cmStripBar">
        <h2 className="cmInsSub">Previews</h2>
        <button type="button" className="cmIconBtn" aria-label="Draw a new set of previews" title="Draw a new set of previews" onClick={() => { setSeed(s => s + 1); setMode('rand') }}><DiceIcon size={14} /></button>
        <div className="cmChips" role="group" aria-label="Kind of preview">
          {MODES.map(m => <button key={m.id} type="button" className={`cmChip cmChip--wide${mode === m.id ? ' cmChip--on' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.name}</button>)}
        </div>
        <div className="cmChips" role="group" aria-label="Size of the previews">
          {SIZES.map(s => <button key={s.id} type="button" className={`cmChip${size === s.id ? ' cmChip--on' : ''}`} aria-pressed={size === s.id} aria-label={`Size ${s.id}`} onClick={() => setSize(s.id)}>{s.id}</button>)}
        </div>
      </div>
      {box ? (
        <div className="cmTiles">
          {specs.map((spec, i) => (
            <svg key={i} className={`cmTile cmTile--${spec.bg}`} viewBox="0 0 100 100" width={px} height={px} role="img" aria-label={`Preview ${i + 1}`}>
              <g transform={previewTransform(box, spec)}>
                {shapes.map(s => <path key={s.id} d={shapePath(s)} className="cmTileShape" fillOpacity={s.op} />)}
              </g>
            </svg>
          ))}
        </div>
      ) : <p className="cmInsText">Nothing to preview yet: draw a shape.</p>}
    </section>
  )
}
