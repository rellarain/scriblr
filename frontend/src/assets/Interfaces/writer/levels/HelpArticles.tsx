import type { ReactNode } from 'react'
import { articlesFor } from '../../../../channels/articles'
import type { HelpTarget } from '../../../../channels/helpTargets'
import { useResourcesFile } from '../../../../channels/resourcesStore'
import MarkupPlace, { ArticleBody } from '../../../../components/markup/MarkupPlace'

export { articleText, articlesFor, type Article } from '../../../../channels/articles'

// A level's Help tab: the resource articles written for it (the Resources builder in the AUI), formatted from the markup, or its short
// default text (or what the panel shows instead) while none are authored. A link in an article opens in place, with Back.
export function HelpArticles({ target, fallback }: { target: HelpTarget; fallback: ReactNode }) {
  const { file, ready } = useResourcesFile()
  if (!ready && !file) return <p className="wrMuted">Loading help…</p>
  const articles = file ? articlesFor(file, target) : []
  if (articles.length === 0) return typeof fallback === 'string' ? <p className="wrHelpText">{fallback}</p> : <>{fallback}</>
  return (
    <MarkupPlace>
      <div className="wrHelp">
        {articles.map(({ node, content }) => <ArticleBody key={node.id} node={node} content={content} />)}
      </div>
    </MarkupPlace>
  )
}

export default HelpArticles
