# Body templates (WUI slice 9a)

The six bodies a new model can start from in the Designer (New model > A body), made from the approved character designer mockup.

- `figure/human.py`, `figure/parts.py`: the mockup's figure, part by part (the same code that drew the mockup's human form board).
- `figure/export.py`: each body's parts from the front as dense outlines in the model's units (56 a head, the crown at y = 10, the middle at x = 100), with the
  mockup's dark lines, the joints and the guide's levels. Prints JSON.
- `build.ts`: fits each outline as a few curve points, gives each edge its outline or not (the silhouette and the dark lines keep one; the joins inside the body do not,
  and an edge partly against a join is cut where the join begins), puts the parts in the rig's groups with their pivots, makes the right side as twins of the left, and
  writes `backend/app/seed/body_templates.json` with each body's proportion guide and a small picture.
- `preview.ts`: a page of the built bodies (front and back) and close-ups, drawn by the app's own engine.

```
npx vite-node scripts/body-templates/build.ts            # from frontend/; needs python on the path (or PYTHON=...)
npx vite-node scripts/body-templates/preview.ts <templates.json> <out.html>
```
