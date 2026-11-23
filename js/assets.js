'use strict';
/* Loads the CC0 "Streets of Fight" pack and builds recoloured / flash versions of each sheet. */

const IMG = {};
const SPR = {};   // SPR[sheet][pal][anim] -> canvas strip
const FLASH = {}; // FLASH[sheet][anim]   -> white silhouette strip
const PORTRAIT = {};

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('load ' + src));
    im.src = src;
  });
}

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }

function recolor(img, map, flash) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const keys = Object.keys(map || {});
  if (!keys.length && !flash) return c;
  const d = x.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  const lut = new Map();
  for (const k of keys) { const [r, g, b] = hexToRgb(k); lut.set((r << 16) | (g << 8) | b, hexToRgb(map[k])); }
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    if (flash) { p[i] = p[i + 1] = p[i + 2] = 255; continue; }
    const v = lut.get((p[i] << 16) | (p[i + 1] << 8) | p[i + 2]);
    if (v) { p[i] = v[0]; p[i + 1] = v[1]; p[i + 2] = v[2]; }
  }
  x.putImageData(d, 0, 0);
  return c;
}

const SHEET_PALS = { girl: ['p1', 'p2'], punk: ['punk', 'dash', 'brute', 'boss1', 'boss2', 'boss3'] };

async function loadAssets(onProgress) {
  const jobs = [];
  for (const [sk, sh] of Object.entries(SHEETS)) {
    for (const an of Object.keys(sh.anims)) {
      jobs.push(['s:' + sk + ':' + an, ASSET + sh.dir + an + '.png']);
    }
  }
  const L = ASSET + 'Stage Layers/';
  const extra = {
    tileset: L + 'tileset.png', back: L + 'back.png', fore: L + 'fore.png',
    barrel: L + 'props/barrel.png', car: L + 'props/car.png', hydrant: L + 'props/hydrant.png',
    sushi1: L + 'props/Sushi/sushi-1.png', sushi2: L + 'props/Sushi/sushi-2.png',
    banner1: L + 'props/banner-hor/banner-hor1.png', banner2: L + 'props/banner-hor/banner-hor2.png',
    eth1: L + 'props/Ethereum/ethereum-1.png', eth2: L + 'props/Ethereum/ethereum-2.png',
    shadow: ASSET + 'Sprites/shadow.png',
  };
  for (const [k, v] of Object.entries(extra)) jobs.push([k, v]);
  let done = 0;
  await Promise.all(jobs.map(async ([k, src]) => {
    IMG[k] = await loadImg(src);
    done++; onProgress && onProgress(done / jobs.length);
  }));

  for (const [sk, sh] of Object.entries(SHEETS)) {
    SPR[sk] = {}; FLASH[sk] = {};
    for (const pal of SHEET_PALS[sk]) {
      SPR[sk][pal] = {};
      for (const an of Object.keys(sh.anims)) SPR[sk][pal][an] = recolor(IMG['s:' + sk + ':' + an], PALS[pal]);
    }
    for (const an of Object.keys(sh.anims)) FLASH[sk][an] = recolor(IMG['s:' + sk + ':' + an], null, true);
  }
  // Head portraits for the HUD / super cut-in (from idle frame 0)
  for (const pal of SHEET_PALS.girl) PORTRAIT[pal] = cropCanvas(SPR.girl[pal].idle, 33, 16, 24, 22);
  for (const pal of SHEET_PALS.punk) PORTRAIT[pal] = cropCanvas(SPR.punk[pal].idle, 32, 12, 26, 22, true);
}

function cropCanvas(src, x, y, w, h, flip) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}
