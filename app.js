/* Apps & Daps — snap your clothes, scroll your closet, style outfits.
   Everything is stored on-device in IndexedDB (photos included). */

const CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories", "Jewelry"];
const COLORS = {
  black: "#1d1a19", white: "#fbfaf7", cream: "#efe3c8", grey: "#9b9a98", brown: "#6b4430",
  tan: "#c9a27a", red: "#b5302a", pink: "#e9a1b0", orange: "#e0782f", yellow: "#e8c33f",
  green: "#5f7a45", blue: "#4f7fbf", navy: "#24345c", purple: "#6c3f87", denim: "#5a7593",
  gold: "#c9a646", silver: "#c4c7cc",
  multi: "conic-gradient(#b5302a, #e8c33f, #5f7a45, #4f7fbf, #6c3f87, #b5302a)",
};
const VIBES = ["Everyday", "Date night", "Brunch", "Work", "Going out", "Cozy", "Vacation", "Special occasion"];

/* ───────────── storage ───────────── */
const idb = (() => {
  let dbp;
  const open = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open("apps-and-daps", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("items", { keyPath: "id" });
      r.result.createObjectStore("outfits", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const run = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req.result);
      t.onerror = () => rej(t.error);
    });
  };
  // Writes never throw: if the browser blocks storage, the app keeps working for this visit.
  const safe = (fn) => async (...a) => { try { return await fn(...a); } catch { storageWarning(); } };
  return {
    all: (s) => run(s, "readonly", (st) => st.getAll()),
    put: safe((s, v) => run(s, "readwrite", (st) => st.put(v))),
    del: safe((s, k) => run(s, "readwrite", (st) => st.delete(k))),
  };
})();

/* ───────────── state ───────────── */
let storageWarned = false;
function storageWarning() {
  if (storageWarned) return;
  storageWarned = true;
  setTimeout(() => toast("This browser isn't saving, so changes last until you close the page"), 400);
}

const state = {
  items: [],
  outfits: [],
  filter: "All",
  drawerFilter: "All",
  search: "",
  favOnly: false,
  board: [],          // [{itemId, x, y, w, r, z}] — x/y/w are % of board
  selected: -1,
  editingOutfit: null,
};
const urls = new Map();   // itemId -> object URL
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const itemById = (id) => state.items.find((i) => i.id === id);
const imgUrl = (item) => {
  if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.image));
  return urls.get(item.id);
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

function confirmBox(text) {
  const d = $("#confirm-dialog");
  $("#confirm-text").textContent = text;
  d.returnValue = "";
  d.showModal();
  return new Promise((res) => d.addEventListener("close", () => res(d.returnValue === "yes"), { once: true }));
}

/* ───────────── navigation ───────────── */
function go(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.goto === view));
  if (view === "builder") { renderDrawer(); renderBoard(); }
  if (view === "outfits") renderOutfits();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ───────────── chips ───────────── */
function chipRow(el, options, current, onPick, { radio = false } = {}) {
  el.innerHTML = options.map((o) =>
    `<button type="button" class="chip" ${radio ? 'role="radio"' : ""} ${radio ? "aria-checked" : "aria-pressed"}="${o === current}" data-v="${esc(o)}">${esc(o)}</button>`
  ).join("");
  el.onclick = (e) => {
    const b = e.target.closest(".chip");
    if (b) onPick(b.dataset.v);
  };
}

/* ───────────── closet ───────────── */
function filteredItems() {
  const q = state.search.trim().toLowerCase();
  return state.items
    .filter((i) => state.filter === "All" || i.category === state.filter)
    .filter((i) => !state.favOnly || i.fav)
    .filter((i) => !q || [i.name, i.category, i.color, ...(i.tags || [])].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function dotStyle(color) {
  const c = COLORS[color];
  return c ? `background:${c}` : "display:none";
}

function renderCloset() {
  const used = new Set(state.items.map((i) => i.category));
  const cats = ["All", ...CATEGORIES.filter((c) => used.has(c))];
  if (!cats.includes(state.filter)) state.filter = "All";
  chipRow($("#closet-chips"), cats, state.filter, (v) => { state.filter = v; renderCloset(); });

  const list = filteredItems();
  const grid = $("#closet-grid");
  grid.innerHTML = list.map((i) => `
    <button class="pin${i.cut ? " is-cut" : ""}" data-id="${i.id}" aria-label="${esc(i.name || i.category)}">
      <img src="${imgUrl(i)}" alt="" loading="lazy">
      ${i.fav ? '<span class="pin-fav" aria-hidden="true"></span>' : ""}
    </button>`).join("");

  const empty = state.items.length === 0;
  $("#closet-empty").hidden = !empty;
  $("#closet-count").textContent = empty ? "" :
    list.length === state.items.length ? `${state.items.length} piece${state.items.length === 1 ? "" : "s"}` :
    `${list.length} of ${state.items.length}`;
}

$("#closet-grid").addEventListener("click", (e) => {
  const pin = e.target.closest(".pin");
  if (pin) openDetail(pin.dataset.id);
});
$("#search").addEventListener("input", (e) => { state.search = e.target.value; renderCloset(); });
$("#fav-toggle").addEventListener("click", (e) => {
  state.favOnly = !state.favOnly;
  e.currentTarget.setAttribute("aria-pressed", state.favOnly);
  renderCloset();
});

/* ───────────── add / edit item ───────────── */
// original = the plain photo; blob = what's shown (cutout or photo); cut = crop box of the cutout
// layer = jacket version with the inside removed, used only when layering over a top
const form = { id: null, original: null, blob: null, cut: null, layer: null, ratio: 0.8, category: "Tops", color: null, queue: [] };

const prefs = {
  get autoCut() { try { return localStorage.getItem("autoCut") !== "0"; } catch { return true; } },
  set autoCut(v) { try { localStorage.setItem("autoCut", v ? "1" : "0"); } catch {} },
};

function loadImage(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res(img); URL.revokeObjectURL(u); };
    img.onerror = () => { rej(new Error("Couldn't read that image")); URL.revokeObjectURL(u); };
    img.src = u;
  });
}

// Shrink photos so the closet stays fast and doesn't eat the phone's storage.
async function shrink(file, max = 1100) {
  const img = await loadImage(file);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  return { blob, ratio: c.width / c.height };
}

function renderFormPickers() {
  chipRow($("#f-category"), CATEGORIES, form.category, (v) => { form.category = v; renderFormPickers(); }, { radio: true });
  const sw = $("#f-color");
  sw.innerHTML = Object.entries(COLORS).map(([name, c]) =>
    `<button type="button" class="swatch" role="radio" aria-checked="${form.color === name}" aria-label="${name}" title="${name}" data-v="${name}" style="background:${c}"></button>`
  ).join("");
  sw.onclick = (e) => {
    const b = e.target.closest(".swatch");
    if (!b) return;
    form.color = form.color === b.dataset.v ? null : b.dataset.v;
    renderFormPickers();
  };
  updateCutActions();
  renderSizeField();
}

// Measurements are stored in inches; shown in whichever unit you pick.
const unit = {
  get v() { try { return localStorage.getItem("unit") || "in"; } catch { return "in"; } },
  set v(u) { try { localStorage.setItem("unit", u); } catch {} },
};
const fromInches = (n) => Math.round((unit.v === "cm" ? n * 2.54 : n) * 2) / 2;
const toInches = (n) => (unit.v === "cm" ? n / 2.54 : n);
function renderSizeField() {
  const info = SIZE_INFO[form.category];
  $("#f-size-label").textContent = info.label;
  $("#f-size").placeholder = fromInches(info.def);
  $("#f-size-hint").textContent = `Lay it flat and measure, so it's sized right in outfits. Leave it blank to use a typical ${fromInches(info.def)} ${unit.v}.`;
  document.querySelectorAll("#f-unit button").forEach((b) => b.setAttribute("aria-checked", b.dataset.unit === unit.v));
}
$("#f-unit").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b || b.dataset.unit === unit.v) return;
  const cur = parseFloat($("#f-size").value);
  const inches = cur ? toInches(cur) : null;
  unit.v = b.dataset.unit;
  if (inches) $("#f-size").value = fromInches(inches);
  renderSizeField();
};

