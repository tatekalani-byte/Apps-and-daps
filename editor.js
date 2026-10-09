/* ───────────── cutout editor ─────────────
   Two modes on the same photo:
   - "bg": the main cutout (background removed), shown everywhere.
   - "inside": for jackets, what to hide when layering over a top. It starts from the
     main cutout and can only remove more; the main cutout is never changed by it.
   Panels: Cut (select, draw, brush, color, edge), Edges (smooth, shrink/grow, soften),
   Adjust (light and color, spot fix) and Crop (rotate, flip, straighten, crop).
   The mask is 0 (cut) … 255 (keep) per photo pixel. Every change can be undone. */
const ed = {
  mode: "bg", pix: null, mask: null, base: null, layer: null,
  undo: [], redo: [], panel: "cut", tool: "select", keep: false,
  size: 28, tol: 30, healSize: 24,
  pts: [], painting: false, drawing: false, last: null, tap: null, cursor: null, pan: null,
  stroke: null, crop: null, backdrop: "ghost", comparing: false, pixDirty: false,
  sel: null, samPrep: null, samPrepFor: -1, version: 0,
  edgeBase: null, adjBase: null, rotBase: null, out: null,
};
const cutCanvas = $("#cut-canvas");
const stage = $("#cut-stage");
const view = $("#cut-view");
const mb = (n) => (n / 1048576).toFixed(1);

/* ── hint line, download offers, busy overlay ── */
let offerDone = null;
function hint(text) {
  offerDone?.(false);
  $("#cut-hint").textContent = text;
}
// Show a question with a button in the hint line; resolves true if tapped.
function offer(text, label) {
  hint("");
  const box = $("#cut-hint");
  box.innerHTML = `<span>${esc(text)}</span> <button type="button" class="btn btn-primary btn-sm hint-btn">${esc(label)}</button>`;
  return new Promise((res) => {
    offerDone = (v) => { offerDone = null; res(v); };
    box.querySelector("button").onclick = () => { box.textContent = ""; offerDone?.(true); };
  });
}
function busy(text, frac) {
  $("#cut-busy").hidden = text === false;
  if (text === false) return;
  $("#cut-busy-text").textContent = text;
  $("#cut-bar").parentElement.hidden = frac == null;
  if (frac != null) $("#cut-bar").style.width = `${Math.round(frac * 100)}%`;
}
const loadFail = () => (navigator.onLine === false
  ? "You're offline. The first download needs a connection; after that it works offline."
  : "Couldn't load it. Try again in a moment.");

const HINTS = {
  bg: {
    select: ["Tap something to remove it, like a hanger, a tag or the floor.", "Tap the piece and it gets outlined. Tap more of it to add."],
    lasso: ["Draw around anything you want removed.", "Draw around parts to bring back."],
    brush: ["Paint over anything you want removed.", "Paint to bring parts back."],
    wand: ["Tap an area of one color to remove it.", "Tap a removed patch to bring back that color."],
    edge: "Paint along a messy edge, like knit, fur or fringe. It works out what's the piece and what's background.",
  },
  inside: {
    select: ["Tap the lining or back that shows through the open front to mark it.", "Tap a marked part to unmark it."],
    lasso: ["Draw around the lining that shows through the open front. It's hidden only when this is layered over a top.", "Draw around marked parts to unmark them."],
    brush: ["Paint over the inside to mark it.", "Paint to unmark."],
    wand: ["Tap the lining to mark it in one go.", "Tap a marked patch to unmark it."],
    edge: "Paint along the edge of the opening to clean it up.",
  },
};
const toolHint = () => {
  const h = HINTS[ed.mode][ed.tool];
  return Array.isArray(h) ? h[ed.keep ? 1 : 0] : h ?? "";
};

/* ── open / close ── */
async function openEditor(mode = "bg") {
  if (!form.original) return;
  ed.mode = mode;
  const inside = mode === "inside";
  $("#cut-smart").hidden = $("#cut-auto").hidden = inside;
  $("#cut-front").hidden = !inside;
  document.querySelectorAll('#cut-tabs [data-panel="adjust"], #cut-tabs [data-panel="crop"]').forEach((b) => { b.hidden = inside; });
  $("#cut-dialog").showModal();
  busy("Loading…");
  ed.pix = await Cutout.loadPixels(form.original);
  const main = await Cutout.maskFromCut(ed.pix, form.cut ? form.blob : null, form.cut);
  if (inside) {
    ed.base = main;
    ed.mask = form.layer ? await Cutout.maskFromCut(ed.pix, form.layer.blob, form.layer.cut) : main.slice();
    ed.layer = null;
  } else {
    ed.base = null;
    ed.mask = main;
    ed.layer = form.layer ? await Cutout.maskFromCut(ed.pix, form.layer.blob, form.layer.cut) : null;
  }
  Object.assign(ed, { undo: [], redo: [], pts: [], cursor: null, crop: null, stroke: null, sel: null, samPrep: null, pixDirty: false, comparing: false });
  ed.version++;
  endSessions();
  updateHistory();
  busy(false);
  sizeCanvas();
  setPanel("cut");
  setKeep(false);
  setTool("select");
  fitView();
  draw();
}
function sizeCanvas() {
  cutCanvas.width = ed.pix.W;
  cutCanvas.height = ed.pix.H;
  ed.out = new ImageData(ed.pix.W, ed.pix.H);
}

