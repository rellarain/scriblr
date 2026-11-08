import type { ModelContent, ModelLayer, ModelPointMode, ModelShape, ModelView } from '../../../../api/types'
import { PlusIcon, TrashIcon, UndoIcon } from '../../../icons'
import { TemplateMenu } from './TemplateMenu'
import { activeShape, type Selection } from './designerState'
import { addPoint, applyTemplate, deletePoint, resetHandles, setMode } from './engine/edit'
import { MODES, MODE_NAMES } from './engine/geometry'
import { LIMITS, pointLevel } from './engine/limits'
import { shapeBox } from './engine/svgText'
import { templateBox } from './engine/templates'
import { LAYERS, NAME_MAX, groupById, groupOfObject, objectById, objectOfShape } from './modelContent'

// The inspector: what the selection is, its name, and the settings of a shape (view, opacity, template, points and their modes). The other tabs of the
// mockup (Rig, Forms, Ranges, Colour) come with their phases. It is a drawer the canvas can fold away.
export interface InspectorProps {
  content: ModelContent
  sel: Selection
  selPoint: number
  mirror: boolean
  onSelectPoint: (i: number) => void
  onRename: (sel: Selection, name: string) => void
  onSetLayer: (objectId: string, layer: ModelLayer) => void
  onEditShape: (id: string, next: ModelShape, selectPoint?: number, remember?: boolean) => void
}

const VIEWS: Array<{ id: ModelView; name: string }> = [{ id: 'both', name: 'Front and back' }, { id: 'front', name: 'Front only' }, { id: 'back', name: 'Back only' }]

