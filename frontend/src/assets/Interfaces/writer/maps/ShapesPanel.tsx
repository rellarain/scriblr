import { useState } from 'react'
import { MAP_MAX_ROUGH, type MapLevel, type MapLibraryShape, type MapShape, type MapShapeCategory, type MapShapePoint } from '../../../../api/types'
import { CheckIcon, CloseIcon, SaveIcon, TrashIcon } from '../../../icons'
import { CommitNumber, CommitText, Field } from './MapFields'
import { COMBINE_ACTIONS, type CombineAction } from './mapCombine'
import { CATEGORIES, libraryFromShape, offeredAt } from './mapLibrary'
import { levelDef } from './mapLevels'
import { flatten } from './mapShapes'
import { LAND_LEVELS, BUILDING_LEVELS, SPACE_LEVELS } from './mapShapeSeed'
import { deleteMine, saveMyShape, useShapeLibrary } from './mapShapeStore'
import { POLYGON_SIDES, TEMPLATES, type MapTemplate } from './mapTemplates'
import type { MapDraft } from './mapModel'

// What the Place a shape tool places: a template (made as a biome area or a region) or a shape of a library.
export type ShapeSource =
  | { kind: 'template'; template: MapTemplate; sides: number; makeAs: 'biome' | 'region' }
  | { kind: 'library'; shape: MapLibraryShape }

