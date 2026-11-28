"""The figure as parts, the way the designer builds one.

- A core (the base mass) for the head, the chest, the pelvis and each upper arm, with masses on it: on the head (the round cranium) the
  upper jaw, the mandible and the chin, with the teeth and tongue inside the mouth; on the chest the clavicle and traps, two ribcage halves,
  two breasts or pectorals, the upper abdomen; on the pelvis the lower abdomen, two hips and two buttocks; on the arm the shoulder, biceps
  and triceps.
- Then the neck and head (ears, brows, eyes, nose, lips), forearms, palms, thumbs and fingers (three shapes each), thighs, shins and the
  foot's ankle, heel, plantar and toes.
- Each part follows the outline between two cuts and ends in a cap on its joint that tucks under the next part; the masses' outer edges
  follow the outline. Drawn together inside one outline, the parts give the silhouette, and a bend opens no gap.
- Every view cuts at the same heights (levels()). A mass that faces one way is drawn in the views that see it.
- Parts in front draw their own edge where they overlap; masses draw a light edge.
- Thighs that would overlap flatten against each other where they meet, with a line along the contact.
"""
import math
from human import (BODIES, FILL, LINE, FORM, MAN_SIDE_ARM_F, MAN_SIDE_ARM_B, FRONT_HEAD_NAMES, SIDE_HEAD_NAMES, SIDE_HEAD_BACK,
                   split_front, split_side, smooth, union, f, by_name)

N_DENSE = 4
EYE_WHITE = "#dcd6d9"
LIP = "#958c8f"
IRIS = "#6b6266"
CONCHA = "#8e8689"
HALO_GROUND = "#e6d1db"


# ---------------- curves, cuts and caps ----------------
def _bez(p0, p1, p2, p3, t):
    """A point on the Catmull-Rom curve that smooth() draws between p1 and p2."""
    c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
    c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
    m = 1 - t
    return tuple(m ** 3 * a + 3 * m * m * t * b + 3 * m * t * t * c + t ** 3 * d for a, b, c, d in zip(p1, c1, c2, p2))


def dense(points, n=N_DENSE, closed=True):
    """The curve through points, sampled n times per span; idx[i] is where points[i] falls."""
    N = len(points)
    out, idx = [], []
    for i in range(N if closed else N - 1):
        idx.append(len(out))
        p0 = points[i - 1] if (closed or i > 0) else points[i]
        p3 = points[(i + 2) % N] if (closed or i + 2 < N) else points[i + 1]
        out.extend(_bez(p0, points[i], points[(i + 1) % N], p3, j / n) for j in range(n))
    if not closed:
        idx.append(len(out))
        out.append(points[-1])
    return out, idx


def curve(points, n=N_DENSE):
    """An open smooth curve through points, as dense samples."""
    return dense(points, n, closed=False)[0]


