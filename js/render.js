'use strict';
/* ============================================================
   Rendering: pixel world on a low-res canvas, crisp HUD on top.
   ============================================================ */

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const LO = document.createElement('canvas');
const lg = LO.getContext('2d');
let RW = VIEW_W;            // render width in world pixels (depends on screen shape)
let SC = 1, OX = 0, OY = 0; // display scale + offsets for the low-res image
const CROP = 32;            // rows of rooftop cut off the top so the fighters look bigger
const SH = VIEW_H - CROP;   // visible rows

const PARTS = [];           // particles (world space)
const TEXTS = [];           // floating numbers/labels (world space, drawn crisp)
const TRAILS = new Map();   // afterimages per entity id
const FXS = { shake: 0, flash: 0, flashCol: '#fff', banner: null, cutin: null, warn: 0, ko: 0, lightning: 0, nextBolt: 600 };
const HUDS = { lag: [0, 0], pop: [0, 0], lastHits: [0, 0] };
let STAGE_CACHE = null;
let RFRAME = 0;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  RW = clamp(Math.round(SH * (w / h)), VIEW_W, 520);
  LO.width = RW; LO.height = VIEW_H;
  SC = Math.min(cv.width / RW, cv.height / SH);
  OX = Math.round((cv.width - RW * SC) / 2);
  OY = Math.round((cv.height - SH * SC) / 2);
  lg.imageSmoothingEnabled = false;
}

/* ---------- stage art (pre-rendered per stage) ---------- */
function buildStage(si) {
  const S = STAGES[si];
  const r = seeded(S.seed);
  const pad = 320;
  const width = S.len + pad * 2;
  const c = document.createElement('canvas'); c.width = width; c.height = VIEW_H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const T = IMG.tileset;
  const put = (k, x) => { const t = TILES[k]; g.drawImage(T, t[0], t[1], t[2], t[3], x, k === 'rail' ? 16 : (k.startsWith('ground') ? 96 : 0), t[2], t[3]); return t[2]; };
  // ground
  let x = 0;
  while (x < width) x += put(r() < 0.18 ? 'groundS' : 'ground', x);
  // buildings
  const signs = [];
  const props = [];
  x = 0;
  const brickMid = ['brick', 'brickPipe', 'brickWin', 'brickDoor', 'brickWin', 'brick'];
  while (x < width) {
    const roll = r();
    if (roll < 0.28) {
      const k = r() < 0.5 ? 'shopA' : 'shopB';
      if (r() < 0.6) signs.push({ k: r() < 0.5 ? 'banner' : 'eth', x: x + 40 + Math.floor(r() * 100), y: 6 });
      x += put(k, x);
      if (r() < 0.5) x += put('pillarT', x);
    } else if (roll < 0.78) {
      x += put('brickL', x);
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        if (r() < 0.22) { x += put(['garageOpen', 'garage', 'graffiti'][Math.floor(r() * 3)], x); continue; }
        const k = brickMid[Math.floor(r() * brickMid.length)];
        if (k === 'brick' && r() < 0.35) signs.push({ k: 'sushi', x: x + 16, y: 22 });
        x += put(k, x);
      }
      x += put('brickP', x);
    } else {
      x += put('darkP', x);
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) x += put('rail', x);
      x += put('brickE', x);
    }
    if (r() < 0.35) props.push({ k: r() < 0.75 ? 'hydrant' : 'car', x: x - 40 - Math.floor(r() * 60) });
  }
  for (const p of props) {
    const im = IMG[p.k];
    g.drawImage(im, p.x, ZMIN - 2 - im.height + (p.k === 'car' ? 2 : 0));
  }
  const lamps = [], bushes = [];
  for (let lx = 150; lx < width * 1.25 + 400; lx += 360 + Math.floor(r() * 80)) lamps.push(lx);
  for (let bx = 420; bx < width * 1.25 + 400; bx += 520 + Math.floor(r() * 200)) bushes.push(bx);
  return { si, c, pad, signs, lamps, bushes };
}

/* ---------- item icons (tiny pixel art) ---------- */
const ICONS = {};
function pix(w, h, rows, pal) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
}
function buildIcons() {
  ICONS.pizza = pix(14, 12, [
    '..kkkkkkkkkk..', '.kyyyyyyyyyyk.', '.kyrryyyyrryk.', '..kyrryyyyrk..', '..kyyyyrryyk..', '...kyyyrryk...',
    '...kyyyyyyk...', '....kyrryk....', '....kyrrk.....', '.....kyyk.....', '.....kyk......', '......k.......'],
    { k: '#3a1a10', y: '#ffd23f', r: '#d8321c' });
  ICONS.burger = pix(14, 12, [
    '....kkkkkk....', '..kooooooook..', '.kowooowoooook', '.koooooooooook', 'kggggggggggggk', 'krrrrrrrrrrrrk',
    'kbbbbbbbbbbbbk', 'kyyyyyyyyyyyyk', '.kooooooooook.', '..kkkkkkkkkk..', '..............', '..............'],
    { k: '#2a140a', o: '#e09a3a', w: '#ffe9b0', g: '#4fc23a', r: '#c8281e', b: '#6a3416', y: '#ffd23f' });
  ICONS.soda = pix(9, 13, [
    '...kk....', '..kwwk...', '.kkkkkk..', '.krrrrk..', '.krwwrk..', '.krwwrk..', '.krrrrk..', '.krrrrk..',
    '.kwwwwk..', '.krrrrk..', '.krrrrk..', '.kkkkkk..', '.........'],
    { k: '#1e0a14', r: '#ff3d7f', w: '#ffffff' });
  ICONS.gem = pix(12, 11, [
    '...kkkkkk...', '..kcwccwck..', '.kcwccccwck.', 'kkkkkkkkkkkk', 'kcccwcccccck', '.kccwcccck..',
    '..kccccck...', '...kccck....', '....kck.....', '.....k......', '............'],
    { k: '#0a2a3a', c: '#34e6ff', w: '#ffffff' });
}

