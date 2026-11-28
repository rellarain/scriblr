"""A human form drawn from the human-figure study (docs/research/reports/Human figure for character design.md).

Front and side contours are tables of (y, x) points in head units (y down from the crown, x from the midline / the plumb line), smoothed with
Catmull-Rom curves. The frame follows the measured canon: 7.5 heads; chin 1, nipples 2, navel 3, crotch 4 (the middle), knees 5.5; shoulders 2
heads wide for a man and 1 2/3 for a woman, hips 1.5; upper arm 0.186 H, forearm 0.146 H, hand 0.108 H. Muscle apexes are offset (outside high,
inside low; the malleoli the other way round). Soft tissue changes with sex, fat, muscle and age over the same frame."""
import math

LINE = "#2a2427"
FILL = "#a39b9e"
FORM = "#2a242766"
ACCENT = "#4f15c1"
ALERT = "#007ab8"
H = 7.5
UPPER, FORE, HAND = 0.186 * H, 0.146 * H, 0.108 * H   # 1.395, 1.095, 0.81 heads


def f(v):
    return f"{v:.1f}"


def smooth(points, closed=True, tension=1.0):
    """A Catmull-Rom curve through points, as an SVG path of cubic Béziers."""
    n = len(points)
    if n < 3:
        return ""
    d = [f"M{f(points[0][0])} {f(points[0][1])}"]
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = points[(i - 1) % n] if (closed or i > 0) else points[i]
        p1 = points[i]
        p2 = points[(i + 1) % n]
        p3 = points[(i + 2) % n] if (closed or i + 2 < n) else points[(i + 1) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * tension, p1[1] + (p2[1] - p0[1]) / 6 * tension)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * tension, p2[1] - (p3[1] - p1[1]) / 6 * tension)
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    if closed:
        d.append("Z")
    return "".join(d)


# ---------------- the bodies: frame, soft tissue, age ----------------
# The right half of the front contour, crown to sole on the outside, then the inside of the leg up to the crotch. Each point is (name, y, x).
MAN_FRONT = [
    ("crown", 0.00, 0.000), ("crown2", 0.04, 0.160), ("skull", 0.16, 0.290), ("parietal", 0.36, 0.345), ("ear1", 0.45, 0.360), ("ear2", 0.55, 0.372),
    ("ear3", 0.64, 0.335), ("jaw", 0.79, 0.290), ("jawtuck", 0.89, 0.240), ("neck", 1.12, 0.250), ("trap1", 1.22, 0.300), ("trap2", 1.32, 0.500),
    ("trap3", 1.41, 0.700), ("acromion", 1.47, 0.860), ("underdelt", 1.72, 0.800), ("armpit", 1.98, 0.740), ("lat", 2.15, 0.760), ("ribs", 2.50, 0.700),
    ("waist", 2.82, 0.630), ("flank", 3.12, 0.660), ("pelvis", 3.45, 0.690), ("troch", 3.92, 0.730), ("vlat", 4.30, 0.710), ("thigh", 4.80, 0.620),
    ("aboveknee", 5.25, 0.500), ("kneeout", 5.50, 0.450), ("belowknee", 5.75, 0.440), ("calfout", 6.00, 0.480), ("calf", 6.50, 0.400), ("shin", 6.85, 0.340),
    ("malout", 7.12, 0.345), ("footout", 7.32, 0.380), ("soleout", 7.48, 0.425), ("sole", 7.50, 0.300), ("solein", 7.48, 0.125), ("footin", 7.40, 0.110),
    ("malin", 6.98, 0.135), ("ankin", 6.75, 0.120), ("calfin", 6.20, 0.060), ("belowkneein", 5.80, 0.090), ("kneein", 5.50, 0.075), ("vmed", 5.20, 0.045),
    ("thighin", 4.60, 0.025), ("crotch2", 4.20, 0.010), ("crotch", 4.02, 0.000),
]
# The arm in its own frame: s along the arm from the shoulder pivot (down), w across it (outside positive). Palms forward, so the thumb is outside.
MAN_ARM_OUT = [(-0.22, 0.00), (-0.17, 0.12), (-0.06, 0.21), (0.12, 0.25), (0.40, 0.21), (0.60, 0.17), (0.85, 0.18), (1.15, 0.15), (1.38, 0.135),
               (1.60, 0.175), (1.90, 0.150), (2.20, 0.110), (2.47, 0.090), (2.62, 0.125), (2.86, 0.170), (3.00, 0.140), (2.98, 0.100), (3.28, 0.070), (3.34, 0.020)]
MAN_ARM_IN = [(3.30, -0.045), (3.14, -0.090), (2.86, -0.115), (2.50, -0.085), (2.10, -0.120), (1.75, -0.160), (1.50, -0.140), (1.36, -0.150), (0.80, -0.160),
              (0.40, -0.150), (0.05, -0.150), (-0.12, -0.080)]
