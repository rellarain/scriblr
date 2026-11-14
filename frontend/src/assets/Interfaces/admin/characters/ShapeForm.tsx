import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CheckIcon } from '../../../icons'
import { KIND_NAMES } from './engine/kinds'
import { POLYGON_SIDES, SHAPE_BASICS, polygonId, starId, templateById } from './engine/templates'
import { Stepper } from './Stepper'
import { Thumb } from './TemplateMenu'

// The new-shape form of the shape editor (shape types T1): opened on the canvas by a right-click on the grid (or the New shape button). It holds the type of the new shape, a
// preset shape (a picture only) or a polygon with a count of points, and Create, which puts the shape where the form was opened. It lies over the whole stage, so no panel's
// scrolling area clips it, and keeps itself inside the stage.

export type FormKind = 'base' | 'stretch' | 'shadow' | 'light'
export const FORM_KINDS: FormKind[] = ['base', 'stretch', 'shadow', 'light']
// 'polygon' is the polygon with the chosen count of points
export interface ShapeChoice { kind: FormKind; template: string; sides: number }
export const FIRST_CHOICE: ShapeChoice = { kind: 'base', template: 'circle', sides: POLYGON_SIDES.start }
export const PRESETS: string[] = [...SHAPE_BASICS, starId(5)]
// the template a choice makes
export const templateOfChoice = (c: ShapeChoice): string => (c.template === 'polygon' ? polygonId(c.sides) : c.template)

const MARGIN = 8

export function ShapeForm({ at, choice, onChoice, onCreate, onClose }: { at: { left: number; top: number }; choice: ShapeChoice; onChoice: (c: ShapeChoice) => void; onCreate: () => void; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState(at)
  // kept inside the stage it lies over
  useLayoutEffect(() => {
    const el = root.current, stage = el?.parentElement
    if (!el || !stage) return
    const w = el.offsetWidth, h = el.offsetHeight, W = stage.clientWidth, H = stage.clientHeight
    setPlace({ left: Math.max(MARGIN, Math.min(at.left, W - w - MARGIN)), top: Math.max(MARGIN, Math.min(at.top, H - h - MARGIN)) })
  }, [at.left, at.top])
  // the chosen picture has the focus when the form opens; a press outside and Escape (wherever the focus is) close it
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-choice="on"]')?.focus()
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true) }
  }, [onClose])
  const pick = (template: string) => onChoice({ ...choice, template })
  const polygon = templateById(polygonId(choice.sides))
  return (
    <div
      ref={root} className="cmShapeForm" role="dialog" aria-label="New shape" style={{ left: place.left, top: place.top }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="cmShapeFormKinds" role="group" aria-label="Type of the shape">
        {FORM_KINDS.map(k => (
          <button key={k} type="button" className={`cmChip${choice.kind === k ? ' cmChip--on' : ''}`} aria-pressed={choice.kind === k} onClick={() => onChoice({ ...choice, kind: k })}>{KIND_NAMES[k]}</button>
        ))}
      </div>
      <div className="cmShapeFormPresets" role="group" aria-label="Shape">
        {PRESETS.map(id => {
          const name = templateById(id)?.name ?? id, on = choice.template === id
          return (
            <button key={id} type="button" className={`cmTpl${on ? ' cmTpl--on' : ''}`} aria-label={name} title={name} aria-pressed={on} data-choice={on ? 'on' : undefined} onClick={() => pick(id)}>
              <Thumb id={id} />
            </button>
          )
        })}
        <div className="cmTplCount">
          <button
            type="button" className={`cmTpl${choice.template === 'polygon' ? ' cmTpl--on' : ''}`} aria-label={`Polygon of ${choice.sides} points`} title={polygon?.name ?? 'Polygon'}
            aria-pressed={choice.template === 'polygon'} data-choice={choice.template === 'polygon' ? 'on' : undefined} onClick={() => pick('polygon')}
          ><Thumb id={polygonId(choice.sides)} /></button>
          <Stepper
            label="Polygon points" value={String(choice.sides)} lowerOff={choice.sides <= POLYGON_SIDES.min} raiseOff={choice.sides >= POLYGON_SIDES.max} bigBy={3}
            onStep={(dir, big) => onChoice({ ...choice, template: 'polygon', sides: Math.min(POLYGON_SIDES.max, Math.max(POLYGON_SIDES.min, choice.sides + dir * (big ? 3 : 1))) })}
          />
        </div>
      </div>
      <div className="cmShapeFormFoot">
        <button type="button" className="cmShapeFormCreate" aria-label="Create" title="Create the shape here" onClick={onCreate}><CheckIcon size={16} /></button>
      </div>
    </div>
  )
}
