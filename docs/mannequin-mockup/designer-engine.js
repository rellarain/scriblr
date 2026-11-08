/* Scriblr mannequin: the geometry of the character design console (mockup).
   Pure functions, no DOM. Points -> curves (four point modes), mirror editing, pivots and anchors, a complete skin body with clothes
   bound to body points (looseness fit), forms, range sliders, colour slots, build and age presets, and seeded random previews.
   The real app would port this 1:1 to TypeScript. */
(function (root) {
'use strict';
var K = 0.3905;                       // handle length as a share of the chord: four curve points make a true circle
var SWAP = { c: 'c', s: 's', cs: 'sc', sc: 'cs' };
var ID = [1, 0, 0, 1, 0, 0];
var M = {};

/* ---------- maths ---------- */
function rad(d) { return d * Math.PI / 180; }
function r2(v) { return Math.round(v * 100) / 100; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function mul(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function ap(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
function Tm(x, y) { return [1, 0, 0, 1, x, y]; }
function Rm(a, px, py) { var c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]; }
function Sm(sx, sy, px, py) { return [sx, 0, 0, sy, px - sx * px, py - sy * py]; }
M.math = { mul: mul, ap: ap, Tm: Tm, Rm: Rm, Sm: Sm, clamp: clamp, r2: r2 };

/* ---------- points and paths ---------- */
// a point: {x, y, m: 'c' | 's' | 'cs' | 'sc', hi, ho, w?, bind?}. c = curve, s = sharp, cs = curve then sharp, sc = sharp then curve.
// hi / ho are the in and out handles as offsets, or null for the automatic ones.
// bind: {s: shape id, i: point index, d: [dx, dy] fixed offset, n: [nx, ny] offset that scales with the fit slider}: the point follows a body point.
function P(a) { var p = { x: a[0], y: a[1], m: a[2] || 'c', hi: null, ho: null }; if (a[3] != null) p.w = a[3]; return p; }
function pts(list) { return list.map(P); }
function reflectPt(p, ax) {
  var q = { x: 2 * ax - p.x, y: p.y, m: SWAP[p.m], hi: p.ho ? [-p.ho[0], p.ho[1]] : null, ho: p.hi ? [-p.hi[0], p.hi[1]] : null };
  if (p.w != null) q.w = p.w;
  return q;
}
function reflectList(list, ax) { var r = []; for (var i = list.length - 1; i >= 0; i--) r.push(reflectPt(list[i], ax)); return r; }
// half: the right half of a symmetric outline, from the top of the axis to the bottom of it
function sym(half) {
  var h = pts(half), back = [];
  for (var i = h.length - 2; i >= 1; i--) back.push(reflectPt(h[i], 100));
  return h.concat(back);
}
function hasIn(m) { return m === 'c' || m === 'cs'; }
function hasOut(m) { return m === 'c' || m === 'sc'; }
M.hasIn = hasIn; M.hasOut = hasOut;

function autoHandles(list, closed) {
  var n = list.length, out = [];
  for (var i = 0; i < n; i++) {
    var p = list[i], pr = list[closed ? (i + n - 1) % n : Math.max(i - 1, 0)], nx = list[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
    var tx = nx.x - pr.x, ty = nx.y - pr.y, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    var dn = Math.hypot(nx.x - p.x, nx.y - p.y), dp = Math.hypot(p.x - pr.x, p.y - pr.y);
    out.push({ ho: p.ho || [tx * dn * K, ty * dn * K], hi: p.hi || [-tx * dp * K, -ty * dp * K] });
  }
  return out;
}
M.autoHandles = autoHandles;

// the absolute control points of a point list under a matrix
function build(list, closed, mat) {
  var h = autoHandles(list, closed), out = [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i], a = ap(mat, p.x, p.y), hi = ap(mat, p.x + h[i].hi[0], p.y + h[i].hi[1]), ho = ap(mat, p.x + h[i].ho[0], p.y + h[i].ho[1]);
    out.push({ x: a[0], y: a[1], m: p.m, hix: hi[0], hiy: hi[1], hox: ho[0], hoy: ho[1] });
  }
  return out;
}
function dOf(a, closed) {
  if (!a.length) return '';
  var s = 'M' + r2(a[0].x) + ' ' + r2(a[0].y), n = a.length, last = closed ? n : n - 1;
  for (var i = 0; i < last; i++) {
    var p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m);
    if (!o && !ii) s += 'L' + r2(q.x) + ' ' + r2(q.y);
    else s += 'C' + r2(o ? p.hox : p.x) + ' ' + r2(o ? p.hoy : p.y) + ' ' + r2(ii ? q.hix : q.x) + ' ' + r2(ii ? q.hiy : q.y) + ' ' + r2(q.x) + ' ' + r2(q.y);
  }
  return s + (closed ? 'Z' : '');
}
function flat(a, closed) {
  var out = [], n = a.length, last = closed ? n : n - 1;
  for (var i = 0; i < last; i++) {
    var p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m);
    if (!o && !ii) { out.push([p.x, p.y]); continue; }
    var c1 = o ? [p.hox, p.hoy] : [p.x, p.y], c2 = ii ? [q.hix, q.hiy] : [q.x, q.y];
    for (var s = 0; s < 8; s++) {
      var t = s / 8, u = 1 - t;
      out.push([u * u * u * p.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q.x, u * u * u * p.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q.y]);
    }
  }
  if (!closed && n) out.push([a[n - 1].x, a[n - 1].y]);
  return out;
}
function inPoly(poly, x, y) {
  var c = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function boxOf(poly) {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  poly.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
M.build = build; M.dOf = dOf; M.flat = flat; M.inPoly = inPoly; M.boxOf = boxOf; M.reflectList = reflectList;

function xf(list, m) {
  list.forEach(function (p) {
    var a = ap(m, p.x, p.y); p.x = a[0]; p.y = a[1];
    if (p.hi) p.hi = [m[0] * p.hi[0] + m[2] * p.hi[1], m[1] * p.hi[0] + m[3] * p.hi[1]];
    if (p.ho) p.ho = [m[0] * p.ho[0] + m[2] * p.ho[1], m[1] * p.ho[0] + m[3] * p.ho[1]];
  });
}
function twinIndex(list, i, ax, tol) {
  var p = list[i], tx = 2 * ax - p.x, best = i, bd = 1e9;
  for (var j = 0; j < list.length; j++) { var d = Math.hypot(list[j].x - tx, list[j].y - p.y); if (d < bd) { bd = d; best = j; } }
  return bd < (tol || 6) ? best : i;
}
M.twinIndex = twinIndex;

/* ---------- templates (unit square, -1..1) ---------- */
var TPL = {
  circle: { name: 'Circle', pts: [[0, -1], [1, 0], [0, 1], [-1, 0]] },
  oval: { name: 'Oval', pts: [[0, -1], [0.78, 0], [0, 1], [-0.78, 0]] },
  square: { name: 'Square', pts: [[-1, -1, 's'], [1, -1, 's'], [1, 1, 's'], [-1, 1, 's']] },
  rounded: { name: 'Rounded rectangle', pts: [[-0.55, -1, 'cs'], [0.55, -1, 'sc'], [1, -0.55, 'cs'], [1, 0.55, 'sc'], [0.55, 1, 'cs'], [-0.55, 1, 'sc'], [-1, 0.55, 'cs'], [-1, -0.55, 'sc']] },
  hexagon: { name: 'Hexagon', pts: [[0, -1, 's'], [0.87, -0.5, 's'], [0.87, 0.5, 's'], [0, 1, 's'], [-0.87, 0.5, 's'], [-0.87, -0.5, 's']] },
  trapezoid: { name: 'Trapezoid', pts: [[-0.55, -1, 's'], [0.55, -1, 's'], [1, 1, 's'], [-1, 1, 's']] },
  triangle: { name: 'Triangle', pts: [[0, -1, 's'], [1, 0.9, 's'], [-1, 0.9, 's']] },
  diamond: { name: 'Diamond', pts: [[0, -1, 's'], [0.8, 0, 's'], [0, 1, 's'], [-0.8, 0, 's']] },
  teardrop: { name: 'Teardrop', pts: [[0, -1, 's'], [0.8, 0.3], [0, 1], [-0.8, 0.3]] },
  leaf: { name: 'Leaf', pts: [[0, -1, 's'], [0.7, 0], [0, 1, 's'], [-0.7, 0]] },
  heart: { name: 'Heart', pts: [[0, -0.45, 's'], [0.5, -0.95], [1, -0.4], [0, 1, 's'], [-1, -0.4], [-0.5, -0.95]] },
  star: { name: 'Star', pts: (function () { var o = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1; o.push([Math.cos(a) * r, Math.sin(a) * r, 's']); } return o; })() },
  crescent: { name: 'Crescent', pts: [[0.3, -1, 's'], [-0.9, 0], [0.3, 1, 's'], [-0.2, 0]] },
  blob: { name: 'Blob', pts: [[0, -0.9], [0.8, -0.55], [1, 0.1], [0.5, 0.9], [-0.3, 1], [-0.95, 0.3], [-0.8, -0.5]] },
  tapered: { name: 'Tapered line', pts: [[-1, 0, 's'], [-0.5, -0.2], [0.5, -0.12], [1, 0, 's'], [0.5, 0.12], [-0.5, 0.2]] }
};
M.templates = TPL;
M.templateIds = ['circle', 'oval', 'square', 'rounded', 'hexagon', 'trapezoid', 'triangle', 'diamond', 'teardrop', 'leaf', 'heart', 'star', 'crescent', 'blob', 'tapered'];
M.templatePts = function (id, box) {
  var t = TPL[id], cx = box.x + box.w / 2, cy = box.y + box.h / 2, hw = Math.max(box.w, 6) / 2, hh = Math.max(box.h, 6) / 2;
  return t.pts.map(function (a) { return P([r2(cx + a[0] * hw), r2(cy + a[1] * hh), a[2] || 'c']); });
};

/* ---------- editing ---------- */
M.shapeModes = ['c', 's', 'cs', 'sc'];
M.modeName = { c: 'Curve', s: 'Sharp', cs: 'Curve, then sharp', sc: 'Sharp, then curve' };
M.snapshot = function (model) { return JSON.stringify({ shapes: model.shapes, ranges: model.ranges, links: model.links, groups: model.groups, objects: model.objects, slots: model.slots, poses: model.poses, presets: model.presets }); };
M.restore = function (model, s) {
  var o = JSON.parse(s);
  model.shapes = o.shapes; model.ranges = o.ranges; model.links = o.links; model.groups = o.groups; model.objects = o.objects; model.slots = o.slots; model.poses = o.poses; model.presets = o.presets;
  M.index(model);
};
M.inv = function (m) {
  var det = m[0] * m[3] - m[1] * m[2] || 1;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};

M.movePoint = function (list, i, x, y, o) {
  var ax = o.axis == null ? 100 : o.axis, p = list[i];
  var onAxis = Math.abs(p.x - ax) < 0.01;
  if (onAxis && o.mirror) x = ax;
  if (o.snap) { x = Math.round(x * 2) / 2; y = Math.round(y * 2) / 2; if (Math.abs(x - ax) < 1.2) x = ax; }
  var j = o.mirror && o.twin != null ? o.twin : i;
  p.x = r2(x); p.y = r2(y);
  if (j !== i) { list[j].x = r2(2 * ax - p.x); list[j].y = p.y; }
};
M.moveHandle = function (list, i, which, x, y, o) {
  var ax = o.axis == null ? 100 : o.axis, p = list[i], h = autoHandles(list, true)[i];
  var d = [r2(x - p.x), r2(y - p.y)];
  if (o.snap) { var a = Math.atan2(d[1], d[0]), step = Math.PI / 12, na = Math.round(a / step) * step, l = Math.hypot(d[0], d[1]); d = [r2(Math.cos(na) * l), r2(Math.sin(na) * l)]; }
  var onAxis = Math.abs(p.x - ax) < 0.01;
  if (onAxis && o.mirror) d = [which === 'ho' ? Math.abs(d[0]) * (p.ho && p.ho[0] < 0 ? -1 : 1) : d[0], 0];
  p[which] = d;
  var other = which === 'ho' ? 'hi' : 'ho';
  if (p.m === 'c') { var l2 = Math.hypot(h[other][0], h[other][1]), l1 = Math.hypot(d[0], d[1]) || 1; p[other] = [r2(-d[0] / l1 * l2), r2(-d[1] / l1 * l2)]; }
  var j = o.mirror && o.twin != null ? o.twin : i;
  if (j !== i) {
    var q = list[j];
    q[which === 'ho' ? 'hi' : 'ho'] = [-p[which][0], p[which][1]];
    if (p[other]) q[other === 'ho' ? 'hi' : 'ho'] = [-p[other][0], p[other][1]];
  }
};
M.setMode = function (list, i, mode, o) {
  list[i].m = mode;
  var j = o.mirror && o.twin != null ? o.twin : i;
  if (j !== i) list[j].m = SWAP[mode];
};
M.resetHandles = function (list, i, o) {
  list[i].hi = null; list[i].ho = null;
  var j = o.mirror && o.twin != null ? o.twin : i;
  if (j !== i) { list[j].hi = null; list[j].ho = null; }
};
function segMid(list, i) {
  var a = build(list, true, ID), n = a.length, p = a[i], q = a[(i + 1) % n], o = hasOut(p.m), ii = hasIn(q.m);
  if (!o && !ii) return [(p.x + q.x) / 2, (p.y + q.y) / 2];
  var c1 = o ? [p.hox, p.hoy] : [p.x, p.y], c2 = ii ? [q.hix, q.hiy] : [q.x, q.y];
  return [0.125 * p.x + 0.375 * c1[0] + 0.375 * c2[0] + 0.125 * q.x, 0.125 * p.y + 0.375 * c1[1] + 0.375 * c2[1] + 0.125 * q.y];
}
// adds a point in the middle of the edge after point i; returns the new index
M.addPoint = function (list, i, o) {
  var ax = o.axis == null ? 100 : o.axis, n = list.length, mid = segMid(list, i);
  var np = { x: r2(mid[0]), y: r2(mid[1]), m: 'c', hi: null, ho: null };
  var ti = o.mirror ? twinIndex(list, i, ax) : i, tj = o.mirror ? twinIndex(list, (i + 1) % n, ax) : (i + 1) % n;
  if (o.mirror && ti !== i && tj !== (i + 1) % n && ti !== tj) {
    var tw = { x: r2(2 * ax - np.x), y: np.y, m: 'c', hi: null, ho: null };
    var after = Math.min(ti, tj) === 0 && Math.max(ti, tj) === n - 1 ? n - 1 : Math.min(ti, tj);
    if (after > i) { list.splice(after + 1, 0, tw); list.splice(i + 1, 0, np); return i + 1; }
    list.splice(i + 1, 0, np); list.splice(after + 1, 0, tw); return i + 1;
  }
  list.splice(i + 1, 0, np);
  return i + 1;
};
M.delPoint = function (list, i, o) {
  var ax = o.axis == null ? 100 : o.axis, ti = o.mirror ? twinIndex(list, i, ax) : i;
  var min = o.min || 3;
  if (list.length <= min) return false;
  if (ti !== i && list.length - 2 >= min) { list.splice(Math.max(i, ti), 1); list.splice(Math.min(i, ti), 1); }
  else list.splice(i, 1);
  return true;
};
// a bound point is moved by changing its fixed offset from the body point it follows
M.moveBound = function (p, dx, dy) { p.bind.d = [r2(p.bind.d[0] + dx), r2(p.bind.d[1] + dy)]; };
// the whole shape moves: free points by the offset, points that follow a body point by their offset from it; points locked to an edge stay on it
M.moveShape = function (list, dx, dy) {
  var n = 0;
  list.forEach(function (p) {
    if (p.bind && p.bind.e != null) return;
    if (p.bind) { p.bind.d = [r2(p.bind.d[0] + dx), r2(p.bind.d[1] + dy)]; n++; return; }
    p.x = r2(p.x + dx); p.y = r2(p.y + dy); n++;
  });
  return n;
};

/* ---------- edges: a point can lock to the edge of another shape ---------- */
// bind {s, e, t, o}: on the edge of shape s, between its point e and the next one, at t (0..1) along it, o units outward (negative = inward)
function bezPt(a, e, t) {
  var n = a.length, p = a[e % n], q = a[(e + 1) % n], o = hasOut(p.m), ii = hasIn(q.m), u = 1 - t, x, y, dx, dy;
  if (!o && !ii) { x = p.x + (q.x - p.x) * t; y = p.y + (q.y - p.y) * t; dx = q.x - p.x; dy = q.y - p.y; }
  else {
    var c1 = o ? [p.hox, p.hoy] : [p.x, p.y], c2 = ii ? [q.hix, q.hiy] : [q.x, q.y];
    x = u * u * u * p.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * q.x;
    y = u * u * u * p.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * q.y;
    dx = 3 * u * u * (c1[0] - p.x) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (q.x - c2[0]);
    dy = 3 * u * u * (c1[1] - p.y) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (q.y - c2[1]);
    if (!dx && !dy) { dx = q.x - p.x; dy = q.y - p.y; }
  }
  var l = Math.hypot(dx, dy) || 1;
  return { x: x, y: y, tx: dx / l, ty: dy / l };
}
// which way is outward: +1 when the outline runs clockwise on the screen
function windSign(a) {
  var s = 0, n = a.length; for (var i = 0; i < n; i++) { var p = a[i], q = a[(i + 1) % n]; s += p.x * q.y - q.x * p.y; }
  return s >= 0 ? 1 : -1;
}
function edgeAt(a, sign, e, t, o) {
  var b = bezPt(a, e, t), nx = b.ty * sign, ny = -b.tx * sign;
  return [b.x + nx * (o || 0), b.y + ny * (o || 0), nx, ny];
}
M.edgeAt = function (list, e, t, o) { var a = build(list, true, ID); return edgeAt(a, windSign(a), e, t, o); };
// the nearest place on the edge of a shape (its own points, in the space of the list): {e, t, dist, o (signed, + outward), x, y}
M.nearestEdge = function (list, x, y) {
  var a = build(list, true, ID), sign = windSign(a), best = null, n = a.length;
  for (var e = 0; e < n; e++) {
    for (var k = 0; k <= 20; k++) {
      var t = k / 20, b = bezPt(a, e, t), d = Math.hypot(b.x - x, b.y - y);
      if (!best || d < best.dist) best = { e: e, t: t, dist: d, x: b.x, y: b.y, nx: b.ty * sign, ny: -b.tx * sign };
    }
  }
  if (!best) return null;
  best.o = (x - best.x) * best.nx + (y - best.y) * best.ny;
  // refine t around the best sample
  var lo = Math.max(0, best.t - 0.05), hi = Math.min(1, best.t + 0.05);
  for (var it = 0; it < 8; it++) {
    var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3, b1 = bezPt(a, best.e, m1), b2 = bezPt(a, best.e, m2);
    if (Math.hypot(b1.x - x, b1.y - y) < Math.hypot(b2.x - x, b2.y - y)) hi = m2; else lo = m1;
  }
  var tt = (lo + hi) / 2, bb = bezPt(a, best.e, tt);
  best.t = r2(tt); best.x = bb.x; best.y = bb.y; best.nx = bb.ty * sign; best.ny = -bb.tx * sign;
  best.dist = Math.hypot(bb.x - x, bb.y - y); best.o = (x - bb.x) * best.nx + (y - bb.y) * best.ny;
  return best;
};
// the same lock on the right-hand twin of a symmetric outline of n points whose half has m points
M.mirrorEdge = function (b, n) { return { s: b.s, e: (n - b.e - 1 + n) % n, t: r2(1 - b.t), o: b.o }; };
// a point locked to an edge: sets the bind from where the point is now
M.lockPoint = function (p, shapeId, hit, o) {
  p.bind = { s: shapeId, e: hit.e, t: r2(hit.t), o: r2(o == null ? 0 : o) };
  p.x = r2(hit.x + hit.nx * p.bind.o); p.y = r2(hit.y + hit.ny * p.bind.o);
};
M.unlockPoint = function (p) { delete p.bind; };

/* ---------- links between points ---------- */
// a link keeps two points together: weld = the same place, follow = a fixed offset
M.nearestPoint = function (model, shapeId, i, cfg, view) {
  var list = M.ptsOf(model, shapeId, cfg, view), p = list[i], best = null, bd = 7;
  Object.keys(model.shapes).forEach(function (id) {
    var sh = model.shapes[id];
    if (sh.mirrorOf || id === shapeId) return;
    var l = M.ptsOf(model, id, cfg, view);
    l.forEach(function (q, j) { var d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = { shape: id, i: j, d: d }; } });
  });
  return best;
};
M.linkOf = function (model, shapeId, i) {
  for (var k = 0; k < model.links.length; k++) {
    var l = model.links[k];
    if (l.a.shape === shapeId && l.a.i === i) return { link: l, other: l.b, self: 'a' };
    if (l.b.shape === shapeId && l.b.i === i) return { link: l, other: l.a, self: 'b' };
  }
  return null;
};
M.addLink = function (model, a, b, kind, cfg, view) {
  var pa = M.ptsOf(model, a.shape, cfg, view)[a.i], pb = M.ptsOf(model, b.shape, cfg, view)[b.i];
  var l = { a: a, b: b, kind: kind, dx: r2(pb.x - pa.x), dy: r2(pb.y - pa.y) };
  if (kind === 'weld') { l.dx = 0; l.dy = 0; pb.x = pa.x; pb.y = pa.y; }
  model.links = model.links.filter(function (o) { return !((o.a.shape === a.shape && o.a.i === a.i) || (o.b.shape === b.shape && o.b.i === b.i)); });
  model.links.push(l);
};
M.removeLink = function (model, shapeId, i) {
  model.links = model.links.filter(function (l) { return !((l.a.shape === shapeId && l.a.i === i) || (l.b.shape === shapeId && l.b.i === i)); });
};
// moves every point that is linked to this one (and those linked to those) to follow it
M.propagate = function (model, shapeId, i, cfg, view, seen) {
  seen = seen || {};
  seen[shapeId + ':' + i] = true;
  model.links.forEach(function (l) {
    var self = (l.a.shape === shapeId && l.a.i === i) ? 'a' : (l.b.shape === shapeId && l.b.i === i) ? 'b' : null;
    if (!self) return;
    var other = self === 'a' ? l.b : l.a;
    if (seen[other.shape + ':' + other.i]) return;
    var src = M.ptsOf(model, shapeId, cfg, view)[i], dst = M.ptsOf(model, other.shape, cfg, view)[other.i];
    if (!dst) return;
    var sgn = self === 'a' ? 1 : -1;
    dst.x = r2(src.x + sgn * l.dx); dst.y = r2(src.y + sgn * l.dy);
    M.propagate(model, other.shape, other.i, cfg, view, seen);
  });
};

/* ---------- the sample model: a body first, then the clothes draped on it ---------- */
M.limits = { pointsWarn: 24, pointsMax: 60, chain: 6, copyWarnKB: 150, copyMaxKB: 250, shade: 10, objectsWarn:24, objectsMax:48, shapesWarn:36, shapesMax:72 };

M.model = function () {
  var shapes = {};
  function shape(id, name, list, o) {
    var s = { id: id, name: name, pts: list, closed: true, z: 40, slot: 'skin', tone: 0, op: 1, view: 'both', mirrorOf: null, half: 0, side: null, back: null };
    for (var k in o) s[k] = o[k];
    shapes[id] = s; return s;
  }
  function symShape(id, name, half, o) { var s = shape(id, name, sym(half), o); s.half = half.length; s.mirror = true; return s; }
  function pair(idR, nameR, idL, o) { shapes[idL].side = 'L'; return shape(idR, nameR, [], (function () { var r = { mirrorOf: idL, side: 'R' }; for (var k in o) r[k] = o[k]; return r; })()); }
  function shifted(list, dx) { return list.map(function (a) { return [a[0] + dx, a[1], a[2]]; }); }
  function centroid(list) { var x = 0, y = 0; list.forEach(function (p) { x += p.x; y += p.y; }); return [x / list.length, y / list.length]; }
  // the outward normal of a body outline at a point
  function outward(list, i) {
    var n = list.length, a = list[(i + n - 1) % n], b = list[(i + 1) % n], tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    var nx = ty / l, ny = -tx / l, c = centroid(list), vx = list[i].x - c[0], vy = list[i].y - c[1];
    if (nx * vx + ny * vy < 0) { nx = -nx; ny = -ny; }
    return [nx, ny];
  }
  // a garment point that follows point i of a body shape: a fixed offset d, plus thick units outward that the fit slider scales
  function Bd(sid, i, d, thick, mode) {
    var body = shapes[sid].pts, o = outward(body, i), p = P([0, 0, mode || 'c']);
    p.bind = { s: sid, i: i, d: d || [0, 0], n: [r2(o[0] * (thick || 0)), r2(o[1] * (thick || 0))] };
    p.x = r2(body[i].x + p.bind.d[0] + p.bind.n[0]); p.y = r2(body[i].y + p.bind.d[1] + p.bind.n[1]);
    return p;
  }
  // the right half of a symmetric garment, mirrored: each point binds to the twin of the body point it follows
  function symBound(halfPts) {
    var out = halfPts.slice();
    for (var k = halfPts.length - 2; k >= 1; k--) {
      var p = halfPts[k], body = shapes[p.bind.s];
      if (p.bind.e != null) {
        var twinId = null, nb = body.pts.length;
        Object.keys(shapes).forEach(function (kk) { if (shapes[kk].mirrorOf === p.bind.s) twinId = kk; });
        // the right-hand twin of a left shape is its reflected, reversed list: edge e becomes edge n - 2 - e, run the other way
        var rb = body.mirror ? M.mirrorEdge(p.bind, nb) : { s: twinId, e: (2 * nb - 2 - p.bind.e) % nb, t: r2(1 - p.bind.t), o: p.bind.o };
        out.push({ x: r2(200 - p.x), y: p.y, m: SWAP[p.m], hi: null, ho: null, bind: rb });
        continue;
      }
      var N = body.pts.length, m = body.half, i = p.bind.i, ti = (i === 0 || i === m - 1) ? i : N - i;
      out.push({ x: r2(200 - p.x), y: p.y, m: SWAP[p.m], hi: null, ho: null, bind: { s: p.bind.s, i: ti, d: [-p.bind.d[0], p.bind.d[1]], n: [-p.bind.n[0], p.bind.n[1]] } });
    }
    return out;
  }
  function boundSym(id, name, half, o) { var s = shape(id, name, symBound(half), o); s.half = half.length; s.mirror = true; return s; }
  function tweakHalf(half, changes) { return half.map(function (a, i) { var c = changes[i]; return c ? [a[0] + c[0], a[1] + (c[1] || 0), a[2]] : a; }); }
  function circle(cx, cy, r) { return [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]; }
  // a point locked to the nearest edge of a shape that already exists, o units outward (negative: inward); w = how free it is (0 root .. 1 tip)
  function Eat(sid, x, y, o, w, mode) {
    var hit = M.nearestEdge(shapes[sid].pts, x, y), p = P([0, 0, mode || 'c']);
    p.bind = { s: sid, e: hit.e, t: r2(hit.t), o: o || 0 };
    p.x = r2(hit.x + hit.nx * (o || 0)); p.y = r2(hit.y + hit.ny * (o || 0));
    if (w) p.w = w;
    return p;
  }
  function Fp(x, y, w, mode) { var p = P([x, y, mode || 'c']); if (w) p.w = w; return p; }
  // the right half of a symmetric outline, mirrored; edge locks follow to the twin edge of the symmetric shape they lock to
  function symEdge(half) {
    var out = half.slice();
    for (var k = half.length - 2; k >= 1; k--) {
      var p = half[k], q = { x: r2(200 - p.x), y: p.y, m: SWAP[p.m], hi: null, ho: null };
      if (p.w) q.w = p.w;
      if (p.bind) q.bind = M.mirrorEdge(p.bind, shapes[p.bind.s].pts.length);
      out.push(q);
    }
    return out;
  }
  // a band along an edge of a shape: samples [x, y] on that edge, the outer side o1 units out, the inner side o2 units in, the ends tapering by `taper`
  function band(sid, samples, o1, o2, taper) {
    var n = samples.length, out = [], inn = [];
    samples.forEach(function (s, i) {
      var f = n < 3 ? 1 : Math.sin(Math.PI * (i + 0.5) / n), tp = taper == null ? 0.25 : taper, k = tp + (1 - tp) * f;
      var sd = s[2] || sid;
      out.push(Eat(sd, s[0], s[1], o1));
      inn.push(Eat(sd, s[0], s[1], -o2 * k));
    });
    return out.concat(inn.reverse());
  }
  var shadeShapes = [];
  // a shading shape: sits on top of its object as a whole, in one tone step (shadow / mid / highlight) from the object's colour
  function shade(id, name, list, kind, z, o) {
    var s = shape(id, name, list, Object.assign({ z: z, slot: 'skin', shade: { kind: kind, t: 0.12 }, op: 1 }, o || {}));
    shadeShapes.push(id); return s;
  }
  function shadePair(idR, nameR, idL, z, o) { shapes[idL].side = 'L'; return shape(idR, nameR, [], Object.assign({ mirrorOf: idL, side: 'R', z: z, slot: shapes[idL].slot, shade: Object.assign({}, shapes[idL].shade) }, o || {})); }

  // ===== BODY (skin, drawn first) =====
  // --- head and face: the EXACT shapes the old portrait engine draws, converted path by path (data exported from the old engine: every shape as points with explicit handles, in its
  // own paint order, with how its colour derives from the character's: the colour itself, or a shade of it). The old adult head is 92 units tall in its 200-unit tile; here it is
  // 54 tall (HS = 54 / 92), which keeps every proportion. Light comes from the upper left, as in the old drawing; there are shadows and no highlights.
  var EXD = root.ExactDefault || { shapes: [], options: {}, bases: {} }, HS = 54 / 92;
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function exPt(a) {
    var m = a[2], p = { x: r3(100 + (a[0] - 100) * HS), y: r3(62 - (123 - a[1]) * HS), m: m, hi: null, ho: null };
    if (m === 'c') { p.hi = [r3(a[3] * HS), r3(a[4] * HS)]; p.ho = [r3(a[5] * HS), r3(a[6] * HS)]; }
    else if (m === 'cs') p.hi = [r3(a[3] * HS), r3(a[4] * HS)];
    else if (m === 'sc') p.ho = [r3(a[3] * HS), r3(a[4] * HS)];
    return p;
  }
  function exList(n) { return n.map(exPt); }
  // the slot of each base colour of the old engine
  var EXSLOT = { skin: 'skin', hair: 'hair', brow: 'hair', lip: 'lip', eye: 'eye', top: 'cloth', facial: 'hair' };
  // how a converted shape is painted: a slot (and a tone of it), a colour of its own (the white of an eye, the pupil, the lashes), and its opacity
  function exLook(s) {
    var c = s.c;
    if (!c || c[0] === 'white' || !EXSLOT[c[0]]) return { slot: 'skin', hex: s.f, op: s.o };
    var look = { slot: EXSLOT[c[0]], op: s.o };
    if (c[0] === 'brow' && c[1] === 'base') look.fn = { kind: 'shadow', t: 0.1 };            // the brows follow the hair, a tenth darker (the old default)
    else if (c[1] === 'tone') look.fn = { kind: 'shadow', t: c[2] };                        // the back hair: a mass of its own, painted a tone darker than the hair
    else if (c[1] === 'shade') look.shade = { kind: 'shadow', t: c[2] };
    else if (c[1] !== 'base') look.hex = s.f;
    return look;
  }
  var EXROLE = {
    head: ['Head', 'Shade plane of the head'],
    ears: ['Ear (left)', 'Ear (right)', 'Inner ear (left)', 'Inner ear (right)'],
    brows: ['Brow (left)', 'Brow (right)', 'Brow 3', 'Brow 4'],
    nose: ['Bridge shade', 'Tip shade', 'Wing (left)', 'Nostril (left)', 'Wing (right)', 'Nostril (right)', 'Nose shade 7'],
    mouth: ['Shade under the lips', 'Shade of the lower lip', 'Lips', 'Mouth line'],
    hairOld: ['Hair', 'Hair shade']
  };
  var EXEYE = ['Lid shade', 'Eye white', 'Iris', 'Iris shade', 'Pupil', 'Gleam', 'Lash line', 'Extra'];
  var exPart = {};
  EXD.shapes.forEach(function (s, i) { (exPart[s.p] = exPart[s.p] || []).push({ s: s, i: i }); });
  // each part's option lists, keyed by the part's name
  var EXOPT = { head: EXD.options.headShape, ears: EXD.options.ears, eyes: EXD.options.eyes, brows: EXD.options.brows, nose: EXD.options.nose, mouth: EXD.options.mouth };
  var EXAXIS = { head: ['headShape', 'Head shape', 'oval'], ears: ['ears', 'Ears', 'average'], eyes: ['shape', 'Eye shape', 'almond'], brows: ['shape', 'Brow shape', 'soft'], nose: ['shape', 'Nose shape', 'straight'], mouth: ['shape', 'Mouth shape', 'medium'] };
  var faceObjs = {}, faceShapeIds = {};
  // makes the shapes of one part: one slot for the most shapes any option uses; the default list fills the first slots; every option's list is a form of the slots
  function exPartBuild(part, objId, objName, zBase, o) {
    o = o || {};
    var dflt = exPart[part] || [], opts = EXOPT[part] || [], n = dflt.length;
    opts.forEach(function (op) { n = Math.max(n, op.shapes.length); });
    var ids = [], base = [], shd = [];
    for (var k = 0; k < n; k++) {
      var d = dflt[k], id = (k === 0 && o.firstId) ? o.firstId : (o.idPrefix || part) + '_' + k, name;
      if (part === 'eyes') name = k < 14 ? EXEYE[k % 7] + (k < 7 ? ' (left)' : ' (right)') : 'Extra eye shape ' + (k - 13);
      else name = (EXROLE[part] && EXROLE[part][k]) || (o.title || part) + ' ' + (k + 1);
      var look = d ? exLook(d.s) : { slot: 'skin', op: 1 };
      var props = { z: zBase + k * 0.003, slot: look.slot, op: look.op, view: o.view || 'front', noClip: true, tone: 0 };
      if (look.hex) props.hex = look.hex;
      if (look.fn) props.fn = look.fn;
      if (look.shade) props.shade = { kind: look.shade.kind, t: look.shade.t };
      shape(id, name, d ? exList(d.s.n) : [], props);
      ids.push(id);
      (look.shade && dflt.some(function (q) { return !exLook(q.s).shade; }) ? shd : base).push(id);
    }
    var ob = { id: objId, name: objName, layer: o.layer || 'body', shapes: base, shade: shd, axes: [] };
    var ax = EXAXIS[part];
    if (ax && opts.length) {
      ob.axes.push({ id: ax[0], name: ax[1], def: ax[2], options: opts.map(function (op) {
        var ovr = {};
        for (var k2 = 0; k2 < n; k2++) { var sh = op.shapes[k2]; ovr[ids[k2]] = sh ? { pts: exList(sh.n), look: exLook(sh) } : { pts: [], look: { slot: 'skin', op: 1 } }; }
        // the default option is the base shapes themselves
        return { id: op.id, name: op.name, ovr: op.id === ax[2] ? null : ovr };
      }) });
    }
    faceObjs[objId] = ob; faceShapeIds[objId] = ids;
    return ob;
  }
  // paint order of the old engine: ears, head, brows, eyes, nose, mouth, hair
  exPartBuild('ears', 'ears', 'Ears', 38.00, { idPrefix: 'ear' });
  exPartBuild('head', 'skull', 'Head', 38.20, { idPrefix: 'hd', firstId: 'skull', view: 'both' });
  exPartBuild('brows', 'brows', 'Brows', 38.40);
  exPartBuild('eyes', 'eyes', 'Eyes', 38.50);
  exPartBuild('nose', 'nose', 'Nose', 38.60);
  exPartBuild('mouth', 'mouth', 'Mouth', 38.70);
  exPartBuild('hairFront', 'hairOld', 'Hair (the old drawing, short)', 38.80, { layer: 'hair', view: 'both', idPrefix: 'hairOld' });
  if (faceObjs.hairOld) faceObjs.hairOld.shapes = faceObjs.hairOld.shapes.slice();
  // the head outline is symmetric: its half runs from the top of the axis to the bottom of it
  (function () { var l = shapes.skull.pts, k = 1; while (k < l.length && Math.abs(l[k].x - 100) > 0.01) k++; shapes.skull.mirror = true; shapes.skull.half = k + 1; })();

  // --- neck and torso: neck, chest, abdomen, pelvis
  symShape('neck', 'Neck', [[100, 54, 's'], [108.5, 54, 's'], [108.5, 68], [112, 77, 's'], [108, 82], [100, 86]], { z: 29, slot: 'skin', tone: -1 });
  var chestHalf = [[100, 80], [111, 77, 's'], [134, 81], [147, 89], [144, 106], [138, 126], [135, 142], [100, 146, 's']];
  symShape('chest', 'Chest', chestHalf, { z: 26, slot: 'skin' });
  symShape('abdomen', 'Abdomen', [[100, 132], [137, 132, 's'], [134, 148], [138, 164], [100, 170, 's']], { z: 25, slot: 'skin' });
  symShape('pelvis', 'Pelvis', [[100, 160], [139, 160, 's'], [140, 178], [134, 192], [100, 198, 's']], { z: 24, slot: 'skin' });
  // --- arms: shoulder cap, upper arm, elbow cap, forearm, hand
  // the shoulder joint is its own group (a ball that the arm hangs from); the upper arm is its child
  shape('shoulderL', 'Shoulder joint', pts([[147, 84.4], [152.4, 86.4], [154.4, 91.2], [152.2, 96.2], [147, 97.8], [141.8, 95.6], [139.8, 91], [141.8, 86.2]]), { z: 27.4, slot: 'skin' });
  pair('shoulderR', 'Shoulder joint (right)', 'shoulderL', { z: 27.4, slot: 'skin', group: 'shoulderR' });
  shape('uarmL', 'Upper arm', pts([[140, 84], [152, 86], [155, 106], [153.5, 142, 's'], [144.5, 142, 's'], [141.5, 108], [139.5, 95]]), { z: 26.5, slot: 'skin' });
  pair('uarmR', 'Upper arm (right)', 'uarmL', { z: 26.5, slot: 'skin', group: 'armR' });
  shape('elbowL', 'Elbow', pts(circle(149, 143, 4.5)), { z: 28, slot: 'skin' });
  pair('elbowR', 'Elbow (right)', 'elbowL', { z: 28, slot: 'skin', group: 'foreR' });
  shape('foreL', 'Forearm', pts([[144.5, 141, 's'], [153.5, 141, 's'], [155, 172], [152.5, 198, 's'], [145, 198, 's'], [143.5, 172]]), { z: 27, slot: 'skin' });
  pair('foreR', 'Forearm (right)', 'foreL', { z: 27, slot: 'skin', group: 'foreR' });
  shape('handL', 'Hand', pts([[143.5, 197, 's'], [153, 197, 's'], [155.5, 211], [154, 224], [148.5, 229], [143.5, 223], [142.5, 209]]), { z: 29, slot: 'skin' });
  pair('handR', 'Hand (right)', 'handL', { z: 29, slot: 'skin', group: 'handR' });
  shape('thumbL', 'Thumb', pts([[142.5, 205], [137.5, 212], [138.5, 222], [143.5, 220]]), { z: 29.5, slot: 'skin', tone: 1 });
  pair('thumbR', 'Thumb (right)', 'thumbL', { z: 29.5, slot: 'skin', tone: 1, group: 'handR' });
  // --- legs and feet: leg, then ankle, foot, ball, toes
  shape('legL', 'Leg', pts([[102, 178, 's'], [140, 178, 's'], [136, 212], [129, 264], [125, 322], [121, 356, 's'], [108, 356, 's'], [108, 314], [104, 252], [101, 212]]), { z: 23, slot: 'skin' });
  pair('legR', 'Leg (right)', 'legL', { z: 23, slot: 'skin', group: 'legR' });
  shape('ankleL', 'Ankle', pts([[108.5, 350, 's'], [120.5, 350, 's'], [121, 363], [108, 363]]), { z: 22.4, slot: 'skin' });
  pair('ankleR', 'Ankle (right)', 'ankleL', { z: 22.4, slot: 'skin', group: 'footR' });
  shape('instepL', 'Foot', pts([[107, 362, 's'], [122, 362, 's'], [124, 375], [105, 375]]), { z: 22.3, slot: 'skin' });
  pair('instepR', 'Foot (right)', 'instepL', { z: 22.3, slot: 'skin', group: 'footR' });
  shape('ballL', 'Ball of the foot', pts([[105, 374, 's'], [126, 374, 's'], [127, 384], [104, 384]]), { z: 22.2, slot: 'skin' });
  pair('ballR', 'Ball of the foot (right)', 'ballL', { z: 22.2, slot: 'skin', group: 'footR' });
  shape('toesL', 'Toes', pts([[104, 383, 's'], [127, 383, 's'], [127.5, 390], [125, 394], [106, 394], [103.5, 390]]), { z: 22.1, slot: 'skin' });
  pair('toesR', 'Toes (right)', 'toesL', { z: 22.1, slot: 'skin', group: 'footR' });

  // ===== JOINTS: skin where two body parts meet, so the body does not read as doll parts (trapezius, deltoid, obliques, hips, elbow, wrist, thigh). A joint is a BRIDGE: four
  // points A1, B1, B2, A2 locked to the edges of the two parts it joins (a part in a parent group counts too); its two sides run from part A to part B leaving and arriving along the
  // direction of each part's own edge, so the skin runs on smoothly through the bend whatever the angle of the parts. A joint is the same layer as the body parts (all the skin of the
  // body is one surface, drawn in one pass), has the skin colour, and has no outline of its own; the shading lies over all of it. =====
  function Br(sid, x, y, o) { var p = Eat(sid, x, y, o); p.bind.tan = 1; return p; }
  function bridge(id, name, a1, b1, b2, a2, z, group) {
    a1.m = 'sc'; b1.m = 'cs'; b2.m = 'sc'; a2.m = 'cs';
    var s = shape(id, name, [a1, b1, b2, a2], { z: z, slot: 'skin', joint: true, bridge: true, group: group }); if (!group) delete s.group; return s;
  }
  function bridgePair(idR, nameR, idL, z, group) { shapes[idL].side = 'L'; var s = shape(idR, nameR, [], { mirrorOf: idL, side: 'R', z: z, slot: 'skin', joint: true, bridge: true, group: group }); if (!group) delete s.group; return s; }
  // trapezius: the slope from the side of the neck out along the top of the chest (fills the corner where the neck meets the shoulder line)
  bridge('trapL', 'Trapezius', Br('neck', 108.5, 63, 0), Br('chest', 126, 79.4, 0), Br('chest', 124, 80, -4.5), Br('neck', 108.5, 71, -4.5), 26.2);
  bridgePair('trapR', 'Trapezius (right)', 'trapL', 26.2);
  // obliques: the flank between the chest and the abdomen
  bridge('oblL', 'Obliques', Br('chest', 138, 126, 0), Br('abdomen', 135.2, 150, 0), Br('abdomen', 133, 150, -5), Br('chest', 137, 126, -5), 25.6);
  bridgePair('oblR', 'Obliques (right)', 'oblL', 25.6);
  // hips: the abdomen into the pelvis
  bridge('hipL', 'Hip blend', Br('abdomen', 137.4, 158, 0), Br('pelvis', 139.9, 172, 0), Br('pelvis', 139, 172, -5), Br('abdomen', 137, 158, -5), 24.5);
  bridgePair('hipR', 'Hip blend (right)', 'hipL', 24.5);
  // shoulder (deltoid): the top of the chest into the outer edge of the upper arm over the shoulder, and the side of the chest into the inner edge of the arm at the armpit
  bridge('deltL', 'Deltoid', Br('chest', 131, 80.4, 0), Br('uarmL', 154.3, 92, 0), Br('uarmL', 141.2, 97, 0), Br('chest', 145, 101, 0), 27.3, 'armL').bridgeK = 0.3;
  bridgePair('deltR', 'Deltoid (right)', 'deltL', 27.3, 'armR');
  // elbow: the upper arm into the forearm
  bridge('elbL', 'Elbow blend', Br('uarmL', 153.6, 133, 0), Br('foreL', 154.8, 152, 0), Br('foreL', 144.2, 152, 0), Br('uarmL', 144.6, 133, 0), 27.6, 'foreL');
  bridgePair('elbR', 'Elbow blend (right)', 'elbL', 27.6, 'foreR');
  // wrist: the forearm into the hand
  bridge('wriL', 'Wrist blend', Br('foreL', 153.8, 186, 0), Br('handL', 154.6, 208, 0), Br('handL', 143.2, 208, 0), Br('foreL', 144.6, 186, 0), 29.2, 'handL');
  bridgePair('wriR', 'Wrist blend (right)', 'wriL', 29.2, 'handR');
  // thigh: the pelvis into the leg
  bridge('thiL', 'Thigh blend', Br('pelvis', 140, 168, 0), Br('legL', 137.8, 196, 0), Br('legL', 136, 196, -6), Br('pelvis', 138.6, 168, -6), 23.2, 'legL');
  bridgePair('thiR', 'Thigh blend (right)', 'thiL', 23.2, 'legR');

  // ===== SHADING (the old drawing's way: a shadow is one tone step of the object's colour, `shade(colour, t)`, laid over the object; the light comes from the upper left, so the
  // picture's right side (the character's left) is shaded more. No highlights in the old drawing; the layer kinds are still there for the designer.)
  // A shadow of the body is ONE shape that runs on from a part over the joint into the next part: its points are locked to the edge of whatever skin lies there (a part or a joint), so it
  // flows across the join and follows both parts when they move. Creases are shadows that appear as a joint bends (their opacity follows the slider). =====
  shade('neckShade', 'Under the chin', symEdge([Fp(100, 57), Eat('neck', 108.5, 60.5, 1.8), Eat('neck', 108.5, 67.5, 1.8), Fp(105, 71.2), Fp(100, 72.6)]), 'shadow', 29.02, { mirror: true, half: 5, shade: { kind: 'shadow', t: 0.16 } });
  // the side of the torso: from under the arm over the chest, the obliques, the abdomen and the hip joint to the pelvis
  shade('flankShadeL', 'Side of the torso', band('chest', [[146.6, 94], [144.6, 103], [141.8, 114], [138.8, 124], [137.6, 131, 'oblL'], [136.6, 138, 'oblL'], [135.6, 146, 'oblL'], [135.4, 153, 'abdomen'], [136.6, 158, 'abdomen'], [138.6, 164, 'hipL'], [139.6, 169, 'hipL'], [139.8, 175, 'pelvis'], [137.8, 185, 'pelvis'], [134.4, 192, 'pelvis']], 2.2, 3.8, 0.08), 'shadow', 26.02, { shade: { kind: 'shadow', t: 0.12 } });
  shadePair('flankShadeR', 'Side of the torso (right)', 'flankShadeL', 26.02, { shade: { kind: 'shadow', t: 0.07 } });
  // the inner side of the arm: from the shoulder over the elbow joint to the wrist
  shade('armShadeL', 'Inner side of the arm', band('uarmL', [[140.4, 99], [141.4, 108], [143, 124], [144.2, 134], [144.4, 141, 'elbL'], [144.4, 146, 'elbL'], [144.2, 152, 'foreL'], [143.7, 165, 'foreL'], [144.2, 185, 'foreL'], [145.2, 196, 'foreL']], 2.2, 3.4, 0.1), 'shadow', 26.52, { shade: { kind: 'shadow', t: 0.14 } });
  shadePair('armShadeR', 'Inner side of the arm (right)', 'armShadeL', 26.52, { shade: { kind: 'shadow', t: 0.08 } });
  shade('legShadeL', 'Inner side of the leg', band('legL', [[107.8, 330], [106, 290], [103.4, 250], [101.4, 212], [101.4, 186]], 2.2, 4.4, 0.1), 'shadow', 23.02, { shade: { kind: 'shadow', t: 0.14 } });
  shadePair('legShadeR', 'Inner side of the leg (right)', 'legShadeL', 23.02, { shade: { kind: 'shadow', t: 0.08 } });
  // creases: the inside of a bend darkens as the joint bends (and the outside stretches smooth, because the joint's outline is one curve). Opacity follows the slider.
  shade('elbowCreaseL', 'Crease of the elbow', band('elbL', [[153.8, 123, 'uarmL'], [153.9, 128.5, 'uarmL'], [154.2, 134.5], [154.4, 139], [154.6, 144], [154.7, 148.5], [154.9, 156, 'foreL'], [155, 163, 'foreL']], 0.2, 1.9, 0.1), 'shadow', 27.7, { shade: { kind: 'shadow', t: 0.2 }, opBy: { slider: 'elbow', from: 8, to: 110 } });
  shadePair('elbowCreaseR', 'Crease of the elbow (right)', 'elbowCreaseL', 27.7, { shade: { kind: 'shadow', t: 0.2 }, opBy: { slider: 'elbow', from: 8, to: 110 } });
  shade('armpitCreaseL', 'Crease of the armpit', band('deltL', [[141.2, 97.6], [142.6, 99.2], [144, 100.2], [145.2, 101]], 0.2, 1.5, 0.3), 'shadow', 27.5, { shade: { kind: 'shadow', t: 0.2 }, opBy: { slider: 'shoulder', from: 8, to: 70 } });
  shadePair('armpitCreaseR', 'Crease of the armpit (right)', 'armpitCreaseL', 27.5, { shade: { kind: 'shadow', t: 0.2 }, opBy: { slider: 'shoulder', from: 8, to: 70 } });
  shade('kneeCreaseL', 'Crease of the knee', band('legL', [[134.4, 238], [131.8, 252], [129.8, 262], [128.2, 272], [127, 284]], 0.2, 2.0, 0.1), 'shadow', 23.4, { shade: { kind: 'shadow', t: 0.2 }, opBy: { slider: 'knee', from: 6, to: 55 } });
  shadePair('kneeCreaseR', 'Crease of the knee (right)', 'kneeCreaseL', 23.4, { shade: { kind: 'shadow', t: 0.2 }, opBy: { slider: 'knee', from: 6, to: 55 } });
  // the pair twins that live in the mirror groups
  shapes.kneeCreaseR.group = 'legR';
  shapes.armShadeR.group = 'foreR'; shapes.legShadeR.group = 'legR'; shapes.elbowCreaseR.group = 'foreR'; shapes.armpitCreaseR.group = 'armR';

  // ===== the skin as layers by depth, the way the body stands: the legs behind the torso, the torso behind the arms. Inside a depth the parts and the joints are one layer (drawn in one pass,
  // the same skin colour, no outline), and the shading of that depth is ONE layer over ALL of them (above the highest part or joint of the depth, below the next depth), so a joint never
  // covers a shadow and a shadow can run across a joint. [lowest z, highest z, z of the shading layer] =====
  M.SKIN_BANDS = [[22, 24, 23.5], [24, 26.5, 26.3], [26.5, 28.5, 28.1]];
  Object.keys(shapes).filter(function (id) { return shapes[id].shade && shapes[id].slot === 'skin'; }).sort(function (a, b) { return shapes[a].z - shapes[b].z; }).forEach(function (id, i) {
    var z0 = shapes[id].z;
    M.SKIN_BANDS.forEach(function (bd, bi) { if (z0 >= bd[0] && z0 < bd[1]) { shapes[id].band = bi; shapes[id].z = bd[2] + i * 0.0001; } });
  });

  // ===== HAIR: sections of the head by plane (front, top, left side, right side, back, nape) and side (left, right, centre) =====
  // each section is its own object: a piece rooted on the skull's edge, with its own length, shape (cut), texture and colour
  var HAIR_PLANES = [['front', 'Front'], ['top', 'Top'], ['left', 'Left side'], ['right', 'Right side'], ['back', 'Back'], ['nape', 'Nape']];
  var HAIR_SIDES = [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']];
  var hairCells = [];
  function Rt(x, y, o) { return Eat('skull', x, y, o == null ? -0.3 : o, 0); }
  function T(x, y, w) { return Fp(x, y, w == null ? 1 : w); }
  // more points along the free edge, so a texture has something to bend
  function dense(list) {
    var out = [];
    list.forEach(function (p, i) {
      out.push(p);
      var q = list[i + 1]; if (!q || p.bind || q.bind || (p.w || 0) < 0.9 || (q.w || 0) < 0.9) return;
      out.push(Fp(r2((p.x + q.x) / 2), r2((p.y + q.y) / 2), 1));
    });
    return out;
  }
  function mirrorPts(list) {
    // the same piece on the other side: free points reflect; roots lock to the twin edge of the skull
    return list.map(function (p) {
      var q = { x: r2(200 - p.x), y: p.y, m: p.m, hi: null, ho: null };
      if (p.w) q.w = p.w;
      if (p.bind) q.bind = M.mirrorEdge(p.bind, shapes.skull.pts.length);
      return q;
    }).reverse();
  }
  // the sheen across a section (a curved band) and the shaded ends (a band along the tips)
  function lens(list, kind) {
    var roots = list.filter(function (p) { return !p.w; }), tips = list.filter(function (p) { return p.w === 1; });
    var cx = function (a) { return a.reduce(function (s, p) { return s + p.x; }, 0) / (a.length || 1); }, cy = function (a) { return a.reduce(function (s, p) { return s + p.y; }, 0) / (a.length || 1); };
    var x0 = cx(roots), y0 = cy(roots), x1 = cx(tips), y1 = cy(tips), xs = tips.map(function (p) { return p.x; }).concat(roots.map(function (p) { return p.x; })), span = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    var hw = Math.max(2.2, span * 0.4), at = function (t, sx) { return Fp(r2(x0 + (x1 - x0) * t + sx * hw), r2(y0 + (y1 - y0) * t), Math.min(1, t)); };
    var ss = [-0.9, -0.45, 0, 0.45, 0.9], up = [], lo = [];
    ss.forEach(function (sx) {
      if (kind === 'highlight') { var tc = 0.36 - 0.1 * (1 - sx * sx), th = 0.06 * (1 - 0.6 * sx * sx); up.push(at(tc - th, sx)); lo.push(at(tc + th, sx)); }
      else { var tb = 0.86 + 0.05 * sx * sx; up.push(at(tb, sx)); lo.push(at(1.12, sx)); }
    });
    return up.concat(lo.reverse());
  }
  // [plane, side, z, back-view z, root points..., then the free points] on the character's left (the picture's right); the other side is its mirror
  var defs = {
    'top.center': { z: 9.5, zb: 53, def: 100, min: 0, max: 300, list: [Rt(92.5, 9.2), Rt(100, 8), Rt(107.5, 9.2), T(112, 6.6), T(106, 4.2), T(100, 3.2), T(94, 4.2), T(88, 6.6)] },
    'top.left': { z: 9.5, zb: 53, def: 100, min: 0, max: 300, list: [Rt(108, 9.2), Rt(112.3, 12), Rt(115.2, 16.6), T(118.4, 18.8), T(117.6, 12.8), T(113.8, 8.2), T(109, 5.4)] },
    'front.center': { z: 51, zb: 5, def: 100, min: 10, max: 200, list: [Rt(93, 8.8, 0), Rt(100, 8, 0), Rt(107, 8.8, 0), T(107.4, 19.4), T(103.6, 21.4), T(100, 22.2), T(96.4, 21.4), T(92.6, 19.4)] },
    'front.left': { z: 51, zb: 5, def: 100, min: 10, max: 200, list: [Rt(107, 8.8, 0), Rt(111.3, 11.2, 0), Rt(114.5, 15.2, 0), Rt(116.7, 20.9, 0), T(117.6, 28.2), T(113.5, 25.2), T(109.5, 22.4), T(107.4, 19.4)] },
    'left.center': { z: 52, zb: 50, def: 60, min: 10, max: 150, list: [Rt(116.8, 22, -0.6), Rt(119.2, 32, -0.6), Rt(119, 40, -0.6), Rt(117.5, 46.2, -0.6), T(116.4, 72), T(123.5, 72), T(124.6, 50, 0.6), T(123.4, 34, 0.35), T(121.6, 25, 0.1)] },
    'back.center': { z: 10, zb: 52, def: 100, min: 10, max: 150, list: [Rt(92, 9.4, 0), Rt(100, 8, 0), Rt(108, 9.4, 0), T(108.2, 34, 0.4), T(108.4, 60, 0.7), T(108.5, 84), T(104, 86), T(100, 86.6), T(96, 86), T(91.5, 84), T(91.6, 60, 0.7), T(91.8, 34, 0.4)] },
    'back.left': { z: 10, zb: 52, def: 100, min: 10, max: 150, list: [Rt(108, 9.4, 0), Rt(112, 11.6, 0), Rt(115.2, 16, 0), Rt(117.6, 24, 1.2), T(123.8, 36, 0.25), T(124.4, 52, 0.5), T(121, 72, 0.8), T(118, 84), T(112.5, 86), T(108.6, 84), T(108.4, 60, 0.7), T(108.2, 34, 0.4)] },
    'nape.center': { z: 9, zb: 51, def: 100, min: 10, max: 300, list: [Rt(105, 60.8, -0.5), Rt(100, 62, -0.5), Rt(95, 60.8, -0.5), T(95, 74), T(100, 75.4), T(105, 74)] },
    'nape.left': { z: 9, zb: 51, def: 100, min: 10, max: 300, list: [Rt(114.8, 52, -0.4), Rt(111, 57.4, -0.4), Rt(105.8, 61.1, -0.4), T(105.4, 74.4), T(110.6, 72), T(114, 64, 0.7)] }
  };
  var cellList = [['front', 'center'], ['front', 'left'], ['front', 'right'], ['top', 'center'], ['top', 'left'], ['top', 'right'], ['left', 'center'], ['right', 'center'], ['back', 'center'], ['back', 'left'], ['back', 'right'], ['nape', 'center'], ['nape', 'left'], ['nape', 'right']];
  var cutOpts = ['blunt', 'taper', 'round', 'layered'];
  function cutOf(list, kind) {
    if (kind === 'blunt') return null;
    var tips = list.filter(function (p) { return p.w === 1; }), n = tips.length, xs = tips.map(function (p) { return p.x; }), cxm = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, half = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 || 1, j = 0;
    return list.map(function (p) {
      var q = clone(p); if (p.w !== 1) return q;
      var u = (p.x - cxm) / half, a = Math.abs(u);
      if (kind === 'taper') { q.x = r2(cxm + (p.x - cxm) * (1 - 0.6 * a)); q.y = r2(p.y + (1 - a) * 5 - a * 1.5); }
      else if (kind === 'round') { q.y = r2(p.y + (1 - u * u) * 4 - 1.4); }
      else { q.y = r2(p.y + (j % 2 ? -3.6 : 1.6)); }
      j++; return q;
    });
  }
  var hairObjs = [], hairRanges = [], hairAll = { back: [], side: [], nape: [] };
  cellList.forEach(function (c) {
    var plane = c[0], side = c[1], cid = plane + '.' + side;
    var srcKey = plane === 'right' ? 'left.center' : (side === 'right' ? plane + '.left' : cid), d = defs[srcKey], list = (side === 'right' || plane === 'right') ? mirrorPts(d.list) : d.list;
    list = dense(list);
    if (side === 'right') list = list.slice(); // already in order
    var pid = 'hr_' + plane + '_' + side, oid = 'hair.' + cid, planeName = HAIR_PLANES.filter(function (x) { return x[0] === plane; })[0][1], sideName = HAIR_SIDES.filter(function (x) { return x[0] === side; })[0][1];
    var title = plane === 'left' || plane === 'right' ? planeName : planeName + ', ' + sideName.toLowerCase();
    shape(pid, 'Hair piece: ' + title, list, { z: d.z, zBack: d.zb, slot: 'hair', cell: cid, tone: 0 });
    var sh = lens(list, 'shadow');
    var shadeIds = [];
    if (plane !== 'front' && plane !== 'top') {
      shade('hs_' + plane + '_' + side, 'Hair shade: ' + title, sh, 'shadow', d.z + 0.01, { slot: 'hair', cell: cid, zBack: d.zb + 0.01, op: 0.45, shade: { kind: 'shadow', t: 0.22 } });
      shadeIds.push('hs_' + plane + '_' + side);
    }
    var cutAxis = { id: 'cut', name: 'Cut', def: 'blunt', options: cutOpts.map(function (k) { var o = cutOf(list, k); return { id: k, name: k.charAt(0).toUpperCase() + k.slice(1), ovr: o ? (function () { var r = {}; r[pid] = o; return r; })() : null }; }) };
    hairObjs.push({ id: oid, name: 'Hair: ' + title, layer: 'hair', cls: true, cell: cid, plane: plane, side: side, shapes: [pid], shade: shadeIds, axes: [cutAxis] });
    var ids = [pid].concat(shadeIds), rootY = plane === 'top' || plane === 'front' ? 8 : plane === 'nape' ? 61 : plane === 'back' ? 9 : 22, ph = (cid.length * 1.7) % 6.28;
    var rg = function (id, name, min, max, def, unit, ops, o) { var r = { id: id, name: name, scope: oid, min: min, max: max, def: def, unit: unit, ops: ops, show: true }; for (var k in (o || {})) r[k] = o[k]; return r; };
    hairRanges.push(rg('len:' + cid, 'Length', d.min, d.max, d.def, '%', [{ op: 'stretch', shapes: ids, root: [100, rootY], sx: 0 }], { cell: cid, kind: 'len', rand: [Math.max(d.min, d.def * 0.5), Math.min(d.max, d.def * 1.3)] }));
    hairRanges.push(rg('tex:' + cid, 'Texture', 0, 99, 0, '', [{ op: 'wave', shapes: ids, amp: 3.1, f0: 0.55, f1: 1.6, phase: ph }], { cell: cid, kind: 'tex', step: 33, labels: ['Straight', 'Wavy', 'Curly', 'Coily'] }));
    if (plane === 'back' || plane === 'left' || plane === 'right') hairAll.back.push.apply(hairAll.back, ids);
    hairCells.push({ id: cid, plane: plane, side: side, obj: oid, shape: pid, name: title });
  });

  // ===== CLOTHES (draped: every point follows a body point) =====
  var shirtHalf = [Bd('chest', 0, [0, -4], 0, 's'), Bd('chest', 1, [3.5, -1], 0, 's'), Bd('chest', 2, [0, -1], 2.4), Bd('chest', 3, [0, -1], 2.8), Bd('chest', 4, [0, 0], 2.6), Eat('oblL', 137.4, 130, 3.2), Eat('oblL', 135.8, 143, 3.2), Bd('abdomen', 3, [0, 14], 3.6, 's'), Bd('abdomen', 4, [0, 8], 0, 's')];
  boundSym('shirt', 'Shirt', shirtHalf, { z: 30, slot: 'cloth', loose: 'looseTop', cut: ['neckHole'] });
  // the neckline is a cutout: a helper shape cut out of the shirt, with forms (round, V, high)
  var holeRound = [Bd('chest', 0, [0, -5], 0), Bd('chest', 1, [-0.5, -1], 0), Bd('chest', 1, [-1, 7], 0), Bd('chest', 0, [0, 11], 0)];
  var holeV = [Bd('chest', 0, [0, -5], 0), Bd('chest', 1, [-0.5, -1], 0), Bd('chest', 1, [-4, 10], 0), Bd('chest', 0, [0, 20], 0, 's')];
  var holeHigh = [Bd('chest', 0, [0, -5], 0), Bd('chest', 1, [-2.5, -1], 0), Bd('chest', 1, [-3, 3], 0), Bd('chest', 0, [0, 6], 0)];
  boundSym('neckHole', 'Neckline opening', holeRound, { z: 30.5, slot: 'cloth', helper: true });
  shapes.neckHole.back = symBound(holeHigh);
  var collarHalf = [Bd('neckHole', 3, [0, 0], 0), Bd('neckHole', 2, [0, 0], 0), Bd('neckHole', 1, [0, 0], 0), Bd('neckHole', 1, [0, 0], 3, 's'), Bd('neckHole', 2, [0, 0], 3.2), Bd('neckHole', 3, [0, 0], 3.4)];
  boundSym('collar', 'Collar', collarHalf, { z: 31, slot: 'cloth', tone: 1 });
  // the cap of a sleeve is locked to the edge of the deltoid (not to the bare upper arm), so even a snug sleeve covers the shoulder it drapes over
  var sleeveShort = [Eat('deltL', 138.5, 81.9, 1.4), Eat('deltL', 154.3, 84.4, 2.1), Bd('uarmL', 2, [0, 0], 2.8), Bd('uarmL', 2, [0, 12], 2.8, 's'), Bd('uarmL', 5, [0, 10], 2.8, 's'), Bd('uarmL', 6, [0, 0], 2.4)];
  var sleeveLongUp = [Eat('deltL', 138.5, 81.9, 1.4), Eat('deltL', 154.3, 84.4, 2.1), Bd('uarmL', 2, [0, 0], 2.8), Bd('uarmL', 3, [0, 0], 2.8, 's'), Bd('uarmL', 4, [0, 0], 2.8, 's'), Bd('uarmL', 5, [0, 0], 2.8), Bd('uarmL', 6, [0, 0], 2.4)];
  var sleeveLongFore = [Bd('foreL', 0, [0, 0], 2.4, 's'), Bd('foreL', 1, [0, 0], 2.4, 's'), Bd('foreL', 2, [0, 0], 2.6), Bd('foreL', 3, [0, -6], 2.4, 's'), Bd('foreL', 4, [0, -6], 2.4, 's'), Bd('foreL', 5, [0, 0], 2.6)];
  shape('sleeveUpL', 'Sleeve (upper arm)', sleeveShort, { z: 32, slot: 'cloth', loose: 'looseTop' });
  pair('sleeveUpR', 'Sleeve (upper arm, right)', 'sleeveUpL', { z: 32, slot: 'cloth', group: 'armR' });
  shape('sleeveForeL', 'Sleeve (forearm)', [], { z: 32, slot: 'cloth', loose: 'looseTop', group: 'foreL' });
  pair('sleeveForeR', 'Sleeve (forearm, right)', 'sleeveForeL', { z: 32, slot: 'cloth', group: 'foreR' });
  // trousers: the hip part follows the pelvis (torso group), each leg follows the leg
  boundSym('trouserHip', 'Trousers (hips)', [Bd('pelvis', 0, [0, 3], 0, 's'), Bd('pelvis', 1, [0, 3], 3, 's'), Eat('hipL', 139.4, 166, 3.4), Bd('pelvis', 3, [0, 2], 3.2), Bd('pelvis', 4, [0, -2], 0, 's')], { z: 28.2, slot: 'trouser', loose: 'looseBottom' });
  var trousers = [Bd('legL', 0, [0, -3], 0, 's'), Bd('legL', 1, [0, -3], 3, 's'), Eat('thiL', 138.4, 188, 3.2), Bd('legL', 3, [0, 0], 3.4), Bd('legL', 4, [0, 0], 3.4), Bd('legL', 5, [0, -6], 3.4, 's'), Bd('legL', 6, [0, -6], 3.4, 's'), Bd('legL', 7, [0, 0], 3), Bd('legL', 8, [0, 0], 3), Bd('legL', 9, [0, 0], 2.6)];
  shape('trouserL', 'Trouser leg', trousers, { z: 28.2, slot: 'trouser', loose: 'looseBottom' });
  pair('trouserR', 'Trouser leg (right)', 'trouserL', { z: 28.2, slot: 'trouser', group: 'legR' });
  var shoe = [Bd('instepL', 0, [0, -3], 1.8, 's'), Bd('instepL', 1, [0, -3], 1.8, 's'), Bd('instepL', 2, [0, 0], 2), Bd('ballL', 2, [0, 0], 2.2), Bd('toesL', 2, [0, 0], 2.4), Bd('toesL', 3, [0, 0], 2.4), Bd('toesL', 4, [0, 0], 2.4), Bd('toesL', 5, [0, 0], 2.4), Bd('ballL', 3, [0, 0], 2.2), Bd('instepL', 3, [0, 0], 2)];
  shape('shoeL', 'Shoe', shoe, { z: 28.21, slot: 'shoe' });
  pair('shoeR', 'Shoe (right)', 'shoeL', { z: 28.21, slot: 'shoe', group: 'footR' });
  // the hips part of the trousers belongs to the torso group
  shapes.trouserHip.group = 'torso';

  // ===== forms =====
  function ev(id, name, o) { return { id: id, name: name, ovr: o || null }; }
  var objects = {
    neck: { id: 'neck', name: 'Neck', layer: 'body', shapes: ['neck'], shade: ['neckShade'], axes: [] },
    chest: {
      id: 'chest', name: 'Chest', layer: 'body', shapes: ['chest'], shade: ['flankShadeL', 'flankShadeR'],
      axes: [{ id: 'chest', name: 'Chest', def: 'average', options: [
        ev('flat', 'Flat', { chest: sym(tweakHalf(chestHalf, { 3: [-1, 0], 4: [-2.5, 0], 5: [-1, 0] })) }),
        ev('average', 'Average'),
        ev('full', 'Full', { chest: sym(tweakHalf(chestHalf, { 3: [0.5, 0], 4: [2.5, 0.5], 5: [1.2, 0] })) })] }]
    },
    abdomen: { id: 'abdomen', name: 'Abdomen', layer: 'body', shapes: ['abdomen'], shade: [], axes: [] },
    pelvis: { id: 'pelvis', name: 'Pelvis', layer: 'body', shapes: ['pelvis'], shade: [], axes: [] },
    shoulder: { id: 'shoulder', name: 'Shoulder joint', layer: 'body', shapes: ['shoulderL', 'shoulderR'], axes: [] },
    uarm: { id: 'uarm', name: 'Upper arm', layer: 'body', shapes: ['uarmL', 'uarmR'], shade: [], axes: [] },
    elbow: { id: 'elbow', name: 'Elbow', layer: 'body', shapes: ['elbowL', 'elbowR'], axes: [] },
    forearm: { id: 'forearm', name: 'Forearm', layer: 'body', shapes: ['foreL', 'foreR'], shade: ['armShadeL', 'armShadeR'], axes: [] },
    hand: { id: 'hand', name: 'Hand', layer: 'body', shapes: ['handL', 'handR', 'thumbL', 'thumbR'], axes: [] },
    leg: { id: 'leg', name: 'Legs', layer: 'body', shapes: ['legL', 'legR'], shade: ['legShadeL', 'legShadeR', 'kneeCreaseL', 'kneeCreaseR'], axes: [] },
    ankle: { id: 'ankle', name: 'Ankle', layer: 'body', shapes: ['ankleL', 'ankleR'], axes: [] },
    foot: { id: 'foot', name: 'Foot', layer: 'body', shapes: ['instepL', 'instepR'], axes: [] },
    ball: { id: 'ball', name: 'Ball of the foot', layer: 'body', shapes: ['ballL', 'ballR'], axes: [] },
    toes: { id: 'toes', name: 'Toes', layer: 'body', shapes: ['toesL', 'toesR'], axes: [] },
    shirt: {
      id: 'shirt', name: 'Shirt', layer: 'clothing', shapes: ['shirt', 'neckHole'],
      axes: [{ id: 'neckline', name: 'Neckline', def: 'round', options: [ev('round', 'Round'), ev('v', 'V', { neckHole: symBound(holeV) }), ev('high', 'High', { neckHole: symBound(holeHigh) })] }]
    },
    collar: { id: 'collar', name: 'Collar', layer: 'clothing', shapes: ['collar'], axes: [] },
    sleeve: {
      id: 'sleeve', name: 'Sleeves', layer: 'clothing', shapes: ['sleeveUpL', 'sleeveUpR', 'sleeveForeL', 'sleeveForeR'],
      axes: [{ id: 'length', name: 'Sleeve length', def: 'short', options: [
        ev('none', 'Sleeveless', { sleeveUpL: [], sleeveForeL: [] }),
        ev('short', 'Short'),
        ev('long', 'Long', { sleeveUpL: sleeveLongUp, sleeveForeL: sleeveLongFore })] }]
    },
    trouser: { id: 'trouser', name: 'Trousers', layer: 'clothing', shapes: ['trouserHip', 'trouserL', 'trouserR'], axes: [] },
    shoe: { id: 'shoe', name: 'Shoes', layer: 'clothing', shapes: ['shoeL', 'shoeR'], axes: [] }
  };
  hairObjs.forEach(function (ob) { objects[ob.id] = ob; });
  Object.keys(faceObjs).forEach(function (k) { objects[k] = faceObjs[k]; });
  // the blends, one object each (a left and a right shape)
  [['trapezius', 'Trapezius', ['trapL', 'trapR']], ['obliques', 'Obliques', ['oblL', 'oblR']], ['hipBlend', 'Hip blend', ['hipL', 'hipR']], ['deltoid', 'Deltoid', ['deltL', 'deltR'], ['armpitCreaseL', 'armpitCreaseR']], ['elbowBlend', 'Elbow blend', ['elbL', 'elbR'], ['elbowCreaseL', 'elbowCreaseR']], ['wristBlend', 'Wrist blend', ['wriL', 'wriR']], ['thighBlend', 'Thigh blend', ['thiL', 'thiR']]].forEach(function (d) { objects[d[0]] = { id: d[0], name: d[1], layer: 'body', joint: true, shapes: d[2], shade: d[3] || [], axes: [] }; });
  // the old drawing's short hair is one shape rooted across the front and the top of the head
  objects.hairOld.cells = ['front.left', 'front.center', 'front.right', 'top.left', 'top.center', 'top.right'];
  // admin styles of the face classes: named looks of the sliders and the shape option
  function stl(id, name, val, forms) { return { id: id, name: name, snap: { val: val, forms: forms, off: [], col: {} } }; }
  objects.eyes.cls = true; objects.mouth.cls = true;
  objects.eyes.styles = [stl('sleepy', 'Sleepy', { eyeSize: 92, eyeSpacing: 0, eyeTilt: -4 }, { 'eyes.shape': 'heavy' }), stl('bright', 'Bright', { eyeSize: 110, eyeSpacing: 0, eyeTilt: 2 }, { 'eyes.shape': 'large' }), stl('wide', 'Wide-eyed', { eyeSize: 118, eyeSpacing: 0, eyeTilt: 0 }, { 'eyes.shape': 'doe' }), stl('soft', 'Soft', { eyeSize: 100, eyeSpacing: 0.6, eyeTilt: 3 }, { 'eyes.shape': 'almond' })];
  objects.mouth.styles = [stl('full', 'Full', { mouthSize: 105 }, { 'mouth.shape': 'full' }), stl('stern', 'Stern', { mouthSize: 92 }, { 'mouth.shape': 'thin' }), stl('smile', 'Smiling', { mouthSize: 108 }, { 'mouth.shape': 'upturned' }), stl('calm', 'Calm', { mouthSize: 100 }, { 'mouth.shape': 'medium' })];

  // --- groups: parent first. pivot = the point a group turns about; attach = where on the parent's shape it is fixed.
  var groups = [
    { id: 'torso', name: 'Torso', parent: null, pivot: [100, 150], objects: ['neck', 'trapezius', 'chest', 'obliques', 'abdomen', 'hipBlend', 'pelvis', 'shirt', 'collar'] },
    { id: 'head', name: 'Head', parent: 'torso', pivot: [100, 54], attach: { shape: 'neck', kind: 'point', i: 0, t: 1, slider: 'neckSlide', rx: 0.5, ry: 0 }, rot: { slider: 'headTilt', k: 0.6 }, scl: { slider: 'headSize', axis: 'xy' },
      objects: ['skull', 'ears', 'eyes', 'brows', 'nose', 'mouth'] },
    { id: 'hair', name: 'Hair', parent: 'head', pivot: [100, 54], objects: ['hairOld'].concat(hairObjs.map(function (o) { return o.id; })), sections: true },
    { id: 'shoulderL', name: 'Shoulder joint', parent: 'torso', pivot: [147, 89], attach: { shape: 'chest', kind: 'point', i: 3, t: 1, slider: 'neckSlide', rx: 0.5, ry: 0 }, rot: { slider: 'shrug', k: -0.5 }, objects: ['shoulder'] },
    { id: 'shoulderR', name: 'Shoulder joint (right)', parent: 'torso', mirrorOf: 'shoulderL', objects: [], hidden: true },
    { id: 'armL', name: 'Upper arm', parent: 'shoulderL', pivot: [147, 89], rot: { slider: 'shoulder', k: -1 }, objects: ['uarm', 'deltoid', 'sleeve'] },
    { id: 'armR', name: 'Upper arm (right)', parent: 'shoulderR', mirrorOf: 'armL', objects: [], hidden: true },
    { id: 'foreL', name: 'Elbow and forearm', parent: 'armL', pivot: [149, 143], rot: { slider: 'elbow', k: -1 }, objects: ['elbow', 'elbowBlend', 'forearm'] },
    { id: 'foreR', name: 'Elbow and forearm (right)', parent: 'armR', mirrorOf: 'foreL', objects: [], hidden: true },
    { id: 'handL', name: 'Hand', parent: 'foreL', pivot: [148.8, 198], rot: { slider: 'wrist', k: -1 }, objects: ['hand', 'wristBlend'] },
    { id: 'handR', name: 'Hand (right)', parent: 'foreR', mirrorOf: 'handL', objects: [], hidden: true },
    { id: 'legL', name: 'Leg', parent: 'torso', pivot: [121, 186], attach: { shape: 'pelvis', kind: 'inside', i: 0, t: 1, slider: 'neckSlide', rx: 0.7625, ry: 0.6842 }, rot: { slider: 'legSpread', k: -1 }, scl: { slider: 'legLength', axis: 'y' }, objects: ['leg', 'thighBlend', 'trouser'] },
    { id: 'legR', name: 'Leg (right)', parent: 'torso', mirrorOf: 'legL', objects: [], hidden: true },
    { id: 'shinL', name: 'Lower leg', parent: 'legL', pivot: [115, 264], rot: { slider: 'knee', k: -1 }, objects: [] },
    { id: 'shinR', name: 'Lower leg (right)', parent: 'legR', mirrorOf: 'shinL', objects: [], hidden: true },
    { id: 'footL', name: 'Foot', parent: 'shinL', pivot: [114.5, 356], rot: { slider: 'ankle', k: -1 }, objects: ['ankle', 'foot', 'ball', 'toes', 'shoe'] },
    { id: 'footR', name: 'Foot (right)', parent: 'shinR', mirrorOf: 'footL', objects: [], hidden: true }
  ];

  // --- range sliders. ops: move / scale / rotate / point / fall, applied to the shapes named (and, mirrored, to their right-hand pairs)
  function R(id, name, scope, min, max, def, unit, ops, o) { var r = { id: id, name: name, scope: scope, min: min, max: max, def: def, unit: unit, ops: ops || [], show: true }; for (var k in (o || {})) r[k] = o[k]; return r; }
  function centreOf(id) { var l = shapes[id].pts; return l.length ? (function (b) { return [b.x + b.w / 2, b.y + b.h / 2]; })(M.boxOf(M.flat(M.build(l, true, ID), true))) : [100, 40]; }
  function centreOfAll(ids) { var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; ids.forEach(function (id) { var l = shapes[id].pts; if (l.length < 3) return; var b = M.boxOf(M.flat(M.build(l, true, ID), true)); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }); return [(x0 + x1) / 2, (y0 + y1) / 2]; }
  var FE = faceShapeIds, eyeL = FE.eyes.slice(0, 7), eyeR = FE.eyes.slice(7, 14), cEyeL = centreOf(FE.eyes[2]), cEyeR = centreOf(FE.eyes[9]);
  var browsL = FE.brows.filter(function (id) { return shapes[id].pts.length > 2 && centreOf(id)[0] < 100; }), browsR = FE.brows.filter(function (id) { return shapes[id].pts.length > 2 && centreOf(id)[0] >= 100; });
  var cBrowL = browsL.length ? centreOfAll(browsL) : [80, 30], cBrowR = browsR.length ? centreOfAll(browsR) : [120, 30];
  var mouthC = centreOfAll(FE.mouth), mouthHW = (function () { var x0 = 1e9, x1 = -1e9; FE.mouth.forEach(function (id) { var l = shapes[id].pts; if (l.length < 3) return; var b = M.boxOf(M.flat(M.build(l, true, ID), true)); x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.w); }); return Math.max(4, (x1 - x0) / 2); })();
  var ranges = [
    R('height', 'Height', 'model', 55, 110, 100, '%', [], { rand: [92, 108] }),
    R('headSize', 'Head size', 'head', 85, 125, 100, '%', [], { rand: [96, 106] }),
    R('headTilt', 'Head tilt', 'head', -20, 20, 0, '°', [{ op: 'rotate', shapes: ['neck'], pivot: [100, 84], k: 0.4 }]),
    R('neckSlide', 'Neck position', 'head', 0, 100, 100, '%', [], { hidden: true }),
    R('eyeSize', 'Eye size', 'eyes', 70, 140, 100, '%', [{ op: 'scale', shapes: eyeL, pivot: cEyeL, sx: 1, sy: 1 }, { op: 'scale', shapes: eyeR, pivot: cEyeR, sx: 1, sy: 1 }]),
    R('eyeSpacing', 'Eye spacing', 'eyes', -3, 3, 0, '', [{ op: 'move', shapes: eyeL, dx: 1 }, { op: 'move', shapes: eyeR, dx: -1 }]),
    R('eyeTilt', 'Eye tilt', 'eyes', -12, 12, 0, '°', [{ op: 'rotate', shapes: eyeL, pivot: cEyeL, k: -1 }, { op: 'rotate', shapes: eyeR, pivot: cEyeR, k: 1 }]),
    R('eyeOpen', 'Eyes open', 'eyes', 30, 135, 100, '%', [{ op: 'scale', shapes: eyeL, pivot: cEyeL, sx: 0, sy: 1 }, { op: 'scale', shapes: eyeR, pivot: cEyeR, sx: 0, sy: 1 }]),
    R('browHeight', 'Brow height', 'brows', -2.5, 2.5, 0, '', [{ op: 'move', shapes: FE.brows, dy: -1 }]),
    R('browAngle', 'Brow angle', 'brows', -12, 12, 0, '°', [{ op: 'rotate', shapes: browsL, pivot: cBrowL, k: -1 }, { op: 'rotate', shapes: browsR, pivot: cBrowR, k: 1 }]),
    R('mouthCurve', 'Smile', 'mouth', -10, 10, 0, '', [{ op: 'bendx', shapes: FE.mouth, pivot: mouthC, hw: mouthHW, k: -0.2 }]),
    R('noseSize', 'Nose size', 'nose', 80, 130, 100, '%', [{ op: 'scale', shapes: FE.nose, pivot: centreOfAll(FE.nose), sx: 1, sy: 1 }]),
    R('mouthSize', 'Mouth size', 'mouth', 75, 135, 100, '%', [{ op: 'scale', shapes: FE.mouth, pivot: centreOfAll(FE.mouth), sx: 1, sy: 1 }]),
    R('earSize', 'Ear size', 'ears', 80, 140, 100, '%', [{ op: 'scale', shapes: [FE.ears[0], FE.ears[2]], pivot: centreOf(FE.ears[0]), sx: 1, sy: 1 }, { op: 'scale', shapes: [FE.ears[1], FE.ears[3]], pivot: centreOf(FE.ears[1]), sx: 1, sy: 1 }]),
    R('fall', 'Fall strength', 'hair', 0, 100, 0, '%', [{ op: 'fall', shapes: hairAll.back, root: [100, 6] }]),
    R('shoulders', 'Shoulder width', 'torso', 85, 120, 100, '%', [{ op: 'point', shapes: ['chest'], idx: 2, dx: 0.35, sym: true }, { op: 'point', shapes: ['chest'], idx: 3, dx: 0.45, sym: true }, { op: 'point', shapes: ['chest'], idx: 4, dx: 0.3, sym: true }]),
    R('waist', 'Waist width', 'torso', 80, 125, 100, '%', [{ op: 'point', shapes: ['chest'], idx: 5, dx: 0.35, sym: true }, { op: 'point', shapes: ['chest'], idx: 6, dx: 0.35, sym: true }, { op: 'point', shapes: ['abdomen'], idx: 1, dx: 0.35, sym: true }, { op: 'point', shapes: ['abdomen'], idx: 2, dx: 0.35, sym: true }]),
    R('hips', 'Hip width', 'torso', 80, 125, 100, '%', [{ op: 'point', shapes: ['abdomen'], idx: 3, dx: 0.4, sym: true }, { op: 'point', shapes: ['pelvis'], idx: 1, dx: 0.3, sym: true }, { op: 'point', shapes: ['pelvis'], idx: 2, dx: 0.4, sym: true }, { op: 'point', shapes: ['pelvis'], idx: 3, dx: 0.3, sym: true }]),
    R('bend', 'Waist bend', 'torso', -18, 18, 0, '°', [{ op: 'rotate', shapes: ['chest', 'neck'], pivot: [100, 152], k: 1 }, { op: 'rotate', shapes: ['abdomen'], pivot: [100, 160], k: 0.5 }]),
    R('shrug', 'Shoulder lift', 'shoulderL', -8, 16, 0, '°', [], { pose: true }),
    R('shoulder', 'Arm raise', 'armL', -10, 95, 0, '°', [], { pose: true }),
    R('elbow', 'Elbow bend', 'foreL', 0, 130, 0, '°', [], { pose: true }),
    R('wrist', 'Wrist turn', 'handL', -40, 40, 0, '°', [], { pose: true }),
    R('thumb', 'Thumb bend', 'hand', 0, 60, 0, '°', [{ op: 'rotate', shapes: ['thumbL'], pivot: [142.5, 206], k: -1 }], { pose: true }),
    R('legSpread', 'Leg spread', 'legL', 0, 25, 0, '°', [], { pose: true }),
    R('knee', 'Knee bend', 'legL', 0, 75, 0, '°', [{ op: 'bendat', shapes: ['legL'], pivot: [115, 264], y0: 244, y1: 286, k: -1 }], { pose: true }),
    R('ankle', 'Ankle tilt', 'footL', -20, 20, 0, '°', [], { pose: true }),
    R('toeBend', 'Toe bend', 'toes', 0, 35, 0, '°', [{ op: 'rotate', shapes: ['toesL'], pivot: [115.5, 385], k: -1 }], { pose: true }),
    R('legLength', 'Leg length', 'legL', 90, 115, 100, '%', []),
    R('looseTop', 'Top: how loose', 'shirt', 0, 200, 100, '%', []),
    R('looseBottom', 'Trousers: how loose', 'trouser', 0, 200, 100, '%', [])
  ].concat(hairRanges);
  var poses = [
    { id: 'rest', name: 'Rest', values: { shoulder: 0, elbow: 0, wrist: 0, thumb: 0, legSpread: 0, knee: 0, ankle: 0, toeBend: 0 } },
    { id: 'wave', name: 'Wave', values: { shoulder: 72, elbow: 96, wrist: 12, thumb: 20, legSpread: 0, knee: 0, ankle: 0, toeBend: 0 } },
    { id: 'hips', name: 'Hands on hips', values: { shoulder: 26, elbow: 112, wrist: -22, thumb: 34, legSpread: 6, knee: 0, ankle: 0, toeBend: 0 } },
    { id: 'reach', name: 'Reach out', values: { shoulder: 84, elbow: 8, wrist: 0, thumb: 6, legSpread: 10, knee: 0, ankle: 4, toeBend: 6 } },
    { id: 'stance', name: 'Wide stance', values: { shoulder: 14, elbow: 22, wrist: 0, thumb: 10, legSpread: 20, knee: 8, ankle: -8, toeBend: 0 } },
    { id: 'tiptoe', name: 'On tiptoe', values: { shoulder: 6, elbow: 10, wrist: 0, thumb: 5, legSpread: 2, knee: 0, ankle: 14, toeBend: 30 } },
    { id: 'kneeout', name: 'Knee out', values: { shoulder: 12, elbow: 24, wrist: 0, thumb: 8, legSpread: 12, knee: 38, ankle: -6, toeBend: 0 } }
  ];
  // build and age: presets of the proportion sliders
  var presets = [
    { id: 'slim', kind: 'build', name: 'Slim', values: { shoulders: 94, waist: 88, hips: 92 } },
    { id: 'average', kind: 'build', name: 'Average', values: { shoulders: 100, waist: 100, hips: 100 } },
    { id: 'broad', kind: 'build', name: 'Broad', values: { shoulders: 112, waist: 106, hips: 104 } },
    { id: 'heavy', kind: 'build', name: 'Heavy', values: { shoulders: 106, waist: 122, hips: 118 } },
    { id: 'neutral', kind: 'expression', name: 'Neutral', values: { eyeOpen: 100, browHeight: 0, browAngle: 0, mouthCurve: 0, headTilt: 0 } },
    { id: 'smile', kind: 'expression', name: 'Smile', values: { eyeOpen: 90, browHeight: 0.5, browAngle: 2, mouthCurve: 7, headTilt: 2 } },
    { id: 'laugh', kind: 'expression', name: 'Laugh', values: { eyeOpen: 70, browHeight: 1, browAngle: 3, mouthCurve: 10, headTilt: -4 } },
    { id: 'sad', kind: 'expression', name: 'Sad', values: { eyeOpen: 86, browHeight: 0.6, browAngle: 8, mouthCurve: -6, headTilt: -5 } },
    { id: 'angry', kind: 'expression', name: 'Angry', values: { eyeOpen: 78, browHeight: -1.4, browAngle: -9, mouthCurve: -4, headTilt: 0 } },
    { id: 'surprised', kind: 'expression', name: 'Surprised', values: { eyeOpen: 128, browHeight: 2.2, browAngle: 0, mouthCurve: 0, headTilt: 0 } },
    { id: 'worried', kind: 'expression', name: 'Worried', values: { eyeOpen: 100, browHeight: 1, browAngle: 9, mouthCurve: -3, headTilt: -3 } },
    { id: 'tired', kind: 'expression', name: 'Tired', values: { eyeOpen: 62, browHeight: -0.6, browAngle: 3, mouthCurve: -2, headTilt: 5 } },
    { id: 'proud', kind: 'expression', name: 'Proud', values: { eyeOpen: 94, browHeight: 0.6, browAngle: -2, mouthCurve: 3, headTilt: -4 } },
    { id: 'child', kind: 'age', name: 'Child', values: { height: 62, headSize: 125, legLength: 92 } },
    { id: 'teen', kind: 'age', name: 'Teen', values: { height: 84, headSize: 110, legLength: 98 } },
    { id: 'adult', kind: 'age', name: 'Adult', values: { height: 100, headSize: 100, legLength: 100 } },
    { id: 'elder', kind: 'age', name: 'Elder', values: { height: 94, headSize: 102, legLength: 96 } }
  ];

  function stdP(hex) { var c = M.hexToHsl(hex); return { id: 'std', name: 'Standard', h: r2(c.h), s: r2(c.s), l: r2(c.l), hex: hex }; }
  var slots = {
    skin: { name: 'Skin', def: { src: 'preset', id: 'std' }, l: { min: 18, max: 92, def: 60 }, a: { min: 100, max: 100, def: 100 },
      presets: [stdP('#d9a07a'), { id: 'porcelain', name: 'Porcelain', h: 28, s: 52, l: 86 }, { id: 'sand', name: 'Sand', h: 30, s: 50, l: 74 }, { id: 'olive', name: 'Olive', h: 32, s: 42, l: 60 }, { id: 'tan', name: 'Tan', h: 26, s: 48, l: 52 }, { id: 'brown', name: 'Brown', h: 22, s: 40, l: 38 }, { id: 'deep', name: 'Deep', h: 18, s: 38, l: 24 }] },
    hair: { name: 'Hair', def: { src: 'preset', id: 'std' }, l: { min: 6, max: 94, def: 26 }, a: { min: 60, max: 100, def: 100 },
      presets: [stdP('#3a2a20'), { id: 'black', name: 'Black', h: 230, s: 18, l: 12 }, { id: 'brown', name: 'Brown', h: 24, s: 45, l: 24 }, { id: 'auburn', name: 'Auburn', h: 14, s: 60, l: 32 }, { id: 'blonde', name: 'Blonde', h: 42, s: 65, l: 66 }, { id: 'red', name: 'Red', h: 8, s: 70, l: 42 }, { id: 'grey', name: 'Grey', h: 210, s: 6, l: 66 }, { id: 'white', name: 'White', h: 210, s: 5, l: 92 }] },
    eye: { name: 'Eyes', def: { src: 'preset', id: 'std' }, l: { min: 14, max: 72, def: 38 }, a: { min: 100, max: 100, def: 100 },
      presets: [stdP('#5a3a24'), { id: 'brown', name: 'Brown', h: 26, s: 55, l: 28 }, { id: 'hazel', name: 'Hazel', h: 38, s: 45, l: 36 }, { id: 'green', name: 'Green', h: 130, s: 35, l: 36 }, { id: 'blue', name: 'Blue', h: 208, s: 55, l: 52 }, { id: 'grey', name: 'Grey', h: 210, s: 10, l: 56 }, { id: 'amber', name: 'Amber', h: 36, s: 80, l: 48 }] },
    lip: { name: 'Lips', def: { src: 'preset', id: 'std' }, l: { min: 24, max: 80, def: 56 }, a: { min: 60, max: 100, def: 100 },
      presets: [stdP('#c6704c'), { id: 'natural', name: 'Natural', h: 355, s: 35, l: 62 }, { id: 'rose', name: 'Rose', h: 350, s: 50, l: 56 }, { id: 'berry', name: 'Berry', h: 335, s: 45, l: 40 }, { id: 'plum', name: 'Plum', h: 320, s: 28, l: 34 }] },
    cloth: { name: 'Clothing', def: { src: 'preset', id: 'std' }, l: { min: 12, max: 90, def: 44 }, a: { min: 100, max: 100, def: 100 },
      presets: [stdP('#2f4a5a'), { id: 'white', name: 'White', h: 40, s: 12, l: 92 }, { id: 'grey', name: 'Grey', h: 220, s: 6, l: 58 }, { id: 'black', name: 'Black', h: 230, s: 14, l: 16 }] },
    trouser: { name: 'Trousers', def: { src: 'palette', id: 'k4', l: 34 }, l: { min: 12, max: 90, def: 34 }, a: { min: 100, max: 100, def: 100 },
      presets: [{ id: 'denim', name: 'Denim', h: 214, s: 42, l: 34 }, { id: 'khaki', name: 'Khaki', h: 40, s: 30, l: 56 }, { id: 'black', name: 'Black', h: 230, s: 14, l: 16 }] },
    shoe: { name: 'Shoes', def: { src: 'preset', id: 'black' }, l: { min: 8, max: 70, def: 16 }, a: { min: 100, max: 100, def: 100 },
      presets: [{ id: 'black', name: 'Black', h: 230, s: 14, l: 16 }, { id: 'brown', name: 'Brown', h: 24, s: 45, l: 28 }, { id: 'white', name: 'White', h: 40, s: 10, l: 90 }] }
  };
  var palette = [{ id: 'k1', name: 'Warm', h: 24, s: 46 }, { id: 'k2', name: 'Rose', h: 350, s: 52 }, { id: 'k3', name: 'Ink blue', h: 222, s: 38 }, { id: 'k4', name: 'Moss', h: 104, s: 30 }, { id: 'k5', name: 'Gold', h: 42, s: 68 }];
  var frames = [
    { id: 'full', name: 'Full body', x: 0, y: 0, w: 200, h: 400, hide: [] },
    { id: 'bust', name: 'Bust', x: 52, y: 0, w: 96, h: 112, hide: ['legL', 'legR', 'footL', 'footR'] },
    { id: 'face', name: 'Face', x: 78, y: 2, w: 44, h: 66, hide: ['legL', 'legR', 'footL', 'footR', 'shoulderL', 'shoulderR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'torso'] },
    { id: 'hands', name: 'Hands', x: 30, y: 120, w: 140, h: 120, hide: ['head', 'hair', 'legL', 'legR', 'footL', 'footR'] },
    { id: 'feet', name: 'Feet', x: 70, y: 330, w: 60, h: 70, hide: ['head', 'hair', 'shoulderL', 'shoulderR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'torso'] },
    // the same head height as the portrait card's tile (92 of 200), for the side-by-side picture
    { id: 'cmp', name: 'Portrait match', x: 41.3, y: -10.2, w: 117.4, h: 117.4, hide: ['legL', 'legR', 'footL', 'footR'], internal: true }
  ];
  var links = [
    { a: { shape: 'neck', i: 3 }, b: { shape: 'chest', i: 1 }, kind: 'follow', dx: -1, dy: 0 }
  ];
  // the whole-plane form of a centre section: the roots of the right, centre and left pieces, then their tips, as one outline. It is used when the left and right sections of that plane are off.
  ['front', 'top', 'back', 'nape'].forEach(function (plane) {
    var C = shapes['hr_' + plane + '_center'], Lf = shapes['hr_' + plane + '_left'], Rg = shapes['hr_' + plane + '_right'];
    if (!C || !Lf || !Rg) return;
    var root = function (q) { return !q.w; }, tip = function (q) { return !!q.w; };
    C.wide = clone(Rg.pts.filter(root).concat(C.pts.filter(root), Lf.pts.filter(root), Lf.pts.filter(tip), C.pts.filter(tip), Rg.pts.filter(tip)));
    C.wideOf = ['hair.' + plane + '.left', 'hair.' + plane + '.right', 'hair.' + plane + '.center'];
  });
  // hair styles: presets of the sections. A key is a plane ('back') or one section ('back.left'); the section's own key wins.
  var hairStyles = [
    { id: 'old', name: 'The old drawing (short)', oldHair: true, len: {}, tex: 0, cut: 'blunt', off: hairCells.map(function (c) { return c.id; }) },
    { id: 'long', name: 'Long and straight', len: { front: 100, top: 80, left: 95, right: 95, back: 125, nape: 100 }, tex: 0, cut: 'blunt' },
    { id: 'bob', name: 'Bob', len: { front: 100, top: 90, left: 60, right: 60, back: 58, nape: 45 }, tex: 0, cut: 'round' },
    { id: 'pixie', name: 'Pixie', len: { front: 80, top: 130, left: 28, right: 28, back: 28, nape: 20 }, tex: 33, cut: 'layered' },
    { id: 'buzz', name: 'Buzzed', len: { front: 14, top: 22, left: 12, right: 12, back: 12, nape: 12 }, tex: 0, cut: 'blunt' },
    { id: 'undercut', name: 'Undercut', len: { front: 140, top: 170, left: 14, right: 14, back: 26, nape: 14 }, tex: 33, cut: 'blunt', off: ['left.center', 'right.center', 'nape.left', 'nape.center', 'nape.right'] },
    { id: 'mohawk', name: 'Mohawk', len: { front: 110, top: 260, back: 70, nape: 40, 'front.left': 10, 'front.right': 10, 'top.left': 10, 'top.right': 10, 'back.left': 10, 'back.right': 10, 'nape.left': 10, 'nape.right': 10 }, tex: 0, cut: 'taper', off: ['left.center', 'right.center'] },
    { id: 'shaved', name: 'Shaved on one side', len: { front: 100, top: 110, left: 100, right: 100, back: 112, 'back.left': 26, nape: 90 }, tex: 33, cut: 'blunt', off: ['left.center', 'nape.left'] },
    { id: 'curls', name: 'Curls', len: { front: 100, top: 150, left: 90, right: 90, back: 110, nape: 90 }, tex: 66, cut: 'round' },
    { id: 'afro', name: 'Afro', len: { front: 125, top: 290, left: 140, right: 140, back: 110, nape: 110 }, tex: 99, cut: 'round' },
    { id: 'bald', name: 'Bald', len: {}, tex: 0, cut: 'blunt', off: hairCells.map(function (c) { return c.id; }) }
  ];
  var model = { id: 'adult', name: 'Adult (basic)', version: 6, shapes: shapes, objects: objects, groups: groups, ranges: ranges, poses: poses, presets: presets, slots: slots, palette: palette, frames: frames, links: links, budget: 24,
    hair: { planes: HAIR_PLANES, sides: HAIR_SIDES, cells: hairCells, styles: hairStyles } };
  M.index(model);
  return model;
};

// shape.group / shape.obj, and lookup tables. Call again after structural edits.
M.index = function (model) {
  model.groupById = {};
  model.groups.forEach(function (g) { model.groupById[g.id] = g; });
  model.objOfShape = {}; model.groupOfShape = {};
  model.groups.forEach(function (g) {
    g.objects.forEach(function (oid) {
      var ob = model.objects[oid];
      ob.shapes.forEach(function (sid) { model.objOfShape[sid] = oid; model.groupOfShape[sid] = g.id; });
      (ob.shade || []).forEach(function (sid) { model.objOfShape[sid] = oid; model.groupOfShape[sid] = g.id; });
    });
  });
  Object.keys(model.shapes).forEach(function (sid) { var sh = model.shapes[sid]; if (sh.group) model.groupOfShape[sid] = sh.group; });
  model.rangeById = {};
  model.ranges.forEach(function (r) { model.rangeById[r.id] = r; });
  return model;
};

M.defaultCfg = function (model) {
  var cfg = { val: {}, forms: {}, col: {}, palette: clone(model.palette), fallSide: 'down', tile: '#e6d6c3', hidden: {}, zoff: {}, shadeAmt: 1, mine: {}, hairStyle: 'old' };
  model.hair.cells.forEach(function (c) { cfg.hidden[c.obj] = true; });
  model.ranges.forEach(function (r) { cfg.val[r.id] = r.def; });
  Object.keys(model.objects).forEach(function (oid) { model.objects[oid].axes.forEach(function (ax) { cfg.forms[oid + '.' + ax.id] = ax.def; }); });
  Object.keys(model.slots).forEach(function (s) { cfg.col[s] = clone(model.slots[s].def); });
  return cfg;
};

/* ---------- hair styles, and styles of class objects (a style = a named look of an object's settings) ---------- */
function specFor(map, cell) {
  if (map == null) return undefined;
  if (typeof map !== 'object') return map;
  if (map[cell.id] != null) return map[cell.id];
  if (map[cell.plane] != null) return map[cell.plane];
  return undefined;
}
M.applyHairStyle = function (model, cfg, st) {
  model.hair.cells.forEach(function (c) {
    var len = specFor(st.len, c), tex = specFor(st.tex, c), cut = specFor(st.cut, c), lr = model.rangeById['len:' + c.id];
    cfg.val['len:' + c.id] = len != null ? clamp(len, lr.min, lr.max) : lr.def;
    cfg.val['tex:' + c.id] = tex != null ? tex : 0;
    cfg.forms[c.obj + '.cut'] = cut || 'blunt';
    cfg.hidden[c.obj] = !!(st.off && st.off.indexOf(c.id) >= 0);
  });
  cfg.hidden.hairOld = !st.oldHair;
  cfg.hairStyle = st.id;
};
// the conversion of a saved portrait (the code-drawn engine's choices) to a mannequin look: presets, forms and colours
M.fromPortrait = function (model, p) {
  var c = M.defaultCfg(model);
  var age = { infant: 'child', toddler: 'child', child: 'child', teen: 'teen', young: 'adult', adult: 'adult', middle: 'adult', older: 'elder', elderly: 'elder' }[p.age] || 'adult';
  var bd = { slight: 'slim', average: 'average', broad: 'broad', heavy: 'heavy' }[p.build] || 'average';
  [age, bd].forEach(function (id) { var pr = model.presets.filter(function (x) { return x.id === id; })[0]; if (pr) Object.keys(pr.values).forEach(function (k) { c.val[k] = pr.values[k]; }); });
  c.forms['chest.chest'] = { flat: 'flat', average: 'average', full: 'full' }[p.chest] || 'average';
  if (p.skin) c.col.skin = { src: 'hex', hex: p.skin };
  if (p.hairColor) c.col.hair = { src: 'hex', hex: p.hairColor };
  if (p.eyeColor) c.col.eye = { src: 'hex', hex: p.eyeColor };
  if (p.lipColor) c.col.lip = { src: 'hex', hex: p.lipColor };
  if (p.topColor) c.col.cloth = { src: 'hex', hex: p.topColor };
  if (p.tileColor) c.tile = p.tileColor;
  var L = { bald: 0, buzzed: 14, short: 28, chin: 58, shoulder: 82, chest: 108, stomach: 122, hip: 130, knee: 140, body: 140, rapunzel: 150 }[p.hairLength];
  if (L == null) L = 82;
  var tex = ({ '1': 0, '2': 33, '3': 66, '4': 99 })[(p.hairTexture || '1B').charAt(0)] || 0;
  var named = { mohawk: 'mohawk', shavedside: 'shaved', undercut: 'undercut', fade: 'undercut' }[p.hairStyle];
  var st = named && L > 0 ? model.hair.styles.filter(function (x) { return x.id === named; })[0] : null;
  if (L === 0) st = model.hair.styles.filter(function (x) { return x.id === 'bald'; })[0];
  if (!st) st = { id: 'mapped', len: { front: 100, top: p.hairStyle === 'topbun' ? 200 : 90, left: Math.round(L * 0.85), right: Math.round(L * 0.85), back: L, nape: Math.round(L * 0.8) }, tex: tex, cut: L > 60 ? 'blunt' : 'round' };
  else if (named) { st = Object.assign({}, st, { tex: tex || st.tex }); }
  M.applyHairStyle(model, c, st);
  return c;
};
// the objects a style covers: an object, or every object of a group
M.styleOids = function (model, kind, id) { return kind === 'group' ? model.groupById[id].objects.slice() : [id]; };
M.styleSnap = function (model, cfg, oids) {
  var snap = { val: {}, forms: {}, off: [], col: {} };
  model.ranges.forEach(function (r) { if (oids.indexOf(r.scope) >= 0) snap.val[r.id] = cfg.val[r.id] != null ? cfg.val[r.id] : r.def; });
  oids.forEach(function (oid) {
    var ob = model.objects[oid]; if (!ob) return;
    ob.axes.forEach(function (ax) { snap.forms[oid + '.' + ax.id] = cfg.forms[oid + '.' + ax.id] || ax.def; });
    if (cfg.hidden[oid]) snap.off.push(oid);
    ob.shapes.forEach(function (sid) {
      var sh = model.shapes[sid], key = sh.cell ? sh.slot + ':' + sh.cell : null;
      if (key && cfg.col[key]) snap.col[key] = clone(cfg.col[key]);
    });
  });
  return snap;
};
M.applyStyle = function (model, cfg, oids, snap) {
  Object.keys(snap.val).forEach(function (k) { cfg.val[k] = snap.val[k]; });
  Object.keys(snap.forms).forEach(function (k) { cfg.forms[k] = snap.forms[k]; });
  oids.forEach(function (oid) { cfg.hidden[oid] = snap.off.indexOf(oid) >= 0; });
  Object.keys(snap.col || {}).forEach(function (k) { cfg.col[k] = clone(snap.col[k]); });
};
// the admin's styles of a class (an object, or the hair group, whose styles are the hair styles)
M.stylesOf = function (model, kind, id) {
  var oids = M.styleOids(model, kind, id);
  if (kind === 'group' && model.groupById[id].sections) {
    return model.hair.styles.map(function (st) { var c = M.defaultCfg(model); M.applyHairStyle(model, c, st); return { id: st.id, name: st.name, snap: M.styleSnap(model, c, oids) }; }).concat(model.groupById[id].styles || []);
  }
  var host = kind === 'group' ? model.groupById[id] : model.objects[id];
  return host.styles || [];
};

/* ---------- forms and editing targets ---------- */
function ovrEntry(model, cfg, id) {
  var oid = model.objOfShape[id]; if (!oid) return null;
  var ob = model.objects[oid];
  for (var a = 0; a < ob.axes.length; a++) {
    var ax = ob.axes[a], sel = cfg.forms[oid + '.' + ax.id] || ax.def;
    for (var o = 0; o < ax.options.length; o++) if (ax.options[o].id === sel && ax.options[o].ovr && ax.options[o].ovr[id]) return ax.options[o].ovr[id];
  }
  return null;
}
function ovrOf(model, cfg, id) { var e = ovrEntry(model, cfg, id); return e ? (Array.isArray(e) ? e : e.pts) : null; }
// an option made by the old engine also says how its shapes are painted (the old engine's options differ in what they draw)
function ovrLook(model, cfg, id) { var e = ovrEntry(model, cfg, id); return e && !Array.isArray(e) ? e.look : null; }
// the list of points that an edit of this shape (in this view and form) changes
M.ptsOf = function (model, id, cfg, view) {
  var sh = model.shapes[id];
  if (sh.mirrorOf && !ovrOf(model, cfg, id)) return M.ptsOf(model, sh.mirrorOf, cfg, view);
  if (view === 'back' && sh.back) return sh.back;
  return ovrOf(model, cfg, id) || sh.pts;
};
M.breakPair = function (model, idR, cfg) {
  var sh = model.shapes[idR]; if (!sh.mirrorOf) return;
  sh.pts = reflectList(clone(M.ptsOf(model, sh.mirrorOf, cfg, 'front')), 100);
  sh.pts.forEach(function (p) { delete p.bind; });
  model.shapes[sh.mirrorOf].side = 'L';
  sh.mirrorOf = null; sh.mirror = false;
};

/* ---------- ranges ---------- */
function applyOp(list, op, delta, mir, cfg) {
  var sgn = mir ? -1 : 1, pv = op.pivot ? (mir ? [200 - op.pivot[0], op.pivot[1]] : op.pivot) : null;
  switch (op.op) {
    case 'move': { var dx = (op.dx || 0) * delta * sgn, dy = (op.dy || 0) * delta; list.forEach(function (p) { p.x += dx; p.y += dy; }); break; }
    case 'scale': { var sx = 1 + (op.sx || 0) * delta / 100, sy = 1 + (op.sy || 0) * delta / 100; xf(list, Sm(Math.max(0.05, sx), Math.max(0.05, sy), pv[0], pv[1])); break; }
    case 'rotate': xf(list, Rm((op.k || 1) * delta * sgn, pv[0], pv[1])); break;
    case 'bendat': {
      var ba = (op.k || 1) * delta * sgn;
      list.forEach(function (p) {
        var w = clamp((p.y - op.y0) / ((op.y1 - op.y0) || 1), 0, 1); w = w * w * (3 - 2 * w); if (w <= 0) return;
        var Rw = Rm(ba * w, pv[0], pv[1]), a = ap(Rw, p.x, p.y); p.x = a[0]; p.y = a[1];
        if (p.hi) p.hi = [Rw[0] * p.hi[0] + Rw[2] * p.hi[1], Rw[1] * p.hi[0] + Rw[3] * p.hi[1]];
        if (p.ho) p.ho = [Rw[0] * p.ho[0] + Rw[2] * p.ho[1], Rw[1] * p.ho[0] + Rw[3] * p.ho[1]];
      });
      break;
    }
    case 'bendx': list.forEach(function (p) { var u = (p.x - pv[0]) / (op.hw || 1); p.y += (op.k || 0) * delta * Math.min(1.6, u * u); }); break;
    case 'point': {
      var i = mir ? list.length - 1 - op.idx : op.idx, p = list[i]; if (!p) break;
      var twin = op.sym && !mir ? twinIndex(list, i, 100, 4) : i;
      p.x += (op.dx || 0) * delta * sgn; p.y += (op.dy || 0) * delta;
      if (twin !== i) { list[twin].x -= (op.dx || 0) * delta * sgn; list[twin].y += (op.dy || 0) * delta; }
      break;
    }
    // length: the weighted points move away from (or towards) the root line, so a section grows or shrinks from where it is rooted
    case 'stretch': {
      var fs = delta / 100;
      list.forEach(function (p) { var w = p.w || 0; if (!w) return; p.y += (p.y - op.root[1]) * fs * w; p.x += (p.x - op.root[0]) * fs * w * (op.sx || 0); });
      break;
    }
    // texture: the weighted points are pushed sideways in a wave: gentle (wavy), wider (curly), tighter (coily)
    case 'wave': {
      var tv = delta / 100, amp = op.amp * tv * (0.45 + 0.55 * tv), fq = op.f0 + (op.f1 - op.f0) * tv;
      list.forEach(function (p) { var w = p.w || 0; if (!w) return; p.x += amp * Math.sin(p.y * fq + (op.phase || 0)) * Math.min(1, w * 1.4); });
      break;
    }
    case 'fall': {
      var f = delta / 100, side = cfg.fallSide || 'down', A = side === 'left' ? 36 : side === 'right' ? -36 : 0, sq = side === 'behind' ? 0.3 : 0.14;
      list.forEach(function (p) {
        var w = p.w || 0; if (!w) return;
        p.x = op.root[0] + (p.x - op.root[0]) * (1 - sq * f * w);
        var a = ap(Rm(A * f * w, op.root[0], op.root[1]), p.x, p.y); p.x = a[0]; p.y = a[1];
      });
      break;
    }
  }
}
function rangeVal(model, cfg, id) { var r = model.rangeById[id]; return cfg.val[id] != null ? cfg.val[id] : (r ? r.def : 0); }

/* ---------- colour ---------- */
/* ---------- colour: the old portrait engine's arithmetic, ported exactly (mix, shade) ---------- */
function hexRgb(h) { var m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [128, 128, 128]; var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbHex(c) { return '#' + c.map(function (x) { var t = clamp(Math.round(x), 0, 255).toString(16); return t.length < 2 ? '0' + t : t; }).join(''); }
function mixHex(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
function toHslF(h) {
  var c = hexRgb(h).map(function (v) { return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2, s = 0, hu = 0;
  if (mx !== mn) { var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hu = mx === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; hu /= 6; }
  return [hu, s, l];
}
function fromHslF(hu, s, l) {
  function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
  if (s === 0) return rgbHex([l * 255, l * 255, l * 255]);
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbHex([f(p, q, hu + 1 / 3) * 255, f(p, q, hu) * 255, f(p, q, hu - 1 / 3) * 255]);
}
// a shadow of a colour: darker, a little richer, the hue nudged toward red
function shadeHex(h, t) { var c = toHslF(h), hu = c[0] > 0.5 ? c[0] + (1 - c[0]) * 0.04 * t : c[0] - c[0] * 0.04 * t; return fromHslF(hu, clamp(c[1] * (1 + 0.35 * t) + 0.03 * t, 0, 1), clamp(c[2] * (1 - t), 0, 1)); }
M.shadeHex = shadeHex; M.mixHex = mixHex; M.hexRgb = hexRgb;
// a tone step of a colour: a shadow is the old shade(colour, t), a midtone half of it, a highlight a mix with white
M.toneHex = function (hex, kind, t) { return kind === 'shadow' ? shadeHex(hex, t) : kind === 'mid' ? shadeHex(hex, t * 0.5) : mixHex(hex, '#ffffff', t); };
function hexToHsl(hx) {
  var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hx || ''); if (!m) return { h: 0, s: 0, l: 50 };
  var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h: h, s: s * 100, l: l * 100 };
}
M.hexToHsl = hexToHsl;
// a slot key may carry a part: 'hair:front.center' is that section's own colour; it falls back to the slot's. A colour that is exactly a hex (a preset with one, or a hex source) carries it.
M.colour = function (model, cfg, slot, tone) {
  var base = slot.split(':')[0], sl = model.slots[base]; if (!sl) return { h: 0, s: 0, l: 50, a: 1, hex: null };
  var c = (cfg.col && (cfg.col[slot] || cfg.col[base])) || sl.def, h, s, l, hex = null;
  var pal = cfg.palette || model.palette;
  if (c.src === 'hex') { var hs = hexToHsl(c.hex); h = hs.h; s = hs.s; l = c.l != null ? c.l : hs.l; hex = c.l == null ? c.hex : null; }
  else if (c.src === 'palette') {
    var sw = pal.filter(function (x) { return x.id === c.id; })[0] || pal[0];
    h = sw.h; s = sw.s; l = c.l != null ? c.l : sl.l.def;
  } else {
    var pr = sl.presets.filter(function (x) { return x.id === c.id; })[0] || sl.presets[0];
    h = pr.h; s = pr.s; l = c.l != null ? c.l : pr.l; if (pr.hex && c.l == null) hex = pr.hex;
  }
  if (c.src !== 'hex') { var l2 = clamp(l, sl.l.min, sl.l.max); if (l2 !== l) hex = null; l = l2; }
  var a = clamp(c.a != null ? c.a : sl.a.def, sl.a.min, sl.a.max) / 100;
  if (tone) { l = clamp(l + (tone > 0 ? 9 : -12) * Math.abs(tone), 2, 98); hex = null; }
  return { h: h, s: s, l: l, a: a, hex: hex };
};
M.hexOf = function (c) { return c.hex || M.hex(M.css(c)); };
M.tone = function (c, kind, t) { var hx = M.toneHex(M.hexOf(c), kind, t), hs = hexToHsl(hx); return { h: hs.h, s: hs.s, l: hs.l, a: c.a, hex: hx }; };
// WCAG contrast of two hsl colours (for the shading review)
M.lum = function (c) {
  var h = c.h / 360, s = c.s / 100, l = c.l / 100, a = s * Math.min(l, 1 - l);
  function f(n) { var k = (n + h * 12) % 12, v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
};
M.contrast = function (a, b) { var x = M.lum(a), y = M.lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };
M.css = function (c) { return c.hex || ('hsl(' + r2(c.h) + ',' + r2(c.s) + '%,' + r2(c.l) + '%)'); };
M.swatchCss = function (h, s, l) { return 'hsl(' + h + ',' + s + '%,' + (l == null ? 52 : l) + '%)'; };

/* ---------- solving a figure ---------- */
M.solve = function (model, cfg, view) {
  view = view || 'front';
  var res = { shapes: {}, order: [], pivots: {}, mats: {}, view: view };
  var hs = rangeVal(model, cfg, 'height') / 100;
  var G = mul(Sm(hs, hs, 100, 392), view === 'back' ? [-1, 0, 0, 1, 200, 0] : ID);
  res.G = G;
  var S = model.shapes, memo = {}, edges = {};
  res.local = memo;

  // the outline of a shape in its own space, built once (for edge locks)
  function edgeOf(id) {
    if (edges[id]) return edges[id];
    var l = local(id); if (!l || l.length < 3) return null;
    var a = build(l, true, ID); edges[id] = { a: a, sign: windSign(a) };
    return edges[id];
  }
  // a bound point sits on the body point it follows, plus its offset (the fit slider scales the outward part),
  // or on the edge of a shape: a place along it, plus a distance outward (the fit slider scales that too, when it is outward)
  function resolve(list, sh) {
    list.forEach(function (p) {
      if (!p.bind) return;
      var k = sh.loose ? rangeVal(model, cfg, sh.loose) / 100 : 1;
      if (p.bind.e != null) {
        var E = edgeOf(p.bind.s); if (!E) return;
        var o = p.bind.o || 0; if (o > 0) o *= k;
        var q = edgeAt(E.a, E.sign, p.bind.e, p.bind.t, o);
        var tg = model.groupOfShape[p.bind.s], sg = model.groupOfShape[sh.id], cm = null;
        if (tg !== sg && res.mats[tg] && res.mats[sg]) { cm = mul(M.inv(res.mats[sg]), res.mats[tg]); var wq = ap(cm, q[0], q[1]); q = [wq[0], wq[1]]; }
        p.x = q[0]; p.y = q[1];
        if (p.bind.tan) {
          var bz = bezPt(E.a, p.bind.e, p.bind.t), tx = bz.tx, ty = bz.ty;
          if (cm) { var ux = cm[0] * tx + cm[2] * ty, uy = cm[1] * tx + cm[3] * ty, ul = Math.hypot(ux, uy) || 1; tx = ux / ul; ty = uy / ul; }
          p.tan = [tx, ty];
        }
        return;
      }
      var ref = local(p.bind.s)[p.bind.i]; if (!ref) return;
      p.x = ref.x + p.bind.d[0] + p.bind.n[0] * k; p.y = ref.y + p.bind.d[1] + p.bind.n[1] * k;
    });
    // a bridge is skin between two parts: its two sides leave one part along the direction of its edge and arrive at the other along the direction of its edge,
    // so the outline runs on smoothly through a bend (a cubic whose handles are the two edge directions), however far the parts have turned
    if (sh.bridge && list.length === 4) {
      [[0, 1], [2, 3]].forEach(function (pr) {
        var a = list[pr[0]], b = list[pr[1]]; if (!a.tan || !b.tan) return;
        var dx = b.x - a.x, dy = b.y - a.y, chord = Math.hypot(dx, dy), L = Math.max(0.5, chord * (sh.bridgeK || (S[sh.mirrorOf] && S[sh.mirrorOf].bridgeK) || 0.42));
        var sa = a.tan[0] * dx + a.tan[1] * dy >= 0 ? 1 : -1, sb = b.tan[0] * -dx + b.tan[1] * -dy >= 0 ? 1 : -1;
        a.ho = [a.tan[0] * sa * L, a.tan[1] * sa * L]; b.hi = [b.tan[0] * sb * L, b.tan[1] * sb * L];
      });
      list.forEach(function (q) { delete q.tan; });
    }
  }
  function opsOn(id, list, asMirror) {
    var sh = S[id];
    model.ranges.forEach(function (r) {
      var delta = rangeVal(model, cfg, r.id) - r.def;
      if (delta === 0) return;
      r.ops.forEach(function (op) {
        var direct = !asMirror && op.shapes.indexOf(id) >= 0;
        var mirrored = asMirror && sh.mirrorOf && op.mirror !== false && op.shapes.indexOf(sh.mirrorOf) >= 0;
        if (direct || mirrored) applyOp(list, op, delta, !!mirrored, cfg);
      });
    });
  }
  // the points of a shape in its own space: form, binds, then range ops. A right-hand twin is the mirror of the finished left shape.
  function local(id) {
    if (memo[id]) return memo[id];
    var sh = S[id], own = (view === 'back' && sh.back) ? sh.back : ovrOf(model, cfg, id), list;
    if (!own && sh.wide && cfg.hidden && cfg.hidden[sh.wideOf[0]] && cfg.hidden[sh.wideOf[1]] && !cfg.hidden[sh.wideOf[2]]) own = sh.wide;
    if (own) { list = clone(own); resolve(list, sh); opsOn(id, list, !!sh.mirrorOf); }
    else if (sh.mirrorOf) list = reflectList(local(sh.mirrorOf), 100);
    else { list = clone(sh.pts); resolve(list, sh); opsOn(id, list, false); }
    memo[id] = list;
    return list;
  }
  function anchor(att, mir) {
    var rs = res.shapes[att.shape]; if (!rs) return null;
    var a = rs.pre, n = a.length, sh = S[att.shape];
    function tw(i) { return mir && sh.half ? ((i === 0 || i === sh.half - 1) ? i : n - i) : i; }
    if (att.kind === 'point') { var q = a[tw(att.i) % n]; return q ? [q.x, q.y] : null; }
    if (att.kind === 'edge' || att.kind === 'range') {
      var t = att.kind === 'edge' ? att.t : clamp(rangeVal(model, cfg, att.slider || 'neckSlide') / 100, 0, 1);
      var p0 = a[tw(att.i) % n], p1 = a[tw((att.i + 1) % n) % n];
      return [p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t];
    }
    if (att.kind === 'inside') {
      var bb = boxOf(a.map(function (p) { return [p.x, p.y]; }));
      return [bb.x + bb.w * (mir ? 1 - att.rx : att.rx), bb.y + bb.h * att.ry];
    }
    return null;
  }

  model.groups.forEach(function (g) {
    var src = g.mirrorOf ? model.groupById[g.mirrorOf] : g, mir = !!g.mirrorOf;
    var pm = g.parent ? res.mats[g.parent] : ID;
    var pv = mir ? [200 - src.pivot[0], src.pivot[1]] : src.pivot;
    var bm = pm;
    if (src.attach) {
      var an = anchor(src.attach, mir);
      if (an) { var pw = ap(pm, pv[0], pv[1]); bm = mul(Tm(an[0] - pw[0], an[1] - pw[1]), pm); }
    }
    var pw2 = ap(bm, pv[0], pv[1]);
    var ang = 0;
    if (src.rot) ang = src.rot.k * (rangeVal(model, cfg, src.rot.slider) - model.rangeById[src.rot.slider].def) * (mir ? -1 : 1);
    var sx = 1, sy = 1;
    if (src.scl) { var sv = rangeVal(model, cfg, src.scl.slider) / 100; sx = src.scl.axis === 'y' ? 1 : sv; sy = src.scl.axis === 'x' ? 1 : sv; }
    var Mg = mul(Rm(ang, pw2[0], pw2[1]), mul(Sm(sx, sy, pw2[0], pw2[1]), bm));
    res.mats[g.id] = Mg; res.pivots[g.id] = pw2;
    Object.keys(S).forEach(function (sid) {
      if (model.groupOfShape[sid] !== g.id || res.shapes[sid]) return;
      var sh = S[sid], lst = local(sid), pre = build(lst, sh.closed, Mg), fin = build(lst, sh.closed, mul(G, Mg));
      var vis = (sh.view === 'both' || sh.view === view) && lst.length >= 3;
      var lk = ovrLook(model, cfg, sid), eSlot = lk ? lk.slot : sh.slot, eHex = lk ? lk.hex : sh.hex, eShade = lk ? lk.shade : sh.shade, eFn = lk ? lk.fn : sh.fn, eOp = lk && lk.op != null ? lk.op : sh.op;
      if (sh.opBy) { var ov = rangeVal(model, cfg, sh.opBy.slider); eOp *= clamp((ov - sh.opBy.from) / ((sh.opBy.to - sh.opBy.from) || 1), 0, 1); if (eOp <= 0.004) vis = false; }
      var slotKey = sh.cell ? eSlot + ':' + sh.cell : eSlot;
      var c = M.colour(model, cfg, slotKey, sh.tone), c2 = sh.grad ? M.colour(model, cfg, slotKey, sh.tone - 1) : null;
      var poly = flat(fin, sh.closed), oid = model.objOfShape[sid], zv = (view === 'back' && sh.zBack != null) ? sh.zBack : sh.z;
      var shadeAmt = cfg.shadeAmt == null ? 1 : cfg.shadeAmt;
      if (eHex) { var hs0 = hexToHsl(eHex); c = { h: hs0.h, s: hs0.s, l: hs0.l, a: 1, hex: eHex }; }
      else if (eShade) {
        // a shading shape lies over its object: the base colour, one tone step away (the old engine's shade), at the shape's own opacity
        c = M.tone(M.colour(model, cfg, slotKey, 0), eShade.kind, (eShade.t == null ? 0.12 : eShade.t) * shadeAmt); vis = vis && shadeAmt > 0;
      } else if (eFn) c = M.tone(c, eFn.kind, eFn.t);
      res.shapes[sid] = {
        id: sid, d: dOf(fin, sh.closed), pre: pre, fin: fin, poly: poly, box: poly.length ? boxOf(poly) : { x: 0, y: 0, w: 0, h: 0 }, visible: vis,
        fill: M.css(c), op: r2(eOp * c.a), blend: sh.blend || null, grad: c2 && !eShade && !eHex ? [M.css(c), M.css(c2)] : null, clip: sh.clip || null,
        stroke: sh.outline ? M.css({ h: c.h, s: c.s, l: clamp(c.l - 28, 2, 98) }) : null, sw: sh.outline || 0,
        helper: !!sh.helper, cut: sh.cut || [], shade: eShade ? eShade.kind : null, comp: null,
        z: zv + ((cfg.zoff && oid && cfg.zoff[oid]) || 0), obj: oid, layer: oid ? model.objects[oid].layer : null, group: g.id, slot: eSlot, base: c
      };
    });
  });
  // the composite: the shading of the body lies over ALL the skin of the body (parts and joints alike) and is clipped to its whole outline, so a shadow can run across a joint;
  // anywhere else (the face) a shading shape is clipped to the base shapes of its own object
  res.skinBands = M.SKIN_BANDS.map(function (bd) {
    return Object.keys(res.shapes).filter(function (b) { var r = res.shapes[b]; return r.visible && !r.helper && !r.shade && r.slot === 'skin' && r.layer === 'body' && S[b].z >= bd[0] && S[b].z < bd[1]; });
  });
  Object.keys(res.shapes).forEach(function (id) {
    var rs = res.shapes[id]; if (!rs.shade || S[id].noClip) return;
    var ob = model.objects[rs.obj]; if (!ob) return;
    rs.compOwn = ob.shapes.filter(function (b) { return res.shapes[b] && res.shapes[b].visible && !res.shapes[b].helper; });
    rs.comp = S[id].band != null ? res.skinBands[S[id].band] : rs.compOwn;
  });
  Object.keys(res.shapes).forEach(function (id) { if (res.shapes[id].visible && !res.shapes[id].helper) res.order.push(id); });
  res.order.sort(function (a, b) { return res.shapes[a].z - res.shapes[b].z || (a < b ? -1 : 1); });
  return res;
};

M.bbox = function (res, ids) {
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  ids.forEach(function (id) { var s = res.shapes[id]; if (!s || !s.visible) return; x0 = Math.min(x0, s.box.x); y0 = Math.min(y0, s.box.y); x1 = Math.max(x1, s.box.x + s.box.w); y1 = Math.max(y1, s.box.y + s.box.h); });
  if (x0 > x1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
M.hit = function (res, x, y) {
  for (var i = res.order.length - 1; i >= 0; i--) { var s = res.shapes[res.order[i]]; if (inPoly(s.poly, x, y)) return s.id; }
  return null;
};
M.objectBox = function (model, res, oid) { return M.bbox(res, model.objects[oid].shapes); };
// the shapes of a group and of its right-hand twin
M.groupShapes = function (model, gid) {
  var ids = [gid];
  model.groups.forEach(function (g) { if (g.mirrorOf === gid) ids.push(g.id); });
  return Object.keys(model.shapes).filter(function (s) { return ids.indexOf(model.groupOfShape[s]) >= 0; });
};
M.layerShapes = function (model, layer) {
  return Object.keys(model.shapes).filter(function (s) { var o = model.objOfShape[s]; return o && model.objects[o].layer === layer; });
};

/* ---------- drawing (svg text; shown as an image) ---------- */
M.svg = function (model, res, o) {
  o = o || {};
  var fr = o.frame || { x: 0, y: 0, w: 200, h: 400 }, W = o.w || 200, Hh = o.h || 200;
  var defs = '', body = '', skinClip = {};
  var hideSet = {}; (o.hide || []).forEach(function (h) { hideSet[h] = 1; });
  if (o.tile) body += '<rect x="' + fr.x + '" y="' + fr.y + '" width="' + fr.w + '" height="' + fr.h + '" rx="' + (o.tileR || 0) + '" fill="' + o.tile + '"/>';
  if (o.pre) body += o.pre;
  res.order.forEach(function (id) {
    var s = res.shapes[id];
    if (hideSet[s.obj] || hideSet[s.group] || (s.layer && hideSet['layer:' + s.layer])) return;
    if (o.only && !o.only[id]) return;
    var fill = s.fill, op = s.op;
    if (o.dim && !o.dim[id] && !((s.compOwn || s.comp) && (s.compOwn || s.comp).some(function (b) { return o.dim[b]; }))) op *= (o.dimTo == null ? 0.38 : o.dimTo);
    if (s.grad) { defs += '<linearGradient id="g_' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.grad[0] + '"/><stop offset="1" stop-color="' + s.grad[1] + '"/></linearGradient>'; fill = 'url(#g_' + id + ')'; }
    var attrs = ' fill="' + fill + '"';
    if (op < 0.999) attrs += ' fill-opacity="' + r2(op) + '"';
    if (s.stroke) attrs += ' stroke="' + s.stroke + '" stroke-width="' + s.sw + '" stroke-linejoin="round"';
    if (s.blend) attrs += ' style="mix-blend-mode:' + s.blend + '"';
    if (s.clip && res.shapes[s.clip]) { defs += '<clipPath id="c_' + id + '"><path d="' + res.shapes[s.clip].d + '"/></clipPath>'; attrs += ' clip-path="url(#c_' + id + ')"'; }
    if (s.comp && s.comp.length) {
      var bi = res.skinBands ? res.skinBands.indexOf(s.comp) : -1;
      if (bi >= 0) { if (!skinClip[bi]) { skinClip[bi] = true; defs += '<clipPath id="k_skin' + bi + '">' + s.comp.map(function (b) { return '<path d="' + res.shapes[b].d + '"/>'; }).join('') + '</clipPath>'; } attrs += ' clip-path="url(#k_skin' + bi + ')"'; }
      else { defs += '<clipPath id="k_' + id + '">' + s.comp.map(function (b) { return '<path d="' + res.shapes[b].d + '"/>'; }).join('') + '</clipPath>'; attrs += ' clip-path="url(#k_' + id + ')"'; }
    }
    var cuts = (s.cut || []).filter(function (c) { return res.shapes[c]; });
    if (cuts.length) { defs += '<mask id="m_' + id + '" maskUnits="userSpaceOnUse" x="-200" y="-200" width="600" height="900"><rect x="-200" y="-200" width="600" height="900" fill="#fff"/>' + cuts.map(function (c) { return '<path d="' + res.shapes[c].d + '" fill="#000"/>'; }).join('') + '</mask>'; attrs += ' mask="url(#m_' + id + ')"'; }
    body += '<path d="' + s.d + '"' + attrs + '/>';
  });
  if (o.post) body += o.post;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + Hh + '" viewBox="' + r2(fr.x) + ' ' + r2(fr.y) + ' ' + r2(fr.w) + ' ' + r2(fr.h) + '" preserveAspectRatio="xMidYMid meet"><defs>' + defs + '</defs>' + body + '</svg>';
};
M.uri = function (svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); };
M.templateUri = function (id, fg) {
  var list = M.templatePts(id, { x: 6, y: 6, w: 28, h: 28 });
  return M.uri('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><path d="' + dOf(build(list, true, ID), true) + '" fill="' + fg + '"/></svg>');
};
M.pathUri = function (list, closed, fg, box, pad) {
  if (list.length < 3) return M.uri('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"/>');
  var a = build(list, closed, ID), bb = box || boxOf(flat(a, closed)), p = pad == null ? 4 : pad;
  return M.uri('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="' + r2(bb.x - p) + ' ' + r2(bb.y - p) + ' ' + r2(bb.w + 2 * p) + ' ' + r2(bb.h + 2 * p) + '"><path d="' + dOf(a, closed) + '" fill="' + fg + '"/></svg>');
};

/* ---------- exact shapes of the old drawing, for the review: a character's portrait as the mannequin engine draws it from the converted point lists ---------- */
M.exactPts = function (n) {
  return n.map(function (a) {
    var m = a[2], p = { x: a[0], y: a[1], m: m, hi: null, ho: null };
    if (m === 'c') { p.hi = [a[3], a[4]]; p.ho = [a[5], a[6]]; } else if (m === 'cs') p.hi = [a[3], a[4]]; else if (m === 'sc') p.ho = [a[3], a[4]];
    return p;
  });
};
// a shading shape is a shade of a base colour (a mix with white or black that happens to match is a colour of its own: the white of an eye, a gleam)
M.isShadeShape = function (s) { return !!(s.c && s.c[1] === 'shade'); };
// mode: 'exact' (every shape as drawn), 'flat' (the shading shapes left out), 'map' (only the shading shapes, dark, each as strong as it is drawn)
M.exactSvg = function (ex, o) {
  o = o || {}; var mode = o.mode || 'exact', W = o.w || 200, body = '';
  ex.shapes.forEach(function (s) {
    var sh = M.isShadeShape(s);
    if (mode === 'flat' && sh) return;
    if (mode === 'map' && !sh) return;
    var d = dOf(build(M.exactPts(s.n), true, ID), true), fill = s.f, op = s.o;
    if (mode === 'map') { fill = '#1a1013'; op = Math.min(0.95, s.o * clamp((s.c[2] || 0) * 2.4 + 0.18, 0.15, 0.95)); }
    body += '<path d="' + d + '" fill="' + fill + '"' + (op < 0.999 ? ' fill-opacity="' + r2(op) + '"' : '') + '/>';
  });
  var tile = mode === 'map' ? '#e9e2e4' : ex.tile;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + W + '" viewBox="0 0 200 200"><clipPath id="ct"><rect width="200" height="200" rx="16"/></clipPath><g clip-path="url(#ct)"><rect width="200" height="200" fill="' + tile + '"/>' + body + '</g></svg>';
};

/* ---------- the old hair traced into the cells of the head (plane x side) ---------- */
// each exact piece of the old drawing's hair (the mass behind the head, the cap, the locks, their shading) is assigned to the cells where it is rooted, by where it lies on the character's own head.
// The rule for sides: left, centre and right are each optional; a piece that spans all three is ONE unit in the centre section (the whole width of the plane).
M.HAIR_PLANE_COLOURS = { front: '#c24e2c', top: '#2c7fc2', left: '#7a3cc2', right: '#2c9a5a', back: '#b8860b', nape: '#7d7d7d' };
M.traceHair = function (ex) {
  var head = ex.shapes.filter(function (s) { return s.p === 'head'; })[0];
  var hb = head ? boxOf(flat(build(M.exactPts(head.n), true, ID), true)) : { x: 60, y: 31, w: 80, h: 92 };
  var HW = hb.w / 2, H = hb.h, counts = {}, wide = {}, pieces = [];
  ex.shapes.filter(function (s) { return s.p === 'hairBack' || s.p === 'hairFront' || s.p === 'hairFall'; }).forEach(function (s) {
    var b = boxOf(flat(build(M.exactPts(s.n), true, ID), true)), cx = b.x + b.w / 2, planes;
    if (s.p !== 'hairFront') planes = b.y + b.h > hb.y + 1.04 * H ? ['back', 'nape'] : ['back'];
    else if (Math.abs(cx - 100) > HW * 0.8 && b.w < HW * 0.75) planes = [cx > 100 ? 'left' : 'right'];
    else if (b.y + b.h < hb.y + 0.3 * H) planes = ['top'];
    else planes = b.y < hb.y + 0.14 * H ? ['top', 'front'] : ['front'];
    var sides = [];
    if (b.x + b.w > 100 + HW * 0.35) sides.push('left');
    if (b.x < 100 + HW * 0.3 && b.x + b.w > 100 - HW * 0.3) sides.push('center');
    if (b.x < 100 - HW * 0.35) sides.push('right');
    var cells = [], whole = [];
    planes.forEach(function (pl) {
      var side = pl === 'left' || pl === 'right', all = !side && sides.length === 3;
      (side || all ? ['center'] : sides).forEach(function (sd) { cells.push(pl + '.' + sd); counts[pl + '.' + sd] = (counts[pl + '.' + sd] || 0) + 1; });
      if (all) { whole.push(pl); wide[pl] = (wide[pl] || 0) + 1; }
    });
    pieces.push({ s: s, plane: planes[0], planes: planes, cells: cells, whole: whole, shade: M.isShadeShape(s) });
  });
  return { name: ex.name, headBox: hb, pieces: pieces, counts: counts, wide: wide };
};
// kind 'old': the old hair alone as drawn, on a neutral ground; 'plane': the same pieces coloured by the plane they are rooted in
M.traceSvg = function (ex, tr, kind, w) {
  w = w || 150;
  if (kind === 'old') return M.exactSvg({ name: ex.name, tile: '#d9ced2', shapes: tr.pieces.map(function (t) { return t.s; }) }, { mode: 'exact', w: w });
  var body = tr.pieces.map(function (t) { return '<path d="' + dOf(build(M.exactPts(t.s.n), true, ID), true) + '" fill="' + M.HAIR_PLANE_COLOURS[t.plane] + '" fill-opacity="' + (t.shade ? 0.45 : 0.7) + '" stroke="#090708" stroke-width="0.6"/>'; }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + w + '" viewBox="0 0 200 200"><clipPath id="ct"><rect width="200" height="200" rx="16"/></clipPath><g clip-path="url(#ct)"><rect width="200" height="200" fill="#efe8ea"/>' + body + '</g></svg>';
};
// the cell grid of a trace: one row per plane, three columns (left, centre, right); a count, '·' for none, '↔' for a cell covered by a centre unit that spans the plane, '–' where a side plane has no such cell
M.traceRows = function (tr) {
  var names = { front: 'Front', top: 'Top', left: 'Left side', right: 'Right side', back: 'Back', nape: 'Nape' };
  return ['front', 'top', 'left', 'right', 'back', 'nape'].map(function (pl) {
    return { name: names[pl], cells: ['left', 'center', 'right'].map(function (sd) {
      var c = tr.counts[pl + '.' + sd] || 0, side = pl === 'left' || pl === 'right', w = !side && tr.wide[pl] || 0, covered = !side && sd !== 'center' && w > 0 && !c, col = M.HAIR_PLANE_COLOURS[pl];
      return { text: side && sd !== 'center' ? '–' : covered ? '↔' : (c ? String(c) + (sd === 'center' && w ? ' ↔' : '') : '·'), css: c ? col + 'cc' : covered ? col + '44' : '#ebdbe3',
        title: names[pl] + ', ' + sd + ': ' + (covered ? 'covered by the centre unit that spans the whole plane' : c + ' piece' + (c === 1 ? '' : 's') + (sd === 'center' && w ? ', ' + w + ' of them spanning the whole plane' : '')) };
    }) };
  });
};
// puts the exact old hair of a character (ex: a record of ExactChars) or of the default adult (ex = null) on the mannequin, in place of its old-drawing hair, and shows no section
M.loadOldHair = function (model, cfg, ex) {
  var src = ex ? ex.shapes : ((root.ExactDefault && root.ExactDefault.shapes) || []);
  var HSx = 54 / 92, r3 = function (v) { return Math.round(v * 1000) / 1000; };
  var pt = function (a) {
    var m = a[2], p = { x: r3(100 + (a[0] - 100) * HSx), y: r3(62 - (123 - a[1]) * HSx), m: m, hi: null, ho: null };
    if (m === 'c') { p.hi = [r3(a[3] * HSx), r3(a[4] * HSx)]; p.ho = [r3(a[5] * HSx), r3(a[6] * HSx)]; } else if (m === 'cs') p.hi = [r3(a[3] * HSx), r3(a[4] * HSx)]; else if (m === 'sc') p.ho = [r3(a[3] * HSx), r3(a[4] * HSx)];
    return p;
  };
  var hair = src.filter(function (s) { return s.p === 'hairBack' || s.p === 'hairFront'; });
  Object.keys(model.shapes).forEach(function (id) { if (/^hairOld_/.test(id)) delete model.shapes[id]; });
  var base = [], shd = [];
  hair.forEach(function (s, k) {
    var id = 'hairOld_' + k, c = s.c;
    var sh = { id: id, name: (s.p === 'hairBack' ? 'Hair behind the head ' : 'Hair ') + (k + 1), pts: s.n.map(pt), closed: true, z: (s.p === 'hairBack' ? 9 : 38.8) + k * 0.003, zBack: 52, slot: 'hair', tone: 0, op: s.o, view: 'both', mirrorOf: null, half: 0, side: null, back: null, noClip: true };
    if (c && c[0] === 'hair' && c[1] === 'shade') sh.shade = { kind: 'shadow', t: c[2] };
    else if (c && c[0] === 'hair' && c[1] === 'tone') sh.fn = { kind: 'shadow', t: c[2] };
    else if (!c || c[0] !== 'hair' || c[1] !== 'base') sh.hex = s.f;
    model.shapes[id] = sh;
    (sh.shade ? shd : base).push(id);
  });
  var ob = model.objects.hairOld;
  ob.shapes = base; ob.shade = shd;
  ob.name = ex ? 'Hair (' + ex.name + ', the old drawing)' : 'Hair (the old drawing, short)';
  ob.cells = ex ? Object.keys(M.traceHair(ex).counts) : ['front.left', 'front.center', 'front.right', 'top.left', 'top.center', 'top.right'];
  M.index(model);
  cfg.hidden.hairOld = false;
  model.hair.cells.forEach(function (c) { cfg.hidden[c.obj] = true; });
  cfg.hairStyle = 'old';
  if (ex && ex.bases && ex.bases.hair) cfg.col.hair = { src: 'hex', hex: ex.bases.hair };
};

/* ---------- random previews ---------- */
M.rng = function (seed) {
  var a = seed >>> 0;
  return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
M.randomPalette = function (rng) {
  var base = Math.floor(rng() * 360), out = [];
  for (var i = 0; i < 5; i++) out.push({ id: 'k' + (i + 1), name: 'Swatch ' + (i + 1), h: Math.round((base + i * (40 + rng() * 60)) % 360), s: Math.round(28 + rng() * 44) });
  return out;
};
// mode: 'rand' (inside the ranges), 'min' or 'max' (every slider at the end of its range: the stress previews)
// locks: {rangeId|slot|objectId|'forms'|'colour'|'pose'|'palette'|'tile'|'fall': true} keep the value from cfg0
M.randomCfg = function (model, rng, mode, cfg0, locks) {
  locks = locks || {};
  var cfg = cfg0 ? clone(cfg0) : M.defaultCfg(model);
  var pose = mode === 'rand' && !locks.pose ? model.poses[Math.floor(rng() * rng() * model.poses.length)] : null;
  // a build preset now and then, so the body shapes vary together
  var build = mode === 'rand' && !locks.build ? model.presets.filter(function (p) { return p.kind === 'build'; }) : [];
  var buildP = build.length && rng() < 0.7 ? build[Math.floor(rng() * build.length)] : null;
  var expr = mode === 'rand' && !locks.expression ? model.presets.filter(function (p) { return p.kind === 'expression'; }) : [];
  var exprP = expr.length && rng() < 0.6 ? expr[Math.floor(rng() * expr.length)] : null;
  model.ranges.forEach(function (r) {
    if (locks[r.id]) return;
    if (r.pose && mode === 'rand') { if (pose && pose.values[r.id] != null) cfg.val[r.id] = pose.values[r.id]; return; }
    if (buildP && buildP.values[r.id] != null) { cfg.val[r.id] = buildP.values[r.id]; return; }
    if (exprP && exprP.values[r.id] != null) { cfg.val[r.id] = exprP.values[r.id]; return; }
    var lo = r.min, hi = r.max;
    if (mode === 'rand' && r.rand) { lo = r.rand[0]; hi = r.rand[1]; }
    var v = mode === 'min' ? r.min : mode === 'max' ? r.max : lo + (hi - lo) * ((rng() + rng() + rng()) / 3);
    if (r.step) v = Math.min(r.max, Math.round(v / r.step) * r.step);
    cfg.val[r.id] = Math.round(v * 10) / 10;
  });
  if (mode === 'rand' && !locks.hair && !locks.forms) { var hs = model.hair.styles; M.applyHairStyle(model, cfg, hs[Math.floor(rng() * hs.length)]); }
  if (!locks.forms) Object.keys(model.objects).forEach(function (oid) {
    model.objects[oid].axes.forEach(function (ax) { if (locks[oid] || (model.objects[oid].cell && mode === 'rand' && !locks.hair)) return; cfg.forms[oid + '.' + ax.id] = mode === 'rand' ? ax.options[Math.floor(rng() * ax.options.length)].id : ax.def; });
  });
  if (!locks.colour) {
    if (mode === 'rand' && !locks.palette) cfg.palette = M.randomPalette(rng);
    Object.keys(model.slots).forEach(function (sk) {
      if (locks[sk]) return;
      var sl = model.slots[sk];
      if (sl.presets.length > 1 && (rng() < 0.7 || sk === 'skin' || sk === 'eye')) {
        var pr = sl.presets[Math.floor(rng() * sl.presets.length)];
        cfg.col[sk] = { src: 'preset', id: pr.id, l: clamp(pr.l + (rng() - 0.5) * 10, sl.l.min, sl.l.max) };
      } else {
        var sw = cfg.palette[Math.floor(rng() * cfg.palette.length)];
        cfg.col[sk] = { src: 'palette', id: sw.id, l: clamp(sl.l.min + (sl.l.max - sl.l.min) * (0.25 + rng() * 0.5), sl.l.min, sl.l.max) };
      }
    });
    if (!locks.tile) cfg.tile = hex(M.swatchCss(Math.floor(rng() * 360), 40, 84));
  }
  if (!locks.fall) cfg.fallSide = ['down', 'left', 'right', 'behind'][Math.floor(rng() * 4)];
  return cfg;
};
function hex(css) {
  var m = /hsl\((-?[\d.]+),([\d.]+)%,([\d.]+)%\)/.exec(css); if (!m) return '#cfd9e8';
  var h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100, a = s * Math.min(l, 1 - l);
  function f(n) { var k = (n + h * 12) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return ('0' + Math.round(c * 255).toString(16)).slice(-2); }
  return '#' + f(0) + f(8) + f(4);
}
M.hex = hex;
M.clone = clone;

root.Mannequin = M;
})(typeof window !== 'undefined' ? window : globalThis);
