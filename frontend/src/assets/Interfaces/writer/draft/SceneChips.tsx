import type { OutlineNode, TimeSystem } from '../../../../api/types'
import { inheritedSceneValues, sceneChanges } from '../outlineTree'
import { formatTime } from '../timeSystem'

const LABEL = { location: 'Location', time: 'Time', action: 'Action' } as const

// A scene's Location, Time and Action as read-only chips: its own value, else the one it
// inherits from the scenes before it (faded), else no chip at all (and no row when there
// are none). A value that differs from what it inherits is filled with the accent colour.
export function SceneChips({ scene, scenes, system }: { scene: OutlineNode; scenes: OutlineNode[]; system: TimeSystem }) {
  const inherited = inheritedSceneValues(scenes, scenes.findIndex(s => s.id === scene.id))
  const changes = sceneChanges(scene, inherited)

  const chip = (key: keyof typeof LABEL, own: string, inheritedText: string) => {
    const text = own || inheritedText
    if (!text) return null
    return (
      <span
        key={key}
        className={`wrStripChip wrStripChip--${key}${changes[key] ? ' wrStripChip--changed' : ''}${own ? '' : ' wrStripChip--empty'}`}
        title={changes[key] ? `${LABEL[key]} changed from the previous scene` : LABEL[key]}
      >
        {text}
      </span>
    )
  }
  const chips = [
    chip('location', scene.location?.trim() ? scene.location : '', inherited.location ?? ''),
    chip('time', formatTime(system, scene.timeValue), inherited.timeValue ? formatTime(system, inherited.timeValue) : ''),
    chip('action', scene.action?.trim() ? scene.action : '', inherited.action ?? ''),
  ].filter(Boolean)
  return chips.length > 0 ? <div className="wrSceneFields">{chips}</div> : null
}

export default SceneChips