# The side contour: the front edge crown to toe, then the back edge heel to crown (x forward from the plumb line through the ear and the ankle).
MAN_SIDE = [
    ("crown", 0.00, -0.05), ("forehead", 0.12, 0.25), ("brow", 0.36, 0.35), ("bridge", 0.43, 0.31), ("nose", 0.58, 0.44), ("undernose", 0.64, 0.35),
    ("lips", 0.72, 0.37), ("lips2", 0.80, 0.33), ("chin", 0.95, 0.33), ("underchin", 1.02, 0.18), ("throat", 1.12, 0.15), ("notch", 1.38, 0.20),
    ("upperchest", 1.62, 0.38), ("breastup", 1.82, 0.47), ("chest", 1.98, 0.50), ("lowchest", 2.14, 0.46), ("fold", 2.30, 0.42), ("ribsf", 2.55, 0.41), ("belly", 3.05, 0.36), ("lowbelly", 3.55, 0.34), ("pubis", 3.95, 0.27),
    ("quad1", 4.30, 0.28), ("quad", 4.65, 0.31), ("abovepat", 5.10, 0.24), ("patella", 5.45, 0.245), ("belowpat", 5.70, 0.18), ("shinf", 6.00, 0.19),
    ("shin2", 6.60, 0.12), ("ankf", 7.05, 0.10), ("foottop", 7.22, 0.25), ("toes", 7.42, 0.62), ("toetip", 7.50, 0.66), ("ball", 7.50, 0.45),
    ("heelsole", 7.50, -0.18), ("heel", 7.40, -0.25), ("achilles", 7.00, -0.15), ("calfb", 6.55, -0.24), ("calfback", 6.00, -0.33), ("kneeback", 5.50, -0.20),
    ("ham", 4.90, -0.30), ("thighback", 4.55, -0.37), ("glutfold", 4.30, -0.43), ("glutelow", 4.15, -0.52), ("buttock", 3.95, -0.56), ("gluteup", 3.65, -0.52),
    ("sacrum", 3.40, -0.45), ("lumbar", 3.00, -0.34),
    ("midback", 2.50, -0.42), ("scapula", 1.85, -0.50), ("upperback", 1.45, -0.44), ("c7", 1.25, -0.33), ("neckback", 1.05, -0.30), ("occ2", 0.80, -0.32),
    ("occiput", 0.55, -0.42), ("skullback", 0.30, -0.38), ("crownback", 0.08, -0.25),
]
MAN_SIDE_ARM_F = [(-0.18, 0.05), (0.00, 0.20), (0.35, 0.17), (0.80, 0.19), (1.38, 0.12), (1.60, 0.17), (2.20, 0.11), (2.47, 0.08), (2.62, 0.10), (3.00, 0.09), (3.28, 0.05)]
MAN_SIDE_ARM_B = [(3.32, -0.01), (3.00, -0.07), (2.62, -0.09), (2.47, -0.08), (1.65, -0.14), (1.40, -0.16), (0.65, -0.21), (0.05, -0.22), (-0.15, -0.12)]


def tweak(table, changes):
    """A copy of a (name, y, x) table with x (and y) changed by name: changes maps a name to dx, or to (dy, dx)."""
    out = []
    for name, y, x in table:
        c = changes.get(name)
        if c is None:
            out.append((name, y, x))
        elif isinstance(c, tuple):
            out.append((name, y + c[0], x + c[1]))
        else:
            out.append((name, y, x + c))
    return out


def scale_arm(points, k_out=1.0, k_in=1.0, upper_only=False):
    return [(s, w * (k_out if w > 0 else k_in) if (not upper_only or s < 1.4) else w) for s, w in points]


def compress(table, k, above=1.2):
    """Height loss with age: everything below the neck moves up (k < 1)."""
    return [(n, y if y <= above else above + (y - above) * k, x) for n, y, x in table]


WOMAN_FRONT = tweak(MAN_FRONT, {
    "neck": -0.035, "jawtuck": -0.02, "jaw": -0.015, "trap1": -0.03, "trap2": (0.02, -0.06), "trap3": (0.02, -0.08), "acromion": (0.02, -0.10),
    "underdelt": -0.10, "armpit": -0.08, "lat": -0.07, "ribs": -0.08, "waist": -0.09, "flank": -0.04, "pelvis": 0.01, "troch": 0.04, "vlat": 0.05,
    "thigh": 0.02, "aboveknee": -0.01, "kneeout": -0.02, "belowknee": -0.03, "calfout": -0.04, "calf": -0.03, "shin": -0.025, "malout": -0.025,
    "footout": -0.03, "soleout": -0.04, "sole": -0.03, "thighin": -0.025, "crotch2": -0.01, "vmed": -0.015, "kneein": -0.015, "calfin": 0.0,
})
WOMAN_ARM_OUT = scale_arm(MAN_ARM_OUT, 0.86)
WOMAN_ARM_IN = scale_arm(MAN_ARM_IN, 1.0, 0.86)
WOMAN_SIDE = tweak(MAN_SIDE, {
    "nose": -0.03, "chin": -0.02, "upperchest": -0.04, "breastup": (0.03, -0.01), "chest": (0.07, 0.09), "lowchest": (0.10, 0.10), "fold": (0.08, 0.0),
    "ribsf": -0.03, "belly": -0.01, "lumbar": 0.04, "sacrum": -0.01, "gluteup": -0.04, "buttock": -0.06, "glutelow": -0.05, "glutfold": -0.03,
    "thighback": -0.02, "scapula": 0.04, "upperback": 0.02, "quad": -0.01, "calfback": 0.03,
})

