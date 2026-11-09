import type { ModelAxis, ModelContent, ModelForm, ModelObject, ModelPoint, ModelPreset } from '../../../../../api/types'

// Forms: an object has axes (eye shape, expression, style), each with forms, and shows one form of every axis. What the admin has chosen is test state (like the
// Try it sliders): `Choices` maps "objectId.axisId" to a form id and is never saved. A form changes the outline of some of the object's shapes; a shape no form
// changes keeps its base outline. This file only reads (the solver uses it); formEdit.ts changes.

export type Choices = Record<string, string>
export const formKey = (objectId: string, axisId: string): string => `${objectId}.${axisId}`
export const axesOf = (o: ModelObject): ModelAxis[] => o.axes ?? []
export const presetsOf = (c: ModelContent): ModelPreset[] => c.presets ?? []

// The form an axis shows: the chosen one, or the one it shows by default (an unknown id falls back to that too).
export function chosenForm(o: ModelObject, axis: ModelAxis, choices: Choices): ModelForm | undefined {
  const id = choices[formKey(o.id, axis.id)]
  return axis.options.find(f => f.id === id) ?? axis.options.find(f => f.id === axis.initial) ?? axis.options[0]
}

// The outline the forms give a shape: the first axis (in order) whose chosen form has an override for it wins (they are not merged). undefined: no form changes
// it, so it keeps its base outline; an empty list: the form hides it.
export function overrideFor(o: ModelObject, shapeId: string, choices: Choices): ModelPoint[] | undefined {
  for (const axis of axesOf(o)) {
    const ov = chosenForm(o, axis, choices)?.ovr.find(v => v.shape === shapeId)
    if (ov) return ov.pts
  }
  return undefined
}

// The form being edited: the first axis whose chosen form is not its default (edits to the object's shapes go to that form), or null when the base is.
export function editTarget(o: ModelObject, choices: Choices): { axis: ModelAxis; form: ModelForm } | null {
  for (const axis of axesOf(o)) {
    const form = chosenForm(o, axis, choices)
    if (form && form.id !== axis.initial) return { axis, form }
  }
  return null
}

// The form an edit of a shape's points goes to: the form its outline is drawn from now (the first axis whose chosen form has an outline for it), else the
// form being edited (editTarget: a shape the form does not change gets an outline of its own there on its first edit), else null: the base outline.
export function targetForShape(o: ModelObject, shapeId: string, choices: Choices): { axis: ModelAxis; form: ModelForm } | null {
  for (const axis of axesOf(o)) {
    const form = chosenForm(o, axis, choices)
    if (form?.ovr.some(v => v.shape === shapeId)) return { axis, form }
  }
  return editTarget(o, choices)
}

// How many axes of how many objects are away from their default form (for the "N off rest" count).
export function formsAway(c: ModelContent, choices: Choices): number {
  let n = 0
  for (const o of c.objects) for (const a of axesOf(o)) { const f = chosenForm(o, a, choices); if (f && f.id !== a.initial) n++ }
  return n
}

// The Check panel's forms-by-views grid: for each form of each axis, what it does in the front view and what becomes of it from behind.
export interface FormViewRow { object: string; axis: string; form: string; isDefault: boolean; front: string; back: string }
export function formsByViews(c: ModelContent): FormViewRow[] {
  const shapes = new Map(c.shapes.map(s => [s.id, s]))
  const rows: FormViewRow[] = []
  for (const o of c.objects) {
    for (const a of axesOf(o)) {
      for (const f of a.options) {
        const hidden = f.ovr.filter(v => v.pts.length === 0).length, own = f.ovr.length - hidden
        const front = f.ovr.length === 0 ? 'base outline' : [own ? `${own} own outline${own === 1 ? '' : 's'}` : '', hidden ? `${hidden} shape${hidden === 1 ? '' : 's'} hidden` : ''].filter(Boolean).join(', ')
        const ownBack = f.ovr.filter(v => (shapes.get(v.shape)?.back?.length ?? 0) >= 3).length
        rows.push({
          object: o.name || o.id, axis: a.name || a.id, form: f.name || f.id, isDefault: f.id === a.initial, front,
          back: f.ovr.length === 0 ? 'base outline' : ownBack ? `${ownBack} shape${ownBack === 1 ? ' has' : 's have'} an own back outline: the form shows from the front only` : 'derived from the front',
        })
      }
    }
  }
  return rows
}
