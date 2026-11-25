'use strict';
/* ============================================================
   Simulation. Runs on the solo player's device or on the host.
   The guest never runs this; it renders snapshots from the host.
   ============================================================ */

let G = null;

function newWorld(mode) {
  return {
    mode, frame: 0, stage: 0, camX: 0, lockX: null, waveIdx: 0, wave: null, goT: 0,
    players: [], enemies: [], items: [], barrels: [], proj: [], pets: [], petsOn: false,
    fxLog: [], fxId: 0, nid: 1,
    phase: 'play', phaseT: 0, hitstop: 0, slowmo: 0, superT: 0, superBy: -1,
    lastEnemy: 0, lastEnemyT: 0, song: null, paused: false,
  };
}

function newPlayer(pn, name, ch, pal, prog) {
  ch = CHARS[ch] ? ch : 'girl';
  const C = CHARS[ch];
  prog = prog || {};
  const lvl = clamp(prog.lvl | 0 || 1, 1, LEVEL.max);
  const hp = C.hp + (lvl - 1) * LEVEL.hp;
  return {
    lvl, exp: prog.exp | 0, petLine: PET_LINES[prog.pet] ? prog.pet : null, petExp: prog.petExp | 0,
    id: 'p' + pn, pn, ch, pal: pal || C.pals[pn === 0 ? 0 : 1], name: name || (pn === 0 ? 'P1' : 'P2'),
    x: 60 + pn * 40, y: 0, z: 160 + pn * 34, vx: 0, vy: 0, vz: 0, face: 1,
    st: 'idle', t: 0, anim: 'idle', fr: 0, rot: 0,
    hp, maxHp: hp, lives: PLAYER.lives, score: 0, meter: 0,
    inv: 90, active: true, gone: false, combo: 0, buf: false, hitDone: false, hitSet: new Set(),
    hits: 0, hitsT: 0, grab: 0, sub: null, knees: 0, stun: 0, flash: 0, super: false, wpn: null, grabHold: 0, rollDir: 1,
    pend: { atkP: 0, jmpP: 0, grabP: 0, spP: 0, sp2P: 0 },
  };
}

/* ---------- effects log (replicated to the guest) ---------- */
function fx(type, x = 0, y = 0, z = 0, a) {
  const e = [++G.fxId, type, Math.round(x), Math.round(y), Math.round(z)];
  if (a !== undefined) e.push(a);
  G.fxLog.push(e);
  if (G.fxLog.length > 40) G.fxLog.shift();
  if (typeof playFx === 'function') playFx(e);
}

function setSong(name) { G.song = name; playSong(name); }

/* ---------- stage flow ---------- */
function startStage(i) {
  const S = STAGES[i];
  G.stage = i; G.camX = 0; G.lockX = null; G.waveIdx = 0; G.wave = null; G.goT = 0;
  G.enemies = []; G.items = []; G.proj = []; G.phase = 'play'; G.phaseT = 0; G.slowmo = 0; G.hitstop = 0;
  const r = seeded(S.seed * 31);
  G.barrels = S.barrels.map((x) => ({ id: G.nid++, x, z: ZMIN + 4 + Math.floor(r() * 22), hp: 3, broken: 0, t: 0 }));
  for (const p of G.players) {
    if (p.gone) continue;
    p.x = 50 + p.pn * 40; p.z = 160 + p.pn * 34; p.y = 0; p.vx = p.vy = 0; p.face = 1;
    if (p.st !== 'out') { p.active = true; p.st = 'idle'; p.t = 0; p.inv = 60; p.rot = 0; }
  }
  for (const q of G.pets) { const o = G.players[q.owner]; if (o) { q.x = o.x - 30; q.z = clamp(o.z + 12, ZMIN, ZMAX); q.st = 'idle'; q.t = 0; } }
  setSong(S.song);
  fx('bn', 0, 0, 0, S.name + '|' + S.sub);
}

function activePlayers() { return G.players.filter((p) => p.active && !p.gone && p.st !== 'out'); }

