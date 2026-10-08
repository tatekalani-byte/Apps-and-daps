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
const TAGLINES = [
  "your closet, but make it a mood board",
  "fits on fits on fits",
  "main character wardrobe energy",
  "pin it, wear it, love it",
  "curated chaos, beautifully",
];

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
    <button class="pin${i.cut ? " is-cut" : ""}" data-id="${i.id}">
      <img src="${imgUrl(i)}" alt="${esc(i.name || i.category)}" loading="lazy" style="aspect-ratio:${i.ratio || 0.8}">
      ${i.fav ? '<span class="pin-fav" aria-label="favorite">♥</span>' : ""}
      <div class="pin-label">
        <p class="pin-name">${esc(i.name || "untitled piece")}</p>
        <p class="pin-sub"><span class="dot" style="${dotStyle(i.color)}"></span>${esc(i.category)}</p>
      </div>
    </button>`).join("");

  const empty = state.items.length === 0;
  $("#closet-empty").hidden = !empty;
  $("#closet-count").textContent = empty ? "" :
    list.length === state.items.length ? `${state.items.length} piece${state.items.length === 1 ? "" : "s"} in the closet` :
    `${list.length} of ${state.items.length} pieces`;
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
const form = { id: null, original: null, blob: null, cut: null, ratio: 0.8, category: "Tops", color: null, queue: [] };

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
  $("#f-size").placeholder = `typical: ${fromInches(info.def)}`;
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
  $("#cut-actions").hidden = !form.original;
  $("#open-front-btn").hidden = form.category !== "Outerwear";
}

function setPreview(blob) {
  const p = $("#photo-preview");
  if (setPreview.url) URL.revokeObjectURL(setPreview.url);
  p.classList.toggle("is-cut", !!form.cut);
  updateCutActions();
  if (!blob) { p.innerHTML = "<span>no pic yet</span>"; return; }
  setPreview.url = URL.createObjectURL(blob);
  p.innerHTML = `<img src="${setPreview.url}" alt="preview">`;
}

function openItemForm(item = null) {
  Object.assign(form, {
    id: item?.id ?? null,
    original: item?.original ?? item?.image ?? null,
    blob: item?.image ?? null,
    cut: item?.cut ?? null,
    ratio: item?.ratio ?? 0.8,
    category: item?.category ?? (state.filter !== "All" ? state.filter : "Tops"),
    color: item?.color ?? null,
  });
  $("#item-dialog-title").textContent = item ? "Edit piece" : form.queue.length ? `New piece · ${form.queue.length} more after this` : "New piece";
  $("#f-name").value = item?.name ?? "";
  $("#f-tags").value = (item?.tags ?? []).join(", ");
  $("#f-size").value = item?.size ? fromInches(item.size) : "";
  $("#item-save").textContent = item ? "Save changes" : "Hang it up";
  setPreview(form.blob);
  renderFormPickers();
  if (!$("#item-dialog").open) $("#item-dialog").showModal();
}

async function takeFile(file) {
  try {
    const { blob, ratio } = await shrink(file);
    Object.assign(form, { original: blob, blob, cut: null, ratio });
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
      toast("Busy background — tap Touch up to cut it by hand");
    }
  } finally {
    p.classList.remove("is-busy");
  }
}

$("#auto-cut").checked = prefs.autoCut;
$("#auto-cut").onchange = (e) => { prefs.autoCut = e.target.checked; };
$("#touch-up").onclick = () => openEditor();
$("#open-front-btn").onclick = () => openEditor("front");

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
  if (rest.length && !form.id) $("#item-dialog-title").textContent = `New piece · ${form.queue.length} more after this`;
};

$("#item-cancel").onclick = () => { form.queue = []; $("#item-dialog").close(); };

$("#item-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.blob) { toast("Snap or pick a photo first 📸"); return; }
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
  toast(existing ? "Updated ✨" : "Hung up in the closet ✨");

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
  $("#d-caption").textContent = i.name || "untitled piece";
  const sz = i.size ? ` · ${fromInches(i.size)} ${unit.v}` : "";
  $("#d-meta").innerHTML = `<span class="dot" style="${dotStyle(i.color)}"></span>${esc(i.category)}${i.color ? " · " + esc(i.color) : ""}${sz}`;
  $("#d-tags").innerHTML = (i.tags || []).map((t) => `<span class="tag">#${esc(t)}</span>`).join("");
  const n = state.outfits.filter((o) => o.pieces.some((p) => p.itemId === id)).length;
  $("#d-used").textContent = n ? `styled in ${n} look${n === 1 ? "" : "s"}` : "not styled yet — give it a moment";
  $("#d-fav").textContent = i.fav ? "♥ Faved" : "♡ Fave";
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
  if (!(await confirmBox("Toss this piece from your closet?"))) return;
  await idb.del("items", id);
  state.items = state.items.filter((i) => i.id !== id);
  state.board = state.board.filter((p) => p.itemId !== id);
  URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
  renderCloset();
  toast("Gone. Closet cleanse 🧹");
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