/* ---------- effects ---------- */
function addPart(p) { if (PARTS.length < 600) PARTS.push(p); }
function burst(x, y, z, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (opt.speed || 2.6) * (0.4 + Math.random());
    addPart({ type: opt.type || 'spark', x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opt.up || 1), life: 0, max: (opt.life || 16) + Math.random() * 8,
      col: opt.cols ? opt.cols[Math.floor(Math.random() * opt.cols.length)] : '#fff6c0', size: opt.size || 1 });
  }
}
function shake(n) { FXS.shake = Math.max(FXS.shake, n); }
function flash(a, col) { FXS.flash = Math.max(FXS.flash, a); FXS.flashCol = col || '#fff'; }
function floatText(x, y, z, txt, col, big) { TEXTS.push({ x, y, z, txt: String(txt), col: col || '#fff', t: 0, big: !!big }); if (TEXTS.length > 40) TEXTS.shift(); }

const HOT = ['#ffffff', '#fff6c0', '#ffd23f', '#ff9d1f'];
const PINK = ['#ffffff', '#ffb0c8', '#ff3d7f'];
const FIRE = ['#fff6c0', '#ffd23f', '#ff9d1f', '#ff4a1f', '#c0184e'];

function playFx(e) {
  const [, type, x, y, z, a] = e;
  switch (type) {
    case 'hit': addPart({ type: 'star', x, y, z, life: 0, max: 8, size: 10 }); burst(x, y, z, 7, { cols: HOT }); sfx('hit'); shake(2); break;
    case 'hvy':
      addPart({ type: 'star', x, y, z, life: 0, max: 10, size: 18 }); addPart({ type: 'ring', x, y, z, life: 0, max: 14, size: 26, col: '#fff6c0' });
      burst(x, y, z, 14, { cols: HOT, speed: 3.6 }); sfx('hvy'); shake(5); flash(0.12); break;
    case 'phit': addPart({ type: 'star', x, y, z, life: 0, max: 8, size: 10 }); burst(x, y, z, 7, { cols: PINK }); sfx('hurt'); shake(3); break;
    case 'phvy': addPart({ type: 'star', x, y, z, life: 0, max: 10, size: 16 }); burst(x, y, z, 12, { cols: PINK, speed: 3.2 }); sfx('hvy'); shake(6); flash(0.15, '#ff3d7f'); break;
    case 'dmg': floatText(x, y, z, a, '#fff6c0'); break;
    case 'ko': addPart({ type: 'ring', x, y: -20, z, life: 0, max: 18, size: 34, col: '#ffd23f' }); sfx('ko'); break;
    case 'bossko':
      flash(0.9); shake(12); FXS.ko = 150; sfx('ko'); sfx('hvy');
      for (let i = 0; i < 3; i++) addPart({ type: 'ring', x, y, z, life: -i * 6, max: 26, size: 60 + i * 30, col: i ? '#ff9d1f' : '#ffffff' });
      burst(x, y, z, 40, { cols: FIRE, speed: 5, life: 30 }); break;
    case 'land':
      for (let i = 0; i < (a ? 8 : 4); i++) addPart({ type: 'dust', x: x + (i - (a ? 4 : 2)) * 5, y: -2, z, vx: (i - (a ? 4 : 2)) * 0.35, vy: -0.3, life: 0, max: 20 + i * 2, size: a ? 6 : 4 });
      sfx('land'); if (a) shake(3); break;
    case 'dust': addPart({ type: 'dust', x, y: -3, z, vx: rnd(-0.4, 0.4), vy: -0.4, life: 0, max: 18, size: 5 }); break;
    case 'jump': sfx('jump'); break;
    case 'sp': sfx('sp'); burst(x, -20, z, 18, { cols: FIRE, speed: 3, up: 1.5 }); flash(0.1, '#ff9d1f'); break;
    case 'sup': FXS.cutin = { pn: a | 0, t: 0, dur: 70 }; sfx('sup'); break;
    case 'supgo':
      flash(0.85); shake(14);
      for (let i = 0; i < 3; i++) addPart({ type: 'ring', x, y: -24, z, life: -i * 5, max: 30, size: 120 + i * 60, col: i ? '#ff3d7f' : '#ffd23f' });
      break;
    case 'supx':
      addPart({ type: 'boom', x, y, z, life: 0, max: 22, size: 30 }); burst(x, y, z, 22, { cols: FIRE, speed: 4.4, life: 24 }); sfx('hvy'); shake(8); break;
    case 'brk':
      for (let i = 0; i < 9; i++) addPart({ type: 'chunk', x: x + rnd(-6, 6), y: rnd(-30, -10), z, vx: rnd(-2.4, 2.4), vy: rnd(-4, -1.5), life: 0, max: 50, size: 2 + Math.random() * 3, col: ['#7a3a1a', '#b8641e', '#4a2410'][i % 3], rot: 0 });
      sfx('brk'); shake(3); break;
    case 'pick': floatText(x, y, z, a, '#7dff9a', true); burst(x, y, z, 10, { cols: ['#ffffff', '#7dff9a', '#ffd23f'], speed: 2 }); sfx('pick'); break;
    case 'grab': sfx('grab'); break;
    case 'thr': sfx('thr'); break;
    case 'slam':
      addPart({ type: 'shock', x, y: 0, z, life: 0, max: 26, size: 90 });
      for (let i = 0; i < 12; i++) addPart({ type: 'dust', x: x + (i - 6) * 9, y: -2, z, vx: (i - 6) * 0.5, vy: -0.6, life: 0, max: 26, size: 7 });
      sfx('slam'); shake(10); flash(0.2, '#ffd23f'); break;
    case 'charge': shake(2); break;
    case 'boss': FXS.warn = 150; sfx('boss'); break;
    case 'bn': { const [top, sub] = String(a).split('|'); FXS.banner = { top, sub: sub || '', t: 0 }; break; }
    case 'go': sfx('go'); break;
    case 'spin':
      sfx('sp'); addPart({ type: 'ring', x, y, z, life: 0, max: 16, size: 48, col: '#aee6ff' });
      burst(x, y, z, 16, { cols: ['#ffffff', '#aee6ff', '#ffd23f'], speed: 3.4 }); shake(3); break;
    case 'clear': sfx('clear'); break;
  }
}