function nearestPlayer(e) {
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (!p.active || p.gone || p.st === 'out' || p.st === 'respawn') continue;
    const d = Math.abs(p.x - e.x) + Math.abs(p.z - e.z) * 1.5;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

const P_VULN_BLOCK = new Set(['down', 'lie', 'getup', 'dive', 'respawn', 'out', 'gone', 'win', 'roll']);
function vulnerable(p) { return p.active && !p.gone && !P_VULN_BLOCK.has(p.st) && p.inv <= 0; }

const E_NOHIT = new Set(['down', 'lie', 'getup', 'dying', 'grabbed', 'thrown']);
function hittable(e) { return e.hp > 0 && !E_NOHIT.has(e.st) && !(e.inv > 0) && !(e.st === 'atk' && e.move === 'slam' && e.y < -20); }

/* ---------- main tick ---------- */
function simStep(inputs) {
  if (!G || G.paused) return;
  // keep button presses that land during freeze frames
  G.players.forEach((p, i) => { const inp = inputs[i]; if (inp) for (const k in p.pend) p.pend[k] |= inp[k]; });
  if (G.superT > 0) { G.superT--; if (G.superT === 0) superRelease(); return; }
  if (G.hitstop > 0) { G.hitstop--; return; }
  if (G.slowmo > 0) { G.slowmo--; if (G.slowmo % 3) return; }
  G.frame++;

  const S = STAGES[G.stage];
  G.players.forEach((p, i) => {
    const raw = inputs[i] || {};
    const inp = Object.assign({}, raw);
    for (const k in p.pend) { inp[k] = raw[k] || p.pend[k]; p.pend[k] = 0; }
    updPlayer(p, inp);
  });

  if (G.petsOn) for (const q of G.pets) updPet(q);

  // who may attack right now
  const live = G.enemies.filter((e) => e.hp > 0 && e.st !== 'dying');
  const nAct = activePlayers().length;
  for (const e of live) { const t = nearestPlayer(e); e._d = t ? Math.abs(t.x - e.x) + Math.abs(t.z - e.z) * 2 : 1e9; e.engaged = false; }
  live.sort((a, b) => (ENEMY[b.type].boss ? 1 : 0) - (ENEMY[a.type].boss ? 1 : 0) || a._d - b._d)
    .slice(0, nAct > 1 ? 3 : 2).forEach((e) => { e.engaged = true; });

  for (const e of G.enemies) updEnemy(e);
  separate();
  G.enemies = G.enemies.filter((e) => !e.dead);

  for (const b of G.barrels) b.t++;
  updItems();
  updProjectiles();
  if (G.lastEnemyT > 0) G.lastEnemyT--;
  if (G.goT > 0) G.goT--;

  if (G.phase === 'play') { updWaves(S); updCamera(S); }
  else if (G.phase === 'clear') {
    G.phaseT++;
    updCamera(S);
    if (G.phaseT === 40) {
      setSong('win');
      for (const p of activePlayers()) { p.score += 5000 + Math.round(p.hp) * 20; }
      fx('bn', 0, 0, 0, 'STAGE CLEAR|โบนัส +5000');
      fx('clear');
    }
    if (G.phaseT >= 320) {
      if (G.stage + 1 < STAGES.length) startStage(G.stage + 1);
      else { G.phase = 'end'; G.phaseT = 0; setSong('win'); }
    }
  } else if (G.phase === 'end' || G.phase === 'over') G.phaseT++;

  // game over?
  if (G.phase === 'play') {
    const present = G.players.filter((p) => !p.gone);
    if (present.length && present.every((p) => p.st === 'out')) { G.phase = 'over'; G.phaseT = 0; setSong('title'); }
  }
}

function updCamera(S) {
  const act = activePlayers();
  if (act.length) {
    let minX = Infinity, maxX = -Infinity;
    for (const p of act) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
    const target = Math.min(maxX - VIEW_W * 0.55, minX - 24);
    let limit = S.len - VIEW_W;
    if (G.lockX !== null) limit = G.lockX;
    else if (G.waveIdx < S.waves.length) limit = Math.min(limit, waveAt(S, S.waves[G.waveIdx]));
    if (target > G.camX) G.camX = Math.min(limit, G.camX + Math.min(3, target - G.camX));
  }
  for (const p of G.players) {
    if (p.gone || p.st === 'out') continue;
    p.x = clamp(p.x, G.camX + 12, G.camX + VIEW_W - 12);
    p.z = clamp(p.z, ZMIN, ZMAX);
  }
}

function waveAt(S, w) { return w.at === 'end' ? S.len - VIEW_W : w.at; }

function updWaves(S) {
  if (!G.wave && G.waveIdx < S.waves.length) {
    const w = S.waves[G.waveIdx];
    if (G.camX >= waveAt(S, w) - 0.5) {
      G.camX = waveAt(S, w); G.lockX = G.camX;
      G.wave = { groups: w.g.map((g) => g.slice()), gi: 0, delay: 20, boss: w.boss };
      if (w.boss) { fx('boss'); fx('bn', 0, 0, 0, 'WARNING|' + ENEMY[w.boss].name); setSong('boss'); G.wave.delay = 100; }
    }
  }
  const W = G.wave;
  if (!W) return;
  const alive = G.enemies.filter((e) => e.hp > 0).length;
  if (W.delay > 0) { W.delay--; return; }
  if (W.gi < W.groups.length) {
    if (alive <= (W.gi === 0 ? 0 : 1)) { spawnGroup(W.groups[W.gi++], !!W.boss && W.gi === 1); W.delay = 50; }
  } else if (alive === 0) {
    G.wave = null; G.lockX = null; G.waveIdx++;
    if (W.boss || G.waveIdx >= S.waves.length) { G.phase = 'clear'; G.phaseT = 0; }
    else { G.goT = 220; fx('go'); }
  }
}

function spawnGroup(types, isBoss) {
  const n2 = activePlayers().length > 1;
  types.forEach((type, i) => {
    const T = ENEMY[type];
    const side = T.boss ? 1 : (i % 2 === 0 ? (Math.random() < 0.5 ? 1 : -1) : -1);
    const x = side > 0 ? G.camX + VIEW_W + 30 + i * 18 : G.camX - 30 - i * 18;
    const hp = Math.round(T.hp * (n2 ? 1.45 : 1));
    G.enemies.push({
      id: G.nid++, type, x, y: 0, z: isBoss ? 178 : rnd(ZMIN + 6, ZMAX - 6), vx: 0, vy: 0, vz: 0, face: -side,
      st: 'enter', t: 0, anim: 'walk', fr: 0, rot: 0, hp, maxHp: hp, flash: 0, cool: 40 + Math.random() * 40,
      kdCool: 0, inv: 0, zoff: rnd(-26, 26), hang: rnd(56, 90), engaged: false, move: null, mask: 0, rec: 0, stun: 0,
      tele: 0, superHit: 0, hitSet: new Set(), thrower: 0, dead: false,
    });
  });
}

function separate() {
  const L = G.enemies;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    if (a.hp <= 0 || b.hp <= 0 || a.st === 'grabbed' || b.st === 'grabbed' || a.st === 'thrown' || b.st === 'thrown') continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dx) < 14 && Math.abs(dz) < 6) {
      const s = dx >= 0 ? 0.4 : -0.4;
      a.x -= s; b.x += s;
    }
  }
}