function updateCutActions() {
  const jacket = form.category === "Outerwear";
  $("#cut-actions").hidden = !form.original;
  $("#open-front-btn").hidden = !jacket;
  $("#open-front-btn").textContent = form.layer ? "Edit the inside" : "Mark the inside for layering";
  $("#layer-note").hidden = !jacket || !form.original;
  $("#layer-note").textContent = form.layer
    ? "Inside marked. The closet shows the full jacket; the inside is hidden only when it's layered over a top."
    : "Draw around the lining that shows through the open front, so a top shows through when you layer this.";
}

function setPreview(blob) {
  const p = $("#photo-preview");
  if (setPreview.url) URL.revokeObjectURL(setPreview.url);
  p.classList.toggle("is-cut", !!form.cut);
  updateCutActions();
  if (!blob) { p.innerHTML = "<span>No photo</span>"; return; }
  setPreview.url = URL.createObjectURL(blob);
  p.innerHTML = `<img src="${setPreview.url}" alt="preview">`;
}

function openItemForm(item = null) {
  Object.assign(form, {
    id: item?.id ?? null,
    original: item?.original ?? item?.image ?? null,
    blob: item?.image ?? null,
    cut: item?.cut ?? null,
    layer: item?.layer ?? null,
    ratio: item?.ratio ?? 0.8,
    category: item?.category ?? (state.filter !== "All" ? state.filter : "Tops"),
    color: item?.color ?? null,
  });
  $("#item-dialog-title").textContent = item ? "Edit piece" : form.queue.length ? `New piece (${form.queue.length} more)` : "New piece";
  $("#f-name").value = item?.name ?? "";
  $("#f-tags").value = (item?.tags ?? []).join(", ");
  $("#f-size").value = item?.size ? fromInches(item.size) : "";
  $("#item-save").textContent = item ? "Save changes" : "Add to closet";
  setPreview(form.blob);
  renderFormPickers();
  if (!$("#item-dialog").open) $("#item-dialog").showModal();
}

async function takeFile(file) {
  try {
    const { blob, ratio } = await shrink(file);
    Object.assign(form, { original: blob, blob, cut: null, layer: null, ratio });
    setPreview(blob);
    if (prefs.autoCut) await autoCut();
  } catch (err) {
    toast(err.message);
  }
}

async function autoCut() {
  const p = $("#photo-preview");
  p.classList.add("is-busy");
  await new Promise((r) => setTimeout(r, 30)); // let "cutting…" paint first
  try {
    const pix = await Cutout.loadPixels(form.original);
    const mask = Cutout.removeBackground(pix);
    const res = mask && await Cutout.render(pix, mask);
    if (res) {
      Object.assign(form, { blob: res.blob, cut: res.cut, ratio: res.ratio });
      setPreview(res.blob);
    } else {
      toast("Couldn't find a plain background. Use Touch up to cut it by hand.");
    }
  } finally {
    p.classList.remove("is-busy");
  }
}

$("#auto-cut").checked = prefs.autoCut;
$("#auto-cut").onchange = (e) => { prefs.autoCut = e.target.checked; };
$("#touch-up").onclick = () => openEditor();
$("#open-front-btn").onclick = () => openEditor("inside");

$("#pick-camera").onclick = () => $("#file-camera").click();
$("#pick-library").onclick = () => $("#file-library").click();
$("#file-camera").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) await takeFile(f);
};
$("#file-library").onchange = async (e) => {
  const [first, ...rest] = [...e.target.files];
  e.target.value = "";
  if (!first) return;
  // Picked a bunch? Tag them one after another.
  if (rest.length && !form.id) form.queue.push(...rest);
  await takeFile(first);
  if (rest.length && !form.id) $("#item-dialog-title").textContent = `New piece (${form.queue.length} more)`;
};

$("#item-cancel").onclick = () => { form.queue = []; $("#item-dialog").close(); };

