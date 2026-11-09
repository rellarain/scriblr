import type { ReactNode } from 'react'
import type { ModelContent, ModelLayer, ModelPointMode, ModelShape, ModelView } from '../../../../api/types'
import { BodyIcon, BookmarkIcon, BucketIcon, CardIcon, PathIcon, PlusIcon, SlidersIcon, StackIcon, TrashIcon, TreeIcon, UndoIcon } from '../../../icons'
import { ClassPanel, FollowPanel, type ClassActions } from './ClassPanel'
import { LinksPanel, PairPanel, ViewPanel } from './PairPanels'
import { Stepper } from './Stepper'
import type { LinkHow, PairActions, ViewName } from './rigActions'
import { TemplateMenu } from './TemplateMenu'
import { activeShape, type Selection } from './designerState'
import { addPoint, applyTemplate, deletePoint, resetHandles, setMode } from './engine/edit'
import type { Choices } from './engine/forms'
import { MODES, MODE_NAMES } from './engine/geometry'
import { LIMITS, pointLevel } from './engine/limits'
import { shapeBox } from './engine/svgText'
import { templateBox } from './engine/templates'
import { LAYERS, NAME_MAX, groupById, groupOfObject, objectById, objectOfShape } from './modelContent'

// The inspector: tabs for what the selection is and its shape's settings (Shape), how its group hangs and is fixed in the rig (Rig), the model's sliders
// (Ranges), the forms of an object (Forms), the presets of the model (Presets), its colours (Colour), its skeleton and the span writers may choose
// (Proportions) and its frames (Frames). It is a drawer the canvas can fold away.
export type InspectorTab = 'shape' | 'rig' | 'ranges' | 'forms' | 'presets' | 'colour' | 'proportions' | 'frames'
const TABS: Array<{ id: InspectorTab; name: string; Icon: typeof PathIcon }> = [
  { id: 'shape', name: 'Shape', Icon: PathIcon },
  { id: 'rig', name: 'Rig', Icon: TreeIcon },
  { id: 'ranges', name: 'Ranges', Icon: SlidersIcon },
  { id: 'forms', name: 'Forms', Icon: StackIcon },
  { id: 'presets', name: 'Presets', Icon: BookmarkIcon },
  { id: 'colour', name: 'Colour', Icon: BucketIcon },
  { id: 'proportions', name: 'Proportions', Icon: BodyIcon },
  { id: 'frames', name: 'Frames', Icon: CardIcon },
]

export interface InspectorProps {
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
  // What the Rig, Ranges, Forms, Presets, Colour, Proportions and Frames tabs show (the page builds them: they need its actions).
  rigTab: ReactNode
  rangesTab: ReactNode
  formsTab: ReactNode
  presetsTab: ReactNode
  colourTab: ReactNode
  proportionsTab: ReactNode
  framesTab: ReactNode
  // The line the model mirrors about, changed one step at a time.
  onAxis: (dir: -1 | 1, big: boolean) => void
  content: ModelContent
  sel: Selection
  selPoint: number
  mirror: boolean
  onSelectPoint: (i: number) => void
  onRename: (sel: Selection, name: string) => void
  onSetLayer: (objectId: string, layer: ModelLayer) => void
  onEditShape: (id: string, next: ModelShape, selectPoint?: number, remember?: boolean) => void
  // Pairs, point links and the back view: the view being edited, the link being picked on the canvas, and what the panels ask for.
  view: ViewName
  linkMode: LinkHow | null
  pairs: PairActions
  // Classes (what the Class panel asks for) and the forms chosen now (which member of a family is shown).
  classes: ClassActions
  choices: Choices
}

const VIEWS: Array<{ id: ModelView; name: string }> = [{ id: 'both', name: 'Front and back' }, { id: 'front', name: 'Front only' }, { id: 'back', name: 'Back only' }]