ATHLETIC_FRONT = tweak(MAN_FRONT, {"neck": 0.03, "trap1": 0.03, "trap2": (-0.02, 0.05), "trap3": 0.03, "lat": 0.08, "ribs": 0.04, "waist": -0.03,
                                   "flank": -0.03, "vlat": 0.03, "thigh": 0.03, "calfout": 0.04, "calfin": -0.02, "vmed": -0.025})
ATHLETIC_ARM_OUT = [(s, w * 1.18 if s < 0.6 else w * 1.12) for s, w in MAN_ARM_OUT]
ATHLETIC_ARM_IN = [(s, w * 1.22 if 0.3 < s < 1.2 else w * 1.1) for s, w in MAN_ARM_IN]
ATHLETIC_SIDE = tweak(MAN_SIDE, {"breastup": 0.04, "chest": 0.06, "lowchest": 0.05, "fold": 0.02, "belly": -0.03, "scapula": -0.04, "buttock": -0.02, "calfback": -0.04, "quad": 0.03})

HEAVY_MAN_FRONT = tweak(MAN_FRONT, {"jaw": 0.03, "jawtuck": 0.05, "neck": 0.05, "trap1": 0.05, "trap2": 0.04, "armpit": 0.04, "lat": 0.06, "ribs": 0.10,
                                    "waist": 0.23, "flank": 0.24, "pelvis": 0.17, "troch": 0.09, "vlat": 0.09, "thigh": 0.10, "aboveknee": 0.05, "kneeout": 0.04,
                                    "calfout": 0.04, "calf": 0.04, "thighin": -0.025, "crotch2": -0.01, "vmed": -0.02, "kneein": -0.01})
HEAVY_MAN_ARM_OUT = scale_arm(MAN_ARM_OUT, 1.25)
HEAVY_MAN_ARM_IN = scale_arm(MAN_ARM_IN, 1.0, 1.35)
HEAVY_MAN_SIDE = tweak(MAN_SIDE, {"underchin": 0.07, "throat": 0.06, "breastup": 0.04, "chest": 0.06, "lowchest": 0.08, "fold": 0.1, "ribsf": 0.13, "belly": 0.30, "lowbelly": 0.20,
                                  "pubis": 0.04, "quad": 0.05, "scapula": -0.04, "midback": -0.06, "lumbar": -0.06, "gluteup": -0.04, "buttock": -0.04, "glutelow": -0.04, "thighback": -0.05, "neckback": -0.04})

HEAVY_WOMAN_FRONT = tweak(WOMAN_FRONT, {"jaw": 0.02, "jawtuck": 0.03, "neck": 0.03, "armpit": 0.05, "lat": 0.10, "ribs": 0.09, "waist": 0.15, "flank": 0.18,
                                        "pelvis": 0.18, "troch": 0.18, "vlat": 0.16, "thigh": 0.14, "aboveknee": 0.12, "kneeout": 0.08, "belowknee": 0.05, "calfout": 0.05,
                                        "calf": 0.05, "thighin": -0.03, "crotch2": -0.01, "vmed": -0.045, "kneein": -0.04, "belowkneein": -0.02, "calfin": -0.015})
HEAVY_WOMAN_ARM_OUT = scale_arm(WOMAN_ARM_OUT, 1.2)
HEAVY_WOMAN_ARM_IN = scale_arm(WOMAN_ARM_IN, 1.0, 1.35)
HEAVY_WOMAN_SIDE = tweak(WOMAN_SIDE, {"upperchest": 0.04, "breastup": (0.03, 0.07), "chest": (0.05, 0.11), "lowchest": (0.08, 0.11), "fold": (0.10, 0.08),
                                      "ribsf": 0.06, "belly": 0.14, "lowbelly": 0.12, "gluteup": -0.08, "buttock": -0.13, "glutelow": -0.13, "glutfold": -0.09,
                                      "thighback": -0.11, "quad": 0.07, "sacrum": -0.05, "underchin": 0.04})

ELDER_K = 7.2 / 7.5
ELDER_FRONT = compress(tweak(WOMAN_FRONT, {"trap2": (0.04, -0.02), "trap3": (0.05, -0.03), "acromion": (0.06, -0.04), "underdelt": -0.03, "lat": 0.0,
                                           "waist": 0.09, "flank": 0.06, "troch": -0.03, "vlat": -0.04, "thigh": -0.04, "calfout": -0.04, "calf": -0.03,
                                           "kneeout": 0.01, "kneein": 0.0}), ELDER_K)
