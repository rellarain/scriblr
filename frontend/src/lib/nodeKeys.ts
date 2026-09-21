import { useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'

// Keyboard shortcuts shared by every editor that lists nodes (scratchpad notes,
// outline acts / scenes / moments, book arcs / chapters, plot nodes, admin
// config cards).
//
//   Enter            in a field with text: a new sibling after this node
//   Shift+Enter      a new CHILD of this node (one level down); nothing where the node has no child
//                    level. In a multi-line field it stays a new line
//   Ctrl+Enter       a new sibling of the PARENT node
//   Enter/Shift+Enter in an empty node: delete it, focus the first field of its parent
//   Ctrl+Enter       in an empty node: delete it, then a new sibling of its parent
//   Backspace        in an empty node: delete it, focus the last field of the previous sibling
//   Delete           in an empty node: delete it, focus the first field of the next sibling
//   Tab / Shift+Tab  next / previous field, else the first / last field of the next / previous sibling
//
// Draft text (data-kf="draft") is for writing: Enter and Shift+Enter are plain
// paragraphs there and only Tab / Shift+Tab are handled.
//
// Editors opt in with data attributes and one delegated onKeyDown:
//   data-knode="<id>"  on a node's wrapper element
//   data-kf            on each text input / textarea of the node (data-kf="draft" for draft text)
// A node's OWN fields are the data-kf elements inside it that are not inside a
// nested data-knode, so nested cards work without changing their markup.

export type FieldKind = 'single' | 'multi' | 'draft'

export type KeyAction =
  | 'none'                       // leave the key to the browser
  | 'swallow'                    // the key does nothing here
  | 'createSibling'
  | 'createChild'
  | 'createParentSibling'
  | 'removeCreateParentSibling'
  | 'removeToParent'
  | 'removeToPrev'
  | 'removeToNext'
  | 'tabNext'
  | 'tabPrev'

export interface KeyInput {
  key: string
  shift: boolean
  ctrl: boolean
  meta: boolean
  alt: boolean
  composing: boolean
  field: FieldKind
  readOnly: boolean
  fieldEmpty: boolean            // the focused field has no text
  nodeEmpty: boolean             // every field is blank and the node is removable
  hasParent: boolean
  canCreateParentSibling: boolean
  canCreateChild: boolean
}

// The whole key table, without the DOM.
export function resolveKey(k: KeyInput): KeyAction {
  if (k.composing || k.alt || k.meta) return 'none'
  if (k.key === 'Tab') return k.ctrl ? 'none' : k.shift ? 'tabPrev' : 'tabNext'
  if (k.readOnly || k.field === 'draft') return 'none'

  if (k.key === 'Enter') {
    if (k.ctrl) {
      if (!k.canCreateParentSibling) return 'swallow'
      return k.nodeEmpty ? 'removeCreateParentSibling' : 'createParentSibling'
    }
    if (k.nodeEmpty) return k.hasParent ? 'removeToParent' : 'swallow'
    if (k.shift && k.field === 'multi') return 'none' // a new line
    if (k.fieldEmpty) return 'swallow'
    if (k.shift) return k.canCreateChild ? 'createChild' : 'swallow'
    return 'createSibling'
  }

  if (k.shift || k.ctrl) return 'none'
  if (k.key === 'Backspace' && k.nodeEmpty) return 'removeToPrev'
  if (k.key === 'Delete' && k.nodeEmpty) return 'removeToNext'
  return 'none'
}

export interface FocusTarget { id: string; which: 'first' | 'last' }

// Where focus goes after an empty node is removed, with fallbacks so it never
// just disappears: toParent -> parent; toPrev -> previous sibling, else parent,
// else next sibling; toNext -> next sibling, else previous sibling, else parent.
export function removalTarget(
  kind: 'toParent' | 'toPrev' | 'toNext', id: string, siblings: string[], parentId: string | null,
): FocusTarget | null {
  const at = siblings.indexOf(id)
  const prev = at > 0 ? siblings[at - 1] : undefined
  const next = at >= 0 ? siblings[at + 1] : undefined
  const parent: FocusTarget | null = parentId ? { id: parentId, which: 'first' } : null
  const before: FocusTarget | null = prev ? { id: prev, which: 'last' } : null
  const after: FocusTarget | null = next ? { id: next, which: 'first' } : null
  if (kind === 'toParent') return parent ?? before ?? after
  if (kind === 'toPrev') return before ?? parent ?? after
  return after ?? before ?? parent
}

// The nodes Tab (dir 1) or Shift+Tab (dir -1) try in turn once the current
// node has no further field: the following (preceding) siblings, then the same
// one level up. Going backwards, the parent itself comes right after the
// siblings (its fields precede its children).
export function tabCandidates(
  dir: 1 | -1, id: string, siblingsOf: (id: string) => string[], parentOf: (id: string) => string | null,
): FocusTarget[] {
  const out: FocusTarget[] = []
  let current: string | null = id
  for (let guard = 0; current && guard < 64; guard += 1) {
    const siblings = siblingsOf(current)
    const at = siblings.indexOf(current)
    if (at >= 0) {
      if (dir === 1) for (let i = at + 1; i < siblings.length; i += 1) out.push({ id: siblings[i], which: 'first' })
      else for (let i = at - 1; i >= 0; i -= 1) out.push({ id: siblings[i], which: 'last' })
    }
    const parent: string | null = parentOf(current)
    if (dir === -1 && parent) out.push({ id: parent, which: 'last' })
    current = parent
  }
  return out
}

export interface NodeKeysAdapter {
  parentOf(id: string): string | null
  // Ordered ids of the nodes that share this node's parent (including it).
  siblingsOf(id: string): string[]
  // Data-level emptiness: no text anywhere, nothing nested, and safe to remove.
  isEmpty(id: string): boolean
  // Insert a sibling right after this node; returns its id.
  createSibling(id: string): string | null
  // Insert a child of this node (one level down); returns its id.
  createChild?(id: string): string | null
  canCreateChild?(id: string): boolean
  // Where a sibling of the parent makes sense (moment -> scene, scene -> act ...).
  createParentSibling?(id: string): string | null
  canCreateParentSibling?(id: string): boolean
  remove(id: string): void
  // Focus a node's field. Return false when the node has nothing to focus (so
  // Tab can try the next one). The default finds it in the page.
  focusNode?(id: string, which: 'first' | 'last'): boolean | void
}

type Field = HTMLInputElement | HTMLTextAreaElement

const isField = (el: Element | null): el is Field => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

function nodeElement(id: string, root: ParentNode = document): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>('[data-knode]')) if (el.dataset.knode === id) return el
  return null
}

