import { useState } from 'react'
import type { ModelContent, ModelObject, ModelShape } from '../../../../api/types'
import { PlusIcon, StampIcon, TrashIcon } from '../../../icons'
import type { Selection } from './designerState'
import { classOfObject, followedShape } from './engine/classEdit'
import { membersOf, shownMember, type Choices } from './engine/forms'
import { LIMITS } from './engine/limits'
import { NAME_MAX, groupOfObject, objectById } from './modelContent'

// Classes. A template object is a pattern: once it has members it is not drawn, and every member has a shape for each of its shapes, which follows it until
// the member is given an outline of its own (or leaves it out). A member picks its own form on each of the template's axes and may add shapes of its own. A
// family shows one member at a time (a character uses one); copies are all drawn (both hands). Detaching a member copies what it follows once.
export interface ClassActions {
  select: (sel: Selection) => void
  makeClass: (objectId: string, name: string, exclusive: boolean) => void
  renameClass: (classId: string, name: string) => void
  setExclusive: (classId: string, exclusive: boolean) => void
  addMember: (classId: string) => void
  detach: (memberId: string) => void
  deleteClass: (classId: string) => void
  // the member of a family that is shown (test state, not saved)
  showMember: (classId: string, memberId: string) => void
  moveToGroup: (objectId: string, groupId: string) => void
  followTemplate: (shapeId: string) => void
  hideShape: (shapeId: string, hide: boolean) => void
}

const label = (name: string, fallback: string) => name.trim() || fallback

