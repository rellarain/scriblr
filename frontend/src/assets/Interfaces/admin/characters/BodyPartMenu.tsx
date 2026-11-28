import { useEffect, useState } from 'react'
import { getBodyParts } from '../../../../api/characterModelsApi'
import type { BodyPart, ModelContent, ModelShape } from '../../../../api/types'
import { CanvasForm } from './CanvasForm'
import { LIMITS } from './engine/limits'
import { addGroup, addObject, addShape, type MakeId } from './modelContent'

// The Body part menu (slice 9a): a head, a torso, an arm, a hand, a leg, a foot, an eye, an ear, a nose, a mouth or a lock of hair, each added as a group and an object of
// its own, made to the model's proportion guide (the parts are drawn for a head of 56 units with the crown at 10). The parts are read from the server once.

let cache: Promise<BodyPart[]> | null = null
const loadParts = (): Promise<BodyPart[]> => {
  cache ??= getBodyParts().then(r => r.parts).catch(err => { cache = null; throw err })
  return cache
}

const r2 = (v: number) => Math.round(v * 100) / 100
// A part's shapes carried onto the model: scaled by its guide's head (56 units when it has none) about the crown and the middle.
export function addBodyPart(c: ModelContent, part: BodyPart, makeId: MakeId): { content: ModelContent; groupId: string } | { refused: string } {
  if (c.shapes.length + part.shapes.length > LIMITS.shapesMax) return { refused: `A model may have at most ${LIMITS.shapesMax} shapes: the ${part.name.toLowerCase()} has ${part.shapes.length}.` }
  if (c.groups.length >= LIMITS.groupsMax) return { refused: `A model may have at most ${LIMITS.groupsMax} groups.` }
  const g = c.guide, k = g ? g.head / 56 : 1, top = g ? g.top : 10, axis = c.axis ?? 100
  const handle = (h: [number, number] | null | undefined): [number, number] | null => (h ? [r2(h[0] * k), r2(h[1] * k)] : null)
  const gid = makeId('g'), oid = makeId('o')
  let next = addGroup(c, { id: gid, name: part.name, parent: null, objects: [], pivot: null, attach: null })
  next = addObject(next, gid, { id: oid, name: part.name, layer: 'body', shapes: [] })
  for (const s of part.shapes) {
    const shape: ModelShape = {
      ...s, id: makeId('s'), mirrorOf: null,
      pts: s.pts.map(p => ({ ...p, x: r2(axis + (p.x - 100) * k), y: r2(top + (p.y - 10) * k), hi: handle(p.hi), ho: handle(p.ho) })),
      outline: typeof s.outline === 'number' ? r2(Math.max(LIMITS.outlineMin, s.outline * k)) : s.outline ?? null,
    }
    next = addShape(next, oid, shape)
  }
  return { content: next, groupId: gid }
}

export function BodyPartMenu({ at, onPick, onClose }: { at: { left: number; top: number }; onPick: (part: BodyPart) => void; onClose: () => void }) {
  const [parts, setParts] = useState<BodyPart[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    loadParts().then(p => { if (live) setParts(p) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [])
  return (
    <CanvasForm at={at} label="Body parts" className="cmPartMenu" onClose={onClose}>
      <span className="cmNewModelLabel">Body parts · on the guide</span>
      {error && <span className="cmInsText" role="alert">The body parts could not be loaded.</span>}
      {!parts && !error && <span className="cmInsText" role="status">Loading the body parts…</span>}
      {parts && (
        <div className="cmPartList">
          {parts.map(p => (
            <button key={p.id} type="button" className="cmPartItem" onClick={() => onPick(p)}>
              <span>{p.name}</span>{p.hint && <span className="cmPartHint">{p.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </CanvasForm>
  )
}