function updParts() {
  for (const p of PARTS) {
    p.life++;
    if (p.life < 0) continue;
    if (p.type === 'spark') { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.96; }
    else if (p.type === 'dust') { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; }
    else if (p.type === 'flame') { p.x += p.vx; p.y += p.vy; p.vy -= 0.04; }
    else if (p.type === 'chunk') { p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.rot += p.vx * 0.2; if (p.y > 0) { p.y = 0; p.vy *= -0.35; p.vx *= 0.6; } }
    else if (p.type === 'rain') { p.x += p.vx; p.y += p.vy; if (p.y > p.ground) { p.dead = true; if (Math.random() < 0.5) addPart({ type: 'splash', x: p.x, y: p.ground, life: 0, max: 8 }); } }
  }
  for (let i = PARTS.length - 1; i >= 0; i--) if (PARTS[i].dead || PARTS[i].life > PARTS[i].max) PARTS.splice(i, 1);
  for (const t of TEXTS) t.t++;
  for (let i = TEXTS.length - 1; i >= 0; i--) if (TEXTS[i].t > 50) TEXTS.splice(i, 1);
  if (FXS.shake > 0) FXS.shake = Math.max(0, FXS.shake - 0.5);
  if (FXS.flash > 0) FXS.flash = Math.max(0, FXS.flash - 0.06);
  if (FXS.banner) { FXS.banner.t++; if (FXS.banner.t > 170) FXS.banner = null; }
  if (FXS.cutin) { FXS.cutin.t++; if (FXS.cutin.t > FXS.cutin.dur + 4) FXS.cutin = null; }
  if (FXS.warn > 0) FXS.warn--;
  if (FXS.ko > 0) FXS.ko--;
  if (FXS.lightning > 0) FXS.lightning -= 0.05;
}

/* ---------- sprites ---------- */
function entSheet(o, isP) {
  if (isP) { const C = CHARS[o.ch] || CHARS.girl; return { sheet: C.sheet, pal: o.pal || C.pals[0], sc: 1 }; }
  const T = ENEMY[o.type]; return { sheet: 'punk', pal: T.pal, sc: T.sc };
}
/** Player animations are written for the girl sheet; the guy borrows frames from the punk sheet. */
function mapAnim(sheet, anim, fr, rot) {
  if (sheet === 'girl') {
    if (anim === 'spin') return { anim: 'kick', fr: 3, rot: 0 };
    return { anim, fr, rot };
  }
  switch (anim) {
    case 'idle': return { anim: 'idle', fr: fr % 4, rot: 0 };
    case 'walk': return { anim: 'walk', fr: fr % 4, rot: 0 };
    case 'jab': return { anim: 'punch', fr: [0, 1, 2][fr] ?? 2, rot: 0 };
    case 'punch': return { anim: 'punch', fr: [0, 2, 1][fr] ?? 1, rot: 0 };
    case 'kick': return { anim: 'punch', fr: [0, 0, 1, 2, 2][fr] ?? 2, rot: fr >= 3 ? 0.12 : 0 };
    case 'jump': return { anim: 'idle', fr: fr === 0 ? 0 : 2, rot: fr === 0 ? 0 : -0.12 };
    case 'jump_kick': return fr === 1 ? { anim: 'punch', fr: 2, rot: 0.45 } : { anim: 'hurt', fr: 0, rot: 0 };
    case 'dive_kick': return fr < 3 ? { anim: 'punch', fr: 0, rot: -0.15 } : { anim: 'punch', fr: 2, rot: 0.55 };
    case 'spin': return { anim: 'punch', fr: 2, rot: 0 };
    case 'hurt':
      if (Math.abs(rot) > 1.2) return { anim: 'hurt', fr: 3, rot: 0 };
      if (rot) return { anim: 'hurt', fr: 2, rot: 0 };
      return { anim: 'hurt', fr: fr % 2, rot: 0 };
    default: return { anim: 'idle', fr: 0, rot: 0 };
  }
}
function drawEnt(g, sheet, pal, o, anim, fr, rot, x, y, face, sc, white, isP) {
  if (isP) { const m = mapAnim(sheet, anim, fr, rot); anim = m.anim; fr = m.fr; rot = m.rot; }
  drawSprite(g, sheet, pal, anim, fr, x, y, face, sc, rot, white, !isP && o.st === 'thrown');
}
function drawSprite(g, sheet, pal, anim, fr, x, y, face, sc, rot, white, pivotMid) {
  const strips = white ? FLASH[sheet] : SPR[sheet][pal];
  const strip = strips && strips[anim];
  if (!strip) return;
  const n = SHEETS[sheet].anims[anim];
  fr = clamp(fr | 0, 0, n - 1);
  const flip = face !== SHEETS[sheet].face;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  if (rot) {
    if (pivotMid) { g.translate(0, -22 * sc); g.rotate(rot); g.translate(0, 22 * sc); }
    else { g.translate(0, -7 * sc * Math.abs(Math.sin(rot))); g.rotate(rot * face); }
  }
  g.scale(flip ? -sc : sc, sc);
  g.drawImage(strip, fr * FW, 0, FW, FH, -AX, -AY, FW, FH);
  g.restore();
}

/* ---------- main draw ---------- */
function renderFrame() {
  RFRAME++;
  updParts();
  const g = lg;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  if (!G || !G.players || (G.mode === 'guest' && !G.gotSnap)) { drawAttract(g); blit(); drawHUDOverlay(); return; }
  if (!STAGE_CACHE || STAGE_CACHE.si !== G.stage) { STAGE_CACHE = buildStage(G.stage); TRAILS.clear(); }
  const S = STAGES[G.stage];
  const left = Math.round(G.camX + VIEW_W / 2 - RW / 2);
  const sx = FXS.shake ? Math.round((Math.random() - 0.5) * FXS.shake * 2) : 0;
  const sy = FXS.shake ? Math.round((Math.random() - 0.5) * FXS.shake) : 0;
  g.save();
  g.translate(sx, sy);
  drawWorld(g, left, S);
  g.restore();
  // full screen flash
  if (FXS.flash > 0) { g.globalAlpha = Math.min(1, FXS.flash); g.fillStyle = FXS.flashCol; g.fillRect(0, 0, RW, VIEW_H); g.globalAlpha = 1; }
  if (FXS.lightning > 0) { g.globalAlpha = Math.min(0.8, FXS.lightning); g.fillStyle = '#e8f0ff'; g.fillRect(0, 0, RW, VIEW_H); g.globalAlpha = 1; }
  blit();
  drawHUD(left, sx, sy);
}

