import { useMemo } from 'react'
import type { OutlineNode } from '../../../../api/types'
import { BagIcon } from '../../../icons'
import { storyPoints } from '../characters/story'
import { requestOpen } from '../links/worldNav'
import { itemsEverHeldBy } from './itemModel'
import { useItemStore } from './itemStore'
import './items.scss'

// What a character has had, from the item library: each item with the chapter or scene they got it at, and whether they still have it at the end of the story.
// Each opens the item in the Items console. Shown under a character's story; nothing when the library has no item with them.
export function CarriedItems({ projectId, characterId, outline }: { projectId: string; characterId: string; outline: OutlineNode[] }) {
  const { items } = useItemStore(projectId)
  const points = useMemo(() => storyPoints(outline), [outline])
  const mine = useMemo(() => itemsEverHeldBy(items, `char:${characterId}`, points), [items, characterId, points])
  if (mine.length === 0) return null
  return (
    <div className="itemCarried" role="group" aria-label="Items they have had">
      <h4 className="itemCarriedTitle"><BagIcon size={14} />Items they have had</h4>
      <ul className="itemCarriedList">
        {mine.map(({ item, from, now }) => (
          <li key={item.id}>
            <button type="button" className="itemCarriedOpen" aria-label={`Open ${item.name}`} title={`Open ${item.name}`} onClick={() => requestOpen('item', item.id)}>
              <span>{item.name}</span>
              <span className="itemCarriedWhen">{now ? 'has it at the end' : 'passed on'}{from ? `, from ${points.find(p => p.id === from)?.title ?? 'a part that is gone'}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
