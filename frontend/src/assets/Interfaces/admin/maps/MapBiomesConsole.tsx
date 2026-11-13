import { useMemo, useState } from 'react'
import type { MapBiomeGroup } from '../../../../api/types'
import { MAP_MAX_BIOMES } from '../../../../api/types'
import { SaveCluster } from '../../../../components/SaveCluster'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon, TrashIcon } from '../../../icons'
import { ColourInput, CommitText } from '../../writer/maps/MapFields'
import { LEVELS } from '../../writer/maps/mapLevels'
import { BIOME_GROUPS, addBiome, biomeFaults, canAdd, editBiome, hasChanges, levelsShown, moveBiome, removeBiome, toggleLevel } from './mapBiomesModel'
import { useMapBiomes } from './useMapBiomes'
import './mapBiomes.scss'

const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

// AUI > Configuration > Maps: the biomes every project draws its maps with. One list (colour, name, group, the levels it is offered on), saved as a draft
// the way the Writer saves (the Save button, and autosave when the user has turned it on) and published as a whole. A published biome taken out of the list
// stays published as retired, so the maps that use it keep its colour; it is no longer offered.
function MapBiomesConsole() {
  const biomes = useMapBiomes()
  const { ui } = useSettings()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const { draft, catalog } = biomes
  const faults = useMemo(() => biomeFaults(draft), [draft])
  const changed = hasChanges(draft, catalog?.published?.biomes ?? null)
  const versions = catalog ? [...(catalog.published ? [catalog.published] : []), ...catalog.history] : []
  const retired = (catalog?.published?.biomes ?? []).filter(b => b.retired)

  if (biomes.status === 'loading') return <p className="mbxNote" role="status">Loading the biomes…</p>
  if (biomes.status === 'error') {
    return (
      <div className="mbxNote" role="alert">
        <p>{biomes.loadError ?? 'The biomes could not be loaded.'}</p>
        <button type="button" className="mbxBtn" onClick={() => void biomes.reload()}>Try again</button>
      </div>
    )
  }

  return (
    <div className="mbxPage">
      <div className="mbxBar">
        <h2 className="mbxBarTitle">Biomes</h2>
        <SaveCluster
          status={biomes.saveStatus} onSave={() => { void biomes.saveNow() }} scope=".mbxPage"
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: biomes.saveCountdown.nextSaveAt, wait: biomes.saveCountdown.wait }}
        />
      </div>
      <div className="mbxState" role="group" aria-label="Publishing">
        <span className="mbxMuted">
          {catalog?.published ? `Published v${catalog.published.version} on ${when(catalog.published.publishedAt)}` : 'Not published'}
          {changed ? ' · the list has changes that are not published' : ''}
        </span>
        <button type="button" className="mbxBtn mbxBtn--primary" disabled={biomes.busy || faults.length > 0 || !changed} title={faults[0] ?? (changed ? `Publish as v${catalog?.nextVersion ?? 1}` : 'Nothing to publish')} onClick={() => { void biomes.publish() }}>
          Publish v{catalog?.nextVersion ?? 1}
        </button>
        <button type="button" className="mbxBtn" disabled={biomes.busy || !changed} title="Put the list back as it is published" onClick={() => { void biomes.discard() }}>Discard changes</button>
        {versions.length > 0 && (
          <span className="mbxRow">
            <select className="mbxSelect" aria-label="A published version to bring back" value={version} onChange={e => setVersion(e.target.value)}>
              <option value="">Bring back a version…</option>
              {versions.map(v => <option key={v.version} value={v.version}>v{v.version} · {when(v.publishedAt)}</option>)}
            </select>
            <button type="button" className="mbxIconBtn" aria-label="Bring this version into the list" title="Bring this version into the list (publish to use it)" disabled={version === '' || biomes.busy} onClick={() => { void biomes.restore(Number(version)); setVersion('') }}><CheckIcon size={16} /></button>
          </span>
        )}
      </div>
      {faults.length > 0 && <ul className="mbxFaults" role="alert">{faults.map(f => <li key={f}>{f}</li>)}</ul>}
      {biomes.actionError && <p className="mbxFaults" role="alert">{biomes.actionError}</p>}
      <p className="mbxMuted">A map draws each biome at sea level in its colour, lighter when higher and darker when lower. A biome is offered on the levels ticked (none: those of its group). Writers can add biomes of their own in a project.</p>
      <ul className="mbxList" aria-label="Biomes">
        {draft.map((b, i) => (
          <li key={b.id} className="mbxItem">
            <div className="mbxRow">
              <ColourInput label={`Colour of ${b.name || 'the biome'}`} value={b.color} onCommit={color => biomes.edit(list => editBiome(list, b.id, { color }), true)} />
              <CommitText label={`Name of ${b.name || 'the biome'}`} value={b.name} max={40} className="mbxInput" onCommit={name => biomes.edit(list => editBiome(list, b.id, { name }))} />
              <select className="mbxSelect" aria-label={`Group of ${b.name}`} value={b.group} onChange={e => biomes.edit(list => editBiome(list, b.id, { group: e.target.value as MapBiomeGroup }), true)}>
                {BIOME_GROUPS.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <span className="mbxTools">
                <button type="button" className="mbxIconBtn" aria-label={`Move ${b.name} up`} title="Move up" disabled={i === 0} onClick={() => biomes.edit(list => moveBiome(list, b.id, -1), true)}><ChevronUpIcon size={16} /></button>
                <button type="button" className="mbxIconBtn" aria-label={`Move ${b.name} down`} title="Move down" disabled={i === draft.length - 1} onClick={() => biomes.edit(list => moveBiome(list, b.id, 1), true)}><ChevronDownIcon size={16} /></button>
                {confirming === b.id ? (
                  <span className="mbxConfirm" role="group" aria-label={`Remove ${b.name}?`}>
                    <button type="button" className="mbxIconBtn" aria-label="Confirm remove" title="Confirm remove" onClick={() => { setConfirming(null); biomes.edit(list => removeBiome(list, b.id), true) }}><CheckIcon size={16} /></button>
                    <button type="button" className="mbxIconBtn" aria-label="Cancel remove" title="Cancel" onClick={() => setConfirming(null)}><CloseIcon size={16} /></button>
                  </span>
                ) : (
                  <button type="button" className="mbxIconBtn" aria-label={`Remove ${b.name}`} title={`Remove ${b.name} (maps that use it keep its colour)`} onClick={() => setConfirming(b.id)}><TrashIcon size={16} /></button>
                )}
              </span>
            </div>
            <div className="mbxLevels" role="group" aria-label={`Levels ${b.name} is offered on`}>
              {LEVELS.map(lv => {
                const on = levelsShown(b).includes(lv.id)
                return (
                  <button
                    key={lv.id} type="button" className="mbxChip" aria-pressed={on} title={on ? `Offered on ${lv.name.toLowerCase()} maps` : `Not offered on ${lv.name.toLowerCase()} maps`}
                    onClick={() => biomes.edit(list => editBiome(list, b.id, { levels: toggleLevel(b, lv.id) }), true)}
                  >{lv.name}</button>
                )
              })}
              {b.levels.length === 0 && <span className="mbxMuted">as its group</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="mbxRow">
        <button type="button" className="mbxIconBtn" aria-label="Add a biome" disabled={!canAdd(draft)} title={canAdd(draft) ? 'Add a biome' : `The list holds at most ${MAP_MAX_BIOMES} biomes`} onClick={() => biomes.edit(addBiome, true)}><PlusIcon size={16} /></button>
        <span className="mbxMuted">{draft.length} of {MAP_MAX_BIOMES}</span>
      </div>
      {retired.length > 0 && (
        <p className="mbxMuted">Retired (kept for the maps that use them): {retired.map(b => b.name).join(', ')}.</p>
      )}
    </div>
  )
}

export default MapBiomesConsole