$("#item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.blob) { toast("Add a photo first"); return; }
  const existing = form.id && itemById(form.id);
  const item = {
    id: form.id ?? uid(),
    name: $("#f-name").value.trim(),
    category: form.category,
    color: form.color,
    tags: $("#f-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
    size: parseFloat($("#f-size").value) > 0 ? toInches(parseFloat($("#f-size").value)) : null,
    image: form.blob,
    original: form.original,
    cut: form.cut,
    layer: form.category === "Outerwear" ? form.layer : null,
    ratio: form.ratio,
    fav: existing?.fav ?? false,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await idb.put("items", item);
  if (existing) {
    if (existing.image !== item.image) { URL.revokeObjectURL(urls.get(item.id)); urls.delete(item.id); alphaMaps.delete(item.id); }
    state.items[state.items.indexOf(existing)] = item;
  } else {
    state.items.push(item);
  }
  renderCloset();
  renderDrawer();
  renderBoard();
  toast(existing ? "Saved" : "Added to closet");

  if (form.queue.length) {
    const next = form.queue.shift();
    openItemForm();
    await takeFile(next);
  } else {
    $("#item-dialog").close();
  }
});

/* ───────────── item detail ───────────── */
let detailId = null;
function openDetail(id) {
  const i = itemById(id);
  if (!i) return;
  detailId = id;
  $("#d-img").src = imgUrl(i);
  $("#d-img").alt = i.name || i.category;
  $("#d-caption").textContent = i.name || "Untitled";
  const sz = i.size ? ` · ${fromInches(i.size)} ${unit.v}` : "";
  $("#d-meta").innerHTML = `<span class="dot" style="${dotStyle(i.color)}"></span>${esc(i.category)}${i.color ? " · " + esc(i.color) : ""}${sz}`;
  $("#d-tags").innerHTML = (i.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
  const n = state.outfits.filter((o) => o.pieces.some((p) => p.itemId === id)).length;
  $("#d-used").textContent = (n ? `In ${n} look${n === 1 ? "" : "s"}` : "Not in any looks yet") + (i.layer ? " · Layering cutout" : "");
  $("#d-fav").textContent = i.fav ? "Unfavorite" : "Favorite";
  $("#detail-dialog").showModal();
}

$("#d-fav").onclick = async () => {
  const i = itemById(detailId);
  i.fav = !i.fav;
  await idb.put("items", i);
  $("#d-fav").textContent = i.fav ? "♥ Faved" : "♡ Fave";
  renderCloset();
};
$("#d-edit").onclick = () => {
  $("#detail-dialog").close();
  form.queue = [];
  openItemForm(itemById(detailId));
};
$("#d-delete").onclick = async () => {
  const id = detailId;
  $("#detail-dialog").close();
  if (!(await confirmBox("Delete this piece from your closet?"))) return;
  await idb.del("items", id);
  state.items = state.items.filter((i) => i.id !== id);
  state.board = state.board.filter((p) => p.itemId !== id);
  URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  renderCloset();
  toast("Deleted");
};
$("#d-style").onclick = () => {
  $("#detail-dialog").close();
  if (!state.board.some((p) => p.itemId === detailId)) wear(detailId);
  go("builder");
};

/* ───────────── outfit builder ─────────────
   Pieces snap onto an invisible figure: tops hang from the shoulders, bottoms start
   at the waist, shoes stand on the floor, and bags/hats/jewelry are styled alongside.
   Everything is laid out in real inches so measured pieces keep their true proportions. */
const board = $("#board");

const FIG = { w: 55.5, h: 74, shoulder: 12, waist: 28, floor: 73 }; // the board, in inches
const NUDGE = 4; // how far (inches) you can nudge a piece off its spot

// What to measure per category, and which side of the photo it describes.
const SIZE_INFO = {
  Tops: { axis: "h", def: 26, label: "Length · shoulder to hem" },
  Outerwear: { axis: "h", def: 30, label: "Length · collar to hem" },
  Dresses: { axis: "h", def: 40, label: "Length · shoulder to hem" },
  Bottoms: { axis: "h", def: 40, label: "Length · waist to hem" },
  Shoes: { axis: "long", def: 10, label: "Length · heel to toe" },
  Bags: { axis: "w", def: 11, label: "Width" },
  Accessories: { axis: "w", def: 8, label: "Width" },
  Jewelry: { axis: "w", def: 4, label: "Width" },
};
// Layer order, back to front. A tucked-in top drops behind the bottoms.
const LAYER = { Bottoms: 10, Shoes: 12, Dresses: 15, Tops: 20, Outerwear: 30, Bags: 40, Accessories: 41, Jewelry: 42 };
const TUCKED = 8;
// Side spots for extras: [side, top edge in inches]
const SLOTS = {
  Accessories: [["L", 2], ["L", 22], ["L", 46]],
  Jewelry: [["R", 2], ["R", 14], ["R", 24]],
  Bags: [["R", 38], ["L", 46]],
};
// How many of each can be worn at once; adding past that swaps the oldest out.
const LIMIT = { Tops: 1, Bottoms: 1, Dresses: 1, Outerwear: 1, Shoes: 1, Bags: 1, Accessories: 3, Jewelry: 3 };

function dims(item) {
  const info = SIZE_INFO[item.category] ?? SIZE_INFO.Accessories;
  const s = item.size || info.def, r = item.ratio || 0.8;
  if (info.axis === "h") return { w: s * r, h: s };
  if (info.axis === "w") return { w: s, h: s / r };
  // shoes: a pair can be shot side-on or top-down, so scale the long side of the photo
  const long = s * 1.15;
  return r >= 1 ? { w: long, h: long / r } : { w: long * r, h: long };
}

// A jacket has two looks: the full one (lining and back showing) for browsing, and a
// layering version with the inside removed. The layering version is used only when
// the jacket is worn over a top or dress.
const layerViews = new Map(); // item id -> view object
function viewFor(itemId, pieces) {
  const item = itemById(itemId);
  if (!item?.layer || item.category !== "Outerwear") return item;
  if (!pieces.some((q) => ["Tops", "Dresses"].includes(itemById(q.itemId)?.category))) return item;
  let v = layerViews.get(item.id);
  if (!v || v.image !== item.layer.blob || v.size !== item.size) {
    v = { ...item, id: item.id + ":layer", image: item.layer.blob, cut: item.layer.cut, ratio: item.layer.ratio };
    URL.revokeObjectURL(urls.get(v.id));
    urls.delete(v.id);
    alphaMaps.delete(v.id);
    layerViews.set(item.id, v);
  }
  return v;
}

// Board pieces are {itemId, dx, dy, tuck}; layout turns them into {x, y, w, r, z} in board %.
function layout(pieces) {
  const used = {};
  return pieces.map((p) => {
    const item = viewFor(p.itemId, pieces);
    if (!item) return null;
    const { w, h } = dims(item);
    let cx = FIG.w / 2, top;
    switch (item.category) {
      case "Tops": case "Dresses": top = FIG.shoulder; break;
      case "Outerwear": top = FIG.shoulder - 1.5; break;
      case "Bottoms": top = FIG.waist; break;
      case "Shoes": top = FIG.floor - h; break;
      default: {
        const list = SLOTS[item.category] ?? SLOTS.Accessories;
        const n = used[item.category] = (used[item.category] ?? -1) + 1;
        const [side, y] = list[Math.min(n, list.length - 1)];
        cx = side === "L" ? 1 + w / 2 : FIG.w - 1 - w / 2;
        top = y;
      }
    }
    return {
      itemId: p.itemId,
      view: item,
      x: ((cx + (p.dx || 0)) / FIG.w) * 100,
      y: ((top + h / 2 + (p.dy || 0)) / FIG.h) * 100,
      w: (w / FIG.w) * 100,
      r: 0,
      z: p.tuck && item.category === "Tops" ? TUCKED : LAYER[item.category] ?? 40,
    };
  });
}

function pieceHTML(p, i, selectable) {
  const item = p && (p.view ?? itemById(p.itemId));
  if (!item) return "";
  return `<div class="piece${item.cut ? " is-cut" : ""}${selectable && i === state.selected ? " is-selected" : ""}" data-i="${i}"
    style="left:${p.x}%;top:${p.y}%;width:${p.w}%;z-index:${p.z};transform:translate(-50%,-50%)">
    <img src="${imgUrl(item)}" alt="${esc(item.name || item.category)}" draggable="false"></div>`;
}

/* Under a jacket, a top's sleeves are hidden (they'd be inside the jacket's sleeves):
   each under-layer is clipped, row by row, to the jacket's torso. The neckline above
   the jacket and the body below a cropped hem stay visible. */
const imgEl = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const spanCache = new Map(); // jacket image url -> Promise<{L, R, H}>
function torsoSpans(item) {
  const src = imgUrl(item);
  if (!spanCache.has(src)) spanCache.set(src, (async () => {
    const img = await imgEl(src);
    const W = 240, H = Math.max(1, Math.round(W / (img.naturalWidth / img.naturalHeight)));
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const solid = (x, y) => d[(y * W + x) * 4 + 3] > 40;
    const L = new Float32Array(H).fill(-1), R = new Float32Array(H).fill(-1);
    const mid = W >> 1, gap = Math.round(W * 0.18); // an open front is at most this wide each side
    for (let y = 0; y < H; y++) {
      // from the middle: through the open front, then across the front panel.
      // Rows with no panel near the middle (only sleeve cuffs) borrow the row above.
      let l = mid; while (l > mid - gap && !solid(l, y)) l--;
      if (!solid(l, y)) continue;
      while (l > 0 && solid(l - 1, y)) l--;
      let r = mid; while (r < mid + gap && !solid(r, y)) r++;
      if (!solid(r, y)) continue;
      while (r < W - 1 && solid(r + 1, y)) r++;
      L[y] = l / W; R[y] = (r + 1) / W;
    }
    for (let y = 1; y < H; y++) if (L[y] < 0) { L[y] = L[y - 1]; R[y] = R[y - 1]; }
    return { L, R, H };
  })());
  return spanCache.get(src);
}

const clipCache = new Map(); // key -> Promise<url>
const clipDone = new Map();  // key -> url, for instant reuse
const inchRect = (p, ratio) => {
  const w = (p.w / 100) * FIG.w, h = w / ratio;
  return { l: (p.x / 100) * FIG.w - w / 2, t: (p.y / 100) * FIG.h - h / 2, w, h };
};
function clipKey(under, pu, over, po) {
  return [imgUrl(under), imgUrl(over), pu.x, pu.y, pu.w, po.x, po.y, po.w].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join("|");
}
function clippedUrl(under, pu, over, po) {
  const key = clipKey(under, pu, over, po);
  if (!clipCache.has(key)) clipCache.set(key, (async () => {
    const [img, sp] = await Promise.all([imgEl(imgUrl(under)), torsoSpans(over)]);
    const k = Math.min(1, 700 / Math.max(img.naturalWidth, img.naturalHeight));
    const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H);
    const a = data.data;
    const U = inchRect(pu, W / H), J = inchRect(po, (over.ratio || 0.8));
    const keepBelow = under.category === "Dresses"; // a skirt below the hem isn't a sleeve
    const soft = 0.12; // inches of feathering at the cut
    for (let y = 0; y < H; y++) {
      const jr = (U.t + ((y + 0.5) / H) * U.h - J.t) / J.h;
      if (jr < 0 || (jr >= 1 && keepBelow)) continue;
      const row = Math.min(sp.H - 1, Math.floor(Math.min(jr, 0.999) * sp.H));
      if (sp.L[row] < 0) continue;
      const xl = J.l + sp.L[row] * J.w, xr = J.l + sp.R[row] * J.w;
      for (let x = 0; x < W; x++) {
        const xi = U.l + ((x + 0.5) / W) * U.w;
        const t = Math.min(xi - xl, xr - xi);
        if (t < soft) a[(y * W + x) * 4 + 3] *= Math.max(0, t / soft);
      }
    }
    ctx.putImageData(data, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.92));
    const url = URL.createObjectURL(blob);
    clipDone.set(key, url);
    return url;
  })().catch(() => null));
  return clipCache.get(key);
}

