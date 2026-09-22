import { ArcIcon, CheckboxIcon } from '../../../icons'
import type { TileDef } from '../../../../components/tiles/tileTypes'
import { BOOK_COMPONENTS } from '../consoleDefs'
import { buildChildIndex, descendantsOf } from '../outlineTree'
import { Placeholder } from '../shared'
import type { WriterWorkspace } from '../useWriterWorkspace'

// The Book screen keeps the book face editor; the book's other pages are short link
// tiles above it that expand into their consoles.
const def = (key: string) => BOOK_COMPONENTS.find(c => c.key === key)

export function bookLinkTiles(w: WriterWorkspace): TileDef[] {
  const book = w.activeBook
  const arcs = book ? descendantsOf(buildChildIndex(w.outlineNodes), book.id).filter(n => n.kind === 'arc').length : 0
  const page = (key: string) => () => <Placeholder title={def(key)?.label ?? ''} body={def(key)?.body} />
  return [
    {
      id: 'outlineTemplate', title: 'Outline template', Icon: CheckboxIcon, defaultShape: 'mini',
      summary: 'Chapter templates', console: page('outlineTemplate'),
    },
    {
      id: 'arcOutline', title: 'Arc outline', Icon: ArcIcon, defaultShape: 'mini',
      summary: `${arcs} ${arcs === 1 ? 'arc' : 'arcs'}`, console: page('arcOutline'),
    },
  ]
}
