import { useState } from 'react'
import CopyPlainText from '../components/markup/CopyPlainText'
import Markup from '../components/markup/Markup'
import MarkupEditor from '../components/markup/MarkupEditor'
import MarkupPlace from '../components/markup/MarkupPlace'

// The design-system card of Scriblr's markup: the editor (Write, Read-only, Side by side, the checks and the cheat sheet) on a text that uses
// every marker, and the same text as a reader sees it, with Copy as plain text.

export const MARKUP_SAMPLE = `###### Writing a scene

A scene is **one moment** that *changes something*.
A single line break stays a line break.

#### Before you start

>> Open the chapter
>>>> Choose a moment
>>>> Give it a title
>> Write the draft
>>> Save often
> Read it back aloud

" Show the change, do not tell it.

Read the @writer@draft guide, the lesson @training@writer-c1@writer-c1-m1@writer-c1-m1-l1, go back to @#before-you-start[the steps], or try @writer@gone.

## A practice question

???? Which of these is a scene?
???! It needs a change.
?! A quarrel that ends a friendship
!! Something is different afterwards.
?? A list of the castle's rooms
!! Nothing changes.

???? Name the unit a draft is written in.
? One word
! moment

Text after the questions ends them.
??! stray option, to show a check
####### seven, to show a check`

export function MarkupCard() {
  const [text, setText] = useState(MARKUP_SAMPLE)
  return (
    <div className="uiPvMarkup" style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', alignItems: 'start' }}>
      <section aria-label="The editor">
        <MarkupEditor value={text} onChange={setText} label="Lesson material" baseLevel={2} rows={22} />
      </section>
      <section aria-label="As a reader sees it">
        <MarkupPlace>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><CopyPlainText text={text} /></div>
          <Markup text={text} baseLevel={3} />
        </MarkupPlace>
      </section>
    </div>
  )
}

export default MarkupCard