// The editable data-kf fields that belong to this node itself, in page order.
export function ownFields(nodeEl: Element): Field[] {
  return [...nodeEl.querySelectorAll('[data-kf]')].filter(
    (el): el is Field => isField(el) && el.closest('[data-knode]') === nodeEl && !el.disabled && !el.readOnly && !el.hidden,
  )
}

// Every editable field under a node, its own first: what a node with no fields
// of its own (a scene in Draft mode) offers to Tab.
function reachableFields(nodeEl: Element): Field[] {
  const own = ownFields(nodeEl)
  if (own.length > 0) return own
  return [...nodeEl.querySelectorAll('[data-kf]')].filter((el): el is Field => isField(el) && !el.disabled && !el.readOnly && !el.hidden)
}

function focusField(el: Field) {
  el.focus()
  try {
    const end = el.value.length
    el.setSelectionRange(end, end)
  } catch { /* input types without a selection */ }
  el.scrollIntoView?.({ block: 'nearest' })
}

// Focus a node's first / last field. A node that is not rendered yet (just
// created) is waited for over a few frames.
export function focusNodeField(id: string, which: 'first' | 'last'): boolean {
  const attempt = (): boolean => {
    const el = nodeElement(id)
    if (!el) return false
    const fields = reachableFields(el)
    if (fields.length === 0) return false
    focusField(which === 'first' ? fields[0] : fields[fields.length - 1])
    return true
  }
  if (attempt()) return true
  if (nodeElement(id)) return false // there, but with nothing to focus
  let tries = 0
  const retry = () => {
    if (typeof document === 'undefined') return // the page is gone (a test environment torn down)
    tries += 1
    if (!attempt() && tries < 20) window.setTimeout(retry, 16)
  }
  window.setTimeout(retry, 16)
  return true
}

