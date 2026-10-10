import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildBundle } from './bundle'
import { FRONTEND_DIR, PROJECT_DIR, SYSTEM_DIR, generateStatic } from './generate'

// `npm run design-system`: writes the generated files of the design system, docs/design-system/project/ (the hand-written pages sit beside
// them), and the bundle the previews run. `--no-bundle` skips the bundle (it is the slow part, and it is git-ignored).

async function main() {
  const files = generateStatic()
  rmSync(path.join(PROJECT_DIR, 'assets/Icons'), { recursive: true, force: true })
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(SYSTEM_DIR, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf-8')
  }
  console.log(`Wrote ${Object.keys(files).length} files to ${SYSTEM_DIR}`)
  if (process.argv.includes('--no-bundle')) return
  const { js, css } = await buildBundle(FRONTEND_DIR)
  mkdirSync(path.join(PROJECT_DIR, 'components'), { recursive: true })
  writeFileSync(path.join(PROJECT_DIR, 'components/bundle.js'), js, 'utf-8')
  writeFileSync(path.join(PROJECT_DIR, 'components/bundle.css'), css, 'utf-8')
  console.log(`Bundle: ${(js.length / 1024).toFixed(0)} KB script, ${(css.length / 1024).toFixed(0)} KB stylesheet`)
}

void main()