/* ---------- players ---------- */
function updPlayer(p, inp) {
  if (p.gone || p.st === 'out') return;
  p.t++;
  if (p.inv > 0) p.inv--;
  if (p.flash > 0) p.flash--;
  if (p.hitsT > 0 && --p.hitsT === 0) p.hits = 0;
  const dx = (inp.r ? 1 : 0) - (inp.l ? 1 : 0), dz = (inp.d ? 1 : 0) - (inp.u ? 1 : 0);
  const C = CHARS[p.ch] || CHARS.girl;

  switch (p.st) {
    case 'idle': case 'walk': {
      p.rot = 0;
      if (G.phase === 'end') { p.anim = 'idle'; p.fr = Math.floor(p.t / 10) % 4; break; }
      if (inp.spP && trySpecial(p)) break;
      if (inp.sp2P && trySpin(p)) break;
      if (inp.grabP) { if (p.wpn) { startThrow(p); break; } if (tryGrab(p)) break; }
      if (inp.grab && !p.wpn) {
        if (++p.grabHold >= PLAYER.tauntHold && !enemyNear(p, 80)) { p.st = 'taunt'; p.t = 0; p.grabHold = 0; fx('taunt', p.x, -50, p.z); break; }
      } else p.grabHold = 0;
      if (inp.jmpP && inp.d) { p.st = 'roll'; p.t = 0; p.rollDir = dx || p.face; p.face = p.rollDir; fx('dust', p.x, 0, p.z); sfx('swing'); break; }
      if (inp.jmpP) { p.st = 'jump'; p.t = 0; p.vy = -C.jump; p.vx = dx * C.speed * 1.15; p.vz = dz * C.zspeed * 0.7; fx('jump', p.x, 0, p.z); break; }
      if (inp.atkP) { p.combo = 0; if (p.wpn) beginWAtk(p); else beginAtk(p); break; }
      if (dx || dz) {
        p.x += dx * C.speed; p.z += dz * C.zspeed;
        if (dx) p.face = dx;
        if (p.st !== 'walk') { p.st = 'walk'; p.t = 0; }
        // walking into a dizzy enemy grabs it, like the arcade classics
        if (dx && autoGrab(p)) break;
      } else if (p.st !== 'idle') { p.st = 'idle'; p.t = 0; }
      p.anim = p.st === 'walk' ? 'walk' : 'idle';
      p.fr = p.st === 'walk' ? Math.floor(p.t / 5) % 10 : Math.floor(p.t / 10) % 4;
      break;
    }
    case 'atk': {
      const CH = CHARS[p.ch] || CHARS.girl;
      const C = PLAYER.combo[p.combo];
      let acc = 0, fr = C.ticks.length - 1;
      for (let i = 0; i < C.ticks.length; i++) { acc += C.ticks[i]; if (p.t < acc) { fr = i; break; } }
      const total = C.ticks.reduce((a, b) => a + b, 0);
      p.anim = C.anim; p.fr = fr;
      if (fr === C.hitF && !p.hitDone) { p.hitDone = true; attackHit(p, C.reach + CH.reach, C.dmg * CH.dmg, C.heavy ? 'heavy' : 'light'); }
      if (inp.atkP && p.t > 1) p.buf = true;
      if (inp.spP && trySpecial(p)) break;
      if (inp.sp2P && trySpin(p)) break;
      const last = PLAYER.combo.length - 1;
      if (p.combo === last && fr <= C.hitF) p.x += p.face * 0.7;
      if (p.t >= total) {
        if (p.buf && p.combo < last) { p.combo++; beginAtk(p); }
        else { p.st = 'idle'; p.t = 0; p.combo = 0; }
      }
      break;
    }
    case 'watk': {
      if (!p.wpn) { p.st = 'idle'; p.t = 0; break; }
      const W = WEAPONS[p.wpn.k], ticks = W.ticks[p.combo];
      let acc = 0, fr = ticks.length - 1;
      for (let i = 0; i < ticks.length; i++) { acc += ticks[i]; if (p.t < acc) { fr = i; break; } }
      const total = ticks.reduce((a, b) => a + b, 0);
      p.anim = 'wsw' + (p.combo + 1); p.fr = fr;
      if (fr === 1 && !p.hitDone) {
        p.hitDone = true;
        if (attackHit(p, W.reach, W.dmg[p.combo] * C.dmg, p.combo === 2 || p.wpn.k === 'pipe' && p.combo === 1 ? 'heavy' : 'light')) {
          if (--p.wpn.uses <= 0) { fx('wbrk', p.x + p.face * 30, -30, p.z); p.wpn = null; }
        }
      }
      if (inp.atkP && p.t > 1) p.buf = true;
      if (p.t >= total) {
        if (p.buf && p.combo < 2 && p.wpn) { p.combo++; beginWAtk(p); }
        else { p.st = 'idle'; p.t = 0; p.combo = 0; }
      }
      break;
    }
    case 'wthrow':
      p.anim = 'wthrow'; p.fr = p.t < 6 ? 0 : p.t < 12 ? 1 : 2;
      if (p.t === 6 && p.wpn) {
        G.proj.push({ id: G.nid++, k: p.wpn.k, x: p.x + p.face * 16, y: -32, z: p.z, vx: p.face * 6.5, face: p.face, owner: p.pn, t: 0, hit: new Set() });
        p.wpn = null; fx('thr', p.x, -30, p.z);
      }
      if (p.t >= 18) { p.st = 'idle'; p.t = 0; }
      break;
    case 'roll':
      p.anim = 'roll'; p.fr = Math.min(3, Math.floor(p.t / 6));
      p.x += p.rollDir * PLAYER.rollSpeed * (p.t < PLAYER.rollTicks - 6 ? 1 : 0.4);
      if (p.t >= PLAYER.rollTicks) { p.st = 'idle'; p.t = 0; p.inv = Math.max(p.inv, 6); }
      break;
    case 'taunt':
      p.anim = 'taunt'; p.fr = Math.floor(p.t / 10) % 4;
      if (p.t === 40) { p.meter = Math.min(100, p.meter + PLAYER.tauntGain); fx('pick', p.x, -50, p.z, 'SUPER +'); }
      if (p.t >= 64 || inp.atkP) { p.st = 'idle'; p.t = 0; }
      break;
    case 'jump': case 'jkick': {
      p.x += p.vx; p.z += p.vz; p.vy += GRAV; p.y += p.vy;
      if (p.st === 'jump') {
        p.anim = 'jump'; p.fr = p.t < 4 ? 0 : p.vy < -1.2 ? 1 : p.vy < 1.2 ? 2 : 3;
        if (inp.spP && trySpecial(p)) break;
        if (inp.atkP) { p.st = 'jkick'; p.t = 0; p.hitSet = new Set(); sfx('swing'); }
      } else {
        p.anim = 'jump_kick'; p.fr = p.t < 3 ? 0 : p.t < 26 ? 1 : 2;
        if (p.fr === 1) attackHit(p, PLAYER.jumpKick.reach + C.reach, PLAYER.jumpKick.dmg * C.dmg, 'heavy', { air: true });
      }
      if (p.y >= 0) { p.y = 0; p.vy = 0; p.st = 'land'; p.t = 0; fx('land', p.x, 0, p.z); }
      break;
    }
    case 'land':
      p.anim = 'jump'; p.fr = 0;
      if (p.t >= 5) { p.st = 'idle'; p.t = 0; }
      break;
    case 'dive': {
      p.anim = 'dive_kick';
      if (p.t < 10) { p.fr = Math.floor(p.t / 4); if (p.y < 0) { p.y += 2; if (p.y > 0) p.y = 0; } }
      else {
        if (p.t === 10) { p.vy = -2.8; p.vx = p.face * (p.super ? 6.4 : 5.4); p.hitSet = new Set(); }
        p.fr = p.t < 16 ? 3 : 4;
        p.x += p.vx; p.vy += GRAV * 0.62; p.y += p.vy;
        attackHit(p, 30 + C.reach, (p.super ? PLAYER.superDmg : PLAYER.diveDmg) * C.dmg, 'heavy', { back: 14 });
        if (p.y >= 0 && p.t > 12) { p.y = 0; p.st = 'land'; p.t = 0; p.vx = 0; p.super = false; fx('land', p.x, 0, p.z); }
      }
      break;
    }
    case 'spin': {
      // whirlwind kick: hits both sides twice
      p.anim = 'spin'; p.fr = 0;
      if (p.t % 4 === 0) p.face = -p.face;
      if (p.t === 6 || p.t === 20) { p.hitSet = new Set(); attackHit(p, 44 + C.reach, PLAYER.spinDmg * C.dmg, 'heavy', { around: true }); }
      if (p.t >= 30) { p.face = p.spinFace || p.face; p.st = 'idle'; p.t = 0; }
      break;
    }
    case 'grab': updGrab(p, inp, dx); break;
    case 'hurt':
      p.anim = 'hurt'; p.fr = p.t < 8 ? 0 : 1;
      if (p.t >= p.stun) { p.st = 'idle'; p.t = 0; }
      break;
    case 'down':
      p.anim = 'hurt'; p.fr = 1; p.rot = -Math.min(1.57, p.t * 0.14);
      p.x += p.vx; p.vx *= 0.97; p.vy += GRAV; p.y += p.vy;
      if (p.y >= 0) { p.y = 0; p.st = 'lie'; p.t = 0; p.rot = -1.57; fx('land', p.x, 0, p.z); }
      break;
    case 'lie':
      p.anim = 'hurt'; p.fr = 1; p.rot = -1.57;
      if (p.t >= 40) {
        if (p.hp <= 0) loseLife(p);
        else { p.st = 'getup'; p.t = 0; p.inv = 60; }
      }
      break;
    case 'getup':
      p.anim = 'hurt'; p.fr = 0; p.rot = -1.57 * Math.max(0, 1 - p.t / 12);
      if (p.t >= 14) { p.st = 'idle'; p.t = 0; p.rot = 0; }
      break;
    case 'respawn':
      p.anim = 'jump'; p.fr = 3; p.rot = 0;
      p.vy += GRAV * 0.55; p.y += p.vy;
      if (p.y >= 0) { p.y = 0; p.st = 'land'; p.t = 0; fx('land', p.x, 0, p.z); }
      break;
  }
}

function beginWAtk(p) {
  p.st = 'watk'; p.t = 0; p.hitDone = false; p.buf = false; p.hitSet = new Set();
  sfx('swing');
}
function startThrow(p) { p.st = 'wthrow'; p.t = 0; }
function enemyNear(p, r) { return G.enemies.some((e) => e.hp > 0 && Math.abs(e.x - p.x) < r && Math.abs(e.z - p.z) < 30); }

function updProjectiles() {
  for (const q of G.proj) {
    q.t++; q.x += q.vx;
    const W = WEAPONS[q.k], owner = G.players[q.owner];
    for (const e of G.enemies) {
      if (q.hit.has(e.id) || !hittable(e)) continue;
      if (Math.abs(e.x - q.x) < 20 && Math.abs(e.z - q.z) < 12) { q.hit.add(e.id); hurtEnemy(e, W.thrown * ((owner && CHARS[owner.ch]) ? CHARS[owner.ch].dmg : 1), 'heavy', owner); q.dead = q.hit.size >= 2; }
    }
    for (const b of G.barrels) {
      if (b.broken || Math.abs(b.x - q.x) > 16 || Math.abs(b.z - q.z) > 12) continue;
      b.hp = 0; b.broken = 1; b.t = 0; fx('brk', b.x, -22, b.z); dropItem(b.x, b.z + 3); q.dead = true;
    }
    if (q.t > 70 || q.x < G.camX - 30 || q.x > G.camX + VIEW_W + 30) q.dead = true;
    if (q.dead) fx('wbrk', q.x, -30, q.z);
  }
  G.proj = G.proj.filter((q) => !q.dead);
}

