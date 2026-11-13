import { useEffect, useState } from 'react'
import { getWriterLimits, putWriterLimits } from '../../../../api/characterModelsApi'
import type { WriterModelLimits } from '../../../../api/types'
import { SaveCluster } from '../../../../components/SaveCluster'
import { combineSaveStatus, useAutosave } from '../../../../lib/useAutosave'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { UndoIcon } from '../../../icons'
import { Stepper } from './Stepper'
import { WRITER_LIMIT_ROWS, defaultWriterLimits, isTightened, normalizeWriterLimits, stepWriterLimit } from './engine/writerLimits'
import './characterModels.scss'

// AUI > Configuration > Writers' designer: how big the models a writer designs for themselves may be (the Characters console's My models). Each limit starts at the admin's own
// limit, the most it can be, and is stepped down from there; a writer is stopped at the limit as they edit, and a model over it is refused when it is published. Edits save the way
// the rest of the Admin's do: the Save button, and autosave when it is turned on.
export default function WriterLimitsConsole() {
  const { ui } = useSettings()
  const [limits, setLimits] = useState<WriterModelLimits | null>(null)
  const [loadError, setLoadError] = useState('')
  const save = useAutosave<WriterModelLimits>({
    save: async next => {
      const kept = await putWriterLimits(next)
      // what the server kept is what is shown, unless the admin has stepped on since
      setLimits(shown => (shown && JSON.stringify(shown) !== JSON.stringify(next) ? shown : normalizeWriterLimits(kept)))
    },
  })
  const load = () => {
    setLoadError('')
    getWriterLimits().then(raw => setLimits(normalizeWriterLimits(raw))).catch(() => setLoadError('The limits could not be loaded.'))
  }
  useEffect(load, [])

  function change(next: WriterModelLimits) {
    setLimits(next)
    save.schedule(next)
  }

  if (loadError) {
    return (
      <div className="cmNote" role="alert">
        <p>{loadError}</p>
        <button type="button" className="cmBtn" onClick={load}>Try again</button>
      </div>
    )
  }
  if (!limits) return <p className="cmNote" role="status">Loading the limits…</p>

  return (
    <section className="cmPage wlPage" aria-label="Writer model limits">
      <div className="wlHead">
        <h2 className="wlTitle">Limits for the models writers design</h2>
        <SaveCluster
          status={combineSaveStatus(save)}
          onSave={() => { void save.flush() }} scope=".wlPage"
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: save.nextSaveAt, wait: save.wait }}
        />
      </div>
      <p className="cmInsText">
        A writer designs models of their own in the Characters console (My models). They can make a model as big as these limits allow: each starts at your own limit, the most it can be,
        and goes down from there. A writer is stopped when an edit would pass a limit, and a model over one cannot be published until it fits. A model that is published already stays as it is,
        and a writer can still duplicate a big model and trim it. The basic adult that comes with Scriblr is a big model, so a limit well below your own keeps a writer from publishing an unchanged copy of it.
      </p>
      <div className="wlRows" role="group" aria-label="Limits">
        {WRITER_LIMIT_ROWS.map(r => (
          <div key={r.key} className="wlRow">
            <Stepper
              label={r.label} value={String(limits[r.key])} bigBy={r.big}
              onStep={(dir, big) => change(stepWriterLimit(limits, r.key, dir, big))}
              lowerOff={limits[r.key] <= r.floor} raiseOff={limits[r.key] >= r.ceiling}
            />
            <small className="wlCeil">Your own limit: {r.ceiling}{limits[r.key] < r.ceiling ? '' : ' (not lowered)'}</small>
          </div>
        ))}
      </div>
      <div className="cmFoot">
        <button type="button" className="cmBtn" disabled={!isTightened(limits)} title="Put every limit back to your own" onClick={() => change(defaultWriterLimits())}>
          <UndoIcon size={12} /> Back to your own limits
        </button>
      </div>
    </section>
  )
}
