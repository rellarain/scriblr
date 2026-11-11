import { useEffect, useState } from 'react'
import { addBasicModel, getPublishedModels } from '../../../../api/characterModelsApi'
import type { CharacterDoc, CharacterFigure, PublishedModelOut } from '../../../../api/types'
import { CloseIcon, DiceIcon, UserIcon } from '../../../icons'
import { genresOf } from '../../admin/characters/engine/colour'
import { seededRng } from '../../admin/characters/engine/previews'
import { ensureFigureModel, useFigureCopy } from './figure/figureModelStore'
import { blankFigure, rollFigure } from './figure/figureState'
import type { Characters } from './useCharacters'

// The art mannequin in the Portrait section (phase 6a): a character with no figure can be given one from a published model (the first look is rolled within a genre). A figure whose
// model copy is here is edited step by step on its own card (figure/FigureEditor.tsx); this panel stays for one whose copy has not arrived (it says so, can roll it again within its
// genre, or put it away and go back to the portrait).
const seed = () => Math.floor(Math.random() * 0x100000000)
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

export function MannequinPanel({ projectId, doc, setFigure }: { projectId: string; doc: CharacterDoc; setFigure: Characters['setFigure'] }) {
  return doc.figure ? <Have figure={doc.figure} setFigure={setFigure} /> : <Make projectId={projectId} setFigure={setFigure} />
}

function Make({ projectId, setFigure }: { projectId: string; setFigure: Characters['setFigure'] }) {
  const [models, setModels] = useState<PublishedModelOut[] | null>(null)
  const [modelId, setModelId] = useState('')
  const [genre, setGenre] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    getPublishedModels().then(r => { if (live) setModels(Array.isArray(r.models) ? r.models : []) }).catch(() => { if (live) { setModels([]); setProblem('The models could not be loaded.') } })
    return () => { live = false }
  }, [tick])
  const chosen = models?.find(m => m.id === modelId) ?? models?.[0]
  const genres = chosen ? genresOf(chosen.content) : []

  // No model is published: the basic adult that comes with the app can be added (the server publishes it), then the list is read again.
  async function addBasic() {
    setBusy(true)
    setProblem('')
    try {
      await addBasicModel()
      setTick(t => t + 1)
    } catch (err) {
      setProblem(message(err, 'The basic model could not be added.'))
    }
    setBusy(false)
  }

  async function make() {
    if (!chosen) return
    setBusy(true)
    setProblem('')
    try {
      const copy = await ensureFigureModel(projectId, { modelId: chosen.id })
      setFigure(rollFigure(copy.content, { ...blankFigure(copy.id, copy.content), genre: genre || null }, seededRng(seed())))
    } catch (err) {
      setProblem(message(err, 'The mannequin could not be made.'))
    }
    setBusy(false)
  }

  return (
    <div className="charMannequin" role="group" aria-label="Mannequin">
      <h4 className="charLabel">Mannequin</h4>
      {models === null && <p className="charHint" role="status">Looking for models…</p>}
      {models !== null && models.length === 0 && !problem && (
        <div className="charRow">
          <p className="charHint">No model is published yet. Models are designed and published in Designer; the basic adult that comes with Scriblr can be added here.</p>
          <button type="button" className="charIconBtn" aria-label="Add the basic model" title="Add the basic model that comes with Scriblr, published" disabled={busy} onClick={() => { void addBasic() }}><UserIcon size={16} /></button>
        </div>
      )}
      {chosen && (
        <div className="charRow">
          <select className="charSelect charSelect--auto" aria-label="Model for the mannequin" value={chosen.id} onChange={e => { setModelId(e.target.value); setGenre('') }}>
            {models!.map(m => <option key={m.id} value={m.id}>{m.content.name}</option>)}
          </select>
          {genres.length > 0 && (
            <select className="charSelect charSelect--auto" aria-label="Genre of the first look" value={genre} onChange={e => setGenre(e.target.value)}>
              <option value="">Any genre</option>
              {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <button type="button" className="charIconBtn" aria-label="Make a mannequin" title="Make a mannequin: copy this model to the character and roll a first look" disabled={busy} onClick={() => { void make() }}><UserIcon size={16} /></button>
        </div>
      )}
      {problem && <p className="charHint" role="alert">{problem}</p>}
      <p className="charHint">A mannequin is drawn from a model, not from the portrait. The character keeps its own copy of the model, so it does not change when the model is published again.</p>
    </div>
  )
}

function Have({ figure, setFigure }: { figure: CharacterFigure; setFigure: Characters['setFigure'] }) {
  const stored = useFigureCopy(figure.model)
  const copy = stored?.content
  const genres = copy ? genresOf(copy) : []
  return (
    <div className="charMannequin" role="group" aria-label="Mannequin">
      <h4 className="charLabel">Mannequin</h4>
      <p className="charHint">{stored ? `Drawn from ${stored.name || copy?.name || 'a model'}${stored.version ? `, version ${stored.version}` : ''}.` : 'The model this was made from is not here, so the portrait is shown.'}</p>
      <div className="charRow">
        {genres.length > 0 && (
          <select className="charSelect charSelect--auto" aria-label="Genre to roll within" value={figure.genre ?? ''} onChange={e => setFigure(f => ({ ...f, genre: e.target.value || null }), 'figure.genre')}>
            <option value="">Any genre</option>
            {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <button type="button" className="charIconBtn charDice" aria-label="Roll a new look" title="Roll a new look within the genre" disabled={!copy} onClick={() => { if (copy) setFigure(f => rollFigure(copy, f, seededRng(seed()))) }}><DiceIcon size={20} /></button>
        <button type="button" className="charIconBtn" aria-label="Go back to the portrait" title="Stop using the mannequin: the character is drawn from its portrait again" onClick={() => setFigure(null)}><CloseIcon size={16} /></button>
      </div>
      <p className="charHint">The portrait below is kept, and is what shows if the mannequin is put away.</p>
    </div>
  )
}
