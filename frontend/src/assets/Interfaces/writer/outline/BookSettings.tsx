import { useState } from 'react'
import type { OutlineNode, PreviewFormat } from '../../../../api/types'
import type { WriterWorkspace } from '../useWriterWorkspace'
import { bookThemeHue } from '../../../../theme/bookColors'
import HueSlider from '../HueSlider'
import { systemForBook } from '../timeSystem'
import { DEFAULT_PREVIEW_FORMAT, FORMAT_LIMITS, formatOf } from '../previewFormat'
import GoalField from './GoalField'

// A number held to its limits. While it is being typed the text is the field's own (a half-typed
// "2" on the way to "21" is not yet a value); a value inside the limits applies at once, and leaving
// the field puts a value outside them back inside.
function NumberField({ label, value, limits, onChange }: {
  label: string; value: number; limits: { min: number; max: number; step: number }; onChange: (n: number) => void
}) {
  const [text, setText] = useState<string | null>(null)
  const clamp = (n: number) => Math.min(limits.max, Math.max(limits.min, n))
  return (
    <label className="wrBookEdField">
      <span className="wrLabel">{label}</span>
      <input
        className="wrField" type="number" aria-label={label} value={text ?? value} min={limits.min} max={limits.max} step={limits.step}
        onChange={e => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n) && n >= limits.min && n <= limits.max) onChange(n)
        }}
        onBlur={e => {
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n)) onChange(clamp(n))
          setText(null)
        }}
      />
    </label>
  )
}

// How the book's chapters are laid out in the preview: font, size and styling, alignment, line
// spacing and paragraph indentation and spacing. A book with none of its own has the defaults.
function PreviewFormatFields({ w, book }: { w: WriterWorkspace; book: OutlineNode }) {
  const format = formatOf(book)
  const set = (patch: Partial<PreviewFormat>) => w.updateOutlineNode(book.id, { previewFormat: { ...format, ...patch } })
  const custom = book.previewFormat != null
  return (
    <fieldset className="wrBookEdField wrBookEdField--wide wrFormatFields">
      <legend className="wrLabel">Preview formatting</legend>
      <div className="wrFormatGrid">
        <label className="wrBookEdField">
          <span className="wrLabel">Font</span>
          <select className="wrField" aria-label="Preview font" value={format.fontFamily} onChange={e => set({ fontFamily: e.target.value as PreviewFormat['fontFamily'] })}>
            <option value="serif">Serif</option><option value="sans">Sans-serif</option><option value="mono">Monospace</option>
          </select>
        </label>
        <NumberField label="Font size" value={format.fontSize} limits={FORMAT_LIMITS.fontSize} onChange={n => set({ fontSize: Math.round(n) })} />
        <div className="wrBookEdField">
          <span className="wrLabel">Style</span>
          <span className="wrFormatStyle">
            <button type="button" className={format.fontWeight === 'bold' ? 'wrSmallBtn wrSmallBtn--accent' : 'wrSmallBtn'} aria-pressed={format.fontWeight === 'bold'} aria-label="Bold" onClick={() => set({ fontWeight: format.fontWeight === 'bold' ? 'normal' : 'bold' })}><b>B</b></button>
            <button type="button" className={format.fontStyle === 'italic' ? 'wrSmallBtn wrSmallBtn--accent' : 'wrSmallBtn'} aria-pressed={format.fontStyle === 'italic'} aria-label="Italic" onClick={() => set({ fontStyle: format.fontStyle === 'italic' ? 'normal' : 'italic' })}><i>I</i></button>
          </span>
        </div>
        <label className="wrBookEdField">
          <span className="wrLabel">Alignment</span>
          <select className="wrField" aria-label="Preview alignment" value={format.textAlign} onChange={e => set({ textAlign: e.target.value as PreviewFormat['textAlign'] })}>
            <option value="justify">Justified</option><option value="left">Left</option>
          </select>
        </label>
        <NumberField label="Line spacing" value={format.lineSpacing} limits={FORMAT_LIMITS.lineSpacing} onChange={n => set({ lineSpacing: n })} />
        <NumberField label="Paragraph indent (em)" value={format.paragraphIndent} limits={FORMAT_LIMITS.paragraphIndent} onChange={n => set({ paragraphIndent: n })} />
        <NumberField label="Paragraph spacing (em)" value={format.paragraphSpacing} limits={FORMAT_LIMITS.paragraphSpacing} onChange={n => set({ paragraphSpacing: n })} />
      </div>
      <button type="button" className="wrSmallBtn" disabled={!custom} onClick={() => w.updateOutlineNode(book.id, { previewFormat: null })}>
        Reset to the defaults ({DEFAULT_PREVIEW_FORMAT.fontSize}px {DEFAULT_PREVIEW_FORMAT.fontFamily})
      </button>
    </fieldset>
  )
}

// The book's own settings (the Outline level's Settings tab): its title, summary, colour,
// time system, goals and how its chapters are formatted in the preview.
export function BookSettings({ w, book, bookWords, compact = false }: { w: WriterWorkspace; book: OutlineNode; bookWords: number; compact?: boolean }) {
  const themeHue = bookThemeHue(book)
  const timeSystems = w.activeProject?.settings.timeSystems ?? []
  const chapters = w.activeBookChapters
  return (
    <div className={compact ? 'wrBookEdBody wrBookEdBody--compact' : 'wrBookEdBody'}>
      <label className="wrBookEdField">
        <span className="wrLabel">Title</span>
        <input
          className="wrField" value={book.title} placeholder="Book title" aria-label="Book title"
          onChange={e => w.updateOutlineNode(book.id, { title: e.target.value })}
        />
      </label>
      <label className="wrBookEdField wrBookEdField--wide">
        <span className="wrLabel">Summary</span>
        <textarea
          className="wrField" rows={3} value={book.synopsis} placeholder="What is this book about?"
          onChange={e => w.updateOutlineNode(book.id, { synopsis: e.target.value })}
        />
      </label>
      <div className="wrBookEdField">
        <span className="wrLabel">Colour</span>
        <HueSlider label="Book colour" hue={themeHue} centre={null} onChange={code => w.setNodeHue(book.id, code)} />
      </div>
      {timeSystems.length > 1 && (
        <label className="wrBookEdField">
          <span className="wrLabel">Time system</span>
          <select
            className="wrField" value={systemForBook(timeSystems, book).id}
            onChange={e => w.updateOutlineNode(book.id, { timeSystemId: e.target.value })}
          >
            {timeSystems.map(sys => <option key={sys.id} value={sys.id}>{sys.name}</option>)}
          </select>
        </label>
      )}
      <div className="wrBookEdGoals">
        <GoalField
          label="Chapter target" current={chapters.length} goal={book.chapterCountTarget}
          onChange={n => w.updateOutlineNode(book.id, { chapterCountTarget: n })}
        />
        <GoalField
          label="Word goal" current={bookWords} goal={book.wordCountGoal}
          onChange={n => w.updateOutlineNode(book.id, { wordCountGoal: n })}
        />
      </div>
      <PreviewFormatFields w={w} book={book} />
    </div>
  )
}

export default BookSettings
