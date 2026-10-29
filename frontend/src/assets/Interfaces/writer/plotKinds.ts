import type { PlotCustomFieldDef, PlotFieldKind, PlotFieldOption, PlotNode } from '../../../api/types'

// The kinds of field. A field holds one of:
//   points    a list of plotpoints (the usual field: the values are written one by one)
//   multi     any of its options, ticked: each option ticked is an answer
//   dropdown  one of its options: the one picked is the answer
//   text      a short text: the text is the answer
// An ANSWER is a plotpoint of the node that answers (a plotline, or the category, subcategory or cluster that defines the field), in that
// field: titled with the option's label (and holding its `optionId`) or with the text. So placing an answer in the outline, counting it, the
// tray and the Draft's notes work as they do for any plotpoint.
// This module is the part the rest of the plot code needs to read a field's kind and repair what is stored; the answers' operations are in
// plotAnswers.ts.

export const OPTION_LABEL_MAX = 30
export const MAX_OPTIONS = 20

export const FIELD_KINDS: PlotFieldKind[] = ['points', 'multi', 'dropdown', 'text']
export const KIND_LABEL: Record<PlotFieldKind, string> = { points: 'Plotpoints', multi: 'Multi-select', dropdown: 'Dropdown', text: 'Short text' }

type HasKind = { kind?: PlotFieldKind | null }

// A field with no kind (or one this version does not know) is the usual one.
export const kindOf = (def: HasKind): PlotFieldKind => (def.kind === 'multi' || def.kind === 'dropdown' || def.kind === 'text' ? def.kind : 'points')
// A field whose values are answers.
export const isChoice = (def: HasKind): boolean => kindOf(def) !== 'points'
// A field with options to choose from.
export const hasOptions = (def: HasKind): boolean => kindOf(def) === 'multi' || kindOf(def) === 'dropdown'
export const optionsOf = (def: { options?: PlotFieldOption[] }): PlotFieldOption[] => def.options ?? []
export const clampLabel = (s: string) => s.slice(0, OPTION_LABEL_MAX)

// ---- repairing what is stored ----

// The options of a choice field as they should be: a label trimmed and cut, one without a label or an id (or whose id was seen) left out, at
// most MAX_OPTIONS. The same array when nothing changes.
function cleanOptions(options: PlotFieldOption[]): PlotFieldOption[] {
  const seen = new Set<string>()
  const out: PlotFieldOption[] = []
  for (const option of options) {
    const label = clampLabel(String(option?.label ?? '').trim())
    if (!option?.id || seen.has(option.id) || label === '') continue
    seen.add(option.id)
    out.push(label === option.label ? option : { ...option, label })
    if (out.length >= MAX_OPTIONS) break
  }
  return out.length === options.length && out.every((o, i) => o === options[i]) ? options : out
}

// A field's kind and options, as they should be: no kind this version does not know, options only on a multi-select or dropdown. A field
// stored as the usual one with no options (or an empty list, as the server writes it) is left as it is.
function cleanDef(def: PlotCustomFieldDef): PlotCustomFieldDef {
  let next = def
  if (def.kind && kindOf(def) === 'points') { const { kind: _kind, ...rest } = next; next = rest }
  if (!hasOptions(next)) return (next.options?.length ?? 0) > 0 ? { ...next, options: [] } : next
  const options = cleanOptions(optionsOf(next))
  return options === next.options ? next : { ...next, options }
}

// Make a plot's choice fields and their answers consistent. Idempotent; the same array when nothing changes.
//   - a field has only a kind this version knows, and options only if it is a multi-select or dropdown (cleanOptions);
//   - an answer to a multi-select or dropdown names an option of its field, or it is dropped; it is titled with that option's label; there is
//     one to an option (multi-select) or one in all (dropdown) for each node that answers, the first kept;
//   - an answer to a short text has no option, and there is one for each node that answers;
//   - a plotpoint in any other field has no `optionId`.
// (A reference never answers: a choice field makes none, and one left from before the field was a choice is dealt with by syncReferences.)
export function repairChoices(nodes: PlotNode[]): PlotNode[] {
  let changed = false
  const cleaned = nodes.map(n => {
    if (n.kind === 'plotpoint' || !n.customFieldDefs.some(d => d.kind || (d.options?.length ?? 0) > 0)) return n
    const defs = n.customFieldDefs.map(cleanDef)
    if (defs.every((d, i) => d === n.customFieldDefs[i])) return n
    changed = true
    return { ...n, customFieldDefs: defs }
  })
  const fields = new Map<string, PlotCustomFieldDef>()
  for (const n of cleaned) if (n.kind !== 'plotpoint') for (const d of n.customFieldDefs) fields.set(d.id, d)

  const seen = new Set<string>()
  const out: PlotNode[] = []
  for (const n of cleaned) {
    const def = n.kind === 'plotpoint' && !n.refId && n.fieldId ? fields.get(n.fieldId) : undefined
    if (!def || !isChoice(def)) {
      if (n.kind === 'plotpoint' && n.optionId) { changed = true; out.push({ ...n, optionId: null }) } else out.push(n)
      continue
    }
    if (kindOf(def) === 'text') {
      const key = `${n.parentId}|${def.id}`
      if (seen.has(key)) { changed = true; continue }
      seen.add(key)
      if (n.optionId) { changed = true; out.push({ ...n, optionId: null }) } else out.push(n)
      continue
    }
    const option = optionsOf(def).find(o => o.id === n.optionId)
    const key = kindOf(def) === 'multi' ? `${n.parentId}|${def.id}|${n.optionId}` : `${n.parentId}|${def.id}`
    if (!option || seen.has(key)) { changed = true; continue }
    seen.add(key)
    if (n.title !== option.label) { changed = true; out.push({ ...n, title: option.label }) } else out.push(n)
  }
  return changed ? out : nodes
}