export function Inspector(p: InspectorProps) {
  const { content, sel, selPoint, mirror } = p
  const shape = activeShape(content, sel)
  const object = sel.kind === 'object' ? objectById(content, sel.id) : sel.kind === 'shape' ? objectOfShape(content, sel.id) : undefined
  const group = sel.kind === 'group' ? groupById(content, sel.id) : object ? groupOfObject(content, object.id) : undefined
  const crumbs = [group?.name || (group ? 'Untitled group' : ''), object?.name || (object ? 'Untitled object' : ''), shape ? shape.name || 'Untitled shape' : ''].filter(Boolean)
  const name = shape ? shape.name : sel.kind === 'object' ? object?.name ?? '' : sel.kind === 'group' ? group?.name ?? '' : ''

  if (sel.kind === 'none') {
    return (
      <section className="cmInspector" aria-label="Inspector">
        <h2 className="cmInsTitle">Overview</h2>
        <p className="cmInsText">{content.groups.length} groups, {content.objects.length} objects and {content.shapes.length} shapes. Nothing is selected: the canvas shows the end result.</p>
        <p className="cmInsText">Pick a row in the tree, or click a shape. Right-click the grid to unselect everything. Right-click a shape to move through point editor, move shape and unselected. Right-drag the grid to pan.</p>
      </section>
    )
  }

  return (
    <section className="cmInspector" aria-label="Inspector">
      <h2 className="cmInsTitle">{sel.kind === 'shape' ? 'Shape' : sel.kind === 'object' ? 'Object' : 'Group'}</h2>
      {crumbs.length > 1 && <p className="cmCrumbs">{crumbs.join(' › ')}</p>}
      <label className="cmField">
        <span>Name</span>
        <input value={name} maxLength={NAME_MAX} aria-label={`${sel.kind === 'shape' ? 'Shape' : sel.kind === 'object' ? 'Object' : 'Group'} name`} onChange={e => p.onRename(sel, e.target.value)} />
      </label>

      {sel.kind === 'object' && object && (
        <>
          <label className="cmField">
            <span>Layer</span>
            <select value={object.layer} aria-label="Layer of the object" onChange={e => p.onSetLayer(object.id, e.target.value as ModelLayer)}>
              {LAYERS.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <p className="cmInsText">{object.shapes.length} of {LIMITS.shapesPerObjectMax} shapes. The shapes of an object are drawn in the order of the tree, later ones in front.</p>
        </>
      )}
      {sel.kind === 'group' && group && <p className="cmInsText">{group.objects.length} of {LIMITS.objectsPerGroupMax} objects.</p>}

      {shape && (
        <>
          <label className="cmField">
            <span>View</span>
            <select value={shape.view} aria-label="Which view shows the shape" onChange={e => p.onEditShape(shape.id, { ...shape, view: e.target.value as ModelView })}>
              {VIEWS.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label className="cmField">
            <span>Opacity</span>
            <span className="cmRange"><input type="range" min={0} max={100} step={5} value={Math.round(shape.op * 100)} aria-label="Opacity of the shape" onChange={e => p.onEditShape(shape.id, { ...shape, op: Number(e.target.value) / 100 })} /><output>{Math.round(shape.op * 100)}%</output></span>
          </label>
          <div className="cmField">
            <span>Template</span>
            <span className="cmInline">
              <TemplateMenu
                label="Put a template on the shape" title="Put a template on the shape (replaces its points)"
                onPick={t => p.onEditShape(shape.id, applyTemplate(shape, t, shapeBox(shape) ?? templateBox(t, 100, 100)), 0)}
              />
              <small className="cmInsText">{shape.template ? `Started from ${shape.template}` : 'Freeform'}</small>
            </span>
          </div>
          <PointsSection shape={shape} selPoint={selPoint} mirror={mirror} onSelectPoint={p.onSelectPoint} onEditShape={p.onEditShape} />
        </>
      )}
    </section>
  )
}

function PointsSection({ shape, selPoint, mirror, onSelectPoint, onEditShape }: { shape: ModelShape; selPoint: number; mirror: boolean; onSelectPoint: (i: number) => void; onEditShape: InspectorProps['onEditShape'] }) {
  const lv = pointLevel(shape), cur = shape.pts[selPoint]
  const opts = { mirror }
  const note = lv === 'stop' ? `The most points a shape may have (${LIMITS.pointsMax}).` : lv === 'warn' ? `More than ${LIMITS.pointsWarn} points: fewer points keep a shape easy to edit and light to store.` : ''
  return (
    <div className="cmPoints">
      <h3 className="cmInsSub">Points <span className={`cmCount${lv === 'ok' ? '' : ` cmCount--${lv}`}`}>{shape.pts.length} of {LIMITS.pointsMax}</span></h3>
      {note && <p className={`cmInsText cmInsText--${lv}`} role="status">{note}</p>}
      <div className="cmChips" role="group" aria-label="Points">
        {shape.pts.map((pt, i) => (
          <button key={i} type="button" className={`cmChip${i === selPoint ? ' cmChip--on' : ''}`} aria-pressed={i === selPoint} aria-label={`Select point ${i + 1}`} onClick={() => onSelectPoint(i)}>{i + 1}</button>
        ))}
      </div>
      {cur && (
        <>
          <div className="cmChips" role="group" aria-label={`Mode of point ${selPoint + 1}`}>
            {MODES.map((m: ModelPointMode) => (
              <button key={m} type="button" className={`cmChip cmChip--wide${cur.m === m ? ' cmChip--on' : ''}`} aria-pressed={cur.m === m} onClick={() => onEditShape(shape.id, setMode(shape, selPoint, m, opts), selPoint)}>{MODE_NAMES[m]}</button>
            ))}
          </div>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={lv === 'stop'} onClick={() => { const r = addPoint(shape, selPoint, { ...opts, max: LIMITS.pointsMax }); if (r.index >= 0) onEditShape(shape.id, r.shape, r.index) }}>
              <PlusIcon size={12} /> Add a point after it
            </button>
            <button type="button" className="cmBtn cmBtn--small" disabled={shape.pts.length <= 3} onClick={() => { const r = deletePoint(shape, selPoint, opts); if (r) onEditShape(shape.id, r, Math.max(0, Math.min(selPoint, r.pts.length - 1))) }}>
              <TrashIcon size={12} /> Delete it
            </button>
            <button type="button" className="cmBtn cmBtn--small" disabled={!cur.hi && !cur.ho} onClick={() => onEditShape(shape.id, resetHandles(shape, selPoint, opts), selPoint)}>
              <UndoIcon size={12} /> Reset its handles
            </button>
          </div>
        </>
      )}
    </div>
  )
}
