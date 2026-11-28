"""The six bodies of the character designer mockup (WUI slice 9, the approved Character designer page), front view, as dense outlines in the
model's units: 56 units to a head, the crown at y = 10, the middle at x = 100 (the picture's right, x > 100, is the character's left).

Prints JSON on stdout: {bodies: [{id, name, note, heads, levels, joints, parts: [...], side: [...]}]}, each part with its kind, side, layer, whether it is
inside the body's one outline, its outline width in the mockup, its fill, which views see it, and its points. build.ts fits these as curves.
Run with: python export.py (from this folder, or with this folder on the path)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import parts as P  # noqa: E402
from human import BODIES, FILL, View  # noqa: E402

U, TOP, CX = 56.0, 10.0, 100.0
# the mockup's paths are rounded text: take the points themselves
P.poly = lambda pts: [[round(x, 3), round(y, 3)] for x, y in pts]
P.open_poly = P.poly


class FlatView:
    """The mockup's view through a pose, with no pose: the even stance."""

    def __init__(self, view, flip=False):
        self.v, self.pose, self.flip = view, None, flip
        self.cx, self.top, self.u = view.cx, view.top, view.u

    def pt(self, y, x, part=None):
        return self.v.pt(y, -x if self.flip else x)


FILLS = {FILL: "skin", P.LIP: "lip", P.EYE_WHITE: "sclera", P.IRIS: "iris", P.CONCHA: "concha", "#2a2427": "dark", "#958c8f": "lip"}


def part_of(m, back=False):
    p = m.p
    pts = m.d
    if back:   # a part only the back sees, brought back into the front's frame (the app mirrors the whole figure for the back)
        pts = [[round(2 * CX - x, 3), y] for x, y in reversed(pts)]
    flip = (lambda q: [[round(2 * CX - x, 3), y] for x, y in q]) if back else (lambda q: q)
    # the dark lines the mockup draws along a part (its edges and lashes; the light form lines are left out)
    lines = [flip(d) for d, st in m.strokes if st in ("edge", "lash")]
    return dict(kind=p.kind, side=p.side, layer=p.layer, union=bool(p.in_union), outline=p.outline, fill=FILLS.get(p.fill, "skin"),
                rule=p.rule, view="back" if p.back_only else "front" if p.front_only else "both", pts=pts, lines=lines)


def export(key, body):
    front, _ = P.front_model(body, FlatView(View(CX, TOP, U)))
    back, _ = P.front_model(body, FlatView(View(CX, TOP, U), flip=True))
    L = P.levels(body)
    y = lambda v: round(TOP + v * U, 3)  # noqa: E731
    # where the arm's joints are: the shoulder, the elbow and the wrist along the arm's line, on the character's left (x > 100)
    py, px = body["pivot"]
    at = P.arm_frame(body)
    k = body["k"]

    def arm(s_):
        drop, out = at(s_)
        return [round(CX + (px + out) * U, 3), y(py + drop)]
    wrist_s = next((m.p.pts[0][0] for m in front if m.p.kind == "palm"), 2.47 * k)
    fp = P.by_name(body["front"])
    # the arm's joints on its line; the legs' across are found from the outlines (build.ts), at these heights
    joints = dict(shoulder=arm(0.0), elbow=arm(1.38), wrist=arm(min(wrist_s, 2.6)), neck=[CX, y(L["neck_base"])], head=[CX, y(0.86)],
                  waist=[CX, y(L["waist"])], hip=y(fp["troch"][0] - 0.12), knee=y(L["knee"]))
    levels = dict(chin=y(1.0), chest=y(L["apex"]), waist=y(L["waist"]), crotch=y(L["crotch"]), knees=y(L["knee"]), soles=y(L["sole"]))
    out = [part_of(m) for m in front]
    out += [part_of(m, back=True) for m in back if m.p.back_only]
    # the side view's parts (slice 9e): the right profile, facing the picture's right, the near side's parts (build.ts makes each front part's outline at the sides
    # from the side part of its kind)
    side_parts, _, _ = P.side_model(body, View(CX, TOP, U))
    side = [dict(kind=m.p.kind, layer=m.p.layer, pts=m.d) for m in side_parts]
    return dict(id=key, name=body["label"], note=body["note"], heads=round(L["sole"], 3), levels=levels, joints=joints, parts=out, side=side)


if __name__ == "__main__":
    json.dump(dict(unit=U, top=TOP, bodies=[export(k, b) for k, b in BODIES.items()]), sys.stdout)