// Swap clipped images in for every top/dress layered under a jacket.
function applyClips(container, list) {
  const jackets = list.filter((p) => p?.view?.category === "Outerwear").sort((a, b) => b.z - a.z);
  if (!jackets.length) return;
  const jp = jackets[0], jacket = jp.view;
  list.forEach((p, i) => {
    const item = p?.view;
    if (!item || !["Tops", "Dresses"].includes(item.category) || p.z > jp.z) return;
    const el = container.querySelector(`.piece[data-i="${i}"] img`);
    if (!el) return;
    const key = clipKey(item, p, jacket, jp);
    if (clipDone.has(key)) { el.src = clipDone.get(key); return; }
    el.style.visibility = "hidden"; // avoid a flash of sleeves
    clippedUrl(item, p, jacket, jp).then((u) => {
      if (u && el.isConnected) el.src = u;
      el.style.visibility = "";
    });
  });
}

let placed = [];
function renderBoard() {
  state.board = state.board.filter((p) => itemById(p.itemId));
  if (state.selected >= state.board.length) state.selected = -1;
  placed = layout(state.board);
  board.querySelectorAll(".piece").forEach((n) => n.remove());
  board.insertAdjacentHTML("beforeend", placed.map((p, i) => pieceHTML(p, i, true)).join(""));
  applyClips(board, placed);
  placed.forEach((p) => alphaMap(p.view));
  $("#board-hint").hidden = state.board.length > 0;
  renderTools();
  markDrawer();
}

