import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { ModelContent, ModelEntry, ModelGroup, ModelObject, ModelPreset, ModelShape } from '../../../../api/types'
import { CheckIcon, ChevronDownIcon, CopyIcon, EyeIcon, EyeOffIcon, FolderPlusIcon, GridViewIcon, ImportIcon, ExportIcon, LayersIcon, LinkIcon, MannequinIcon, PlayIcon, PlusIcon, SaveIcon, SearchIcon, StampIcon, SwapIcon, TrashIcon } from '../../../icons'
import { ReorderList } from './ReorderList'
import { StatusBadge, modelLabel } from './StatusBadge'
import { TemplateMenu } from './TemplateMenu'
import { classOfObject } from './engine/classEdit'
import { patternOfMark } from './engine/patterns'
import { isOn, type TestState } from './engine/presets'
import { optionIsOn, statesOf } from './engine/states'
import { useDesignerPolicy } from './designerPolicy'
import { LIMITS } from './engine/limits'
import type { Selection } from './designerState'
import {
  CARD_NAMES, expressionsOf, levelsOf, modesFor, nextMode, posesOf, searchHits, stepTo, storedBefore, stylesOfObject, variantsOf,
  type CardKind, type CardMode, type Container,
} from './treeNav'

// The tree as nested cards (see treeNav.ts for how the levels nest): the models, then the groups of the open model, the objects of the open group, the shapes of the open object.
// At a level the cards are listed only while none is open; the open one is alone, with its children under it. The model carries variants, a group poses, an object styles and
// expressions, listed the same way (all while none is on, the one that is on alone). Each card has a button at its top right that does one of three things (hide or show it,
// add one beside it, copy it, which for a group, an object or a shape is a twin) and that a right-click moves on to the next of. The cards are listed topmost first; a grip slides a card
// between its siblings (or Alt + Up / Down on it).

export interface ModelsNav {
  entries: ModelEntry[]
  currentId: string
  // The cards of all the models are listed instead of the open model's.
  open: boolean
  onOpen: (open: boolean) => void
  onSelect: (id: string) => void
  onNew: () => void
  onImport: () => void
  // The library holds as many models as it may (a writer's library, whose size the admin sets): no more can be added.
  full?: boolean
  // adds the basic adult that comes with the app (offered while the catalog does not have it; the writer's own library does not offer it)
  onAddBasic?: () => void
  // more tools for the end of the models' row (the writer's library puts its "Duplicate a Scriblr model" menu here)
  extraTools?: ReactNode
  onExportAll: () => void
  onDuplicate: (id: string) => void
  onMove: (id: string, beforeId: string | null) => void
}

export interface TreeActions {
  onSelect: (sel: Selection) => void
  onAddGroup: () => void
  onAddObject: (groupId: string) => void
  onAddShape: (objectId: string, templateId: string) => void
  onTwin: (kind: Container, id: string) => void
  onReorderShape: (objectId: string, shapeId: string, beforeId: string | null) => void
  onReorderObject: (groupId: string, objectId: string, beforeId: string | null) => void
  onReorderGroup: (groupId: string, beforeId: string | null) => void
  // switch a group or an object off or on for looking (the eye); the page keeps the list, and a preset can keep it
  onToggleHidden: (id: string) => void
  onToggleModelHidden: () => void
  // states: apply a preset (a variant, a pose, a style), turn it off, make one from the look now (scope: the group or object it belongs to, none for a variant), copy one
  onApply: (presetId: string) => void
  onClear: (presetId: string) => void
  onNewPreset: (scope: string | null) => void
  onDuplicatePreset: (presetId: string) => void
  // group states (phase D3b), on the card of the group: add a state or an option from the look now, rename, delete, give an option the look now, choose an option
  onAddState: (groupId: string) => void
  onRenameState: (groupId: string, stateId: string, name: string) => void
  onRemoveState: (groupId: string, stateId: string) => void
  onAddOption: (groupId: string, stateId: string) => void
  onRenameOption: (groupId: string, stateId: string, optionId: string, name: string) => void
  onUpdateOption: (groupId: string, stateId: string, optionId: string) => void
  onRemoveOption: (groupId: string, stateId: string, optionId: string) => void
  onChooseOption: (groupId: string, stateId: string, optionId: string) => void
  onChooseForm: (objectId: string, axisId: string, formId: string) => void
  onAddForm: (objectId: string, axisId: string, fromCurrent: boolean) => void
}

