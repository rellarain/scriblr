import type { WriterWorkspace } from './useWriterWorkspace'
import { HELP_COMPONENT, SETTINGS_COMPONENT, SHELF_COMPONENTS } from './consoleDefs'
import { ConsoleTitleRow, Placeholder } from './shared'
import { chaptersOfBook } from './outlineTree'
import PlotView from './PlotView'

// The Shelf console: everything about the open project as a whole. Project
// Plot is the working editor; the project outline lists its books and
// chapters; the remaining components are placeholders until they are built.
function ProjectOutline({ w }: { w: WriterWorkspace }) {
  if (w.books.length === 0) return <p className="wrMuted">This project has no books yet.</p>
  return (
    <div className="wrProjectOutline">
      {w.books.map(book => {
        const chapters = chaptersOfBook(w.outlineNodes, book.id)
        return (
          <div key={book.id} className="wrCardPanel">
            <div className="wrCardPanelHead">
              <span className="wrKindBadge">book</span>
              <button type="button" className="wrLinkBtn wrLinkBtn--title" onClick={() => w.openBook(book.id)}>{book.title}</button>
              <span className="wrOutlineMeta">{chapters.length} chapters</span>
            </div>
            {chapters.map((c, i) => (
              <button key={c.id} type="button" className="wrChildRow" onClick={() => w.openChapter(c.id)}>
                <span className="wrChildRowTitle">{i + 1} · {c.title}</span>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function ProjectConsole({ w, component }: { w: WriterWorkspace; component: string }) {
  const def = [...SHELF_COMPONENTS, SETTINGS_COMPONENT, HELP_COMPONENT].find(c => c.key === component)
  const project = w.activeProject?.title ?? ''

  let body
  if (w.outlineStatus === 'loading') body = <p className="wrMuted">Loading project…</p>
  else if (w.outlineStatus === 'error') body = <p className="wrError">{w.outlineError ?? 'Failed to load the project.'}</p>
  else if (component === 'projectPlot') body = <PlotView w={w} />
  else if (component === 'projectOutline') body = <ProjectOutline w={w} />
  else body = <Placeholder title={def?.label ?? ''} body={def?.body} />

  return (
    <>
      <ConsoleTitleRow
        console="Shelf" component={`${def?.label ?? ''} · ${project}`}
        right={<span className="wrSaveState">{w.saving || w.plotSaving ? 'Saving…' : ''}</span>}
      />
      {w.saveError && <p className="wrError">{w.saveError}</p>}
      {w.warnings.length > 0 && <p className="wrMuted">{w.warnings.join(' ')}</p>}
      <div className="wrConsoleBody">{body}</div>
    </>
  )
}

export default ProjectConsole