function beginAtk(p) {
  p.st = 'atk'; p.t = 0; p.hitDone = false; p.buf = false; p.hitSet = new Set();
  sfx('swing');
}

function trySpecial(p) {
  if (p.meter >= 100) {
    p.meter = 0; p.super = true;
    p.st = 'dive'; p.t = 0; p.inv = 220; p.y = Math.min(0, p.y); p.vy = 0; p.hitSet = new Set();
    G.superT = 70; G.superBy = p.pn;
    fx('sup', p.x, 0, p.z, p.pn);
    return true;
  }
  if (p.hp <= PLAYER.diveCost + 1) return false;
  p.hp -= PLAYER.diveCost; p.super = false;
  p.st = 'dive'; p.t = 0; p.inv = 40; p.hitSet = new Set();
  fx('sp', p.x, 0, p.z);
  return true;
}

function trySpin(p) {
  if (p.hp <= PLAYER.spinCost + 1) return false;
  p.hp -= PLAYER.spinCost;
  p.st = 'spin'; p.t = 0; p.inv = 32; p.spinFace = p.face; p.hitSet = new Set();
  fx('spin', p.x, -24, p.z);
  return true;
}

function superRelease() {
  const p = G.players[G.superBy];
  let n = 0;
  for (const e of G.enemies) {
    if (e.hp <= 0 || e.x < G.camX - 20 || e.x > G.camX + VIEW_W + 20) continue;
    e.superHit = 6 + n * 5; n++;
  }
  fx('supgo', p ? p.x : G.camX + VIEW_W / 2, 0, p ? p.z : 180);
  if (p && p.lvl >= LEVEL.superPet) { const q = G.pets.find((q) => q.owner === p.pn); if (q) { q.st = 'roar'; q.t = 0; q.superRoar = true; } }
}

/* ---------- levels ---------- */
function gainExp(p, n, feedPet) {
  if (!n) return;
  if (p.lvl < LEVEL.max) {
    p.exp += n;
    while (p.lvl < LEVEL.max && p.exp >= LEVEL.need(p.lvl)) {
      p.exp -= LEVEL.need(p.lvl); p.lvl++;
      p.maxHp += LEVEL.hp; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
      fx('lvlup', p.x, -60, p.z, p.lvl);
    }
    if (p.lvl >= LEVEL.max) p.exp = 0;
  }
  if (feedPet) { const q = G.pets.find((q) => q.owner === p.pn); if (q) addPetExp(q, n * 0.35); }
}

/* ---------- pets ---------- */
function makePet(p) {
  if (!G.petsOn || !p.petLine || G.pets.some((q) => q.owner === p.pn)) return;
  G.pets.push({ id: G.nid++, owner: p.pn, line: p.petLine, exp: p.petExp, form: petForm(p.petExp), x: p.x - 30, y: 0, z: clamp(p.z + 12, ZMIN, ZMAX),
    face: 1, st: 'idle', t: 0, cool: 30, roarT: PET.roarEvery, tgt: 0, hide: false });
}
function addPetExp(q, n) {
  q.exp += n;
  const o = G.players[q.owner]; if (o) o.petExp = Math.floor(q.exp);
  const f = petForm(q.exp);
  if (f > q.form) {
    q.form = f; q.st = 'evolve'; q.t = 0;
    const F = PET_LINES[q.line].forms[f];
    fx('evo', q.x, -40, q.z, q.owner);
    fx('bn', 0, 0, 0, 'EVOLUTION!|' + F.name);
  }
}
function petHit(q, e, dmg, kind) {
  const o = G.players[q.owner];
  hurtEnemy(e, dmg, kind, o, q.x);
  addPetExp(q, dmg);
}
function updPet(q) {
  const o = G.players[q.owner];
  if (!o || o.gone) { q.hide = true; return; }
  q.hide = o.st === 'out';
  if (q.hide) return;
  q.t++; if (q.cool > 0) q.cool--; if (q.roarT > 0) q.roarT--;
  const L = PET_LINES[q.line], f = q.form;
  q.y = L.fly ? -38 - Math.sin(G.frame * 0.08) * 4 : 0;
  if (q.st === 'evolve') { if (q.t >= 70) { q.st = 'idle'; q.t = 0; } return; }
  if (q.st === 'atk') {
    if (q.t === 8) {
      const e = G.enemies.find((e) => e.id === q.tgt);
      if (e && hittable(e) && Math.abs(e.x - q.x) < PET.reach[f] + 18 && Math.abs(e.z - q.z) < 14) petHit(q, e, PET.dmg[f], f >= 1 ? 'heavy' : 'light');
    }
    if (q.t >= 22) { q.st = 'idle'; q.t = 0; q.cool = PET.cool[f]; }
    return;
  }
  if (q.st === 'roar') {
    if (q.t === 12) {
      fx('roar', q.x, -20, q.z, q.owner);
      const big = q.superRoar ? 1.6 : 1;
      for (const e of G.enemies) if (hittable(e) && Math.abs(e.x - q.x) < 95 * big && Math.abs(e.z - q.z) < 36) petHit(q, e, PET.roarDmg * big, 'heavy');
    }
    if (q.t >= 40) { q.st = 'idle'; q.t = 0; q.cool = 40; q.roarT = PET.roarEvery; q.superRoar = false; }
    return;
  }
  let tgt = null, bd = 1e9;
  for (const e of G.enemies) {
    if (!hittable(e) || e.st === 'enter' || Math.abs(e.x - o.x) > 200) continue;
    const d = Math.abs(e.x - q.x) + Math.abs(e.z - q.z) * 1.5;
    if (d < bd) { bd = d; tgt = e; }
  }
  if (f === 2 && q.roarT <= 0 && tgt && Math.abs(tgt.x - q.x) < 90) { q.st = 'roar'; q.t = 0; return; }
  let gx, gz;
  if (tgt) { const side = q.x < tgt.x ? -1 : 1; gx = tgt.x + side * PET.reach[f] * 0.8; gz = tgt.z; }
  else { gx = o.x - o.face * (30 + f * 12); gz = clamp(o.z + 14, ZMIN, ZMAX); }
  const dx = gx - q.x, dz = gz - q.z;
  const sp = PET.speed[f] * (tgt ? 1 : Math.min(1.5, Math.abs(dx) / 40 + 0.4));
  const moving = Math.abs(dx) > 3 || Math.abs(dz) > 2;
  if (Math.abs(dx) > 3) q.x += Math.sign(dx) * Math.min(sp, Math.abs(dx));
  if (Math.abs(dz) > 2) q.z += Math.sign(dz) * Math.min(sp * 0.7, Math.abs(dz));
  q.face = tgt ? (tgt.x > q.x ? 1 : -1) : (Math.abs(dx) > 3 ? Math.sign(dx) : o.face);
  const st = moving ? (Math.abs(dx) > 50 ? 'run' : 'walk') : 'idle';
  if (st !== q.st) { q.st = st; q.t = 0; }
  if (Math.abs(q.x - o.x) > 260) { q.x = o.x - o.face * 30; q.z = o.z; }
  q.x = clamp(q.x, G.camX - 20, G.camX + VIEW_W + 20); q.z = clamp(q.z, ZMIN, ZMAX);
  if (tgt && Math.abs(tgt.x - q.x) <= PET.reach[f] + 6 && Math.abs(tgt.z - q.z) < 9 && q.cool <= 0) { q.st = 'atk'; q.t = 0; q.tgt = tgt.id; }
}

