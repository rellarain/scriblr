import { useState } from 'react'
import { PROJECT_NAME_MAX, type WriterWorkspace } from './useWriterWorkspace'
import { rangeOf } from '../../../theme/bookColors'
import HueSlider from './HueSlider'
import TimeSystemEditor from './TimeSystemEditor'

// The project's name. While it is being typed the text is the field's own: it can be cleared on the way to another name, but only a name
// is saved (the project keeps its last one until there is a new one), and leaving the field puts the saved name back and trims it.
function ProjectName({ w }: { w: WriterWorkspace }) {
  const title = w.activeProject?.title ?? ''
  const [text, setText] = useState<string | null>(null)
  const blank = text !== null && text.trim() === ''
  return (
    <>
      <div className="wrCardPanelHead">
        <input
          className="wrTitleField" value={text ?? title} placeholder="Project name" aria-label="Project name" aria-invalid={blank} maxLength={PROJECT_NAME_MAX}
          onChange={e => { setText(e.target.value); w.renameProject(e.target.value) }}
          onBlur={() => setText(null)}
        />
      </div>
      {blank && <p className="wrHint" role="status">A project needs a name. It keeps “{title}” until you type another.</p>}
    </>
  )
}

// The Project editor: the project's own settings -- its name, its colour (the root of the level
// colours: a book stays within 90 degrees of it) and its time systems.
export default function ProjectEditor({ w }: { w: WriterWorkspace }) {
  return (
    <div className="wrTimeSystems">
      <div className="wrCardPanel">
        <div className="wrCardPanelHead"><strong>Name</strong></div>
        <p className="wrHint">What the project is called on the shelves and at the top of the Project level.</p>
        <ProjectName w={w} />
      </div>
      <div className="wrCardPanel">
        <div className="wrCardPanelHead"><strong>Colour</strong></div>
        <p className="wrHint">
          The project's own colour tints its level and can be any colour. A book stays within 90° of it, an arc within 60° of its book,
          and a chapter within 30° of its arc. A series has no colour of its own: it shows the project's.
        </p>
        <HueSlider label="Project colour" className="wrNodeHue" hue={w.projectHue} centre={null} range={rangeOf('project')} onChange={w.setProjectHue} />
      </div>
      <TimeSystemEditor w={w} />
    </div>
  )
}