def cut(D, i0, i1, v, axis=0):
    """The first place, going forward from sample i0 to i1, where a coordinate (0 the height, 1 across) crosses v: (sample before, point)."""
    N = len(D)
    k = i0
    while k != i1:
        a, b = D[k], D[(k + 1) % N]
        if (a[axis] - v) * (b[axis] - v) <= 0 and a[axis] != b[axis]:
            t = (v - a[axis]) / (b[axis] - a[axis])
            return k, (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        k = (k + 1) % N
    raise ValueError(f"no crossing at {v}")


def sub(D, ca, cb):
    """The outline from cut ca forward to cut cb."""
    N = len(D)
    out = [ca[1]]
    k, stop = (ca[0] + 1) % N, (cb[0] + 1) % N
    while k != stop:
        out.append(D[k])
        k = (k + 1) % N
    out.append(cb[1])
    return out


def cap(a, b, toward, depth=None, n=8):
    """Half an ellipse from a to b, bulging towards `toward`. Without a depth it is a half circle on the joint, so the neighbour can turn
    about the joint and the outline stays closed."""
    my, mx = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    uy, ux = (b[0] - a[0]) / 2, (b[1] - a[1]) / 2
    half = math.hypot(uy, ux)
    d = half if depth is None else min(depth, half)
    ny, nx = -ux / half * d, uy / half * d
    if ny * (toward[0] - my) + nx * (toward[1] - mx) < 0:
        ny, nx = -ny, -nx
    return [(my - uy * math.cos(math.pi * i / n) + ny * math.sin(math.pi * i / n), mx - ux * math.cos(math.pi * i / n) + nx * math.sin(math.pi * i / n))
            for i in range(1, n)]


def vcap(a, b, y_to, n=8):
    """Half an ellipse from a to b that bulges straight up or down and reaches exactly the height y_to: the same height in every view."""
    my, mx = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    uy, ux = (b[0] - a[0]) / 2, (b[1] - a[1]) / 2
    dist = abs(y_to - my)
    h = math.sqrt(max(dist * dist - uy * uy, 1e-6)) * (1 if y_to > my else -1)
    return [(my - uy * math.cos(math.pi * i / n) + h * math.sin(math.pi * i / n), mx - ux * math.cos(math.pi * i / n)) for i in range(1, n)]


def capsule(b, t, rb, rt, kn=0.05, swell=0.06):
    """A finger, thumb or toe, round at both ends, from base b to tip t. Returns (closed outline, the edge that shows): the edge runs from
    the knuckle (kn from the base) along one side, round the tip and back along the other."""
    L = math.dist(b, t)
    uy, ux = (t[0] - b[0]) / L, (t[1] - b[1]) / L
    ny, nx = -ux, uy

    def r(a):
        return lerp(rb, rt, a / L) * (1 + swell * math.sin(math.pi * a / L))
    side1 = [(b[0] + uy * a + ny * r(a), b[1] + ux * a + nx * r(a)) for a in (lerp(kn, L, i / 6) for i in range(7))]
    tip = [(t[0] + ny * rt * math.cos(th) + uy * rt * math.sin(th), t[1] + nx * rt * math.cos(th) + ux * rt * math.sin(th))
           for th in (math.pi * i / 8 for i in range(1, 8))]
    side2 = [(b[0] + uy * a - ny * r(a), b[1] + ux * a - nx * r(a)) for a in (lerp(L, kn, i / 6) for i in range(7))]
    base = [(b[0] - ny * rb * math.cos(th) - uy * rb * math.sin(th), b[1] - nx * rb * math.cos(th) - ux * rb * math.sin(th))
            for th in (math.pi * i / 8 for i in range(1, 8))]
    shows = side1 + tip + side2
    return shows + base, shows


def mir(pts):
    return [(y, -x) for y, x in pts]


def rev(pts):
    return list(reversed(pts))


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def smax(d, eps):
    """A soft max(d, 0): soft tissue flattening against a neighbour, with no corner where it starts."""
    return (d + math.sqrt(d * d + eps * eps)) / 2


def key_of(body):
    return next(k for k, b in BODIES.items() if b is body)


# ---------------- one set of heights for every view ----------------
_ANKLE = {}


def ankle_joint(body):
    """The ankle as a circle, from the side: its centre at the joint's height, halfway between the front and the back of the outline there;
    its radius half the ankle's depth. (height, across, radius)"""
    if id(body) not in _ANKLE:
        k = body["k"]
        yc = 1.2 + (7.04 - 1.2) * k
        _, pts = split_side(body)
        names = ["n0"] + [n for n, y, x in body["side"] if n not in SIDE_HEAD_NAMES and n not in SIDE_HEAD_BACK and n not in ("underchin", "occ2")] + ["nlast"]
        D, idx = dense(pts)
        ix = {n: idx[i] for i, n in enumerate(names)}
        fr, bk = cut(D, ix["shin2"], ix["foottop"], yc)[1][1], cut(D, ix["heel"], ix["calfb"], yc)[1][1]
        _ANKLE[id(body)] = (yc, (fr + bk) / 2, (fr - bk) / 2)
    return _ANKLE[id(body)]


def levels(body):
    """The heights where parts meet and where their caps reach, shared by the front, side and back views."""
    fp, sp = by_name(body["front"]), by_name(body["side"])
    k = body["k"]
    Y = (lambda y: y if y <= 1.2 else 1.2 + (y - 1.2) * k)
    fem = body["sex"] == "f"
    waist = fp["waist"][0]
    aj = ankle_joint(body)
    return dict(
        neck_top=0.86, neck_cap=0.76, chest_top=1.18, chest_cap=1.10, neck_base=Y(1.28), neck_base_cap=Y(1.44),
        waist=waist, waist_down=waist + 0.30 * k, waist_up=waist - 0.30 * k,
        crotch=fp["crotch"][0], glute=sp["glutfold"][0], thigh_cap=fp["troch"][0] - 0.17 * k,
        knee=fp["kneeout"][0], knee_r=0.19, ankle_top=aj[0], ankle_r=aj[2], ankle_bottom=aj[0] + aj[2], heel_top=Y(7.12),
        instep=Y(7.15), toe=Y(7.38), toe_r=0.012, sole=fp["sole"][0],
        rib_top=Y(1.58), rib_bottom=Y(2.80), ab_top=Y(2.28), ab_bottom=Y(3.17), hip_top=Y(3.0), hip_bottom=fp["troch"][0] + 0.02,
        buttock_top=Y(3.45), traps_bottom=Y(2.62), lowab_top=Y(3.11), lowab_bottom=Y(3.90),
        scap_top=Y(1.52), scap_bottom=Y(2.27),
        breast_top=Y(1.55 if fem else 1.45), breast_bottom=sp["fold"][0] if fem else sp["lowchest"][0] + 0.08 * k, apex=sp["chest"][0],
        brow=(0.40, 0.44), eye=0.495, ear=(0.42, 0.70), nose_top=sp["bridge"][0], nose_bottom=sp["undernose"][0] + 0.005,
        mouth=(sp["lips"][0] + sp["lips2"][0]) / 2, lip_top=sp["undernose"][0] + 0.06 - (0.008 if fem else 0.0),
        lip_bottom=sp["lips2"][0] + 0.022 + (0.01 if fem else 0.0),
    )


# ---------------- a part ----------------
class Part:
    """One shape: its outline in head units (or the arm's own frame), how it maps into a view, and how it draws.
    in_union: inside the one outline. layer: drawn again on top, with its own fill, outline, edges and dots."""

    def __init__(self, kind, pts, side=0, rule="torso", in_union=True, layer=None, fill=FILL, opacity=None, outline=None, strokes=(), dots=(),
                 front_only=False, back_only=False, stroke_front_only=False, lat=0.0, span=None):
        self.kind, self.pts, self.side, self.rule, self.in_union, self.layer = kind, pts, side, rule, in_union, layer
        self.fill, self.opacity, self.outline, self.strokes, self.dots, self.front_only = fill, opacity, outline, list(strokes), list(dots), front_only
        self.back_only, self.stroke_front_only, self.lat = back_only, stroke_front_only, lat
        if span:   # the part's top and bottom, the same in every view: no curve may overshoot them
            lo, hi = span
            self.pts = [(min(max(y, lo), hi), x) for y, x in self.pts]


# The inner thigh's natural curve (how far it would cross the midline at its fullest, and at the knee), flattened where the thighs meet.
INNER = {"man": (0.05, 0.0), "woman": (0.08, 0.0), "athletic": (0.07, 0.0), "heavyman": (0.11, 0.03), "heavywoman": (0.16, 0.06), "elder": (0.07, 0.02)}
INNER_NAMES = ("crotch2", "thighin", "vmed", "kneein", "belowkneein")


# ---------------- the hands ----------------
# In the arm's frame from the wrist: s along the hand, w across (the thumb's side positive); the man's hand, scaled to each body's wrist.
# The palm's sides only: its knuckle end comes from the fingers (palm_outline).
# A finger: (base, angle, length from the base, radius at the knuckle, radius at the tip, the three joints' bends).
HAND_FRONT = dict(
    palm=[(0.00, 0.090), (0.05, 0.128), (0.13, 0.146), (0.25, 0.153), (0.28, -0.153), (0.20, -0.150), (0.11, -0.142), (0.045, -0.122), (0.00, -0.085)],
    wrist=(0.090, -0.085),
    fingers=[((0.36, -0.070), -6, 0.34, 0.022, 0.018, (0, 0, 0)), ((0.41, -0.026), -2, 0.42, 0.026, 0.021, (0, 0, 0)),
             ((0.42, 0.022), 0, 0.45, 0.027, 0.022, (0, 0, 0)), ((0.40, 0.070), 2, 0.42, 0.026, 0.021, (0, 0, 0))],
    thumb=((0.10, 0.075), 12, 0.40, 0.042, 0.028, 0.13, (0, 4, 6)))
# Seen from the side, palm forward: the thumb's edge nearest, the fingers one behind another, each curled a little more than the last.
HAND_SIDE = dict(
    palm=[(0.00, 0.080), (0.035, 0.086), (0.10, 0.088), (0.20, 0.082), (0.28, 0.068), (0.24, -0.052), (0.12, -0.068), (0.00, -0.080)],
    wrist=(0.080, -0.080),
    fingers=[((0.40, -0.004), 8, 0.32, 0.024, 0.019, (16, 16, 10)), ((0.42, 0.000), 6, 0.40, 0.026, 0.021, (12, 14, 10)),
             ((0.43, 0.004), 4, 0.44, 0.026, 0.021, (8, 12, 8)), ((0.43, 0.010), 2, 0.42, 0.026, 0.021, (4, 8, 6))],
    thumb=((0.12, 0.050), 14, 0.32, 0.038, 0.028, 0.12, (0, 6, 8)))


def seg(b, t, rb, rt, n=5):
    """A digit's bone as a capsule from b to t: (one side, the round end, the other side, the round base)."""
    L = math.dist(b, t)
    uy, ux = (t[0] - b[0]) / L, (t[1] - b[1]) / L
    ny, nx = -ux, uy
    side1 = [(b[0] + ny * rb, b[1] + nx * rb), (t[0] + ny * rt, t[1] + nx * rt)]
    tip = [(t[0] + ny * rt * math.cos(th) + uy * rt * math.sin(th), t[1] + nx * rt * math.cos(th) + ux * rt * math.sin(th))
           for th in (math.pi * i / n for i in range(1, n))]
    side2 = [(t[0] - ny * rt, t[1] - nx * rt), (b[0] - ny * rb, b[1] - nx * rb)]
    base = [(b[0] - ny * rb * math.cos(th) - uy * rb * math.sin(th), b[1] - nx * rb * math.cos(th) - ux * rb * math.sin(th))
            for th in (math.pi * i / n for i in range(1, n))]
    return side1, tip, side2, base


# One pose of the fingers for every view: (base along the hand, base across (thumb side +), base depth (palm side +), spread, curl at the base,
# length from the base, radius at the knuckle, at the tip, the three joints' bends). Little, ring, middle, index; then the thumb.
TAPER = 0.92
# The fingers lie side by side across the knuckles, each first shape's near end touching the next.
# A real hand: the palm about as wide at the knuckles (8.5 cm) as it is long (10 cm); the fingers about 2 cm wide at the base, the little
# finger 1.6; the middle finger about 8 cm from the knuckle, the index and ring a little shorter, the little finger about two-thirds.
FINGERS = [((0.37, -0.125, -0.004), -3, 8, 0.31, 0.034, 0.0, (16, 16, 10)), ((0.42, -0.051, 0.0), -1, 6, 0.39, 0.040, 0.0, (12, 14, 10)),
           ((0.43, 0.032, 0.004), 0, 4, 0.41, 0.043, 0.0, (8, 12, 8)), ((0.41, 0.117, 0.010), 1, 2, 0.37, 0.042, 0.0, (4, 8, 6))]
# The thumb: its first shape the thenar, the fleshy mass on the palm's side from near the wrist to the thumb's knuckle (fullest there);
# then its two phalanges. Its radii at the base, the knuckle, the middle joint and the tip; its three shapes' shares of its length.
THUMB = ((0.04, 0.07, 0.040), 18, 10, 0.45, 0.048, 0.043, (0, 8, 10))
THUMB_R, THUMB_FR = (0.048, 0.056, 0.049, 0.043), (0.44, 0.31, 0.25)


def digit(base, spread, curl0, L, rb, rt, kn, bends, kinds, T, side, rule, view, fracs=(0.48, 0.30, 0.22), radii=None):
    """A finger or thumb in three shapes, projected into a view. Each bone's direction comes from its curl (forward) and the spread
    (sideways); every view sees the same drop along the hand, so the tips sit at the same heights from the front and the side. The first
    shape's base hides in the palm (kn deep); its edges show from the knuckle; each later shape shows a crease over the one before."""
    Lf = L - kn
    lens = [kn + fracs[0] * Lf, fracs[1] * Lf, fracs[2] * Lf]
    sp = math.radians(spread)
    b = (base[0], base[1] if view == "front" else base[2])
    joints, curl = [b], curl0
    for i in range(3):
        curl += bends[i]
        c = math.radians(curl)
        down = math.cos(c) * math.cos(sp)
        acr = math.sin(sp) if view == "front" else math.sin(c) * math.cos(sp)
        joints.append((joints[-1][0] + lens[i] * down, joints[-1][1] + lens[i] * acr))
    # each shape narrows towards its far end by TAPER; the next shape's near end is capped at that width
    if radii is None:
        radii = [rb]
        for i in range(3):
            radii.append(radii[-1] * TAPER)
    out = []
    for i in range(3):
        j0, j1 = joints[i], joints[i + 1]
        r0, r1 = radii[i], radii[i + 1]
        side1, tip, side2, bse = seg(j0, j1, r0, r1)
        closed = side1 + tip + side2 + bse
        if i == 0:
            f0 = kn / lens[0]
            k0 = (lerp(j0[0], j1[0], f0), lerp(j0[1], j1[1], f0))
            s1, _, s2, _ = seg(k0, j1, r0, r1)
            strokes = [(s1, "edge"), (s2, "edge")]
        else:
            L_ = math.dist(j0, j1)
            u_ = ((j1[0] - j0[0]) / L_, (j1[1] - j0[1]) / L_)
            n_ = (-u_[1], u_[0])
            crease = curve([(j0[0] + 0.75 * r0 * n_[0], j0[1] + 0.75 * r0 * n_[1]), (j0[0] + 0.15 * r0 * u_[0], j0[1] + 0.15 * r0 * u_[1]),
                            (j0[0] - 0.75 * r0 * n_[0], j0[1] - 0.75 * r0 * n_[1])], 3)
            strokes = [(side1, "edge"), (side2, "edge"), (crease, "form")] if i == 1 else [(side1 + tip + side2, "edge"), (crease, "form")]
        out.append(Part(kinds[i], [T(q) for q in closed], side, rule, layer="hand", strokes=[([T(q) for q in st], sty) for st, sty in strokes]))
    return out


def knuckle(base, spread, curl0, L, rb, bends, view, kn=0.05, fracs=(0.48, 0.30, 0.22)):
    """A finger's first shape where it leaves the palm, as digit() lays it: its base, its knuckle (kn along the bone), the bone's direction,
    the normal towards +w, the radius there."""
    sp, c = math.radians(spread), math.radians(curl0 + bends[0])
    down = math.cos(c) * math.cos(sp)
    acr = math.sin(sp) if view == "front" else math.sin(c) * math.cos(sp)
    j0 = (base[0], base[1] if view == "front" else base[2])
    ln = math.hypot(down, acr)
    u = (down / ln, acr / ln)
    return j0, (j0[0] + kn * down, j0[1] + kn * acr), u, (-u[1], u[0]), rb


def palm_outline(spec, view):
    """The palm's outline before it is fitted to the wrist. Its knuckle end is as wide as the near ends of the fingers' first shapes, and
    its sides run straight into their edges: from the front the index finger's and the little finger's outer edges, from the side the
    index finger's front and back. Across the knuckles it passes under the fingers."""
    K = [knuckle(base, spread, curl0, L, rb, bends, view) for base, spread, curl0, L, rb, rt, bends in FINGERS]
    hi, lo = (K[3], K[0]) if view == "front" else (K[3], K[3])

    def edge(k, sg):
        j0, k0, u, n, r = k
        at = (lambda q: (q[0] + sg * n[0] * r, q[1] + sg * n[1] * r))
        return [at((j0[0] - 0.04 * u[0], j0[1] - 0.04 * u[1])), at(j0), at(k0)]
    e_hi, e_lo = edge(hi, 1), edge(lo, -1)
    # the thumb's side: from the wrist the palm runs along the thenar's outer edge to the thumb's knuckle; from there it passes under the
    # thumb to the index finger
    base, spread, curl0, L, rb, rt, bends = THUMB
    tj0, tj1, tu, tn, _ = knuckle(base, spread, curl0, L, rb, bends, view, THUMB_FR[0] * L)
    thenar = [(tj0[0] + tn[0] * THUMB_R[0], tj0[1] + tn[1] * THUMB_R[0]), (tj1[0] + tn[0] * THUMB_R[1], tj1[1] + tn[1] * THUMB_R[1])]
    P = spec["palm"]
    side_hi = [q for q in P if q[1] > 0 and (q[0] <= 0.0 or q[0] < thenar[0][0] - 0.03)] + thenar
    side_lo = [q for q in P if q[1] < 0 and q[0] < e_lo[0][0] - 0.03]
    across = sorted((k[1] for k in K), key=lambda q: -q[1]) if view == "front" else [hi[1]]
    return side_hi + e_hi + [(q[0] - 0.01, q[1]) for q in across] + rev(e_lo) + side_lo


def hand_parts(spec, wrist_s, wo, wi, side, rule, view):
    """The palm, the four fingers and the thumb (three shapes each), fitted to the wrist's cut (wo outside, wi inside)."""
    ko, ki = wo / spec["wrist"][0], wi / spec["wrist"][1]

    def T(q):
        s_, w = q
        kk = ko if w > 0 else ki
        return (wrist_s + s_, w * lerp(kk, kk ** 0.4, min(1.0, s_ / 0.45)))
    edge = [T(q) for q in curve(palm_outline(spec, view))]
    out = [Part("palm", edge + cap(edge[-1], edge[0], (wrist_s - 1, 0), 0.07), side, rule)]
    for base, spread, curl0, L, rb, rt, bends in FINGERS:
        out += digit(base, spread, curl0, L, rb, rt, 0.05, bends, ("finger1", "finger2", "finger3"), T, side, rule, view)
    base, spread, curl0, L, rb, rt, bends = THUMB
    out += digit(base, spread, curl0, L, rb, rt, 0.0, bends, ("thumb1", "thumb2", "thumb3"), T, side, rule, view, THUMB_FR, THUMB_R)
    return out


def across_fn(out_pts, in_pts):
    """A point at s along the arm, a fraction f across it: 0 on its in (or back) edge, 1 on its out (or front) edge."""
    o, i = sorted(out_pts), sorted(in_pts)

    def at(tab, s_):
        if s_ <= tab[0][0]:
            return tab[0][1]
        for (s0, w0), (s1, w1) in zip(tab, tab[1:]):
            if s0 <= s_ <= s1:
                return w0 + (w1 - w0) * (s_ - s0) / max(s1 - s0, 1e-9)
        return tab[-1][1]
    return lambda s_, fr: (s_, lerp(at(i, s_), at(o, s_), fr))


DELT, BIC, TRI = (-0.22, 0.62), (0.48, 1.32), (0.36, 1.26)   # the shoulder's, biceps' and triceps' spans along the arm
ELBOW_R, WRIST_R = 0.12, 0.07   # the caps' depth at the elbow and the wrist, the same in every view


def arm_table(out_pts, in_pts, side, rule, hand_spec, view="front"):
    """The arm's parts in its own frame: the upper arm's core with the shoulder, biceps and triceps on it, the forearm, the hand's parts.
    From the front the biceps shows and the triceps is behind; from the back the reverse; from the side both."""
    D, idx = dense(out_pts + in_pts)
    no = len(out_pts)
    o0, o1, i0, i1 = idx[0], idx[no - 1], idx[no], idx[-1]
    eo, wo = cut(D, o0, o1, 1.38), cut(D, o0, o1, 2.47)
    wi, ei = cut(D, i0, i1, 2.47), cut(D, i0, i1, 1.38)
    upper = sub(D, ei, eo) + cap(eo[1], ei[1], (3, 0), ELBOW_R)
    a, b = sub(D, eo, wo), sub(D, wi, ei)
    fore = a + cap(wo[1], wi[1], (3, 0), WRIST_R) + b + cap(ei[1], eo[1], (0, 0), ELBOW_R)
    A = across_fn(out_pts, in_pts)
    out = [Part("upperarm", upper, side, rule)]
    if view == "front":
        c1 = cut(D, o0, o1, 0.62)
        inner = curve([c1[1], A(0.45, 0.62), A(0.22, 0.32), A(0.0, 0.08), A(-0.14, 0.15), D[0]])
        out.append(Part("deltoid", D[:c1[0] + 1] + [c1[1]] + inner[1:-1], side, rule, layer="armmass", strokes=[(inner[:-2], "form")], span=DELT))
        b1, b0 = cut(D, i0, i1, 1.28), cut(D, i0, i1, 0.48)
        inner = curve([b0[1], A(0.50, 0.40), A(0.75, 0.62), A(1.05, 0.60), A(1.25, 0.45), A(1.32, 0.15), b1[1]])
        out.append(Part("biceps", sub(D, b1, b0) + inner[1:-1], side, rule, layer="armmass", strokes=[(inner, "form")], front_only=True, span=BIC))
        t0, t1, t2, t3 = cut(D, o0, o1, 0.45), cut(D, o0, o1, 1.18), cut(D, i0, i1, 1.22), cut(D, i0, i1, 0.40)
        bottom, top = curve([t1[1], A(1.25, 0.65), A(1.26, 0.30), t2[1]]), curve([t3[1], A(0.36, 0.5), t0[1]])
        out.append(Part("triceps", sub(D, t0, t1) + bottom[1:-1] + sub(D, t2, t3) + top[1:-1], side, rule, layer="armmass",
                        strokes=[(bottom, "form")], back_only=True, span=TRI))
    else:
        c1, c2 = cut(D, o0, o1, 0.55), cut(D, i0, i1, 0.52)
        bottom = curve([c1[1], A(0.62, 0.55), A(0.58, 0.2), c2[1]])
        out.append(Part("deltoid", D[:c1[0] + 1] + [c1[1]] + bottom[1:-1] + [c2[1]] + D[c2[0] + 1:], side, rule, layer="armmass",
                        strokes=[(bottom, "form")], span=DELT))
        b0, b1 = cut(D, o0, o1, 0.48), cut(D, o0, o1, 1.28)
        inner = curve([b1[1], A(1.32, 0.7), A(1.0, 0.48), A(0.62, 0.48), A(0.50, 0.78), b0[1]])
        out.append(Part("biceps", sub(D, b0, b1) + inner[1:-1], side, rule, layer="armmass", strokes=[(inner, "form")], span=BIC))
        t0, t1 = cut(D, i0, i1, 1.25), cut(D, i0, i1, 0.36)
        inner = curve([t1[1], A(0.38, 0.3), A(0.8, 0.42), A(1.2, 0.35), A(1.26, 0.1), t0[1]])
        out.append(Part("triceps", sub(D, t0, t1) + inner[1:-1], side, rule, layer="armmass", strokes=[(inner, "form")], span=TRI))
    out.append(Part("forearm", fore, side, rule))
    return out + hand_parts(hand_spec, 2.47, wo[1][1], wi[1][1], side, rule, view)


# ---------------- the front (and, mirrored, the back) ----------------
def front_table(body, bow=None, lips="heart"):
    """The front's parts, and the inner edge of the right leg (for where the legs touch)."""
    L = levels(body)
    k = body["k"]
    names = ["top", "top2"] + [n for n, y, x in body["front"] if n not in FRONT_HEAD_NAMES and n != "jawtuck"]
    head, right = split_front(body)
    assert len(names) == len(right)
    P0 = dict(zip(names, right))
    A, Ak = INNER[key_of(body)]
    yc, yk = P0["crotch"][0], P0["kneein"][0]

    def bulge(y):
        t = (y - yc) / (yk - yc + 0.1)
        b = A * math.sin(math.pi * t ** 0.7) if 0 < t < 1 else 0.0
        return b + Ak * math.exp(-((y - (yk - 0.12)) / 0.16) ** 2)
    right = [(y, x - bulge(y)) if n in INNER_NAMES else (y, x) for n, (y, x) in zip(names, right)]
    # the neck's side runs into the trapezius's slope in one smooth curve, with no shelf where they meet: trap1 gives way to two points on
    # a curve tangent to the neck's side and to the slope
    i1 = names.index("trap1")
    T0, N, T2, T3 = right[i1 - 2], right[i1 - 1], right[i1 + 1], right[i1 + 2]
    dN, dT = (N[0] - T0[0], N[1] - T0[1]), (T3[0] - T2[0], T3[1] - T2[1])
    det = dN[0] * dT[1] - dN[1] * dT[0]
    a_ = ((T2[0] - N[0]) * dT[1] - (T2[1] - N[1]) * dT[0]) / det
    C_ = (N[0] + a_ * dN[0], N[1] + a_ * dN[1])

    def q_(t):
        return tuple((1 - t) ** 2 * u + 2 * t * (1 - t) * v + t * t * w for u, v, w in zip(N, C_, T2))
    right = right[:i1] + [q_(1 / 3), q_(2 / 3)] + right[i1 + 1:]
    names = names[:i1] + ["trap1", "trap1b"] + names[i1 + 1:]
    D, idx = dense(right + mir(rev(right))[1:-1])
    ix = {n: idx[i] for i, n in enumerate(names)}
    P = dict(zip(names, right))

    def c(a, b, v):
        return cut(D, ix[a], ix[b], v)

    neck_top, neck_base = c("top2", "trap2", L["neck_top"]), c("top2", "trap2", L["neck_base"])
    chest_top = c("top2", "trap2", L["chest_top"])
    waist = c("lat", "thigh", L["waist"])
    hip_out = c("pelvis", "thigh", P["troch"][0] + 0.08 * k)
    thigh_top = c("flank", "troch", P["troch"][0] - 0.12 * k)
    knee_out, knee_in = c("thigh", "calfout", L["knee"]), c("calfin", "vmed", L["knee"])
    atop_o, atop_i = c("calf", "footout", L["ankle_top"]), c("footin", "calfin", L["ankle_top"])
    abot_o, abot_i = c("shin", "soleout", L["instep"]), c("solein", "malin", L["instep"])
    htop_o, htop_i = c("shin", "soleout", L["ankle_top"]), c("solein", "malin", L["ankle_top"])
    Y = (lambda y: y if y <= 1.2 else 1.2 + (y - 1.2) * k)
    acro = c("trap2", "underdelt", P["acromion"][0])
    rib_top, rib_bot = c("underdelt", "waist", P["armpit"][0]), c("lat", "flank", Y(2.70))
    hip_top, hip_bot = c("ribs", "thigh", L["hip_top"]), c("pelvis", "vlat", L["hip_bottom"])
    o_in, o_toe, o_low = c("shin", "soleout", L["instep"]), c("shin", "soleout", L["toe"]), c("footout", "sole", L["sole"] - 0.04)
    i_low, i_toe, i_in = c("sole", "footin", L["sole"] - 0.04), c("solein", "malin", L["toe"]), c("solein", "malin", L["instep"])
    heel_o, heel_i = c("shin", "soleout", L["heel_top"] + 0.12 * k), c("solein", "malin", L["heel_top"] + 0.12 * k)
    crotch_p = P["crotch"]
    crotch = (ix["crotch"] - 1, crotch_p)

    def m1(p):
        return (p[0], -p[1])

    parts = []
    # the head without the ears' bumps: the cheek runs down from the temple to the jaw
    hx = head[3][1]
    head = list(head)
    head[4], head[5], head[6] = (head[4][0], hx * 0.98), (head[5][0], hx * 0.955), (head[6][0], lerp(hx * 0.955, head[7][1], 0.45))
    # the neck: a column, its sides running straight down behind the traps from where the trapezius's slope leaves them
    nk = c("top2", "trap2", Y(1.17))
    e = sub(D, neck_top, nk) + [(L["neck_base"], nk[1][1] + 0.01)]
    parts.append(Part("neck", e + vcap(e[-1], m1(e[-1]), L["neck_base_cap"]) + rev(mir(e)) + vcap(m1(e[0]), e[0], L["neck_cap"])))
    e = sub(D, chest_top, waist)
    parts.append(Part("chest", e + vcap(e[-1], m1(e[-1]), L["waist_down"]) + rev(mir(e)) + vcap(m1(e[0]), e[0], L["chest_cap"])))
    # the clavicle and traps, one on each side: from the neck down the trapezius's smooth slope to the acromion; from the front its lower
    # edge the clavicle, from the back its edge down to the middle of the back
    s0 = c("top2", "trap2", L["neck_base"] - 0.10)
    r = sub(D, s0, acro)
    ac = r[-1]
    clav = curve([ac, (ac[0] + 0.03, ac[1] - 0.08), (Y(1.46), 0.55), (Y(1.405), 0.30), (Y(1.43), 0.12), (Y(1.45), 0.02)])
    kite = curve([ac, (ac[0] + 0.05, ac[1] - 0.03), (ac[0] + 0.12, ac[1] - 0.13), (Y(1.85), 0.42), (Y(2.35), 0.16), (L["traps_bottom"], 0.0)])
    inner = curve([(L["traps_bottom"], 0.0), (Y(2.0), 0.0), (Y(1.45), 0.0), (Y(1.30), 0.03), (Y(1.21), 0.17), s0[1]])
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        parts.append(Part("traps", mm(r + kite[1:] + inner[1:-1]), sd, layer="mass", strokes=[(mm(clav), "form", "front"), (mm(kite), "form", "back")],
                          span=(L["neck_base"] - 0.10, L["traps_bottom"])))
    # the shoulder blades, seen from the back: the medial edge and the lower angle, and the spine of the blade up towards the acromion
    sx = P["armpit"][1] / 0.74
    st, sb = L["scap_top"], L["scap_bottom"]
    blade = dense([(st + 0.04, 0.19 * sx), (st, 0.34 * sx), (st + 0.01, 0.52 * sx), (Y(1.58), 0.66 * sx), (Y(1.70), 0.70 * sx), (Y(1.90), 0.58 * sx),
                   (Y(2.12), 0.42 * sx), (sb, 0.30 * sx), (sb - 0.07, 0.22 * sx), (Y(1.95), 0.16 * sx), (Y(1.72), 0.16 * sx)])[0]
    edge_ = curve([(Y(1.66), 0.165 * sx), (Y(1.95), 0.16 * sx), (sb - 0.07, 0.22 * sx), (sb, 0.30 * sx), (Y(2.12), 0.42 * sx)])
    spine = curve([(Y(1.68), 0.17 * sx), (Y(1.62), 0.40 * sx), (Y(1.57), 0.62 * sx)])
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        parts.append(Part("scapula", mm(blade), sd, layer="mass", strokes=[(mm(edge_), "form"), (mm(spine), "form")], back_only=True, span=(st, sb)))
    # the ribcage halves: the side below the armpit is theirs; their lower edges the costal margins
    sil = sub(D, rib_top, rib_bot)
    margin = curve([sil[-1], (L["rib_bottom"], 0.50), (Y(2.62), 0.26), (Y(2.32), 0.06)])
    rib = (curve([(L["rib_top"], 0.06), (L["rib_top"], 0.42), (Y(1.75), 0.64), sil[0]])[:-1] + sil + margin[1:]
           + curve([(Y(2.32), 0.06), (Y(1.95), 0.05), (L["rib_top"], 0.06)])[1:-1])
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        parts.append(Part("ribcage", mm(rib), sd, layer="mass", strokes=[(mm(margin), "form")], stroke_front_only=True, span=(L["rib_top"], L["rib_bottom"])))
    # from the front the chest lies over the upper arms: a strip along the chest's side below the armpit, drawn over the biceps with the
    # side's edge (a drawing aid, not a part)
    a_, b_ = sil[0], sil[-1]
    strip = sil + curve([b_, (b_[0] - 0.06, b_[1] - 0.07), (lerp(a_[0], b_[0], 0.45), lerp(a_[1], b_[1], 0.45) - 0.11), (a_[0] + 0.03, a_[1] - 0.12)])[1:]
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        parts.append(Part("chest_side", mm(strip), sd, in_union=False, layer="overlay", strokes=[(mm(sil), "edge")], front_only=True))
    # the upper abdomen, between the ribcage halves and down to the navel
    half = [(Y(2.31), 0.17), (Y(2.55), 0.28), (Y(2.95), 0.30), (Y(3.12), 0.20)]
    ab = dense([(L["ab_top"], 0.0)] + half + [(L["ab_bottom"], 0.0)] + mir(rev(half)))[0]
    side_line = curve([(Y(2.40), 0.25), (Y(2.70), 0.29), (Y(3.02), 0.27)])
    parts.append(Part("abdomen", ab, layer="mass", strokes=[(side_line, "form"), (mir(side_line), "form")], front_only=True, span=(L["ab_top"], L["ab_bottom"])))
    # the lower abdomen, on the pelvis: from under the navel down to the pubis, between the groins
    lt, lb_ = L["lowab_top"], L["lowab_bottom"]
    half = [(lt + 0.025, 0.17), (Y(3.28), 0.28), (Y(3.50), 0.29), (Y(3.70), 0.22), (Y(3.84), 0.11)]
    lab = dense([(lt, 0.0)] + half + [(lb_, 0.0)] + mir(rev(half)))[0]
    groin = curve([(Y(3.50), 0.29), (Y(3.70), 0.22), (Y(3.84), 0.11), (lb_ - 0.01, 0.03)])
    parts.append(Part("lowab", lab, layer="mass", strokes=[(groin, "form"), (mir(groin), "form")], front_only=True, span=(lt, lb_)))
    e = sub(D, waist, hip_out)
    hy, hxo = e[-1]
    # the pelvis's lower edge: down behind the thighs to the buttocks' folds (as low as in the side view), then up to the crotch
    low = curve([(hy, hxo), (lerp(hy, L["glute"], 0.8), hxo * 0.8), (L["glute"], hxo * 0.48), (lerp(L["glute"], crotch_p[0], 0.5), hxo * 0.16), crotch_p])[1:-1]
    parts.append(Part("pelvis", e + low + [crotch_p] + rev(mir(low)) + rev(mir(e)) + vcap(m1(e[0]), e[0], L["waist_up"])))
    # the hips (the flank over the hip bone, down to the trochanter) and, from the back, the buttocks
    sil = sub(D, hip_top, hip_bot)
    inner = curve([sil[-1], (Y(3.86), 0.50), (Y(3.42), 0.40), (Y(3.12), 0.48), sil[0]])
    g = L["glute"]
    bt = L["buttock_top"]
    Db, ib = dense([(bt + 0.05, 0.03), (bt, 0.30), (Y(3.62), 0.56), (Y(3.95), 0.63), (g - 0.03, 0.50), (g, 0.28), (g - 0.05, 0.08), (lerp(bt, g, 0.85), 0.02)])
    fold = Db[ib[4]:] + [Db[0]]
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        parts.append(Part("hip", mm(sil + inner[1:-1]), sd, layer="mass", strokes=[(mm(inner), "form")], stroke_front_only=True))
        parts.append(Part("buttock", mm(Db), sd, layer="mass", strokes=[(mm(fold), "edge")], back_only=True))
    # the right leg (x > 0); the left is its mirror
    o, i = sub(D, thigh_top, knee_out), sub(D, knee_in, crotch)
    thigh = o + vcap(o[-1], i[0], L["knee"] + L["knee_r"]) + i + vcap(crotch_p, o[0], L["thigh_cap"])
    o, i = sub(D, knee_out, atop_o), sub(D, atop_i, knee_in)
    shin = o + vcap(o[-1], i[0], L["ankle_top"] + L["ankle_r"]) + i + vcap(i[-1], o[0], L["knee"] - L["knee_r"])
    # the foot from the front: the ankle at the joint, the heel behind (down to the floor), the plantar from the ankle down, the toes in front
    # the ankle: from the front an ellipse as tall as the side's circle, across the ankle's width at the joint
    ankle = ellipse(L["ankle_top"], (atop_o[1][1] + atop_i[1][1]) / 2, L["ankle_r"], (atop_o[1][1] - atop_i[1][1]) / 2, n=24)
    eo, ei = sub(D, htop_o, heel_o), sub(D, heel_i, htop_i)
    mid = (eo[-1][1] + ei[0][1]) / 2
    behind = curve([eo[-1], (lerp(eo[-1][0], L["sole"], 0.6), eo[-1][1] - 0.03), (L["sole"] - 0.02, mid + 0.05), (L["sole"], mid),
                    (L["sole"] - 0.02, mid - 0.05), (lerp(ei[0][0], L["sole"], 0.6), ei[0][1] + 0.03), ei[0]])[1:-1]
    heel = eo + behind + ei + vcap(ei[-1], eo[0], L["ankle_top"] - L["ankle_r"])
    o = sub(D, atop_o, atop_i)
    plantar = o + vcap(o[-1], o[0], L["ankle_top"] - L["ankle_r"])
    for kind, pts in (("thigh", thigh), ("shin", shin), ("ankle", ankle), ("heel", heel), ("plantar", plantar)):
        parts += [Part(kind, pts, 1, "leg"), Part(kind, mir(pts), -1, "leg")]
    # the toes from the front: five, the big toe on the inside, the knuckles stepping down towards the little toe, the tips on the sole
    x_in, x_out = i_toe[1][1], o_toe[1][1]
    xa = x_in
    for j, fw in enumerate((0.30, 0.185, 0.18, 0.175, 0.16)):
        xb = xa + fw * (x_out - x_in)
        a_, b_ = xa + 0.004, xb - 0.004
        yt = L["toe"] - L["toe_r"] + 0.008 * j
        ys = cut(D, ix["soleout"], ix["footin"], (a_ + b_) / 2, 1)[1][0]
        rr = min(0.45 * (b_ - a_), 0.03)
        toe = dense([(yt, a_ + rr), (yt, b_ - rr), (yt + rr * 0.6, b_), (ys - rr * 0.8, b_), (ys, b_ - rr), (ys, a_ + rr), (ys - rr * 0.8, a_), (yt + rr * 0.6, a_)])[0]
        for sd in (1, -1):
            mm = (lambda q: q) if sd > 0 else mir
            parts.append(Part("toes", mm(toe), sd, "leg", in_union=False, layer="toe", outline=0.32, front_only=True, span=(yt, ys)))
        xa = xb
    # the arms and hands
    for side in (1, -1):
        parts += arm_table(*body["arm"], side, "arm", HAND_FRONT, "front")
    parts += breasts_front(body, L)
    parts += face_front(body, L, head, bow, lips)
    inner = sub(D, atop_i, crotch)        # the right leg's inner edge, ankle to crotch
    return parts, inner, P["kneein"][1]


def breasts_front(body, L):
    """The breasts (or pectorals) as shapes on the chest, spanning the same heights as in profile: a firm edge underneath, a light one above."""
    fem = body["sex"] == "f"
    yt, yb, ya = L["breast_top"], L["breast_bottom"], L["apex"]
    if fem:
        w = 0.06 if body is BODIES["heavywoman"] else 0.0
        low = [(yb - 0.20, 0.09), (yb - 0.05, 0.22), (yb, 0.36 + w), (yb - 0.08, 0.52 + w), (lerp(yt, yb, 0.62), 0.63 + w)]
        high = [(lerp(yt, yb, 0.30), 0.58 + w), (yt + 0.04, 0.44), (yt, 0.30), (yt + 0.10, 0.15)]
        nip = (ya + 0.03, 0.37 + w / 2, 0.028)
    else:
        w = {"athletic": 0.02, "heavyman": 0.04}.get(key_of(body), 0.0)
        low = [(lerp(yt, yb, 0.42), 0.05), (yb - 0.03, 0.20), (yb, 0.36 + w), (yb - 0.06, 0.52 + w), (lerp(yt, yb, 0.45), 0.64 + w)]
        high = [(yt + 0.12, 0.62 + w), (yt + 0.03, 0.50), (yt, 0.30), (yt + 0.02, 0.06)]
        nip = (ya, 0.40 + w / 2, 0.025)
    D, idx = dense(low + high)
    n = len(low)
    under, over = D[:idx[n - 1] + 1], D[idx[n - 1]:] + [D[0]]
    kind = "breast" if fem else "pec"
    out = []
    for s in (1, -1):
        m = (lambda pts: pts) if s > 0 else mir
        out.append(Part(kind, m(D), s, "torso", in_union=False, layer="chest", strokes=[(m(under), "edge"), (m(over), "form")],
                        dots=[(nip[0], s * nip[1], nip[2], nip[2], FORM)], front_only=True, span=(yt, yb)))
    return out


BOWS = {"flat": 0.0, "soft": 0.010, "deep": 0.022}   # the cupid's bow: how far its middle dips below its peaks


def ear_levels(L):
    """The heights of the ear's shapes, the same from the front, the side and the back."""
    et, eb = L["ear"]
    return dict(helix=(et, eb - 0.07), lobe=(eb - 0.10, eb), antihelix=(et + 0.035, eb - 0.075), concha=(lerp(et, eb, 0.38), eb - 0.075))


def ear_front(L, sd):
    """One ear from the front (or the back), nearly edge-on beside the head: the helix and the lobe; from the front also the antihelix's
    ridge and a sliver of the concha."""
    E = ear_levels(L)
    (h0, h1), (l0, l1), (a0, a1), (c0, c1) = E["helix"], E["lobe"], E["antihelix"], E["concha"]
    m = (lambda q: q) if sd > 0 else mir
    kw = dict(side=sd, rule="head", in_union=False, layer="ear")
    helix = dense([(h0, 0.31), (h0 + 0.02, 0.345), (h0 + 0.06, 0.368), (lerp(h0, h1, 0.55), 0.378), (h1, 0.368), (h1 - 0.005, 0.335),
                   (lerp(h0, h1, 0.55), 0.30), (h0 + 0.04, 0.29)])[0]
    lobe = dense([(l0, 0.33), (l0 + 0.01, 0.365), (l1 - 0.035, 0.345), (l1, 0.31), (l1 - 0.025, 0.29), (l0 + 0.03, 0.30)])[0]
    anti = dense([(a0, 0.33), (lerp(a0, a1, 0.45), 0.354), (a1, 0.346), (a1 - 0.01, 0.336), (lerp(a0, a1, 0.45), 0.342), (a0 + 0.01, 0.324)])[0]
    concha = ellipse(lerp(c0, c1, 0.5), 0.322, (c1 - c0) / 2, 0.012)
    ridge = curve([(a0 + 0.01, 0.326), (a1 - 0.01, 0.338)], 3)
    return [Part("helix", m(helix), **kw), Part("lobe", m(lobe), **kw),
            Part("concha", m(concha), fill=CONCHA, front_only=True, **kw),
            Part("antihelix", m(anti), strokes=[(m(ridge), "form")], front_only=True, **kw)]


def ear_side(L, dx):
    """The near ear from the side: the helix (the rim and the blade of the ear, its base), the lobe, the concha's bowl, the antihelix's
    ridge round it, the antitragus over the lobe, the canal, the tragus over the canal's front."""
    E = ear_levels(L)
    et, eb = L["ear"]
    (h0, h1), (l0, l1), (a0, a1), (c0, c1) = E["helix"], E["lobe"], E["antihelix"], E["concha"]
    sh = (lambda q: [(y, x + dx) for y, x in q])
    kw = dict(rule="head", in_union=False, layer="ear", lat=0.36)
    helix = dense([(h0 + 0.04, -0.02), (h0 + 0.005, -0.06), (h0, -0.095), (h0 + 0.03, -0.13), (lerp(h0, h1, 0.45), -0.143), (h1 - 0.04, -0.13),
                   (h1, -0.11), (h1 - 0.005, -0.03), (lerp(h0, h1, 0.6), -0.015)])[0]
    rim = curve([(h0 + 0.04, -0.04), (h0 + 0.025, -0.11), (lerp(h0, h1, 0.45), -0.125), (h1 - 0.02, -0.105)])
    lobe = dense([(l0, -0.04), (l0 + 0.005, -0.10), (l1 - 0.045, -0.115), (l1 - 0.01, -0.085), (l1, -0.05), (l1 - 0.03, -0.025), (l0 + 0.03, -0.025)])[0]
    anti = dense([(a0, -0.05), (a0 + 0.015, -0.10), (lerp(a0, a1, 0.5), -0.112), (a1, -0.085), (a1 - 0.005, -0.07), (lerp(a0, a1, 0.5), -0.092),
                  (a0 + 0.03, -0.085), (a0 + 0.025, -0.055)])[0]
    ridge = curve([(a0 + 0.028, -0.07), (a1 - 0.004, -0.078)], 3)
    concha = ellipse(lerp(c0, c1, 0.5), -0.055, (c1 - c0) / 2, 0.030)
    mid = lerp(et, eb, 0.55)
    return [Part("helix", sh(helix), strokes=[(sh(rim), "form")], **kw), Part("lobe", sh(lobe), **kw),
            Part("concha", sh(concha), fill=CONCHA, **kw), Part("antihelix", sh(anti), strokes=[(sh(ridge), "form")], **kw),
            Part("antitragus", sh(ellipse(c1 - 0.004, -0.072, 0.012, 0.018)), outline=0.3, **kw),
            Part("ear_canal", sh(ellipse(mid, -0.050, 0.012, 0.009)), fill=LINE, opacity=0.85, **kw),
            Part("tragus", sh(ellipse(mid, -0.034, 0.024, 0.011)), outline=0.3, **kw)]


def eye_front(L, sd):
    """One eye from the front (sd 1 the viewer's right, -1 the left): the white is a whole eyeball, shown only through the lids' opening;
    the iris and the pupil on it; the lower and upper lids, skin over the ball, their lash lines and the upper lid's crease as edges; the
    tear duct in the inner corner."""
    e = L["eye"]
    m = (lambda q: q) if sd > 0 else mir
    up_lash = curve([(e + 0.007, 0.068), (e - 0.025, 0.09), (e - 0.037, 0.135), (e - 0.027, 0.18), (e, 0.215)])
    lo_lash = curve([(e, 0.215), (e + 0.017, 0.19), (e + 0.027, 0.145), (e + 0.02, 0.10), (e + 0.007, 0.068)])
    upper = up_lash + curve([(e + 0.004, 0.236), (e - 0.034, 0.236), (e - 0.058, 0.18), (e - 0.062, 0.13), (e - 0.054, 0.08), (e - 0.02, 0.05), (e + 0.009, 0.052)])
    lower = lo_lash + curve([(e + 0.014, 0.050), (e + 0.045, 0.085), (e + 0.058, 0.15), (e + 0.045, 0.22), (e + 0.006, 0.238)])
    crease = curve([(e - 0.03, 0.075), (e - 0.052, 0.12), (e - 0.051, 0.17), (e - 0.032, 0.208)])
    kw = dict(side=sd, rule="head", in_union=False, layer="face", front_only=True)
    return [Part("sclera", m(ellipse(e - 0.005, 0.141, 0.045, 0.080)), fill=EYE_WHITE, outline=0.35, **kw),
            Part("iris", m(ellipse(e - 0.003, 0.138, 0.027, 0.027)), fill=IRIS, **kw),
            Part("pupil", m(ellipse(e - 0.003, 0.138, 0.011, 0.011)), fill=LINE, **kw),
            Part("tear_duct", m(ellipse(e + 0.004, 0.076, 0.006, 0.009)), fill=LIP, **kw),
            Part("lid_low", m(lower), strokes=[(m(lo_lash), "form")], **kw),
            Part("lid_up", m(upper), strokes=[(m(up_lash), "lash"), (m(crease), "form")], **kw)]


def eye_side(L, dxe):
    """The near eye from the side, at the same heights: the eyeball behind the lids, the iris and pupil seen edge-on at its front, the lids."""
    e = L["eye"]
    up_lash = curve([(e, 0.240 + dxe), (e - 0.022, 0.255 + dxe), (e - 0.037, 0.285 + dxe), (e - 0.006, 0.306 + dxe)])
    lo_lash = curve([(e - 0.006, 0.306 + dxe), (e + 0.027, 0.285 + dxe), (e + 0.02, 0.258 + dxe), (e, 0.240 + dxe)])
    upper = up_lash + curve([(e - 0.006, 0.313 + dxe), (e - 0.05, 0.30 + dxe), (e - 0.062, 0.27 + dxe), (e - 0.056, 0.235 + dxe), (e - 0.02, 0.225 + dxe)])
    lower = lo_lash + curve([(e + 0.03, 0.235 + dxe), (e + 0.058, 0.26 + dxe), (e + 0.05, 0.29 + dxe), (e + 0.02, 0.31 + dxe)])
    crease = curve([(e - 0.026, 0.235 + dxe), (e - 0.05, 0.262 + dxe), (e - 0.047, 0.292 + dxe)])
    kw = dict(rule="head", in_union=False, layer="face", lat=0.14)
    return [Part("sclera", ellipse(e - 0.005, 0.272 + dxe, 0.045, 0.036), fill=EYE_WHITE, outline=0.35, **kw),
            Part("iris", ellipse(e - 0.003, 0.300 + dxe, 0.027, 0.008), fill=IRIS, **kw),
            Part("pupil", ellipse(e - 0.003, 0.304 + dxe, 0.011, 0.004), fill=LINE, **kw),
            Part("lid_low", lower, strokes=[(lo_lash, "form")], **kw),
            Part("lid_up", upper, strokes=[(up_lash, "lash"), (crease, "form")], **kw)]


def nose_levels(L, sp):
    """The heights of the nose's shapes, the same from the front and the side."""
    nt, nb, no = L["nose_top"], L["nose_bottom"], sp["nose"][0]
    return dict(bridge=(nt + 0.02, no - 0.01), cartilage=(lerp(nt, no, 0.45), no + 0.01), tip=(no - 0.025, no + 0.045), nostril=(no, nb + 0.004), septum=(no + 0.035, nb + 0.006),
                hole=(nb - 0.012, nb + 0.002))


def ellipse(cy, cx, ry, rx, a0=0.0, a1=360.0, n=16):
    """Points round an ellipse (or an arc of it), angle 0 pointing to +x (forward, or out), 90 down."""
    return [(cy + ry * math.sin(math.radians(a)), cx + rx * math.cos(math.radians(a))) for a in (lerp(a0, a1, i / n) for i in range(n + (0 if a1 - a0 >= 360 else 1)))]


def nose_front(L, sp):
    """From the front: the bridge, the tip, the two nostrils (the wings), the septum between them, the two nose holes."""
    N = nose_levels(L, sp)
    (b0, b1), (t0, t1), (a0, a1), (s0, s1), (h0, h1) = N["bridge"], N["tip"], N["nostril"], N["septum"], N["hole"]
    out = []
    # the bridge: a box tapering from between the eyes down to the tip's ball, as wide as the ball where they meet; its front plane's edges
    half = [(b0, 0.020), (lerp(b0, b1, 0.5), 0.029), (b1, 0.042)]
    bridge = dense([(b0 - 0.004, 0.0)] + half + [(b1 + 0.006, 0.0)] + mir(rev(half)))[0]
    side_line = curve([(b0 + 0.01, 0.021), (lerp(b0, b1, 0.5), 0.028), (b1, 0.040)], 2)
    out.append(Part("bridge", bridge, 0, "head", in_union=False, layer="face", strokes=[(side_line, "form"), (mir(side_line), "form")], front_only=True))
    # the lateral cartilages: a triangle on each side of the nose, from the bridge's side down to the wing's top
    c0, c1 = N["cartilage"]
    cart = dense([(c0, 0.026), (lerp(c0, c1, 0.55), 0.048), (c1, 0.074), (c1 - 0.003, 0.042), (lerp(c0, c1, 0.75), 0.031)])[0]
    edge_c = curve([(c0 + 0.004, 0.028), (lerp(c0, c1, 0.55), 0.047), (c1 - 0.004, 0.070)], 2)
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        out.append(Part("cartilage", mm(cart), sd, "head", in_union=False, layer="face", strokes=[(mm(edge_c), "form")], front_only=True))
    for sd in (1, -1):
        cy, ry = lerp(a0, a1, 0.5), (a1 - a0) / 2
        # the wings: smaller balls tucked against the tip's lower sides
        wing = ellipse(cy, sd * 0.054, ry, 0.030)
        crease = ellipse(cy, sd * 0.054, ry, 0.030, -100, 100) if sd > 0 else ellipse(cy, -0.054, ry, 0.030, 80, 280)
        out.append(Part("nostril", wing, sd, "head", in_union=False, layer="face", strokes=[(crease, "edge")], front_only=True))
    tip = ellipse(lerp(t0, t1, 0.5), 0.0, (t1 - t0) / 2, 0.042)
    out.append(Part("tip", tip, 0, "head", in_union=False, layer="face", strokes=[(ellipse(lerp(t0, t1, 0.5), 0.0, (t1 - t0) / 2, 0.040, 25, 155), "form")],
                    front_only=True))
    sept = dense([(s0, -0.009), (s0 - 0.003, 0.0), (s0, 0.009), (lerp(s0, s1, 0.6), 0.012), (s1, 0.008), (s1 + 0.002, 0.0), (s1, -0.008), (lerp(s0, s1, 0.6), -0.012)])[0]
    out.append(Part("septum", sept, 0, "head", in_union=False, layer="face", strokes=[(curve([(s1, -0.009), (s1 + 0.002, 0.0), (s1, 0.009)], 2), "edge")],
                    front_only=True))
    for sd in (1, -1):
        out.append(Part("nose_hole", ellipse(lerp(h0, h1, 0.5), sd * 0.030, (h1 - h0) / 2, 0.014), sd, "head", in_union=False, layer="face",
                        fill=LINE, opacity=0.85, front_only=True))
    return out


LIP_W = 0.115    # the corners of the mouth from the middle: about under the irises' inner edges
# The lip shapes: (the upper lip's fullness, the lower lip's, the corners from the middle). Heart: a full upper lip with a marked bow; thin:
# both lips slight; round: both full, the lower fuller, the mouth narrower.
LIP_TYPES = {"heart": (1.0, 1.0, LIP_W), "thin": (0.6, 0.65, 0.118), "round": (1.12, 1.25, 0.098)}


def lip_levels(L, kind="heart"):
    """The lips' top, the mouth's line, the lips' bottom and the corners for a lip shape; the same in every view."""
    fu, fl, w = LIP_TYPES[kind]
    m = L["mouth"]
    return m, m - (m - L["lip_top"]) * fu, m + (L["lip_bottom"] - m) * fl, w


def lips_front(L, sp, bow, kind="heart"):
    """From the front, as artists build the mouth: the upper lip's middle a shield, its top the cupid's bow (its peaks rise as its middle
    dips), its bottom the tubercle, a rounded point dipping into the mouth's line; the upper lip's sides wedges tapering to the corners. The
    lower lip fuller: its middle a pillow, its sides curving smoothly up to the corners. The philtrum's ridges run up to the septum; a dark
    nick marks each corner; a shadow lies under the lower lip."""
    m, ut, lb, W = lip_levels(L, kind)
    pk, dip = ut - 0.4 * bow, ut + 0.6 * bow
    s1 = nose_levels(L, sp)["septum"][1]
    kw = dict(rule="head", in_union=False, layer="face", fill=LIP, outline=0.4, front_only=True)
    bow_ = curve([(pk + 0.008, -0.042), (pk, -0.024), (lerp(pk, dip, 0.7), -0.008), (dip, 0.0), (lerp(pk, dip, 0.7), 0.008), (pk, 0.024), (pk + 0.008, 0.042)])
    tub = curve([(pk + 0.008, 0.042), (lerp(pk, m, 0.6), 0.040), (m - 0.003, 0.027), (m + 0.004, 0.010), (m + 0.006, 0.0), (m + 0.004, -0.010), (m - 0.003, -0.027),
                 (lerp(pk, m, 0.6), -0.040), (pk + 0.008, -0.042)])
    philtrum = [(curve([(pk - 0.002, sd * 0.022), (lerp(pk, s1, 0.5), sd * 0.017), (s1 + 0.004, sd * 0.012)], 2), "form") for sd in (1, -1)]
    pillow = dense([(m + 0.006, 0.0), (m + 0.003, 0.035), (lerp(m, lb, 0.35), 0.058), (lerp(m, lb, 0.8), 0.054), (lb, 0.022), (lb, -0.022), (lerp(m, lb, 0.8), -0.054),
                    (lerp(m, lb, 0.35), -0.058), (m + 0.003, -0.035)])[0]
    shadow = curve([(lb + 0.010, -0.026), (lb + 0.017, 0.0), (lb + 0.010, 0.026)], 3)
    out = [Part("lipU_c", bow_ + tub[1:-1], 0, strokes=philtrum, **kw), Part("lipL_c", pillow, 0, strokes=[(shadow, "form")], **kw)]
    corner = (m + 0.002, W)
    for sd in (1, -1):
        mm = (lambda q: q) if sd > 0 else mir
        up = curve([(pk + 0.006, 0.034), (lerp(ut, m, 0.45), 0.085), corner]) + curve([corner, (m - 0.002, 0.07), (m - 0.003, 0.034)])[1:]
        lo = curve([(m + 0.003, 0.038), (m + 0.002, 0.08), corner]) + curve([corner, (lerp(m, lb, 0.55), 0.092), (lb - 0.008, 0.045)])[1:]
        nick = curve([(m + 0.001, W - 0.006), (m + 0.007, W + 0.012)], 2)
        out.append(Part("lipU_s", mm(up), sd, strokes=[(mm(nick), "lash")], **kw))
        out.append(Part("lipL_s", mm(lo), sd, **kw))
    # the sides first, so the middles lie over them
    return [q for q in out if q.kind.endswith("_s")] + [q for q in out if q.kind.endswith("_c")]


OLIVE = "#4a4a0c"


def head_levels(L):
    """The heights of the head's parts, the same in every view: the cranium (the core) from the crown to behind the jaw; the upper jaw from
    the nose's root to the upper teeth; the mandible from the jaw's joint (in front of the ear) to the chin's underside; the chin; the teeth
    and the tongue inside the closed mouth."""
    m = L["mouth"]
    return dict(cranium=(0.0, 0.80), upperjaw=(0.44, m - 0.015), mandible=0.55, chin=0.86, browridge=(0.37, 0.46), cheekbone=(0.50, 0.62),
                forehead=(0.10, 0.385), temple=(0.16, 0.48), eyesocket=(0.435, 0.55), cheek=(0.58, 0.82),
                teeth_up=(m - 0.026, m + 0.003), teeth_low=(m - 0.003, m + 0.028), tongue=(m - 0.012, m + 0.036))


def head_front(L, head):
    """The head from the front (and the back), inside one outline: the cranium, its dome the top of the head and its lower half behind the
    face; the upper jaw (the cheekbones and the maxilla), from the eye sockets' floors and the nose's root down to the upper teeth; the
    mandible, from the jaw's joints round to the chin; the chin."""
    H = head_levels(L)
    R = curve(head)                         # the right half, from the crown down to the chin
    n = len(R) - 1
    END = (n - 1, R[n])
    kw = dict(side=0, rule="head", in_union=False, layer="head")

    def at(v):
        return cut(R, 0, n, v)
    t45, b68, m55 = at(0.45), at(0.68), at(H["mandible"])
    x45, x55 = t45[1][1], m55[1][1]
    rt = sub(R, (0, R[0]), t45)
    arc = curve([t45[1], (0.56, 0.955 * x45), (0.67, 0.815 * x45), (0.765, 0.47 * x45), (H["cranium"][1], 0.0)])
    cranium = rt + arc[1:] + mir(rev(arc))[1:] + mir(rev(rt))[1:-1]
    ub = H["upperjaw"][1]
    # the upper jaw: the muzzle, from the nose's root round the nose's base to the corners of the mouth and the upper teeth
    rim = curve([(H["upperjaw"][0], 0.0), (0.47, 0.045), (0.53, 0.075), (0.585, 0.11), (0.64, 0.17), (0.70, 0.205)])
    half = rim + curve([(0.70, 0.205), (ub - 0.006, 0.17), (ub, 0.0)])[1:]
    upperjaw = half + mir(rev(half))[1:-1]
    # the brow ridge: a band across the brow from temple to temple, over the eye sockets
    b0, b1 = H["browridge"]
    half = curve([(b0, 0.0), (b0 + 0.004, 0.12), (b0 + 0.015, 0.22), (b0 + 0.04, 0.29), (b1 - 0.012, 0.325)]) + \
        curve([(b1 - 0.012, 0.325), (b1, 0.29), (b1 - 0.012, 0.22), (b1 - 0.015, 0.12), (b1 - 0.02, 0.05), (b1 - 0.035, 0.0)])[1:]
    browridge = half + mir(rev(half))[1:-1]
    # the cheekbones: from under the eye out to the side of the face
    c0, c1 = at(H["cheekbone"][0]), at(H["cheekbone"][1])
    cheek = sub(R, c0, c1) + curve([c1[1], (0.60, 0.27), (0.565, 0.20), (0.535, 0.12)])[1:] + curve([(0.535, 0.12), (0.515, 0.22), (0.505, 0.29), c0[1]])[1:-1]
    tu = H["teeth_up"][0]
    top = curve([m55[1], (0.60, 0.85 * x55), (0.66, 0.66 * x55), (0.71, 0.45 * x55), (tu, 0.18 * x55), (tu, 0.0)])
    half = rev(top) + sub(R, m55, END)[1:]
    mandible = half + mir(rev(half))[1:-1]
    i0 = next(i for i, q in enumerate(R) if q[0] > H["chin"])
    c13 = cut(R, i0, n, 0.13, 1)
    lo = sub(R, c13, END)
    topc = curve([c13[1], (0.925, 0.105), (0.875, 0.055), (H["chin"], 0.0)])
    chin = lo + mir(rev(lo))[1:] + mir(topc)[1:] + rev(topc)[1:-1]
    bottom = max(y for y, x in head)
    # the forehead's front plane, between the temple lines, from the hairline down to the brow ridge
    f0, f1 = H["forehead"]
    half = [(f0, 0.0), (f0 + 0.004, 0.11), (f0 + 0.025, 0.19), (0.20, 0.228), (0.30, 0.245), (f1, 0.235), (f1, 0.11), (f1 - 0.005, 0.0)]
    forehead = dense(half + mir(rev(half))[1:-1])[0]
    # the temple: the forehead's side plane, from the temple line out to the side of the head, down to the cheekbone
    t0, t1 = at(H["temple"][0]), at(H["temple"][1])
    temple = sub(R, t0, t1) + curve([t1[1], (H["temple"][1], 0.29), (0.44, 0.27), (0.36, 0.25), (0.25, 0.233), (H["temple"][0] + 0.005, 0.215), t0[1]])[1:-1]
    # the eye socket round each eye, from under the brow ridge to the cheekbone
    e0, e1 = H["eyesocket"]
    socket = dense([(e0 + 0.005, 0.055), (e0, 0.15), (e0 + 0.01, 0.24), (0.475, 0.27), (0.525, 0.265), (e1, 0.20), (e1, 0.10), (0.53, 0.045), (0.485, 0.035)])[0]
    # the cheek: below the cheekbone, between the muzzle and the side of the jaw
    k0_, k1_ = H["cheek"]
    cheekp = dense([(k0_, 0.16), (k0_ + 0.015, 0.25), (0.62, 0.305), (0.70, 0.295), (0.79, 0.265), (k1_, 0.215), (0.79, 0.20), (0.72, 0.205), (0.65, 0.18),
                    (0.60, 0.15)])[0]
    fo = {**kw, "front_only": True}          # from the back only the cranium and the jaw show
    pair = (lambda kind, pts, span: [Part(kind, pts, span=span, **{**fo, "side": 1}), Part(kind, mir(pts), span=span, **{**fo, "side": -1})])
    return ([Part("head", cranium, span=H["cranium"], **kw), Part("forehead", forehead, span=H["forehead"], **fo)] + pair("temple", temple, H["temple"])
            + [Part("browridge", browridge, span=H["browridge"], **fo)] + pair("eyesocket", socket, H["eyesocket"]) + pair("cheekbone", cheek, H["cheekbone"])
            + pair("cheek", cheekp, H["cheek"]) + [Part("upperjaw", upperjaw, span=H["upperjaw"], **fo),
               Part("mandible", mandible, span=(H["mandible"], bottom), **kw), Part("chin", chin, span=(H["chin"], bottom), **fo)])


def head_side(L, sp, face, lower, dx, jowl):
    """The head from the side, inside the body's outline: the cranium round at the back (a circle through the crown and the forehead), down
    the forehead and the brow to the nose's root, its base behind the jaw down to the nape; the upper jaw from the nose's root to the upper
    teeth and back to the cheekbone's arch; the mandible from the lip down round the chin, back under the jaw to its angle and up the ramus
    to the joint in front of the ear; the chin; behind the lips the upper and lower teeth and the tongue (seen only here)."""
    H = head_levels(L)
    D, idx = dense(face + lower, closed=False)   # crown, forehead, brow, bridge, nose, undernose, lips, lips2, chin; under the jaw to the nape

    def at(a, b, v, axis=0):
        return cut(D, idx[a], idx[b], v, axis)
    (cry, crx), (fy, fx) = face[0], face[1]
    cyc = 0.40
    cx = ((cyc - fy) ** 2 + fx ** 2 - (cyc - cry) ** 2 - crx ** 2) / (2 * (fx - crx))
    r = math.hypot(cyc - cry, cx - crx)
    th_f, th_b = math.atan2(fx - cx, cyc - fy), -math.acos((cyc - 0.62) / r)
    arc = [(cyc - r * math.cos(t), cx + r * math.sin(t)) for t in (lerp(th_b, th_f, i / 28) for i in range(29))]
    p_br, p_ub, p_mt = at(2, 4, H["upperjaw"][0]), at(3, 8, H["upperjaw"][1]), at(3, 8, H["teeth_up"][0])
    base = curve([p_br[1], (0.49, 0.24 + dx), (0.58, 0.17 + dx), (0.68, 0.10 + dx), (0.765, 0.02 + dx), (0.80, -0.10 + dx), (0.80, -0.22 + dx),
                  (0.80, -0.315 + dx), (0.745, -0.352 + dx), arc[0]])
    cranium = arc + sub(D, (idx[1], D[idx[1]]), p_br)[1:] + base[1:-1]
    ub = H["upperjaw"][1]
    upperjaw = sub(D, p_br, p_ub) + curve([p_ub[1], (ub, 0.24 + dx), (ub - 0.008, 0.16 + dx), (0.67, 0.14 + dx), (0.58, 0.19 + dx), (0.49, 0.25 + dx),
                                           p_br[1]])[1:-1]
    b0, b1 = H["browridge"]
    p_r0, p_r1 = at(1, 3, b0), at(2, 4, 0.43)
    browridge = sub(D, p_r0, p_r1) + curve([p_r1[1], (0.452, 0.26 + dx), (b1, 0.19 + dx), (0.435, 0.135 + dx), (0.385, 0.16 + dx), (0.372, 0.25 + dx),
                                           p_r0[1]])[1:-1]
    # the forehead's front plane, seen edge-on along the profile; the temple behind it; the eye socket round the eye; the cheek below the
    # cheekbone
    f0, f1 = H["forehead"]
    xa = cx + math.sqrt(max(r * r - (cyc - f0) ** 2, 0.0))
    p_f1 = at(1, 3, f1)
    forehead = [(f0, xa)] + sub(D, (idx[1], D[idx[1]]), p_f1) + curve([p_f1[1], (f1, p_f1[1][1] - 0.10), (0.25, 0.17 + dx), (0.13, 0.15 + dx), (f0, xa - 0.10)])[1:]
    t0, t1 = H["temple"]
    temple = dense([(t0, 0.16 + dx), (t0 + 0.03, 0.05 + dx), (0.30, 0.0 + dx), (0.42, 0.0 + dx), (t1, 0.04 + dx), (t1, 0.12 + dx), (0.45, 0.19 + dx), (0.36, 0.20 + dx),
                    (0.25, 0.18 + dx)])[0]
    dxe = sp["bridge"][1] - 0.31
    e0, e1 = H["eyesocket"]
    socket = dense([(e0 + 0.005, 0.20 + dxe), (e0, 0.27 + dxe), (e0 + 0.012, 0.32 + dxe), (0.49, 0.335 + dxe), (0.535, 0.325 + dxe), (e1, 0.27 + dxe), (e1 - 0.005, 0.20 + dxe),
                    (0.50, 0.185 + dxe)])[0]
    c0_, c1_ = H["cheek"]
    cheekp = dense([(c0_, 0.20 + dx), (0.60, 0.10 + dx), (0.62, 0.04 + dx), (0.70, 0.03 + dx), (0.80, 0.06 + dx), (c1_, 0.13 + dx), (0.80, 0.21 + dx), (0.72, 0.22 + dx),
                    (0.64, 0.21 + dx)])[0]
    k0_, k1_ = H["cheekbone"]
    cheek = dense([(k0_ + 0.02, 0.25 + dx), (k0_, 0.15 + dx), (0.53, 0.07 + dx), (0.545, 0.035 + dx), (0.585, 0.03 + dx), (k1_, 0.10 + dx), (k1_ - 0.005, 0.20 + dx),
                   (0.59, 0.26 + dx)])[0]
    g = at(9, 13, -0.06 + dx, 1)            # the jaw's angle, under the ear's lobe
    tm = H["mandible"]
    ramus = curve([g[1], (0.79, -0.04 + dx), (0.67, 0.0 + dx), (tm, 0.02 + dx)])
    top = curve([(tm, 0.02 + dx), (0.585, 0.07 + dx), (0.64, 0.11 + dx), (0.70, 0.17 + dx), (p_mt[1][0], 0.25 + dx), p_mt[1]])
    mandible = sub(D, p_mt, g) + ramus[1:] + top[1:-1]
    p_c, c2 = at(7, 9, H["chin"]), at(9, 11, 0.12 + dx + 0.04 * jowl, 1)
    chin = sub(D, p_c, c2) + curve([c2[1], (0.955, 0.16 + dx), (0.90, 0.20 + dx), p_c[1]])[1:-1]
    bottom = max(y for y, x in face + lower)
    l1x, l2x = sp["lips"][1], sp["lips2"][1]

    def slab(y0, y1, x0, x1, rr=0.008):
        return dense([(y0, x0 + rr), (y0, x1 - rr), (y0 + rr * 0.7, x1), (y1 - rr * 0.7, x1), (y1, x1 - rr), (y1, x0 + rr), (y1 - rr * 0.7, x0),
                      (y0 + rr * 0.7, x0)])[0]
    g0, g1 = H["tongue"]
    tongue = dense([(g0 + 0.012, l2x - 0.055), (g0, 0.20 + dx), (g0 + 0.004, 0.08 + dx), (g1 - 0.006, 0.04 + dx), (g1, 0.14 + dx), (g1 - 0.012, l2x - 0.06)])[0]
    mouth = dict(rule="head", in_union=False, layer="mouth")
    return [Part("head", cranium, rule="head", span=H["cranium"]), Part("forehead", forehead, rule="head", span=H["forehead"], lat=("low", 0.235) + H["forehead"]),
            Part("temple", temple, rule="head", span=H["temple"], lat=0.30), Part("eyesocket", socket, rule="head", span=H["eyesocket"], lat=0.15),
            Part("cheek", cheekp, rule="head", span=H["cheek"], lat=0.25),
            Part("browridge", browridge, rule="head", span=H["browridge"], lat=("low", 0.29) + H["browridge"]),
            Part("cheekbone", cheek, rule="head", span=H["cheekbone"], lat=0.30), Part("upperjaw", upperjaw, rule="head", span=H["upperjaw"]),
            Part("mandible", mandible, rule="head", span=(tm, bottom), lat="tmj"), Part("chin", chin, rule="head", span=(H["chin"], bottom)),
            Part("teeth_up", slab(*H["teeth_up"], 0.12 + dx, l1x - 0.062), span=H["teeth_up"], **mouth),
            Part("teeth_low", slab(*H["teeth_low"], 0.12 + dx, l2x - 0.045), span=H["teeth_low"], **mouth),
            Part("tongue", tongue, span=H["tongue"], **mouth)]


def face_front(body, L, head, bow=None, lips="heart"):
    """The head, its ears behind it, and the face on it: brows, eyes (white, iris), the nose's seven shapes, the lips' six."""
    out = []
    sp = by_name(body["side"])
    for sd in (1, -1):
        out += ear_front(L, sd)
    out += head_front(L, head)
    e = L["eye"]
    eye = [(e + 0.007, 0.068), (e - 0.025, 0.09), (e - 0.037, 0.135), (e - 0.027, 0.18), (e, 0.215), (e + 0.017, 0.19), (e + 0.027, 0.145), (e + 0.02, 0.10)]
    y0, y1 = L["brow"]
    thick = 0.006 if body["sex"] == "m" else 0.0
    brow = [(y1 - 0.005 + thick, 0.062), (y0 + 0.012, 0.10), (y0, 0.16), (y0 + 0.015, 0.215), (y0 + 0.035, 0.245), (y0 + 0.03 + thick, 0.21),
            (y0 + 0.024 + thick, 0.16), (y0 + 0.032 + thick, 0.11), (y1 + thick, 0.07)]
    for sd in (1, -1):
        out += eye_front(L, sd)
    for sd in (1, -1):
        mm = (lambda pts: pts) if sd > 0 else mir
        out.append(Part("brow", mm(dense(brow)[0]), sd, "head", in_union=False, layer="face", fill=LINE, opacity=0.75, front_only=True))
    out += nose_front(L, sp)
    out += lips_front(L, sp, BOWS["soft"] if bow is None else bow, lips)
    return out


# ---------------- the side ----------------
BREAST_NAMES = ("upperchest", "breastup", "chest", "lowchest", "fold")


def nose_side(L, sp):
    """From the side: the bridge, the tip and the septum make the profile; the near nostril and its hole lie on the side of the tip."""
    N = nose_levels(L, sp)
    (b0, b1), (t0, t1), (a0, a1), (s0, s1), (h0, h1) = N["bridge"], N["tip"], N["nostril"], N["septum"], N["hole"]
    br, no, un = sp["bridge"], sp["nose"], sp["undernose"]
    bridge = dense([(b0, br[1] - 0.005), (lerp(b0, b1, 0.5), lerp(br[1], no[1], 0.5)), (b1, no[1] - 0.004), (b1 + 0.01, no[1] - 0.05), (b1, br[1] + 0.0),
                    (b0 + 0.01, br[1] - 0.035)])[0]
    tip = ellipse(lerp(t0, t1, 0.5), no[1] - 0.032, (t1 - t0) / 2, 0.036)
    cy, ry = lerp(a0, a1, 0.55), (a1 - a0) / 2
    wing = ellipse(cy, no[1] - 0.085, ry, 0.036)
    groove = ellipse(cy, no[1] - 0.085, ry, 0.036, 95, 265)
    sept = dense([(s0, no[1] - 0.02), (lerp(s0, s1, 0.5), no[1] - 0.03), (s1, un[1] + 0.02), (s1 + 0.002, un[1] - 0.005), (s1 - 0.01, un[1] - 0.02),
                  (s0 + 0.01, no[1] - 0.06)])[0]
    hole = ellipse(lerp(h0, h1, 0.5), no[1] - 0.075, (h1 - h0) / 2, 0.022)
    c0, c1 = N["cartilage"]
    cart = dense([(c0, no[1] - 0.075), (lerp(c0, c1, 0.6), no[1] - 0.045), (c1, no[1] - 0.052), (c1 + 0.004, no[1] - 0.105), (lerp(c0, c1, 0.5), no[1] - 0.098)])[0]
    edge_c = curve([(c0 + 0.004, no[1] - 0.074), (lerp(c0, c1, 0.6), no[1] - 0.048), (c1 - 0.003, no[1] - 0.054)], 2)
    return [Part("bridge", bridge, rule="head", layer="face"), Part("cartilage", cart, rule="head", layer="face", strokes=[(edge_c, "form")], lat=0.04),
            Part("nostril", wing, rule="head", layer="face", strokes=[(groove, "edge")], lat=0.06),
            Part("tip", tip, rule="head", layer="face"), Part("septum", sept, rule="head", layer="face"),
            Part("nose_hole", hole, rule="head", in_union=False, layer="face", fill=LINE, opacity=0.85, lat=0.03)]


def lips_side(L, sp, bow, kind="heart"):
    """From the side: each lip's middle in front, its near side behind running back to the corner of the mouth. A thin lip stands out
    less, a full one more."""
    m, ut, lb, _ = lip_levels(L, kind)
    fu, fl, _ = LIP_TYPES[kind]
    pk = ut - 0.4 * bow
    l1, l2 = sp["lips"], sp["lips2"]
    l1 = (m - (m - l1[0]) * fu, l1[1] - 0.025 * (1 - fu))
    l2 = (m + (l2[0] - m) * fl, l2[1] + 0.015 * (fl - 1))
    # each lip's middle a rounded pillow in profile, forming the profile at the mouth; the upper lip about 4 mm ahead of the lower
    x1 = l1[1]
    up_c = [(pk, x1 - 0.010), (lerp(pk, l1[0], 0.6), x1 - 0.002), (l1[0] + 0.008, x1), (lerp(l1[0], m, 0.6), x1 - 0.008), (m - 0.003, x1 - 0.020),
            (m + 0.001, x1 - 0.032), (m - 0.006, x1 - 0.042), (pk + 0.012, x1 - 0.036)]
    corner = (m + 0.004, l1[1] - 0.085)      # the corner of the mouth: the near upper and lower lips both end in it
    up_s = curve([(pk + 0.01, l1[1] - 0.028), (lerp(pk, m, 0.5), l1[1] - 0.056), corner]) + curve([corner, (m, lerp(corner[1], l1[1] - 0.028, 0.5)), (m - 0.002, l1[1] - 0.028)])[1:]
    x2 = x1 - 0.018
    lo_c = [(m + 0.002, x1 - 0.024), (lerp(m, l2[0], 0.4), x2 - 0.004), (l2[0], x2), (lerp(l2[0], lb, 0.55), x2 - 0.010), (lb, x2 - 0.030),
            (lb - 0.006, x2 - 0.046), (m + 0.006, x1 - 0.040)]
    lo_s = curve([(m + 0.004, l2[1] - 0.02), (m + 0.005, lerp(l2[1] - 0.02, corner[1], 0.5)), corner]) + curve([corner, (lerp(m, lb, 0.6), lerp(corner[1], l2[1] - 0.03, 0.55)), (lb - 0.008, l2[1] - 0.03)])[1:]
    kw = dict(rule="head", in_union=False, layer="face", fill=LIP, outline=0.4)
    return [Part("lipU_s", up_s, lat=0.06, **kw), Part("lipL_s", lo_s, lat=0.06, **kw),
            Part("lipU_c", dense(up_c)[0], **kw), Part("lipL_c", dense(lo_c)[0], **kw)]


def side_table(body, bow=None, lips="heart"):
    """The side view's parts (the near arm last), and what the tiptoe inset needs."""
    L = levels(body)
    k = body["k"]
    head, pts = split_side(body)
    names = ["n0"] + [n for n, y, x in body["side"] if n not in SIDE_HEAD_NAMES and n not in SIDE_HEAD_BACK and n not in ("underchin", "occ2")] + ["nlast"]
    assert len(names) == len(pts)
    P = dict(zip(names, pts))
    sp = by_name(body["side"])
    fem = body["sex"] == "f"
    D, idx = dense(pts)
    ix = {n: idx[i] for i, n in enumerate(names)}

    # the ribcage under the breast (or pectoral): from the notch to where the breast ends, inside the outline; below that the outline is the ribs
    ce = cut(D, ix["notch"], ix["belly"], L["breast_bottom"])
    yn, xn = P["notch"]
    ye, xe = ce[1]

    def orig_x(y):
        return cut(D, ix["notch"], ix["belly"], y)[1][1]

    def rib(y):
        t = (y - yn) / (ye - yn)
        return min(xn + (xe - xn) * (1 - (1 - t) ** 2.2), orig_x(y) - 0.012)
    pts_rib = [(y, rib(y)) if (n in BREAST_NAMES and y < ye) else (y, x) for n, (y, x) in zip(names, pts)]
    Dr, idr = dense(pts_rib)
    ixr = {n: idr[i] for i, n in enumerate(names)}

    def cuts(DD, II):
        def c(a, b, v, axis=0):
            return cut(DD, II[a], II[b], v, axis)
        return c
    c, cr = cuts(D, ix), cuts(Dr, ixr)

    def ring(DD, front_a, front_b, back_a, back_b, down, up):
        """A part between two cuts: down the front, across the bottom join, up the back, across the top join. down/up: a height for a vcap,
        or a (toward, depth) pair for a cap (None for a half circle on the joint)."""
        fr, bk = sub(DD, front_a, front_b), sub(DD, back_a, back_b)

        def join(a, b, how):
            return vcap(a, b, how) if isinstance(how, float) else cap(a, b, how[0], how[1])
        return fr + join(fr[-1], bk[0], down) + bk + join(bk[-1], fr[0], up)

    parts = []
    neck_ft, neck_fb = c("n0", "throat", 0.88), c("throat", "upperchest", L["neck_base"])
    neck_bb, neck_bt = c("upperback", "neckback", L["neck_base"]), c("neckback", "nlast", 0.82)
    parts.append(Part("neck", ring(D, neck_ft, neck_fb, neck_bb, neck_bt, L["neck_base_cap"], L["neck_cap"])))
    chest_ft, waist_fr = cr("n0", "notch", L["chest_top"]), cr("ribsf", "lowbelly", L["waist"])
    waist_br, chest_bt = cr("sacrum", "midback", L["waist"]), cr("upperback", "neckback", L["chest_top"])
    parts.append(Part("chest", ring(Dr, chest_ft, waist_fr, waist_br, chest_bt, L["waist_down"], L["chest_cap"])))
    bt = c("notch", "chest", L["breast_top"])
    front = sub(D, bt, ce)
    back = [(y, rib(y) - 0.025) for y in (lerp(ye - 0.03, bt[1][0] + 0.01, i / 7) for i in range(8))]
    parts.append(Part("breast" if fem else "pec", front + back, lat=0.36, span=(L["breast_top"], L["breast_bottom"])))
    waist_f, waist_b = c("ribsf", "lowbelly", L["waist"]), c("sacrum", "midback", L["waist"])
    hip_f, hip_b = c("lowbelly", "quad", L["crotch"]), c("thighback", "glutelow", L["glute"])
    knee_f, knee_b = c("abovepat", "shinf", L["knee"]), c("calfback", "ham", L["knee"])
    at_f, at_b = c("shin2", "foottop", L["ankle_top"]), c("heel", "calfback", L["ankle_top"])
    Y = (lambda y: y if y <= 1.2 else 1.2 + (y - 1.2) * k)

    def ribx(y):
        return rib(y) if y < ye else orig_x(y) - 0.012
    # the clavicle and traps: from the back of the neck down the upper back, and from the notch along the clavicle to the shoulder
    tb0, tb1 = c("lumbar", "neckback", L["traps_bottom"]), c("upperback", "neckback", L["neck_base"])
    tf0, tf1 = c("throat", "upperchest", L["neck_base"]), c("throat", "upperchest", P["notch"][0])
    inner = curve([tf1[1], (Y(1.44), 0.10), (Y(1.50), -0.10), (Y(1.62), -0.28), (Y(2.10), -0.38), tb0[1]])
    parts.append(Part("traps", sub(D, tb0, tb1) + vcap(tb1[1], tf0[1], L["neck_base"] - 0.10) + sub(D, tf0, tf1) + inner[1:-1], layer="mass",
                      strokes=[(inner, "form")], lat=("taper", by_name(body["front"])["neck"][1] + 0.03, L["neck_base"] - 0.10, L["traps_bottom"])))
    # the near shoulder blade: on the upper back, behind the arm
    sb0, sb1 = c("midback", "upperback", L["scap_bottom"]), c("scapula", "upperback", L["scap_top"])
    xs = c("midback", "upperback", Y(1.95))[1][1]
    inner = curve([sb1[1], (L["scap_top"] + 0.06, sb1[1][1] + 0.14), (Y(1.95), xs + 0.17), (L["scap_bottom"] - 0.05, sb0[1][1] + 0.08), sb0[1]])
    parts.append(Part("scapula", sub(D, sb0, sb1) + inner[1:-1], layer="mass", lat=0.45, span=(L["scap_top"], L["scap_bottom"])))
    # the near ribcage half: the back from the shoulder blade down, the front under the breast; its lower edge the costal margin
    rb0, rb1 = c("lumbar", "upperback", L["rib_bottom"]), c("midback", "upperback", Y(1.75))
    margin = curve([(Y(2.70), ribx(Y(2.70))), (L["rib_bottom"] - 0.005, 0.05), rb0[1]])
    front_edge = curve([rb1[1], (L["rib_top"], -0.25), (L["rib_top"], 0.12), (Y(1.95), ribx(Y(1.95))), (Y(2.40), ribx(Y(2.40)))] + margin)
    parts.append(Part("ribcage", sub(D, rb0, rb1) + front_edge[1:-1], layer="mass", strokes=[(margin, "form")], lat=0.55, span=(L["rib_top"], L["rib_bottom"])))
    # the upper abdomen, from under the chest to the navel
    ya0 = max(L["breast_bottom"] + 0.02, L["ab_top"])
    a0, a1 = c("lowchest", "lowbelly", ya0), c("ribsf", "lowbelly", L["ab_bottom"])
    inner = curve([a1[1], (L["ab_bottom"], a1[1][1] - 0.12), (Y(2.75), ribx(Y(2.75)) - 0.10), (L["ab_top"], ribx(L["ab_top"]) - 0.10)])
    lead = [(L["ab_top"], ribx(L["ab_top"]))] if ya0 > L["ab_top"] + 0.01 else []    # its top under the breast
    parts.append(Part("abdomen", lead + sub(D, a0, a1) + inner[1:], layer="mass", strokes=[(inner, "form")], span=(L["ab_top"], L["ab_bottom"])))
    # the pelvis core: in the one-leg stance its lateral place follows it down to the free leg's side, so its bottom hangs as low as the front's
    parts.append(Part("pelvis", ring(D, waist_f, hip_f, hip_b, waist_b, L["glute"] + 0.0, L["waist_up"]), lat="pelvis"))
    # the lower abdomen, from under the navel down to the pubis
    lt, lb_ = L["lowab_top"], L["lowab_bottom"]
    la0, la1 = c("belly", "pubis", lt), c("lowbelly", "quad1", lb_)
    xm = c("belly", "pubis", Y(3.50))[1][1]
    inner = curve([la1[1], (lb_ - 0.03, la1[1][1] - 0.10), (Y(3.50), xm - 0.16), (lt + 0.04, la0[1][1] - 0.12), la0[1]])
    parts.append(Part("lowab", sub(D, la0, la1) + inner[1:-1], layer="mass", strokes=[(inner, "form")], span=(lt, lb_)))
    # the near hip, on the side of the pelvis; the near buttock, from the lower back's hollow to its fold
    ht_, hb_ = L["hip_top"], L["hip_bottom"]
    hp = [(lerp(ht_, hb_, t), x) for t, x in ((0.0, -0.08), (0.05, 0.12), (0.42, 0.21), (0.85, 0.12), (1.0, -0.06), (0.85, -0.28), (0.42, -0.34), (0.06, -0.26))]
    parts.append(Part("hip", dense(hp)[0], layer="mass", strokes=[(curve(hp[:5]), "form")], lat=0.60))
    bt0, bt1 = c("thighback", "glutelow", L["glute"]), c("gluteup", "lumbar", L["buttock_top"])
    inner = curve([bt1[1], (L["buttock_top"] + 0.06, -0.30), (Y(3.85), -0.18), (Y(4.15), -0.22), bt0[1]])
    parts.append(Part("buttock", sub(D, bt0, bt1) + inner[1:-1], layer="mass", strokes=[(inner[len(inner) // 2:], "form")], lat=0.30))
    parts.append(Part("thigh", ring(D, hip_f, knee_f, knee_b, hip_b, L["knee"] + L["knee_r"], L["thigh_cap"]), rule="leg"))
    parts.append(Part("shin", ring(D, knee_f, at_f, at_b, knee_b, L["ankle_top"] + L["ankle_r"], L["knee"] - L["knee_r"]), rule="leg"))
    # the foot: the ankle under the shin, the heel (the back, down to the floor), the plantar (instep to the ball), the toes (the ball to the tip)
    d_in = c("ankf", "toes", L["instep"])
    hb, ht = c("heel", "calfb", L["instep"]), c("heel", "calfb", L["heel_top"])
    # the ankle: a circle at the joint, as wide as the ankle there; the shin ends in its lower half, the heel and plantar meet its upper half
    ya, ra = L["ankle_top"], L["ankle_r"]
    cxa, rxa = (at_f[1][1] + at_b[1][1]) / 2, (at_f[1][1] - at_b[1][1]) / 2
    ankle = ellipse(ya, cxa, ra, rxa, n=24)
    d_toe = c("foottop", "toetip", L["toe"])
    s_ball = c("toetip", "heelsole", P["ball"][1], 1)
    s_heel = c("ball", "heelsole", lerp(P["heel"][1], P["toetip"][1], 0.25), 1)   # the heel: the back quarter of the foot
    hf = (L["heel_top"] + 0.04 * k, 0.14)
    split = [(lerp(ya, s_heel[1][0], t / 6), lerp(cxa, s_heel[1][1], t / 6)) for t in range(7)]   # between the heel and the plantar: straight
    # the heel, the plantar and the shin all meet at the ankle's centre (the pivot); below the circle the heel laps a little over the plantar,
    # so no seam shows between them
    heel = sub(D, s_heel, at_b) + ellipse(ya, cxa, ra, rxa, 180, 270)[1:] + [(y, x + 0.012 * min(1.0, (y - ya) / ra)) for y, x in split[:-1]]
    plantar = sub(D, at_f, d_toe) + cap(d_toe[1], s_ball[1], (7.45, 0.9), 0.025) + sub(D, s_ball, s_heel) + rev(split)[1:] + ellipse(ya, cxa, ra, rxa, 270, 360)[:-1]
    toes = sub(D, d_toe, s_ball) + vcap(s_ball[1], d_toe[1], L["toe"] - L["toe_r"])
    # the ankle turns with the shin; the foot hangs from its centre
    parts += [Part("ankle", ankle, rule="leg"), Part("heel", heel, rule="foot", span=(ya - ra, L["sole"])), Part("plantar", plantar, rule="foot", span=(ya - ra, L["sole"])),
              Part("toes", toes, rule="foot")]
    # the head with the nose and lips as their own shapes, and the jaw running back under the ear into the base of the skull
    jowl, sag = body.get("jowl", 0.0), body.get("sag", 0.0)
    dx = sp["occiput"][1] + 0.42
    br, no, un, l1, l2 = sp["bridge"], sp["nose"], sp["undernose"], sp["lips"], sp["lips2"]
    face = [(y, x) for y, x in head[:len(SIDE_HEAD_NAMES)]]
    face[4] = (no[0], br[1] + 0.03)
    face[6] = (L["lip_top"], l1[1] - 0.030)     # the face's profile set back at the mouth: the lips make the profile there
    face[7] = (l2[0], l2[1] - 0.04)
    lower = [(1.012 + 0.03 * jowl, 0.22 + dx + 0.05 * jowl), (0.985 + 0.04 * jowl + 0.03 * sag, 0.07 + dx + 0.04 * jowl),
             (0.90 + 0.03 * sag, -0.05 + dx + 0.02 * jowl), (0.84 + 0.01 * sag, -0.17 + dx), (0.80, -0.27 + dx), (0.74, -0.355 + dx)]
    parts += head_side(L, sp, face, lower, dx, jowl)
    jaw = curve([face[-1]] + lower[:5])
    parts += nose_side(L, sp)
    parts += lips_side(L, sp, BOWS["soft"] if bow is None else bow, lips)
    dxe = br[1] - 0.31
    e = L["eye"]
    parts += eye_side(L, dxe)
    y0, y1 = L["brow"]
    th = 0.006 if body["sex"] == "m" else 0.0
    brow = [(y1 + th, 0.235 + dxe), (y0 + 0.006, 0.265 + dxe), (y0, 0.30 + dxe), (y0 + 0.012, 0.318 + dxe), (y0 + 0.028 + th, 0.30 + dxe), (y0 + 0.03 + th, 0.265 + dxe)]
    parts.append(Part("brow", dense(brow)[0], rule="head", in_union=False, layer="face", fill=LINE, opacity=0.75, lat=0.15))
    parts += ear_side(L, dx)
    # the near arm
    parts += arm_table(*side_arm(body), 0, "side_arm", HAND_SIDE, "side")
    # for the tiptoe inset: a stub of the shin, the foot's parts, the joints' centres
    st_f, st_b = c("shinf", "ankf", L["ankle_top"] - 0.45 * k), c("achilles", "calfback", L["ankle_top"] - 0.45 * k)
    stub = sub(D, st_f, at_f) + vcap(at_f[1], at_b[1], L["ankle_top"] + L["ankle_r"]) + sub(D, at_b, st_b)
    joints = dict(knee=((knee_f[1][0] + knee_b[1][0]) / 2, (knee_f[1][1] + knee_b[1][1]) / 2),
                  ankle=((at_f[1][0] + at_b[1][0]) / 2, (at_f[1][1] + at_b[1][1]) / 2),
                  hinge=(ya, cxa))   # the ankle's centre, where the foot turns
    inset = dict(joints=joints, stub=stub, ankle_seg=ankle, heel=heel, plantar=plantar, toes=toes, ankle_span=(L["ankle_top"], L["instep"]),
                 seam_x=max(d_toe[1][1], s_ball[1][1]),
                 ankle=((at_f[1][0] + at_b[1][0]) / 2, (at_f[1][1] + at_b[1][1]) / 2),
                 mtp=((d_toe[1][0] + s_ball[1][0]) / 2, (d_toe[1][1] + s_ball[1][1]) / 2), sole=L["sole"])
    return parts, jaw, inset


def side_arm(body):
    arm_f = MAN_SIDE_ARM_F if body["sex"] == "m" else [(s, w * 0.88) for s, w in MAN_SIDE_ARM_F]
    arm_b = MAN_SIDE_ARM_B if body["sex"] == "m" else [(s, w * 0.88) for s, w in MAN_SIDE_ARM_B]
    if body is BODIES["heavyman"] or body is BODIES["heavywoman"]:
        arm_f, arm_b = [(s, w * 1.25) for s, w in arm_f], [(s, w * 1.3) for s, w in arm_b]
    if body is BODIES["athletic"]:
        arm_f, arm_b = [(s, w * 1.15) for s, w in arm_f], [(s, w * 1.15) for s, w in arm_b]
    return [(-0.22, 0.0)] + list(arm_f[1:]), arm_b


# ---------------- into a view ----------------
# Every part goes through the same smooth mapping (the figure's skin weights), so parts agree wherever they overlap: in a pose the torso's
# rule fades into each leg's across the hip; the arm's upper and lower frames blend across the elbow.
def _n(v):
    t = f"{v:.1f}"
    if t.endswith(".0"):
        t = t[:-2]
    if t.startswith("0."):
        t = t[1:]
    elif t.startswith("-0."):
        t = "-" + t[2:]
    return "0" if t in ("-0", "") else t


def open_poly(pts):
    """A polyline as a short path: one move, then relative steps (rounded so the steps never drift)."""
    px, py = round(pts[0][0], 1), round(pts[0][1], 1)
    out = [f"M{_n(px)} {_n(py)}l"]
    first = True
    for x, y in pts[1:]:
        rx, ry = round(x, 1), round(y, 1)
        for v in (rx - px, ry - py):
            t = _n(v)
            out.append(t if (first or t.startswith("-")) else " " + t)
            first = False
        px, py = rx, ry
    return "".join(out)


def poly(pts):
    return open_poly(pts) + "z"


def _leg(P, y, x, side):
    if side < 0:
        yy, xx = P._rot(y, x, P.hipL0[0], P.hipL0[1], P.psi_s)
        return yy + P.hipL[0] - P.hipL0[0], xx + P.hipL[1] - P.hipL0[1]
    return P._free(y, x)


def posed_xy(pv, y, x, side=0):
    """A torso or leg point in the posed figure, still in head units. `side` names a leg part's leg; a torso point near the midline keeps
    the torso's rule."""
    if not pv.pose:
        return y, x
    P = pv.pose
    ty, tx = P.torso(y, x)
    wt = smoothstep((y - P.Y(3.70)) / (P.Y(4.20) - P.Y(3.70)))
    if not side:
        wt *= smoothstep((abs(x) - 0.08) / 0.22)
    if wt > 0:
        ly, lx = _leg(P, y, x, side or (1 if x > 0 else -1))
        ty, tx = lerp(ty, ly, wt), lerp(tx, lx, wt)
    return ty + P.dy, tx


def to_view(pv, y, x):
    return pv.v.pt(y, -x if pv.flip else x)


def arm_frame(body):
    """The arm's line: for s along it, how far it hangs below the shoulder and how far out it reaches. The upper arm's line blends into the
    forearm's across the elbow. Widths are laid across horizontally, so a point's height depends only on s: every view hangs the arm to the
    same heights."""
    k = body["k"]
    a, ac = math.radians(9), math.radians(9 + body["carry"])
    es, band = 1.38 * k, 0.14 * k

    def at(s_):
        s_ *= k
        bl = smoothstep((s_ - es + band) / (2 * band))
        return (lerp(math.cos(a) * s_, es * math.cos(a) + (s_ - es) * math.cos(ac), bl),
                lerp(math.sin(a) * s_, es * math.sin(a) + (s_ - es) * math.sin(ac), bl))
    return at


def arm_placer(body, pv, side):
    """Places an arm point (s, w) in the front (or back) view, carried with the shoulder in a pose."""
    py, px = body["pivot"]
    at = arm_frame(body)
    dx = dy = 0.0
    if pv.pose:
        ny, nx = pv.pose.T(py, side * px)
        dx, dy = nx - side * px, ny - py

    def place(s_, w):
        drop, out = at(s_)
        X = side * (px + out + w) + dx
        return pv.v.pt(py + drop + dy, -X if pv.flip else X)
    return place


class Mapped:
    """A part in a view: its path, edges and dots in pixels."""

    def __init__(self, part, d, strokes, dots):
        self.p, self.d, self.strokes, self.dots = part, d, strokes, dots


def front_model(body, pv, bow=None, lips="heart"):
    """The front's (or, mirrored, the back's) parts in the view, in drawing order, and the lines where the legs touch."""
    parts, inner, kneein_x = front_table(body, bow, lips)
    parts = [p for p in parts if not (p.front_only if pv.flip else p.back_only)]
    L = levels(body)
    # the contact line between the legs: from the crotch to the middle of the knees, through the pose
    C = posed_xy(pv, L["crotch"], 0.0)
    kr, kl = posed_xy(pv, L["knee"], kneein_x, 1), posed_xy(pv, L["knee"], -kneein_x, -1)
    K = ((kr[0] + kl[0]) / 2, (kr[1] + kl[1]) / 2)
    slope = (K[1] - C[1]) / (K[0] - C[0])
    eps = 0.022

    def leg_xy(y, x, side):
        Y, X = posed_xy(pv, y, x, side)
        cx = C[1] + (Y - C[0]) * slope
        return Y, cx + side * smax(side * (X - cx), eps)
    places = {s: arm_placer(body, pv, s) for s in (1, -1)}

    def mapper(p):
        if p.rule == "arm":
            return lambda y, x: places[p.side](y, x)
        if p.rule == "head":
            return lambda y, x: pv.pt(y, x, "head")
        if p.rule == "leg":
            return lambda y, x: to_view(pv, *leg_xy(y, x, p.side))
        return lambda y, x: to_view(pv, *posed_xy(pv, y, x, 0))
    out = []
    for p in parts:
        mp = mapper(p)
        strokes = [] if (pv.flip and p.stroke_front_only) else [st for st in p.strokes if len(st) < 3 or st[2] == ("back" if pv.flip else "front")]
        out.append(Mapped(p, poly([mp(y, x) for y, x in p.pts]), [(open_poly([mp(y, x) for y, x in st[0]]), st[1]) for st in strokes],
                          [(mp(y, x), ry * pv.u, rx * pv.u, fill) for y, x, ry, rx, fill in p.dots]))
    # where the thighs (and, on heavier legs, the knees) press together: a line down the middle of the contact
    edges = {}
    for s in (1, -1):
        pts = sorted(leg_xy(y, s * x, s) for y, x in inner)
        edges[s] = pts
    contact, run = [], []

    def x_at(pts, y):
        for (y0, x0), (y1, x1) in zip(pts, pts[1:]):
            if y0 <= y <= y1:
                return x0 + (x1 - x0) * (y - y0) / max(y1 - y0, 1e-9)
        return None
    y = C[0]
    y_end = min(edges[1][-1][0], edges[-1][-1][0])
    while y <= y_end:
        xr, xl = x_at(edges[1], y), x_at(edges[-1], y)
        if xr is not None and xl is not None and xr - xl < 2.4 / pv.u:
            run.append(to_view(pv, y, (xr + xl) / 2))
        elif run:
            contact.append(run)
            run = []
        y += 0.02
    if run:
        contact.append(run)
    return out, [r for r in contact if len(r) > 1]


def side_pose(body, pv, joints):
    """Maps a side-view point (y, x) of a part (by its rule and lateral place) into the front view's pose, or None when standing evenly.
    Heights come from the front's pose. The near leg (the figure's left, the free one) bends forward at the knee by just enough to keep
    its knee and its ankle at the front's heights; its foot stays flat. The far leg (the supporting one) stays straight."""
    P = pv.pose
    if not P:
        return None
    py, px = body["pivot"]
    sh = P.T(py, px)[0] - py
    fp = by_name(body["front"])
    ank = ((fp["malout"][0] + fp["malin"][0]) / 2, (fp["malout"][1] + fp["malin"][1]) / 2)
    hip2, knee2 = P.hipR[0] + P.dy, P.kneeR[0] + P.dy
    ankle2 = P._free(*ank)[0] + P.dy
    Hy, Ky, Ay = P.hipR0[0], P.kneeR0[0], ank[0]
    (_, Kx), (_, Ax) = joints["knee"], joints["ankle"]
    Hx = Kx
    alpha = math.acos(max(-1.0, min(1.0, (knee2 - hip2) / (Ky - Hy))))
    beta = math.acos(max(-1.0, min(1.0, (ankle2 - knee2) / (Ay - Ky))))

    def rot(y, x, cy, cx, a):
        X, Yy = x - cx, y - cy
        return (cy - X * math.sin(a) + Yy * math.cos(a), cx + X * math.cos(a) + Yy * math.sin(a))

    def thigh(y, x):
        yy, xx = rot(y, x, Hy, Hx, alpha)
        return yy + hip2 - Hy, xx
    K2 = thigh(Ky, Kx)

    def shin(y, x):
        yy, xx = rot(y, x, Ky, Kx, -beta)
        return yy + K2[0] - Ky, xx + K2[1] - Kx
    # the ankle goes with the shin; the foot hangs from the hinge where the ankle meets the plantar, and stays flat
    Hh = joints["hinge"]
    H2 = shin(*Hh)

    def foot(y, x):
        return y + H2[0] - Hh[0], x + H2[1] - Hh[1]
    L = levels(body)
    a0, a1 = L["ankle_top"], L["instep"]

    def ankle(y, x):
        """The ankle stretches: its top turns with the shin, its bottom stays with the foot."""
        w = smoothstep((y - a0) / (a1 - a0))
        (sy, sx), (fy, fx) = shin(y, x), foot(y, x)
        return lerp(sy, fy, w), lerp(sx, fx, w)
    # the pelvis core: the front's hangs lowest on the free leg's side; the side's takes its lateral place there, by just enough that its
    # bottom (at the buttocks' fold) falls as low
    fpel = next(q for q in front_table(body)[0] if q.kind == "pelvis")
    low = max(fpel.pts, key=lambda q: posed_xy(pv, q[0], q[1], 0)[0])
    target = posed_xy(pv, *low, 0)[0]
    g, wy = L["glute"], L["waist"]
    sg = 1 if low[1] > 0 else -1
    def drop(X):
        return posed_xy(pv, g, sg * X, 0)[0] - target
    lo_ = hi_ = 0.0       # the nearest place out from the middle where it falls as low (the drop is not monotonic further out)
    while hi_ < 0.8 and drop(hi_) < 0:
        lo_, hi_ = hi_, hi_ + 0.01
    for _ in range(30):
        mid = (lo_ + hi_) / 2
        lo_, hi_ = (mid, hi_) if drop(mid) < 0 else (lo_, mid)
    X = sg * hi_

    def pelvis(y, x):
        return posed_xy(pv, y, X * smoothstep((y - wy) / (g - wy)), 0)[0], x
    # the mandible: the front's jaw joints tilt with the head, the higher one its top; the side's takes its lateral place there at the top
    xt = 0.955 * fp["parietal"][1]
    st = 1 if P.T(0.55, xt, "head")[0] < P.T(0.55, -xt, "head")[0] else -1

    def tmj(y, x):
        return P.T(y, st * xt * (1 - smoothstep((y - 0.55) / 0.30)), "head")[0], x

    def mapper(rule, lat=0.0, kind=None):
        if lat == "pelvis":
            return pelvis
        if isinstance(lat, tuple) and lat[0] == "taper":     # (x at the top, top, bottom): the lateral place moves in to the middle going down
            _, x0, y0, y1 = lat
            return lambda y, x: (posed_xy(pv, y, x0 * (1 - smoothstep((y - y0) / (y1 - y0))), 0)[0], x)
        if isinstance(lat, tuple) and lat[0] == "low":       # a head part whose bottom is at its sides (x out, top, bottom): the side tilted lower
            _, x1, y0, y1 = lat
            sl = 1 if P.T(y1, x1, "head")[0] > P.T(y1, -x1, "head")[0] else -1
            return lambda y, x: (P.T(y, sl * x1 * smoothstep((y - y0) / (y1 - y0)), "head")[0], x)
        if lat == "tmj":
            return tmj
        if rule == "ankle":
            return ankle
        if rule == "head":
            return lambda y, x: (P.T(y, lat, "head")[0], x)
        if rule == "side_arm":
            return lambda y, x: (y + sh, x)
        if rule == "leg":
            return thigh if kind == "thigh" else shin
        if rule == "foot":
            return foot
        if rule == "farleg":
            return lambda y, x: (posed_xy(pv, y, -0.30, -1)[0], x)
        return lambda y, x: (posed_xy(pv, y, lat, 0)[0], x)

    def by_height(y, x):
        """For marks drawn without a part: chosen by height."""
        if y < 1.05:
            return mapper("head")(y, x)
        if y < Hy:
            return mapper("torso")(y, x)
        if y < Ky:
            return thigh(y, x)
        if y < Ay:
            return shin(y, x)
        return foot(y, x)
    return mapper, by_height


class PosedSide:
    """A side view seen through the pose, for marks drawn by height (form lines, masses)."""

    def __init__(self, view, fn):
        self.v, self.fn, self.u, self.cx, self.top = view, fn, view.u, view.cx, view.top

    def pt(self, y, x):
        return self.v.pt(*self.fn(y, x))


def posed_side_view(body, view, pv):
    """The side view itself, or seen through the front's pose."""
    if not pv or not pv.pose:
        return view
    _, _, inset = side_table(body)
    return PosedSide(view, side_pose(body, pv, inset["joints"])[1])


def side_model(body, view, pv=None, bow=None, lips="heart"):
    """The side view's parts in the view (in the weight-on-one-leg stance, posed with the front, the far leg behind), the jaw's line, the
    inset's parts."""
    parts, jaw, inset = side_table(body, bow, lips)
    k = body["k"]
    py = body["pivot"][0]
    px = -0.05 + (0.04 if k != 1.0 else 0)
    at = arm_frame(body)
    posed = side_pose(body, pv, inset["joints"]) if pv else None
    if posed:
        parts = [Part(p.kind, p.pts, rule="farleg", strokes=[]) for p in parts if p.rule in ("leg", "ankle", "foot")] + parts

    def arm(s_, w):
        s2 = s_ * k
        lean = 0.02 * s2 + (0.04 * (s2 - 1.38) if s2 > 1.38 else 0)
        return (py + at(s_)[0], px + w + lean)
    out = []
    for p in parts:
        base = arm if p.rule == "side_arm" else (lambda y, x: (y, x))
        if posed:
            m = posed[0](p.rule, p.lat, p.kind)
            mp = (lambda b_, m_: (lambda y, x: view.pt(*m_(*b_(y, x)))))(base, m)
        else:
            mp = (lambda b_: (lambda y, x: view.pt(*b_(y, x))))(base)
        out.append(Mapped(p, poly([mp(y, x) for y, x in p.pts]), [(open_poly([mp(y, x) for y, x in st[0]]), st[1]) for st in p.strokes],
                          [(mp(y, x), ry * view.u, rx * view.u, fill) for y, x, ry, rx, fill in p.dots]))
    jm = posed[0]("head") if posed else (lambda y, x: (y, x))
    return out, open_poly([view.pt(*jm(y, x)) for y, x in jaw]), inset


# ---------------- drawing ----------------
def draw_over(m, lw):
    """A part drawn on top: its fill, its outline (if it has one), the edges that show, its dots."""
    p = m.p
    op = f' fill-opacity="{p.opacity}"' if p.opacity is not None else ""
    out = [f'<path d="{m.d}" fill="{p.fill}"{op}' + (f' stroke="{LINE}" stroke-width="{f(lw * p.outline)}" stroke-linejoin="round"' if p.outline else "") + "/>"]
    for d, st in m.strokes:
        if st in ("edge", "lash"):
            out.append(f'<path d="{d}" fill="none" stroke="{LINE}" stroke-width="{f(lw * (0.65 if st == "lash" else 0.5))}" stroke-linecap="round" stroke-linejoin="round"/>')
        else:
            out.append(f'<path d="{d}" fill="none" stroke="{FORM}" stroke-width="1.2" stroke-linecap="round"/>')
    for (x, y), ry, rx, fill in m.dots:
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}"/>')
    return "".join(out)


def draw_ears(ms, lw):
    """Each ear: the helix and the lobe inside one outline, then the shapes inside the ear."""
    out = []
    for sd in sorted({m.p.side for m in ms}):
        ear = [m for m in ms if m.p.side == sd]
        out.append(union([m.d for m in ear if m.p.kind in ("helix", "lobe")], lw * 0.28))
        out += [draw_over(m, lw) if m.p.kind not in ("helix", "lobe") else draw_edges(m, lw) for m in ear]
    return "".join(out)


def draw_edges(m, lw):
    """A mass inside the outline: only its edges."""
    return "".join(f'<path d="{d}" fill="none" stroke="{LINE if st == "edge" else FORM}" stroke-width="{f(lw * 0.5) if st == "edge" else "1.2"}" '
                   f'stroke-linecap="round"/>' for d, st in m.strokes)


ARM_FILL = ("upperarm", "forearm", "deltoid", "biceps", "triceps")


def parts_front(body, pv, lw=2.2):
    """The figure from its parts, front or back. From the front the chest lies over the arms. From the back the arms lie over the back in
    their own outline, and the neck lies over the jaw, with the cranium over both."""
    ms, contact = front_model(body, pv)
    back = pv.flip
    out = []
    if back:
        out.append(union([m.d for m in ms if m.p.layer == "head" and m.p.kind != "head"], lw))
        out.append(union([m.d for m in ms if m.p.in_union and m.p.kind not in ARM_KINDS], lw))
    else:
        out.append(union([m.d for m in ms if m.p.in_union], lw))
    out += [f'<path d="{open_poly([(x, y) for x, y in r])}" fill="none" stroke="{LINE}" stroke-width="{f(lw * 0.8)}" stroke-linecap="round"/>' for r in contact]
    out += [draw_edges(m, lw) for m in ms if m.p.layer == "mass"]
    out += [draw_over(m, lw) for m in ms if m.p.layer == "toe"]
    if back:
        out.append(union([m.d for m in ms if m.p.kind in ARM_KINDS and m.p.in_union], lw))
        out += [draw_edges(m, lw) for m in ms if m.p.layer == "armmass"]
    else:
        # the arm's masses, then the chest (the breasts or pectorals) over the biceps
        out += [f'<path d="{m.d}" fill="{FILL}"/>' for m in ms if m.p.kind in ARM_FILL]
        out += [draw_edges(m, lw) for m in ms if m.p.layer == "armmass"]
        out += [draw_over(m, lw) for m in ms if m.p.layer == "overlay"]
        out += [draw_edges(m, lw) for m in ms if m.p.kind == "ribcage"]
        out += [draw_over(m, lw) for m in ms if m.p.layer == "chest"]
    out += [draw_over(m, lw) for m in ms if m.p.layer == "hand"]
    out.append(draw_ears([m for m in ms if m.p.layer == "ear"], lw))
    out.append(union([m.d for m in ms if m.p.layer == "head" and (m.p.kind == "head" or not back)], lw))
    out += [draw_over(m, lw) for m in ms if m.p.layer == "face" and not m.p.kind.startswith("lip")]

    return "".join(out)


ARM_KINDS = ("upperarm", "forearm", "deltoid", "biceps", "triceps", "palm", "finger1", "finger2", "finger3", "thumb1", "thumb2", "thumb3")


def parts_side(body, view, lw=2.2, pv=None):
    """The side figure: body and head inside one outline, the face on it, the jaw, the ear, the near arm inside its own outline."""
    ms, jaw, _ = side_model(body, view, pv)
    far = [m for m in ms if m.p.rule == "farleg"]
    body_ms = [m for m in ms if m.p.kind not in ARM_KINDS and m.p.rule != "farleg"]
    out = [union([m.d for m in far], lw)] if far else []
    out.append(union([m.d for m in body_ms if m.p.in_union], lw))
    out += [draw_edges(m, lw) for m in body_ms if m.p.layer == "mass"]
    out += [draw_over(m, lw) for m in body_ms if m.p.layer == "face" and not m.p.kind.startswith("lip")]

    out.append(f'<path d="{jaw}" fill="none" stroke="{LINE}" stroke-width="{lw}" stroke-linecap="round"/>')
    out.append(draw_ears([m for m in body_ms if m.p.layer == "ear"], lw))
    arm_ms = [m for m in ms if m.p.kind in ARM_KINDS]
    out.append(union([m.d for m in arm_ms], lw))
    out += [draw_edges(m, lw) for m in arm_ms if m.p.layer == "armmass"]
    out += [draw_over(m, lw) for m in arm_ms if m.p.layer == "hand"]
    return "".join(out)


def lip_union(ms, lw):
    """A lip's three segments inside one outline, then the philtrum's ridges."""
    if not ms:
        return ""
    out = union([m.d for m in ms], lw * 0.4, LIP)
    for m in ms:
        out += "".join(f'<path d="{d}" fill="none" stroke="{LINE if st in ("edge", "lash") else FORM}" '
                       f'stroke-width="{f(lw * 0.55) if st in ("edge", "lash") else "1.2"}" stroke-linecap="round"/>' for d, st in m.strokes)
    return out


def lip_layer(body, pv, sv, bow, lips="heart", lw=2.4, shapes=False):
    """The lips from the front and the side for a lip shape and a cupid's bow; the figure leaves them out, so both can change. With shapes,
    their outlines for the shape outlines layer instead."""
    fr = [m for m in front_model(body, pv, bow, lips)[0] if m.p.kind.startswith("lip")]
    sd = [m for m in side_model(body, sv, pv, bow, lips)[0] if m.p.kind.startswith("lip")]
    if shapes:
        return parts_layer([(m.p.kind, m.d) for m in fr], [(m.p.kind, m.d) for m in sd])
    return "".join(lip_union([m for m in ms if m.p.kind.startswith(k)], lw) for ms in (fr, sd) for k in ("lipL", "lipU"))


def bow_layer(body, pv, sv, bow, lw=2.4):
    return lip_layer(body, pv, sv, bow, "heart", lw)


def front_parts(body, pv, lips=True):
    return [(m.p.kind, m.d) for m in front_model(body, pv)[0] if m.p.layer != "overlay" and (lips or not m.p.kind.startswith("lip"))]


def side_parts(body, view, pv=None, lips=True):
    return [(m.p.kind, m.d) for m in side_model(body, view, pv)[0] if lips or not m.p.kind.startswith("lip")]


# ---------------- the foot on tiptoe ----------------
def tiptoe_inset(body, x0, floor, u, lw=2.0, shapes=False):
    """The side view's foot twice at a larger scale: flat, and on tiptoe (the heel and plantar turned about the ball, the toes flat on the
    floor, the shin upright on the turned ankle)."""
    _, _, I = side_table(body)
    my, mx = I["mtp"]
    a = math.radians(40)

    def rot(p):
        Y, X = p[0] - my, p[1] - mx
        return (my + X * math.sin(a) + Y * math.cos(a), mx + X * math.cos(a) - Y * math.sin(a))
    # the heel and plantar turn about the ball; the shin and the ankle stay upright, the ankle's centre carried round with the foot
    hy, hx = I["joints"]["hinge"]
    ry, rx = rot((hy, hx))
    shift = (ry - hy, rx - hx)
    a0, a1 = I["ankle_span"]

    def blend(p, q, w):
        return (lerp(p[0], q[0], w), lerp(p[1], q[1], w))


    def bend(p):
        """The plantar turns about the ball, all but its end at the toes, which stays down with them: its top bends smoothly into the toes'
        top and the ball stays on the floor."""
        return blend(p, rot(p), smoothstep((I["seam_x"] + 0.03 - p[1]) / 0.30))

    def fine(pts, step=0.006):
        out = []
        for a, b in zip(pts, pts[1:] + pts[:1]):
            k = max(1, int(math.dist(a, b) / step))
            out += [blend(a, b, i / k) for i in range(k)]
        return out
    poses = {"flat": {n: I[n] for n in ("stub", "ankle_seg", "heel", "plantar", "toes")},
             "tiptoe": {"stub": [(y + shift[0], x + shift[1]) for y, x in I["stub"]], "ankle_seg": [(y + shift[0], x + shift[1]) for y, x in I["ankle_seg"]],
                        "heel": [rot(p) for p in I["heel"]], "plantar": [bend(p) for p in fine(I["plantar"])], "toes": I["toes"]}}
    out = []
    T = 'font-family="system-ui, sans-serif" font-size="10.5" font-weight="700" fill="#090708" text-anchor="middle"'
    for j, (name, ps) in enumerate(poses.items()):
        cx = x0 + 60 + j * 150
        top = floor - I["sole"] * u

        def pt(y, x):
            return (cx + x * u, top + y * u)
        ds = {n: poly([pt(y, x) for y, x in pts]) for n, pts in ps.items()}
        if shapes:
            out.append("".join(f'<path d="{d}" fill="{HUE[INSET_KIND.get(n, n)]}" fill-opacity=".2" stroke="{HUE[INSET_KIND.get(n, n)]}" '
                               f'stroke-width="1.6" stroke-dasharray="5 3" stroke-linejoin="round"/>' for n, d in ds.items()))
        else:
            out.append(union(list(ds.values()), lw))
            out.append(f'<text x="{f(cx + 0.2 * u)}" y="{f(floor + 15)}" {T}>{"Flat" if name == "flat" else "On tiptoe"}</text>')
    if not shapes:
        out.append(f'<line x1="{f(x0 + 10)}" y1="{f(floor + 1)}" x2="{f(x0 + 330)}" y2="{f(floor + 1)}" stroke="#090708" stroke-opacity=".35" stroke-width="1.2"/>')
        out.append(f'<text x="{f(x0 + 170)}" y="{f(floor - 1.25 * u)}" {T}>THE FOOT: ANKLE, HEEL, PLANTAR, TOES</text>')
    return "".join(out)


# ---------------- the shape outlines layer ----------------
# Three hues, so that parts that meet always differ; apart from the masses' purple and blue, and dark enough to read on the figure's grey
# (3:1) and on the ground.
GREEN, AMBER, CRIMSON, NAVY = "#08573f", "#7a4000", "#9a1b45", "#33408a"
HUE = {"chest": GREEN, "traps": AMBER, "ribcage": CRIMSON, "breast": NAVY, "pec": NAVY, "abdomen": AMBER, "neck": NAVY, "head": CRIMSON,
       "upperarm": NAVY, "deltoid": CRIMSON, "biceps": AMBER, "triceps": GREEN, "forearm": CRIMSON, "palm": AMBER,
       "finger1": NAVY, "finger2": CRIMSON, "finger3": GREEN, "thumb1": NAVY, "thumb2": CRIMSON, "thumb3": GREEN,
       "pelvis": NAVY, "hip": CRIMSON, "buttock": GREEN, "thigh": AMBER, "shin": GREEN, "ankle": CRIMSON, "heel": NAVY, "plantar": AMBER, "toes": GREEN,
       "helix": AMBER, "lobe": NAVY, "antihelix": GREEN, "concha": CRIMSON, "tragus": NAVY, "antitragus": AMBER, "ear_canal": GREEN, "sclera": GREEN, "iris": NAVY, "pupil": AMBER, "lid_up": AMBER, "lid_low": NAVY, "tear_duct": CRIMSON, "brow": NAVY, "bridge": AMBER, "tip": NAVY, "nostril": AMBER, "septum": GREEN, "nose_hole": CRIMSON,
       "lipU_c": AMBER, "lipU_s": GREEN, "lipL_c": NAVY, "lipL_s": AMBER, "lowab": GREEN, "scapula": OLIVE,
       "upperjaw": OLIVE, "browridge": GREEN, "cheekbone": AMBER, "forehead": NAVY, "temple": OLIVE, "eyesocket": CRIMSON, "cheek": NAVY, "cartilage": GREEN, "mandible": GREEN, "chin": AMBER, "teeth_up": CRIMSON, "teeth_low": OLIVE, "tongue": AMBER}
NAME = {"chest": "chest core", "pelvis": "pelvis core", "head": "cranium (head core)", "upperjaw": "upper jaw", "browridge": "brow ridge", "eyesocket": "eye socket", "cartilage": "lateral cartilage", "teeth_up": "upper teeth",
        "teeth_low": "lower teeth", "lowab": "lower abdomen", "scapula": "shoulder blade", "upperarm": "arm core", "traps": "clavicle, traps", "deltoid": "shoulder",
        "abdomen": "upper abdomen", "finger2": "finger: 3 shapes", "thumb2": "thumb: 3 shapes", "nose_hole": "nose hole", "helix": "ear: helix, antihelix, concha, tragus, antitragus, canal, lobe", "ear_canal": "ear canal", "sclera": "eye: white, iris, pupil, two lids, tear duct",
        "lipU_c": "upper lip: middle, 2 sides; cupid's bow", "lipL_c": "lower lip: middle, 2 sides"}
SMALL = ("finger1", "finger2", "finger3", "thumb1", "thumb2", "thumb3", "helix", "lobe", "antihelix", "concha", "tragus", "antitragus", "ear_canal", "sclera", "iris", "pupil", "lid_up", "lid_low", "tear_duct", "brow", "bridge", "tip", "nostril", "septum", "nose_hole",
         "lipU_c", "lipU_s", "lipL_c", "lipL_s", "toes", "cartilage", "chin", "teeth_up", "teeth_low", "tongue")
INSET_KIND = {"stub": "shin", "ankle_seg": "ankle"}


def parts_layer(*part_lists):
    """Each part's whole outline, dashed, and its area tinted: where parts overlap at a joint the tint deepens, showing the caps."""
    out = []
    for parts in part_lists:
        for kind, d in parts:
            w, dash = ("1.1", "3 2") if kind in SMALL else ("1.8", "6 3")
            out.append(f'<path d="{d}" fill="{HUE[kind]}" fill-opacity=".2" stroke="{HUE[kind]}" stroke-width="{w}" stroke-dasharray="{dash}" stroke-linejoin="round"/>')
    return "".join(out)


TXT = 'font-family="system-ui, sans-serif" font-size="10" font-weight="700" paint-order="stroke" stroke="#e6d1db" stroke-width="3" stroke-linejoin="round"'


def _label(kind, at, anchor=None, align="middle"):
    """A part's name at `at`; with an anchor, a thin leader from the part to the name."""
    hue = HUE[kind]
    out = ""
    if anchor:
        ex = at[0] - 3 if align == "start" else (at[0] + 3 if align == "end" else at[0])
        out = f'<line x1="{f(anchor[0])}" y1="{f(anchor[1])}" x2="{f(ex)}" y2="{f(at[1] - 3.5)}" stroke="{hue}" stroke-width=".9"/>'
    return out + f'<text x="{f(at[0])}" y="{f(at[1])}" {TXT} text-anchor="{align}" fill="{hue}">{NAME.get(kind, kind)}</text>'


def parts_labels(body, pv, sv, bv):
    """The parts named once: the body's on the front view (its middle and the viewer's right), the triceps and buttocks on the back view, the
    face's and the foot's on the side view."""
    L = levels(body)
    k = body["k"]
    Y = (lambda y: y if y <= 1.2 else 1.2 + (y - 1.2) * k)
    p = by_name(body["front"])
    out = []

    def at(view, y, x, side=0):
        return to_view(view, *posed_xy(view, y, x, side))
    for kind, (y, x) in (("neck", (1.04, 0.0)), ("chest", (Y(1.78), 0.0)), ("abdomen", (Y(2.72), 0.0)), ("lowab", (Y(3.55), 0.0)),
                         ("ribcage", (Y(2.45), 0.56)), ("hip", (Y(3.58), 0.60))):
        out.append(_label(kind, at(pv, y, x)))
    for kind, (y, x) in (("thigh", (L["knee"] - 0.75, p["thigh"][1] * 0.55)), ("shin", (L["knee"] + 0.8, 0.27))):
        out.append(_label(kind, at(pv, y, x, 1)))
    # the head's parts, named to the right of the front's head
    for kind, (y, x), ty in (("head", (0.20, 0.12), 0.16), ("browridge", (0.40, 0.22), 0.41), ("cheekbone", (0.56, 0.26), 0.52), ("upperjaw", (0.62, 0.10), 0.63),
                             ("mandible", (0.86, 0.22), 0.86), ("chin", (0.95, 0.05), 1.0)):
        out.append(_label(kind, pv.pt(ty, 0.47, "head"), pv.pt(y, x, "head"), "start"))
    # the finer planes, named to the left of the front's head
    for kind, (y, x), ty in (("forehead", (0.24, -0.12), 0.22), ("temple", (0.32, -0.28), 0.33), ("eyesocket", (0.47, -0.262), 0.47),
                             ("cartilage", (lerp(*nose_levels(L, by_name(body["side"]))["cartilage"], 0.6), -0.05), 0.585), ("cheek", (0.70, -0.25), 0.70)):
        out.append(_label(kind, pv.pt(ty, -0.47, "head"), pv.pt(y, x, "head"), "end"))
    out.append(_label("breast" if body["sex"] == "f" else "pec", at(pv, L["breast_top"] + 0.15, 0.36)))
    out.append(_label("traps", at(pv, Y(1.16), 1.08), at(pv, Y(1.40), 0.46), "start"))
    A = across_fn(*body["arm"])
    place = arm_placer(body, pv, 1)
    for kind, s_, fr in (("deltoid", 0.10, 0.75), ("biceps", 0.88, 0.45), ("upperarm", 1.30, 0.5), ("forearm", 1.95, 0.5)):
        out.append(_label(kind, place(*A(s_, fr))))
    hx = place(2.75, 0.4)[0]
    for kind, s_, w in (("thumb2", 2.92, 0.16), ("palm", 2.70, 0.0), ("finger2", 3.2, 0.02)):
        a = place(s_, w)
        out.append(_label(kind, (hx + 4, a[1] + (14 if kind == "finger2" else 0)), a, "start"))
    back_place = arm_placer(body, bv, 1)
    out.append(_label("triceps", back_place(*A(0.85, 0.5))))
    out.append(_label("buttock", at(bv, Y(3.90), 0.33)))
    out.append(_label("pelvis", at(bv, Y(3.22), 0.0)))
    out.append(_label("scapula", at(bv, Y(1.98), 0.35)))
    # the face, on the side view, named to its right; the ear behind; the foot's parts below it
    sv = posed_side_view(body, sv, pv)
    sp = by_name(body["side"])
    fx = sp["nose"][1] + 0.30
    dxe = sp["bridge"][1] - 0.31
    dx = sp["occiput"][1] + 0.42
    N = nose_levels(L, sp)
    no = sp["nose"]
    for kind, (y, x), ty in (("brow", (0.42, 0.29 + dxe), 0.26), ("sclera", (0.49, 0.28 + dxe), 0.355), ("bridge", (lerp(*N["bridge"], 0.5), sp["bridge"][1] + 0.02), 0.45),
                             ("tip", (lerp(*N["tip"], 0.5), no[1] - 0.01), 0.545), ("nostril", (lerp(*N["nostril"], 0.55), no[1] - 0.085), 0.64),
                             ("nose_hole", (lerp(*N["hole"], 0.5), no[1] - 0.075), 0.735), ("septum", (lerp(*N["septum"], 0.5), no[1] - 0.04), 0.83),
                             ("lipU_c", ((L["lip_top"] + L["mouth"]) / 2, sp["lips"][1] - 0.01), 0.925), ("lipL_c", ((L["mouth"] + L["lip_bottom"]) / 2, sp["lips2"][1] - 0.01), 1.02)):
        out.append(_label(kind, sv.pt(ty, fx), sv.pt(y, x), "start"))
    Hl = head_levels(L)
    for kind, x, ty in (("teeth_up", 0.20, 1.115), ("teeth_low", 0.17, 1.21), ("tongue", 0.10, 1.305)):
        out.append(_label(kind, sv.pt(ty, fx), sv.pt(sum(Hl[kind]) / 2, x + dx), "start"))
    out.append(_label("helix", sv.pt(0.30, -0.55 + dx), sv.pt(0.50, -0.12 + dx), "end"))
    for kind, (y, x), tx in (("ankle", (L["ankle_top"], ankle_joint(body)[1]), -0.70), ("heel", (Y(7.38), -0.12), -0.30), ("plantar", (Y(7.36), 0.26), 0.20),
                             ("toes", (Y(7.46), 0.56), 0.74)):
        out.append(_label(kind, sv.pt(L["sole"] + 0.24, tx), sv.pt(y, x), "middle"))
    return "".join(out)


def parts_legend(body, x, y, pv, sv):
    T = 'font-family="system-ui, sans-serif" font-size="11" fill="#090708"'
    fr, sd = front_parts(body, pv), side_parts(body, sv, pv)
    kinds = len({k for k, _ in fr} | {k for k, _ in sd})
    lines = [(f"{kinds} kinds of part: {len(fr)} pieces from the front, {len(sd)} from the side; parts that meet take different colours.", True),
             ("A core for the head, chest, pelvis and upper arm, masses on it; fingers and thumbs in three shapes; the foot in four; the nose in nine; each lip in three.", False),
             ("Each part ends in a cap on its joint, tucked under the next, so a bend opens no gap; one outline runs round them all.", False),
             ("Every part spans the same heights in every view, and the side takes the front's pose. Thighs that touch flatten where they meet.", False)]
    return "".join(f'<text x="{f(x)}" y="{f(y + i * 16)}" {T}' + (' font-weight="700"' if bold else "") + f'>{text}</text>' for i, (text, bold) in enumerate(lines))
