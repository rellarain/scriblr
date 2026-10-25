import type { WriterWorkspace } from './useWriterWorkspace'
import { rangeOf } from '../../../theme/bookColors'
import HueSlider from './HueSlider'
import TimeSystemEditor from './TimeSystemEditor'

// The Project editor: the project's own settings -- its colour (the root of the level
// colours: a book stays within 90 degrees of it) and its time systems.
export default function ProjectEditor({ w }: { w: WriterWorkspace }) {
  return (
    <div className="wrTimeSystems">
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