ELDER_ARM_OUT = scale_arm(WOMAN_ARM_OUT, 0.93)
ELDER_ARM_IN = scale_arm(WOMAN_ARM_IN, 1.0, 0.95)
ELDER_SIDE = compress(tweak(WOMAN_SIDE, {"crown": 0.10, "forehead": 0.12, "brow": 0.12, "bridge": 0.12, "nose": 0.12, "undernose": 0.12, "lips": 0.12, "lips2": 0.12,
                                         "chin": 0.11, "underchin": 0.10, "throat": 0.08, "notch": 0.05, "upperchest": 0.03, "breastup": (0.06, -0.03), "chest": (0.12, -0.06), "lowchest": (0.12, -0.05), "fold": (0.10, -0.02),
                                         "belly": 0.08, "lowbelly": 0.06, "scapula": -0.10, "upperback": -0.06, "c7": -0.02, "neckback": 0.04, "occ2": 0.08, "gluteup": 0.04, "glutelow": 0.04,
                                         "occiput": 0.10, "skullback": 0.10, "crownback": 0.10, "buttock": 0.06, "glutfold": 0.03, "lumbar": -0.02}), ELDER_K)

BODIES = {
    "man": dict(label="Average man", front=MAN_FRONT, arm=(MAN_ARM_OUT, MAN_ARM_IN), side=MAN_SIDE, carry=11, pivot=(1.62, 0.79), sex="m", k=1.0,
                note="7½ heads, shoulders 2 heads wide, hips 1½; the measured average, a rectangle shape."),
    "woman": dict(label="Average woman", front=WOMAN_FRONT, arm=(WOMAN_ARM_OUT, WOMAN_ARM_IN), side=WOMAN_SIDE, carry=14, pivot=(1.64, 0.70), sex="f", k=1.0,
                  note="The same frame: shoulders 1⅔ heads, the hips' bone width about the same; the extra at the hips and thighs is soft tissue."),
    "athletic": dict(label="Athletic man", front=ATHLETIC_FRONT, arm=(ATHLETIC_ARM_OUT, ATHLETIC_ARM_IN), side=ATHLETIC_SIDE, carry=11, pivot=(1.62, 0.81), sex="m", k=1.0,
                     note="More muscle, less fat: deltoids, lats, quads and calves stand out; the waist narrows."),
    "heavyman": dict(label="Heavier man", front=HEAVY_MAN_FRONT, arm=(HEAVY_MAN_ARM_OUT, HEAVY_MAN_ARM_IN), side=HEAVY_MAN_SIDE, carry=11, pivot=(1.62, 0.81), sex="m", k=1.0,
                     note="Fat in the male pattern: the waist and belly first, then the chest, neck and upper arms."),
    "heavywoman": dict(label="Heavier woman", front=HEAVY_WOMAN_FRONT, arm=(HEAVY_WOMAN_ARM_OUT, HEAVY_WOMAN_ARM_IN), side=HEAVY_WOMAN_SIDE, carry=14, pivot=(1.64, 0.71), sex="f", k=1.0,
                       note="Fat in the female pattern: hips, thighs and buttocks first, then the waist, bust and upper arms."),
    "elder": dict(label="Older woman", front=ELDER_FRONT, arm=(ELDER_ARM_OUT, ELDER_ARM_IN), side=ELDER_SIDE, carry=14, pivot=(1.66, 0.67), sex="f", k=ELDER_K,
                  note="About 80: 7.2 heads (5–8 cm of height lost), a rounder upper back and the head forward, fat at the waist, less muscle."),
}


# How full the jawline is (fat under the chin and along the jaw) and how far it sags with age.
for _key, _jowl, _sag in (("heavyman", 1.0, 0.0), ("heavywoman", 0.7, 0.0), ("elder", 0.35, 1.0)):
    BODIES[_key]["jowl"], BODIES[_key]["sag"] = _jowl, _sag

FRONT_HEAD_NAMES = ("crown", "crown2", "skull", "parietal", "ear1", "ear2", "ear3", "jaw")
SIDE_HEAD_NAMES = ("crown", "forehead", "brow", "bridge", "nose", "undernose", "lips", "lips2", "chin")
SIDE_HEAD_BACK = ("occiput", "skullback", "crownback")


def split_front(body):
    """The front table as two shapes: the head, closed round the jaw and the chin, and the body from the neck down (its top hidden under the head)."""
    t = body["front"]
    p = {n: (y, x) for n, y, x in t}
    jowl, sag = body.get("jowl", 0.0), body.get("sag", 0.0)
    jy, jx = p["jaw"]
    head = [(y, x) for n, y, x in t if n in FRONT_HEAD_NAMES]
    head[-1] = (jy + 0.02 * sag, jx)
    head += [(0.89 + 0.035 * sag, jx - 0.065 + 0.04 * jowl), (0.965 + 0.02 * sag, 0.06 + (jx - 0.2) * 0.7 + 0.04 * jowl),
             (1.0 + 0.015 * jowl, 0.052 + 0.02 * jowl), (1.012 + 0.03 * jowl, 0.0)]
    body_pts = [(0.74, 0.0), (0.78, 0.2)] + [(y, x) for n, y, x in t if n not in FRONT_HEAD_NAMES and n != "jawtuck"]
    return head, body_pts