/* ── panels, tools, keep/remove ── */
function setPanel(name) {
  ed.panel = name;
  document.querySelectorAll("#cut-tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.panel === name));
  document.querySelectorAll(".cut-panel").forEach((s) => { s.hidden = s.dataset.panel !== name; });
  setHeal(false);
  if (name === "cut") setTool(ed.lastCutTool ?? "select");
  else if (name === "crop") { ed.tool = "crop"; hint("Drag across the photo to crop, then tap Crop. Rotate and straighten here too."); }
  else { ed.tool = "none"; hint(name === "edges" ? "Slide to clean up the edge. Drag with one finger to look around." : "Slide to fix the light and color. Spot fix paints away lint and small stains."); }
  ed.crop = null;
  $("#crop-apply").disabled = true;
  redraw();
}
$("#cut-tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) setPanel(b.dataset.panel); };

function setTool(t) {
  if (t !== ed.tool) ed.sel = null;
  ed.tool = t;
  ed.lastCutTool = t;
  document.querySelectorAll("#cut-tools button").forEach((c) => c.setAttribute("aria-checked", c.dataset.tool === t));
  const sized = t === "brush" || t === "edge", strength = t === "wand";
  $("#cut-slider-wrap").hidden = !sized && !strength;
  $("#slider-label").textContent = strength ? "Strength" : "Size";
  Object.assign($("#cut-slider"), strength ? { min: 8, max: 80, value: ed.tol } : { min: 6, max: 90, value: ed.size });
  $("#cut-mode").hidden = t === "edge";
  hint(toolHint());
  if (t === "select" && AiCut.samReady()) ensureSam();
}
$("#cut-tools").onclick = (e) => { const c = e.target.closest("button"); if (c) setTool(c.dataset.tool); };
$("#cut-slider").oninput = (e) => { if (ed.tool === "wand") ed.tol = +e.target.value; else ed.size = +e.target.value; };

function setKeep(k) {
  ed.keep = k;
  document.querySelectorAll("#cut-mode button").forEach((b) => b.setAttribute("aria-checked", b.dataset.keep === (k ? "1" : "0")));
  if (ed.panel === "cut" && !ed.sel) hint(toolHint());
}
$("#cut-mode").onclick = (e) => { const b = e.target.closest("button"); if (b) setKeep(b.dataset.keep === "1"); };

/* ── undo / redo ── */
function snapshot(withPix) {
  return {
    mask: ed.mask.slice(), layer: ed.layer?.slice() ?? null,
    pix: withPix ? { W: ed.pix.W, H: ed.pix.H, data: ed.pix.data.slice() } : null,
  };
}
// keep: the slider session that's starting (so its slider isn't reset)
function pushUndo(withPix = false, keep = null) {
  ed.undo.push(snapshot(withPix));
  if (ed.undo.length > 20) ed.undo.shift();
  ed.redo = [];
  endSessions(keep);
  updateHistory();
}
function restore(s) {
  ed.mask = s.mask;
  ed.layer = s.layer;
  if (s.pix) {
    const resized = s.pix.W !== ed.pix.W || s.pix.H !== ed.pix.H;
    ed.pix = { W: s.pix.W, H: s.pix.H, data: s.pix.data };
    ed.pixDirty = true;
    ed.version++;
    if (resized) { sizeCanvas(); fitView(); }
  }
}
function stepHistory(from, to) {
  const s = from.pop();
  if (!s) return;
  to.push(snapshot(!!s.pix));
  restore(s);
  endSessions();
  updateHistory();
  redraw();
}
$("#cut-undo").onclick = () => stepHistory(ed.undo, ed.redo);
$("#cut-redo").onclick = () => stepHistory(ed.redo, ed.undo);
function updateHistory() {
  $("#cut-undo").disabled = !ed.undo.length;
  $("#cut-redo").disabled = !ed.redo.length;
}
// Slider panels work from a snapshot taken when you start sliding; any other edit ends that.
function endSessions(keep = null) {
  if (keep !== "sel") ed.sel = null;
  if (keep !== "edge") { ed.edgeBase = null; document.querySelectorAll("[data-edge]").forEach((i) => { i.value = 0; }); }
  if (keep !== "adj") { ed.adjBase = null; document.querySelectorAll("[data-adj]").forEach((i) => { i.value = 0; }); }
  if (keep !== "rot") { ed.rotBase = null; $("#straighten").value = 0; }
}

/* ── drawing the canvas ── */
const BACKDROPS = { ghost: "Ghost", checker: "Checker", light: "Light", dark: "Dark" };
$("#cut-backdrop").onclick = () => {
  const keys = Object.keys(BACKDROPS);
  ed.backdrop = keys[(keys.indexOf(ed.backdrop) + 1) % keys.length];
  $("#cut-backdrop").textContent = BACKDROPS[ed.backdrop];
  stage.dataset.bg = ed.backdrop;
  redraw();
};
const compare = (on) => { if (ed.comparing !== on) { ed.comparing = on; redraw(); } };
$("#cut-compare").addEventListener("pointerdown", (e) => { e.stopPropagation(); compare(true); });
for (const t of ["pointerup", "pointerleave", "pointercancel"]) $("#cut-compare").addEventListener(t, () => compare(false));

function draw() {
  if (!ed.pix) return;
  const { W, H, data } = ed.pix, o = ed.out.data, m = ed.mask, b = ed.base;
  const ghost = ed.backdrop === "ghost", cmp = ed.comparing, heal = ed.stroke?.tool === "heal" ? ed.stroke.region : null;
  for (let p = 0; p < W * H; p++) {
    let r = data[p * 4], g = data[p * 4 + 1], bl = data[p * 4 + 2], a;
    if (cmp) a = 255;
    else if (heal && heal[p]) { r = r * 0.4 + 120 * 0.6; g = g * 0.4 + 200 * 0.6; bl = bl * 0.4 + 220 * 0.6; a = 230; }
    else if (b && b[p] > 40 && m[p] < b[p] - 40) {
      // marked as inside: tint it so it's clear what will hide when layering
      r = r * 0.45 + 217 * 0.55; g = g * 0.45 + 187 * 0.55; bl = bl * 0.45 + 143 * 0.55; a = 150;
    } else a = ghost ? Math.max(m[p], b ? 22 : 38) : m[p]; // ghost: removed parts stay faintly visible
    o[p * 4] = r; o[p * 4 + 1] = g; o[p * 4 + 2] = bl; o[p * 4 + 3] = a;
  }
  const ctx = cutCanvas.getContext("2d");
  ctx.putImageData(ed.out, 0, 0);
  const k = W / cutCanvas.getBoundingClientRect().width;
  if (ed.cursor) {
    // brush ring, so you can see exactly what a stroke will touch
    const [cx, cy, r] = ed.cursor;
    ctx.lineWidth = 1.5 * k;
    ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.beginPath(); ctx.arc(cx, cy, r + k, 0, 7); ctx.stroke();
    ctx.strokeStyle = "#ededef"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  }
  if (ed.pts.length > 1) {
    ctx.strokeStyle = "#ededef"; ctx.fillStyle = ed.keep ? "rgba(140,200,160,.25)" : "rgba(217,187,143,.25)"; ctx.lineWidth = 2 * k;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.beginPath();
    ed.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.fill();
    ctx.stroke();
  }
  if (ed.crop) {
    const { x, y, w, h } = cropRect();
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, W, y); ctx.fillRect(0, y + h, W, H - y - h);
    ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, W - x - w, h);
    ctx.strokeStyle = "#ededef"; ctx.lineWidth = 2 * k; ctx.strokeRect(x, y, w, h);
    ctx.lineWidth = 1 * k; ctx.strokeStyle = "rgba(237,237,239,.5)";
    for (const f of [1 / 3, 2 / 3]) {
      ctx.beginPath(); ctx.moveTo(x + w * f, y); ctx.lineTo(x + w * f, y + h); ctx.moveTo(x, y + h * f); ctx.lineTo(x + w, y + h * f); ctx.stroke();
    }
  }
}
let rafId = 0;
const redraw = () => { rafId ||= requestAnimationFrame(() => { rafId = 0; draw(); }); };

