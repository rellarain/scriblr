import { useParams } from 'react-router-dom'
import { useProject, useUpdateProject } from '../../api/projects'
import type { ProjectPriority, ProjectRoutine } from '../../types'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

function ConfigurationPanel() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useProject(projectId)
  const updateProject = useUpdateProject(projectId ?? '')

  if (isLoading) return <p>Loading configuration…</p>
  if (!data) return null

  const settings = data.index.settings
  const priorities = settings.priorities
  const routines = settings.routines

  function goalField(
    key: 'wordCountTarget' | 'bookCountTarget' | 'chapterCountTarget' | 'bookWordCountTarget' | 'chapterWordCountTarget',
    label: string
  ) {
    return (
      <label className="config-panel__goal-field">
        <span>{label}</span>
        <input
          type="number"
          min={0}
          value={settings[key] ?? ''}
          placeholder="Not set"
          onChange={(e) => {
            const value = e.target.value
            updateProject.mutate({ [key]: value === '' ? undefined : Number(value) })
          }}
        />
      </label>
    )
  }

  function handleAddPriority() {
    const label = prompt('New priority')?.trim()
    if (!label) return
    const next: ProjectPriority[] = [...priorities, { id: newId('pri'), label, order: priorities.length }]
    updateProject.mutate({ priorities: next })
  }

  function handleRemovePriority(id: string) {
    updateProject.mutate({ priorities: priorities.filter((p) => p.id !== id) })
  }

  function handleMovePriority(id: string, direction: -1 | 1) {
    const index = priorities.findIndex((p) => p.id === id)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= priorities.length) return
    const reordered = [...priorities]
    ;[reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]]
    updateProject.mutate({ priorities: reordered.map((p, i) => ({ ...p, order: i })) })
  }

  function handleAddRoutine() {
    const label = prompt('New routine')?.trim()
    if (!label) return
    const next: ProjectRoutine[] = [
      ...routines,
      { id: newId('rtn'), label, daysOfWeek: [], targetWordCount: null },
    ]
    updateProject.mutate({ routines: next })
  }

  function handleRemoveRoutine(id: string) {
    updateProject.mutate({ routines: routines.filter((r) => r.id !== id) })
  }

  function handleToggleRoutineDay(id: string, day: number) {
    const next = routines.map((r) => {
      if (r.id !== id) return r
      const has = r.daysOfWeek.includes(day)
      return { ...r, daysOfWeek: has ? r.daysOfWeek.filter((d) => d !== day) : [...r.daysOfWeek, day].sort() }
    })
    updateProject.mutate({ routines: next })
  }

  function handleSetRoutineTarget(id: string, value: string) {
    const next = routines.map((r) =>
      r.id === id ? { ...r, targetWordCount: value === '' ? null : Number(value) } : r
    )
    updateProject.mutate({ routines: next })
  }

  return (
    <div className="config-panel">
      <section className="config-panel__section">
        <h3>Goals</h3>
        <div className="config-panel__goals">
          {goalField('wordCountTarget', 'Total word count target')}
          {goalField('bookCountTarget', 'Book count target')}
          {goalField('chapterCountTarget', 'Chapter count target')}
          {goalField('bookWordCountTarget', 'Word count target per book')}
          {goalField('chapterWordCountTarget', 'Word count target per chapter')}
        </div>
      </section>

      <section className="config-panel__section">
        <h3>Priorities</h3>
        <ul className="config-panel__priorities">
          {priorities.map((p, i) => (
            <li key={p.id} className="config-panel__priority-row">
              <span className="config-panel__priority-label">{p.label}</span>
              <button type="button" onClick={() => handleMovePriority(p.id, -1)} disabled={i === 0} title="Move up">
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMovePriority(p.id, 1)}
                disabled={i === priorities.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button type="button" onClick={() => handleRemovePriority(p.id)} title="Remove">
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={handleAddPriority}>
          + Add priority
        </button>
      </section>

      <section className="config-panel__section">
        <h3>Routines</h3>
        <ul className="config-panel__routines">
          {routines.map((r) => (
            <li key={r.id} className="config-panel__routine-row">
              <span className="config-panel__routine-label">{r.label}</span>
              <span className="config-panel__routine-days">
                {DAY_LABELS.map((day, i) => (
                  <label key={i} className="config-panel__day-toggle">
                    <input
                      type="checkbox"
                      checked={r.daysOfWeek.includes(i)}
                      onChange={() => handleToggleRoutineDay(r.id, i)}
                    />
                    {day}
                  </label>
                ))}
              </span>
              <input
                type="number"
                min={0}
                className="config-panel__routine-target"
                placeholder="Target words"
                value={r.targetWordCount ?? ''}
                onChange={(e) => handleSetRoutineTarget(r.id, e.target.value)}
              />
              <button type="button" onClick={() => handleRemoveRoutine(r.id)} title="Remove">
                ×
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={handleAddRoutine}>
          + Add routine
        </button>
      </section>
    </div>
  )
}

export default ConfigurationPanel
