import { useState } from 'react'
import { useWriterWorkspace } from './writer/useWriterWorkspace'
import WriterLevels from './writer/levels/WriterLevels'
import { PAGES_COMPONENTS } from './writer/consoleDefs'
import './writer/writer.scss'

// The Writer page: four stacked levels -- Dash, Project, Outline (the open book)
// and Draft (the open chapter) -- one focused (Max) and the others Mid or Min
// (writer/levels/). Opening a project, a book or a chapter moves the focus down a
// level; each level's title brings it back.
function WUI() {
  const workspace = useWriterWorkspace()
  const [pagesComponent, setPagesComponent] = useState<string>(PAGES_COMPONENTS[0].key)

  return (
    <main className="wUI wr">
      <WriterLevels w={workspace} pagesComponent={pagesComponent} onPagesComponent={setPagesComponent} />
    </main>
  )
}

export default WUI
