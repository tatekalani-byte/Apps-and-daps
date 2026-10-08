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
  return {
    all: (s) => run(s, "readonly", (st) => st.getAll()),
    put: (s, v) => run(s, "readwrite", (st) => st.put(v)),
    del: (s, k) => run(s, "readwrite", (st) => st.delete(k)),
  };
})();

/* ───────────── state ───────────── */
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
    <button class="pin" data-id="${i.id}">
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
const form = { id: null, blob: null, ratio: 0.8, category: "Tops", color: null, queue: [] };

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
}

function setPreview(blob) {
  const p = $("#photo-preview");
  if (setPreview.url) URL.revokeObjectURL(setPreview.url);
  if (!blob) { p.innerHTML = "<span>no pic yet</span>"; return; }
  setPreview.url = URL.createObjectURL(blob);
  p.innerHTML = `<img src="${setPreview.url}" alt="preview">`;
}

function openItemForm(item = null) {
  Object.assign(form, {
    id: item?.id ?? null,
    blob: item?.image ?? null,
    ratio: item?.ratio ?? 0.8,
    category: item?.category ?? (state.filter !== "All" ? state.filter : "Tops"),
    color: item?.color ?? null,
  });
  $("#item-dialog-title").textContent = item ? "Edit piece" : form.queue.length ? `New piece · ${form.queue.length} more after this` : "New piece";
  $("#f-name").value = item?.name ?? "";
  $("#f-tags").value = (item?.tags ?? []).join(", ");
  $("#item-save").textContent = item ? "Save changes" : "Hang it up";
  setPreview(form.blob);
  renderFormPickers();
  if (!$("#item-dialog").open) $("#item-dialog").showModal();
}

async function takeFile(file) {
  try {
    const { blob, ratio } = await shrink(file);
    form.blob = blob;
    form.ratio = ratio;
    setPreview(blob);
  } catch (err) {
    toast(err.message);
  }
}

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
    image: form.blob,
    ratio: form.ratio,
    fav: existing?.fav ?? false,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  try {
    await idb.put("items", item);
  } catch {
    toast("Couldn't save — phone storage might be full");
    return;
  }
  if (existing) {
    if (existing.image !== item.image) { URL.revokeObjectURL(urls.get(item.id)); urls.delete(item.id); }
    state.items[state.items.indexOf(existing)] = item;
  } else {
    state.items.push(item);
  }
  renderCloset();
  renderDrawer();
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
  $("#d-meta").innerHTML = `<span class="dot" style="${dotStyle(i.color)}"></span>${esc(i.category)}${i.color ? " · " + esc(i.color) : ""}`;
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
  addToBoard(detailId);
  go("builder");
};

/* ───────────── outfit builder ───────────── */
const board = $("#board");

function pieceHTML(p, i, selectable) {
  const item = itemById(p.itemId);
  if (!item) return "";
  return `<div class="piece${selectable && i === state.selected ? " is-selected" : ""}" data-i="${i}"
    style="left:${p.x}%;top:${p.y}%;width:${p.w}%;z-index:${p.z};transform:translate(-50%,-50%) rotate(${p.r}deg)">
    <img src="${imgUrl(item)}" alt="${esc(item.name || item.category)}" draggable="false"></div>`;
}

function renderBoard() {
  board.querySelectorAll(".piece").forEach((n) => n.remove());
  board.insertAdjacentHTML("beforeend", state.board.map((p, i) => pieceHTML(p, i, true)).join(""));
  $("#board-hint").hidden = state.board.length > 0;
  $("#piece-tools").hidden = state.selected < 0;
}

function updatePiece(i) {
  const p = state.board[i];
  const el = board.querySelector(`.piece[data-i="${i}"]`);
  if (!el) return;
  Object.assign(el.style, {
    left: p.x + "%", top: p.y + "%", width: p.w + "%", zIndex: p.z,
    transform: `translate(-50%,-50%) rotate(${p.r}deg)`,
  });
}

const topZ = () => Math.max(0, ...state.board.map((p) => p.z)) + 1;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function addToBoard(itemId, at = {}) {
  const jitter = () => (Math.random() - 0.5) * 16;
  state.board.push({ itemId, x: 50 + jitter(), y: 50 + jitter(), w: 42, r: (Math.random() - 0.5) * 8, z: topZ(), ...at });
  state.selected = state.board.length - 1;
  renderBoard();
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
}

$("#drawer-strip").addEventListener("click", (e) => {
  const b = e.target.closest(".strip-item");
  if (b) addToBoard(b.dataset.id);
});

// Drag with one finger, pinch/twist with two.
const pointers = new Map();
let gesture = null;

board.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".piece");
  if (!el) {
    if (pointers.size === 0) { state.selected = -1; renderBoard(); }
    return;
  }
  const i = +el.dataset.i;
  if (state.selected !== i) {
    state.selected = i;
    state.board[i].z = topZ();
    board.querySelectorAll(".piece").forEach((n) => n.classList.toggle("is-selected", +n.dataset.i === i));
    $("#piece-tools").hidden = false;
    updatePiece(i);
  }
  board.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  startGesture();
});

function startGesture() {
  const p = state.board[state.selected];
  if (!p) return;
  const pts = [...pointers.values()];
  gesture = { start: { ...p }, pts: pts.map((q) => ({ ...q })) };
}