function grabbable(e) {
  const T = ENEMY[e.type];
  return e.hp > 0 && !T.boss && ['idle', 'walk', 'hurt', 'recover', 'wind'].includes(e.st);
}
function tryGrab(p) {
  for (const e of G.enemies) {
    if (!grabbable(e)) continue;
    const dx = (e.x - p.x) * p.face;
    if (dx > 2 && dx < 30 && Math.abs(e.z - p.z) < 9) { doGrab(p, e); return true; }
  }
  return false;
}
function autoGrab(p) {
  for (const e of G.enemies) {
    if (e.st !== 'hurt' || !grabbable(e)) continue;
    const dx = (e.x - p.x) * p.face;
    if (dx > 2 && dx < 18 && Math.abs(e.z - p.z) < 6) { doGrab(p, e); return true; }
  }
  return false;
}
function doGrab(p, e) {
  p.st = 'grab'; p.t = 0; p.grab = e.id; p.knees = 0; p.sub = null;
  e.st = 'grabbed'; e.t = 0; e.face = -p.face;
  fx('grab', e.x, -24, e.z);
}
function updGrab(p, inp, dx) {
  const e = G.enemies.find((q) => q.id === p.grab);
  if (!e || e.st !== 'grabbed') { p.st = 'idle'; p.t = 0; p.sub = null; return; }
  if (p.sub !== 'throw') { e.x = p.x + p.face * 20; e.z = p.z + 0.1; e.y = 0; e.face = -p.face; }
  if (p.sub === 'knee') {
    p.anim = 'kick'; p.fr = p.t < 4 ? 1 : 2;
    if (p.t === 4) { hurtEnemy(e, 7 * (CHARS[p.ch] || CHARS.girl).dmg, 'grab', p); if (e.hp <= 0) { p.st = 'idle'; p.t = 0; p.sub = null; return; } }
    if (p.t >= 12) { p.sub = null; p.t = 0; }
  } else if (p.sub === 'throw') {
    p.anim = 'punch'; p.fr = p.t < 5 ? 0 : p.t < 14 ? 1 : 2;
    if (p.t === 6) throwEnemy(p, e);
    if (p.t >= 18) { p.st = 'idle'; p.t = 0; p.sub = null; }
  } else {
    p.anim = 'punch'; p.fr = 0;
    if (inp.atkP) { p.knees++; p.sub = p.knees >= 4 ? 'throw' : 'knee'; p.t = 0; if (p.sub === 'knee') sfx('swing'); }
    else if (inp.grabP || inp.jmpP || inp.spP) { if (dx) p.face = dx; p.sub = 'throw'; p.t = 0; }
    else if (p.t > 150) { e.st = 'idle'; e.t = 0; p.st = 'idle'; p.t = 0; }
  }
}
function throwEnemy(p, e) {
  e.st = 'thrown'; e.t = 0; e.vx = p.face * 4.4; e.vy = -3.8; e.y = -6; e.rot = 0;
  e.x = p.x + p.face * 12; e.thrower = p.pn; e.hitSet = new Set();
  fx('thr', e.x, -20, e.z);
}

function loseLife(p) {
  p.lives--;
  if (p.lives > 0) {
    p.st = 'respawn'; p.t = 0; p.y = -170; p.vy = 0; p.rot = 0;
    p.x = clamp(G.camX + 110 + p.pn * 70, G.camX + 20, G.camX + VIEW_W - 20);
    p.hp = p.maxHp; p.inv = 200;
  } else { p.st = 'out'; p.active = false; p.rot = 0; }
}

function continueGame() {
  for (const p of G.players) {
    if (p.gone) continue;
    p.lives = PLAYER.lives; p.hp = p.maxHp; p.active = true; p.score = 0; p.meter = 50;
    p.st = 'respawn'; p.t = 0; p.y = -170; p.vy = 0; p.rot = 0; p.inv = 200;
    p.x = clamp(G.camX + 110 + p.pn * 70, G.camX + 20, G.camX + VIEW_W - 20);
  }
  G.phase = 'play'; G.phaseT = 0;
  setSong(G.wave && G.wave.boss ? 'boss' : STAGES[G.stage].song);
}

function hurtPlayer(p, dmg, heavy, fromX) {
  if (!vulnerable(p)) return false;
  if (p.st === 'grab') { const e = G.enemies.find((q) => q.id === p.grab); if (e && e.st === 'grabbed') { e.st = 'idle'; e.t = 0; } }
  dmg = Math.round(dmg);
  p.hp -= dmg; p.flash = 6; p.hits = 0; p.hitsT = 0; p.sub = null;
  p.meter = Math.min(100, p.meter + dmg * 0.7);
  const dir = Math.sign(p.x - fromX) || 1;
  if (p.y < -2) heavy = true;
  if (p.hp <= 0) { p.hp = 0; heavy = true; }
  fx(heavy ? 'phvy' : 'phit', p.x, -30, p.z);
  G.hitstop = Math.max(G.hitstop, heavy ? 6 : 3);
  p.face = -dir;
  if (heavy && p.wpn) { dropItem(p.x, p.z, p.wpn.k); p.wpn = null; }
  if (heavy) { p.st = 'down'; p.t = 0; p.vy = -3.2; p.vx = dir * 2.2; p.y = Math.min(p.y, -1); }
  else { p.st = 'hurt'; p.t = 0; p.stun = 16; p.x += dir * 3; }
  return true;
}

/* ---------- combat ---------- */
function attackHit(p, reach, dmg, kind, opt = {}) {
  let any = false;
  const back = opt.back ?? 6;
  for (const e of G.enemies) {
    if (p.hitSet.has(e.id) || !hittable(e)) continue;
    const T = ENEMY[e.type];
    if (Math.abs(e.z - p.z) > 9 + 4 * T.sc) continue;
    const dx = opt.around ? Math.abs(e.x - p.x) : (e.x - p.x) * p.face;
    if (dx < -back || dx > reach + 10 * (T.sc - 1)) continue;
    p.hitSet.add(e.id); any = true;
    hurtEnemy(e, dmg, kind, p);
  }
  for (const b of G.barrels) {
    if (b.broken || p.hitSet.has(b.id) || Math.abs(b.z - p.z) > 12) continue;
    const dx = opt.around ? Math.abs(b.x - p.x) : (b.x - p.x) * p.face;
    if (dx < -back || dx > reach + 6) continue;
    p.hitSet.add(b.id); any = true;
    b.hp--; fx(b.hp > 0 ? 'hit' : 'brk', b.x, -22, b.z);
    if (b.hp <= 0) { b.broken = 1; b.t = 0; dropItem(b.x, b.z + 3); p.score += 100; }
  }
  return any;
}

