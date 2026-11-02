import { useMemo } from 'react'
import { emptyPlanner, normalizePlanner, type Planner } from '../../../../lib/facets'
import { useStoredState } from '../shared'

// The project template: one plan for the account (kept in the settings store like the account's own planner), with relative dates (lib/template.ts).
// In the Project console it is an owner of its own, "Template", beside the account and the projects.

export const TEMPLATE_OWNER = 'template'
export const TEMPLATE_KEY = 'scriblr.writer.projectTemplate'

export function useTemplate(): { template: Planner; setTemplate: (p: Planner) => void } {
  const [raw, setTemplate] = useStoredState<Planner>(TEMPLATE_KEY, emptyPlanner())
  const template = useMemo(() => normalizePlanner(raw), [raw])
  return { template, setTemplate }
}