// In inside mode nothing outside the main cutout can come back.
function clampToBase() {
  if (!ed.base) return;
  const m = ed.mask, b = ed.base;
  for (let p = 0; p < m.length; p++) if (m[p] > b[p]) m[p] = b[p];
}

function canvasPoint(e) {
  const r = cutCanvas.getBoundingClientRect();
  return [((e.clientX - r.left) * ed.pix.W) / r.width, ((e.clientY - r.top) * ed.pix.H) / r.height, ed.pix.W / r.width];
}
// The current photo as an image file (for the AI models, and for saving after photo edits).
function pixBlob(type = "image/jpeg", q = 0.92) {
  const c = document.createElement("canvas");
  c.width = ed.pix.W; c.height = ed.pix.H;
  const img = new ImageData(ed.pix.W, ed.pix.H);
  img.data.set(ed.pix.data);
  for (let p = 3; p < img.data.length; p += 4) img.data[p] = 255;
  c.getContext("2d").putImageData(img, 0, 0);
  return new Promise((r) => c.toBlob(r, type, q));
}

/* ── brush-type tools: brush (erase/restore), edge (refine), heal (spot fix) ── */
function stamp(x, y, r) {
  const { W, H } = ed.pix, s = ed.stroke;
  if (s.tool === "brush") { Cutout.brush(ed.mask, W, H, x, y, r, ed.keep); return; }
  if (s.tool === "edge") { refineAt(x, y, r); return; }
  const reg = s.region; // heal: collect the area to fix, applied when the finger lifts
  for (let Y = Math.max(0, Math.floor(y - r)); Y <= Math.min(H - 1, Math.ceil(y + r)); Y++) {
    for (let X = Math.max(0, Math.floor(x - r)); X <= Math.min(W - 1, Math.ceil(x + r)); X++) {
      if ((X - x) ** 2 + (Y - y) ** 2 <= r * r) reg[Y * W + X] = 1;
    }
  }
}
function paintTo(x, y, r) {
  const [lx, ly] = ed.last ?? [x, y];
  const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / Math.max(1, r / 2)));
  for (let s = 1; s <= steps; s++) stamp(lx + ((x - lx) * s) / steps, ly + ((y - ly) * s) / steps, r);
  if (ed.keep || ed.stroke.tool === "edge") clampToBase();
  ed.last = [x, y];
  redraw();
}

/* Refine edge: inside the brush, work out the piece's color and the background's color
   from the area around it, then set each pixel's see-through amount by which of the two
   it's closer to. Fuzzy, see-through and frayed edges come out soft instead of jagged. */