function blit() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(LO, 0, CROP, RW, SH, OX, OY, RW * SC, SH * SC);
}

function drawBackLayer(g, left, mood) {
  g.fillStyle = mood === 'dusk' ? '#2a1430' : mood === 'fog' ? '#7d8498' : '#0b0a1e';
  g.fillRect(0, 0, RW, 100);
  const B = IMG.back, off = Math.floor(left * 0.25) % 96;
  for (let x = -off - 96; x < RW + 96; x += 96) g.drawImage(B, x, 10);
}

function drawWorld(g, left, S) {
  const st = STAGE_CACHE, mood = S.mood;
  drawBackLayer(g, left, mood);
  g.drawImage(st.c, left + st.pad, 0, RW, VIEW_H, 0, 0, RW, VIEW_H);
  // neon signs on walls
  for (const s of st.signs) {
    const x = s.x - st.pad - left;
    if (x < -90 || x > RW + 10) continue;
    const on = ((RFRAME + s.x) >> 4) % 7 !== 0;
    const im = IMG[s.k + (on ? '1' : '2')];
    g.drawImage(im, x, s.y);
    if (mood !== 'dusk' && on) glow(g, x + im.width / 2, s.y + im.height / 2, im.width * 0.9, s.k === 'sushi' ? 'rgba(80,220,255,0.35)' : 'rgba(255,60,200,0.3)');
  }
  if (mood === 'dusk') {
    g.save(); g.globalCompositeOperation = 'multiply';
    const gr = g.createLinearGradient(0, 0, 0, VIEW_H); gr.addColorStop(0, 'rgb(255,150,110)'); gr.addColorStop(1, 'rgb(255,205,170)');
    g.fillStyle = gr; g.fillRect(0, 0, RW, VIEW_H);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.08; g.fillStyle = '#ff8a3a'; g.fillRect(0, 0, RW, VIEW_H); g.restore();
  }
  // street lights pools
  if (mood !== 'dusk' && mood !== 'fog') for (const lx of st.lamps) {
    const x = lx - left * 1.25;
    if (x < -120 || x > RW + 120) continue;
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(x + 10, 200, 4, x + 10, 200, 70);
    gr.addColorStop(0, 'rgba(255,200,120,0.22)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x + 10, 200, 80, 26, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // wet road reflections
  if (mood === 'rain') {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.12;
    for (let i = 0; i < 18; i++) { const yy = 150 + i * 5; g.fillStyle = i % 2 ? '#ff3d7f' : '#34e6ff'; g.fillRect(((i * 53 - left * 1.0) % RW + RW) % RW, yy, 26 + (i * 7) % 30, 1); }
    g.restore();
  }

  // ---- entities ----
  const list = [];
  for (const b of G.barrels) list.push({ k: 'b', o: b, z: b.z });
  for (const it of G.items) list.push({ k: 'i', o: it, z: it.z });
  for (const e of G.enemies) list.push({ k: 'e', o: e, z: e.z + 0.01 });
  for (const p of G.players) if (!p.gone && p.st !== 'out') list.push({ k: 'p', o: p, z: p.z + 0.02 });
  list.sort((a, b) => a.z - b.z);

  // shadows
  for (const d of list) {
    const o = d.o; if (d.k === 'b' || d.k === 'i') continue;
    const sc = d.k === 'e' ? ENEMY[o.type].sc : 1;
    const h = Math.min(1, -o.y / 80);
    const w = Math.round(20 * sc * 1.3 * (1 - h * 0.5)), hh = Math.max(3, Math.round(8 * sc * (1 - h * 0.5)));
    g.globalAlpha = 0.55 * (1 - h * 0.6);
    g.drawImage(IMG.shadow, 0, 0, 20, 8, Math.round(o.x - left - w / 2), Math.round(o.z - hh / 2), w, hh);
  }
  g.globalAlpha = 1;

  for (const d of list) {
    const o = d.o, x = o.x - left;
    if (x < -80 || x > RW + 80) continue;
    if (d.k === 'b') {
      const fr = o.broken ? 1 : 0;
      if (o.broken && (o.t || 0) > 200) continue;
      g.drawImage(IMG.barrel, fr * 32, 0, 32, 48, Math.round(x - 16), Math.round(o.z - 46), 32, 48);
      continue;
    }
    if (d.k === 'i') {
      const ic = ICONS[o.kind]; const bob = o.y < 0 ? 0 : Math.sin((RFRAME + o.id * 9) * 0.1) * 1.5;
      g.drawImage(ic, Math.round(x - ic.width / 2), Math.round(o.z + o.y - ic.height - 1 + bob));
      if ((RFRAME + o.id * 13) % 50 < 4) { g.fillStyle = '#fff'; g.fillRect(Math.round(x + 3), Math.round(o.z + o.y - ic.height + 1), 1, 1); }
      continue;
    }
    const isP = d.k === 'p';
    const { sheet, pal, sc } = entSheet(o, isP);
    // afterimages
    const trailOn = (isP && (o.anim === 'dive_kick' || o.anim === 'spin' || (o.anim === 'jump_kick' && o.fr === 1))) || (!isP && (o.st === 'thrown' || (o.st === 'atk' && (o.anim === 'walk')) ));
    let tr = TRAILS.get(o.id);
    if (trailOn) {
      if (!tr) { tr = []; TRAILS.set(o.id, tr); }
      tr.push({ x: o.x, y: o.y, z: o.z, anim: o.anim, fr: o.fr, face: o.face, rot: o.rot });
      if (tr.length > 6) tr.shift();
      g.save(); g.globalCompositeOperation = 'lighter';
      tr.forEach((q, i) => {
        if (i === tr.length - 1) return;
        g.globalAlpha = 0.12 + i * 0.06;
        drawEnt(g, sheet, pal, o, q.anim, q.fr, q.rot, q.x - left, q.z + q.y, q.face, sc, false, isP);
      });
      g.restore();
      if (isP && o.anim === 'dive_kick' && o.fr >= 3) addPart({ type: 'flame', x: o.x - o.face * 6 + rnd(-3, 3), y: o.y - 26 + rnd(-4, 4), z: o.z, vx: -o.face * rnd(0.3, 1), vy: rnd(-0.6, 0.2), life: 0, max: 16, col: FIRE[Math.floor(Math.random() * 3)], size: 2 });
    } else if (tr) TRAILS.delete(o.id);

    // invulnerability blink
    if (isP && o.inv && o.st !== 'dive' && (RFRAME >> 2) % 2) continue;
    if (!isP && o.st === 'dying' && (RFRAME >> 2) % 2) continue;
    // boss aura
    if (!isP && ENEMY[o.type].boss && o.hp > 0) {
      const col = o.rage ? 'rgba(255,40,30,' : 'rgba(255,200,80,';
      g.save(); g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(x, o.z + o.y - 30 * sc, 4, x, o.z + o.y - 30 * sc, 46 * sc);
      gr.addColorStop(0, col + (o.rage ? '0.35)' : '0.16)')); gr.addColorStop(1, col + '0)');
      g.fillStyle = gr; g.fillRect(x - 60 * sc, o.z + o.y - 90 * sc, 120 * sc, 100 * sc); g.restore();
      if (o.rage && RFRAME % 3 === 0) addPart({ type: 'flame', x: o.x + rnd(-14, 14) * sc, y: o.y - rnd(4, 50) * sc, z: o.z, vx: 0, vy: -rnd(0.4, 1.2), life: 0, max: 18, col: FIRE[2 + Math.floor(Math.random() * 3)], size: 2 });
    }
    const white = o.flash && (RFRAME >> 1) % 2 === 0;
    drawEnt(g, sheet, pal, o, o.anim, o.fr, o.rot, x, o.z + o.y, o.face, sc, white, isP);
    // whirlwind
    if (isP && o.anim === 'spin') {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const a0 = RFRAME * 0.5 + k * 2.1;
        g.strokeStyle = k === 1 ? 'rgba(255,210,63,0.8)' : 'rgba(170,230,255,0.75)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(x, o.z + o.y - 22, 30 + k * 5, 9 + k * 2, 0, a0, a0 + 2.2); g.stroke();
      }
      g.restore();
      if (RFRAME % 2 === 0) addPart({ type: 'spark', x: o.x + rnd(-30, 30), y: o.y - rnd(6, 34), z: o.z, vx: rnd(-2, 2), vy: rnd(-1.5, 0), life: 0, max: 14, col: HOT[Math.floor(Math.random() * 4)], size: 1 });
    }
    // attack telegraph (red flash)
    if (!isP && o.tele && (RFRAME >> 2) % 2 === 0) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55;
      drawSprite(g, sheet, 'boss1', o.anim, o.fr, x, o.z + o.y, o.face, sc, o.rot, false, false);
      g.restore();
    }
  }

  // particles
  for (const p of PARTS) drawPart(g, p, left);

  // rain
  if (mood === 'rain') {
    for (let i = 0; i < 6; i++) addPart({ type: 'rain', x: left + Math.random() * (RW + 60), y: -10, vx: -1.2, vy: 7 + Math.random() * 2, ground: ZMIN + Math.random() * (ZMAX - ZMIN), life: 0, max: 60, ax: true });
    if (--FXS.nextBolt <= 0) { FXS.lightning = 0.9; FXS.nextBolt = 480 + Math.random() * 600; setTimeout(() => sfx('thunder'), 300); }
  }

  // foreground lamps + bushes (parallax)
  const F = IMG.fore;
  for (const lx of st.lamps) {
    const x = Math.round(lx - left * 1.25);
    if (x < -50 || x > RW + 10) continue;
    // fade the post when a fighter stands behind it
    const behind = list.some((d) => (d.k === 'p' || d.k === 'e') && Math.abs(d.o.x - left - (x + 22)) < 26);
    g.globalAlpha = behind ? 0.35 : 1;
    g.drawImage(F, 16, 5, 43, 139, x, VIEW_H - 139 + 8, 43, 139);
    g.globalAlpha = 1;
    if (mood !== 'dusk') glow(g, x + 9, VIEW_H - 139 + 14, 30, 'rgba(255,214,150,0.45)');
  }
  for (const bx of st.bushes) {
    const x = Math.round(bx - left * 1.25);
    if (x < -70 || x > RW + 10) continue;
    g.drawImage(F, 94, 70, 62, 74, x, VIEW_H - 54, 62, 74);
  }

  // mood grading
  if (mood === 'night' || mood === 'rain') {
    g.save(); g.globalCompositeOperation = 'multiply';
    g.fillStyle = mood === 'rain' ? 'rgba(90,110,170,1)' : 'rgba(120,110,190,1)';
    g.globalAlpha = mood === 'rain' ? 0.55 : 0.4;
    g.fillRect(0, 0, RW, VIEW_H); g.restore();
  } else if (mood === 'fog') drawFog(g, left);
  else if (mood === 'dark') drawDark(g, left, list, st);
  // vignette
  const vg = g.createRadialGradient(RW / 2, VIEW_H / 2, VIEW_H * 0.45, RW / 2, VIEW_H / 2, RW * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, RW, VIEW_H);
  // super cut-in darkens the world
  if (FXS.cutin) { g.fillStyle = 'rgba(10,0,20,0.55)'; g.fillRect(0, 0, RW, VIEW_H); }
}