def split_side(body):
    """The side table as the head (the face, the chin, the jaw back to the ear and the skull) and the body from the neck down."""
    t = body["side"]
    p = {n: (y, x) for n, y, x in t}
    jowl, sag = body.get("jowl", 0.0), body.get("sag", 0.0)
    dx = p["occiput"][1] + 0.42          # how far the head has come forward (with age)
    head = [(y, x) for n, y, x in t if n in SIDE_HEAD_NAMES]
    head += [(1.0 + 0.03 * jowl + 0.02 * sag, 0.22 + dx + 0.05 * jowl), (0.99 + 0.04 * jowl + 0.03 * sag, 0.07 + dx + 0.04 * jowl),
             (0.86 + 0.03 * sag, -0.03 + dx), (0.68, -0.07 + dx), (0.74, -0.27 + dx)]
    head += [(y, x) for n, y, x in t if n in SIDE_HEAD_BACK]
    body_pts = [(0.86, 0.10 + dx)] + [(y, x) for n, y, x in t if n not in SIDE_HEAD_NAMES and n not in SIDE_HEAD_BACK and n != "underchin" and n != "occ2"]
    body_pts.append((0.78, -0.28 + dx))
    return head, body_pts


def head_path(view, pts, lw, mirror=True):
    if mirror:
        right = [view.pt(y, x) for y, x in pts]
        left = [view.pt(y, -x) for y, x in reversed(pts)][1:-1]
        d = smooth(right + left)
    else:
        d = smooth([view.pt(y, x) for y, x in pts])
    return f'<path d="{d}" fill="{FILL}" stroke="{LINE}" stroke-width="{lw}" stroke-linejoin="round"/>'


# ---------------- drawing ----------------
class View:
    def __init__(self, cx, top, u):
        self.cx, self.top, self.u = cx, top, u

    def pt(self, y, x):
        return (self.cx + x * self.u, self.top + y * self.u)


def arm_points(view, pivot, angle, carry, out_pts, in_pts, side=1, k=1.0):
    """The arm's outline in the view: the upper arm along `angle` (degrees out from straight down), the forearm `carry` degrees further out."""
    py, px = pivot
    a = math.radians(angle)
    ac = math.radians(angle + carry)
    elbow_s = 1.38 * k
    ex, ey = px + math.sin(a) * elbow_s, py + math.cos(a) * elbow_s

    def place(s, w):
        s *= k
        if s <= elbow_s:
            x = px + math.sin(a) * s + math.cos(a) * w
            y = py + math.cos(a) * s - math.sin(a) * w
        else:
            t = s - elbow_s
            x = ex + math.sin(ac) * t + math.cos(ac) * w
            y = ey + math.cos(ac) * t - math.sin(ac) * w
        return view.pt(y, side * x)

    pts = [place(s, w) for s, w in out_pts] + [place(s, w) for s, w in in_pts]
    joints = {"shoulder": view.pt(py, side * px), "elbow": place(1.38, 0), "wrist": place(2.47, 0)}
    return pts, joints, place


def union(paths, lw=2.2, fill=FILL):
    a = "".join(f'<path d="{d}" fill="{LINE}" stroke="{LINE}" stroke-width="{2 * lw}" stroke-linejoin="round"/>' for d in paths)
    b = "".join(f'<path d="{d}" fill="{fill}"/>' for d in paths)
    return a + b


def front_figure(body, view, lw=2.2):
    head, t = split_front(body)
    right = [view.pt(y, x) for y, x in t]
    left = [view.pt(y, -x) for y, x in reversed(t)][1:-1]
    torso = smooth(right + left)
    out_pts, in_pts = body["arm"]
    angle = 9
    ar, jr, _ = arm_points(view, body["pivot"], angle, body["carry"], out_pts, in_pts, 1, body["k"])
    al, jl, _ = arm_points(view, body["pivot"], angle, body["carry"], out_pts, in_pts, -1, body["k"])
    # the head last, with its own outline, so the jaw and the chin show over the neck
    return union([torso, smooth(ar), smooth(al)], lw) + head_path(view, head, lw), jr