function refineAt(x, y, r) {
  const { W, H, data } = ed.pix, M = ed.mask, B0 = ed.stroke.base, WT = ed.stroke.weight;
  const R = r * 2.2;
  const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(W - 1, Math.ceil(x + R));
  const y0 = Math.max(0, Math.floor(y - R)), y1 = Math.min(H - 1, Math.ceil(y + R));
  const F = [0, 0, 0, 0], Bk = [0, 0, 0, 0];
  for (let Y = y0; Y <= y1; Y += 2) for (let X = x0; X <= x1; X += 2) {
    const p = Y * W + X, acc = B0[p] > 230 ? F : B0[p] < 25 ? Bk : null;
    if (!acc) continue;
    acc[0] += data[p * 4]; acc[1] += data[p * 4 + 1]; acc[2] += data[p * 4 + 2]; acc[3]++;
  }
  if (F[3] < 4 || Bk[3] < 4) return;
  const f = F.slice(0, 3).map((v) => v / F[3]), b = Bk.slice(0, 3).map((v) => v / Bk[3]);
  const d = [f[0] - b[0], f[1] - b[1], f[2] - b[2]], den = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  if (den < 400) return; // piece and background are too alike here to tell apart
  for (let Y = Math.max(0, Math.floor(y - r)); Y <= Math.min(H - 1, Math.ceil(y + r)); Y++) {
    for (let X = Math.max(0, Math.floor(x - r)); X <= Math.min(W - 1, Math.ceil(x + r)); X++) {
      const dist = Math.hypot(X - x, Y - y);
      if (dist > r) continue;
      const p = Y * W + X;
      const t = ((data[p * 4] - b[0]) * d[0] + (data[p * 4 + 1] - b[1]) * d[1] + (data[p * 4 + 2] - b[2]) * d[2]) / den;
      const a = Math.max(0, Math.min(1, (t - 0.1) / 0.8)) * 255;
      const w = Math.min(1, (r - dist) / (r * 0.35));
      if (w <= WT[p]) continue; // a closer dab already set this pixel
      WT[p] = w;
      M[p] = B0[p] * (1 - w) + a * w;
    }
  }
}

/* Spot fix: fill the painted area in from its surroundings, layer by layer from the
   outside in, then smooth it so it blends. Good for lint, small stains and pills.
   The cutout is filled in the same way, so a speck that was cut out becomes part of the piece. */
function heal(region) {
  const { W, H, data } = ed.pix, M = ed.mask;
  let front = [];
  for (let p = 0; p < W * H; p++) if (region[p]) front.push(p);
  if (!front.length) return;
  const known = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) known[p] = region[p] ? 0 : 1;
  const nbs = (p) => { const x = p % W; return [p - W, p + W, x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, x > 0 ? p - W - 1 : -1, x < W - 1 ? p - W + 1 : -1, x > 0 ? p + W - 1 : -1, x < W - 1 ? p + W + 1 : -1]; };
  const all = front.slice();
  while (front.length) {
    const fills = [], rest = [];
    for (const p of front) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (const q of nbs(p)) {
        if (q < 0 || q >= W * H || !known[q]) continue;
        r += data[q * 4]; g += data[q * 4 + 1]; b += data[q * 4 + 2]; a += M[q]; n++;
      }
      if (n) fills.push(p, r / n, g / n, b / n, a / n); else rest.push(p);
    }
    if (!fills.length) break;
    for (let i = 0; i < fills.length; i += 5) {
      const p = fills[i];
      data[p * 4] = fills[i + 1]; data[p * 4 + 1] = fills[i + 2]; data[p * 4 + 2] = fills[i + 3]; M[p] = fills[i + 4]; known[p] = 1;
    }
    front = rest;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const p of all) {
      let r = 0, g = 0, b = 0, n = 0;
      for (const q of [p, ...nbs(p)]) {
        if (q < 0 || q >= W * H) continue;
        r += data[q * 4]; g += data[q * 4 + 1]; b += data[q * 4 + 2]; n++;
      }
      data[p * 4] = r / n; data[p * 4 + 1] = g / n; data[p * 4 + 2] = b / n;
    }
  }
  // a little grain so the patch doesn't look flat next to fabric
  for (const p of all) {
    const n = (Math.random() - 0.5) * 6;
    data[p * 4] += n; data[p * 4 + 1] += n; data[p * 4 + 2] += n;
  }
}

/* ── tap tools: select (AI) and color ── */
async function ensureSam() {
  if (ed.samPrep && ed.samPrepFor === ed.version) return true;
  if (!AiCut.samReady() && !(await offer(`Tap to select needs a one-time ${AiCut.SIZES.sam} MB download. After that it works offline.`, "Download"))) return false;
  const v = ed.version;
  try {
    busy("Getting tap to select ready…", 0);
    await AiCut.loadSam((l, t) => busy(`Downloading tap to select · ${mb(l)} of ${mb(t)} MB`, l / t));
    busy("Looking at the photo…");
    const prep = await AiCut.prepareSelect(await pixBlob());
    if (v !== ed.version) return false; // the photo changed meanwhile
    ed.samPrep = prep;
    ed.samPrepFor = v;
    if (ed.tool === "select" && !ed.sel) hint(toolHint());
    return true;
  } catch (err) {
    console.warn(err);
    hint(loadFail());
    return false;
  } finally {
    busy(false);
  }
}
let selecting = false;
async function doSelect(x, y) {
  if (selecting) return;
  selecting = true;
  try {
    if (!(await ensureSam())) return;
    const { W, H } = ed.pix;
    const start = !ed.sel;
    if (start) ed.sel = { before: ed.mask.slice(), keep: ed.keep, points: [] };
    const sel = ed.sel;
    sel.points.push({ x, y, keep: ed.keep === sel.keep }); // same mode as the first tap = part of it
    pushUndo(false, "sel");
    busy("Selecting…");
    let S;
    try { S = await AiCut.select(ed.samPrep, sel.points); }
    catch (err) { console.warn(err); sel.points.pop(); stepHistory(ed.undo, []); ed.sel = start ? null : sel; hint("Couldn't select that. Try again."); return; }
    finally { busy(false); }
    Cutout.softenEdges(S, W, H);
    const B = sel.before, M = ed.mask, base = ed.base;
    let n = 0;
    for (let p = 0; p < W * H; p++) {
      if (S[p] > 127) n++;
      if (sel.keep) M[p] = base ? Math.max(B[p], Math.min(S[p], base[p])) : S[p];
      else M[p] = Math.min(B[p], 255 - S[p]);
    }
    if (!n) hint("Nothing found right there. Try tapping the middle of it.");
    else if (sel.keep) hint(base ? "Unmarked. Tap more to unmark more." : "Outlined. Tap more of it to add, or switch to Remove and tap parts to take away.");
    else hint(base ? "Marked. Tap more of the inside, or switch to Keep to unmark parts." : "Removed. Tap more to remove more, or switch to Keep and tap to bring parts back.");
    redraw();
  } finally {
    selecting = false;
  }
}
function doWand(x, y) {
  pushUndo();
  const n = Cutout.wand(ed.pix, ed.mask, x, y, ed.tol, ed.keep);
  if (ed.keep) clampToBase();
  if (!n) { ed.undo.pop(); updateHistory(); hint(ed.keep ? "That spot is already there." : "That spot is already removed."); }
  else hint(ed.keep ? "Brought back. Tap more, or raise Strength if it missed some." : "Removed. Tap more, or raise Strength if it missed some.");
  redraw();
}

