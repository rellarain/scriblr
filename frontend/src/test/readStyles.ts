import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..')

// The files of a stylesheet for a test that scans it. The Writer's stylesheet is an index of partials (assets/Interfaces/writer/styles/):
// reading just writer.scss would scan a dozen lines and let every rule slip past, so a sheet with a `styles/` folder beside it is read
// together with its partials. `file` is relative to `src/`.
export function readStyleFiles(file: string): Array<{ name: string; text: string }> {
  const main = path.resolve(SRC, file)
  const files = [{ name: file, text: readFileSync(main, 'utf-8') }]
  const partials = path.join(path.dirname(main), 'styles')
  if (path.basename(main) === 'writer.scss' && existsSync(partials)) {
    for (const name of readdirSync(partials).filter(n => n.endsWith('.scss')).sort()) {
      files.push({ name: `styles/${name}`, text: readFileSync(path.join(partials, name), 'utf-8') })
    }
  }
  return files
}

// The same, as one text.
export function readStyles(file: string): string {
  return readStyleFiles(file).map(f => f.text).join('\n')
}