export function ClassPanel({ content, object, choices, actions }: { content: ModelContent; object: ModelObject; choices: Choices; actions: ClassActions }) {
  const [name, setName] = useState('')
  const [exclusive, setExclusive] = useState(true)
  const [confirm, setConfirm] = useState<'detach' | 'delete' | null>(null)
  const k = classOfObject(content, object)
  const title = label(object.name, 'Untitled object')

  // an object that is not in a class
  if (!k) {
    if (object.mirrorOf) return null
    return (
      <section className="cmSec cmClass" aria-label="Class">
        <h3 className="cmInsSub">Class</h3>
        <p className="cmInsText">Make a class of this object to build variants of it: members that follow its shapes, so an edit of the pattern reaches every member.</p>
        <label className="cmField">
          <span>Class name</span>
          <input value={name} maxLength={NAME_MAX} placeholder={title} aria-label="Class name" onChange={e => setName(e.target.value)} />
        </label>
        <div className="cmChips" role="group" aria-label="What the class is">
          <button type="button" className={`cmChip cmChip--wide${exclusive ? ' cmChip--on' : ''}`} aria-pressed={exclusive} title="A family: members are interchangeable, one is shown at a time (almond, round, hooded eyes)" onClick={() => setExclusive(true)}>A family</button>
          <button type="button" className={`cmChip cmChip--wide${!exclusive ? ' cmChip--on' : ''}`} aria-pressed={!exclusive} title="Copies: every member is drawn, each in its own group (both hands)" onClick={() => setExclusive(false)}>Copies</button>
        </div>
        <div className="cmInline">
          <button type="button" className="cmBtn cmBtn--small" title="Make this object the pattern of a class" onClick={() => { actions.makeClass(object.id, name, exclusive); setName('') }}><StampIcon size={12} /> Make a class</button>
        </div>
      </section>
    )
  }

  const members = membersOf(content, k.id)
  const isTemplate = k.template === object.id
  const template = objectById(content, k.template)
  const shown = shownMember(content, k, choices)
  const home = groupOfObject(content, object.id)

  return (
    <section className="cmSec cmClass" aria-label="Class">
      <h3 className="cmInsSub">{isTemplate ? `Pattern of class ${label(k.name, 'Untitled class')}` : `Member of class ${label(k.name, 'Untitled class')}`}</h3>
      {isTemplate ? (
        <>
          <p className="cmInsText">
            {members.length === 0 ? 'No member yet: the pattern is drawn like any object until it has one.' : `The pattern is not drawn while the class has members. Edit it here and ${members.length === 1 ? 'the member follows' : 'every member follows'}; select a member to give it an outline of its own.`}
          </p>
          <label className="cmField">
            <span>Class name</span>
            <input value={k.name} maxLength={NAME_MAX} aria-label="Name of the class" onChange={e => actions.renameClass(k.id, e.target.value)} />
          </label>
          <div className="cmChips" role="group" aria-label="What the class is">
            <button type="button" className={`cmChip cmChip--wide${k.exclusive ? ' cmChip--on' : ''}`} aria-pressed={k.exclusive} title="A family: one member is shown at a time" onClick={() => actions.setExclusive(k.id, true)}>A family</button>
            <button type="button" className={`cmChip cmChip--wide${!k.exclusive ? ' cmChip--on' : ''}`} aria-pressed={!k.exclusive} title="Copies: every member is drawn" onClick={() => actions.setExclusive(k.id, false)}>Copies</button>
          </div>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={members.length >= LIMITS.membersMax} title={members.length >= LIMITS.membersMax ? `A class may have at most ${LIMITS.membersMax} members` : 'A new member in this group, following every shape of the pattern'} onClick={() => actions.addMember(k.id)}><PlusIcon size={12} /> Add a member</button>
            <span className={`cmCount${members.length > LIMITS.membersWarn ? ' cmCount--warn' : ''}`} title="Members of the class">{members.length} of {LIMITS.membersMax}</span>
          </div>
          {members.length > 0 && (
            <ul className="cmPlain cmMembers" aria-label="Members">
              {members.map(m => (
                <li key={m.id}>
                  <button type="button" className="cmLink" onClick={() => actions.select({ kind: 'object', id: m.id })}>{label(m.name, 'Untitled object')}</button>
                  {k.exclusive && shown?.id === m.id && <small> · shown</small>}
                </li>
              ))}
            </ul>
          )}
          {confirm === 'delete' ? (
            <span className="cmConfirm" role="group" aria-label="Delete the class?">
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.deleteClass(k.id) }}>Delete the class</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it</button>
            </span>
          ) : <button type="button" className="cmBtn cmBtn--small" title="The members keep their look and become ordinary objects" onClick={() => setConfirm('delete')}><TrashIcon size={12} /> Delete the class</button>}
        </>
      ) : (
        <>
          <p className="cmInsText">Its shapes follow {template ? label(template.name, 'the pattern') : 'the pattern'}. Move a point of one to give it an outline of its own; the forms are the pattern's, and this member chooses among them in the Forms tab.</p>
          <div className="cmInline">
            {template && <button type="button" className="cmBtn cmBtn--small" onClick={() => actions.select({ kind: 'object', id: template.id })}>Go to the pattern</button>}
            {k.exclusive && (
              <button type="button" className={`cmBtn cmBtn--small${shown?.id === object.id ? ' cmBtn--on' : ''}`} aria-pressed={shown?.id === object.id} title="Show this member (the others of the family are hidden)" onClick={() => actions.showMember(k.id, object.id)}>Show this member</button>
            )}
          </div>
          <label className="cmField">
            <span>Group</span>
            <select value={home?.id ?? ''} aria-label="Group of the member" onChange={e => actions.moveToGroup(object.id, e.target.value)}>
              {!home && <option value="">No group</option>}
              {content.groups.filter(g => !g.mirrorOf).map(g => <option key={g.id} value={g.id}>{label(g.name, 'Untitled group')}</option>)}
            </select>
          </label>
          {confirm === 'detach' ? (
            <span className="cmConfirm" role="group" aria-label="Detach from the class?">
              <button type="button" className="cmBtn cmBtn--danger cmBtn--small" onClick={() => { setConfirm(null); actions.detach(object.id) }}>Detach it</button>
              <button type="button" className="cmBtn cmBtn--small" onClick={() => setConfirm(null)}>Keep it a member</button>
            </span>
          ) : <button type="button" className="cmBtn cmBtn--small" title="Copy what it follows once: it stops following the pattern and keeps its look" onClick={() => setConfirm('detach')}>Detach from the class</button>}
        </>
      )}
      {k.exclusive && members.length > 1 && isTemplate && (
        <div className="cmChips" role="group" aria-label="Member shown">
          {members.map(m => <button key={m.id} type="button" className={`cmChip cmChip--wide${shown?.id === m.id ? ' cmChip--on' : ''}`} aria-pressed={shown?.id === m.id} onClick={() => actions.showMember(k.id, m.id)}>{label(m.name, 'Untitled object')}</button>)}
        </div>
      )}
    </section>
  )
}

// What a shape of a member does: it follows the pattern's shape, or has an outline of its own; either way it can be left out of the member.
export function FollowPanel({ content, shape, actions }: { content: ModelContent; shape: ModelShape; actions: ClassActions }) {
  const followed = followedShape(content, shape)
  if (!shape.copyOf) return null
  const own = shape.pts.length >= 3
  return (
    <section className="cmSec cmClass" aria-label="Follows the pattern">
      <h3 className="cmInsSub">Follows the pattern</h3>
      <p className="cmInsText">{followed ? `Follows ${label(followed.name, 'a shape of the pattern')}.` : 'The shape it followed is gone.'} {own ? 'It has an outline of its own, so it no longer follows the pattern\'s points.' : 'Its outline is the pattern\'s: move a point to give it one of its own.'}</p>
      <div className="cmInline">
        <button type="button" className="cmBtn cmBtn--small" disabled={!own && !shape.back} onClick={() => actions.followTemplate(shape.id)}>Follow the pattern again</button>
        <button type="button" className={`cmBtn cmBtn--small${shape.hide ? ' cmBtn--on' : ''}`} aria-pressed={!!shape.hide} title="Leave this shape out of the member" onClick={() => actions.hideShape(shape.id, !shape.hide)}>Hide in this member</button>
      </div>
    </section>
  )
}

