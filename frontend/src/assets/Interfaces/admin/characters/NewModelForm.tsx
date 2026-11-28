import { useEffect, useState } from 'react'
import { getBodyTemplate, getBodyTemplates } from '../../../../api/characterModelsApi'
import type { BodyTemplateInfo, ModelContent } from '../../../../api/types'
import { CanvasForm } from './CanvasForm'
import { normalizeContent, starterContent } from './modelContent'

// New model (slice 9a): a new model starts from a body (one of the body templates, on its proportion guide, its right side the twin of its left) or from a blank canvas. The
// form says what the chosen body is and shows it; Make the model reads the body and hands its model over (`onMake`), named after the body.
export function NewModelForm({ onMake, onClose }: { onMake: (content: ModelContent) => void; onClose: () => void }) {
  const [from, setFrom] = useState<'body' | 'blank'>('body')
  const [bodies, setBodies] = useState<BodyTemplateInfo[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    getBodyTemplates()
      .then(r => { if (live) { setBodies(r.templates); setChosen(r.templates[0]?.id ?? '') } })
      .catch(() => { if (live) { setBodies([]); setError('The bodies could not be loaded: start from a blank canvas.') } })
    return () => { live = false }
  }, [])
  const body = bodies?.find(b => b.id === chosen)
  const canBody = !!bodies && bodies.length > 0

  async function make() {
    if (from === 'blank' || !canBody) { onMake(starterContent()); return }
    setBusy(true)
    try {
      const t = await getBodyTemplate(chosen)
      onMake(normalizeContent({ ...t.content, name: t.name }))
    } catch {
      setError('That body could not be read. Try again, or start from a blank canvas.')
      setBusy(false)
    }
  }

  return (
    <div className="cmNewModelHost">
      <CanvasForm at={{ left: 24, top: 20 }} label="New model" className="cmNewModel" onClose={onClose}>
        <b className="cmNewModelTitle">New model</b>
        <span className="cmNewModelLabel" id="cm-new-from">Start from</span>
        <div className="cmChips" role="group" aria-labelledby="cm-new-from">
          <button type="button" className={`cmChip cmChip--wide${from === 'body' ? ' cmChip--on' : ''}`} aria-pressed={from === 'body'} data-choice={from === 'body' ? 'on' : undefined} disabled={!canBody} onClick={() => setFrom('body')}>A body</button>
          <button type="button" className={`cmChip cmChip--wide${from === 'blank' ? ' cmChip--on' : ''}`} aria-pressed={from === 'blank'} data-choice={from === 'blank' ? 'on' : undefined} onClick={() => setFrom('blank')}>A blank canvas</button>
        </div>
        {from === 'body' && canBody && (
          <>
            <label className="cmField">
              <span>Body</span>
              <select value={chosen} onChange={e => setChosen(e.target.value)}>
                {bodies!.map(b => <option key={b.id} value={b.id}>{`${b.name} · ${headsText(b.heads)} heads`}</option>)}
              </select>
            </label>
            {body && (
              <div className="cmNewModelBody">
                {body.thumb && <img className="cmNewModelPic" src={`data:image/svg+xml,${encodeURIComponent(body.thumb)}`} alt="" />}
                <span className="cmInsText">{body.note} Its right side mirrors its left, and it stands on a proportion guide that shapes snap to.</span>
              </div>
            )}
          </>
        )}
        {from === 'blank' && <span className="cmInsText">An empty model with the standard colour slots; draw its first shape from a template.</span>}
        {error && <span className="cmInsText" role="alert">{error}</span>}
        {bodies === null && from === 'body' && <span className="cmInsText" role="status">Loading the bodies…</span>}
        <div className="cmNewModelFoot">
          <button type="button" className="cmBtn" onClick={onClose}>Cancel</button>
          <button type="button" className="cmBtn cmBtn--primary" disabled={busy || (from === 'body' && !body)} onClick={() => void make()}>Make the model</button>
        </div>
      </CanvasForm>
    </div>
  )
}

// 7.5 as "7½", 7.25 as "7¼"
function headsText(h: number): string {
  const whole = Math.floor(h), frac = Math.round((h - whole) * 4)
  return frac === 0 ? String(whole) : frac === 4 ? String(whole + 1) : `${whole}${['', '¼', '½', '¾'][frac]}`
}
