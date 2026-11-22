/* Type Orbit — a letter atlas.
   The phrase is set as readable, wrapped lines. Every glyph is a star with its
   own orbit and moon; letters of one word are joined by a dashed constellation line. */

(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
  const MAX_CHARS = 110;

  const PALETTES = {
    nebula: { name: "Nebula", bg: "#07070b", bg2: "#0d0a18", ink: "#e9e4d8", accent: "#a78bfa", haze: "#3c2a66", core: "#ffffff" },
    solar:  { name: "Solar",  bg: "#0a0705", bg2: "#171009", ink: "#f2e8d8", accent: "#f0a45c", haze: "#5c3517", core: "#fff7e8" },
    tide:   { name: "Tide",   bg: "#04090b", bg2: "#071619", ink: "#dfeae8", accent: "#5fd3c4", haze: "#0f4a4c", core: "#eafffb" },
    bone:   { name: "Bone",   bg: "#efe9dd", bg2: "#e1d9c9", ink: "#1b1815", accent: "#a4392f", haze: "#cbbfa7", core: "#3a2a23", light: true },
    signal: { name: "Signal", bg: "#060a05", bg2: "#0c1407", ink: "#e9edd8", accent: "#c6f24e", haze: "#3a5418", core: "#f6ffd8" },
    ember:  { name: "Ember",  bg: "#0a0505", bg2: "#190a07", ink: "#f2e2d8", accent: "#ff6b45", haze: "#5c2012", core: "#ffeadf" },
  };

  const FILTERS = {
    none: { name: "None", css: "none" },
    mono: { name: "Black & white", css: "grayscale(1)" },
    noir: { name: "Noir", css: "grayscale(1) contrast(1.35) brightness(0.92)" },
    sepia: { name: "Sepia", css: "sepia(0.85) contrast(1.06) saturate(1.25)" },
    invert: { name: "Invert", css: "invert(1)" },
    cyan: { name: "Cyanotype", css: "hue-rotate(155deg) saturate(1.35) contrast(1.08)" },
  };

  const state = {
    paletteKey: "nebula",
    custom: null,
    filter: "none",
    orbits: 1,
    seed: 4187,
    text: "",
    births: [],
    plate: false,
    t: 0,
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── helpers ─────────────────────────────────────────── */

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function hexToRgb(hex) {
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const p = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return `#${p(r)}${p(g)}${p(b)}`;
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
  }

  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  function customPalette(base, bg, ink) {
    const light = luminance(bg) > 0.45;
    const accent = mixHex(base.accent, ink, 0.45);
    return {
      name: "Custom",
      bg,
      bg2: mixHex(bg, ink, 0.09),
      ink,
      accent,
      haze: mixHex(bg, ink, light ? 0.18 : 0.24),
      core: ink,
      light,
    };
  }

  const palCache = { key: "", value: null };

  function currentPal() {
    if (!state.custom) return PALETTES[state.paletteKey];
    const key = `${state.paletteKey}|${state.custom.bg}|${state.custom.ink}`;
    if (palCache.key !== key) {
      palCache.key = key;
      palCache.value = customPalette(PALETTES[state.paletteKey], state.custom.bg, state.custom.ink);
    }
    return palCache.value;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function sectorLine(seed) {
    const deg = (seed * 37) % 360;
    const min = (seed * 13) % 60;
    return `${deg < 180 ? "N" : "S"} ${String(deg).padStart(3, "0")}° ${String(min).padStart(2, "0")}′`;
  }

  function today() {
    return new Date()
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .toUpperCase();
  }

  /* ── elements ────────────────────────────────────────── */

  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  const typer = document.getElementById("typer");
  const els = {
    letters: document.getElementById("stat-letters"),
    words: document.getElementById("stat-words"),
    sector: document.getElementById("stat-sector"),
    seed: document.getElementById("stat-seed"),
    palettes: document.getElementById("palettes"),
    chart: document.getElementById("mode-chart"),
    plate: document.getElementById("mode-plate"),
    save: document.getElementById("save"),
    newSky: document.getElementById("new-sky"),
    bgPick: document.getElementById("pick-bg"),
    inkPick: document.getElementById("pick-ink"),
    filter: document.getElementById("filter"),
    orbits: document.getElementById("orbits"),
  };

  let W = 0;
  let H = 0;
  let dpr = 1;

  /* ── sky field ───────────────────────────────────────── */

  let dust = [];
  let haze = [];
  const bgCache = document.createElement("canvas");
  let bgKey = "";

  function buildSky() {
    const rng = mulberry32(state.seed);
    dust = Array.from({ length: 240 }, () => ({
      x: rng(),
      y: rng(),
      r: 0.35 + rng() * 1.1,
      a: 0.08 + rng() * 0.38,
      ph: rng() * TAU,
    }));
    haze = Array.from({ length: 3 }, () => ({
      x: 0.16 + rng() * 0.68,
      y: 0.12 + rng() * 0.62,
      r: 0.36 + rng() * 0.34,
      a: 0.24 + rng() * 0.26,
    }));
    bgKey = "";
  }

  function ensureBackground(w, h) {
    const pal = currentPal();
    const s = clamp(Math.min(w, h) / 860, 0.62, 1.7);
    const customKey = state.custom ? `${state.custom.bg}${state.custom.ink}` : "";
    const key = `${Math.round(w)}x${Math.round(h)}|${state.seed}|${state.paletteKey}|${customKey}|${dpr}`;
    if (key === bgKey) return;
    bgKey = key;

    bgCache.width = Math.max(1, Math.round(w * dpr));
    bgCache.height = Math.max(1, Math.round(h * dpr));
    const c = bgCache.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const base = c.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, pal.bg2);
    base.addColorStop(0.55, pal.bg);
    base.addColorStop(1, pal.bg2);
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);

    for (const blob of haze) {
      const hx = blob.x * w;
      const hy = blob.y * h;
      const rad = Math.max(w, h) * blob.r;
      const g = c.createRadialGradient(hx, hy, 0, hx, hy, rad);
      g.addColorStop(0, hexA(pal.haze, blob.a));
      g.addColorStop(0.55, hexA(pal.haze, blob.a * 0.3));
      g.addColorStop(1, hexA(pal.haze, 0));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }

    const step = 118 * s;
    c.strokeStyle = hexA(pal.ink, 0.03);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = w / 2 - Math.floor(w / 2 / step) * step; x < w; x += step) {
      c.moveTo(Math.round(x) + 0.5, 0);
      c.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = h / 2 - Math.floor(h / 2 / step) * step; y < h; y += step) {
      c.moveTo(0, Math.round(y) + 0.5);
      c.lineTo(w, Math.round(y) + 0.5);
    }
    c.stroke();

    const vig = c.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.2, w * 0.5, h * 0.46, Math.max(w, h) * 0.85);
    vig.addColorStop(0, hexA(pal.bg, 0));
    vig.addColorStop(1, hexA(pal.bg, 0.7));
    c.fillStyle = vig;
    c.fillRect(0, 0, w, h);
  }

  /* ── typographic layout ──────────────────────────────── */

  let layoutCache = { key: "", value: null };

  function buildLayout(text, w, h, seed) {
    const key = `${text}\u0000${Math.round(w)}\u0000${Math.round(h)}\u0000${seed}`;
    if (layoutCache.key === key) return layoutCache.value;
    layoutCache.key = key;

    // words, with their indices in the original string
    const tokens = [];
    let bucket = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") {
        if (bucket.length) {
          tokens.push(bucket);
          bucket = [];
        }
      } else {
        bucket.push({ ch, i });
      }
    }
    if (bucket.length) tokens.push(bucket);
    if (!tokens.length) {
      layoutCache.value = null;
      return null;
    }

    const cx = w * 0.5;
    const cy = h * 0.46;
    const availW = Math.min(w * 0.82, 1060);
    const availH = h * 0.56;

    let best = null;
    const start = Math.min(availW * 0.24, availH * 0.44, 158);

    for (let size = start; size >= 12; size -= 1) {
      ctx.font = `400 ${size}px ${SERIF}`;
      const spaceW = ctx.measureText(" ").width;
      const lines = [];
      let line = [];
      let lineW = 0;

      for (const token of tokens) {
        const tokenW = ctx.measureText(token.map((t) => t.ch).join("")).width;
        if (line.length && lineW + spaceW + tokenW > availW) {
          lines.push(line);
          line = [];
          lineW = 0;
        }
        if (line.length) {
          line.push({ ch: " ", i: -1 });
          lineW += spaceW;
        }
        line.push(...token);
        lineW += tokenW;
      }
      lines.push(line);

      const lineH = size * 1.62;
      const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l.map((c) => c.ch).join("")).width));
      best = { size, lines, lineH };
      if (lines.length * lineH <= availH && maxLineW <= availW) break;
    }

    const { size, lines, lineH } = best;
    ctx.font = `400 ${size}px ${SERIF}`;
    const totalH = lines.length * lineH;
    const firstCenter = cy - totalH / 2 + lineH / 2;

    const letters = [];
    const lineInfo = [];

    lines.forEach((line, li) => {
      const str = line.map((l) => l.ch).join("");
      const width = ctx.measureText(str).width;
      const x0 = cx - width / 2;
      const baseY = firstCenter + li * lineH;
      let prefix = "";
      let word = -1;
      let afterSpace = true;

      for (const item of line) {
        if (item.ch === " ") {
          prefix += " ";
          word = -1;
          afterSpace = true;
          continue;
        }
        if (afterSpace) {
          word += 1;
          afterSpace = false;
        }
        const adv = ctx.measureText(item.ch).width;
        const centerX = x0 + ctx.measureText(prefix + item.ch).width - adv / 2;
        const wobble = Math.sin(item.i * 0.9 + seed * 0.011) * size * 0.05;
        letters.push({
          ch: item.ch,
          x: centerX,
          y: baseY - size * 0.3 + wobble,
          size,
          line: li,
          word,
          idx: item.i,
        });
        prefix += item.ch;
      }

      lineInfo.push({ x0, width, y: baseY });
    });

    layoutCache.value = { size, letters, lineInfo, lineH };
    return layoutCache.value;
  }

  /* ── drawing ─────────────────────────────────────────── */

  function drawGlyph(c, letter, t, pal, s, alpha) {
    const size = letter.size;
    const phase = hash2(state.seed, letter.idx) * TAU;
    const tw = 0.82 + 0.18 * Math.sin(t * 1.2 + phase);
    const y = letter.y;
    const glow = pal.light ? 0.5 : 1;

    const halo = c.createRadialGradient(letter.x, y, 0, letter.x, y, size * 0.95);
    halo.addColorStop(0, hexA(pal.accent, 0.17 * glow * alpha * tw));
    halo.addColorStop(0.55, hexA(pal.accent, 0.05 * glow * alpha));
    halo.addColorStop(1, hexA(pal.accent, 0));
    c.fillStyle = halo;
    c.beginPath();
    c.arc(letter.x, y, size * 0.95, 0, TAU);
    c.fill();

    c.save();
    c.globalAlpha = alpha;
    c.font = `400 ${size}px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = pal.ink;
    c.fillText(letter.ch, letter.x, y);
    c.restore();
  }

  /* Orbits are counted for the whole chart: the field below sets exactly how
     many rings appear, spread across the letters. Each tilt is fully random. */
  let orbitsCache = { key: "", value: [] };

  function buildOrbits(layout) {
    const total = clamp(Math.floor(state.orbits), 0, 200);
    if (!layout || !layout.letters.length || total <= 0) return [];
    const key = `${layoutCache.key}|${state.seed}|${total}`;
    if (orbitsCache.key === key) return orbitsCache.value;
    orbitsCache.key = key;

    const letters = layout.letters;
    const order = letters
      .map((_, i) => i)
      .sort((a, b) => hash2(state.seed + 21, a) - hash2(state.seed + 21, b));

    const rings = [];
    for (let k = 0; k < total; k++) {
      const li = order[k % order.length];
      const letter = letters[li];
      const scale = 0.72 + hash2(state.seed + 7, k) * 0.42;
      rings.push({
        x: letter.x,
        y: letter.y,
        rx: letter.size * scale,
        ry: letter.size * scale * 0.38,
        tilt: hash2(state.seed + 5 + k * 131, li) * TAU,
        phase: hash2(state.seed + 3, k) * TAU,
        idx: letter.idx,
        size: letter.size,
      });
    }
    orbitsCache.value = rings;
    return rings;
  }

  function drawOrbit(c, ring, t, pal, s) {
    const born = state.births[ring.idx];
    const age = born == null ? 1 : clamp((t - born) / 0.7, 0, 1);
    const alpha = 1 - Math.pow(1 - age, 3);

    c.save();
    c.translate(ring.x, ring.y);
    c.rotate(ring.tilt);
    c.strokeStyle = hexA(pal.accent, 0.26 * alpha);
    c.lineWidth = Math.max(0.6, 0.7 * s);
    c.beginPath();
    c.ellipse(0, 0, ring.rx, ring.ry, 0, 0, TAU);
    c.stroke();

    const ang = t * 0.5 + ring.phase;
    c.fillStyle = hexA(pal.accent, 0.9 * alpha);
    c.beginPath();
    c.arc(Math.cos(ang) * ring.rx, Math.sin(ang) * ring.ry, Math.max(0.9, ring.size * 0.032), 0, TAU);
    c.fill();
    c.restore();
  }

  function drawOrigin(c, w, h, t) {
    const pal = currentPal();
    const s = clamp(Math.min(w, h) / 860, 0.62, 1.7);
    const pulse = 0.6 + 0.4 * Math.sin(t * 1.4);
    c.save();
    c.strokeStyle = hexA(pal.ink, 0.16 * pulse);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(w / 2 - 12 * s, h * 0.46);
    c.lineTo(w / 2 + 12 * s, h * 0.46);
    c.moveTo(w / 2, h * 0.46 - 12 * s);
    c.lineTo(w / 2, h * 0.46 + 12 * s);
    c.stroke();
    c.beginPath();
    c.arc(w / 2, h * 0.46, 4 * s, 0, TAU);
    c.stroke();
    c.font = `${8.5 * s}px ${MONO}`;
    c.fillStyle = hexA(pal.ink, 0.24);
    c.textAlign = "center";
    c.textBaseline = "alphabetic";
    c.fillText("ORIGIN", w / 2, h * 0.46 + 32 * s);
    c.restore();
  }

  function drawPlateCaption(c, w, h) {
    const pal = currentPal();
    const s = clamp(Math.min(w, h) / 900, 0.7, 1.6);
    const pad = 34 * s;

    c.save();
    c.strokeStyle = hexA(pal.ink, 0.15);
    c.lineWidth = 1;
    c.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

    c.textAlign = "left";
    c.textBaseline = "alphabetic";
    c.letterSpacing = "2px";
    c.fillStyle = hexA(pal.ink, 0.86);
    c.font = `600 ${11.5 * s}px ${MONO}`;
    c.fillText("TYPE ORBIT", pad + 14 * s, h - pad - 34 * s);

    c.letterSpacing = "1.4px";
    c.fillStyle = hexA(pal.ink, 0.45);
    c.font = `${8.5 * s}px ${MONO}`;
    c.fillText(`LETTER ATLAS · ${today()}`, pad + 14 * s, h - pad - 17 * s);

    c.textAlign = "right";
    c.fillText(`${pal.name.toUpperCase()} · SEED ${state.seed}`, w - pad - 14 * s, h - pad - 17 * s);
    c.restore();
  }

  function drawScene(c, w, h, t, chrome) {
    const pal = currentPal();
    const s = clamp(Math.min(w, h) / 860, 0.62, 1.7);

    ensureBackground(w, h);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.drawImage(bgCache, 0, 0, w, h);

    for (const d of dust) {
      const a = d.a * (0.55 + 0.45 * Math.sin(t * 0.85 + d.ph));
      c.fillStyle = hexA(pal.ink, a * 0.5);
      c.beginPath();
      c.arc(d.x * w, d.y * h, d.r * s, 0, TAU);
      c.fill();
    }

    const layout = buildLayout(state.text, w, h, state.seed);

    if (!layout) {
      drawOrigin(c, w, h, t);
      if (!chrome) drawPlateCaption(c, w, h);
      return;
    }

    // ruled baselines + line index
    c.save();
    c.font = `${8.5 * s}px ${MONO}`;
    c.textAlign = "right";
    c.textBaseline = "alphabetic";
    for (let i = 0; i < layout.lineInfo.length; i++) {
      const info = layout.lineInfo[i];
      const y = info.y + layout.size * 0.24;
      c.strokeStyle = hexA(pal.ink, 0.12);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(info.x0 - 10 * s, Math.round(y) + 0.5);
      c.lineTo(info.x0 + info.width + 10 * s, Math.round(y) + 0.5);
      c.moveTo(info.x0 - 10 * s, y - 4 * s);
      c.lineTo(info.x0 - 10 * s, y + 4 * s);
      c.moveTo(info.x0 + info.width + 10 * s, y - 4 * s);
      c.lineTo(info.x0 + info.width + 10 * s, y + 4 * s);
      c.stroke();
      c.fillStyle = hexA(pal.ink, 0.3);
      c.fillText(String(i + 1).padStart(2, "0"), Math.max(26, info.x0 - 18 * s), y);
    }
    c.restore();

    // constellation lines inside each word
    c.setLineDash([2 * s, 6 * s]);
    c.lineWidth = Math.max(0.6, 0.7 * s);
    for (let i = 1; i < layout.letters.length; i++) {
      const a = layout.letters[i - 1];
      const b = layout.letters[i];
      if (a.line !== b.line || a.word !== b.word) continue;
      const born = state.births[b.idx];
      const age = born == null ? 1 : clamp((t - born) / 0.7, 0, 1);
      c.strokeStyle = hexA(pal.ink, 0.22 * age);
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    c.setLineDash([]);

    for (const ring of buildOrbits(layout)) {
      drawOrbit(c, ring, t, pal, s);
    }

    for (const letter of layout.letters) {
      const born = state.births[letter.idx];
      const age = born == null ? 1 : clamp((t - born) / 0.55, 0, 1);
      const alpha = 1 - Math.pow(1 - age, 3);
      drawGlyph(c, letter, t, pal, s, alpha);
    }

    if (!chrome) drawPlateCaption(c, w, h);
  }

  /* ── loop ────────────────────────────────────────────── */

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    bgKey = "";
    layoutCache.key = "";
  }

  function loop(now) {
    const t = reduceMotion ? 1.4 : now / 1000;
    state.t = t;
    drawScene(ctx, W, H, t, !state.plate);
    requestAnimationFrame(loop);
  }

  /* ── editing ─────────────────────────────────────────── */

  function sync() {
    const letters = state.text.replace(/\s/g, "").length;
    const words = state.text.trim() ? state.text.trim().split(/\s+/).length : 0;

    els.letters.textContent = String(letters).padStart(2, "0");
    els.words.textContent = String(words).padStart(2, "0");
    els.sector.textContent = sectorLine(state.seed);
    els.seed.textContent = String(state.seed);
  }

  function addChar(ch) {
    const limit = W < 620 ? 70 : MAX_CHARS;
    if (state.text.length >= limit) return;

    if (/\s/.test(ch)) {
      if (!state.text.length || state.text.endsWith(" ")) return;
      state.text += " ";
      state.births.push(state.t);
      sync();
      return;
    }
    state.text += ch;
    state.births.push(state.t);
    layoutCache.key = "";
    sync();
  }

  function pop() {
    if (!state.text.length) return;
    state.text = state.text.slice(0, -1);
    state.births.pop();
    layoutCache.key = "";
    sync();
  }

  function clearSky() {
    state.text = "";
    state.births = [];
    layoutCache.key = "";
    sync();
  }

  function applyTheme(pal) {
    const root = document.documentElement.style;
    root.setProperty("--bg", pal.bg);
    root.setProperty("--ink", pal.ink);
    root.setProperty("--accent", pal.accent);
    document.querySelector('meta[name="theme-color"]').setAttribute("content", pal.bg);
  }

  function syncSwatches() {
    for (const btn of els.palettes.querySelectorAll(".swatch")) {
      const on = !state.custom && btn.dataset.palette === state.paletteKey;
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  function setPalette(key) {
    if (!PALETTES[key]) return;
    state.paletteKey = key;
    state.custom = null;
    const pal = PALETTES[key];
    els.bgPick.value = pal.bg;
    els.inkPick.value = pal.ink;
    applyTheme(pal);
    syncSwatches();
    bgKey = "";
    sync();
  }

  function setCustomColors(bg, ink) {
    state.custom = { bg, ink };
    applyTheme(currentPal());
    syncSwatches();
    bgKey = "";
  }

  function readCustomColors() {
    setCustomColors(els.bgPick.value, els.inkPick.value);
  }

  function setFilter(key) {
    if (!FILTERS[key]) return;
    state.filter = key;
    canvas.style.filter = FILTERS[key].css;
    els.filter.value = key;
  }

  function setOrbits(n) {
    const value = clamp(Math.floor(Number(n) || 0), 0, 200);
    state.orbits = value;
    els.orbits.value = String(value);
  }

  function setPlate(on) {
    state.plate = on;
    document.body.classList.toggle("plate", on);
    els.chart.setAttribute("aria-pressed", String(!on));
    els.plate.setAttribute("aria-pressed", String(on));
  }

  function newSky() {
    state.seed = 1000 + Math.floor(Math.random() * 8999);
    buildSky();
    bgKey = "";
    layoutCache.key = "";
    orbitsCache.key = "";
    setOrbits(Math.floor(Math.random() * 13));
    sync();
  }

  function savePNG() {
    const scale = 2;
    const out = document.createElement("canvas");
    out.width = Math.round(W * scale);
    out.height = Math.round(H * scale);
    const buffer = document.createElement("canvas");
    buffer.width = out.width;
    buffer.height = out.height;

    const previous = dpr;
    dpr = scale;
    drawScene(buffer.getContext("2d"), W, H, state.t, false);
    dpr = previous;
    bgKey = "";

    const c = out.getContext("2d");
    if (state.filter !== "none") c.filter = FILTERS[state.filter].css;
    c.drawImage(buffer, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `type-orbit-${state.seed}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  }

  /* ── palette buttons ─────────────────────────────────── */

  for (const [key, pal] of Object.entries(PALETTES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.dataset.palette = key;
    btn.style.setProperty("--c", pal.accent);
    btn.setAttribute("aria-label", `${pal.name} palette`);
    btn.setAttribute("aria-pressed", "false");
    btn.title = pal.name;
    btn.addEventListener("click", () => setPalette(key));
    els.palettes.appendChild(btn);
  }

  /* ── input ───────────────────────────────────────────── */

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement && e.target !== typer) return;
    if (e.target instanceof HTMLSelectElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      pop();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      clearSky();
      return;
    }
    if (e.key === "Escape") {
      if (state.plate) setPlate(false);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      addChar(" ");
      return;
    }
    if (e.key.length === 1 && document.activeElement !== typer) addChar(e.key);
  });

  typer.addEventListener("input", () => {
    const value = typer.value;
    typer.value = "";
    for (const ch of value) addChar(ch);
  });

  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, select, textarea, label")) return;
    typer.focus({ preventScroll: true });
  });

  els.chart.addEventListener("click", () => setPlate(false));
  els.plate.addEventListener("click", () => setPlate(true));
  els.save.addEventListener("click", savePNG);
  els.newSky.addEventListener("click", newSky);
  els.bgPick.addEventListener("input", readCustomColors);
  els.inkPick.addEventListener("input", readCustomColors);
  els.filter.addEventListener("change", () => setFilter(els.filter.value));
  els.orbits.addEventListener("input", () => setOrbits(els.orbits.value));
  els.orbits.addEventListener("change", () => setOrbits(els.orbits.value));
  window.addEventListener("resize", resize);

  /* ── boot ────────────────────────────────────────────── */

  resize();
  buildSky();
  setPalette("nebula");
  setFilter("none");
  setOrbits(1);
  sync();

  const welcome = "type orbit";
  welcome.split("").forEach((ch, i) => {
    setTimeout(() => addChar(ch), reduceMotion ? 0 : 200 + i * 105);
  });

  requestAnimationFrame(loop);

  if (window.matchMedia("(pointer: fine)").matches) typer.focus({ preventScroll: true });
})();
