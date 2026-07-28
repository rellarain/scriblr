# Legacy concept archive

This folder holds the original design sketches and scaffold from Scriblr's first
concept: a multi-user SaaS product with accounts/subscriptions, multiple reader
roles (Alpha/Beta/Psi/Omega), an admin/training/feedback pipeline, and a rich
Plotter/Pantser/Puzzler outlining methodology (book → arc → subarc → chapter →
act → scene → moment, with a parallel plotline/plotpoint content model).

Scriblr's actual v1 is a single-user offline desktop app (see the root
`README.md` and `docs/data-model.md`). None of the code here is wired into the
active app — the page/component files were empty shells with no working logic
when archived. They're kept for reference because the richer structural and
revision-flag model sketched in `site.txt` / `original-readme.md` / `json.tsx`
is a plausible v2 extension of the current simplified outline schema.

Contents:
- `pages/`, `components/` — original React page/component shells (Visitor, User,
  Plan, Admin, Writer, Reader UIs; wUI/uUI component folders)
- `site.txt` — full sitemap sketch for the original SaaS product
- `original-readme.md` — original DB-structure notes
- `json.tsx` — early, unfinished sketch of a JSON storage shape
- `account1.json`, `accountRain.json` — SaaS account fixture sketches
- `siteOutline.jpg` — visual sitemap sketch