function hurtEnemy(e, dmg, kind, p, srcX) {
  const T = ENEMY[e.type];
  if (p && p.lvl) dmg *= 1 + (p.lvl - 1) * LEVEL.dmg;
  dmg = Math.round(dmg);
  e.hp -= dmg; e.flash = 6; G.lastEnemy = e.id; G.lastEnemyT = 200;
  if (p) { p.score += dmg * 10; p.meter = Math.min(100, p.meter + dmg * 1.15 * (1 + ((p.lvl || 1) - 1) * LEVEL.meter)); p.hits++; p.hitsT = 110; gainExp(p, dmg, srcX === undefined); }
  const dir = srcX !== undefined ? (Math.sign(e.x - srcX) || 1) : p ? (Math.sign(e.x - p.x) || p.face) : -e.face;
  fx('dmg', e.x, -48 * T.sc, e.z, dmg);
  if (kind === 'grab') {
    fx('hit', e.x - dir * 6, -26 * T.sc, e.z);
    G.hitstop = Math.max(G.hitstop, 4);
    if (e.hp <= 0) { knock(e, dir); enemyKO(e, p); }
    return;
  }
  let heavy = kind === 'heavy' || e.hp <= 0;
  if (T.boss && heavy && e.hp > 0 && e.kdCool > 0) heavy = false;
  fx(heavy ? 'hvy' : 'hit', e.x - dir * 6, -26 * T.sc, e.z);
  G.hitstop = Math.max(G.hitstop, heavy ? 7 : 4);
  if (heavy) { knock(e, dir); if (T.boss) e.kdCool = 360; }
  else {
    const attacking = e.st === 'atk' || e.st === 'wind';
    if (!(T.armor >= 1 && attacking)) { e.st = 'hurt'; e.t = 0; e.stun = T.armor === 0 ? 20 : 10; e.x += dir * 2; e.face = -dir; }
  }
  if (e.hp <= 0) enemyKO(e, p);
}

function knock(e, dir) { e.st = 'down'; e.t = 0; e.vy = -3.5; e.vx = dir * 2.7; e.y = Math.min(e.y, -1); e.face = -dir; e.tele = 0; }

function enemyKO(e, p) {
  const T = ENEMY[e.type];
  if (e._ko) return; e._ko = true;
  e.hp = 0;
  if (p) { p.score += T.score; gainExp(p, Math.round(T.score / 8), true); }
  fx('ko', e.x, 0, e.z);
  if (T.boss) {
    G.slowmo = 150;
    if (G.wave) G.wave.gi = G.wave.groups.length; // no more reinforcements
    fx('bossko', e.x, -40, e.z);
    for (const o of G.enemies) if (o !== e && o.hp > 0) { o.hp = 0; o._ko = true; knock(o, o.x < e.x ? -1 : 1); }
  } else if (T.weapon && Math.random() < 0.7) dropItem(e.x, e.z, T.weapon);
  else if (Math.random() < (e.type === 'brute' ? 0.4 : 0.1)) dropItem(e.x, e.z);
}

function enemyHit(e, reach, dmg, heavy) {
  let any = false;
  const T = ENEMY[e.type];
  for (const p of G.players) {
    if (!vulnerable(p)) continue;
    if (Math.abs(p.z - e.z) > 7 + 3 * T.sc) continue;
    const dx = (p.x - e.x) * e.face;
    if (dx < -8 || dx > reach) continue;
    if (p.y < -24) continue;
    if (hurtPlayer(p, dmg, heavy, e.x)) any = true;
  }
  return any;
}

/* ---------- enemies ---------- */
function startEAtk(e, T, far) {
  const moves = T.moves.filter((m) => (far ? m === 'charge' || m === 'dash' : m !== 'charge' || Math.random() < 0.4));
  e.move = moves.length ? moves[Math.floor(Math.random() * moves.length)] : T.moves[0];
  e.st = 'wind'; e.t = 0;
}
function recover(e, n) { e.st = 'recover'; e.t = 0; e.rec = n; e.vx = 0; e.vz = 0; e.tele = 0; }

function updEnemy(e) {
  const T = ENEMY[e.type];
  e.t++;
  if (e.flash > 0) e.flash--;
  if (e.cool > 0) e.cool--;
  if (e.kdCool > 0) e.kdCool--;
  if (e.inv > 0) e.inv--;
  if (e.superHit > 0 && --e.superHit === 0 && e.hp > 0) {
    const p = G.players[G.superBy] || null;
    fx('supx', e.x, -30 * T.sc, e.z);
    e.inv = 0; if (E_NOHIT.has(e.st) && e.st !== 'dying') { e.st = 'idle'; }
    hurtEnemy(e, PLAYER.superDmg, 'heavy', p);
  }
  const rage = T.boss && e.hp < e.maxHp * 0.5;
  e.rage = rage ? 1 : 0;
  const spd = T.spd * (rage ? 1.25 : 1);
  const tgt = nearestPlayer(e);

  switch (e.st) {
    case 'enter': {
      const inX = clamp(e.x, G.camX + 22, G.camX + VIEW_W - 22);
      const d = inX - e.x;
      e.anim = 'walk'; e.fr = Math.floor(e.t / 7) % 4;
      if (Math.abs(d) <= 1.5) { e.st = 'idle'; e.t = 0; }
      else { e.face = d > 0 ? 1 : -1; e.x += Math.sign(d) * Math.max(1, spd); }
      break;
    }
    case 'idle': case 'walk': {
      if (!tgt) { e.anim = 'idle'; e.fr = Math.floor(e.t / 10) % 4; break; }
      if ((G.frame + e.id * 17) % 140 === 0) { e.zoff = rnd(-26, 26); e.hang = rnd(56, 92); }
      const side = e.x < tgt.x ? -1 : 1;
      let gx, gz;
      if (e.engaged) { gx = tgt.x + side * T.reach * T.sc * 0.72; gz = tgt.z; }
      else { gx = tgt.x + side * e.hang; gz = clamp(tgt.z + e.zoff, ZMIN, ZMAX); }
      gx = clamp(gx, G.camX + 10, G.camX + VIEW_W - 10);
      const dxg = gx - e.x, dzg = gz - e.z, sp = spd * (e.engaged ? 1 : 0.6);
      let mv = false;
      if (Math.abs(dxg) > 2) { e.x += Math.sign(dxg) * Math.min(sp, Math.abs(dxg)); mv = true; }
      if (Math.abs(dzg) > 1.5) { e.z += Math.sign(dzg) * Math.min(sp * 0.7, Math.abs(dzg)); mv = true; }
      e.face = tgt.x >= e.x ? 1 : -1;
      e.st = mv ? 'walk' : 'idle';
      e.anim = mv ? 'walk' : 'idle';
      e.fr = mv ? Math.floor(e.t / (e.type === 'dash' ? 5 : 8)) % 4 : Math.floor(e.t / 10) % 4;
      const adx = Math.abs(tgt.x - e.x), adz = Math.abs(tgt.z - e.z);
      if (e.engaged && e.cool <= 0 && vulnerable(tgt)) {
        if (adx <= T.reach * T.sc + 4 && adz <= 7) startEAtk(e, T, false);
        else if (adz <= 9 && adx > 70 && adx < 220 && (T.moves.includes('charge') || T.moves.includes('dash')) && Math.random() < 0.03) startEAtk(e, T, true);
        else if (T.moves.includes('slam') && adx > 50 && Math.random() < 0.012) { e.move = 'slam'; e.st = 'wind'; e.t = 0; }
      }
      break;
    }
    case 'wind': {
      e.anim = 'punch'; e.fr = 0;
      const w = e.move === 'charge' ? 26 : e.move === 'slam' ? 20 : e.move === 'dash' ? 10 : e.move === 'heavy' ? 22 : Math.round(T.wind * (rage ? 0.7 : 1));
      e.tele = e.move === 'charge' || e.move === 'heavy' || e.move === 'slam' ? 1 : 0;
      if (tgt && e.move !== 'charge') e.face = tgt.x >= e.x ? 1 : -1;
      if (e.t >= w) {
        e.st = 'atk'; e.t = 0; e.mask = 0; e.tele = 0;
        if (e.move === 'dash') e.vx = e.face * 4.4;
        if (e.move === 'charge') { e.vx = e.face * (rage ? 5.4 : 4.6); fx('charge', e.x, 0, e.z); }
        if (e.move === 'slam' && tgt) { e.vy = -6.4; const n = 40; e.vx = (tgt.x - e.x) / n; e.vz = (tgt.z - e.z) / n; fx('jump', e.x, 0, e.z); }
      }
      break;
    }
    case 'atk': updEAtk(e, T); break;
    case 'recover':
      e.anim = 'idle'; e.fr = 0;
      if (e.t >= e.rec) { e.st = 'idle'; e.t = 0; e.cool = T.boss ? rnd(20, 60) * (rage ? 0.6 : 1) : rnd(50, 120); }
      break;
    case 'hurt':
      e.anim = 'hurt'; e.fr = e.t < 6 ? 0 : 1;
      if (e.t >= e.stun) { e.st = 'idle'; e.t = 0; e.cool = Math.max(e.cool, 16); }
      break;
    case 'down':
      e.anim = 'hurt'; e.fr = 2;
      e.x += e.vx; e.vx *= 0.97; e.vy += GRAV; e.y += e.vy;
      e.x = clamp(e.x, G.camX + 8, G.camX + VIEW_W - 8);
      if (e.y >= 0) { e.y = 0; e.st = 'lie'; e.t = 0; e.vx = 0; fx('land', e.x, 0, e.z, T.sc > 1.3 ? 1 : 0); }
      break;
    case 'lie':
      e.anim = 'hurt'; e.fr = 3;
      if (e.t >= (e.hp <= 0 ? 26 : 44)) {
        if (e.hp <= 0) { e.st = 'dying'; e.t = 0; } else { e.st = 'getup'; e.t = 0; e.inv = 26; }
      }
      break;
    case 'getup':
      e.anim = 'hurt'; e.fr = 1;
      if (e.t >= 16) { e.st = 'idle'; e.t = 0; e.cool = 30; }
      break;
    case 'dying':
      e.anim = 'hurt'; e.fr = 3;
      if (e.t >= 46) e.dead = true;
      break;
    case 'grabbed':
      e.anim = 'hurt'; e.fr = 0;
      if (!G.players.some((p) => p.st === 'grab' && p.grab === e.id)) { e.st = 'idle'; e.t = 0; }
      break;
    case 'thrown': {
      e.anim = 'hurt'; e.fr = 2; e.rot += e.vx > 0 ? 0.35 : -0.35;
      e.x += e.vx; e.vy += GRAV * 0.9; e.y += e.vy;
      for (const o of G.enemies) {
        if (o === e || e.hitSet.has(o.id) || !hittable(o)) continue;
        if (Math.abs(o.z - e.z) < 12 && Math.abs(o.x - e.x) < 22) { e.hitSet.add(o.id); hurtEnemy(o, 16, 'heavy', G.players[e.thrower]); }
      }
      const edge = e.x < G.camX + 6 || e.x > G.camX + VIEW_W - 6;
      if ((e.y >= 0 && e.t > 4) || edge) {
        e.x = clamp(e.x, G.camX + 6, G.camX + VIEW_W - 6);
        e.y = 0; e.rot = 0; e.vx = 0; e.st = 'lie'; e.t = 0;
        fx('land', e.x, 0, e.z, 1);
        const p = G.players[e.thrower];
        e.hp -= 14; fx('dmg', e.x, -40, e.z, 14);
        if (p) { p.score += 140; p.meter = Math.min(100, p.meter + 12); }
        G.hitstop = Math.max(G.hitstop, 5);
        if (e.hp <= 0) enemyKO(e, p);
      }
      break;
    }
  }
  if (e.st !== 'enter' && e.st !== 'thrown' && e.st !== 'grabbed') e.z = clamp(e.z, ZMIN, ZMAX);
  if (e.st !== 'enter') e.x = clamp(e.x, G.camX - 40, G.camX + VIEW_W + 40);
}