// Board pieces are {itemId, dx, dy, tuck}; layout turns them into {x, y, w, r, z} in board %.
function layout(pieces) {
  const used = {};
  return pieces.map((p) => {
    const item = itemById(p.itemId);
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
      x: ((cx + (p.dx || 0)) / FIG.w) * 100,
      y: ((top + h / 2 + (p.dy || 0)) / FIG.h) * 100,
      w: (w / FIG.w) * 100,
      r: 0,
      z: p.tuck && item.category === "Tops" ? TUCKED : LAYER[item.category] ?? 40,
    };
  });
}

function pieceHTML(p, i, selectable) {
  const item = p && itemById(p.itemId);
  if (!item) return "";
  return `<div class="piece${item.cut ? " is-cut" : ""}${selectable && i === state.selected ? " is-selected" : ""}" data-i="${i}"
    style="left:${p.x}%;top:${p.y}%;width:${p.w}%;z-index:${p.z};transform:translate(-50%,-50%)">
    <img src="${imgUrl(item)}" alt="${esc(item.name || item.category)}" draggable="false"></div>`;
}

let placed = [];
function renderBoard() {
  state.board = state.board.filter((p) => itemById(p.itemId));
  if (state.selected >= state.board.length) state.selected = -1;
  placed = layout(state.board);
  board.querySelectorAll(".piece").forEach((n) => n.remove());
  board.insertAdjacentHTML("beforeend", placed.map((p, i) => pieceHTML(p, i, true)).join(""));
  state.board.forEach((p) => alphaMap(itemById(p.itemId)));
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
    toast("Cut out this jacket's inside so your top shows through");
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
  if (tool === "reset") { p.dx = p.dy = 0; refreshPositions(); renderTools(); }
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
  const m = alphaMap(itemById(state.board[i].itemId));
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
    : `<p class="strip-empty">add some pieces to your closet first ✿</p>`;
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
  if (!picks.length) { toast("Add a few pieces first, then shuffle 🎲"); return; }
  state.board = picks.map((i) => ({ itemId: i.id, dx: 0, dy: 0, tuck: false }));
  state.editingOutfit = null;
  state.selected = -1;
  renderBoard();
}
$("#shuffle-btn").onclick = shuffle;

/* ───────────── save + lookbook ───────────── */
let saveVibe = VIBES[0];
$("#save-outfit-btn").onclick = () => {
  if (!state.board.length) { toast("Pin a few pieces to the board first"); return; }
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
  toast("Pinned to the lookbook 📌");
});

function renderOutfits() {
  const list = [...state.outfits].sort((a, b) => b.createdAt - a.createdAt);
  $("#outfits-empty").hidden = list.length > 0;
  $("#outfit-grid").innerHTML = list.map((o) => `
    <div class="look" data-id="${o.id}" role="button" tabindex="0">
      <button class="look-del" data-del="${o.id}" aria-label="Delete look">✕</button>
      <div class="mini-board">${layout(o.pieces).map((p, i) => pieceHTML(p, i, false)).join("")}</div>
      <p class="look-name">${esc(o.name)}</p>
      <span class="look-vibe">${esc(o.vibe)}</span>
    </div>`).join("");
}