function drawFog(g, left) {
  g.save();
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5; g.fillStyle = '#c8d2e6'; g.fillRect(0, 0, RW, VIEW_H);
  g.globalCompositeOperation = 'source-over';
  const gr = g.createLinearGradient(0, 0, 0, VIEW_H);
  gr.addColorStop(0, 'rgba(225,230,240,0.55)'); gr.addColorStop(0.55, 'rgba(225,230,240,0.12)'); gr.addColorStop(1, 'rgba(225,230,240,0.3)');
  g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, RW, VIEW_H);
  // drifting fog banks
  for (let i = 0; i < 5; i++) {
    const w = 260, x = ((i * 190 - left * (0.6 + i * 0.15) - RFRAME * (0.25 + i * 0.07)) % (RW + w) + RW + w) % (RW + w) - w / 2;
    const y = 120 + i * 22;
    const fg = g.createRadialGradient(x, y, 4, x, y, w / 2);
    fg.addColorStop(0, 'rgba(235,240,248,0.35)'); fg.addColorStop(1, 'rgba(235,240,248,0)');
    g.fillStyle = fg; g.save(); g.translate(x, y); g.scale(1, 0.3); g.translate(-x, -y);
    g.fillRect(x - w / 2, y - w / 2, w, w); g.restore();
  }
  g.restore();
}