def side_shapes(body, view):
    """The side view's shapes in drawing order: the body with the legs, the head, the near arm (and the head's points, for the jaw)."""
    head, t = split_side(body)
    pts = [view.pt(y, x) for y, x in t]
    body_path = smooth(pts)
    py = 1.62 if body["k"] == 1.0 else 1.66
    px = -0.05 + (0.04 if body["k"] != 1.0 else 0)
    k = body["k"]
    arm_f = MAN_SIDE_ARM_F if body["sex"] == "m" else [(s, w * 0.88) for s, w in MAN_SIDE_ARM_F]
    arm_b = MAN_SIDE_ARM_B if body["sex"] == "m" else [(s, w * 0.88) for s, w in MAN_SIDE_ARM_B]
    if body is BODIES["heavyman"] or body is BODIES["heavywoman"]:
        arm_f = [(s, w * 1.25) for s, w in arm_f]
        arm_b = [(s, w * 1.3) for s, w in arm_b]
    if body is BODIES["athletic"]:
        arm_f = [(s, w * 1.15) for s, w in arm_f]
        arm_b = [(s, w * 1.15) for s, w in arm_b]
    # the arm hangs a little forward of straight down; in the side view the forearm comes slightly forward
    ap = []
    for s, w in arm_f + arm_b:
        s2 = s * k
        lean = 0.02 * s2 + (0.04 * (s2 - 1.38) if s2 > 1.38 else 0)
        ap.append(view.pt(py + s2, px + w + lean))
    return [("body", body_path), ("head", smooth([view.pt(y, x) for y, x in head])), ("arm", smooth(ap))], head


def side_figure(body, view, lw=2.2):
    shapes, head = side_shapes(body, view)
    fig = union([d for kind, d in shapes if kind != "arm"], lw)
    arm = shapes[-1][1]
    fig += f'<path d="{arm}" fill="{FILL}" stroke="{LINE}" stroke-width="{lw}" stroke-linejoin="round"/>'
    # the jaw over the neck: from under the chin, along the jawline, round the jaw's angle and up to the ear (the back of the skull joins the neck)
    jaw = head[len(SIDE_HEAD_NAMES) - 1:len(SIDE_HEAD_NAMES) + 4]
    fig += f'<path d="{smooth([view.pt(y, x) for y, x in jaw], closed=False)}" fill="none" stroke="{LINE}" stroke-width="{lw}" stroke-linecap="round"/>'
    return fig


def by_name(table):
    return {n: (y, x) for n, y, x in table}


def front_forms(body, view):
    """Interior form lines: clavicles, the chest, the navel, the knees, the face and the neck."""
    p = by_name(body["front"])
    k = body["k"]
    out = []
    S = f'fill="none" stroke="{FORM}" stroke-width="1.3" stroke-linecap="round"'

    def line(pts):
        return f'<path d="{smooth([view.pt(y, x) for y, x in pts], closed=False)}" {S}/>'
    ny = p["neck"][0]
    for s in (1, -1):
        ac = p["acromion"]
        out.append(line([(0.98, s * 0.19), (1.14, s * 0.12), (1.36, s * 0.04)]))  # sternocleidomastoid, from under the jaw
        # the ribcage's lower edge, the hip line from the hip bone to the pubis
        # the kneecap, the inner and outer ankle bones
    nav = 1.2 + 1.8 * k
    out.append(f'<ellipse cx="{f(view.pt(nav, 0)[0])}" cy="{f(view.pt(nav, 0)[1])}" rx="{f(view.u * 0.018)}" ry="{f(view.u * 0.035)}" fill="{FORM}"/>')
    if body is BODIES["athletic"]:
        for yy in (2.45, 2.75, 3.05):
            out.append(line([(yy, -0.22), (yy + 0.02, 0.0), (yy, 0.22)]))
        out.append(line([(2.3, 0.0), (3.35, 0.0)]))
    if body is BODIES["heavyman"]:
        out.append(line([(3.25, -0.45), (3.55, 0.0), (3.25, 0.45)]))
    return "".join(out)


def side_forms(body, view):
    p = by_name(body["side"])
    S = f'fill="none" stroke="{FORM}" stroke-width="1.3" stroke-linecap="round"'

    def line(pts):
        return f'<path d="{smooth([view.pt(y, x) for y, x in pts], closed=False)}" {S}/>'
    out = []
    dx = p["occiput"][1] + 0.42
    sc = p["scapula"]
    out.append(line([(sc[0] - 0.3, sc[1] + 0.06), (sc[0] + 0.1, sc[1] + 0.1), (sc[0] + 0.35, sc[1] + 0.16)]))   # the shoulder blade's edge
    kb = p["kneeback"]
    out.append(line([(kb[0], kb[1] + 0.03), (kb[0] + 0.03, kb[1] + 0.16)]))
    pa = p["patella"]
    out.append(f'<ellipse cx="{f(view.pt(pa[0], pa[1] - 0.06)[0])}" cy="{f(view.pt(pa[0], pa[1] - 0.06)[1])}" rx="{f(view.u * 0.05)}" ry="{f(view.u * 0.08)}" {S}/>')
    an = p["ankf"]
    out.append(f'<circle cx="{f(view.pt(an[0] + 0.07, -0.04)[0])}" cy="{f(view.pt(an[0] + 0.07, -0.04)[1])}" r="{f(view.u * 0.035)}" {S}/>')
    return "".join(out)


