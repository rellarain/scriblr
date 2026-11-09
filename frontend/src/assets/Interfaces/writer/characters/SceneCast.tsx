import { useState } from 'react'
import { setAppearance, taggedOn, useCast } from './castStore'
import { CharacterArt } from './figure/CharacterArt'
import { useFigureModels } from './figure/figureModelStore'

// Who is in a scene (or a chapter): the faces of the characters tagged on it, with their names. In the Outline it can be edited (take one out, tag another); in the Draft it
// only shows. A tag is kept on the character, so it is saved at once with the character.
export function SceneCast({ projectId, nodeId, editable = false }: { projectId: string | null; nodeId: string; editable?: boolean }) {
  const { cast } = useCast(projectId)
  useFigureModels(projectId)
  const [failed, setFailed] = useState(false)
  if (!projectId) return null
  const tagged = taggedOn(cast, nodeId)
  const free = cast.filter(c => !c.appearances.includes(nodeId))
  if (tagged.length === 0 && !(editable && cast.length > 0)) return null
  const change = (characterId: string, on: boolean) => { setFailed(false); void setAppearance(projectId, characterId, nodeId, on).then(ok => { if (!ok) setFailed(true) }) }
  return (
    <div className="charTags" role="group" aria-label="Characters in this scene">
      {tagged.map(c => (
        <span key={c.id} className="charTag" title={[c.name, c.profile.role].filter(Boolean).join(', ')}>
          <span className="charTagHead" aria-hidden="true"><CharacterArt portrait={c.portrait} figure={c.figure} crop="head" label="" className="charArt" /></span>
          <span>{c.name}</span>
          {editable && <button type="button" className="charTagRemove" aria-label={`Take ${c.name} out of this scene`} title={`Take ${c.name} out of this scene`} onClick={() => change(c.id, false)}>×</button>}
        </span>
      ))}
      {editable && free.length > 0 && (
        <select className="charSelect charSelect--auto charTagAdd" aria-label="Tag a character in this scene" value="" onChange={e => { if (e.target.value) change(e.target.value, true) }}>
          <option value="">Add a character</option>
          {free.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {failed && <span className="charHint" role="alert">That could not be saved.</span>}
    </div>
  )
}