/* ── smart cutout (AI) ── */
async function smartMask(blob, W, H, onProgress) {
  const m = await AiCut.removeBackground(blob, W, H, onProgress);
  Cutout.keepBigPieces(m, W, H);
  let n = 0;
  for (let p = 0; p < m.length; p++) if (m[p] > 127) n++;
  return n > m.length * 0.01 && n < m.length * 0.995 ? m : null;
}
$("#cut-smart").onclick = async () => {
  if (!AiCut.bgReady() && !(await offer(`Smart cutout needs a one-time ${AiCut.SIZES.bg} MB download. After that it works offline and cuts out new photos automatically.`, "Download"))) return;
  try {
    busy("Getting smart cutout ready…", 0);
    const blob = await pixBlob();
    const m = await smartMask(blob, ed.pix.W, ed.pix.H, (l, t) => busy(`Downloading smart cutout · ${mb(l)} of ${mb(t)} MB`, l / t));
    if (!m) { hint("Smart cutout couldn't find a piece in this photo. Try Select or Draw."); return; }
    pushUndo();
    ed.mask.set(m);
    hint("Done. Touch up anything it missed with Select or Brush.");
    redraw();
  } catch (err) {
    console.warn(err);
    hint(loadFail());
  } finally {
    busy(false);
  }
};
$("#cut-auto").onclick = () => {
  pushUndo();
  const m = Cutout.removeBackground(ed.pix, ed.tol);
  if (m) { ed.mask.set(m); hint("Background removed by color. For busy backgrounds, Smart cutout does better."); }
  else { ed.undo.pop(); updateHistory(); hint("Couldn't find a plain background. Try Smart cutout or Select."); }
  redraw();
};
$("#cut-front").onclick = () => {
  pushUndo();
  const r = Cutout.openFront(ed.pix, ed.mask, ed.tol);
  if (r.ok) hint("Found the inside. Adjust it, or tap Done.");
  else { ed.undo.pop(); updateHistory(); setTool("lasso"); hint("Couldn't find the inside automatically. Draw around it instead."); }
  redraw();
};
$("#cut-reset").onclick = () => {
  pushUndo();
  if (ed.base) ed.mask.set(ed.base); else ed.mask.fill(255);
  ed.pts = [];
  redraw();
  hint(ed.base ? "Cleared the marked inside." : "Back to the whole photo.");
};

/* ── Edges panel ── */
// Box blur with running sums, rows then columns.
function blur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / n;
      s += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s / n;
      s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}
// Grow (max) or shrink (min) by r pixels, rows then columns.
function morph(src, W, H, r, grow) {
  const pick = grow ? Math.max : Math.min;
  const tmp = new Uint8ClampedArray(W * H), out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = src[y * W + x];
    for (let d = 1; d <= r; d++) v = pick(v, src[y * W + Math.max(0, x - d)], src[y * W + Math.min(W - 1, x + d)]);
    tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = tmp[y * W + x];
    for (let d = 1; d <= r; d++) v = pick(v, tmp[Math.max(0, y - d) * W + x], tmp[Math.min(H - 1, y + d) * W + x]);
    out[y * W + x] = v;
  }
  return out;
}
function applyEdges() {
  const { W, H } = ed.pix;
  const v = (k) => +document.querySelector(`[data-edge="${k}"]`).value;
  const smooth = v("smooth"), grow = v("grow"), soften = v("soften");
  let m = ed.edgeBase.slice();
  if (smooth) {
    const b = blur(blur(m, W, H, smooth), W, H, smooth);
    for (let p = 0; p < m.length; p++) m[p] = (b[p] - 127.5) * 3.2 + 127.5;
  }
  if (grow) m = morph(m, W, H, Math.abs(grow), grow > 0);
  if (soften) {
    const b = blur(blur(m, W, H, soften), W, H, soften);
    for (let p = 0; p < m.length; p++) m[p] = b[p];
  }
  ed.mask.set(m);
  clampToBase();
  redraw();
}
document.querySelectorAll("[data-edge]").forEach((i) => i.addEventListener("input", () => {
  if (!ed.edgeBase) { pushUndo(false, "edge"); ed.edgeBase = ed.mask.slice(); }
  applyEdges();
}));

