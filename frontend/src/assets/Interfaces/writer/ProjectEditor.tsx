import type { WriterWorkspace } from './useWriterWorkspace'
import HueSlider from './HueSlider'
import TimeSystemEditor from './TimeSystemEditor'

// The Project editor: the project's own settings -- its colour (the root of the level
// colours: series stay within 60 degrees of it) and its time systems.
export default function ProjectEditor({ w }: { w: WriterWorkspace }) {
  return (
    <div className="wrTimeSystems">
      <div className="wrCardPanel">
        <div className="wrCardPanelHead"><strong>Colour</strong></div>
        <p className="wrHint">
          The project's own colour tints its level. Each series stays within 60° of it, each book can be any colour,
          and each arc and chapter stays within 60° of the one above.
        </p>
        <HueSlider label="Project colour" className="wrNodeHue" hue={w.projectHue} centre={null} onChange={w.setProjectHue} />
      </div>
      <TimeSystemEditor w={w} />
    </div>
  )
}
