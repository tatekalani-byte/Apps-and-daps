/* Cutout engine — runs entirely on-device, no network or AI model needed.
   Works on a per-pixel alpha mask (0 = cut away, 255 = keep) over the original photo. */

const Cutout = (() => {
  // Color distance that cares less about brightness than hue, so shadows on a
  // bedsheet still read as "background".
  function cdist(d, i, r, g, b) {
    const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
    const dy = 0.299 * dr + 0.587 * dg + 0.114 * db;
    const dcb = -0.169 * dr - 0.331 * dg + 0.5 * db;
    const dcr = 0.5 * dr - 0.419 * dg - 0.081 * db;
    return Math.sqrt(0.45 * dy * dy + 2 * (dcb * dcb + dcr * dcr));
  }
  const pixDist = (d, i, j) => cdist(d, i, d[j], d[j + 1], d[j + 2]);

  async function loadPixels(blob) {
    const bmp = await new Promise((res, rej) => {
      const u = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { res(img); URL.revokeObjectURL(u); };
      img.onerror = () => { rej(new Error("Couldn't read that image")); URL.revokeObjectURL(u); };
      img.src = u;
    });
    const W = bmp.naturalWidth, H = bmp.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return { W, H, data: ctx.getImageData(0, 0, W, H).data, img: bmp };
  }

  // Rebuild the full-size mask from a saved (cropped) cutout.
  async function maskFromCut(pix, cutBlob, cut) {
    const m = new Uint8ClampedArray(pix.W * pix.H);
    if (!cut || !cutBlob) return m.fill(255);
    const cp = await loadPixels(cutBlob);
    for (let y = 0; y < cp.H; y++) {
      for (let x = 0; x < cp.W; x++) {
        const X = x + cut.x, Y = y + cut.y;
        if (X < pix.W && Y < pix.H) m[Y * pix.W + X] = cp.data[(y * cp.W + x) * 4 + 3];
      }
    }
    return m;
  }

  // k-means over the photo's border to learn what "background" looks like.
  function borderColors(pix, k = 3) {
    const { W, H, data } = pix;
    const s = [], side = []; // side: 0 top, 1 bottom, 2 left, 3 right
    const step = Math.max(1, Math.round((W + H) / 400));
    for (let x = 0; x < W; x += step) { s.push((x) * 4, ((H - 1) * W + x) * 4); side.push(0, 1); }
    for (let y = 0; y < H; y += step) { s.push((y * W) * 4, (y * W + W - 1) * 4); side.push(2, 3); }
    const perSide = [0, 0, 0, 0];
    side.forEach((n) => perSide[n]++);
    let centers = [0, Math.floor(s.length / 3), Math.floor((2 * s.length) / 3)].slice(0, k)
      .map((n) => [data[s[n]], data[s[n] + 1], data[s[n] + 2]]);
    for (let it = 0; it < 8; it++) {
      const acc = centers.map(() => [0, 0, 0, 0, [0, 0, 0, 0]]);
      s.forEach((i, j) => {
        let best = 0, bd = Infinity;
        centers.forEach((c, n) => { const d = cdist(data, i, c[0], c[1], c[2]); if (d < bd) { bd = d; best = n; } });
        const a = acc[best]; a[0] += data[i]; a[1] += data[i + 1]; a[2] += data[i + 2]; a[3]++; a[4][side[j]]++;
      });
      // Background surrounds the piece, so it shows up along at least three sides of the
      // photo. A color on one or two sides is the garment running off the edge (pant legs
      // past the bottom, sleeves past the sides), so it's not background.
      const isBg = (a) => a[3] > s.length * 0.06 &&
        (a[3] > s.length * 0.45 || a[4].filter((c, n) => c > perSide[n] * 0.15).length >= 3);
      centers = acc.filter(isBg).map((a) => [a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
      if (!centers.length) centers = [[data[0], data[1], data[2]]];
    }
    return centers;
  }

  // Generic region grow. accept(i, fromIdx) decides whether pixel i joins.
  function grow(W, H, seeds, accept, out) {
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    for (const s of seeds) if (!out[s] && accept(s, s)) { out[s] = 1; q[tail++] = s; }
    while (head < tail) {
      const p = q[head++], x = p % W;
      const nbs = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
      for (const n of nbs) {
        if (n < 0 || n >= W * H || out[n]) continue;
        if (accept(n, p)) { out[n] = 1; q[tail++] = n; }
      }
    }
    return tail;
  }

  function erode(mask, W, H, region) {
    // Shave one pixel off the kept area next to `region` to kill color halos.
    const extra = [];
    for (let p = 0; p < W * H; p++) {
      if (!region[p]) continue;
      const x = p % W;
      if (x > 0) extra.push(p - 1);
      if (x < W - 1) extra.push(p + 1);
      if (p >= W) extra.push(p - W);
      if (p < W * H - W) extra.push(p + W);
    }
    for (const p of extra) mask[p] = Math.min(mask[p], 110);
  }

  function keepBigPieces(mask, W, H) {
    // Remove specks: keep foreground blobs at least 12% the size of the biggest.
    const label = new Int32Array(W * H);
    const sizes = [0];
    const q = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (mask[s] < 128 || label[s]) continue;
      const id = sizes.length;
      let head = 0, tail = 0;
      q[tail++] = s; label[s] = id;
      while (head < tail) {
        const p = q[head++], x = p % W;
        for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
          if (n < 0 || n >= W * H || label[n] || mask[n] < 128) continue;
          label[n] = id; q[tail++] = n;
        }
      }
      sizes.push(tail);
    }
    const max = Math.max(...sizes);
    for (let p = 0; p < W * H; p++) if (label[p] && sizes[label[p]] < max * 0.12) mask[p] = 0;
  }

  function softenEdges(mask, W, H) {
    const src = mask.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        const v = src[p];
        // only touch edge pixels
        if (v === src[p - 1] && v === src[p + 1] && v === src[p - W] && v === src[p + W]) continue;
        mask[p] = (src[p] * 4 + src[p - 1] + src[p + 1] + src[p - W] + src[p + W]) / 8;
      }
    }
  }

  const area = (mask) => { let n = 0; for (let i = 0; i < mask.length; i++) if (mask[i] > 127) n++; return n; };

  /* Remove the background: flood in from the photo's edges. Returns null if it can't find one. */
  function removeBackground(pix, tol = 30) {
    const { W, H, data } = pix;
    const centers = borderColors(pix);
    const toBg = (i) => Math.min(...centers.map((c) => cdist(data, i * 4, c[0], c[1], c[2])));
    const bg = new Uint8Array(W * H);
    const seeds = [];
    for (let x = 0; x < W; x++) seeds.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) seeds.push(y * W, y * W + W - 1);
    grow(W, H, seeds, (i, from) => {
      const d = toBg(i);
      // close to a background color, or a gentle step from a background pixel (soft shading)
      return d < tol || (d < tol * 1.7 && pixDist(data, i * 4, from * 4) < tol * 0.3);
    }, bg);

    const mask = new Uint8ClampedArray(W * H);
    for (let p = 0; p < W * H; p++) mask[p] = bg[p] ? 0 : 255;
    keepBigPieces(mask, W, H);
    const fg = area(mask) / (W * H);
    if (fg < 0.03 || fg > 0.97) return null;
    const cut = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) cut[p] = mask[p] < 128 ? 1 : 0;
    erode(mask, W, H, cut);
    softenEdges(mask, W, H);
    return mask;
  }

  /* Magic wand: cut the connected patch of similar color around (x, y), or with keep,
     bring it back. Returns how many pixels changed. */
  function wand(pix, mask, x, y, tol = 30, keep = false) {
    const { W, H, data } = pix;
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    // average a small patch for a stable seed color
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = (Y * W + X) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    r /= n; g /= n; b /= n;
    const region = new Uint8Array(W * H);
    const count = grow(W, H, [y * W + x], (i, from) => {
      if (keep ? mask[i] > 200 : mask[i] < 60) return false;
      const d = cdist(data, i * 4, r, g, b);
      return d < tol || (d < tol * 1.6 && pixDist(data, i * 4, from * 4) < tol * 0.3);
    }, region);
    if (keep) { for (let p = 0; p < W * H; p++) if (region[p]) mask[p] = 255; return count; }
    for (let p = 0; p < W * H; p++) if (region[p]) mask[p] = 0;
    erode(mask, W, H, region);
    return count;
  }

  const avgColor = (pix, mask, x0, y0, rad) => {
    const { W, H, data } = pix;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0 - rad; y <= y0 + rad; y++) for (let x = x0 - rad; x <= x0 + rad; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || mask[y * W + x] < 200) continue;
      const i = (y * W + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return n > rad ? [r / n, g / n, b / n] : null;
  };

  /* Jacket "open front": find the inside (lining / back panel) showing down the
     middle and cut it so a shirt layered underneath shows through. */
  function openFront(pix, mask, tol = 30) {
    const { W, H } = pix;
    let minX = W, maxX = 0, minY = H, maxY = 0, sx = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (mask[y * W + x] < 128) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      sx += x; n++;
    }
    if (!n) return { ok: false, why: "Nothing to cut yet" };
    const cx = Math.round(sx / n), bw = maxX - minX, bh = maxY - minY;
    const rad = Math.max(3, Math.round(bw * 0.015));
    const total = n;
    // Body panels sit ~18% in from each side of the garment (sleeves are further out).
    const before = mask.slice();
    for (const fy of [0.45, 0.35, 0.55, 0.28, 0.65]) {
      const y = Math.round(minY + bh * fy);
      const inside = avgColor(pix, mask, cx, y, rad);
      const left = avgColor(pix, mask, Math.round(cx - bw * 0.2), y, rad);
      const right = avgColor(pix, mask, Math.round(cx + bw * 0.2), y, rad);
      if (!inside || (!left && !right)) continue;
      const diff = (c) => (c ? cdist(inside, 0, c[0], c[1], c[2]) : 0);
      if (Math.max(diff(left), diff(right)) < tol * 0.9) continue; // inside looks the same as outside
      const removed = wand(pix, mask, cx, y, tol);
      const frac = removed / total;
      if (frac > 0.02 && frac < 0.45) return { ok: true, frac };
      mask.set(before);
    }
    return { ok: false, why: "Couldn't spot the inside — trace it with the shape tool or tap it with the wand" };
  }

  function brush(mask, W, H, x, y, r, keep) {
    const x0 = Math.max(0, Math.floor(x - r - 2)), x1 = Math.min(W - 1, Math.ceil(x + r + 2));
    const y0 = Math.max(0, Math.floor(y - r - 2)), y1 = Math.min(H - 1, Math.ceil(y + r + 2));
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
      const d = Math.hypot(X - x, Y - y);
      const a = Math.max(0, Math.min(1, (r - d) / 1.5 + 0.5)) * 255;
      if (!a) continue;
      const p = Y * W + X;
      mask[p] = keep ? Math.max(mask[p], a) : Math.min(mask[p], 255 - a);
    }
  }

  function cutPolygon(mask, W, H, pts, keep = false) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    const a = ctx.getImageData(0, 0, W, H).data;
    for (let p = 0; p < W * H; p++) {
      if (a[p * 4 + 3]) mask[p] = keep ? Math.max(mask[p], a[p * 4 + 3]) : Math.min(mask[p], 255 - a[p * 4 + 3]);
    }
  }

  // Compose photo + mask, crop to the garment, and encode with transparency.
  async function render(pix, mask) {
    const { W, H, data } = pix;
    let minX = W, maxX = -1, minY = H, maxY = -1, full = true;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = mask[y * W + x];
      if (a < 255) full = false;
      if (a < 10) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (full || maxX < 0) return null; // nothing cut (or everything) — keep the plain photo
    const pad = 2;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = ((y + minY) * W + (x + minX)), o = (y * w + x) * 4;
      out.data[o] = data[s * 4]; out.data[o + 1] = data[s * 4 + 1]; out.data[o + 2] = data[s * 4 + 2];
      out.data[o + 3] = mask[s];
    }
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").putImageData(out, 0, 0);
    // WebP keeps transparency and is much smaller than PNG; browsers without it fall back to PNG.
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
    return { blob, cut: { x: minX, y: minY, w, h }, ratio: w / h };
  }

  return { loadPixels, maskFromCut, removeBackground, wand, openFront, brush, cutPolygon, render, keepBigPieces, softenEdges };
})();