const DK = document.createElement('canvas');
function drawDark(g, left, list, st) {
  if (DK.width !== RW) { DK.width = RW; DK.height = VIEW_H; }
  const d = DK.getContext('2d');
  d.globalCompositeOperation = 'source-over';
  d.clearRect(0, 0, RW, VIEW_H);
  d.fillStyle = 'rgba(2,2,10,0.86)'; d.fillRect(0, 0, RW, VIEW_H);
  d.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a) => { const gr = d.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = gr; d.fillRect(x - r, y - r, r * 2, r * 2); };
  for (const lx of st.lamps) {
    const x = lx - left * 1.25; if (x < -150 || x > RW + 150) continue;
    const on = ((RFRAME + lx) % 233) > 6;
    if (on) { d.save(); d.translate(x + 10, 196); d.scale(1, 0.4); hole(0, 0, 110, 0.95); d.restore(); hole(x + 9, VIEW_H - 125, 34, 0.9); }
  }
  for (const s of st.signs) { const x = s.x - st.pad - left; if (x < -90 || x > RW + 10) continue; if (((RFRAME + s.x) >> 3) % 5) hole(x + 30, s.y + 12, 46, 0.8); }
  for (const dd of list) if (dd.k === 'p') hole(dd.o.x - left, dd.o.z + dd.o.y - 22, 52, 0.85);
  for (const dd of list) if (dd.k === 'e' && ENEMY[dd.o.type] && ENEMY[dd.o.type].boss) hole(dd.o.x - left, dd.o.z + dd.o.y - 30, 40, 0.6);
  for (const p of PARTS) if (p.type === 'star' || p.type === 'boom' || p.type === 'flame') hole(p.x - left, p.z + p.y, p.type === 'flame' ? 8 : 30, 0.7);
  g.drawImage(DK, 0, 0);
  // faint blue rim so the street is still readable
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.05; g.fillStyle = '#4060c0'; g.fillRect(0, 0, RW, VIEW_H); g.restore();
}

function glow(g, x, y, r, col) {
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y, 1, x, y, r);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}