function updEAtk(e, T) {
  const R = T.reach * T.sc;
  switch (e.move) {
    case 'punch':
      e.anim = 'punch'; e.fr = e.t < 5 ? 1 : 2;
      if (e.t === 5) { enemyHit(e, R + 4, T.dmg, false); sfx('swing'); }
      if (e.t >= 16) recover(e, 22);
      break;
    case 'heavy':
      e.anim = 'punch'; e.fr = e.t < 5 ? 1 : 2;
      if (e.t < 7) e.x += e.face * 1.5;
      if (e.t === 7) { enemyHit(e, R + 6, T.dmg, true); sfx('swing'); }
      if (e.t >= 24) recover(e, 32);
      break;
    case 'dash':
      e.anim = e.t < 14 ? 'walk' : 'punch'; e.fr = e.t < 14 ? Math.floor(e.t / 3) % 4 : 2;
      e.x += e.vx; e.vx *= 0.95;
      if (e.t >= 3 && e.t <= 16 && !(e.mask & 1) && enemyHit(e, R, T.dmg, false)) e.mask |= 1;
      if (e.t >= 22) recover(e, 26);
      break;
    case 'charge':
      e.anim = 'walk'; e.fr = Math.floor(e.t / 3) % 4;
      e.x += e.vx;
      if (!(e.mask & 1) && enemyHit(e, R * 0.8, T.dmg + 2, true)) e.mask |= 1;
      if (e.t % 4 === 0) fx('dust', e.x - e.face * 12, 0, e.z);
      if (e.t >= 48 || e.x < G.camX + 14 || e.x > G.camX + VIEW_W - 14) { e.x = clamp(e.x, G.camX + 14, G.camX + VIEW_W - 14); recover(e, 36); }
      break;
    case 'combo': {
      e.anim = 'punch';
      e.fr = e.t < 4 ? 0 : e.t < 10 ? 1 : e.t < 14 ? 0 : e.t < 20 ? 2 : e.t < 26 ? 0 : 2;
      if (e.t === 4 || e.t === 14) { enemyHit(e, R + 4, T.dmg * 0.7, false); sfx('swing'); }
      if (e.t === 26) { enemyHit(e, R + 6, T.dmg * 1.3, true); sfx('swing'); }
      if (e.t < 30 && e.t % 10 < 3) e.x += e.face * 1.2;
      if (e.t >= 40) recover(e, 30);
      break;
    }
    case 'wswing':
      e.anim = 'punch'; e.fr = e.t < 6 ? 1 : 2;
      if (e.t === 6) { enemyHit(e, R + 6, T.dmg, T.weapon === 'pipe'); sfx('swing'); }
      if (e.t >= 24) recover(e, 30);
      break;
    case 'slam':
      e.anim = 'punch'; e.fr = 0;
      e.x += e.vx; e.z += e.vz; e.vy += GRAV; e.y += e.vy;
      if (e.y >= 0 && e.t > 3) {
        e.y = 0; fx('slam', e.x, 0, e.z);
        for (const p of G.players) if (vulnerable(p) && Math.abs(p.x - e.x) < 80 && Math.abs(p.z - e.z) < 30 && p.y > -20) hurtPlayer(p, T.dmg + 4, true, e.x);
        recover(e, 42);
      }
      break;
    default: recover(e, 20);
  }
}