def guide_layer(view, k=1.0, x0=None, x1=None, left=True):
    names = {0: "Crown", 1: "Chin", 2: "Nipples", 3: "Navel", 4: "Crotch · the middle", 5.5: "Knees", 7.5: "Soles"}
    out = []
    for hk, name in names.items():
        y = view.top + (hk if hk <= 1.2 else 1.2 + (hk - 1.2) * k) * view.u
        out.append(f'<line x1="{f(x0)}" y1="{f(y)}" x2="{f(x1)}" y2="{f(y)}" stroke="{ACCENT}" stroke-opacity=".55" stroke-dasharray="5 4"/>')
        if left:
            out.append(f'<text x="{f(x0 - 6)}" y="{f(y + 3.5)}" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="{ACCENT}" text-anchor="end">{name}</text>')
    total = 1.2 + (H - 1.2) * k
    for i in range(8):
        hh = min(1, total - i)
        if hh <= 0:
            break
        out.append(f'<rect x="{f(x1 + 6)}" y="{f(view.top + i * view.u)}" width="6" height="{f(hh * view.u)}" fill="{ACCENT}" fill-opacity="{0.5 if i % 2 == 0 else 0.2}"/>')
    return "".join(out)


def dot(view, y, x, label, anchor="start", color=ALERT):
    px, py = view.pt(y, x)
    lx = px + (10 if anchor == "start" else -10)
    return (f'<circle cx="{f(px)}" cy="{f(py)}" r="3.6" fill="{color}" stroke="#fff" stroke-width="1.2"/>'
            f'<text x="{f(lx)}" y="{f(py + 3.5)}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="{color}" text-anchor="{anchor}">{label}</text>')


def front_landmarks(body, view):
    p = by_name(body["front"])
    k = body["k"]
    Y = lambda y: y if y <= 1.2 else 1.2 + (y - 1.2) * k  # noqa: E731
    ac = p["acromion"]
    out = [dot(view, 1.40, 0, "sternal notch", "start"), dot(view, ac[0], ac[1] - 0.04, "acromion", "start"), dot(view, Y(1.37), -0.3, "clavicle", "end"),
           dot(view, Y(2.80), -(p["waist"][1] - 0.08), "10th rib", "end"), dot(view, Y(3.12), p["flank"][1] - 0.1, "iliac crest", "start"),
           dot(view, Y(3.40), -(p["pelvis"][1] - 0.18), "hip bone (ASIS)", "end"), dot(view, p["troch"][0], p["troch"][1] - 0.04, "greater trochanter" + (" (under a fat pad)" if body["sex"] == "f" else ""), "start"),
           dot(view, p["kneeout"][0] - 0.02, -0.255, "kneecap", "end"), dot(view, p["malin"][0], p["malin"][1] + 0.02, "inner ankle: higher", "start"),
           dot(view, p["malout"][0], -(p["malout"][1] - 0.02), "outer ankle: lower", "end")]
    return "".join(out)


def side_landmarks(body, view):
    p = by_name(body["side"])
    return "".join([dot(view, p["c7"][0], p["c7"][1] + 0.03, "C7", "end"), dot(view, p["scapula"][0], p["scapula"][1] + 0.05, "shoulder blade", "end"),
                    dot(view, p["sacrum"][0] - 0.25, p["sacrum"][1] + 0.08, "iliac crest", "end"), dot(view, p["buttock"][0] - 0.05, -0.05, "greater trochanter", "start"),
                    dot(view, p["patella"][0], p["patella"][1] - 0.02, "kneecap", "start"), dot(view, p["ankf"][0] + 0.07, -0.04, "ankle bone", "start"),
                    dot(view, p["heel"][0], p["heel"][1] + 0.03, "heel", "end")])


def ring(view, xy, label=None, anchor="start"):
    x, y = xy
    s = f'<circle cx="{f(x)}" cy="{f(y)}" r="6" fill="none" stroke="{ACCENT}" stroke-width="2.2"/><circle cx="{f(x)}" cy="{f(y)}" r="1.8" fill="{ACCENT}"/>'
    if label:
        s += f'<text x="{f(x + (10 if anchor == "start" else -10))}" y="{f(y + 3.5)}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="{ACCENT}" text-anchor="{anchor}">{label}</text>'
    return s


def front_pivots(body, view, jr):
    p = by_name(body["front"])
    k = body["k"]
    hip_x = p["troch"][1] - 0.36       # medial to the trochanter by about a quarter of the hips' width
    out = [ring(view, jr["shoulder"], "pivots sit inside the body: the shoulder inside the deltoid, the hip below the hip bone and inside the trochanter"), ring(view, jr["elbow"], "elbow"), ring(view, jr["wrist"], "wrist"),
           ring(view, view.pt(p["troch"][0] - 0.02, hip_x), "hip"),
           ring(view, view.pt(p["kneeout"][0], 0.26), "knee"), ring(view, view.pt(p["malout"][0] - 0.03, 0.24), "ankle"),
           ring(view, view.pt(1.12, 0), None)]
    sy = view.pt(1.2 + 0.6 * k, 0)
    out.append(f'<line x1="{f(view.cx)}" y1="{f(view.pt(1.12, 0)[1])}" x2="{f(view.cx)}" y2="{f(view.pt(1.2 + 2.7 * k, 0)[1])}" stroke="{ACCENT}" stroke-width="1.5" stroke-dasharray="2 3"/>')
    return "".join(out)