$("#outfit-grid").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del]");
  if (del) {
    if (!(await confirmBox("Delete this look? (your clothes stay put)"))) return;
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

/* ───────────── cutout editor ───────────── */
const ed = { pix: null, mask: null, undo: [], tool: "wand", pts: [], out: null, tol: 30, size: 28, painting: false, last: null };
const cutCanvas = $("#cut-canvas");
const hint = (t) => { $("#cut-hint").textContent = t; };
const HINTS = {
  wand: "tap anything you want gone — background, a shadow, the inside of a jacket",
  shape: "tap around the area to cut (like the open front of a jacket), then Cut shape",
  erase: "paint over bits to remove",
  restore: "paint to bring bits back",
};

async function openEditor(mode) {
  if (!form.original) return;
  hint("loading…");
  $("#cut-dialog").showModal();
  ed.pix = await Cutout.loadPixels(form.original);
  ed.mask = await Cutout.maskFromCut(ed.pix, form.cut ? form.blob : null, form.cut);
  ed.undo = [];
  ed.pts = [];
  ed.out = new ImageData(ed.pix.W, ed.pix.H);
  cutCanvas.width = ed.pix.W;
  cutCanvas.height = ed.pix.H;
  setTool("wand");
  draw();
  if (mode === "front") openFrontNow();
}

function setTool(t) {
  ed.tool = t;
  document.querySelectorAll("#cut-tools .chip").forEach((c) => c.setAttribute("aria-checked", c.dataset.tool === t));
  const brushy = t === "erase" || t === "restore";
  $("#slider-label").textContent = brushy ? "Brush" : "Strength";
  Object.assign($("#cut-slider"), brushy ? { min: 6, max: 90, value: ed.size } : { min: 8, max: 80, value: ed.tol });
  $("#shape-actions").hidden = t !== "shape" || !ed.pts.length;
  hint(HINTS[t]);
}
$("#cut-tools").onclick = (e) => { const c = e.target.closest(".chip"); if (c) setTool(c.dataset.tool); };
$("#cut-slider").oninput = (e) => {
  if (ed.tool === "erase" || ed.tool === "restore") ed.size = +e.target.value; else ed.tol = +e.target.value;
};

function draw() {
  const { W, H, data } = ed.pix, o = ed.out.data, m = ed.mask;
  for (let p = 0; p < W * H; p++) {
    o[p * 4] = data[p * 4]; o[p * 4 + 1] = data[p * 4 + 1]; o[p * 4 + 2] = data[p * 4 + 2];
    o[p * 4 + 3] = Math.max(m[p], 38); // removed bits stay faintly visible so you can restore them
  }
  const ctx = cutCanvas.getContext("2d");
  ctx.putImageData(ed.out, 0, 0);
  if (ed.pts.length) {
    const k = W / cutCanvas.getBoundingClientRect().width;
    ctx.strokeStyle = "#c4553a"; ctx.fillStyle = "rgba(196,85,58,.25)"; ctx.lineWidth = 2.5 * k;
    ctx.setLineDash([6 * k, 4 * k]);
    ctx.beginPath();
    ed.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (ed.pts.length > 2) { ctx.closePath(); ctx.fill(); }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#c4553a";
    ed.pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 5 * k, 0, 7); ctx.fill(); });
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
  ed.last = [x, y];
  redraw();
}

cutCanvas.addEventListener("pointerdown", (e) => {
  if (!ed.pix) return;
  const [x, y, k] = canvasPoint(e);
  if (ed.tool === "wand") {
    pushUndo();
    const n = Cutout.wand(ed.pix, ed.mask, x, y, ed.tol);
    if (!n) { ed.undo.pop(); hint("that spot's already cut"); }
    else hint("snip ✂ — tap more, or turn Strength up if it missed some");
    redraw();
  } else if (ed.tool === "shape") {
    ed.pts.push([x, y]);
    $("#shape-actions").hidden = false;
    redraw();
  } else {
    pushUndo();
    ed.painting = true;
    ed.last = null;
    cutCanvas.setPointerCapture(e.pointerId);
    paintTo(x, y, k);
  }
});
cutCanvas.addEventListener("pointermove", (e) => {
  if (!ed.painting) return;
  const [x, y, k] = canvasPoint(e);
  paintTo(x, y, k);
});
const stopPaint = () => { ed.painting = false; ed.last = null; };
cutCanvas.addEventListener("pointerup", stopPaint);
cutCanvas.addEventListener("pointercancel", stopPaint);

