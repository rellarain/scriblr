import { useCallback, useMemo, useState } from 'react'
import type { CharacterFigure, FigureModel } from '../../../../../api/types'
import { BackIcon, ChevronLeftIcon, DiceIcon, FrontIcon, UnlockIcon } from '../../../../icons'
import { genresOf } from '../../../admin/characters/engine/colour'
import { framesOf } from '../../../admin/characters/engine/frames'
import { seededRng } from '../../../admin/characters/engine/previews'
import type { View } from '../../../admin/characters/engine/rig'
import type { Characters } from '../useCharacters'
import { FigureCard } from './FigureCard'
import { ALL_LAYERS, objectPartOf, regionOfObject, regionsOf, unlockAll, type Layers } from './figureEditing'
import { rollFigure, type Crop } from './figureState'
import { FigureStep, ObjectStep, RegionStep, type Apply, type Ctx } from './FigureSteps'

// The writer's editor of a figure, in the character card (phase 6b-2): the figure on its card with the model's frames laid on it as sheets, and under it (beside it when the console is
// wide) the controls, one step at a time. Step 0 is the figure; click a sheet for step 1, what that part of the figure holds; click a part of the card for step 2, that part. Back
// goes one step up. The view (front or back), the frame the card looks through and where the writer is are the editor's own and are not saved; what is chosen is saved on the
// character's figure, and undone with the page's Undo. Randomise rolls the whole figure inside its genre; each step has a dice for just that part.
const seed = (): number => Math.floor(Math.random() * 0x100000000)

export function FigureEditor({ projectId, figure, model, label, setFigure }: { projectId: string; figure: CharacterFigure; model: FigureModel; label: string; setFigure: Characters['setFigure'] }) {
  const copy = model.content
  const [view, setView] = useState<View>('front')
  const [frameId, setFrameId] = useState<string | null>(null)
  const [region, setRegion] = useState<string | null>(null)
  const [objectId, setObjectId] = useState<string | null>(null)
  const [layers, setLayers] = useState<Layers>(ALL_LAYERS)

  const regions = useMemo(() => regionsOf(copy), [copy])
  const frames = framesOf(copy)
  const genres = genresOf(copy)
  const crop: Crop = frameId && frames.some(f => f.id === frameId) ? { frame: frameId } : 'figure'
  const apply: Apply = useCallback((op, group) => setFigure(op, group ?? null), [setFigure])

  const openRegion = (id: string) => { setRegion(id); setObjectId(null) }
  const openObject = useCallback((id: string) => { setObjectId(id); setRegion(regionOfObject(copy, id)) }, [copy])
  const back = () => { if (objectId) setObjectId(null); else setRegion(null) }
  const ctx: Ctx = { copy, figure, apply, onObject: openObject }

  const part = objectId ? objectPartOf(copy, figure, objectId) : null
  const here = regions.find(r => r.id === region)
  const crumbs: Array<{ name: string; go: () => void; current: boolean }> = [{ name: 'Figure', go: () => { setRegion(null); setObjectId(null) }, current: !here }]
  if (here) crumbs.push({ name: here.name, go: () => setObjectId(null), current: !part })
  if (part) crumbs.push({ name: part.object.name, go: () => undefined, current: true })

  return (
    <div className="charFigWrap"><div className="charFigEdit">
      <div className="charFigTools" role="toolbar" aria-label="View and frame">
        <div className="charRow charFigViews" role="group" aria-label="View">
          <button type="button" className="charIconBtn" aria-pressed={view === 'front'} aria-label="Front view" title="Front view" onClick={() => setView('front')}><FrontIcon size={18} /></button>
          <button type="button" className="charIconBtn" aria-pressed={view === 'back'} aria-label="Back view" title="Back view: the figure turned round, with the sheets in front of it" onClick={() => setView('back')}><BackIcon size={18} /></button>
        </div>
        {frames.length > 0 && (
          <div className="charRow charFigFrames" role="group" aria-label="Frame">
            <button type="button" className="charChip" aria-pressed={crop === 'figure'} title="Look at the whole figure" onClick={() => setFrameId(null)}>Whole figure</button>
            {frames.map(f => (
              <button key={f.id} type="button" className="charChip" aria-pressed={typeof crop !== 'string' && crop.frame === f.id} title={`Look through the ${f.name} frame`} onClick={() => setFrameId(f.id)}>{f.name}</button>
            ))}
          </div>
        )}
        <div className="charRow charFigRoll" role="group" aria-label="Randomise">
          {genres.length > 0 && (
            <select className="charSelect charSelect--auto" aria-label="Genre to roll within" title="The genre Randomise draws its colours from" value={figure.genre ?? ''} onChange={e => apply(f => ({ ...f, genre: e.target.value || null }), 'figure.genre')}>
              <option value="">Any genre</option>
              {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button type="button" className="charIconBtn charDice" aria-label="Roll a new look" title="Roll a new look within the genre: everything that is not locked" onClick={() => apply(f => rollFigure(copy, f, seededRng(seed())))}><DiceIcon size={20} /></button>
        </div>
        {figure.locks.length > 0 && (
          <div className="charRow charFigLocks" role="group" aria-label="Locks">
            <span className="charHint">{figure.locks.length} locked</span>
            <button type="button" className="charIconBtn" aria-label="Unlock all" title="Unlock every part: Randomise may change them all again" onClick={() => apply(f => unlockAll(f))}><UnlockIcon size={16} /></button>
          </div>
        )}
      </div>

      <div className="charFigStage">
        <FigureCard copy={copy} figure={figure} view={view} crop={crop} region={region} objectId={objectId} layers={layers} label={label} onRegion={openRegion} onObject={openObject} />
      </div>

      <section className="charPanel charFigSteps" aria-label="Edit the figure">
        <nav className="charFigCrumbs" aria-label="Where you are">
          {here && <button type="button" className="charIconBtn" aria-label="Back" title="Back one step" onClick={back}><ChevronLeftIcon size={16} /></button>}
          {crumbs.map((c, i) => <button key={`${c.name}${i}`} type="button" className="charFigCrumb" aria-current={c.current ? 'step' : undefined} onClick={c.go}>{c.name}</button>)}
        </nav>
        {part ? <ObjectStep ctx={ctx} part={part} />
          : here ? <RegionStep ctx={ctx} regionId={here.id} regionName={here.name} layers={layers} onLayers={setLayers} />
          : <FigureStep ctx={ctx} projectId={projectId} model={model} describe={`Drawn from ${model.name || copy.name || 'a model'}${model.version ? `, version ${model.version}` : ''}.`} onForget={() => setFigure(null)} />}
      </section>
    </div></div>
  )
}
