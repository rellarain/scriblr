import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CARD_META, type CardMeta } from '../../src/designSystem/cardMeta'
import { audit } from '../../src/theme/contrastAudit'
import { contrastMarkdown } from './contrastDoc'
import { buildIcons, ICONS_README } from './icons'
import { buildTokens } from './tokens'

export const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// The design system, committed with the code (the hand-written pages sit beside the generated ones). `project/` is what the artifact holds.
export const SYSTEM_DIR = path.resolve(FRONTEND_DIR, '../docs/design-system')
export const PROJECT_DIR = path.join(SYSTEM_DIR, 'project')

// A card's preview: the document the Design System page shows for the component, with the bundle and stylesheet already loaded.
export function previewHtml(card: CardMeta): string {
  return `<!-- @dsCard group="${card.group}" height=${card.height + 120} -->
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${card.title}</title>
<style>html, body { margin: 0; }</style>
<div id="root"></div>
<script>Scriblr.mountCard(document.getElementById('root'), '${card.id}')</script>
`
}

// A page to see the cards locally: it loads the bundle itself (`?card=level-panels`), as the Design System page does for a preview.
function devHtml(): string {
  const list = CARD_META.map(c => `<li><a href="?card=${c.id}">${c.title}</a></li>`).join('')
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scriblr design system previews</title>
<link rel="stylesheet" href="project/components/bundle.css">
<style>body { margin: 0; font: 14px system-ui, sans-serif; } nav ul { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 12px; margin: 0; list-style: none; }</style>
<nav><ul>${list}</ul></nav>
<div id="root"></div>
<script src="project/components/bundle.js"></script>
<script>
  var id = new URLSearchParams(location.search).get('card');
  if (id) Scriblr.mountCard(document.getElementById('root'), id);
</script>
`
}

// The generated text files, by path under docs/design-system/.
export function generateStatic(): Record<string, string> {
  const files: Record<string, string> = {
    'project/tokens.json': `${JSON.stringify(buildTokens(), null, 2)}\n`,
    'project/contrast.md': contrastMarkdown(audit()),
    'project/assets/Icons/README.md': ICONS_README,
    'dev.html': devHtml(),
  }
  for (const [name, svg] of Object.entries(buildIcons())) files[`project/assets/Icons/${name}`] = svg
  for (const card of CARD_META) files[`project/components/${card.dir}/preview.html`] = previewHtml(card)
  return files
}
