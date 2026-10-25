import { useRef, useState, type ChangeEvent } from 'react'
import { SaveCluster } from '../../../../components/SaveCluster'
import { focusNodeField } from '../../../../lib/nodeKeys'
import { setAutosaveMode, useSettings } from '../../../../settings/settingsStore'
import { autosaveModeOf } from '../../../../theme/types'
import type { PresetEntry } from '../../../../api/types'
import { PresetList } from './PresetList'
import { PresetPane } from './PresetPane'
import { PresetFileError, downloadTextFile, exportFileName, parsePresetFile, readFileText, serializePresets } from './presetFile'
import { blankContent, randomId } from './presetModel'
import { usePlotPresets } from './usePlotPresets'
import './plotPresets.scss'

// What an import did, shown until it is dismissed.
interface ImportNotice { tone: 'ok' | 'error'; lines: string[] }

// AUI > Configuration > Plot: the plot presets the Writer's "+ Preset" offers. A list of presets and, beside it, the open one as a tree of cards;
// edits save to the draft the way the Writer's do (the Save button, and autosave when the user has turned it on), and each preset is published
// on its own.
function PlotPresetsConsole() {
  const presets = usePlotPresets()
  const { ui } = useSettings()
  const { entries } = presets
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [notice, setNotice] = useState<ImportNotice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const current: PresetEntry | undefined = entries.find(e => e.id === selectedId) ?? entries[0]

  function select(id: string) {
    setSelectedId(id)
    setListOpen(false)
  }

  function create() {
    const id = presets.addPreset(blankContent())
    select(id)
    focusNodeField(id, 'first')
  }

  function remove(id: string) {
    const at = entries.findIndex(e => e.id === id)
    const next = entries[at + 1] ?? entries[at - 1]
    presets.removePreset(id)
    setSelectedId(next?.id ?? null)
  }

  function exportEntries(list: PresetEntry[]) {
    const contents = list.map(e => e.draft)
    downloadTextFile(exportFileName(contents), serializePresets(contents))
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { presets: found, skipped } = parsePresetFile(await readFileText(file))
      const added = await presets.importPresets(found)
      if (added[0]) select(added[0].id)
      const skippedLines = skipped.map(s => `Skipped: ${s}`)
      setNotice(added.length === 0
        ? { tone: 'error', lines: ['Nothing in the file could be imported.', ...skippedLines] }
        : {
          tone: 'ok',
          lines: [`Imported ${added.length} preset${added.length === 1 ? '' : 's'} as drafts. They stay unpublished until you publish them.`, added.map(a => a.name).join(' · '), ...skippedLines],
        })
    } catch (err) {
      setNotice({ tone: 'error', lines: [err instanceof PresetFileError ? err.message : 'The file could not be read.'] })
    }
  }

  if (presets.status === 'loading') return <p className="plpNote" role="status">Loading the plot presets…</p>
  if (presets.status === 'error') {
    return (
      <div className="plpNote" role="alert">
        <p>{presets.loadError ?? 'The plot presets could not be loaded.'}</p>
        <button type="button" className="plpBtn" onClick={() => void presets.reload()}>Try again</button>
      </div>
    )
  }

  return (
    <div className="plpPage">
      <div className="plpBar">
        <h2 className="plpBarTitle">Plot presets</h2>
        <SaveCluster
          status={presets.saveStatus} onSave={() => { void presets.saveNow() }} scope=".plpPage"
          autosave={{ mode: autosaveModeOf(ui), onChange: setAutosaveMode, nextSaveAt: presets.saveCountdown.nextSaveAt, wait: presets.saveCountdown.wait }}
        />
      </div>
      {notice && (
        <div className={`plpToast${notice.tone === 'error' ? ' plpToast--error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <p><b>{notice.lines[0]}</b></p>
          {notice.lines.slice(1).map(line => <small key={line}>{line}</small>)}
          <button type="button" className="plpLink" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Import plot presets from a file" onChange={e => void onFile(e)} />
      {entries.length === 0 ? (
        <div className="plpEmpty">
          <h3>No presets yet</h3>
          <p>A preset is a ready-made category with its description, keywords, fields, subcategories and clusters. Create one, or import a file.</p>
          <div className="plpFoot">
            <button type="button" className="plpBtn plpBtn--primary" onClick={create}>New preset</button>
            <button type="button" className="plpBtn" onClick={() => fileInput.current?.click()}>Import</button>
          </div>
        </div>
      ) : (
        <div className="plpSplit">
          <PresetList
            entries={entries} current={current} open={listOpen} onToggle={() => setListOpen(o => !o)} onSelect={select}
            onNew={create} onImport={() => fileInput.current?.click()} onExportAll={() => exportEntries(entries)} onMove={presets.movePreset}
          />
          {current && (
            <PresetPane
              entry={current} presets={presets} makeId={randomId} onSelect={select} onRemove={remove} onExport={e => exportEntries([e])}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default PlotPresetsConsole