// A small picture of a library shape (its rings in its own proportions), in the ink.
export function ShapeThumb({ shape, size = 28 }: { shape: Pick<MapLibraryShape, 'type' | 'points' | 'holes' | 'w' | 'h'>; size?: number }) {
  const w = Math.max(shape.w, 0.01), h = Math.max(shape.h, 0.01)
  const k = 1 / Math.max(w, h)
  const ring = (points: MapShapePoint[], closed: boolean) => {
    const f = flatten({ type: closed ? 'region' : 'line', points })
    return f.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * w * k).toFixed(3)} ${(p.y * h * k).toFixed(3)}`).join('') + (closed ? 'Z' : '')
  }
  const closed = shape.type !== 'line'
  const d = [ring(shape.points, closed), ...(closed ? shape.holes.map(r => ring(r, true)) : [])].join('')
  return (
    <svg width={size} height={size} viewBox={`-0.05 -0.05 ${w * k + 0.1} ${h * k + 0.1}`} aria-hidden="true" className="mapShapeThumb">
      {closed ? <path d={d} fill="currentColor" fillRule="evenodd" /> : <path d={d} fill="none" stroke="currentColor" strokeWidth={0.08} strokeLinecap="round" />}
    </svg>
  )
}

// The Shapes panel: templates (a circle, an ellipse, a rectangle, a polygon, a blob, a ridge: made as a biome area or a region), the admin's default shapes
// for the map's level by category, and My shapes by the project each came from. Choosing one picks the Place a shape tool.
export function ShapesPanel({ draft, source, onSource }: { draft: MapDraft; source: ShapeSource | null; onSource: (s: ShapeSource) => void }) {
  const lib = useShapeLibrary()
  const biomesLevel = levelDef(draft.level).drawn === 'biomes'
  const [makeAs, setMakeAs] = useState<'biome' | 'region'>(biomesLevel ? 'biome' : 'region')
  const [sides, setSides] = useState(6)
  const asNow = biomesLevel ? makeAs : 'region'
  const offered = lib.published.filter(s => offeredAt(s, draft.level))
  const [category, setCategory] = useState<MapShapeCategory | null>(null)
  const categories = CATEGORIES.filter(c => offered.some(s => s.category === c.id))
  const shown = category && categories.some(c => c.id === category) ? category : categories[0]?.id ?? null
  const mine = lib.mine.filter(s => offeredAt(s, draft.level))
  const byProject = new Map<string, typeof mine>()
  for (const s of mine) byProject.set(s.projectTitle || 'Another project', [...(byProject.get(s.projectTitle || 'Another project') ?? []), s])
  const [asking, setAsking] = useState<string | null>(null)
  const isOn = (s: MapLibraryShape) => source?.kind === 'library' && source.shape.id === s.id
  const pickTemplate = (template: MapTemplate) => onSource({ kind: 'template', template, sides, makeAs: asNow })
  return (
    <section className="mapPanel" aria-label="Shapes">
      <header className="mapPanelHead"><h3 className="mapPanelTitle">Shapes</h3></header>
      {biomesLevel && (
        <div className="mapSizes" role="group" aria-label="Templates make">
          {(['biome', 'region'] as const).map(k => (
            <button
              key={k} type="button" className="mapChip" aria-pressed={asNow === k}
              onClick={() => { setMakeAs(k); if (source?.kind === 'template') onSource({ ...source, makeAs: k }) }}
            >{k === 'biome' ? 'Biome areas' : 'Regions'}</button>
          ))}
        </div>
      )}
      <div className="mapSizes" role="group" aria-label="Templates">
        {TEMPLATES.map(t => (
          <button key={t.id} type="button" className="mapChip" aria-pressed={source?.kind === 'template' && source.template === t.id} title={t.title} onClick={() => pickTemplate(t.id)}>{t.name}</button>
        ))}
      </div>
      {source?.kind === 'template' && source.template === 'polygon' && (
        <Field label="Sides" short>
          <CommitNumber label="Sides of the polygon" value={sides} min={POLYGON_SIDES.min} max={POLYGON_SIDES.max} step={1} onCommit={n => { setSides(n); onSource({ ...source, sides: n }) }} />
        </Field>
      )}
      {categories.length > 0 && (
        <>
          <div className="mapSizes" role="group" aria-label="Kinds of shape">
            {categories.map(c => <button key={c.id} type="button" className="mapChip" aria-pressed={c.id === shown} onClick={() => setCategory(c.id)}>{c.name}</button>)}
          </div>
          <ul className="mapSymbols">
            {offered.filter(s => s.category === shown).map(s => (
              <li key={s.id}>
                <button
                  type="button" className={`mapSymbolBtn${isOn(s) ? ' mapSymbolBtn--on' : ''}`} aria-pressed={isOn(s)} aria-label={`Place ${s.name}`} title={`Place ${s.name}`}
                  onClick={() => onSource({ kind: 'library', shape: s })}
                ><ShapeThumb shape={s} size={24} /></button>
              </li>
            ))}
          </ul>
        </>
      )}
      {byProject.size > 0 && (
        <div className="mapFields" role="group" aria-label="My shapes">
          <h4 className="mapSubTitle">My shapes</h4>
          {[...byProject].map(([title, list]) => (
            <div key={title}>
              <p className="mapHint">From {title}</p>
              <ul className="mapMyShapes">
                {list.map(s => (
                  <li key={s.id} className="mapRow">
                    <button type="button" className={`mapSymbolBtn${isOn(s) ? ' mapSymbolBtn--on' : ''}`} aria-pressed={isOn(s)} aria-label={`Place ${s.name}`} title={`Place ${s.name}`} onClick={() => onSource({ kind: 'library', shape: s })}>
                      <ShapeThumb shape={s} size={24} />
                    </button>
                    <span className="mapMyName">{s.name}</span>
                    {asking === s.id ? (
                      <span className="mapRow" role="group" aria-label={`Delete ${s.name} from My shapes?`}>
                        <button type="button" className="mapIconBtn" aria-label={`Yes, delete ${s.name}`} title="Delete it from My shapes (for every project)" onClick={() => { setAsking(null); void deleteMine(s.id) }}><CheckIcon size={16} /></button>
                        <button type="button" className="mapIconBtn" aria-label="Keep it" title="Keep it" onClick={() => setAsking(null)}><CloseIcon size={16} /></button>
                      </span>
                    ) : (
                      <button type="button" className="mapIconBtn" aria-label={`Delete ${s.name} from My shapes`} title="Delete from My shapes" onClick={() => setAsking(s.id)}><TrashIcon size={16} /></button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mapHint">Drag a box on the map to place it, or click to place it at its own size. Shift keeps a template square; Alt: no snapping. The chosen shape can be saved to My shapes, for every project.</p>
    </section>
  )
}

// The levels a shape saved from a map is offered on: its level's group (the land levels, space, or buildings).
function levelsLike(level: MapLevel): MapLevel[] {
  if (SPACE_LEVELS.includes(level)) return SPACE_LEVELS
  if (BUILDING_LEVELS.includes(level) && level !== 'local') return BUILDING_LEVELS
  return LAND_LEVELS
}

// The category a shape saved from a map goes in, to begin with.
const categoryOf = (shape: MapShape, level: MapLevel): MapShapeCategory =>
  shape.style === 'halo' ? 'marker' : SPACE_LEVELS.includes(level) ? 'space' : level === 'architectural' || level === 'interior' ? 'building' : 'land'

// The tools of a chosen shape: its rough edge, combining it with another (merge, cut out, split along a line) and saving it to My shapes.
export function ShapeTools({ draft, shape, projectId, projectTitle, combining, onRough, onCombine }: {
  draft: MapDraft; shape: MapShape; projectId: string; projectTitle: string; combining: CombineAction | null
  onRough: (rough: number) => void; onCombine: (action: CombineAction | null) => void
}) {
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<MapShapeCategory>(() => categoryOf(shape, draft.level))
  const [note, setNote] = useState<string | null>(null)
  const closed = shape.type !== 'line'
  async function save() {
    const lib = libraryFromShape(shape, { id: 'new', name: name || shape.name || 'Shape', category, levels: levelsLike(draft.level), units: draft.units })
    const saved = await saveMyShape(lib, projectId, projectTitle)
    setNote(saved ? `Saved to My shapes as ${saved.name}.` : 'It could not be saved to My shapes.')
    if (saved) { setSaving(false); setName('') }
  }
  return (
    <div className="mapFields">
      <Field label="Rough edge" short>
        <CommitNumber label="How rough the edge is (0 to 100)" value={shape.rough ?? 0} min={0} max={MAP_MAX_ROUGH} step={5} onCommit={onRough} />
      </Field>
      {closed && (
        <div className="mapSizes" role="group" aria-label="Combine with another shape">
          {COMBINE_ACTIONS.map(a => (
            <button key={a.id} type="button" className="mapChip" aria-pressed={combining === a.id} title={a.title} onClick={() => onCombine(combining === a.id ? null : a.id)}>{a.name}</button>
          ))}
        </div>
      )}
      {combining && <p className="mapHint" role="status">{COMBINE_ACTIONS.find(a => a.id === combining)!.title}. Esc stops.</p>}
      {saving ? (
        <div className="mapFields" role="group" aria-label="Save to My shapes">
          <Field label="Name"><CommitText label="Name of the shape in My shapes" value={name || shape.name || ''} max={60} onCommit={setName} autoFocus /></Field>
          <Field label="Kind">
            <select className="mapSelect" aria-label="Kind of shape" value={category} onChange={e => setCategory(e.target.value as MapShapeCategory)}>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <span className="mapRow">
            <button type="button" className="mapIconBtn" aria-label="Save it to My shapes" title="Save it to My shapes" onClick={() => { void save() }}><CheckIcon size={16} /></button>
            <button type="button" className="mapIconBtn" aria-label="Do not save it" title="Do not save it" onClick={() => setSaving(false)}><CloseIcon size={16} /></button>
          </span>
        </div>
      ) : (
        <button type="button" className="mapChip" onClick={() => { setSaving(true); setNote(null) }} title="Keep this shape in My shapes, to place in any project"><SaveIcon size={14} /> Save to My shapes</button>
      )}
      {note && <p className="mapHint" role="status">{note}</p>}
    </div>
  )
}
