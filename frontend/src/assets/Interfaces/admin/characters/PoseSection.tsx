import { useState } from 'react'
import type { ModelContent } from '../../../../api/types'
import { CloseIcon } from '../../../icons'
import { POSE_NAME_MAX, freshPoseName, posesOf } from './engine/poses'
import type { PoseHolds } from './engine/posing'
import { poseOf } from './engine/pivots'

// The Pose section (slice 9d) in the shape editor's Overview: Drag to pose (the figure is posed by dragging it, whatever is selected), what holds still while a part reaches
// (the limb's shoulder or hip, or nothing but the anchor), Reset the pose, and the poses kept by name (saved, put back, renamed, deleted).

export interface PoseActions {
  on: boolean
  onToggle: (on: boolean) => void
  holds: PoseHolds
  onHolds: (holds: PoseHolds) => void
  posed: boolean
  onReset: () => void
  onSave: (name: string) => void
  onApply: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function PoseSection({ content, actions }: { content: ModelContent; actions: PoseActions }) {
  const [name, setName] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const joints = poseOf(content).joints.size, poses = posesOf(content)
  const chip = (on: boolean, label: string, onClick: () => void) => (
    <button type="button" className={`cmBtn cmBtn--small${on ? ' cmBtn--on' : ''}`} aria-pressed={on} onClick={onClick}>{label}</button>
  )
  return (
    <div className="cmDraw" role="group" aria-label="Pose">
      <h3 className="cmInsSub">Pose</h3>
      {joints === 0 ? <p className="cmInsText">Nothing to pose yet: the figure needs pivot points between its parts.</p> : (
        <>
          <div className="cmInline">{chip(actions.on, 'Drag to pose', () => actions.onToggle(!actions.on))}</div>
          <p className="cmInsText">{actions.on
            ? 'Drag a hand or a foot and the limb reaches for the pointer; drag an elbow or a knee to swing the limb from its shoulder or hip. Each joint stays within its limits.'
            : 'Turn this on to pose the figure by dragging it, whatever is selected (with a group or an object selected, its parts can be dragged anyway).'}</p>
          <div className="cmInline" role="group" aria-label="Holds still">
            <span className="cmPartHint">Holds still</span>
            {chip(actions.holds === 'limb', 'Shoulder or hip', () => actions.onHolds('limb'))}
            {chip(actions.holds === 'anchor', 'Nothing', () => actions.onHolds('anchor'))}
          </div>
          <div className="cmInline">
            <button type="button" className="cmBtn cmBtn--small" disabled={!actions.posed} onClick={actions.onReset}>Reset the pose</button>
          </div>
          <div className="cmInline">
            <input className="cmGuideName" value={name} maxLength={POSE_NAME_MAX} placeholder={freshPoseName(content)} aria-label="Name of the new pose"
              onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && actions.posed) { actions.onSave(name); setName('') } }} />
            <button type="button" className="cmBtn cmBtn--small" disabled={!actions.posed} onClick={() => { actions.onSave(name); setName('') }}>Save as a pose</button>
          </div>
          {poses.length > 0 && (
            <ul className="cmGuideLines" aria-label="Saved poses">
              {poses.map(p => (
                <li key={p.id} className="cmGuideLine">
                  <input className="cmGuideName" value={names[p.id] ?? p.name} maxLength={POSE_NAME_MAX} aria-label={`Name of the pose ${p.name}`}
                    onChange={e => setNames(n => ({ ...n, [p.id]: e.target.value }))}
                    onBlur={() => { const to = (names[p.id] ?? p.name).trim(); if (to && to !== p.name) actions.onRename(p.id, to); setNames(n => { const { [p.id]: _x, ...rest } = n; return rest }) }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                  <button type="button" className="cmBtn cmBtn--small" aria-label={`Put back ${p.name}`} onClick={() => actions.onApply(p.id)}>Put back</button>
                  <button type="button" className="cmIconBtn" aria-label={`Delete the pose ${p.name}`} title="Delete the pose" onClick={() => actions.onDelete(p.id)}><CloseIcon size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