// Move pieces in place (no re-render) while nudging.
function refreshPositions() {
  placed = layout(state.board);
  placed.forEach((p, i) => {
    const el = board.querySelector(`.piece[data-i="${i}"]`);
    if (el) Object.assign(el.style, { left: p.x + "%", top: p.y + "%", width: p.w + "%", zIndex: p.z });
  });
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const catOf = (p) => itemById(p.itemId)?.category;

// Put a piece on, swapping out whatever it replaces. Tapping a worn piece takes it off.
function wear(itemId, { quiet = false } = {}) {
  const item = itemById(itemId);
  if (!item) return;
  const at = state.board.findIndex((p) => p.itemId === itemId);
  if (at >= 0) {
    state.board.splice(at, 1);
    state.selected = -1;
    renderBoard();
    return;
  }
  const c = item.category;
  const clashes = (pc) =>
    (c === "Dresses" && (pc === "Tops" || pc === "Bottoms")) ||
    ((c === "Tops" || c === "Bottoms") && pc === "Dresses");
  const out = state.board.filter((p) => clashes(catOf(p)));
  const same = state.board.filter((p) => catOf(p) === c);
  out.push(...same.slice(0, Math.max(0, same.length - (LIMIT[c] ?? 1) + 1)));
  state.board = state.board.filter((p) => !out.includes(p));
  state.board.push({ itemId, dx: 0, dy: 0, tuck: false });
  state.selected = -1;
  renderBoard();
  if (quiet) return;
  if (c === "Outerwear" && !item.cut && state.board.some((p) => ["Tops", "Dresses"].includes(catOf(p)))) {
    toast("Mark this jacket's inside (Edit) so your top shows through");
  } else if (out.length) {
    const names = out.map((p) => itemById(p.itemId)?.name || catOf(p).toLowerCase());
    toast(`Swapped out ${names.join(" & ")}`);
  }
}
const addToBoard = (id) => wear(id);

function renderTools() {
  const p = state.board[state.selected];
  $("#piece-tools").hidden = !p;
  if (!p) return;
  const c = catOf(p);
  const tuck = $("#tool-tuck");
  tuck.hidden = !(c === "Tops" && state.board.some((q) => catOf(q) === "Bottoms"));
  tuck.textContent = p.tuck ? "Untuck" : "Tuck in";
  $("#tool-reset").disabled = !p.dx && !p.dy;
}

$("#piece-tools").addEventListener("click", (e) => {
  const tool = e.target.closest("button")?.dataset.tool;
  const p = state.board[state.selected];
  if (!tool || !p) return;
  if (tool === "tuck") { p.tuck = !p.tuck; refreshPositions(); renderTools(); }
  if (tool === "reset") { p.dx = p.dy = 0; refreshPositions(); renderTools(); applyClips(board, placed); }
  if (tool === "remove") { state.board.splice(state.selected, 1); state.selected = -1; renderBoard(); }
});

// Hit-test against actual pixels, so you can grab a shirt through a jacket's cut-out front.
const alphaMaps = new Map(); // itemId -> {w, h, a}
function alphaMap(item) {
  if (!item?.cut) return null;
  if (alphaMaps.has(item.id)) return alphaMaps.get(item.id);
  alphaMaps.set(item.id, null);
  const img = new Image();
  img.onload = () => {
    const w = 120, h = Math.max(1, Math.round(120 / (img.naturalWidth / img.naturalHeight)));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    alphaMaps.set(item.id, { w, h, a });
  };
  img.src = imgUrl(item);
  return null;
}

function pieceAt(clientX, clientY) {
  const order = placed.map((p, i) => i).sort((a, b) => placed[b].z - placed[a].z);
  // First look for a piece right under the finger; only then allow a fingertip-sized
  // margin, so a narrow jacket opening still lets you grab the shirt underneath.
  for (const fuzz of [0, 8]) {
    for (const i of order) if (hits(i, clientX, clientY, fuzz)) return i;
  }
  return -1;
}

function hits(i, clientX, clientY, fuzz) {
  const el = board.querySelector(`.piece[data-i="${i}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const lx = clientX - r.left, ly = clientY - r.top;
  if (lx < -fuzz || ly < -fuzz || lx > r.width + fuzz || ly > r.height + fuzz) return false;
  const m = alphaMap(placed[i].view);
  if (!m) return true;
  const ax = Math.floor((lx / r.width) * m.w), ay = Math.floor((ly / r.height) * m.h);
  const rad = Math.round((fuzz / r.width) * m.w);
  for (let y = Math.max(0, ay - rad); y <= Math.min(m.h - 1, ay + rad); y++) {
    for (let x = Math.max(0, ax - rad); x <= Math.min(m.w - 1, ax + rad); x++) {
      if (m.a[y * m.w + x] > 40) return true;
    }
  }
  return false;
}

function renderDrawer() {
  const used = new Set(state.items.map((i) => i.category));
  const cats = ["All", ...CATEGORIES.filter((c) => used.has(c))];
  if (!cats.includes(state.drawerFilter)) state.drawerFilter = "All";
  chipRow($("#drawer-chips"), cats, state.drawerFilter, (v) => { state.drawerFilter = v; renderDrawer(); });
  const list = state.items
    .filter((i) => state.drawerFilter === "All" || i.category === state.drawerFilter)
    .sort((a, b) => (b.fav - a.fav) || (b.createdAt - a.createdAt));
  $("#drawer-strip").innerHTML = list.length
    ? list.map((i) => `<button class="strip-item" data-id="${i.id}" title="${esc(i.name || i.category)}"><img src="${imgUrl(i)}" alt="${esc(i.name || i.category)}" loading="lazy"></button>`).join("")
    : `<p class="strip-empty">Add pieces to your closet first.</p>`;
  markDrawer();
}
// Show which pieces are on right now.
function markDrawer() {
  const on = new Set(state.board.map((p) => p.itemId));
  document.querySelectorAll("#drawer-strip .strip-item").forEach((b) => b.classList.toggle("is-on", on.has(b.dataset.id)));
}

$("#drawer-strip").addEventListener("click", (e) => {
  const b = e.target.closest(".strip-item");
  if (b) wear(b.dataset.id);
});

// One finger: select, and nudge a few inches off the spot.
let drag = null;
board.addEventListener("pointerdown", (e) => {
  if (drag) return;
  const i = pieceAt(e.clientX, e.clientY);
  if (i !== state.selected) {
    state.selected = i;
    board.querySelectorAll(".piece").forEach((n) => n.classList.toggle("is-selected", +n.dataset.i === i));
    renderTools();
  }
  if (i < 0) return;
  const p = state.board[i];
  board.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: p.dx || 0, dy: p.dy || 0 };
});
board.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const p = state.board[state.selected];
  const rect = board.getBoundingClientRect();
  p.dx = clamp(drag.dx + ((e.clientX - drag.x) / rect.width) * FIG.w, -NUDGE, NUDGE);
  p.dy = clamp(drag.dy + ((e.clientY - drag.y) / rect.height) * FIG.h, -NUDGE, NUDGE);
  refreshPositions();
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  renderTools();
  applyClips(board, placed);
};
board.addEventListener("pointerup", endDrag);
board.addEventListener("pointercancel", endDrag);

$("#clear-btn").onclick = async () => {
  if (state.board.length && !(await confirmBox("Clear the board?"))) return;
  state.board = [];
  state.selected = -1;
  state.editingOutfit = null;
  renderBoard();
};

// Shuffle: pull a random fit from the closet; it snaps into place like anything else.
function shuffle() {
  const by = (c) => state.items.filter((i) => i.category === c);
  const pick = (c, chance = 1) => {
    const list = by(c);
    return list.length && Math.random() < chance ? list[Math.floor(Math.random() * list.length)] : null;
  };
  const useDress = by("Dresses").length && (!by("Tops").length || !by("Bottoms").length || Math.random() < 0.35);
  const jackets = by("Outerwear").filter((j) => j.cut);
  const picks = [
    ...(useDress ? [pick("Dresses")] : [pick("Tops"), pick("Bottoms")]),
    jackets.length && Math.random() < 0.5 ? jackets[Math.floor(Math.random() * jackets.length)] : null,
    pick("Shoes"), pick("Bags", 0.7), pick("Accessories", 0.5), pick("Jewelry", 0.6),
  ].filter(Boolean);
  if (!picks.length) { toast("Add a few pieces first"); return; }
  state.board = picks.map((i) => ({ itemId: i.id, dx: 0, dy: 0, tuck: false }));
  state.editingOutfit = null;
  state.selected = -1;
  renderBoard();
}
$("#shuffle-btn").onclick = shuffle;

/* ───────────── save + lookbook ───────────── */
let saveVibe = VIBES[0];
$("#save-outfit-btn").onclick = () => {
  if (!state.board.length) { toast("Put on a few pieces first"); return; }
  const o = state.editingOutfit && state.outfits.find((x) => x.id === state.editingOutfit);
  $("#o-name").value = o?.name ?? "";
  saveVibe = o?.vibe ?? VIBES[0];
  const draw = () => chipRow($("#o-vibe"), VIBES, saveVibe, (v) => { saveVibe = v; draw(); }, { radio: true });
  draw();
  $("#save-dialog").showModal();
};
$("#save-cancel").onclick = () => $("#save-dialog").close();
$("#save-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const existing = state.editingOutfit && state.outfits.find((x) => x.id === state.editingOutfit);
  const outfit = {
    id: existing?.id ?? uid(),
    name: $("#o-name").value.trim() || `Look no. ${state.outfits.length + 1}`,
    vibe: saveVibe,
    pieces: state.board.map(({ itemId, dx, dy, tuck }) => ({ itemId, dx, dy, tuck })),
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await idb.put("outfits", outfit);
  if (existing) state.outfits[state.outfits.indexOf(existing)] = outfit;
  else state.outfits.push(outfit);
  state.editingOutfit = outfit.id;
  $("#save-dialog").close();
  toast("Saved to Looks");
});

function renderOutfits() {
  const list = [...state.outfits].sort((a, b) => b.createdAt - a.createdAt);
  $("#outfits-empty").hidden = list.length > 0;
  const laid = new Map(list.map((o) => [o.id, layout(o.pieces)]));
  $("#outfit-grid").innerHTML = list.map((o) => `
    <div class="look" data-id="${o.id}" role="button" tabindex="0">
      <button class="look-del" data-del="${o.id}" aria-label="Delete look">×</button>
      <div class="mini-board">${laid.get(o.id).map((p, i) => pieceHTML(p, i, false)).join("")}</div>
      <p class="look-name">${esc(o.name)}</p>
      <span class="look-vibe">${esc(o.vibe)}</span>
    </div>`).join("");
  document.querySelectorAll("#outfit-grid .look").forEach((card) => applyClips(card.querySelector(".mini-board"), laid.get(card.dataset.id)));
}

$("#outfit-grid").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    if (!(await confirmBox("Delete this look? Your pieces stay in the closet."))) return;
    await idb.del("outfits", del.dataset.del);
    state.outfits = state.outfits.filter((o) => o.id !== del.dataset.del);
    if (state.editingOutfit === del.dataset.del) state.editingOutfit = null;
    renderOutfits();
    return;
  }
  const card = e.target.closest(".look");
  if (!card) return;
  const o = state.outfits.find((x) => x.id === card.dataset.id);
  // Older looks stored free positions; they snap into place now.
  state.board = o.pieces.filter((p) => itemById(p.itemId)).map((p) => ({ itemId: p.itemId, dx: p.dx || 0, dy: p.dy || 0, tuck: !!p.tuck }));
  state.editingOutfit = o.id;
  state.selected = -1;
  go("builder");
});
$("#outfit-grid").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("look")) e.target.click();
});

/* ───────────── global wiring ───────────── */
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) go(g.dataset.goto);
  if (e.target.closest('[data-action="add"]')) { form.queue = []; openItemForm(); }
});

// Tap the dim backdrop to close a sheet.
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target !== d || d.id === "cut-dialog") return;
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) { if (d.id === "item-dialog") form.queue = []; d.close(); }
  });
});

/* ───────────── cutout editor ─────────────
   Two modes on the same photo:
   - "bg": the main cutout (background removed), shown everywhere.
   - "inside": for jackets, what to hide when layering over a top. It starts from the
     main cutout and can only remove more; the main cutout is never changed by it. */
const ed = { mode: "bg", pix: null, mask: null, base: null, undo: [], tool: "lasso", pts: [], out: null, tol: 30, size: 28, painting: false, drawing: false, last: null };
const cutCanvas = $("#cut-canvas");
const hint = (t) => { $("#cut-hint").textContent = t; };
const HINTS = {
  bg: {
    lasso: "Draw around anything you want removed.",
    wand: "Tap an area of one color to remove it.",
    erase: "Paint over anything you want removed.",
    restore: "Paint to bring parts back.",
  },
  inside: {
    lasso: "Draw around the lining or back that shows through the open front. It's hidden only when this is layered over a top.",
    wand: "Tap the lining to remove it in one go.",
    erase: "Paint over the inside to remove it.",
    restore: "Paint to bring parts back.",
  },
};

async function openEditor(mode = "bg") {
  if (!form.original) return;
  ed.mode = mode;
  $("#cut-title").textContent = mode === "inside" ? "Mark the inside" : "Touch up";
  $("#cut-auto").hidden = mode === "inside";
  $("#cut-front").hidden = mode !== "inside";
  hint("Loading…");
  $("#cut-dialog").showModal();
  ed.pix = await Cutout.loadPixels(form.original);
  const main = await Cutout.maskFromCut(ed.pix, form.cut ? form.blob : null, form.cut);
  if (mode === "inside") {
    ed.base = main;
    ed.mask = form.layer ? await Cutout.maskFromCut(ed.pix, form.layer.blob, form.layer.cut) : main.slice();
  } else {
    ed.base = null;
    ed.mask = main;
  }
  ed.undo = [];
  ed.pts = [];
  ed.out = new ImageData(ed.pix.W, ed.pix.H);
  cutCanvas.width = ed.pix.W;
  cutCanvas.height = ed.pix.H;
  setTool("lasso");
  draw();
}

function setTool(t) {
  ed.tool = t;
  document.querySelectorAll("#cut-tools button").forEach((c) => c.setAttribute("aria-checked", c.dataset.tool === t));
  const brushy = t === "erase" || t === "restore";
  $("#cut-slider").parentElement.hidden = t === "lasso";
  $("#slider-label").textContent = brushy ? "Brush size" : "Strength";
  Object.assign($("#cut-slider"), brushy ? { min: 6, max: 90, value: ed.size } : { min: 8, max: 80, value: ed.tol });
  hint(HINTS[ed.mode][t]);
}
$("#cut-tools").onclick = (e) => { const c = e.target.closest("button"); if (c) setTool(c.dataset.tool); };
$("#cut-slider").oninput = (e) => {
  if (ed.tool === "erase" || ed.tool === "restore") ed.size = +e.target.value; else ed.tol = +e.target.value;
};

// In inside mode nothing outside the main cutout can come back.
function clampToBase() {
  if (!ed.base) return;
  const m = ed.mask, b = ed.base;
  for (let p = 0; p < m.length; p++) if (m[p] > b[p]) m[p] = b[p];
}

function draw() {
  const { W, H, data } = ed.pix, o = ed.out.data, m = ed.mask, b = ed.base;
  for (let p = 0; p < W * H; p++) {
    let r = data[p * 4], g = data[p * 4 + 1], bl = data[p * 4 + 2], a;
    if (b && b[p] > 40 && m[p] < b[p] - 40) {
      // marked as inside: tint it so it's clear what will hide when layering
      r = r * 0.45 + 217 * 0.55; g = g * 0.45 + 187 * 0.55; bl = bl * 0.45 + 143 * 0.55; a = 150;
    } else {
      a = Math.max(m[p], b ? 22 : 38); // removed parts stay faintly visible so you can restore them
    }
    o[p * 4] = r; o[p * 4 + 1] = g; o[p * 4 + 2] = bl; o[p * 4 + 3] = a;
  }
  const ctx = cutCanvas.getContext("2d");
  ctx.putImageData(ed.out, 0, 0);
  if (ed.pts.length > 1) {
    const k = W / cutCanvas.getBoundingClientRect().width;
    ctx.strokeStyle = "#ededef"; ctx.fillStyle = "rgba(217,187,143,.25)"; ctx.lineWidth = 2 * k;
    ctx.lineJoin = ctx.lineCap = "round";
    ctx.beginPath();
    ed.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.fill();
    ctx.stroke();
  }
}
let rafId = 0;
const redraw = () => { rafId ||= requestAnimationFrame(() => { rafId = 0; draw(); }); };
const pushUndo = () => { ed.undo.push(ed.mask.slice()); if (ed.undo.length > 15) ed.undo.shift(); };

function canvasPoint(e) {
  const r = cutCanvas.getBoundingClientRect();
  return [((e.clientX - r.left) * ed.pix.W) / r.width, ((e.clientY - r.top) * ed.pix.H) / r.height, ed.pix.W / r.width];
}
function paintTo(x, y, k) {
  const r = (ed.size * k) / 2;
  const [lx, ly] = ed.last ?? [x, y];
  const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / (r / 2)));
  for (let s = 1; s <= steps; s++) {
    Cutout.brush(ed.mask, ed.pix.W, ed.pix.H, lx + ((x - lx) * s) / steps, ly + ((y - ly) * s) / steps, r, ed.tool === "restore");
  }
  if (ed.tool === "restore") clampToBase();
  ed.last = [x, y];
  redraw();
}

cutCanvas.addEventListener("pointerdown", (e) => {
  if (!ed.pix) return;
  const [x, y, k] = canvasPoint(e);
  cutCanvas.setPointerCapture(e.pointerId);
  if (ed.tool === "wand") {
    pushUndo();
    const n = Cutout.wand(ed.pix, ed.mask, x, y, ed.tol);
    if (!n) { ed.undo.pop(); hint("That spot is already removed."); }
    else hint("Removed. Tap more, or raise Strength if it missed some.");
    redraw();
  } else if (ed.tool === "lasso") {
    ed.drawing = true;
    ed.pts = [[x, y]];
  } else {
    pushUndo();
    ed.painting = true;
    ed.last = null;
    paintTo(x, y, k);
  }
});
cutCanvas.addEventListener("pointermove", (e) => {
  if (!ed.painting && !ed.drawing) return;
  const [x, y, k] = canvasPoint(e);
  if (ed.painting) { paintTo(x, y, k); return; }
  const [lx, ly] = ed.pts[ed.pts.length - 1];
  if (Math.hypot(x - lx, y - ly) > 3 * k) { ed.pts.push([x, y]); redraw(); }
});
const stopPointer = () => {
  if (ed.drawing) {
    ed.drawing = false;
    if (ed.pts.length > 4) {
      pushUndo();
      Cutout.cutPolygon(ed.mask, ed.pix.W, ed.pix.H, ed.pts);
      hint(ed.mode === "inside" ? "Marked. Draw more, or tap Done." : "Removed. Draw more, or tap Done.");
    }
    ed.pts = [];
    redraw();
  }
  ed.painting = false;
  ed.last = null;
};
cutCanvas.addEventListener("pointerup", stopPointer);
cutCanvas.addEventListener("pointercancel", stopPointer);

$("#cut-auto").onclick = () => {
  pushUndo();
  const m = Cutout.removeBackground(ed.pix, ed.tol);
  if (m) { ed.mask.set(m); hint("Background removed. If it's not quite right, change Strength and try again."); }
  else { ed.undo.pop(); hint("Couldn't find a plain background. Draw around it instead."); }
  redraw();
};
$("#cut-front").onclick = () => {
  pushUndo();
  const r = Cutout.openFront(ed.pix, ed.mask, ed.tol);
  if (r.ok) hint("Found the inside. Draw to adjust, or tap Done.");
  else { ed.undo.pop(); setTool("lasso"); hint("Couldn't find the inside automatically. Draw around it instead."); }
  redraw();
};
$("#cut-undo").onclick = () => { const m = ed.undo.pop(); if (m) { ed.mask.set(m); redraw(); } else hint("Nothing to undo."); };
$("#cut-reset").onclick = () => {
  pushUndo();
  if (ed.base) ed.mask.set(ed.base); else ed.mask.fill(255);
  ed.pts = [];
  redraw();
  hint(ed.base ? "Cleared the marked inside." : "Back to the original photo.");
};

$("#cut-done").onclick = async () => {
  const { pix, mask } = ed;
  if (ed.mode === "inside") {
    let marked = 0, total = 0;
    for (let p = 0; p < mask.length; p++) { if (ed.base[p] > 128) { total++; if (mask[p] < ed.base[p] - 60) marked++; } }
    form.layer = marked > total * 0.005 ? await Cutout.render(pix, mask) : null;
  } else {
    const res = await Cutout.render(pix, mask);
    if (res) Object.assign(form, { blob: res.blob, cut: res.cut, ratio: res.ratio });
    else Object.assign(form, { blob: form.original, cut: null, ratio: pix.W / pix.H });
    if (form.layer) {
      // keep the marked inside, trimmed to the new cutout
      const lm = await Cutout.maskFromCut(pix, form.layer.blob, form.layer.cut);
      for (let p = 0; p < lm.length; p++) if (lm[p] > mask[p]) lm[p] = mask[p];
      form.layer = await Cutout.render(pix, lm);
    }
  }
  setPreview(form.blob);
  $("#cut-dialog").close();
};

/* ───────────── add from outfit photo ───────────── */
const NOUNS = { Tops: "top", Bottoms: "bottoms", Dresses: "dress", Outerwear: "jacket", Shoes: "shoes", Bags: "bag", Accessories: "accessory", Jewelry: "jewelry" };
const height = {
  get in() { try { return parseFloat(localStorage.getItem("heightIn")) || null; } catch { return null; } },
  set in(v) { try { localStorage.setItem("heightIn", String(v)); } catch {} },
};
let opPhoto = null;   // the shrunk photo blob
let opFound = [];     // [{category, name, color, res, inchPerPx, keep}]

function opShow(step) {
  for (const s of ["intro", "working", "results"]) $(`#op-${s}`).hidden = s !== step;
}
function opStatus(text, frac) {
  $("#op-status").textContent = text;
  $(".progress").classList.toggle("is-indeterminate", frac == null);
  $("#op-bar").style.width = frac == null ? "" : `${Math.round(frac * 100)}%`;
}

function openOutfitPhoto() {
  if ($("#item-dialog").open) { form.queue = []; $("#item-dialog").close(); }
  opShow("intro");
  $("#op-height-unit").textContent = unit.v;
  $("#op-height").value = height.in ? fromInches(height.in) : "";
  $("#op-height").placeholder = fromInches(66);
  if (window.APP_DEMO) {
    // the chat preview blocks the model download
    $("#op-note").textContent = "Outfit photos need the installed app. This test drive can't download the clothing-recognition model.";
    $("#op-camera").disabled = $("#op-library").disabled = true;
  }
  $("#outfit-dialog").showModal();
}

// Nearest named swatch to a piece's average color.
function nameColor(pix, mask) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < mask.length; p += 3) {
    if (mask[p] < 200) continue;
    r += pix.data[p * 4]; g += pix.data[p * 4 + 1]; b += pix.data[p * 4 + 2]; n++;
  }
  if (!n) return null;
  r /= n; g /= n; b /= n;
  let best = null, bd = Infinity;
  for (const [name, hex] of Object.entries(COLORS)) {
    if (!hex.startsWith("#") || name === "gold" || name === "silver") continue;
    const R = parseInt(hex.slice(1, 3), 16), G = parseInt(hex.slice(3, 5), 16), B = parseInt(hex.slice(5, 7), 16);
    const rm = (r + R) / 2; // "redmean" distance, closer to how eyes compare colors
    const d = (2 + rm / 256) * (r - R) ** 2 + 4 * (g - G) ** 2 + (2 + (255 - rm) / 256) * (b - B) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

// Measurement for a piece's category, from its size in the photo.
function sizeFromPhoto(category, cut, inchPerPx) {
  if (!inchPerPx || !cut) return null;
  const axis = SIZE_INFO[category]?.axis ?? "w";
  const px = axis === "h" ? cut.h : axis === "w" ? cut.w : Math.max(cut.w, cut.h) / 1.15;
  return Math.round(px * inchPerPx * 2) / 2;
}

async function processOutfitPhoto(file) {
  const h = parseFloat($("#op-height").value);
  if (h > 0) height.in = toInches(h);
  const heightIn = height.in || 66;
  opShow("working");
  try {
    opStatus("Preparing photo…");
    const { blob } = await shrink(file, 1100);
    opPhoto = blob;
    const pix = await Cutout.loadPixels(blob);
    if (!OutfitPhoto.ready()) opStatus("Downloading the clothing model (one time)…", 0);
    await OutfitPhoto.load((l, t) => opStatus(`Downloading the clothing model (one time) · ${(l / 1048576).toFixed(1)} of ${(t / 1048576).toFixed(1)} MB`, l / t));
    opStatus("Finding your clothes…");
    await new Promise((r) => setTimeout(r, 30));
    const lab = await OutfitPhoto.labelPixels(blob, pix.W, pix.H);
    opStatus("Cutting out each piece…");
    await new Promise((r) => setTimeout(r, 30));
    const { pieces, inchPerPx } = OutfitPhoto.extract(pix, lab, heightIn);
    opFound = [];
    for (const pc of pieces) {
      const res = await Cutout.render(pc.pix, pc.mask);
      if (!res) continue;
      const color = nameColor(pc.pix, pc.mask);
      opFound.push({ category: pc.category, noun: pc.noun, color, res, inchPerPx, keep: true,
        name: [color, pc.noun].filter(Boolean).join(" ") });
    }
    if (!opFound.length) {
      opShow("intro");
      toast("Couldn't find any clothes. Try a full-body photo against a plain wall.");
      return;
    }
    renderOutfitResults();
    opShow("results");
  } catch (err) {
    console.error(err);
    opShow("intro");
    toast("Couldn't load the clothing model. Check your connection and try again.");
  }
}

function renderOutfitResults() {
  const n = opFound.length;
  $("#op-found").textContent = `Found ${n} piece${n === 1 ? "" : "s"}. Untick anything you don't want, and fix the category if it's wrong (a jacket can come through as a top).`;
  opFound.forEach((f) => { f.url ??= URL.createObjectURL(f.res.blob); });
  $("#op-pieces").innerHTML = opFound.map((f, i) => `
    <div class="op-piece${f.keep ? "" : " is-off"}" data-i="${i}">
      <label class="op-piece-pic"><input type="checkbox" data-keep ${f.keep ? "checked" : ""} aria-label="Keep this piece"><img src="${f.url}" alt=""></label>
      <select data-cat aria-label="Category">${CATEGORIES.map((c) => `<option${c === f.category ? " selected" : ""}>${c}</option>`).join("")}</select>
      <input type="text" data-name value="${esc(f.name)}" maxlength="60" aria-label="Name">
    </div>`).join("");
}
$("#op-pieces").addEventListener("change", (e) => {
  const card = e.target.closest(".op-piece");
  if (!card) return;
  const f = opFound[+card.dataset.i];
  if (e.target.matches("[data-keep]")) { f.keep = e.target.checked; card.classList.toggle("is-off", !f.keep); }
  if (e.target.matches("[data-cat]")) f.category = e.target.value;
});
$("#op-pieces").addEventListener("input", (e) => {
  const card = e.target.closest(".op-piece");
  if (card && e.target.matches("[data-name]")) opFound[+card.dataset.i].name = e.target.value;
});

$("#op-add").onclick = async () => {
  const keep = opFound.filter((f) => f.keep);
  if (!keep.length) { toast("Tick at least one piece"); return; }
  const now = Date.now();
  const items = keep.map((f, n) => ({
    id: uid(), name: f.name.trim(), category: f.category, color: f.color, tags: [],
    size: sizeFromPhoto(f.category, f.res.cut, f.inchPerPx),
    image: f.res.blob, original: opPhoto, cut: f.res.cut, layer: null, ratio: f.res.ratio,
    fav: false, createdAt: now + n,
  }));
  for (const i of items) await idb.put("items", i);
  state.items.push(...items);
  if ($("#op-look").checked) {
    const look = { id: uid(), name: `Outfit, ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      vibe: VIBES[0], createdAt: now, pieces: items.map((i) => ({ itemId: i.id, dx: 0, dy: 0, tuck: false })) };
    await idb.put("outfits", look);
    state.outfits.push(look);
  }
  opFound.forEach((f) => f.url && URL.revokeObjectURL(f.url));
  opFound = [];
  $("#outfit-dialog").close();
  renderCloset();
  renderDrawer();
  toast(`Added ${items.length} piece${items.length === 1 ? "" : "s"}`);
};
$("#op-retake").onclick = () => opShow("intro");
$("#op-camera").onclick = () => $("#op-file-camera").click();
$("#op-library").onclick = () => $("#op-file-library").click();
for (const id of ["#op-file-camera", "#op-file-library"]) {
  $(id).onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (f) processOutfitPhoto(f);
  };
}

/* ───────────── sample closet ───────────── */
async function loadSamples(announce = true) {
  const { items, outfits } = await Samples.build(uid);
  for (const i of items) await idb.put("items", i);
  for (const o of outfits) await idb.put("outfits", o);
  state.items.push(...items);
  state.outfits.push(...outfits);
  renderCloset();
  renderDrawer();
  if (announce) toast(`Added ${items.length} sample pieces`);
}

async function removeSamples() {
  const gone = new Set(state.items.filter((i) => i.sample).map((i) => i.id));
  for (const id of gone) { await idb.del("items", id); URL.revokeObjectURL(urls.get(id)); urls.delete(id); alphaMaps.delete(id); }
  for (const o of state.outfits.filter((o) => o.sample)) await idb.del("outfits", o.id);
  state.items = state.items.filter((i) => !i.sample);
  state.outfits = state.outfits.filter((o) => !o.sample);
  state.board = state.board.filter((p) => !gone.has(p.itemId));
  state.selected = -1;
  renderCloset();
  renderDrawer();
  renderBoard();
  renderOutfits();
}

document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="samples"]')) loadSamples();
  if (e.target.closest('[data-action="outfit-photo"]')) openOutfitPhoto();
});
$("#remove-samples").onclick = async () => {
  $("#menu-dialog").close();
  if (!(await confirmBox("Remove the sample pieces and their looks? Your own pieces stay."))) return;
  await removeSamples();
  toast("Sample pieces removed");
};

/* ───────────── backup ───────────── */
const toDataURL = (blob) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});
const fromDataURL = async (u) => (await fetch(u)).blob();

$("#menu-btn").onclick = async () => {
  $("#storage-info").textContent = `${state.items.length} pieces · ${state.outfits.length} looks`;
  $("#remove-samples").hidden = !state.items.some((i) => i.sample);
  $("#menu-dialog").showModal();
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (est?.usage) $("#storage-info").textContent += ` · ${(est.usage / 1048576).toFixed(1)} MB used`;
};

$("#export-btn").onclick = async () => {
  toast("Preparing backup…");
  const items = await Promise.all(state.items.map(async (i) => ({
    ...i,
    image: await toDataURL(i.image),
    original: i.original && i.original !== i.image ? await toDataURL(i.original) : null,
    layer: i.layer ? { ...i.layer, blob: await toDataURL(i.layer.blob) } : null,
  })));
  const data = { app: "apps-and-daps", version: 1, exportedAt: new Date().toISOString(), items, outfits: state.outfits };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `apps-and-daps-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast("Backup saved");
};

$("#import-btn").onclick = () => $("#import-file").click();
$("#import-file").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "apps-and-daps") throw new Error("not a backup");
    for (const raw of data.items || []) {
      const image = await fromDataURL(raw.image);
      const item = { ...raw, image, original: raw.original ? await fromDataURL(raw.original) : image,
        layer: raw.layer ? { ...raw.layer, blob: await fromDataURL(raw.layer.blob) } : null };
      await idb.put("items", item);
      urls.delete(item.id);
      alphaMaps.delete(item.id);
      state.items = state.items.filter((i) => i.id !== item.id).concat(item);
    }
    for (const o of data.outfits || []) {
      await idb.put("outfits", o);
      state.outfits = state.outfits.filter((x) => x.id !== o.id).concat(o);
    }
    $("#menu-dialog").close();
    renderCloset();
    renderDrawer();
    renderOutfits();
    toast(`Restored ${data.items?.length ?? 0} pieces and ${data.outfits?.length ?? 0} looks`);
  } catch {
    toast("That file doesn't look like an Apps & Daps backup");
  }
};

if (window.APP_DEMO) {
  // Test-drive build: files can't be saved from the preview, so hide backup.
  $("#export-btn").hidden = $("#import-btn").hidden = true;
  $("#menu-dialog .sheet-copy").textContent = "This is a test drive. The sample pieces are illustrations. Add your own photos with the + button. Backups work in the installed app.";
}


/* ───────────── install screen ─────────────
   Opened in a browser tab instead of from the home screen? Show how to install. */
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let installPrompt = null; // Chrome/Edge on Android offer a real install button

function installSteps() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inApp = /Instagram|FBAN|FBAV|TikTok|Snapchat|Line\/|Pinterest/.test(ua);
  const share = '<svg class="ico" aria-hidden="true"><use href="#i-share"/></svg>';
  const kebab = '<svg class="ico" aria-hidden="true"><use href="#i-kebab"/></svg>';
  const addSq = '<svg class="ico" aria-hidden="true"><use href="#i-add-square"/></svg>';
  if (inApp) return {
    steps: [`Tap the ${kebab} or ${share} menu in this app`, `Choose <strong>Open in browser</strong> (or <strong>Open in Safari</strong>)`, "Follow the steps that appear there"],
    note: "Apps like Instagram open links in their own viewer, which can't install apps.",
  };
  if (ios) {
    const browser = /CriOS/.test(ua) ? "Chrome" : /EdgiOS/.test(ua) ? "Edge" : /FxiOS/.test(ua) ? "Firefox" : "Safari";
    return {
      steps: [
        browser === "Safari"
          ? `Tap ${share} <strong>Share</strong>. On newer iPhones it's in the <strong>···</strong> menu next to the address bar.`
          : `Tap ${share} <strong>Share</strong> in the address bar`,
        `Scroll down and tap ${addSq} <strong>Add to Home Screen</strong>`,
        "Tap <strong>Add</strong>, then open Apps & Daps from your home screen",
      ],
      note: "Add your clothes in the home screen app. iPhone keeps its closet separate from the browser's.",
    };
  }
  if (android) return {
    steps: [`Tap ${kebab} in the top corner of the browser`, "Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>", "Open Apps & Daps from your home screen"],
    note: "",
  };
  return {
    steps: ["Open this page on your phone", "Follow the steps shown there to add it to your home screen"],
    note: location.href,
  };
}

