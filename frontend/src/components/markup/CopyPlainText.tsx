import { useEffect, useState } from 'react'
import { CopyIcon } from '../../assets/icons'
import { linksOf } from '../../lib/markup/checks'
import { linkTitle } from '../../lib/markup/links'
import { parseCached } from '../../lib/markup/parse'
import { plainTextOf } from '../../lib/markup/plainText'
import { useLinkContext } from './linkContext'

// Copy as plain text, for readers: the words with no markers, links as their titles, leaving out answers, hints and explanations.
export function CopyPlainText({ text, label = 'Copy as plain text' }: { text: string; label?: string }) {
  const links = useLinkContext(text, linksOf(parseCached(text).blocks).length > 0)
  const [said, setSaid] = useState('')
  useEffect(() => {
    if (!said) return
    const t = window.setTimeout(() => setSaid(''), 2500)
    return () => window.clearTimeout(t)
  }, [said])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainTextOf(text, link => linkTitle(link, links)))
      setSaid('Copied')
    } catch {
      setSaid('Could not copy')
    }
  }
  return (
    <span className="mkCopy">
      <button type="button" className="mkIconBtn" aria-label={label} title={label} onClick={copy}><CopyIcon size={16} /></button>
      <span className="mkCopyNote" role="status">{said}</span>
    </span>
  )
}

export default CopyPlainText
