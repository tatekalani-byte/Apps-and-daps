/* Outfit photo → separate pieces.
   A clothing parser (SegFormer trained on clothing labels, run on-device with
   transformers.js) labels every pixel of a photo of you wearing an outfit. Each
   garment becomes its own cutout with you and the background removed, keeping the
   worn shape. The model downloads once (~30 MB) and is cached by the browser;
   photos never leave the device. */

const OutfitPhoto = (() => {
  const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
  const MODEL = "Xenova/segformer_b2_clothes";
  const LABELS = ["background", "hat", "hair", "sunglasses", "upper-clothes", "skirt", "pants", "dress", "belt",
    "left-shoe", "right-shoe", "face", "left-leg", "right-leg", "left-arm", "right-arm", "bag", "scarf"];
  const ID = Object.fromEntries(LABELS.map((l, i) => [l, i]));
  const BELT = ID.belt;

  // Which labels make up each piece. `neck` pieces get the inside of the collar filled in.
  const GROUPS = [
    { ids: [ID["upper-clothes"]], category: "Tops", noun: "top", neck: true },
    { ids: [ID.dress], category: "Dresses", noun: "dress", neck: true },
    { ids: [ID.pants], category: "Bottoms", noun: "pants", belt: true },
    { ids: [ID.skirt], category: "Bottoms", noun: "skirt", belt: true },
    { ids: [ID["left-shoe"], ID["right-shoe"]], category: "Shoes", noun: "shoes" },
    { ids: [ID.hat], category: "Accessories", noun: "hat" },
    { ids: [ID.sunglasses], category: "Accessories", noun: "sunglasses" },
    { ids: [ID.scarf], category: "Accessories", noun: "scarf" },
    { ids: [ID.bag], category: "Bags", noun: "bag" },
  ];

  let pipe = null, loading = null;
  const ready = () => !!pipe;

  // Test and self-hosting hooks: window.APP_TRANSFORMERS_URL, APP_MODEL_HOST, APP_WASM_PATH.
  function load(onProgress) {
    if (pipe) return Promise.resolve(pipe);
    loading ??= (async () => {
      const tf = await import(window.APP_TRANSFORMERS_URL || LIB);
      tf.env.allowLocalModels = false;
      if (window.APP_MODEL_HOST) tf.env.remoteHost = window.APP_MODEL_HOST;
      if (window.APP_WASM_PATH) tf.env.backends.onnx.wasm.wasmPaths = window.APP_WASM_PATH;
      const files = new Map();
      pipe = await tf.pipeline("image-segmentation", MODEL, {
        dtype: "q8",
        progress_callback: (p) => {
          if (p.status !== "progress" || !p.total) return;
          files.set(p.file, [p.loaded, p.total]);
          let l = 0, t = 0;
          for (const [a, b] of files.values()) { l += a; t += b; }
          onProgress?.(l, t);
        },
      });
      return pipe;
    })().catch((err) => { loading = null; throw err; });
    return loading;
  }

  // One label id per pixel, at the photo's own size.
  async function labelPixels(blob, W, H, onProgress) {
    const run = await load(onProgress);
    const url = URL.createObjectURL(blob);
    try {
      const out = await run(url);
      const lab = new Uint8Array(W * H);
      for (const { label, mask } of out) {
        const id = ID[String(label).toLowerCase().replace(/[\s_]+/g, "-")];
        if (!id) continue;
        const { width: mw, height: mh, channels: ch, data } = mask;
        for (let y = 0; y < H; y++) {
          const row = Math.min(mh - 1, Math.floor((y * mh) / H)) * mw;
          for (let x = 0; x < W; x++) {
            if (data[(row + Math.min(mw - 1, Math.floor((x * mw) / W))) * ch] > 127) lab[y * W + x] = id;
          }
        }
      }
      return lab;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Binary erode (grow=false) or dilate (grow=true) with a square of radius r, in two passes.
  function morph(src, W, H, r, grow) {
    const pass = (from, to, len, count, at) => {
      for (let line = 0; line < count; line++) {
        let on = 0;
        for (let i = 0; i < Math.min(r, len); i++) if (from[at(line, i)] >= 128) on++;
        for (let i = 0; i < len; i++) {
          if (i + r < len && from[at(line, i + r)] >= 128) on++;
          if (i - r - 1 >= 0 && from[at(line, i - r - 1)] >= 128) on--;
          const size = Math.min(len - 1, i + r) - Math.max(0, i - r) + 1;
          to[at(line, i)] = (grow ? on > 0 : on === size) ? 255 : 0;
        }
      }
    };
    const tmp = new Uint8ClampedArray(W * H), out = new Uint8ClampedArray(W * H);
    pass(src, tmp, W, H, (y, x) => y * W + x);
    pass(tmp, out, H, W, (x, y) => y * W + x);
    return out;
  }
  // Opening: removes slivers and thin stray lines without changing the overall shape.
  const openMask = (mask, W, H, r) => mask.set(morph(morph(mask, W, H, r, false), W, H, r, true));

  function bbox(mask, W, H) {
    let x0 = W, x1 = -1, y0 = H, y1 = -1, sx = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (mask[y * W + x] < 128) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      sx += x; n++;
    }
    return n ? { x0, x1, y0, y1, cx: Math.round(sx / n), n } : null;
  }

  /* Ghost-mannequin collar: the neck hides the inside back of the collar, so fill the
     opening between the collar's sides with a shaded, darker take on the fabric. */
  function fillNeck(pix, mask) {
    const { W, H, data } = pix;
    const b = bbox(mask, W, H);
    if (!b) return;
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const xl = Math.max(b.x0, Math.round(b.cx - bw * 0.2)), xr = Math.min(b.x1, Math.round(b.cx + bw * 0.2));
    const yEnd = Math.min(b.y1, Math.round(b.y0 + bh * 0.25));
    const cand = new Uint8Array(W * H);
    for (let y = b.y0; y <= yEnd; y++) {
      let L = -1, R = -1;
      for (let x = b.x0; x <= b.x1; x++) if (mask[y * W + x] >= 128) { if (L < 0) L = x; R = x; }
      if (L < 0) continue;
      for (let x = Math.max(xl, L); x <= Math.min(xr, R); x++) if (mask[y * W + x] < 128) cand[y * W + x] = 1;
    }
    // keep only openings that reach the top of the garment (the neckline), not holes lower down
    const keep = new Uint8Array(W * H), q = [];
    const topBand = b.y0 + Math.max(2, bh * 0.08);
    for (let y = b.y0; y <= topBand && y <= yEnd; y++) for (let x = xl; x <= xr; x++) {
      const p = y * W + x;
      if (cand[p] && !keep[p]) { keep[p] = 1; q.push(p); }
    }
    while (q.length) {
      const p = q.pop(), x = p % W;
      for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (n >= 0 && n < W * H && cand[n] && !keep[n]) { keep[n] = 1; q.push(n); }
      }
    }
    // fabric color around the collar
    let r = 0, g = 0, bl = 0, c = 0;
    for (let y = b.y0; y <= yEnd; y++) for (let x = xl; x <= xr; x++) {
      const p = y * W + x;
      if (mask[p] >= 128) { r += data[p * 4]; g += data[p * 4 + 1]; bl += data[p * 4 + 2]; c++; }
    }
    if (!c) return;
    r /= c; g /= c; bl /= c;
    const span = Math.max(1, yEnd - b.y0);
    for (let p = 0; p < W * H; p++) {
      if (!keep[p]) continue;
      const t = (Math.floor(p / W) - b.y0) / span;
      const s = 0.66 - 0.22 * t; // a little darker the deeper into the garment
      data[p * 4] = r * s; data[p * 4 + 1] = g * s; data[p * 4 + 2] = bl * s;
      mask[p] = 255;
    }
  }

  /* Small holes fully inside a garment (a hand in front of a shirt) get filled by
     blending in the fabric around them, layer by layer from the edge inward. */
  function fillHoles(pix, mask) {
    const { W, H, data } = pix;
    const b = bbox(mask, W, H);
    if (!b) return;
    const x0 = Math.max(0, b.x0 - 1), x1 = Math.min(W - 1, b.x1 + 1), y0 = Math.max(0, b.y0 - 1), y1 = Math.min(H - 1, b.y1 + 1);
    const inBox = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const outside = new Uint8Array(W * H), q = [];
    const seed = (x, y) => { const p = y * W + x; if (mask[p] < 128 && !outside[p]) { outside[p] = 1; q.push(p); } };
    for (let x = x0; x <= x1; x++) { seed(x, y0); seed(x, y1); }
    for (let y = y0; y <= y1; y++) { seed(x0, y); seed(x1, y); }
    while (q.length) {
      const p = q.pop(), x = p % W, y = (p - x) / W;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (inBox(nx, ny)) seed(nx, ny);
      }
    }
    // enclosed holes, by component; skip big ones (those are real gaps, not occlusions)
    const seen = new Uint8Array(W * H), fill = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = y * W + x;
      if (mask[s] >= 128 || outside[s] || seen[s]) continue;
      const comp = [s];
      seen[s] = 1;
      for (let i = 0; i < comp.length; i++) {
        const p = comp[i], px = p % W, py = (p - px) / W;
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          const n = ny * W + nx;
          if (inBox(nx, ny) && mask[n] < 128 && !outside[n] && !seen[n]) { seen[n] = 1; comp.push(n); }
        }
      }
      if (comp.length < b.n * 0.08) fill.push(...comp);
    }
    if (!fill.length) return;
    // also redo a 2px ring around each hole, so the fill borrows clean fabric, not the blended edge
    const todo = new Set(fill);
    for (const p of fill) {
      const x = p % W;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const n = p + dy * W + dx;
        if (x + dx >= 0 && x + dx < W && n >= 0 && n < W * H && mask[n] >= 128) todo.add(n);
      }
    }
    const known = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) if (mask[p] >= 128 && !todo.has(p)) known[p] = 1;
    while (todo.size) {
      const layer = [];
      for (const p of todo) {
        const x = p % W;
        let r = 0, g = 0, bl = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const n = p + dy * W + dx;
          if ((dx || dy) && x + dx >= 0 && x + dx < W && n >= 0 && n < W * H && known[n]) {
            r += data[n * 4]; g += data[n * 4 + 1]; bl += data[n * 4 + 2]; c++;
          }
        }
        if (c) layer.push([p, r / c, g / c, bl / c]);
      }
      if (!layer.length) break;
      for (const [p, r, g, bl] of layer) {
        data[p * 4] = r; data[p * 4 + 1] = g; data[p * 4 + 2] = bl;
        known[p] = 1; mask[p] = 255; todo.delete(p);
      }
    }
    // soften the fill so its layer-by-layer pattern doesn't show
    const filled = fill;
    for (let pass = 0; pass < 3; pass++) {
      for (const p of filled) {
        const x = p % W;
        let r = 0, g = 0, bl = 0, c = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const n = p + dy * W + dx;
          if (x + dx >= 0 && x + dx < W && n >= 0 && n < W * H && mask[n] >= 128) { r += data[n * 4]; g += data[n * 4 + 1]; bl += data[n * 4 + 2]; c++; }
        }
        data[p * 4] = r / c; data[p * 4 + 1] = g / c; data[p * 4 + 2] = bl / c;
      }
    }
  }

  /* Split a labeled photo into pieces. Returns the pieces (each with its own mask and
     pixel copy) and inches-per-pixel from the person's height, for sizing. */
  function extract(pix, lab, heightIn) {
    const { W, H } = pix;
    let top = -1, bottom = -1;
    const count = new Uint32Array(LABELS.length);
    for (let y = 0; y < H; y++) {
      let any = false;
      for (let x = 0; x < W; x++) { const l = lab[y * W + x]; count[l]++; if (l) any = true; }
      if (any) { if (top < 0) top = y; bottom = y; }
    }
    const personPx = bottom - top + 1;
    const inchPerPx = top >= 0 && personPx > H * 0.25 ? heightIn / personPx : null;
    const beltTo = count[ID.skirt] > count[ID.pants] ? "skirt" : "pants";
    const pieces = [];
    for (const g of GROUPS) {
      const ids = new Set(g.ids);
      if (g.belt && g.noun === beltTo) ids.add(BELT);
      const mask = new Uint8ClampedArray(W * H);
      let n = 0;
      for (let p = 0; p < W * H; p++) if (ids.has(lab[p])) { mask[p] = 255; n++; }
      if (n < W * H * 0.002) continue;
      // strong cleanup for clothes; light for bags and accessories, where thin parts (straps) are real
      openMask(mask, W, H, ["Tops", "Bottoms", "Dresses"].includes(g.category) ? 3 : 1);
      Cutout.keepBigPieces(mask, W, H);
      const own = { W, H, data: pix.data.slice() };
      if (g.neck) fillNeck(own, mask);
      fillHoles(own, mask);
      Cutout.softenEdges(mask, W, H);
      pieces.push({ category: g.category, noun: g.noun, mask, pix: own });
    }
    return { pieces, inchPerPx };
  }

  return { load, ready, labelPixels, extract };
})();