function showInstall() {
  const { steps, note } = installSteps();
  $("#install-steps").innerHTML = steps.map((s) => `<li><span>${s}</span></li>`).join("");
  $("#install-steps").hidden = !!installPrompt;
  $("#install-btn").hidden = !installPrompt;
  $("#install-note").textContent = installPrompt ? "" : note;
  $("#install").hidden = false;
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (!$("#install").hidden) showInstall();
});
window.addEventListener("appinstalled", () => { $("#install").hidden = true; });
$("#install-btn").onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice.catch(() => ({}));
  installPrompt = null;
  if (outcome === "accepted") $("#install").hidden = true; else showInstall();
};
$("#install-skip").onclick = () => {
  $("#install").hidden = true;
  try { sessionStorage.setItem("skipInstall", "1"); } catch {}
};

const skippedInstall = () => { try { return sessionStorage.getItem("skipInstall") === "1"; } catch { return false; } };
if (!window.APP_DEMO && !installed() && !skippedInstall()) showInstall();

(async function init() {
  try {
    [state.items, state.outfits] = await Promise.all([idb.all("items"), idb.all("outfits")]);
    navigator.storage?.persist?.();
  } catch (err) {
    storageWarning();
  }
  if (!state.items.length && window.APP_DEMO) await loadSamples(false);
  renderCloset();
  renderDrawer();
  renderBoard();
})();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
