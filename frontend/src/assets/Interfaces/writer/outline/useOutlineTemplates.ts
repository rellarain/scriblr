import { TEMPLATE_NAME_MAX, type OutlineTemplate, type TemplateKind } from '../../../../lib/outlineTemplates'
import { useStoredState } from '../storage'

// The writer's outline templates, for every project: kept in the settings store (account-wide, like the project template), so every list
// and menu that shows them follows a change made in another.
export const OUTLINE_TEMPLATES_KEY = 'scriblr.writer.outlineTemplates'

export function useOutlineTemplates() {
  const [stored, setStored] = useStoredState<OutlineTemplate[]>(OUTLINE_TEMPLATES_KEY, [])
  const templates = Array.isArray(stored) ? stored : []
  return {
    templates,
    // A kind's templates, by name.
    ofKind: (kind: TemplateKind) => templates.filter(t => t.kind === kind).sort((a, b) => a.name.localeCompare(b.name)),
    save: (t: OutlineTemplate) => setStored(prev => [...(Array.isArray(prev) ? prev : []), t]),
    rename: (id: string, name: string) => {
      const clean = name.trim().slice(0, TEMPLATE_NAME_MAX)
      if (clean) setStored(prev => (Array.isArray(prev) ? prev : []).map(t => (t.id === id ? { ...t, name: clean } : t)))
    },
    remove: (id: string) => setStored(prev => (Array.isArray(prev) ? prev : []).filter(t => t.id !== id)),
  }
}