const label = (name: string, fallback: string) => name.trim() || fallback

// ---- the marks on a card ----

function Mark({ label: aria, title, children }: { label: string; title?: string; children: ReactNode }) {
  return <span className="cmTwin" role="img" title={title ?? aria} aria-label={aria}>{children}</span>
}
const TWIN = (name: string) => ({ label: `${name} is a twin`, title: `${name} is a twin: it mirrors another and follows it` })
function ShapeMarks({ content, shape, name }: { content: ModelContent; shape: ModelShape; name: string }) {
  const pattern = patternOfMark(content, shape.id)
  return (
    <>
      {shape.mirrorOf && <Mark {...TWIN(name)}><SwapIcon size={11} /></Mark>}
      {shape.shade && <Mark label={`${name} is a shading shape`} title={`${name} is a shading shape: a ${shape.shade.kind === 'mid' ? 'mid tone' : shape.shade.kind} kept inside the other shapes of its object`}><LayersIcon size={11} /></Mark>}
      {pattern && <Mark label={`${name} is a mark of the fill pattern ${label(pattern.name, 'Untitled pattern')}`} title={`${name} is a mark of the fill pattern ${label(pattern.name, 'Untitled pattern')}: it is kept inside its base shape`}><GridViewIcon size={11} /></Mark>}
      {shape.helper && <Mark label={`${name} is a helper shape`} title={`${name} is a helper shape: it is not drawn in the previews`}><EyeOffIcon size={11} /></Mark>}
      {shape.copyOf && <Mark label={`${name} follows the pattern`} title={`${name} follows the pattern${shape.pts.length >= 3 ? ' (it has an outline of its own)' : ''}`}><LinkIcon size={11} /></Mark>}
    </>
  )
}
function ObjectMarks({ content, object, name }: { content: ModelContent; object: ModelObject; name: string }) {
  const k = classOfObject(content, object)
  return (
    <>
      {object.mirrorOf && <Mark {...TWIN(name)}><SwapIcon size={11} /></Mark>}
      {k && <Mark label={k.template === object.id ? `${name} is the pattern of class ${k.name.trim() || 'Untitled class'}` : `${name} is a member of class ${k.name.trim() || 'Untitled class'}`}>{k.template === object.id ? <StampIcon size={11} /> : <LinkIcon size={11} />}</Mark>}
    </>
  )
}

// ---- one card ----

interface CardProps {
  kind: CardKind
  id: string
  name: string
  sub?: ReactNode
  // This card is the one that is open (or on): the others of its level are not listed.
  open?: boolean
  // dimmed: switched off with the eye (it or what holds it)
  off?: boolean
  marks?: ReactNode
  onMain: () => void
  // what the button does in each mode (a mode that is missing is not offered)
  tools: Partial<Record<CardMode, () => void>>
  // hide mode: is the thing shown now
  shown?: boolean
  grip?: ReactNode
  mainTitle?: string
  extra?: ReactNode
  children?: ReactNode
}

