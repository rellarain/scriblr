import { build, type Plugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as sass from 'sass'

// components/bundle.js and bundle.css: the app's real code, bundled for the previews. One classic script that sets `window.Scriblr`
// (React, the components, the theme engine and a pretend backend), and the stylesheet esbuild collects from every .scss and .css the code
// imports, so the previews use the app's own class names and cannot drift from it.

const scssPlugin: Plugin = {
  name: 'scss',
  setup(b) {
    b.onLoad({ filter: /\.scss$/ }, args => {
      const result = sass.compile(args.path, { style: 'expanded', loadPaths: [path.dirname(args.path)], quietDeps: true, silenceDeprecations: ['import', 'global-builtin'] } as sass.Options<'sync'>)
      return { contents: result.css, loader: 'css', resolveDir: path.dirname(args.path) }
    })
  },
}

export async function buildBundle(root: string): Promise<{ js: string; css: string }> {
  const result = await build({
    entryPoints: [path.join(root, 'src/designSystem/entry.tsx')],
    bundle: true, write: false, format: 'iife', globalName: 'Scriblr', platform: 'browser', target: 'es2019', minify: true,
    outdir: path.join(root, '.design-system-out'), jsx: 'automatic', legalComments: 'none', logLevel: 'error',
    define: {
      'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"',
      'import.meta.env.BASE_URL': '"/"', 'import.meta.env': '{}',
    },
    plugins: [scssPlugin],
  })
  const js = result.outputFiles.find(f => f.path.endsWith('.js'))
  const css = result.outputFiles.find(f => f.path.endsWith('.css'))
  if (!js || !css) throw new Error('The bundle produced no script or no stylesheet')
  // A literal closing script tag, or an HTML comment opener, inside a script would end or escape it when the file is inlined.
  const safe = js.text.replace(/<\/script/gi, '\\x3C/script').replace(/<!--/g, '\\x3C!--')
  return { js: safe, css: css.text }
}

export const readText = (file: string) => readFileSync(file, 'utf-8')
