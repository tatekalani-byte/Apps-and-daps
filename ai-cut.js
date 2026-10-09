/* AI cutouts, run on-device with transformers.js (same library as the outfit photo).
   - Smart cutout: RMBG-1.4, a background-removal model. About 44 MB, downloaded once.
   - Tap to select: SlimSAM (Segment Anything). Tap a piece and it outlines the whole
     thing; more taps add or take away. About 14 MB, downloaded once.
   Both are cached by the browser after the first download and work offline. Photos
   never leave the device.
   Test and self-hosting hooks: window.APP_TRANSFORMERS_URL, APP_MODEL_HOST, APP_WASM_PATH. */

const AiCut = (() => {
  const LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";
  const BG_MODEL = "briaai/RMBG-1.4";
  const SAM_MODEL = "Xenova/slimsam-77-uniform";
  const SIZES = { bg: 44, sam: 14 }; // MB, for the download prompt

  // Remember which models finished downloading, so the app can use them without asking again.
  const flag = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem("ai-" + k) === "1";
      localStorage.setItem("ai-" + k, v ? "1" : "0");
    } catch { return false; }
  };

  let tfP = null;
  function lib() {
    tfP ??= import(window.APP_TRANSFORMERS_URL || LIB).then((tf) => {
      tf.env.allowLocalModels = false;
      if (window.APP_MODEL_HOST) tf.env.remoteHost = window.APP_MODEL_HOST;
      if (window.APP_WASM_PATH) tf.env.backends.onnx.wasm.wasmPaths = window.APP_WASM_PATH;
      return tf;
    }).catch((err) => { tfP = null; throw err; });
    return tfP;
  }

  // Sum progress over every file a model downloads.
  function progress(onProgress) {
    const files = new Map();
    return (p) => {
      if (p.status !== "progress" || !p.total) return;
      files.set(p.file, [p.loaded, p.total]);
      let l = 0, t = 0;
      for (const [a, b] of files.values()) { l += a; t += b; }
      onProgress?.(l, t);
    };
  }

  // Scale a w×h float map (0..1) to W×H alpha (0..255), bilinear.
  function upscale(src, w, h, W, H) {
    const out = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) {
      const fy = Math.max(0, Math.min(h - 1, ((y + 0.5) * h) / H - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.max(0, Math.min(w - 1, ((x + 0.5) * w) / W - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * w + x0] * (1 - tx) + src[y0 * w + x1] * tx;
        const b = src[y1 * w + x0] * (1 - tx) + src[y1 * w + x1] * tx;
        out[y * W + x] = (a * (1 - ty) + b * ty) * 255;
      }
    }
    return out;
  }

  /* ── smart cutout ── */
  let bg = null, bgLoading = null;
  function loadBg(onProgress) {
    if (bg) return Promise.resolve(bg);
    bgLoading ??= (async () => {
      const tf = await lib();
      const opts = { progress_callback: progress(onProgress) };
      const [model, processor] = await Promise.all([
        tf.AutoModel.from_pretrained(BG_MODEL, { ...opts, dtype: "q8", config: { model_type: "custom" } }),
        tf.AutoProcessor.from_pretrained(BG_MODEL, {
          ...opts,
          config: {
            do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
            image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1], feature_extractor_type: "ImageFeatureExtractor",
            resample: 2, rescale_factor: 1 / 255, size: { width: 1024, height: 1024 },
          },
        }),
      ]);
      bg = { tf, model, processor };
      flag("bg", true);
      return bg;
    })().catch((err) => { bgLoading = null; throw err; });
    return bgLoading;
  }

  // Alpha mask (0 cut … 255 keep) for the photo, at W×H.
  async function removeBackground(blob, W, H, onProgress) {
    const { tf, model, processor } = await loadBg(onProgress);
    const image = await tf.RawImage.fromBlob(blob);
    const { pixel_values } = await processor(image);
    const { output } = await model({ input: pixel_values });
    const [, , h, w] = output.dims;
    return upscale(output.data, w, h, W, H);
  }

  /* ── tap to select ── */
  let sam = null, samLoading = null;
  function loadSam(onProgress) {
    if (sam) return Promise.resolve(sam);
    samLoading ??= (async () => {
      const tf = await lib();
      const opts = { progress_callback: progress(onProgress) };
      const [model, processor] = await Promise.all([
        tf.SamModel.from_pretrained(SAM_MODEL, { ...opts, dtype: "q8" }),
        tf.AutoProcessor.from_pretrained(SAM_MODEL, opts),
      ]);
      sam = { tf, model, processor };
      flag("sam", true);
      return sam;
    })().catch((err) => { samLoading = null; throw err; });
    return samLoading;
  }

  // Look at a photo once (the slow part, a second or two); then each tap is quick.
  async function prepareSelect(blob, onProgress) {
    const { tf, model, processor } = await loadSam(onProgress);
    const image = await tf.RawImage.fromBlob(blob);
    const inputs = await processor(image);
    const emb = await model.get_image_embeddings(inputs);
    return { inputs, emb, W: image.width, H: image.height };
  }

  // points: [{x, y, keep}] in photo pixels. Returns the best mask (0/255) at photo size.
  async function select(prep, points) {
    const { tf, model, processor } = await loadSam();
    const [rh, rw] = prep.inputs.reshaped_input_sizes[0];
    const pts = points.flatMap((p) => [(p.x / prep.W) * rw, (p.y / prep.H) * rh]);
    const input_points = new tf.Tensor("float32", pts, [1, 1, points.length, 2]);
    const input_labels = new tf.Tensor("int64", points.map((p) => BigInt(p.keep ? 1 : 0)), [1, 1, points.length]);
    const out = await model({ ...prep.emb, input_points, input_labels });
    const masks = await processor.post_process_masks(out.pred_masks, prep.inputs.original_sizes, prep.inputs.reshaped_input_sizes);
    const m = masks[0]; // [1, 3, H, W]: three guesses, pick the most confident
    const scores = out.iou_scores.data;
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    const [, , H, W] = m.dims;
    const data = m.data, off = best * W * H;
    const res = new Uint8ClampedArray(W * H);
    for (let i = 0; i < W * H; i++) res[i] = data[off + i] ? 255 : 0;
    return res;
  }

  return {
    SIZES, removeBackground, loadBg, loadSam, prepareSelect, select,
    bgReady: () => !!bg || flag("bg"), samReady: () => !!sam || flag("sam"),
  };
})();