def side_pivots(body, view):
    p = by_name(body["side"])
    out = [ring(view, view.pt(1.62 if body["k"] == 1 else 1.66, -0.05), None), ring(view, view.pt(p["buttock"][0] + 0.08, -0.05), None),
           ring(view, view.pt(p["patella"][0] + 0.03, 0.0), None), ring(view, view.pt(p["ankf"][0] + 0.08, -0.03), None)]
    # the plumb line: ear, shoulder, hip, knee and ankle near one vertical
    x = view.pt(0, -0.04)[0]
    out.append(f'<line x1="{f(x)}" y1="{f(view.top + 0.3 * view.u)}" x2="{f(x)}" y2="{f(view.top + 7.5 * view.u)}" stroke="{ALERT}" stroke-width="1.2" stroke-dasharray="6 4"/>')
    out.append(f'<text x="{f(x + 6)}" y="{f(view.top + 7.62 * view.u)}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="{ALERT}">plumb line: ear, shoulder, hip, knee, ankle</text>')
    return "".join(out)


def apex_marks(body, view):
    """Outside high, inside low: the muscle apexes on each side of a limb, joined to show the slant; the ankle bones the other way round."""
    p = by_name(body["front"])
    out = []

    def pair(a, b, label, rev=False):
        (ya, xa), (yb, xb) = a, b
        pa, pb = view.pt(ya, xa), view.pt(yb, xb)
        c = ALERT if rev else ACCENT
        s = f'<line x1="{f(pa[0])}" y1="{f(pa[1])}" x2="{f(pb[0])}" y2="{f(pb[1])}" stroke="{c}" stroke-width="1.6" stroke-dasharray="4 3"/>'
        for q in (pa, pb):
            s += f'<path d="M{f(q[0] - 4)} {f(q[1])} L{f(q[0] + 4)} {f(q[1])}" stroke="{c}" stroke-width="3" stroke-linecap="round"/>'
        s += f'<text x="{f(max(pa[0], pb[0]) + 10)}" y="{f((pa[1] + pb[1]) / 2 + 3)}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="{c}">{label}</text>'
        return s
    out.append(pair((p["vlat"][0], -p["vlat"][1]), (p["vmed"][0], -p["vmed"][1]), "", False))
    out.append(pair((p["calfout"][0], -p["calfout"][1]), (p["calfin"][0], -p["calfin"][1]), "", False))
    out.append(pair((p["malin"][0], -p["malin"][1]), (p["malout"][0], -p["malout"][1]), "", True))
    for yy, txt, col, xx in [(p["vlat"][0] + 0.75, "thigh: outside high, inside low", ACCENT, p["thigh"][1]), (p["calfout"][0] + 0.15, "calf: outside high, inside low", ACCENT, p["calf"][1]),
                             (p["malin"][0] + 0.05, "ankle bones: inside high, outside low", ALERT, p["malout"][1])]:
        lx = view.pt(0, -(xx + 0.08))[0]
        out.append(f'<text x="{f(lx)}" y="{f(view.pt(yy, 0)[1])}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="{col}" text-anchor="end">{txt}</text>')
    return "".join(out)


def arm_apex_marks(body, view):
    out_pts, in_pts = body["arm"]
    _, _, place = arm_points(view, body["pivot"], 9, body["carry"], out_pts, in_pts, 1, body["k"])
    out = []
    for (so, wo), (si, wi), label in [((0.12, 0.25), (0.80, -0.16), "upper arm: deltoid high outside, biceps low inside"),
                                      ((1.60, 0.175), (1.75, -0.16), "forearm: outside high, inside low")]:
        wo2 = [w for s, w in out_pts if abs(s - so) < 1e-6]
        wi2 = [w for s, w in in_pts if abs(s - si) < 1e-6]
        a = place(so, wo2[0] if wo2 else wo)
        b = place(si, wi2[0] if wi2 else wi)
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{ACCENT}" stroke-width="1.6" stroke-dasharray="4 3"/>')
        for q in (a, b):
            out.append(f'<path d="M{f(q[0] - 4)} {f(q[1])} L{f(q[0] + 4)} {f(q[1])}" stroke="{ACCENT}" stroke-width="3" stroke-linecap="round"/>')
        out.append(f'<text x="{f(max(a[0], b[0]) + 12)}" y="{f(a[1] + 3)}" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700" fill="{ACCENT}">{label}</text>')
    return "".join(out)
