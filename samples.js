/* Sample closet: illustrated, already cut-out pieces so the app can be tried before
   photographing anything. Loaded from "Try a sample closet"; removable from the ⋯ menu. */

const Samples = (() => {
  const shade = `<linearGradient id="sh" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>`;
  const svg = (w, h, defs, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}"><defs>${shade}${defs}</defs>${body}</svg>`;
  // base color, optional pattern, soft shading, thin outline
  const fab = (d, base, pat, line) =>
    `<path d="${d}" fill="${base}"/>${pat ? `<path d="${d}" fill="url(#${pat})"/>` : ""}<path d="${d}" fill="url(#sh)"/><path d="${d}" fill="none" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"/>`;
  const mirror = (w, inner) => `<g>${inner}</g><g transform="translate(${w} 0) scale(-1 1)">${inner}</g>`;

  const P = {
    leopard: `<pattern id="leo" width="34" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <g fill="#8a5524" stroke="#2b1a0d" stroke-width="3" stroke-dasharray="9 4">
        <ellipse cx="8" cy="8" rx="5" ry="4"/><ellipse cx="25" cy="18" rx="6" ry="4.5"/><ellipse cx="12" cy="25" rx="3.5" ry="3"/></g>
      <circle cx="27" cy="5" r="2" fill="#2b1a0d"/></pattern>`,
    tartan: `<pattern id="tar" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect x="0" y="12" width="40" height="12" fill="#1f3b2d" opacity=".55"/><rect x="12" y="0" width="12" height="40" fill="#1f3b2d" opacity=".45"/>
      <rect x="0" y="30" width="40" height="2" fill="#e1a730" opacity=".8"/><rect x="30" y="0" width="2" height="40" fill="#e1a730" opacity=".7"/>
      <rect x="0" y="4" width="40" height="3" fill="#15172b" opacity=".35"/></pattern>`,
    stripes: `<pattern id="str" width="10" height="16" patternUnits="userSpaceOnUse"><rect width="10" height="7" fill="#24345c"/></pattern>`,
    dots: `<pattern id="dot" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2.6" fill="#fbf6ee"/><circle cx="14" cy="14" r="2.6" fill="#fbf6ee"/></pattern>`,
    cherries: `<pattern id="chr" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M8 6 Q10 12 7 16 M8 6 Q12 10 14 15" stroke="#4f6b2f" stroke-width="1" fill="none"/>
      <circle cx="7" cy="17" r="2.6" fill="#b5162a"/><circle cx="14" cy="16" r="2.6" fill="#b5162a"/></pattern>`,
    weave: `<pattern id="wv" width="12" height="12" patternUnits="userSpaceOnUse">
      <path d="M0 3 H12 M0 9 H12" stroke="#a9853f" stroke-width="2"/><path d="M3 0 V6 M9 6 V12" stroke="#8a6a2e" stroke-width="2.4"/></pattern>`,
    denim: `<pattern id="dnm" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="2" height="6" fill="#ffffff" opacity=".08"/></pattern>`,
    tort: `<pattern id="trt" width="30" height="24" patternUnits="userSpaceOnUse">
      <ellipse cx="8" cy="8" rx="7" ry="4" fill="#2a1408" opacity=".7"/><ellipse cx="22" cy="17" rx="6" ry="5" fill="#d08a3a" opacity=".6"/>
      <ellipse cx="24" cy="4" rx="3" ry="2" fill="#2a1408" opacity=".6"/></pattern>`,
  };

  // Long coat, left half (center gap = open front, already cut out).
  const coatHalf = (len) => `M92 18 L44 34 Q30 40 26 60 L8 ${len * 0.66} L32 ${len * 0.68} L52 104 L48 ${len} L104 ${len} L102 128 L80 62 Z`;
  const tee = "M70 14 Q100 30 130 14 L178 40 L196 92 L162 104 L150 80 L150 206 L50 206 L50 80 L38 104 L4 92 L22 40 Z";
  const longSleeve = "M80 18 Q110 34 140 18 L182 34 Q196 40 200 60 L216 196 L190 200 L170 84 L168 214 L52 214 L50 84 L30 200 L4 196 L20 60 Q24 40 38 34 Z";

  const pearls = (() => {
    let s = "";
    for (let i = 0; i <= 26; i++) {
      const t = (i / 26) * Math.PI;
      const x = 100 - 78 * Math.cos(t), y = 30 + 130 * Math.sin(t) ** 1.25;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="url(#prl)" stroke="#c9bba3" stroke-width=".8"/>`;
    }
    return s;
  })();

  const ITEMS = [
    { name: "leopard faux-fur coat", size: 38, category: "Outerwear", color: "tan", tags: ["vintage", "statement", "winter"], w: 220, h: 310,
      svg: svg(220, 310, P.leopard, mirror(220, fab(coatHalf(300), "#c98a3d", "leo", "#6b4320") +
        `<path d="M92 18 L80 62 L102 128 L96 70 Z" fill="#a8702f" stroke="#6b4320" stroke-width="1.4"/>`)) },
    { name: "camel belted trench", size: 40, category: "Outerwear", color: "tan", tags: ["classic", "spring", "work"], w: 220, h: 300,
      svg: svg(220, 300, "", mirror(220, fab(coatHalf(290), "#c8a06a", "", "#86663a") +
        `<path d="M92 18 L78 66 L102 128 L96 70Z" fill="#b48b55" stroke="#86663a" stroke-width="1.4"/>
         <rect x="50" y="150" width="54" height="13" fill="#a98450" stroke="#86663a" stroke-width="1.2"/>
         <circle cx="90" cy="96" r="3.2" fill="#4a3720"/><circle cx="92" cy="122" r="3.2" fill="#4a3720"/>
         <circle cx="94" cy="186" r="3.2" fill="#4a3720"/><circle cx="94" cy="214" r="3.2" fill="#4a3720"/>
         <path d="M26 60 L40 64" stroke="#86663a" stroke-width="2"/>`)) },
    { name: "cropped vintage denim jacket", size: 21, category: "Outerwear", color: "denim", tags: ["casual", "90s", "layering"], w: 220, h: 200,
      svg: svg(220, 200, P.denim, mirror(220, fab("M92 16 L44 30 Q30 36 26 56 L10 186 L36 188 L52 96 L50 178 L104 178 L104 112 L80 58 Z", "#5a7593", "dnm", "#33475e") +
        `<path d="M92 16 L76 58 L100 100 L94 60Z" fill="#4c6680" stroke="#33475e" stroke-width="1.2"/>
         <rect x="58" y="92" width="30" height="24" rx="3" fill="none" stroke="#d69a4a" stroke-width="1.4" stroke-dasharray="3 2"/>
         <path d="M52 140 H104" stroke="#d69a4a" stroke-width="1.4" stroke-dasharray="3 2"/><circle cx="96" cy="128" r="2.6" fill="#c9a646"/><circle cx="96" cy="158" r="2.6" fill="#c9a646"/>`)) },

    { name: "cream silk pussy-bow blouse", size: 25, category: "Tops", color: "cream", tags: ["silk", "work", "date night"], w: 220, h: 230,
      svg: svg(220, 230, "", fab(longSleeve, "#f1e6cf", "", "#b9a786") +
        `<path d="M110 30 Q86 24 82 44 Q96 50 110 36 Q124 50 138 44 Q134 24 110 30Z" fill="#e8d9bb" stroke="#b9a786" stroke-width="1.2"/>
         <path d="M106 38 L96 92 L104 94 L110 44 L116 94 L124 92 L114 38Z" fill="#e8d9bb" stroke="#b9a786" stroke-width="1.2"/>
         <circle cx="110" cy="37" r="5" fill="#e3d2b0" stroke="#b9a786"/>`) },
    { name: "black ribbed turtleneck", size: 24, category: "Tops", color: "black", tags: ["basics", "layering", "fall"], w: 220, h: 230,
      svg: svg(220, 230, "", fab(longSleeve, "#1f1b1a", "", "#000") +
        `<path d="M86 4 L134 4 L138 26 Q110 34 82 26Z" fill="#2a2524" stroke="#000" stroke-width="1.2"/>
         <path d="M88 12 H132 M86 19 H134" stroke="#3a3433" stroke-width="1.2"/>
         <path d="M70 60 V210 M90 50 V210 M110 50 V210 M130 50 V210 M150 60 V210" stroke="#2c2726" stroke-width="1"/>`) },
    { name: "breton striped tee", size: 25, category: "Tops", color: "navy", tags: ["french girl", "casual", "summer"], w: 200, h: 220,
      svg: svg(200, 220, P.stripes, fab(tee, "#f6f1e8", "str", "#1d2a4a") + `<path d="M70 14 Q100 30 130 14" fill="none" stroke="#24345c" stroke-width="4"/>`) },
    { name: "cherry print cami", size: 21, category: "Tops", color: "cream", tags: ["retro", "summer", "brunch"], w: 200, h: 200,
      svg: svg(200, 200, P.cherries, fab("M58 64 Q100 80 142 64 Q150 120 154 194 L46 194 Q50 120 58 64Z", "#f5ead6", "chr", "#bfa98a") +
        `<path d="M62 66 L70 10 M138 66 L130 10" stroke="#bfa98a" stroke-width="2.4"/>`) },

    { name: "chocolate wide-leg trousers", size: 42, category: "Bottoms", color: "brown", tags: ["high waist", "70s", "work"], w: 200, h: 300,
      svg: svg(200, 300, "", fab("M46 10 L154 10 L158 42 L194 292 L114 294 L100 96 L86 294 L6 292 L42 42 Z", "#5b3a29", "", "#2f1d13") +
        `<path d="M44 10 H156 L157 30 H43Z" fill="#4e3123" stroke="#2f1d13" stroke-width="1.2"/>
         <path d="M70 30 L58 290 M130 30 L142 290 M100 30 V90" stroke="#3f281c" stroke-width="1.2"/><circle cx="100" cy="20" r="3" fill="#c9a646"/>`) },
    { name: "plaid pleated midi skirt", size: 30, category: "Bottoms", color: "red", tags: ["preppy", "fall", "vintage"], w: 200, h: 220,
      svg: svg(200, 220, P.tartan, fab("M58 10 L142 10 L144 32 L192 212 L8 212 L56 32 Z", "#6b1d2a", "tar", "#3a0f17") +
        `<path d="M58 10 H142 L143 30 H57Z" fill="#561722" stroke="#3a0f17" stroke-width="1.2"/>
         <path d="M70 32 L40 210 M84 32 L72 210 M100 32 V210 M116 32 L128 210 M130 32 L160 210" stroke="#3a0f17" stroke-width="1.1" opacity=".7"/>`) },
    { name: "straight-leg vintage jeans", size: 41, category: "Bottoms", color: "denim", tags: ["levi's", "everyday", "casual"], w: 200, h: 300,
      svg: svg(200, 300, P.denim, fab("M50 10 L150 10 L158 52 L166 294 L110 294 L100 98 L90 294 L34 294 L42 52 Z", "#4d6d93", "dnm", "#2c4260") +
        `<path d="M50 10 H150 L151 28 H49Z" fill="#43618a" stroke="#2c4260" stroke-width="1.2"/>
         <path d="M56 30 Q66 60 92 56 M144 30 Q134 60 108 56 M100 30 V96" fill="none" stroke="#d69a4a" stroke-width="1.3" stroke-dasharray="3 2"/>
         <circle cx="100" cy="19" r="3.4" fill="#b08d3c"/>`) },

    { name: "burgundy satin slip dress", size: 44, category: "Dresses", color: "red", tags: ["satin", "date night", "jazz club"], w: 180, h: 320,
      svg: svg(180, 320, `<linearGradient id="sat" x1="0" x2="1"><stop offset="0" stop-color="#4a0f1f"/><stop offset=".3" stop-color="#8a1f3a"/>
        <stop offset=".42" stop-color="#c24a66"/><stop offset=".55" stop-color="#7d1a33"/><stop offset=".8" stop-color="#9c2944"/><stop offset="1" stop-color="#4a0f1f"/></linearGradient>`,
        fab("M50 70 Q90 92 130 70 Q138 120 128 160 Q150 240 168 314 L12 314 Q30 240 52 160 Q42 120 50 70Z", "url(#sat)", "", "#3a0b18") +
        `<path d="M54 72 L64 8 M126 72 L116 8" stroke="#5e1426" stroke-width="2"/>`) },
    { name: "polka-dot wrap dress", size: 45, category: "Dresses", color: "navy", tags: ["retro", "brunch", "summer"], w: 220, h: 330,
      svg: svg(220, 330, P.dots, fab("M84 14 L110 64 L136 14 L176 32 L204 80 L178 96 L160 76 L152 132 Q176 220 198 322 L22 322 Q44 220 68 132 L60 76 L42 96 L16 80 L44 32 Z", "#24345c", "dot", "#121b33") +
        `<path d="M84 14 L110 64 L136 14" fill="none" stroke="#121b33" stroke-width="2"/>
         <path d="M66 128 Q110 140 154 128 L154 140 Q110 152 66 140Z" fill="#1b2747"/><path d="M140 136 L168 196 L158 198 L136 142Z" fill="#1b2747"/>`) },

    { name: "black patent mary janes", size: 9.5, category: "Shoes", color: "black", tags: ["heels", "jazz club", "vintage"], w: 220, h: 150,
      svg: svg(220, 150, "", ["#151213", "#221d1e"].reverse().map((c, i) => `<g transform="translate(${i ? 0 : 62} ${i ? 18 : 0})">
        ${fab("M10 100 Q12 84 34 80 Q60 76 84 70 Q110 62 130 44 L140 46 L142 100 Q120 104 100 110 L16 112 Q8 108 10 100Z", c, "", "#000")}
        <path d="M128 100 L142 100 L140 136 L133 136Z" fill="${c}" stroke="#000"/><path d="M66 74 Q82 98 104 64" fill="none" stroke="${c}" stroke-width="5"/>
        <path d="M30 86 Q60 80 90 80" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none"/><circle cx="104" cy="66" r="2.5" fill="#c9a646"/></g>`).join("")) },
    { name: "cherry-red penny loafers", size: 10, category: "Shoes", color: "red", tags: ["preppy", "everyday", "70s"], w: 220, h: 130,
      svg: svg(220, 130, "", [0, 1].map((i) => `<g transform="translate(${i ? 0 : 14} ${i ? 14 : 0})">
        ${fab("M8 92 Q10 66 40 60 L120 54 Q150 52 176 66 Q200 78 200 96 L196 104 L12 104 Q6 100 8 92Z", i ? "#9e1620" : "#8a121b", "", "#4a070c")}
        <path d="M12 104 L196 104 L194 112 L14 112Z" fill="#3a2418"/><path d="M118 58 Q140 60 156 72 L150 82 Q132 72 114 70Z" fill="#6e0d15"/>
        <rect x="128" y="66" width="12" height="5" rx="2" fill="#2b0508"/></g>`).join("")) },

    { name: "chunky gold hoops", size: 4.5, category: "Jewelry", color: "gold", tags: ["everyday", "statement"], w: 180, h: 110,
      svg: svg(180, 110, `<linearGradient id="gld" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6dc84"/><stop offset=".5" stop-color="#c9a646"/><stop offset="1" stop-color="#8a6a1e"/></linearGradient>`,
        `<circle cx="48" cy="58" r="38" fill="none" stroke="url(#gld)" stroke-width="10"/><circle cx="132" cy="58" r="38" fill="none" stroke="url(#gld)" stroke-width="10"/>`) },
    { name: "pearl strand necklace", size: 8, category: "Jewelry", color: "white", tags: ["classic", "jazz club", "grandma chic"], w: 200, h: 200,
      svg: svg(200, 200, `<radialGradient id="prl" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#efe6d6"/><stop offset="1" stop-color="#cfc2aa"/></radialGradient>`, pearls) },
    { name: "red wool beret", size: 11, category: "Accessories", color: "red", tags: ["french girl", "fall", "parisian"], w: 200, h: 130,
      svg: svg(200, 130, "", fab("M14 82 Q8 30 100 22 Q192 30 186 82 Q170 106 100 106 Q30 106 14 82Z", "#b3262e", "", "#6e1218") +
        `<path d="M40 94 Q100 112 160 94" fill="none" stroke="#7d161d" stroke-width="5"/><path d="M98 22 L100 8 L104 22" fill="#8a1a22" stroke="#6e1218"/>`) },
    { name: "tortoiseshell cat-eye sunglasses", size: 6, category: "Accessories", color: "brown", tags: ["retro", "summer", "old hollywood"], w: 240, h: 100,
      svg: svg(240, 100, P.tort + `<linearGradient id="lns" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2a22"/><stop offset="1" stop-color="#120c0a"/></linearGradient>`,
        mirror(240, fab("M12 30 Q8 12 34 16 L98 24 Q112 28 108 48 Q102 78 66 80 Q28 80 16 54 Q10 42 12 30Z", "#8a4b1e", "trt", "#2a1408") +
          `<path d="M24 34 Q22 24 38 26 L94 32 Q100 36 98 48 Q92 70 66 70 Q36 70 28 52Z" fill="url(#lns)"/><path d="M40 34 L60 37" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>
           <path d="M104 36 Q120 28 136 36" stroke="#8a4b1e" stroke-width="6" fill="none"/>`)) },

    { name: "cognac top-handle bag", size: 10, category: "Bags", color: "brown", tags: ["leather", "work", "vintage"], w: 200, h: 190,
      svg: svg(200, 190, "", `<path d="M64 84 Q62 18 100 18 Q138 18 136 84" fill="none" stroke="#7a4220" stroke-width="10"/>` +
        fab("M30 80 L170 80 L184 178 Q184 184 178 184 L22 184 Q16 184 16 178 Z", "#a85a2a", "", "#5a2c10") +
        fab("M30 80 L170 80 L166 124 Q100 140 34 124Z", "#954d22", "", "#5a2c10") + `<rect x="92" y="122" width="16" height="14" rx="3" fill="#d8b85a" stroke="#8a6a1e"/>`) },
    { name: "woven straw basket bag", size: 13, category: "Bags", color: "tan", tags: ["summer", "vacation", "farmers market"], w: 200, h: 200,
      svg: svg(200, 200, P.weave, `<path d="M54 78 Q56 14 100 14 Q144 14 146 78" fill="none" stroke="#5e3a1c" stroke-width="8"/>` +
        fab("M26 72 L174 72 L160 190 L40 190 Z", "#d7b56d", "wv", "#8a6a2e") + `<path d="M26 72 H174 L172 86 H28Z" fill="#c29d56" stroke="#8a6a2e"/>`) },
  ];

  // Saved looks that show off layering (pieces by name).
  const LOOKS = [
    { name: "Jazz club, Friday", vibe: "Going out", pieces: ["burgundy satin slip dress", "leopard faux-fur coat", "black patent mary janes", "pearl strand necklace", "chunky gold hoops"] },
    { name: "Left Bank Sunday", vibe: "Brunch", pieces: ["straight-leg vintage jeans", "breton striped tee", "camel belted trench", "red wool beret", "cherry-red penny loafers", "woven straw basket bag"] },
    { name: "Office, but make it 1962", vibe: "Work", tuck: true, pieces: ["plaid pleated midi skirt", "cream silk pussy-bow blouse", "cropped vintage denim jacket", "tortoiseshell cat-eye sunglasses", "cognac top-handle bag", "cherry-red penny loafers"] },
  ];


  // Rasterize to WebP/PNG so samples behave exactly like real cutout photos.
  async function rasterize(svgText, w, h) {
    const blob = new Blob([svgText], { type: "image/svg+xml" });
    try {
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement("canvas");
      c.width = w * 2; c.height = h * 2;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const out = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
      return out || blob;
    } catch {
      return blob;
    }
  }

  async function build(uid) {
    const now = Date.now();
    const items = await Promise.all(ITEMS.map(async (s, n) => {
      const image = await rasterize(s.svg, s.w, s.h);
      return { id: uid(), name: s.name, size: s.size, category: s.category, color: s.color, tags: s.tags, image, original: image,
        cut: { x: 0, y: 0, w: s.w * 2, h: s.h * 2 }, ratio: s.w / s.h, fav: n % 5 === 0, sample: true, createdAt: now - n * 1000 };
    }));
    const byName = Object.fromEntries(items.map((i) => [i.name, i.id]));
    const outfits = LOOKS.map((l, n) => ({ id: uid(), name: l.name, vibe: l.vibe, sample: true, createdAt: now - n * 1000,
      pieces: l.pieces.map((nm) => ({ itemId: byName[nm], dx: 0, dy: 0, tuck: !!l.tuck })) }));
    return { items, outfits };
  }

  return { build };
})();
