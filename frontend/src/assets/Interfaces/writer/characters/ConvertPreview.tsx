import { useEffect, useMemo, useState } from 'react'
import { addBasicModel, getPublishedModels } from '../../../../api/characterModelsApi'
import { getFrozenPortraits } from '../../../../api/charactersApi'
import type { CharacterDoc, ConvertBody, FigureModel, FrozenPortrait } from '../../../../api/types'
import { CheckIcon, CloseIcon, UserIcon } from '../../../icons'
import { convertLines, convertPortrait } from './figure/figureConvert'
import { Figure } from './figure/Figure'
import { ensureFigureModel } from './figure/figureModelStore'
import { Portrait } from './portrait/Portrait'
import type { Characters } from './useCharacters'

// Convert (phase 6c-4): the old portrait of a character and the mannequin it would become, side by side, with what could not be carried over exactly, before anything changes. Pressing
// Convert gives the character its figure, and its captured story looks and the portraits frozen in its published editions theirs, in one step; the old portraits stay where they
// are, so the character can go back (the Mannequin block of the figure's first step). The model is the basic one that comes with Scriblr.
const BASIC = 'basic'
const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error'; text: string } | { state: 'ready'; copy: FigureModel; frozen: FrozenPortrait[] }

export function ConvertPreview({ projectId, doc, convert, onClose }: { projectId: string; doc: CharacterDoc; convert: Characters['convert']; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    ;(async () => {
      try {
        const published = await getPublishedModels()
        if (!(published.models ?? []).some(m => m.id === BASIC)) { if (live) setLoad({ state: 'missing' }); return }
        const [copy, frozen] = await Promise.all([ensureFigureModel(projectId, { modelId: BASIC }), getFrozenPortraits(projectId, doc.id)])
        if (live) setLoad({ state: 'ready', copy, frozen })
      } catch (err) {
        if (live) setLoad({ state: 'error', text: message(err, 'The portrait could not be looked at.') })
      }
    })()
    return () => { live = false }
  }, [projectId, doc.id, tick])

  // What each kind of portrait comes to: the character's own, its story looks that hold a portrait (and no figure of their own) and the cards frozen in editions.
  const plan = useMemo(() => {
    if (load.state !== 'ready') return null
    const { copy, frozen } = load
    const main = convertPortrait(doc.portrait, copy)
    const states = doc.states.filter(s => s.portrait && !(s.figure && !s.figure.converted))
    const editions = frozen.filter(f => !f.hasFigure || f.converted)
    const body: ConvertBody = {
      figure: main.figure,
      states: Object.fromEntries(states.map(s => [s.id, convertPortrait(s.portrait!, copy).figure])),
      editions: editions.map(f => ({ bookId: f.bookId, n: f.n, figure: convertPortrait(f.portrait, copy).figure })),
    }
    return { copy, main, body, looks: states.length, editions: editions.length }
  }, [load, doc.portrait, doc.states])

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

  async function run() {
    if (!plan) return
    setBusy(true)
    setProblem('')
    const done = await convert(plan.body)
    setBusy(false)
    if (done) onClose()
    else setProblem('The portrait could not be converted.')
  }

  const lines = plan ? convertLines(plan.main) : []
  return (
    <section className="charPanel charConvert" role="group" aria-label="Convert to a mannequin">
      <h3 className="charLabel">Convert to a mannequin</h3>
      <p className="charHint">Nothing changes until you convert. The old portrait is kept, so you can go back to it.</p>
      {load.state === 'loading' && <p className="charHint" role="status">Looking at the portrait…</p>}
      {load.state === 'missing' && (
        <div className="charRow">
          <p className="charHint">The basic model that the conversion is made for is not published.</p>
          <button type="button" className="charIconBtn" aria-label="Add the basic model" title="Add the basic model that comes with Scriblr, published" disabled={busy} onClick={() => { void addBasic() }}><UserIcon size={16} /></button>
        </div>
      )}
      {load.state === 'error' && <p className="charHint" role="alert">{load.text}</p>}
      {plan && (
        <>
          <div className="charConvertPair">
            <figure className="charConvertFig">
              <Portrait portrait={doc.portrait} label="The portrait now" crop="card" className="charConvertArt" />
              <figcaption>Now: the portrait</figcaption>
            </figure>
            <figure className="charConvertFig">
              <Figure copy={plan.copy.content} figure={plan.main.figure} crop="bust" label="The mannequin it would become" className="charConvertArt" />
              <figcaption>After: the mannequin</figcaption>
            </figure>
            <figure className="charConvertFig charConvertFig--whole">
              <Figure copy={plan.copy.content} figure={plan.main.figure} crop="figure" label="The whole mannequin" className="charConvertArt" />
              <figcaption>The whole figure</figcaption>
            </figure>
          </div>
          <div className="charConvertList" role="group" aria-label="What changes">
            <h4 className="charLabel">What changes</h4>
            {lines.length === 0 ? <p className="charHint">Everything in the portrait carries over.</p> : <ul>{lines.map(l => <li key={l}>{l}</li>)}</ul>}
          </div>
          {(plan.looks > 0 || plan.editions > 0) && (
            <p className="charHint" role="note">
              {[plan.looks > 0 && `${plan.looks} captured story ${plan.looks === 1 ? 'look' : 'looks'}`, plan.editions > 0 && `the portrait in ${plan.editions} published ${plan.editions === 1 ? 'edition' : 'editions'}`].filter(Boolean).join(' and ')} will be converted with it.
            </p>
          )}
        </>
      )}
      {problem && <p className="charHint" role="alert">{problem}</p>}
      <div className="charRow">
        <button type="button" className="charIconBtn" aria-label="Convert to a mannequin" title="Convert this character: its portrait is kept and can be brought back" disabled={!plan || busy} onClick={() => { void run() }}><CheckIcon size={16} /></button>
        <button type="button" className="charIconBtn" aria-label="Cancel" title="Cancel: nothing changes" disabled={busy} onClick={onClose}><CloseIcon size={16} /></button>
      </div>
    </section>
  )
}