$("#shape-cut").onclick = () => {
  if (ed.pts.length < 3) { hint("tap at least 3 points"); return; }
  pushUndo();
  Cutout.cutPolygon(ed.mask, ed.pix.W, ed.pix.H, ed.pts);
  ed.pts = [];
  $("#shape-actions").hidden = true;
  hint("cut ✂");
  redraw();
};
$("#shape-clear").onclick = () => { ed.pts = []; $("#shape-actions").hidden = true; redraw(); };

$("#cut-auto").onclick = () => {
  pushUndo();
  const m = Cutout.removeBackground(ed.pix, ed.tol);
  if (m) { ed.mask.set(m); hint("background gone ✨ — not quite? nudge Strength and try again"); }
  else { ed.undo.pop(); hint("couldn't find a plain background — use the wand or shape tool"); }
  redraw();
};
function openFrontNow() {
  pushUndo();
  const r = Cutout.openFront(ed.pix, ed.mask, ed.tol);
  if (r.ok) hint("opened up the front 🧥 — it'll layer over tops now");
  else { ed.undo.pop(); setTool("shape"); hint(r.why); }
  redraw();
}
$("#cut-front").onclick = openFrontNow;
$("#cut-undo").onclick = () => { const m = ed.undo.pop(); if (m) { ed.mask.set(m); redraw(); } else hint("nothing to undo"); };
$("#cut-reset").onclick = () => { pushUndo(); ed.mask.fill(255); ed.pts = []; redraw(); hint("back to the original photo"); };

$("#cut-done").onclick = async () => {
  const res = await Cutout.render(ed.pix, ed.mask);
  if (res) Object.assign(form, { blob: res.blob, cut: res.cut, ratio: res.ratio });
  else Object.assign(form, { blob: form.original, cut: null, ratio: ed.pix.W / ed.pix.H });
  setPreview(form.blob);
  $("#cut-dialog").close();
};

/* ───────────── sample closet ───────────── */
async function loadSamples(announce = true) {
  const { items, outfits } = await Samples.build(uid);
  for (const i of items) await idb.put("items", i);
  for (const o of outfits) await idb.put("outfits", o);
  state.items.push(...items);
  state.outfits.push(...outfits);
  renderCloset();
  renderDrawer();
  if (announce) toast(`Hung up ${items.length} sample pieces ✨`);
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
});
$("#remove-samples").onclick = async () => {
  $("#menu-dialog").close();
  if (!(await confirmBox("Remove the sample pieces and their looks? Your own pieces stay."))) return;
  await removeSamples();
  toast("Samples cleared. The closet's all yours");
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
  toast("Packing your closet…");
  const items = await Promise.all(state.items.map(async (i) => ({
    ...i,
    image: await toDataURL(i.image),
    original: i.original && i.original !== i.image ? await toDataURL(i.original) : null,
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
  toast("Backup saved 💾");
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
      const item = { ...raw, image, original: raw.original ? await fromDataURL(raw.original) : image };
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
    toast(`Restored ${data.items?.length ?? 0} pieces & ${data.outfits?.length ?? 0} looks ✨`);
  } catch {
    toast("That file doesn't look like an Apps & Daps backup");
  }
};

if (window.APP_DEMO) {
  // Test-drive build: files can't be saved from the preview, so hide backup.
  $("#export-btn").hidden = $("#import-btn").hidden = true;
  $("#menu-dialog .sheet-copy").textContent = "This is a test drive. The sample pieces are illustrations; add your own photos with the + button. Backups work in the installed app.";
}

$("#tagline").textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

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
