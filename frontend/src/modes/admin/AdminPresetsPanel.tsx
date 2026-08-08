import { useEffect, useRef, useState } from 'react'
import { usePresets, useSavePresets } from '../../api/presets'
import type { PresetCatalog, PresetCategory } from '../../types'
import TrashIcon from '../../components/shared/TrashIcon'

const EDIT_SAVE_DELAY_MS = 500

function newPresetId(): string {
  return `preset_${crypto.randomUUID().slice(0, 8)}`
}

// Global (not project-scoped) CRUD editor for the plot-category preset
// catalog, reachable from the project picker's "Admin" toggle. Presets are
// just seed data for a category's customFieldDefs -- editing/deleting one
// here never touches categories already created from it in any project.
function AdminPresetsPanel() {
  const { data, isLoading } = usePresets()
  const savePresets = useSavePresets()

  const [presets, setPresets] = useState<PresetCategory[]>([])
  const schemaVersionRef = useRef(1)
  const presetsRef = useRef<PresetCategory[]>([])
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (data) {
      setPresets(data.presets)
      presetsRef.current = data.presets
      schemaVersionRef.current = data.schemaVersion
    }
  }, [data])

  useEffect(() => {
    presetsRef.current = presets
  }, [presets])

  function saveNow(next: PresetCategory[]) {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    const catalog: PresetCatalog = { schemaVersion: schemaVersionRef.current, presets: next }
    savePresets.mutate(catalog)
  }

  function scheduleSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => saveNow(presetsRef.current), EDIT_SAVE_DELAY_MS)
  }

  function handleAddPreset() {
    const next = [...presetsRef.current, { id: newPresetId(), name: '', fields: [] }]
    setPresets(next)
    saveNow(next)
  }

  function handleRemovePreset(preset: PresetCategory) {
    if (!confirm(`Delete the "${preset.name || 'Untitled'}" preset? This cannot be undone.`)) return
    const next = presetsRef.current.filter((p) => p.id !== preset.id)
    setPresets(next)
    saveNow(next)
  }

  function handleRenamePreset(id: string, name: string) {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
    scheduleSave()
  }

  function handleAddField(presetId: string) {
    const next = presetsRef.current.map((p) => (p.id === presetId ? { ...p, fields: [...p.fields, ''] } : p))
    setPresets(next)
    saveNow(next)
  }

  function handleRenameField(presetId: string, index: number, value: string) {
    setPresets((prev) =>
      prev.map((p) =>
        p.id === presetId ? { ...p, fields: p.fields.map((f, i) => (i === index ? value : f)) } : p
      )
    )
    scheduleSave()
  }

  function handleRemoveField(presetId: string, index: number) {
    const next = presetsRef.current.map((p) =>
      p.id === presetId ? { ...p, fields: p.fields.filter((_, i) => i !== index) } : p
    )
    setPresets(next)
    saveNow(next)
  }

  if (isLoading) return <p>Loading presets…</p>

  return (
    <div className="admin-presets">
      <p className="admin-presets__hint">
        These presets appear in the "Add category" picker in every project's Plot sidebar. Editing or
        removing a preset here only changes what's offered going forward — it never affects categories
        already created from it.
      </p>
      <ul className="admin-presets__list">
        {presets.map((preset) => (
          <li key={preset.id} className="admin-presets__preset">
            <div className="admin-presets__preset-header">
              <input
                className="admin-presets__preset-name"
                value={preset.name}
                placeholder="Preset name"
                onChange={(e) => handleRenamePreset(preset.id, e.target.value)}
              />
              <button type="button" onClick={() => handleRemovePreset(preset)} title="Delete preset">
                <TrashIcon /> Delete
              </button>
            </div>
            <div className="admin-presets__fields">
              {preset.fields.map((field, i) => (
                <span key={i} className="admin-presets__field-chip">
                  <input
                    value={field}
                    placeholder="Field name"
                    onChange={(e) => handleRenameField(preset.id, i, e.target.value)}
                  />
                  <button type="button" onClick={() => handleRemoveField(preset.id, i)} title="Remove field">
                    ×
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => handleAddField(preset.id)}>
                + Add field
              </button>
            </div>
          </li>
        ))}
      </ul>
      {presets.length === 0 && <p className="admin-presets__empty">No presets yet.</p>}
      <button type="button" onClick={handleAddPreset}>
        + Add preset
      </button>
    </div>
  )
}

export default AdminPresetsPanel
