import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PlusIcon } from '../../../icons'
import { useDesignerPolicy } from './designerPolicy'
import { POLYGON_SIDES, SHAPE_BASICS, STAR_POINTS, TEMPLATES, polygonId, starId, templateBox, templateById, templatePoints, type Template } from './engine/templates'
import { shapePath } from './engine/svgText'
import { Stepper } from './Stepper'

// A button that opens the list of template shapes (each drawn small); picking one calls onPick with its id. Used to add a shape and to put another
// template on the selected one. Escape and a click outside close it. In the shape editor (S3) the list is the basics, then a polygon and a star, each with a
// stepper for its count of sides or points.
function Thumb({ id }: { id: string }) {
  const d = shapePath({ pts: templatePoints(id, templateBox(id, 50, 50, 36)), closed: true })
  return <svg className="cmTplThumb" viewBox="0 0 100 100" aria-hidden="true"><path d={d} /></svg>
}

const clampTo = (n: number, span: { min: number; max: number }) => Math.min(span.max, Math.max(span.min, n))

export function TemplateMenu({ label, title, onPick, icon, disabled }: { label: string; title?: string; onPick: (templateId: string) => void; icon?: ReactNode; disabled?: boolean }) {
  const { shapes } = useDesignerPolicy()
  const [open, setOpen] = useState(false)
  const [sides, setSides] = useState<number>(POLYGON_SIDES.start)
  const [points, setPoints] = useState<number>(STAR_POINTS.start)
  const root = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  const item = (t: Template) => (
    <button key={t.id} type="button" role="menuitem" className="cmTpl" onClick={() => { setOpen(false); onPick(t.id) }}>
      <Thumb id={t.id} />
      <span>{t.name}</span>
    </button>
  )
  const list = shapes ? SHAPE_BASICS.map(id => templateById(id)).filter((t): t is Template => !!t) : TEMPLATES
  return (
    <span className="cmMenuAnchor" ref={root}>
      <button type="button" className="cmIconBtn" aria-label={label} title={title ?? label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(o => !o)}>
        {icon ?? <PlusIcon size={14} />}
      </button>
      {open && (
        <div className="cmMenu cmMenu--templates" role="menu" aria-label="Template shapes">
          {list.map(item)}
          {shapes && (
            <>
              <div className="cmTplCount">
                {item(templateById(polygonId(sides))!)}
                <Stepper label="Polygon sides" value={String(sides)} lowerOff={sides <= POLYGON_SIDES.min} raiseOff={sides >= POLYGON_SIDES.max} bigBy={3} onStep={(dir, big) => setSides(n => clampTo(n + dir * (big ? 3 : 1), POLYGON_SIDES))} />
              </div>
              <div className="cmTplCount">
                {item(templateById(starId(points))!)}
                <Stepper label="Star points" value={String(points)} lowerOff={points <= STAR_POINTS.min} raiseOff={points >= STAR_POINTS.max} bigBy={3} onStep={(dir, big) => setPoints(n => clampTo(n + dir * (big ? 3 : 1), STAR_POINTS))} />
              </div>
            </>
          )}
        </div>
      )}
    </span>
  )
}