function Card(p: CardProps) {
  const [mode, setMode] = useState<CardMode | undefined>(undefined)
  const offered = modesFor(p.kind, { open: !!p.open }).filter(m => p.tools[m])
  const now: CardMode = mode && offered.includes(mode) ? mode : offered[0]
  const name = label(p.name, `Untitled ${CARD_NAMES[p.kind].toLowerCase()}`)
  const kindName = CARD_NAMES[p.kind].toLowerCase()
  function cycle(e: ReactMouseEvent) {
    e.preventDefault()
    if (offered.length > 1) setMode(nextMode(offered, now))
  }
  const NAMES: Record<CardMode, { aria: string; icon: ReactNode }> = {
    hide: { aria: `Show ${name}`, icon: p.shown === false ? <EyeOffIcon size={12} /> : <EyeIcon size={12} /> },
    plus: { aria: `New ${kindName} next to ${name}`, icon: <PlusIcon size={12} /> },
    copy: { aria: p.kind === 'group' || p.kind === 'object' || p.kind === 'shape' ? `Make a twin of ${name}` : `Copy ${name}`, icon: <CopyIcon size={12} /> },
  }
  const next = offered.length > 1 ? nextMode(offered, now) : null
  const hint = next ? ` Right-click to change what this button does (next: ${next === 'hide' ? 'hide or show' : next === 'plus' ? 'add one beside it' : 'copy'}).` : ''
  const titles: Record<CardMode, string> = {
    hide: p.shown === false ? `${name} is hidden: show it.${hint}` : `${name} is shown: hide it, to look at the rest.${hint}`,
    plus: `Add a ${kindName} beside ${name}.${hint}`,
    copy: (p.kind === 'group' || p.kind === 'object' || p.kind === 'shape' ? `Make a twin of ${name}: a mirror image that follows it.` : `Make a copy of ${name}.`) + hint,
  }
  return (
    <div className={`dzCard dzCard--${p.kind}${p.open ? ' dzCard--open' : ''}${p.off ? ' dzCard--off' : ''}`} role="group" aria-label={`${CARD_NAMES[p.kind]} ${name}`} data-card={p.kind}>
      <div className="dzCardHead">
        {p.grip}
        <button type="button" className="dzCardMain" aria-label={name} aria-current={p.open ? 'true' : undefined} title={p.mainTitle} onClick={p.onMain}>{name}</button>
        {p.marks}
        {p.sub !== undefined && <small className="dzCardSub">{p.sub}</small>}
        {now && (
          <button
            type="button" className={`cmIconBtn cmIconBtn--small dzCardTool${now === 'hide' && p.shown === false ? ' cmIconBtn--on' : ''}`} aria-label={NAMES[now].aria} title={titles[now]}
            aria-pressed={now === 'hide' ? p.shown !== false : undefined} onClick={() => p.tools[now]?.()} onContextMenu={cycle}
          >{NAMES[now].icon}</button>
        )}
      </div>
      {p.extra}
      {p.children && <div className="dzKids">{p.children}</div>}
    </div>
  )
}

// ---- the tree ----