/* ---------- items ---------- */
function dropItem(x, z, kind) {
  if (!kind) { const r = Math.random(); kind = r < 0.42 ? 'pizza' : r < 0.6 ? 'soda' : r < 0.7 ? 'burger' : r < 0.82 ? 'gem' : r < 0.91 ? 'bat' : 'pipe'; }
  G.items.push({ id: G.nid++, kind, x, z: clamp(z, ZMIN + 2, ZMAX), y: -12, vy: -2.6, t: 0 });
}
function updItems() {
  for (const it of G.items) {
    it.t++;
    if (it.y < 0 || it.vy < 0) { it.vy += GRAV; it.y += it.vy; if (it.y >= 0) { it.y = 0; it.vy = it.vy > 1.5 ? -it.vy * 0.35 : 0; } }
    if (it.t < 20) continue;
    for (const p of G.players) {
      if (!p.active || p.gone || p.st === 'out' || p.y < -6 || P_VULN_BLOCK.has(p.st) && p.st !== 'dive') continue;
      if (Math.abs(p.x - it.x) < 15 && Math.abs(p.z - it.z) < 10) {
        const I = ITEMS[it.kind];
        if (I.weapon) { if (p.wpn || p.st !== 'idle' && p.st !== 'walk') continue; p.wpn = { k: I.weapon, uses: WEAPONS[I.weapon].uses }; }
        if (I.heal) p.hp = Math.min(p.maxHp, p.hp + I.heal);
        if (I.score) p.score += I.score;
        it.taken = true;
        fx('pick', it.x, -18, it.z, I.label);
        break;
      }
    }
  }
  G.items = G.items.filter((i) => !i.taken);
}

/* ---------- replication ---------- */
const R1 = (v) => Math.round(v);
function makeSnapshot() {
  return {
    f: G.frame, st: G.stage, ph: G.phase, pt: G.phaseT, cx: Math.round(G.camX * 10) / 10, go: G.goT > 0 ? 1 : 0,
    su: G.superT, sb: G.superBy, sm: G.slowmo > 0 ? 1 : 0, mu: G.song, le: G.lastEnemyT > 0 ? G.lastEnemy : 0,
    p: G.players.map((p) => [R1(p.x), R1(p.y), R1(p.z), p.face, p.anim, p.fr, Math.round(p.rot * 100), Math.ceil(p.hp), p.maxHp,
      p.lives, p.score, Math.floor(p.meter), p.inv > 0 ? 1 : 0, p.active ? 1 : 0, p.pal, p.name, p.hits, p.st, p.flash > 0 ? 1 : 0, p.gone ? 1 : 0, p.ch, p.wpn ? p.wpn.k : '', p.lvl, p.exp, p.petLine || '', Math.floor(p.petExp)]),
    e: G.enemies.map((e) => [e.id, e.type, R1(e.x), R1(e.y), R1(e.z), e.face, e.anim, e.fr, Math.round(e.rot * 100), Math.ceil(e.hp), e.maxHp,
      e.flash > 0 ? 1 : 0, e.tele, e.st, e.rage, e.move || '']),
    b: G.barrels.map((b) => [b.id, b.x, b.z, b.broken]),
    i: G.items.map((i) => [i.id, i.kind, R1(i.x), R1(i.y), R1(i.z)]),
    w: G.proj.map((q) => [q.id, q.k, R1(q.x), R1(q.y), R1(q.z), q.face]),
    q: G.pets.map((q) => [q.id, q.owner, q.line, q.form, R1(q.x), R1(q.y), R1(q.z), q.face, q.st, q.hide ? 1 : 0]),
    x: G.fxLog.slice(-24),
  };
}

function applySnapshot(s) {
  const first = !G.gotSnap;
  G.gotSnap = true;
  if (G.stage !== s.st) { G.stage = s.st; G.trailReset = true; }
  G.phase = s.ph; G.phaseT = s.pt; G.camTarget = s.cx; if (first) G.camX = s.cx;
  G.goT = s.go ? 60 : 0; G.superT = s.su; G.superBy = s.sb; G.slowmo = s.sm ? 1 : 0;
  G.lastEnemy = s.le; G.lastEnemyT = s.le ? 60 : 0;
  if (s.mu && s.mu !== G.song) { G.song = s.mu; playSong(s.mu); }
  // players
  G.players.length = s.p.length;
  s.p.forEach((a, i) => {
    let p = G.players[i];
    if (!p) p = G.players[i] = { id: 'p' + i, pn: i, x: a[0], y: a[1], z: a[2] };
    p.tx = a[0]; p.ty = a[1]; p.tz = a[2]; p.face = a[3]; p.anim = a[4]; p.fr = a[5]; p.rot = a[6] / 100;
    p.hp = a[7]; p.maxHp = a[8]; p.lives = a[9]; p.score = a[10]; p.meter = a[11]; p.inv = a[12]; p.active = !!a[13];
    p.pal = a[14]; p.name = a[15]; p.hits = a[16]; p.st = a[17]; p.flash = a[18]; p.gone = !!a[19]; p.ch = a[20] || 'girl'; p.wpn = a[21] ? { k: a[21] } : null; p.lvl = a[22] || 1; p.exp = a[23] || 0; p.petLine = a[24] || null; p.petExp = a[25] || 0;
    if (Math.abs(p.tx - p.x) > 60 || Math.abs(p.ty - p.y) > 60) { p.x = p.tx; p.y = p.ty; p.z = p.tz; }
  });
  // enemies
  const old = new Map(G.enemies.map((e) => [e.id, e]));
  G.enemies = s.e.map((a) => {
    let e = old.get(a[0]);
    if (!e) e = { id: a[0], x: a[2], y: a[3], z: a[4] };
    e.type = a[1]; e.tx = a[2]; e.ty = a[3]; e.tz = a[4]; e.face = a[5]; e.anim = a[6]; e.fr = a[7]; e.rot = a[8] / 100;
    e.hp = a[9]; e.maxHp = a[10]; e.flash = a[11]; e.tele = a[12]; e.st = a[13]; e.rage = a[14]; e.move = a[15] || '';
    if (Math.abs(e.tx - e.x) > 80) { e.x = e.tx; e.y = e.ty; e.z = e.tz; }
    return e;
  });
  G.barrels = s.b.map((a) => ({ id: a[0], x: a[1], z: a[2], broken: a[3] }));
  G.items = s.i.map((a) => ({ id: a[0], kind: a[1], x: a[2], y: a[3], z: a[4] }));
  G.proj = (s.w || []).map((a) => ({ id: a[0], k: a[1], x: a[2], y: a[3], z: a[4], face: a[5] }));
  const oldPets = new Map(G.pets.map((q) => [q.id, q]));
  G.pets = (s.q || []).map((a) => {
    let q = oldPets.get(a[0]);
    if (!q) q = { id: a[0], x: a[4], y: a[5], z: a[6] };
    q.owner = a[1]; q.line = a[2]; q.form = a[3]; q.tx = a[4]; q.ty = a[5]; q.tz = a[6]; q.face = a[7]; q.st = a[8]; q.hide = !!a[9];
    if (Math.abs(q.tx - q.x) > 80) { q.x = q.tx; q.y = q.ty; q.z = q.tz; }
    return q;
  });
  // effects
  if (first) G.fxSeen = s.x.length ? s.x[s.x.length - 1][0] : 0;
  for (const f of s.x) if (f[0] > G.fxSeen) { G.fxSeen = f[0]; playFx(f); }
}

/** Guest-side smoothing between snapshots (called every frame). */
function guestSmooth() {
  const k = 0.45;
  for (const o of G.players.concat(G.enemies, G.pets || [])) {
    if (o.tx === undefined) continue;
    o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.z += (o.tz - o.z) * k;
  }
  if (G.camTarget !== undefined) G.camX += (G.camTarget - G.camX) * 0.5;
}