/* ── Adjust panel ── */
function applyAdjust() {
  const v = (k) => +document.querySelector(`[data-adj="${k}"]`).value;
  const b = v("b") * 0.6, c = v("c"), w = v("w") * 0.25, s = 1 + v("s") / 100;
  const f = c >= 0 ? 1 + c / 50 : 1 + c / 125;
  const src = ed.adjBase, out = ed.pix.data;
  for (let i = 0; i < src.length; i += 4) {
    let r = (src[i] + b - 128) * f + 128 + w, g = (src[i + 1] + b - 128) * f + 128 + w * 0.2, bl = (src[i + 2] + b - 128) * f + 128 - w;
    const l = 0.299 * r + 0.587 * g + 0.114 * bl;
    out[i] = l + (r - l) * s; out[i + 1] = l + (g - l) * s; out[i + 2] = l + (bl - l) * s;
  }
  ed.pixDirty = true;
  ed.version++;
  redraw();
}
document.querySelectorAll("[data-adj]").forEach((i) => i.addEventListener("input", () => {
  if (!ed.adjBase) { pushUndo(true, "adj"); ed.adjBase = ed.pix.data.slice(); }
  applyAdjust();
}));
// Auto: stretch the darkest and brightest 0.5% of the piece to full range.
$("#cut-auto-tone").onclick = () => {
  const { data } = ed.pix, m = ed.mask, hist = new Uint32Array(256);
  let n = 0;
  for (let p = 0; p < m.length; p++) {
    if (m[p] < 128) continue;
    hist[Math.round(0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2])]++; n++;
  }
  if (!n) { hint("Cut out the piece first, so Auto knows what to look at."); return; }
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < n * 0.005) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < n * 0.005) hi--;
  if (hi - lo < 10 || (lo < 4 && hi > 251)) { hint("The light already looks good."); return; }
  pushUndo(true);
  const k = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = (data[i + c] - lo) * k;
  ed.pixDirty = true;
  ed.version++;
  hint("Balanced the light. Undo if you liked it before.");
  redraw();
};
function setHeal(on) {
  $("#cut-heal").setAttribute("aria-pressed", on);
  $("#heal-size-wrap").hidden = !on;
  if (ed.panel === "adjust") {
    ed.tool = on ? "heal" : "none";
    hint(on ? "Paint over lint, pills or a small stain. It's filled in from around it when you lift your finger." : "Slide to fix the light and color. Spot fix paints away lint and small stains.");
  }
}
$("#cut-heal").onclick = () => setHeal($("#cut-heal").getAttribute("aria-pressed") !== "true");
$("#heal-size").oninput = (e) => { ed.healSize = +e.target.value; };

/* ── Crop panel: rotate, flip, straighten, crop ── */
function alphaCanvas(W, H, m) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const img = new ImageData(W, H);
  for (let p = 0; p < W * H; p++) img.data[p * 4 + 3] = m[p];
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}
function photoCanvas(W, H, data) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const img = new ImageData(W, H);
  img.data.set(data);
  for (let p = 3; p < img.data.length; p += 4) img.data[p] = 255;
  c.getContext("2d").putImageData(img, 0, 0);
  return c;
}
// Redraw photo, mask and layer mask through the same canvas transform.
function transformAll(src, nW, nH, setup) {
  nW = Math.max(1, Math.round(nW)); nH = Math.max(1, Math.round(nH));
  const run = (c) => {
    const o = document.createElement("canvas");
    o.width = nW; o.height = nH;
    const x = o.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high";
    setup(x);
    x.drawImage(c, 0, 0);
    return x.getImageData(0, 0, nW, nH).data;
  };
  const alpha = (d) => { const m = new Uint8ClampedArray(nW * nH); for (let p = 0; p < m.length; p++) m[p] = d[p * 4 + 3]; return m; };
  ed.pix = { W: nW, H: nH, data: run(photoCanvas(src.W, src.H, src.data)) };
  ed.mask = alpha(run(alphaCanvas(src.W, src.H, src.mask)));
  ed.layer = src.layer ? alpha(run(alphaCanvas(src.W, src.H, src.layer))) : null;
  ed.pixDirty = true;
  ed.version++;
  ed.crop = null;
  $("#crop-apply").disabled = true;
  sizeCanvas();
}
const current = () => ({ W: ed.pix.W, H: ed.pix.H, data: ed.pix.data, mask: ed.mask, layer: ed.layer });
function rotate90(dir) {
  pushUndo(true);
  const s = current();
  transformAll(s, s.H, s.W, (x) => { x.translate(s.H / 2, s.W / 2); x.rotate((dir * Math.PI) / 2); x.translate(-s.W / 2, -s.H / 2); });
  fitView();
  redraw();
}
$("#rot-left").onclick = () => rotate90(-1);
$("#rot-right").onclick = () => rotate90(1);
$("#flip-h").onclick = () => {
  pushUndo(true);
  const s = current();
  transformAll(s, s.W, s.H, (x) => { x.translate(s.W, 0); x.scale(-1, 1); });
  redraw();
};
$("#straighten").addEventListener("input", (e) => {
  if (!ed.rotBase) { pushUndo(true, "rot"); const s = current(); ed.rotBase = { ...s, data: s.data.slice(), mask: s.mask.slice(), layer: s.layer?.slice() ?? null }; }
  const s = ed.rotBase, a = (+e.target.value * Math.PI) / 180;
  // zoom in just enough that no empty corners show
  const cos = Math.abs(Math.cos(a)), sin = Math.abs(Math.sin(a));
  const k = Math.max((s.W * cos + s.H * sin) / s.W, (s.W * sin + s.H * cos) / s.H);
  transformAll(s, s.W, s.H, (x) => { x.translate(s.W / 2, s.H / 2); x.rotate(a); x.scale(k, k); x.translate(-s.W / 2, -s.H / 2); });
  redraw();
});
function cropRect() {
  const c = ed.crop, { W, H } = ed.pix;
  const x = Math.max(0, Math.min(c.x0, c.x1)), y = Math.max(0, Math.min(c.y0, c.y1));
  return { x, y, w: Math.min(W, Math.max(c.x0, c.x1)) - x, h: Math.min(H, Math.max(c.y0, c.y1)) - y };
}
$("#crop-apply").onclick = () => {
  if (!ed.crop) return;
  const r = cropRect();
  if (r.w < 20 || r.h < 20) { hint("That's too small to crop to."); return; }
  pushUndo(true);
  transformAll(current(), r.w, r.h, (x) => x.translate(-r.x, -r.y));
  fitView();
  hint("Cropped. Undo to get the rest back.");
  redraw();
};