export function TreeBar({ content, sel, state, hidden, models, actions }: {
  content: ModelContent
  sel: Selection
  state: TestState
  hidden: ReadonlySet<string>
  models: ModelsNav
  actions: TreeActions
}) {
  const { max } = useDesignerPolicy()
  const [query, setQuery] = useState('')
  const [openAxis, setOpenAxis] = useState<string | null>(null)
  const q = query.trim()
  const hits = q ? searchHits(content, q) : []
  const levels = levelsOf(content, sel)
  const current = models.entries.find(e => e.id === models.currentId)
  const groupHidden = (g: ModelGroup) => hidden.has(g.id)
  const allHidden = content.groups.length > 0 && content.groups.every(g => hidden.has(g.id))
  const stored = { group: content.groups.map(g => g.id) }

  // ---- states: the variants, poses, styles ----
  function states(kind: 'variant' | 'pose' | 'style', list: ModelPreset[], scope: string | null, heading: string): ReactNode {
    if (list.length === 0 && kind !== 'variant') return null
    const on = list.find(p => isOn(content, state, p)), shown = on ? [on] : list
    const full = list.length >= LIMITS.presetsMax
    return (
      <section className="dzStates" aria-label={heading}>
        <div className="dzLevelHead">
          <span className="dzLevelName">{heading} <span className="cmCount">{list.length}</span></span>
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Save the current look as a ${kind}`} title={`Save how the model looks now as a ${kind}`} disabled={full} onClick={() => actions.onNewPreset(scope)}><PlusIcon size={12} /></button>
        </div>
        {list.length === 0 && <p className="cmInsText">None yet: set the model up as you want it, then save it.</p>}
        {shown.map(p => (
          <Card
            key={p.id} kind={kind} id={p.id} name={p.name} open={!!on} sub={on ? 'on' : p.kind}
            mainTitle={on ? `${label(p.name, 'It')} is on: press to turn it off` : `Apply ${label(p.name, 'it')}`}
            onMain={() => (on ? actions.onClear(p.id) : actions.onApply(p.id))}
            tools={{ plus: () => actions.onNewPreset(scope), copy: () => actions.onDuplicatePreset(p.id) }}
          />
        ))}
      </section>
    )
  }

  // ---- the states of a group: switches whose options each set several things of the group at once ----
  function groupStates(g: ModelGroup): ReactNode {
    if (g.mirrorOf) return null
    const list = statesOf(g), gname = label(g.name, 'the group')
    return (
      <section className="dzStates" aria-label="States">
        <div className="dzLevelHead">
          <span className="dzLevelName">States <span className="cmCount">{list.length}</span></span>
          <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Add a state to ${gname}`} title={`Add a state to ${gname}, with an option that keeps how the group looks now`} disabled={list.length >= LIMITS.statesMax} onClick={() => actions.onAddState(g.id)}><PlusIcon size={12} /></button>
        </div>
        {list.length === 0 && <p className="cmInsText">None yet: set the group up as one of its settings, then add a state.</p>}
        {list.map(st => {
          const sname = label(st.name, 'Untitled state')
          return (
            <div key={st.id} className="dzState" role="group" aria-label={`State ${sname}`}>
              <div className="dzStateHead">
                <input className="dzStateName" aria-label={`Name of state ${sname}`} value={st.name} maxLength={40} placeholder="Name" onChange={e => actions.onRenameState(g.id, st.id, e.target.value)} />
                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Add an option to ${sname}`} title="Add an option that keeps how the group looks now" disabled={st.options.length >= LIMITS.stateOptionsMax} onClick={() => actions.onAddOption(g.id, st.id)}><PlusIcon size={12} /></button>
                <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete state ${sname}`} title="Delete the state" onClick={() => actions.onRemoveState(g.id, st.id)}><TrashIcon size={12} /></button>
              </div>
              {st.options.map(o => {
                const on = optionIsOn(content, state, g.id, st.id, o.id), oname = label(o.name, 'Untitled option')
                return (
                  <div key={o.id} className={`dzOption${on ? ' dzOption--on' : ''}`} role="group" aria-label={`Option ${oname} of ${sname}`}>
                    <button
                      type="button" className={`cmIconBtn cmIconBtn--small${on ? ' cmIconBtn--on' : ''}`} aria-pressed={on} aria-label={`Set ${sname} to ${oname}`}
                      title={on ? `${sname} is at ${oname}` : `Set the group to ${oname}: its sliders, things and forms take this option's`} onClick={() => actions.onChooseOption(g.id, st.id, o.id)}
                    >{on ? <CheckIcon size={12} /> : <PlayIcon size={12} />}</button>
                    <input className="dzStateName" aria-label={`Name of option ${oname} of ${sname}`} value={o.name} maxLength={40} placeholder="Name" onChange={e => actions.onRenameOption(g.id, st.id, o.id, e.target.value)} />
                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Update ${oname} of ${sname} from the current look`} title="Keep how the group looks now in this option" onClick={() => actions.onUpdateOption(g.id, st.id, o.id)}><SaveIcon size={12} /></button>
                    <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`Delete option ${oname} of ${sname}`} title={st.options.length <= 1 ? 'A state needs an option: delete the state instead' : 'Delete the option'} disabled={st.options.length <= 1} onClick={() => actions.onRemoveOption(g.id, st.id, o.id)}><TrashIcon size={12} /></button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </section>
    )
  }

  // ---- expressions: the forms of an object's axes ----
  function expressions(o: ModelObject): ReactNode {
    const list = expressionsOf(content, o, state.forms)
    if (list.length === 0) return null
    return (
      <section className="dzStates" aria-label="Expressions">
        <div className="dzLevelHead"><span className="dzLevelName">Expressions <span className="cmCount">{list.reduce((n, e) => n + e.forms.length, 0)}</span></span></div>
        {list.map(e => {
          const opened = openAxis === `${o.id}.${e.axis.id}`
          const cards = opened ? e.forms : e.chosen ? [e.chosen] : e.forms.slice(0, 1)
          return cards.map(f => (
            <Card
              key={`${e.axis.id}.${f.id}`} kind="expression" id={f.id} name={f.name} open={!opened} sub={label(e.axis.name, 'Axis')}
              mainTitle={opened ? `Show ${label(f.name, 'this form')}` : 'Press to see the other forms of this axis'}
              onMain={() => {
                if (opened) { actions.onChooseForm(o.id, e.axis.id, f.id); setOpenAxis(null) } else setOpenAxis(`${o.id}.${e.axis.id}`)
              }}
              tools={{ plus: () => actions.onAddForm(o.id, e.axis.id, false), copy: () => actions.onAddForm(o.id, e.axis.id, true) }}
              extra={opened && e.chosen?.id === f.id ? <span className="dzCardNote">shown now</span> : null}
            />
          ))
        })}
      </section>
    )
  }

  // ---- the containing levels ----
  function groupCard(g: ModelGroup, open: boolean, grip: ReactNode, kids: ReactNode) {
    const name = label(g.name, 'Untitled group')
    return (
      <Card
        key={g.id} kind="group" id={g.id} name={g.name} open={open} off={groupHidden(g)} shown={!groupHidden(g)} grip={grip}
        marks={g.mirrorOf ? <Mark {...TWIN(name)}><SwapIcon size={11} /></Mark> : null}
        sub={`${g.objects.length} object${g.objects.length === 1 ? '' : 's'}`}
        onMain={() => actions.onSelect(stepTo(content, sel, 'group', g.id))}
        tools={{ hide: () => actions.onToggleHidden(g.id), plus: actions.onAddGroup, copy: () => actions.onTwin('group', g.id) }}
      >{kids}</Card>
    )
  }
  function objectCard(o: ModelObject, g: ModelGroup, open: boolean, grip: ReactNode, kids: ReactNode) {
    const name = label(o.name, 'Untitled object')
    const off = hidden.has(o.id) || hidden.has(g.id)
    return (
      <Card
        key={o.id} kind="object" id={o.id} name={o.name} open={open} off={off} shown={!hidden.has(o.id)} grip={grip}
        marks={<ObjectMarks content={content} object={o} name={name} />}
        sub={`${o.shapes.length} shape${o.shapes.length === 1 ? '' : 's'}`}
        onMain={() => actions.onSelect(stepTo(content, sel, 'object', o.id))}
        tools={{ hide: () => actions.onToggleHidden(o.id), plus: () => actions.onAddObject(g.id), copy: () => actions.onTwin('object', o.id) }}
      >{kids}</Card>
    )
  }
  function shapeCard(s: ModelShape, o: ModelObject, g: ModelGroup, open: boolean, grip: ReactNode) {
    const name = label(s.name, 'Untitled shape')
    return (
      <Card
        key={s.id} kind="shape" id={s.id} name={s.name} open={open} off={hidden.has(o.id) || hidden.has(g.id) || !!s.hide} grip={grip}
        marks={<ShapeMarks content={content} shape={s} name={name} />}
        onMain={() => actions.onSelect(stepTo(content, sel, 'shape', s.id))}
        tools={{ plus: () => actions.onAddShape(o.id, 'rounded'), copy: () => actions.onTwin('shape', s.id) }}
      />
    )
  }

  function renderLevel(i: number): ReactNode {
    const level = levels[i]
    if (!level) return null
    const open = level.open
    const group = levels[0].open as ModelGroup | null, object = levels[1]?.open as ModelObject | null | undefined
    if (level.kind === 'group') {
      const kids = (g: ModelGroup) => (
        <>
          {states('pose', posesOf(content, g.id), g.id, 'Poses')}
          {groupStates(g)}
          {renderLevel(1)}
        </>
      )
      if (open) return groupCard(open as ModelGroup, true, null, kids(open as ModelGroup))
      return (
        <section className="dzLevel" aria-label="Groups">
          <div className="dzLevelHead">
            <span className="dzLevelName">Groups <span className="cmCount">{content.groups.length}</span></span>
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label="New group" title="New group" disabled={content.groups.length >= max.groups} onClick={actions.onAddGroup}><FolderPlusIcon size={12} /></button>
          </div>
          {content.groups.length === 0 && <p className="cmInsText">No group yet. Make one with the button above.</p>}
          <ReorderList
            className="dzCardList" items={(level.cards as ModelGroup[]).map(g => ({ id: g.id, g }))} label={x => label(x.g.name, 'the group')}
            onMove={(id, before) => actions.onReorderGroup(id, storedBefore(stored.group, before))}
            render={({ g }, grip) => groupCard(g, false, grip, null)}
          />
        </section>
      )
    }
    if (level.kind === 'object' && group) {
      if (open) {
        const o = open as ModelObject
        return objectCard(o, group, true, null, (
          <>
            {states('style', stylesOfObject(content, o.id), o.id, 'Styles')}
            {expressions(o)}
            {renderLevel(2)}
          </>
        ))
      }
      return (
        <section className="dzLevel" aria-label="Objects">
          <div className="dzLevelHead">
            <span className="dzLevelName">Objects <span className="cmCount">{group.objects.length}</span></span>
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label={`New object in ${label(group.name, 'the group')}`} title={`New object in ${label(group.name, 'the group')}`} disabled={group.objects.length >= max.objectsPerGroup} onClick={() => actions.onAddObject(group.id)}><PlusIcon size={12} /></button>
          </div>
          {group.objects.length === 0 && <p className="cmInsText">No object yet.</p>}
          <ReorderList
            className="dzCardList" items={(level.cards as ModelObject[]).map(o => ({ id: o.id, o }))} label={x => label(x.o.name, 'the object')}
            onMove={(id, before) => actions.onReorderObject(group.id, id, storedBefore(group.objects, before))}
            render={({ o }, grip) => objectCard(o, group, false, grip, null)}
          />
        </section>
      )
    }
    if (level.kind === 'shape' && group && object) {
      if (open) return shapeCard(open as ModelShape, object, group, true, null)
      return (
        <section className="dzLevel" aria-label="Shapes">
          <div className="dzLevelHead">
            <span className="dzLevelName">Shapes <span className="cmCount">{object.shapes.length}</span></span>
            <TemplateMenu label={`Add a shape to ${label(object.name, 'the object')}`} onPick={t => actions.onAddShape(object.id, t)} disabled={object.shapes.length >= max.shapesPerObject} />
          </div>
          {object.shapes.length === 0 && <p className="cmInsText">No shape yet: add one from a template.</p>}
          <ReorderList
            className="dzCardList" items={(level.cards as ModelShape[]).map(s => ({ id: s.id, s }))} label={x => label(x.s.name, 'the shape')}
            onMove={(id, before) => actions.onReorderShape(object.id, id, storedBefore(object.shapes, before))}
            render={({ s }, grip) => shapeCard(s, object, group, false, grip)}
          />
        </section>
      )
    }
    return null
  }

  // ---- the models ----
  function modelCards(): ReactNode {
    return (
      <section className="dzLevel" aria-label="Models">
        <div className="dzLevelHead">
          <span className="dzLevelName">Models <span className="cmCount">{models.entries.length}</span></span>
          <span className="dzLevelTools">
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label="New model" title={models.full ? 'Your library holds as many models as the admin allows' : 'New model'} disabled={models.full} onClick={models.onNew}><PlusIcon size={12} /></button>
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label="Import models from a file" title={models.full ? 'Your library holds as many models as the admin allows' : 'Import models from a file'} disabled={models.full} onClick={models.onImport}><ImportIcon size={12} /></button>
            {models.onAddBasic && !models.entries.some(e => e.id === 'basic') && <button type="button" className="cmIconBtn cmIconBtn--small" aria-label="Add the basic model" title="Add the basic model that comes with Scriblr: a bare adult with a face, ages, builds and expressions, published" onClick={models.onAddBasic}><MannequinIcon size={12} /></button>}
            {models.extraTools}
            <button type="button" className="cmIconBtn cmIconBtn--small" aria-label="Export all the models to a file" title="Export all the models to a file" disabled={models.entries.length === 0} onClick={models.onExportAll}><ExportIcon size={12} /></button>
          </span>
        </div>
        <ReorderList
          className="dzCardList" items={models.entries.map(e => ({ id: e.id, e }))} label={x => modelLabel(x.e)}
          onMove={models.onMove}
          render={({ e }, grip) => (
            <Card
              key={e.id} kind="model" id={e.id} name={e.draft.name} open={e.id === models.currentId} grip={grip} sub={<StatusBadge entry={e} />}
              onMain={() => { models.onSelect(e.id); models.onOpen(false) }} mainTitle={e.id === models.currentId ? 'Back to this model' : 'Open this model'}
              tools={{ plus: models.onNew, copy: () => models.onDuplicate(e.id) }}
            />
          )}
        />
      </section>
    )
  }

  return (
    <nav className="cmTree dzTree" aria-label="Model tree">
      <div className="cmTreeHead">
        <label className="cmSearch">
          <SearchIcon size={12} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search the model" />
        </label>
      </div>
      {q ? (
        <ul className="dzHits" aria-label="Search results">
          {hits.length === 0 && <li className="cmInsText">Nothing in the model has that in its name.</li>}
          {hits.map(h => (
            <li key={`${h.kind}:${h.id}`}>
              <button type="button" className="dzHit" data-kind={h.kind} data-name={h.name} onClick={() => { actions.onSelect({ kind: h.kind, id: h.id }); setQuery('') }}>
                <span className="dzHitName">{h.name}</span>
                <small>{CARD_NAMES[h.kind]}{h.crumbs ? ` · ${h.crumbs}` : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : models.open ? modelCards() : current ? (
        <>
          <Card
            kind="model" id={current.id} name={current.draft.name} open off={allHidden} shown={!allHidden}
            mainTitle="Show the whole model: nothing selected" onMain={() => actions.onSelect({ kind: 'none', id: '' })}
            tools={{ hide: actions.onToggleModelHidden, plus: models.onNew, copy: () => models.onDuplicate(current.id) }}
            extra={(
              <>
                <div className="dzCardStatus"><StatusBadge entry={current} /></div>
                <button type="button" className="dzAllModels" aria-label="Show all the models" aria-expanded={false} title="Show the cards of all the models" onClick={() => models.onOpen(true)}>
                  <ChevronDownIcon size={12} /> All models ({models.entries.length})
                </button>
              </>
            )}
          >
            {states('variant', variantsOf(content), null, 'Variants')}
            {renderLevel(0)}
          </Card>
        </>
      ) : null}
    </nav>
  )
}