function drawPart(g, p, left) {
  if (p.life < 0) return;
  const k = p.life / p.max;
  const x = Math.round(p.x - left), y = Math.round((p.type === 'rain' || p.type === 'splash') ? p.y : p.z + p.y);
  switch (p.type) {
    case 'spark': g.fillStyle = p.col; g.globalAlpha = 1 - k * 0.6; g.fillRect(x, y, k < 0.5 ? 2 : 1, k < 0.5 ? 2 : 1); g.globalAlpha = 1; break;
    case 'flame': g.fillStyle = p.col; g.globalAlpha = 1 - k; g.fillRect(x, y, p.size, p.size); g.globalAlpha = 1; break;
    case 'star': {
      const s = p.size * (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.8);
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = '#fff6c0';
      g.fillRect(x - s, y - 1, s * 2, 2); g.fillRect(x - 1, y - s, 2, s * 2);
      g.fillStyle = '#ffd23f'; g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-s * 0.6, -1, s * 1.2, 2); g.fillRect(-1, -s * 0.6, 2, s * 1.2);
      g.restore();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, Math.max(1, 4 * (1 - k)), 0, Math.PI * 2); g.fill();
      break;
    }
    case 'ring': g.strokeStyle = p.col; g.globalAlpha = 1 - k; g.lineWidth = Math.max(1, 3 * (1 - k)); g.beginPath(); g.ellipse(x, y, p.size * k, p.size * k * 0.6, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; break;
    case 'shock': g.strokeStyle = '#ffd23f'; g.globalAlpha = 1 - k; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y, p.size * k, p.size * k * 0.28, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; break;
    case 'dust': g.fillStyle = 'rgba(210,200,230,' + (0.5 * (1 - k)) + ')'; g.beginPath(); g.arc(x, y, p.size * (0.5 + k), 0, Math.PI * 2); g.fill(); break;
    case 'chunk': g.save(); g.translate(x, y); g.rotate(p.rot); g.fillStyle = p.col; g.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1; g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); g.restore(); break;
    case 'boom': {
      g.save(); g.globalCompositeOperation = 'lighter';
      const r = p.size * (0.3 + k);
      const gr = g.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, `rgba(255,255,220,${1 - k})`); gr.addColorStop(0.4, `rgba(255,160,40,${0.8 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,40,60,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); break;
    }
    case 'rain': g.strokeStyle = 'rgba(180,200,255,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y - 9); g.stroke(); break;
    case 'splash': g.fillStyle = 'rgba(200,220,255,' + (0.7 * (1 - k)) + ')'; g.fillRect(x - 2, y, 1, 1); g.fillRect(x + 2, y, 1, 1); g.fillRect(x, y - 1, 1, 1); break;
  }
}

/* ---------- title screen backdrop ---------- */
function drawAttract(g) {
  if (!IMG.tileset) { g.fillStyle = '#0b0814'; g.fillRect(0, 0, RW, VIEW_H); return; }
  if (!STAGE_CACHE || STAGE_CACHE.si !== 1) STAGE_CACHE = buildStage(1);
  const left = Math.round((RFRAME * 0.35) % (STAGES[1].len - RW));
  drawBackLayer(g, left, 'night');
  g.drawImage(STAGE_CACHE.c, left + STAGE_CACHE.pad, 0, RW, VIEW_H, 0, 0, RW, VIEW_H);
  for (const s of STAGE_CACHE.signs) {
    const x = s.x - STAGE_CACHE.pad - left; if (x < -90 || x > RW + 10) continue;
    const im = IMG[s.k + (((RFRAME + s.x) >> 4) % 7 ? '1' : '2')]; g.drawImage(im, x, s.y);
    glow(g, x + im.width / 2, s.y + im.height / 2, im.width * 0.9, 'rgba(255,60,200,0.3)');
  }
  const t = RFRAME;
  drawSprite(g, 'girl', 'p1', 'idle', Math.floor(t / 10) % 4, RW / 2 - 40, 200, 1, 1, 0);
  drawSprite(g, 'punk', 'guy1', 'idle', Math.floor(t / 10) % 4, RW / 2 - 4, 214, 1, 1, 0);
  drawSprite(g, 'punk', 'boss1', 'idle', Math.floor(t / 10) % 4, RW / 2 + 70, 206, -1, 1.45, 0);
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.45; g.fillStyle = '#6a5ab0'; g.fillRect(0, 0, RW, VIEW_H); g.restore();
}

/* ---------- HUD (crisp, display resolution) ---------- */
const PIX = '"Press Start 2P", monospace';
const THAI = '"Kanit", sans-serif';
function hudFont(size, fam, weight) { ctx.font = `${weight || ''} ${size}px ${fam}`; }
function outlinedText(txt, x, y, fill, stroke, lw) {
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
}

function drawHUD(left, sx, sy) {
  ctx.save();
  ctx.setTransform(SC, 0, 0, SC, OX, OY);
  // floating texts
  for (const t of TEXTS) {
    const k = t.t / 50;
    const x = t.x - left + sx, y = t.z + t.y + sy - CROP - t.t * 0.6 - (t.big ? 6 : 0);
    ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    hudFont(t.big ? 9 : 7, PIX); ctx.textAlign = 'center';
    const pop = t.t < 6 ? 1 + (6 - t.t) * 0.08 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop);
    outlinedText(t.txt, 0, 0, t.col, '#1a0820', 3);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  if (G && G.players) {
    G.players.forEach((p, i) => { if (!p.gone || i === 0) playerPanel(p, i); });
    if (G.mode !== 'solo' && G.players.length < 2) waitingPanel();
    else if (G.players[1] && G.players[1].gone) waitingPanel(true);
    enemyBars();
    comboCounters();
    if (G.goT > 0 && G.phase === 'play' && (RFRAME >> 4) % 2 === 0) {
      hudFont(14, PIX); ctx.textAlign = 'right';
      outlinedText('GO', RW - 26, 106, '#ffd23f', '#3a1400', 4);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(RW - 22, 92); ctx.lineTo(RW - 8, 100); ctx.lineTo(RW - 22, 108); ctx.fill();
    }
  }
  if (FXS.warn > 0) warning();
  if (FXS.banner) banner();
  if (FXS.ko > 0) koText();
  if (FXS.cutin) cutin();
  if (G && G.mode === 'guest' && !G.gotSnap) {
    hudFont(10, THAI, 600); ctx.textAlign = 'center';
    outlinedText('กำลังรอข้อมูลจากเครื่องโฮสต์…', RW / 2, 110, '#fff', '#000', 4);
  }
  if (typeof netStatusText === 'function') {
    const s = netStatusText();
    if (s) { hudFont(7, THAI, 600); ctx.textAlign = 'center'; outlinedText(s, RW / 2, SH - 6, '#ffd23f', '#000', 3); }
  }
  ctx.restore();
}

function playerPanel(p, i) {
  const right = i === 1;
  const x0 = right ? RW - 8 - 132 : 8, y0 = 6;
  const port = PORTRAIT[p.pal || (i ? 'p2' : 'p1')];
  ctx.save();
  // portrait box
  const px = right ? x0 + 132 - 26 : x0;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(px - 1, y0 - 1, 28, 26);
  ctx.strokeStyle = i ? '#3f74ff' : '#ce2038'; ctx.lineWidth = 1.5; ctx.strokeRect(px - 1, y0 - 1, 28, 26);
  if (port) { ctx.imageSmoothingEnabled = false; ctx.drawImage(port, px + 1, y0 + 1, 24, 22); }
  const bx = right ? x0 : x0 + 30;
  // name + level
  hudFont(8, THAI, 600); ctx.textAlign = right ? 'right' : 'left';
  outlinedText(p.name || (i ? 'P2' : 'P1'), right ? bx + 100 : bx, y0 + 7, '#fff', '#000', 3);
  hudFont(6, PIX); ctx.textAlign = right ? 'left' : 'right';
  outlinedText(String(p.score || 0).padStart(7, '0'), right ? bx : bx + 100, y0 + 7, '#ffd23f', '#000', 2.5);
  // hp bar
  const w = 100, h = 7, by = y0 + 10;
  const ratio = clamp((p.hp || 0) / (p.maxHp || 1), 0, 1);
  HUDS.lag[i] = HUDS.lag[i] > ratio ? HUDS.lag[i] - 0.006 : ratio;
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
  ctx.fillStyle = '#5a1020'; ctx.fillRect(bx, by, w, h);
  const fill = (r, col) => { const ww = w * r; ctx.fillStyle = col; if (right) ctx.fillRect(bx + w - ww, by, ww, h); else ctx.fillRect(bx, by, ww, h); };
  fill(HUDS.lag[i], '#fff');
  const gr = ctx.createLinearGradient(0, by, 0, by + h);
  const c1 = ratio > 0.5 ? '#7dff5a' : ratio > 0.25 ? '#ffd23f' : '#ff3b5c';
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, c1); gr.addColorStop(1, c1);
  fill(ratio, gr);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 1; k < 10; k++) ctx.fillRect(bx + k * 10, by, 1, h);
  // super meter
  const my = by + h + 3, m = clamp((p.meter || 0) / 100, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, my - 1, w + 2, 5);
  const full = m >= 1;
  ctx.fillStyle = full ? ((RFRAME >> 3) % 2 ? '#fff6c0' : '#ff9d1f') : '#ffb000';
  if (right) ctx.fillRect(bx + w - w * m, my, w * m, 3); else ctx.fillRect(bx, my, w * m, 3);
  if (full) { hudFont(5, PIX); ctx.textAlign = right ? 'right' : 'left'; outlinedText('SUPER!', right ? bx + w : bx, my + 11, '#ffd23f', '#000', 2); }
  // lives
  hudFont(6, PIX); ctx.textAlign = right ? 'left' : 'right';
  outlinedText('x' + Math.max(0, p.lives || 0), right ? bx : bx + w, my + 11, '#fff', '#000', 2.5);
  if (p.st === 'out') { hudFont(8, PIX); ctx.textAlign = 'center'; outlinedText('GAME OVER', bx + w / 2, by + 6, '#ff3b5c', '#000', 3); }
  ctx.restore();
}

function waitingPanel(dropped) {
  hudFont(7, THAI, 600); ctx.textAlign = 'right';
  outlinedText(dropped ? 'แฟนหลุดการเชื่อมต่อ…' : 'รอแฟนเข้าเกม…', RW - 8, 14, '#a99cc9', '#000', 3);
}

function enemyBars() {
  const boss = G.enemies.find((e) => ENEMY[e.type] && ENEMY[e.type].boss && e.hp > 0);
  if (boss) {
    const T = ENEMY[boss.type], w = 200, x = (RW - w) / 2, y = SH - 12;
    hudFont(8, PIX); ctx.textAlign = 'left';
    outlinedText(T.name, x, y - 4, boss.rage ? '#ff5a3a' : '#ffd23f', '#000', 3);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 1, y - 1, w + 2, 8);
    ctx.fillStyle = '#3a0a10'; ctx.fillRect(x, y, w, 6);
    const r = clamp(boss.hp / boss.maxHp, 0, 1);
    const gr = ctx.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#ff3b1f'); gr.addColorStop(1, '#ffd23f');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w * r, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, w * r, 2);
    return;
  }
  if (!G.lastEnemyT) return;
  const e = G.enemies.find((q) => q.id === G.lastEnemy);
  if (!e || !ENEMY[e.type]) return;
  const w = 70, x = 38, y = 40;
  hudFont(6, PIX); ctx.textAlign = 'left';
  outlinedText(ENEMY[e.type].name, x, y - 2, '#fff', '#000', 2.5);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - 1, y, w + 2, 5);
  ctx.fillStyle = '#ff8a3a'; ctx.fillRect(x, y + 1, w * clamp(e.hp / e.maxHp, 0, 1), 3);
}

function comboCounters() {
  G.players.forEach((p, i) => {
    const n = p.hits || 0;
    if (n !== HUDS.lastHits[i]) { if (n > HUDS.lastHits[i]) HUDS.pop[i] = 8; HUDS.lastHits[i] = n; }
    if (HUDS.pop[i] > 0) HUDS.pop[i]--;
    if (n < 2) return;
    const s = 1 + HUDS.pop[i] * 0.05;
    const x = i ? RW - 50 : 50, y = 78;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(i ? 0.08 : -0.08);
    hudFont(16, PIX); ctx.textAlign = 'center';
    const col = n >= 20 ? '#ff3d7f' : n >= 10 ? '#ff9d1f' : '#ffd23f';
    outlinedText(String(n), 0, 0, col, '#1a0820', 5);
    hudFont(6, PIX); outlinedText('HITS', 0, 10, '#fff', '#1a0820', 3);
    ctx.restore();
  });
}

function banner() {
  const b = FXS.banner, t = b.t;
  const inK = Math.min(1, t / 14), outK = t > 140 ? (t - 140) / 30 : 0;
  const a = 1 - outK;
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const bw = RW * inK;
  ctx.fillRect((RW - bw) / 2, 80, bw, 46);
  ctx.fillStyle = '#ff3d7f'; ctx.fillRect((RW - bw) / 2, 80, bw, 2); ctx.fillRect((RW - bw) / 2, 124, bw, 2);
  const isWarn = b.top === 'WARNING';
  hudFont(18, PIX); ctx.textAlign = 'center';
  const slide = (1 - inK) * -120;
  outlinedText(b.top, RW / 2 + slide, 107, isWarn ? '#ff3b3b' : '#ffd23f', '#2a0a00', 6);
  hudFont(10, isWarn ? PIX : THAI, 600);
  outlinedText(b.sub, RW / 2 - slide, 121, '#fff', '#000', 3.5);
  ctx.restore();
}

function warning() {
  if ((FXS.warn >> 3) % 2) return;
  ctx.save(); ctx.fillStyle = 'rgba(255,30,40,0.22)';
  ctx.fillRect(0, 0, RW, 6); ctx.fillRect(0, SH - 6, RW, 6);
  ctx.restore();
}

function koText() {
  const t = 150 - FXS.ko;
  const s = t < 10 ? 3 - t * 0.2 : 1;
  ctx.save(); ctx.translate(RW / 2, 98); ctx.scale(s, s);
  ctx.globalAlpha = FXS.ko < 30 ? FXS.ko / 30 : 1;
  hudFont(30, PIX); ctx.textAlign = 'center';
  outlinedText('K.O.!', 0, 10, '#ffd23f', '#a0160f', 8);
  ctx.restore();
}

function cutin() {
  const c = FXS.cutin, t = c.t, dur = c.dur;
  const inK = Math.min(1, t / 10), outK = t > dur - 10 ? (t - (dur - 10)) / 10 : 0;
  ctx.save();
  // speed lines
  ctx.globalAlpha = 0.5 * (1 - outK);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = ((i * 37 + t * 9) % SH);
    const x = ((i * 91) % RW);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 60, y); ctx.stroke();
  }
  ctx.globalAlpha = 1 - outK;
  // diagonal band
  ctx.save(); ctx.translate(RW / 2, SH / 2); ctx.rotate(-0.12);
  const bw = RW * 1.4 * inK;
  const gr = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
  gr.addColorStop(0, '#ff3d7f'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#ff3d7f');
  ctx.fillStyle = gr; ctx.fillRect(-bw / 2, -34, bw, 68);
  ctx.fillStyle = '#1a0820'; ctx.fillRect(-bw / 2, -38, bw, 4); ctx.fillRect(-bw / 2, 34, bw, 4);
  ctx.restore();
  // portrait
  const pl = G.players[c.pn];
  const port = PORTRAIT[(pl && pl.pal) || (c.pn ? 'p2' : 'p1')];
  if (port) {
    const px = -140 + inK * 200 - outK * 60;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(port, px, SH / 2 - 56, 24 * 4.4, 22 * 4.4);
  }
  hudFont(16, PIX); ctx.textAlign = 'right';
  const tx = RW - 20 + (1 - inK) * 200;
  outlinedText('SUPER', tx, SH / 2 - 4, '#fff', '#1a0820', 6);
  outlinedText('BLAST!', tx, SH / 2 + 20, '#fff6c0', '#1a0820', 6);
  hudFont(9, THAI, 800); ctx.textAlign = 'right';
  outlinedText(pl ? pl.name : '', tx, SH / 2 + 40, '#fff', '#1a0820', 4);
  ctx.restore();
}

function drawHUDOverlay() { /* title screen has HTML on top; nothing to draw */ }
