import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import type { ModelsApi } from '../../../../api/characterModelsApi'
import type { ModelGuide, ModelTrace, ModelTraceSettings } from '../../../../api/types'
import { CloseIcon, ImageIcon } from '../../../icons'
import { Stepper } from './Stepper'

// A picture to trace (slice 9b): a reference picture under the canvas, faded and locked, to draw over. It is kept beside the model's draft on the server, never in the
// model, so it is never published and writers never see it. Choosing one fits it to the proportion guide; unlocked, it can be dragged into place on the canvas.

export const TRACE_MAX_BYTES = 10 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const r2 = (v: number) => Math.round(v * 100) / 100

// The picture's width for its height (null when it cannot be read in a moment: a picture is then taken to be half as wide as it is tall).
function aspectOf(src: string): Promise<number | null> {
  return new Promise(resolve => {
    const img = new Image()
    const done = (v: number | null) => { clearTimeout(timer); resolve(v) }
    const timer = setTimeout(() => done(null), 400)
    img.onload = () => done(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null)
    img.onerror = () => done(null)
    img.src = src
  })
}

// The box a picture fills when it is fitted to the guide: as tall as the guide (the crown to its lowest line, at least seven and a half heads), on the middle.
export function fitBox(guide: ModelGuide | null | undefined, axis: number, aspect: number): Pick<ModelTraceSettings, 'x' | 'y' | 'w' | 'h'> {
  const top = guide ? guide.top : 10
  const bottom = guide ? Math.max(guide.top + 7.5 * guide.head, ...guide.lines.map(l => l.y)) : 430
  const h = Math.max(1, bottom - top), w = Math.max(1, h * aspect)
  return { x: r2(axis - w / 2), y: r2(top), w: r2(w), h: r2(h) }
}

const settingsOf = (t: ModelTrace): ModelTraceSettings => ({ name: t.name, opacity: t.opacity, locked: t.locked, shown: t.shown, x: t.x, y: t.y, w: t.w, h: t.h })

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// The model's picture: read when the model opens, chosen (fitted to the guide), changed (saved a moment after the last change, so a drag saves once) and taken away.
export function useModelTrace(api: ModelsApi, modelId: string, guide: ModelGuide | null | undefined, axis: number) {
  const [trace, setTraceState] = useState<ModelTrace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<ModelTrace | null>(null)
  useEffect(() => {
    let live = true
    setTraceState(null); latest.current = null; setError(null)
    api.getTrace(modelId).then(t => { if (live) { setTraceState(t); latest.current = t } }).catch(() => { /* no picture */ })
    return () => { live = false }
  }, [api, modelId])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const choose = useCallback(async (file: File) => {
    setError(null)
    if (!TYPES.includes(file.type)) { setError('Choose a PNG, JPEG, WebP or GIF picture.'); return }
    if (file.size > TRACE_MAX_BYTES) { setError('The picture is larger than 10 MB.'); return }
    try {
      const image = await readFile(file)
      const aspect = (await aspectOf(image)) ?? 0.5
      const keep = latest.current
      const next: ModelTrace = { image, name: file.name.slice(0, 80), opacity: keep?.opacity ?? 0.35, locked: keep?.locked ?? true, shown: true, ...fitBox(guide, axis, aspect) }
      const saved = await api.putTrace(modelId, next)
      setTraceState(saved); latest.current = saved
    } catch {
      setError('The picture could not be kept. Try again.')
    }
  }, [api, modelId, guide, axis])

  const change = useCallback((patch: Partial<ModelTraceSettings>) => {
    const cur = latest.current
    if (!cur) return
    const next = { ...cur, ...patch }
    latest.current = next
    setTraceState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { api.setTrace(modelId, settingsOf(next)).catch(() => setError('The change to the picture could not be kept.')) }, 300)
  }, [api, modelId])

  const fit = useCallback(async () => {
    const cur = latest.current
    if (!cur) return
    const aspect = cur.h > 0 ? cur.w / cur.h : 0.5
    change(fitBox(guide, axis, (await aspectOf(cur.image)) ?? aspect))
  }, [change, guide, axis])

  const remove = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    try { await api.deleteTrace(modelId); setTraceState(null); latest.current = null } catch { setError('The picture could not be taken away. Try again.') }
  }, [api, modelId])

  return { trace, error, choose, change, fit, remove }
}
export type TraceActions = ReturnType<typeof useModelTrace>

export function TraceSection({ actions }: { actions: TraceActions }) {
  const { trace, error } = actions
  const input = useRef<HTMLInputElement>(null)
  const pick = () => input.current?.click()
  const onFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void actions.choose(f) }
  const op = trace ? Math.round(trace.opacity * 100) : 35
  const resize = (dir: -1 | 1, big: boolean) => {
    if (!trace) return
    const k = 1 + dir * (big ? 0.25 : 0.05), w = Math.max(1, trace.w * k), h = Math.max(1, trace.h * k)
    actions.change({ x: r2(trace.x + (trace.w - w) / 2), w: r2(w), h: r2(h) })
  }
  return (
    <div className="cmDraw" role="group" aria-label="Picture to trace">
      <h3 className="cmInsSub">Picture to trace</h3>
      <input ref={input} type="file" accept={TYPES.join(',')} hidden aria-label="Choose a picture to trace" onChange={onFile} />
      {!trace ? (
        <div className="cmInline"><button type="button" className="cmBtn cmBtn--small" onClick={pick}><ImageIcon size={12} /> Choose a picture</button></div>
      ) : (
        <>
          <div className="cmTraceName">
            <ImageIcon size={14} /><span>{trace.name || 'Picture'}</span>
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label="Take the picture away" title="Take the picture away" onClick={() => void actions.remove()}><CloseIcon size={12} /></button>
          </div>
          <Stepper label="Opacity of the picture" value={`${op}%`} lowerOff={op <= 5} raiseOff={op >= 100} bigBy={25} onStep={(dir, big) => actions.change({ opacity: Math.min(1, Math.max(0.05, (op + dir * (big ? 25 : 5)) / 100)) })} />
          <Stepper label="Size of the picture" value={`${Math.round(trace.h)} tall`} lowerOff={trace.h <= 2} bigBy={25} onStep={resize} />
          <div className="cmInline">
            <button type="button" className={`cmBtn cmBtn--small${trace.locked ? ' cmBtn--on' : ''}`} aria-pressed={trace.locked} title={trace.locked ? 'Unlock it to drag it into place on the canvas' : 'Lock it so a click goes through to the shapes'} onClick={() => actions.change({ locked: !trace.locked })}>Locked</button>
            <button type="button" className={`cmBtn cmBtn--small${trace.shown ? ' cmBtn--on' : ''}`} aria-pressed={trace.shown} onClick={() => actions.change({ shown: !trace.shown })}>Shown</button>
            <button type="button" className="cmBtn cmBtn--small" onClick={() => void actions.fit()}>Fit to the guide</button>
            <button type="button" className="cmBtn cmBtn--small" onClick={pick}>Replace</button>
          </div>
        </>
      )}
      {error && <p className="cmInsText" role="alert">{error}</p>}
      <p className="cmInsText">Under the canvas, faded and locked, to draw over. Kept with the draft only: never published, never seen by writers.{trace && !trace.locked ? ' Drag it on the canvas to move it.' : ''}</p>
    </div>
  )
}