board.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId) || !gesture) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = state.board[state.selected];
  const rect = board.getBoundingClientRect();
  const now = [...pointers.values()];
  const was = gesture.pts;
  const mid = (a) => ({ x: a.reduce((s, q) => s + q.x, 0) / a.length, y: a.reduce((s, q) => s + q.y, 0) / a.length });
  const m0 = mid(was), m1 = mid(now);
  p.x = clamp(gesture.start.x + ((m1.x - m0.x) / rect.width) * 100, 0, 100);
  p.y = clamp(gesture.start.y + ((m1.y - m0.y) / rect.height) * 100, 0, 100);
  if (now.length >= 2 && was.length >= 2) {
    const d = (a) => Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
    const ang = (a) => Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x) * 180 / Math.PI;
    p.w = clamp(gesture.start.w * (d(now) / d(was)), 10, 120);
    p.r = gesture.start.r + (ang(now) - ang(was));
  }
  updatePiece(state.selected);
});

const endPointer = (e) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size) startGesture(); else gesture = null;
};
board.addEventListener("pointerup", endPointer);
board.addEventListener("pointercancel", endPointer);

// Desktop: scroll wheel to resize the selected piece.
board.addEventListener("wheel", (e) => {
  const p = state.board[state.selected];
  if (!p || !e.target.closest(".piece")) return;
  e.preventDefault();
  p.w = clamp(p.w * (e.deltaY < 0 ? 1.06 : 0.94), 10, 120);
  updatePiece(state.selected);
}, { passive: false });

$("#piece-tools").addEventListener("click", (e) => {
  const tool = e.target.closest("button")?.dataset.tool;
  const p = state.board[state.selected];
  if (!tool || !p) return;
  const zs = state.board.map((q) => q.z);
  switch (tool) {
    case "bigger": p.w = clamp(p.w * 1.12, 10, 120); break;
    case "smaller": p.w = clamp(p.w / 1.12, 10, 120); break;
    case "cw": p.r += 8; break;
    case "ccw": p.r -= 8; break;
    case "front": p.z = Math.max(...zs) + 1; break;
    case "back": p.z = Math.min(...zs) - 1; break;
    case "remove":
      state.board.splice(state.selected, 1);
      state.selected = -1;
      renderBoard();
      return;
  }
  updatePiece(state.selected);
});

$("#clear-btn").onclick = async () => {
  if (state.board.length && !(await confirmBox("Clear the board?"))) return;
  state.board = [];
  state.selected = -1;
  state.editingOutfit = null;
  renderBoard();
};

// Shuffle: pull a random fit from the closet and lay it out like a flat-lay.
const LAYOUT = {
  Outerwear: { x: 30, y: 30, w: 46, r: -6 },
  Tops: { x: 62, y: 26, w: 44, r: 4 },
  Dresses: { x: 55, y: 40, w: 52, r: 2 },
  Bottoms: { x: 50, y: 62, w: 42, r: -3 },
  Shoes: { x: 32, y: 84, w: 34, r: -8 },
  Bags: { x: 76, y: 70, w: 32, r: 8 },
  Accessories: { x: 78, y: 12, w: 26, r: 10 },
  Jewelry: { x: 20, y: 60, w: 22, r: -10 },
};
function shuffle() {
  const by = (c) => state.items.filter((i) => i.category === c);
  const pick = (c, chance = 1) => {
    const list = by(c);
    return list.length && Math.random() < chance ? list[Math.floor(Math.random() * list.length)] : null;
  };
  const useDress = by("Dresses").length && (!by("Tops").length || !by("Bottoms").length || Math.random() < 0.35);
  const picks = [
    ["Outerwear", pick("Outerwear", 0.5)],
    ...(useDress ? [["Dresses", pick("Dresses")]] : [["Tops", pick("Tops")], ["Bottoms", pick("Bottoms")]]),
    ["Shoes", pick("Shoes")],
    ["Bags", pick("Bags", 0.6)],
    ["Accessories", pick("Accessories", 0.5)],
    ["Jewelry", pick("Jewelry", 0.5)],
  ].filter(([, i]) => i);
  if (!picks.length) { toast("Add a few pieces first, then shuffle 🎲"); return; }
  state.board = [];
  state.editingOutfit = null;
  picks.forEach(([cat, item], n) => state.board.push({ itemId: item.id, ...LAYOUT[cat], z: n + 1 }));
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
    pieces: state.board.map((p) => ({ ...p })),
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
      <div class="mini-board">${o.pieces.map((p, i) => pieceHTML(p, i, false)).join("")}</div>
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
  state.board = o.pieces.filter((p) => itemById(p.itemId)).map((p) => ({ ...p }));
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
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) { if (d.id === "item-dialog") form.queue = []; d.close(); }
  });
});

$("#tagline").textContent = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

(async function init() {
  try {
    [state.items, state.outfits] = await Promise.all([idb.all("items"), idb.all("outfits")]);
    navigator.storage?.persist?.();
  } catch (err) {
    toast("Storage is blocked in this browser — pieces won't be saved");
  }
  renderCloset();
  renderDrawer();
  renderBoard();
})();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