/* ── done / cancel ── */
$("#cut-cancel").onclick = () => { offerDone?.(false); $("#cut-dialog").close(); };
$("#cut-done").onclick = async () => {
  const { mask } = ed;
  busy("Saving…");
  try {
    if (ed.mode === "inside") {
      let marked = 0, total = 0;
      for (let p = 0; p < mask.length; p++) { if (ed.base[p] > 128) { total++; if (mask[p] < ed.base[p] - 60) marked++; } }
      form.layer = marked > total * 0.005 ? await Cutout.render(ed.pix, mask) : null;
    } else {
      if (ed.pixDirty) form.original = await pixBlob("image/jpeg", 0.9);
      const res = await Cutout.render(ed.pix, mask);
      if (res) Object.assign(form, { blob: res.blob, cut: res.cut, ratio: res.ratio });
      else Object.assign(form, { blob: form.original, cut: null, ratio: ed.pix.W / ed.pix.H });
      if (ed.layer) {
        // keep the marked inside, trimmed to the new cutout
        const lm = ed.layer.slice();
        for (let p = 0; p < lm.length; p++) if (lm[p] > mask[p]) lm[p] = mask[p];
        form.layer = await Cutout.render(ed.pix, lm);
      }
    }
  } finally {
    busy(false);
  }
  setPreview(form.blob);
  $("#cut-dialog").close();
};
$("#cut-dialog").addEventListener("close", () => { offerDone?.(false); });

/* Zoom and pan: two fingers pinch and drag the view, one finger always edits.
   The canvas is laid out at "fit" size; the view transform (translate + scale) zooms it.
   canvasPoint() reads the transformed box, so editing works at any zoom, and the brush
   keeps its on-screen size (finer strokes when zoomed in). */
const zv = { z: 1, x: 0, y: 0, fitW: 0, fitH: 0 }; // zoom, translate (stage px), fitted canvas size
const MAX_ZOOM = 12;

function fitView() {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const s = Math.min(sw / ed.pix.W, sh / ed.pix.H);
  zv.fitW = ed.pix.W * s;
  zv.fitH = ed.pix.H * s;
  cutCanvas.style.width = zv.fitW + "px";
  cutCanvas.style.height = zv.fitH + "px";
  zv.z = 1;
  zv.x = (sw - zv.fitW) / 2;
  zv.y = (sh - zv.fitH) / 2;
  applyView();
}
// Keep the picture on screen: centered while it's smaller than the stage, edge-to-edge once bigger.
function clampView() {
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const w = zv.fitW * zv.z, h = zv.fitH * zv.z;
  zv.x = w <= sw ? (sw - w) / 2 : Math.min(0, Math.max(sw - w, zv.x));
  zv.y = h <= sh ? (sh - h) / 2 : Math.min(0, Math.max(sh - h, zv.y));
}
function applyView() {
  clampView();
  view.style.transform = `translate(${zv.x}px, ${zv.y}px) scale(${zv.z})`;
  // show real pixels when zoomed in close, so edges are easy to see
  cutCanvas.style.imageRendering = zv.z * (zv.fitW / ed.pix.W) >= 2.5 ? "pixelated" : "auto";
  $("#zoom-level").textContent = `${Math.round(zv.z * 100)}%`;
}
// Zoom to `z`, keeping the point (sx, sy) in stage coordinates fixed under the finger or cursor.
function zoomAt(z, sx, sy) {
  z = Math.min(MAX_ZOOM, Math.max(1, z));
  const px = (sx - zv.x) / zv.z, py = (sy - zv.y) / zv.z;
  zv.z = z;
  zv.x = sx - px * z;
  zv.y = sy - py * z;
  applyView();
}
const stagePoint = (cx, cy) => { const r = stage.getBoundingClientRect(); return [cx - r.left, cy - r.top]; };

$("#zoom-in").onclick = () => zoomAt(zv.z * 1.6, stage.clientWidth / 2, stage.clientHeight / 2);
$("#zoom-out").onclick = () => zoomAt(zv.z / 1.6, stage.clientWidth / 2, stage.clientHeight / 2);
$("#zoom-fit").onclick = () => fitView();
stage.addEventListener("wheel", (e) => {
  if (!ed.pix) return;
  e.preventDefault();
  const [sx, sy] = stagePoint(e.clientX, e.clientY);
  zoomAt(zv.z * Math.exp(-e.deltaY * 0.0025), sx, sy);
}, { passive: false });
// iOS Safari: stop the page itself from pinch-zooming while working in the editor
for (const t of ["gesturestart", "gesturechange"]) stage.addEventListener(t, (e) => e.preventDefault());

const touches = new Map(); // pointerId -> [clientX, clientY]
let gesture = null;        // { d, mx, my, z, x, y } at the start of a pinch
let editing = false;       // a one-finger edit is in progress
let waitAllUp = false;     // after a pinch, ignore the leftover finger until all are lifted

function pinchInfo() {
  const [a, b] = [...touches.values()];
  const [ax, ay] = stagePoint(a[0], a[1]), [bx, by] = stagePoint(b[0], b[1]);
  return { d: Math.max(1, Math.hypot(bx - ax, by - ay)), mx: (ax + bx) / 2, my: (ay + by) / 2 };
}
const brushTool = () => ed.tool === "brush" || ed.tool === "edge" || ed.tool === "heal";
const brushRadius = (k) => ((ed.tool === "heal" ? ed.healSize : ed.size) * k) / 2;