export function Inspector(p: InspectorProps) {
  return (
    <section className="cmInspector" aria-label="Inspector">
      <div className="cmTabs" role="tablist" aria-label="Inspector tabs">
        {TABS.map(t => (
          <button
            key={t.id} type="button" role="tab" id={`cm-tab-${t.id}`} className={`cmTab${p.tab === t.id ? ' cmTab--on' : ''}`} aria-selected={p.tab === t.id} aria-controls="cm-tabpanel" tabIndex={p.tab === t.id ? 0 : -1}
            title={t.name} onClick={() => p.onTab(t.id)}
            onKeyDown={e => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
              e.preventDefault()
              const at = TABS.findIndex(x => x.id === t.id), next = TABS[(at + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
              p.onTab(next.id)
              document.getElementById(`cm-tab-${next.id}`)?.focus()
            }}
          ><t.Icon size={13} /> {t.name}</button>
        ))}
      </div>
      <div id="cm-tabpanel" role="tabpanel" aria-labelledby={`cm-tab-${p.tab}`} className="cmTabPanel">
        {p.tab === 'shape' ? <ShapeTab {...p} /> : p.tab === 'rig' ? p.rigTab : p.tab === 'ranges' ? p.rangesTab : p.tab === 'forms' ? p.formsTab : p.tab === 'presets' ? p.presetsTab : p.tab === 'colour' ? p.colourTab : p.tab === 'proportions' ? p.proportionsTab : p.framesTab}
      </div>
    </section>
  )
}

function ShapeTab(p: InspectorProps) {
  const { content, sel, selPoint, mirror } = p
  const shape = activeShape(content, sel)
  const object = sel.kind === 'object' ? objectById(content, sel.id) : sel.kind === 'shape' ? objectOfShape(content, sel.id) : undefined
  const group = sel.kind === 'group' ? groupById(content, sel.id) : object ? groupOfObject(content, object.id) : undefined
  const crumbs = [group?.name || (group ? 'Untitled group' : ''), object?.name || (object ? 'Untitled object' : ''), shape ? shape.name || 'Untitled shape' : ''].filter(Boolean)
  const name = shape ? shape.name : sel.kind === 'object' ? object?.name ?? '' : sel.kind === 'group' ? group?.name ?? '' : ''

  if (sel.kind === 'none') {
    return (
      <div className="cmTabBody">
        <h2 className="cmInsTitle">Overview</h2>
        <p className="cmInsText">{content.groups.length} groups, {content.objects.length} objects, {content.shapes.length} shapes and {content.ranges.length} sliders. Nothing is selected: the canvas shows the end result.</p>
        <p className="cmInsText">Pick a row in the tree, or click a shape. Right-click the grid to unselect everything. Right-click a shape to move through point editor, move shape and unselected. Right-drag the grid to pan.</p>
        <h3 className="cmInsSub">Mirror line</h3>
        <Stepper label="Mirror line" value={`x ${content.axis}`} onStep={p.onAxis} lowerOff={content.axis <= 40} raiseOff={content.axis >= 160} />
        <p className="cmInsText">Twins and mirror editing reflect about this line. It is drawn on the canvas.</p>
      </div>
    )
  }

  return (
    <div className="cmTabBody">
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
          <PairPanel content={content} kind="object" id={object.id} actions={p.pairs} />
          <ClassPanel content={content} object={object} choices={p.choices} actions={p.classes} />
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
          {!shape.mirrorOf && (
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
          )}
          <FollowPanel content={content} shape={shape} actions={p.classes} />
          <PairPanel content={content} kind="shape" id={shape.id} actions={p.pairs} />
          {!shape.mirrorOf && <PointsSection shape={shape} selPoint={selPoint} mirror={mirror} onSelectPoint={p.onSelectPoint} onEditShape={p.onEditShape} />}
          <LinksPanel content={content} shape={shape} selPoint={selPoint} linkMode={p.linkMode} actions={p.pairs} />
          <ViewPanel content={content} shape={shape} view={p.view} actions={p.pairs} />
        </>
      )}
    </div>
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
