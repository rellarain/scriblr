import type { OutlineNode, TimeSystem } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { inheritedSceneValues, sceneChanges } from '../outlineTree'
import { SceneTime } from '../SceneTime'
import { formatTime } from '../timeSystem'

const LABEL = { location: 'Location', time: 'Time', action: 'Action' } as const

// A scene's Location, Time and Action, all editable. A field left empty takes the
// value of the nearest earlier scene in its chapter as its placeholder (never
// saved), or its own name when nothing precedes. A field with a value that differs
// from what it inherits is filled with the book's accent colour.
export function SceneFields({ w, scene, scenes, system }: {
  w: WriterWorkspace
  scene: OutlineNode
  // The scenes of the scene's chapter, in order.
  scenes: OutlineNode[]
  system: TimeSystem
}) {
  const at = scenes.findIndex(s => s.id === scene.id)
  const inherited = inheritedSceneValues(scenes, at)
  const changes = sceneChanges(scene, inherited)
  const changedTitle = (key: keyof typeof LABEL) => (changes[key] ? `${LABEL[key]} changed from the previous scene` : LABEL[key])
  const inheritedTime = inherited.timeValue ? formatTime(system, inherited.timeValue) : ''

  const field = (key: 'location' | 'action') => (
    <input
      className={changes[key] ? `wrSceneField wrSceneField--${key} wrSceneField--changed` : `wrSceneField wrSceneField--${key}`}
      placeholder={inherited[key] ?? LABEL[key]} value={scene[key] ?? ''} data-kf=""
      aria-label={LABEL[key]} title={changedTitle(key)}
      onChange={e => w.updateOutlineNode(scene.id, { [key]: e.target.value })}
    />
  )
  return (
    <div className="wrSceneFields">
      {field('location')}
      <SceneTime
        system={system} value={scene.timeValue} changed={changes.time} placeholder={inheritedTime || LABEL.time}
        onChange={next => w.updateOutlineNode(scene.id, { timeValue: next })}
      />
      {field('action')}
    </div>
  )
}

export default SceneFields
