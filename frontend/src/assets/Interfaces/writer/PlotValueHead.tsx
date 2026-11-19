import { Fragment } from 'react'
import type { ValueHeader } from './plotFields'
import { nodeLabel } from './plotTree'

// The two lines that head a value's card in the Plot editor and a plotpoint's tile in the tray, the outline and Compare (the user, 2026-11-18):
//   the place  the category, subcategory and cluster above the holder ("Romance › Slow burn › Crew"), at the top right, in small capitals at the
//              smallest size, in the card's subtle ink;
//   the head   the holder (the plotline, or the node whose editor defines the value) in the card's own ink, then the fieldset and the field in the
//              subtle ink, small capitals a step larger.
export const placeText = (head: ValueHeader) => head.place.map(nodeLabel).join(' › ')

export function PlotValuePlace({ head, className = '' }: { head: ValueHeader; className?: string }) {
  const text = placeText(head)
  if (text === '') return null
  return <span className={`wrValuePlace ${className}`.trim()} title={text}>{text}</span>
}

// `inline` draws it as a span, for a place that holds only phrasing content (the Draft's footnote card is a button).
export function PlotValueHead({ head, fallbackField, inline }: { head: ValueHeader; fallbackField?: string; inline?: boolean }) {
  const field = head.field || fallbackField || ''
  const parts = [
    ...(head.holder ? [{ key: 'holder', text: nodeLabel(head.holder), cls: 'wrValueHolder' }] : []),
    ...(head.fieldset ? [{ key: 'set', text: head.fieldset, cls: 'wrValueField' }] : []),
    ...(field ? [{ key: 'field', text: field, cls: 'wrValueField' }] : []),
  ]
  if (parts.length === 0) return null
  const Tag = inline ? 'span' : 'div'
  return (
    <Tag className="wrValueHead">
      {parts.map((p, i) => (
        <Fragment key={p.key}>{i > 0 && <span className="wrValueSep"> · </span>}<span className={p.cls}>{p.text}</span></Fragment>
      ))}
    </Tag>
  )
}
