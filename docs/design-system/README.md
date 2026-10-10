# Scriblr design system

The design system of the Writer, kept with the code. `project/` is what the Design System artifact holds; the pages in it are written by hand, and the rest is generated from the app's own code, so it cannot drift from it.

| What | Where |
|---|---|
| The brand book and foundations (colour zones, level colours, type, spacing, iconography, interaction, content voice, known drift, how to extend) | `project/README.md` and the `project/*.md` pages |
| A guideline page and a live preview per component | `project/components/<Name>/` |
| Tokens (every colour in all four zones, type, spacing, radius, shadow) | `project/tokens.json` (generated) |
| Contrast: every text on its ground, in every zone, for every hue | `project/contrast.md` (generated from `frontend/src/theme/contrastAudit.ts`) |
| Icons | `project/assets/Icons/*.svg` (generated from `frontend/src/assets/icons/index.tsx`) |
| The previews' bundle | `project/components/bundle.js` and `bundle.css` (generated, **git-ignored**) |

## Regenerate

```bash
cd scriblr/frontend
npm run design-system            # tokens, contrast, icons, previews and the bundle
npm run design-system -- --no-bundle   # everything but the (slow, ignored) bundle
npx vitest run                   # the freshness test fails when a generated file is stale
```

To look at a preview locally, serve this folder (`python -m http.server 5190 --directory scriblr/docs/design-system`, or `preview_start design-system` in Claude Code) and open `dev.html?card=level-panels`. Cards: `frontend/src/designSystem/cardMeta.ts`.

## Publish

The system is published as a Design System artifact (private). To republish after a change: run `npm run design-system`, then publish the files you changed under `project/` to the artifact with the Artifact tool (`root` = this folder), the index (`project/design-system.json`) last and only when its own keys change. The index and the icons' upload records live in the artifact, not here. Claude Code does this when asked ("republish the design system").

## Keep it true

Change the code, then the page that describes it, then regenerate. A new text-on-ground pair goes in `contrastAudit.ts`; a new fixed colour in `frontend/scripts/design-system/colors.ts`. See `project/how-to-extend.md`.