function editStart(e) {
  const [x, y, k] = canvasPoint(e);
  editing = true;
  if (ed.tool === "select" || ed.tool === "wand") {
    ed.tap = { x, y, cx: e.clientX, cy: e.clientY }; // applied on lift, so a pinch can't trigger it
  } else if (ed.tool === "lasso") {
    ed.drawing = true;
    ed.pts = [[x, y]];
  } else if (ed.tool === "crop") {
    ed.crop = { x0: x, y0: y, x1: x, y1: y };
  } else if (ed.tool === "none") {
    ed.pan = { cx: e.clientX, cy: e.clientY, x: zv.x, y: zv.y };
  } else {
    if (ed.tool !== "heal") pushUndo();
    const n = ed.pix.W * ed.pix.H;
    ed.stroke = { tool: ed.tool, base: ed.mask.slice(), region: ed.tool === "heal" ? new Uint8Array(n) : null, weight: ed.tool === "edge" ? new Float32Array(n) : null };
    ed.painting = true;
    ed.last = null;
    paintTo(x, y, brushRadius(k));
  }
}
function editMove(e) {
  const [x, y, k] = canvasPoint(e);
  if (brushTool()) ed.cursor = [x, y, brushRadius(k)];
  if (ed.painting) { paintTo(x, y, brushRadius(k)); return; }
  if (ed.pan) { zv.x = ed.pan.x + e.clientX - ed.pan.cx; zv.y = ed.pan.y + e.clientY - ed.pan.cy; applyView(); return; }
  if (ed.crop && ed.tool === "crop") { ed.crop.x1 = x; ed.crop.y1 = y; redraw(); return; }
  if (ed.drawing) {
    const [lx, ly] = ed.pts[ed.pts.length - 1];
    if (Math.hypot(x - lx, y - ly) > 3 * k) { ed.pts.push([x, y]); redraw(); }
  }
}
// A second finger arrived: take back whatever the first finger started.
function editCancel() {
  if (ed.painting && ed.stroke?.tool !== "heal") { const s = ed.undo.pop(); if (s) ed.mask = s.mask; updateHistory(); }
  ed.painting = ed.drawing = false;
  ed.pts = [];
  ed.tap = null;
  ed.last = null;
  ed.stroke = null;
  ed.pan = null;
  if (ed.tool === "crop") ed.crop = null;
  editing = false;
  redraw();
}
function editEnd(e) {
  editing = false;
  ed.pan = null;
  if (ed.tap) {
    const t = ed.tap;
    ed.tap = null;
    if (Math.hypot(e.clientX - t.cx, e.clientY - t.cy) < 12) {
      if (ed.tool === "select") doSelect(t.x, t.y);
      else doWand(t.x, t.y);
    }
    return;
  }
  if (ed.tool === "crop" && ed.crop) {
    const r = cropRect();
    if (r.w < 10 || r.h < 10) ed.crop = null;
    $("#crop-apply").disabled = !ed.crop;
    if (ed.crop) hint("Tap Crop to keep just this part, or drag again.");
    redraw();
    return;
  }
  if (ed.drawing) {
    ed.drawing = false;
    if (ed.pts.length > 4) {
      pushUndo();
      Cutout.cutPolygon(ed.mask, ed.pix.W, ed.pix.H, ed.pts, ed.keep);
      if (ed.keep) clampToBase();
      hint(ed.keep ? "Brought back. Draw more, or tap Done." : ed.mode === "inside" ? "Marked. Draw more, or tap Done." : "Removed. Draw more, or tap Done.");
    }
    ed.pts = [];
    redraw();
  }
  if (ed.painting && ed.stroke?.tool === "heal") {
    pushUndo(true);
    heal(ed.stroke.region);
    clampToBase();
    ed.pixDirty = true;
    ed.version++;
    hint("Fixed. Paint more spots, or undo if it doesn't look right.");
  }
  ed.stroke = null;
  ed.painting = false;
  ed.last = null;
  redraw();
}

stage.addEventListener("pointerdown", (e) => {
  if (!ed.pix || e.target.closest(".zoom-controls, .stage-chip, .cut-busy")) return;
  stage.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size === 1 && !waitAllUp) editStart(e);
  else if (touches.size === 2) {
    if (editing) editCancel();
    const p = pinchInfo();
    gesture = { ...p, z: zv.z, x: zv.x, y: zv.y };
    ed.cursor = null;
    waitAllUp = true;
  }
});
stage.addEventListener("pointermove", (e) => {
  if (!ed.pix) return;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (gesture && touches.size >= 2) {
    const p = pinchInfo();
    const z = Math.min(MAX_ZOOM, Math.max(1, gesture.z * (p.d / gesture.d)));
    // the picture point that was under the fingers stays under them, so pinch also pans
    const px = (gesture.mx - gesture.x) / gesture.z, py = (gesture.my - gesture.y) / gesture.z;
    zv.z = z;
    zv.x = p.mx - px * z;
    zv.y = p.my - py * z;
    applyView();
    return;
  }
  if (editing) editMove(e);
  else if (!touches.size && e.pointerType === "mouse" && brushTool()) {
    const [x, y, k] = canvasPoint(e);
    ed.cursor = [x, y, brushRadius(k)];
    redraw();
  }
});
const pointerUp = (e) => {
  if (!touches.delete(e.pointerId)) return;
  if (editing && !waitAllUp) editEnd(e);
  if (touches.size < 2) gesture = null;
  if (!touches.size) {
    waitAllUp = false;
    if (e.pointerType !== "mouse") { ed.cursor = null; redraw(); }
  }
};
stage.addEventListener("pointerup", pointerUp);
stage.addEventListener("pointercancel", pointerUp);
stage.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && !touches.size) { ed.cursor = null; redraw(); } });