function focusTarget(adapter: NodeKeysAdapter, t: FocusTarget): boolean {
  const done = adapter.focusNode ? adapter.focusNode(t.id, t.which) : focusNodeField(t.id, t.which)
  return done !== false
}

// The delegated onKeyDown: works out the field, its node, and what the key means.
export function handleNodeKey(e: KeyboardEvent<HTMLElement>, adapter: NodeKeysAdapter): void {
  if (e.defaultPrevented) return
  const target = e.target as HTMLElement
  const field = target.closest('[data-kf]')
  if (!isField(field) || !e.currentTarget.contains(field)) return
  const nodeEl = field.closest<HTMLElement>('[data-knode]')
  const id = nodeEl?.dataset.knode
  if (!nodeEl || !id) return

  const kind: FieldKind = field.dataset.kf === 'draft' ? 'draft' : field instanceof HTMLTextAreaElement ? 'multi' : 'single'
  const parentId = adapter.parentOf(id)
  const canParentSibling = Boolean(adapter.createParentSibling) && (adapter.canCreateParentSibling?.(id) ?? true)
  const action = resolveKey({
    key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey,
    composing: e.nativeEvent.isComposing,
    field: kind, readOnly: field.readOnly || field.disabled,
    fieldEmpty: field.value.trim() === '',
    nodeEmpty: adapter.isEmpty(id) && ownFields(nodeEl).every(f => f.value.trim() === ''),
    hasParent: parentId !== null,
    canCreateParentSibling: canParentSibling,
    canCreateChild: Boolean(adapter.createChild) && (adapter.canCreateChild?.(id) ?? true),
  })
  if (action === 'none') return

  if (action === 'tabNext' || action === 'tabPrev') {
    const dir = action === 'tabNext' ? 1 : -1
    const fields = ownFields(nodeEl)
    const next = fields[fields.indexOf(field) + dir]
    if (next) { e.preventDefault(); focusField(next); return }
    for (const candidate of tabCandidates(dir, id, adapter.siblingsOf.bind(adapter), adapter.parentOf.bind(adapter))) {
      if (focusTarget(adapter, candidate)) { e.preventDefault(); return }
    }
    return // nothing to go to: the browser's own Tab
  }

  e.preventDefault()
  switch (action) {
    case 'swallow': return
    case 'createSibling': {
      const created = adapter.createSibling(id)
      if (created) focusTarget(adapter, { id: created, which: 'first' })
      return
    }
    case 'createChild': {
      const created = adapter.createChild?.(id)
      if (created) focusTarget(adapter, { id: created, which: 'first' })
      return
    }
    case 'createParentSibling': {
      const created = adapter.createParentSibling?.(id)
      if (created) focusTarget(adapter, { id: created, which: 'first' })
      return
    }
    case 'removeCreateParentSibling': {
      // Create first: the new node is placed relative to this node's parent.
      const created = adapter.createParentSibling?.(id)
      adapter.remove(id)
      if (created) focusTarget(adapter, { id: created, which: 'first' })
      return
    }
    default: {
      const kindOfRemoval = action === 'removeToParent' ? 'toParent' : action === 'removeToPrev' ? 'toPrev' : 'toNext'
      const where = removalTarget(kindOfRemoval, id, adapter.siblingsOf(id), parentId)
      adapter.remove(id)
      if (where) focusTarget(adapter, where)
    }
  }
}

// One delegated onKeyDown for a container of nodes.
export function useNodeKeys(adapter: NodeKeysAdapter) {
  const latest = useRef(adapter)
  latest.current = adapter
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLElement>) => handleNodeKey(e, latest.current), [])
  return { onKeyDown }
}
