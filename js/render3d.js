'use strict';
/* ============================================================
   3D renderer (Three.js r147). Same simulation, same HUD; this
   file swaps out renderFrame / resizeCanvas / drawCharPreviews.
   Models + animations: Quaternius Universal Base Characters and
   Universal Animation Library 1 & 2 (CC0).
   ============================================================ */
(function () {
  const U = 1 / 26;   // metres per simulation pixel (a 47px fighter ~ 1.8 m)
  const KZ = 1.5;     // stretch the walkable depth a little
  const wx = (x) => x * U;
  const wz = (z) => (z - ZMIN) * U * KZ;
  const wy = (y) => -y * U;
  const FACADE_Z = -1.7;

  const R = {
    renderer: null, scene: null, camera: null, base: {}, clips: {}, hair: {}, boneNames: new Set(),
    views: new Map(), items: new Map(), barrels: new Map(), stage: null, si: -1, mood: null,
    gradient: null, lastT: performance.now(), bolt: 500, koPos: null, thumbs: {}, rings: [],
    lamps: [], pl: [], hemi: null, sun: null, rain: null, fogPlanes: [], signs: [], camT: new THREE.Vector3(), camL: new THREE.Vector3(),
  };

  /* ---------- looks: body, hair, clothes ---------- */
  // shirt: [colour, yMin, yMax, |x| max, sleeve |x| max]; pants: [colour, yMin, yMax, |x| max]; shoes: [colour, yMax]; gloves: [colour, |x| min]
  const MALE_TANK = (c, s = 0) => [c, 0.96, 1.52, 0.205, s];
  const MALE_PANTS = (c) => [c, 0.08, 1.0, 0.3];
  const FEM_TOP = (c, s = 0) => [c, 1.1, 1.44, 0.18, s];
  const FEM_SHORTS = (c, y0 = 0.68) => [c, y0, 1.0, 0.24];
  const LOOKS = {
    p1:    { body: 'f', hair: ['long'], hairCol: 0xd8323a, skin: 0xffffff, shirt: FEM_TOP(0xce2038), pants: FEM_SHORTS(0x1b1b2a), shoes: [0xf0f0f0, 0.12], gloves: [0xffd23f, 0.66] },
    p2:    { body: 'f', hair: ['buns'], hairCol: 0x4f86ff, skin: 0xfff2ea, shirt: FEM_TOP(0x3f74ff), pants: FEM_SHORTS(0x23308f), shoes: [0xffffff, 0.12], gloves: [0xff6fd8, 0.66] },
    guy1:  { body: 'm', hair: ['simpleparted'], hairCol: 0x2a2430, skin: 0xffffff, shirt: MALE_TANK(0xf2f0f8), pants: MALE_PANTS(0x2b4fa8), shoes: [0x22222a, 0.1], gloves: [0xce2038, 0.72] },
    guy2:  { body: 'm', hair: ['buzzed'], hairCol: 0xffcf3a, skin: 0xffe6d6, shirt: MALE_TANK(0xff3d7f), pants: MALE_PANTS(0x2a2a3a), shoes: [0xffffff, 0.1], gloves: [0xffcf3a, 0.72] },
    punk:  { body: 'm', hair: ['buzzed'], hairCol: 0xe0303a, skin: 0xf0d0c0, shirt: MALE_TANK(0x1f5f5f, 0.45), pants: MALE_PANTS(0x3a5fa8), shoes: [0x1a1a1a, 0.1] },
    dash:  { body: 'f', hair: ['buns'], hairCol: 0x38c95a, skin: 0xe8c0a8, shirt: FEM_TOP(0x3e1838, 0.4), pants: FEM_SHORTS(0x3a3a48, 0.1), shoes: [0x111111, 0.12] },
    brute: { body: 'm', hair: ['beard'], hairCol: 0x6a2a8a, skin: 0xc89070, shirt: MALE_TANK(0x5a3a1a, 0.5), pants: MALE_PANTS(0x3a3346), shoes: [0x1a1a1a, 0.1], wide: 1.14 },
    batter: { body: 'f', hair: ['buns'], hairCol: 0xffd23f, skin: 0xe8c0a8, shirt: FEM_TOP(0x2a2a5a, 0.4), pants: FEM_SHORTS(0x3a2a20, 0.1), shoes: [0xf0f0f0, 0.12], gloves: [0xffffff, 0.66] },
    piper: { body: 'm', hair: ['beard'], hairCol: 0x6a5040, skin: 0xb88060, shirt: MALE_TANK(0xd87a1e, 0.5), pants: MALE_PANTS(0x2a3a4a), shoes: [0x3a2a1a, 0.1], gloves: [0x3a3a3a, 0.72], wide: 1.12 },
    elite: { body: 'm', hair: ['simpleparted'], hairCol: 0xff8a1f, skin: 0xf0d0c0, shirt: MALE_TANK(0x141018, 0.45), pants: MALE_PANTS(0x8a2030), shoes: [0x111111, 0.1], gloves: [0xff8a1f, 0.72] },
    boss1: { body: 'm', hair: ['beard', 'buzzed'], hairCol: 0xff3b1f, skin: 0xd8a080, shirt: MALE_TANK(0xd82a3a), pants: MALE_PANTS(0x1c1c1c), shoes: [0xf0f0f0, 0.1], gloves: [0xffd23f, 0.72], wide: 1.1 },
    boss2: { body: 'f', hair: ['long'], hairCol: 0xffd23f, skin: 0xf0d0b8, shirt: FEM_TOP(0x0f6a4a, 0.45), pants: FEM_SHORTS(0x0a382a, 0.1), shoes: [0xffd23f, 0.12], gloves: [0x2ec48a, 0.66] },
    boss3: { body: 'm', hair: ['beard', 'simpleparted'], hairCol: 0xe8e8f4, skin: 0xc89070, shirt: MALE_TANK(0x1a1030, 0.5), pants: MALE_PANTS(0x2a1a4c), shoes: [0xffd23f, 0.1], gloves: [0xffd23f, 0.72] },
    boss4: { body: 'm', hair: ['beard'], hairCol: 0x8adfff, skin: 0xc89070, shirt: MALE_TANK(0x5a6470, 0.5), pants: MALE_PANTS(0x3a4450), shoes: [0x222222, 0.1], gloves: [0x8adfff, 0.72], wide: 1.2 },
    boss5: { body: 'm', hair: ['beard', 'buzzed'], hairCol: 0xff1f3a, skin: 0xa87050, shirt: MALE_TANK(0x0c0a10, 0.5), pants: MALE_PANTS(0xa0101e), shoes: [0x0c0a10, 0.1], gloves: [0xff1f3a, 0.72], wide: 1.1 },
  };

  /* ---------- loading ---------- */
  function loadGLB(url) { return new Promise((res, rej) => new THREE.GLTFLoader().load(url, res, undefined, rej)); }
  function firstSkinned(root) { let m = null; root.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; }); return m; }

  window.__INIT3D = async function (onProg) {
    const cv3 = document.getElementById('game3d');
    R.renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: true, powerPreference: 'high-performance' });
    R.renderer.outputEncoding = THREE.sRGBEncoding;
    R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    R.scene = new THREE.Scene();
    R.scene.fog = new THREE.Fog(0x000000, 30, 90);
    R.camera = new THREE.PerspectiveCamera(40, 2, 0.1, 400);

    const files = ['char_m', 'char_f', 'anims', 'hair_long', 'hair_buns', 'hair_simpleparted', 'hair_buzzed', 'hair_beard'];
    const got = {}; let n = 0;
    await Promise.all(files.map(async (f) => { got[f] = await loadGLB('assets/3d/' + f + '.glb'); onProg && onProg(++n / files.length); }));
    R.base.m = got.char_m; R.base.f = got.char_f;
    firstSkinned(got.char_m.scene).skeleton.bones.forEach((b) => R.boneNames.add(b.name));
    for (const clip of got.anims.animations) {
      // merged libraries got "_1" suffixes on duplicate bone names; map them back
      for (const t of clip.tracks) {
        const dot = t.name.indexOf('.');
        let node = t.name.slice(0, dot);
        if (!R.boneNames.has(node)) { const m = node.match(/^(.*)_\d+$/); if (m && R.boneNames.has(m[1])) node = m[1]; }
        t.name = node + t.name.slice(dot);
      }
      R.clips[clip.name] = clip;
    }
    for (const h of ['long', 'buns', 'simpleparted', 'buzzed', 'beard']) R.hair[h] = firstSkinned(got['hair_' + h].scene);

    const g = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
    R.gradient = new THREE.DataTexture(g, 3, 1, THREE.RGBAFormat);
    R.gradient.minFilter = R.gradient.magFilter = THREE.NearestFilter; R.gradient.needsUpdate = true;

    setupLights();
    setupParticles();
    makeThumbs();

    window.renderFrame = renderFrame3D;
    window.resizeCanvas = resize3D;
    window.drawCharPreviews = drawPreviews3D;
    const prevFx = window.playFx;
    window.playFx = function (e) {
      prevFx(e);
      if (e[1] === 'bossko') R.koPos = new THREE.Vector3(wx(e[2]), 1.2, wz(e[4]));
      if (e[1] === 'sup') R.superPn = e[5] | 0;
    };
    resize3D();
  };

  /* ---------- materials ---------- */
  function toonMat(orig, look, tint, clothes) {
    const m = new THREE.MeshToonMaterial({
      map: orig.map || null, color: new THREE.Color(tint), gradientMap: R.gradient,
      alphaTest: orig.transparent || orig.alphaTest ? 0.45 : 0, side: orig.side,
    });
    if (m.map) m.map.encoding = THREE.sRGBEncoding;
    if (clothes) paintClothes(m, look);
    return m;
  }
  function paintClothes(m, L) {
    const v4 = (a) => new THREE.Vector4(a ? a[1] : 9, a ? a[2] : -9, a ? a[3] : 0, a && a[4] ? a[4] : 0);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.cShirt = { value: new THREE.Color(L.shirt ? L.shirt[0] : 0) };
      sh.uniforms.cPants = { value: new THREE.Color(L.pants ? L.pants[0] : 0) };
      sh.uniforms.cShoes = { value: new THREE.Color(L.shoes ? L.shoes[0] : 0) };
      sh.uniforms.cGlove = { value: new THREE.Color(L.gloves ? L.gloves[0] : 0) };
      sh.uniforms.rShirt = { value: v4(L.shirt) };
      sh.uniforms.rPants = { value: v4(L.pants) };
      sh.uniforms.rMisc = { value: new THREE.Vector4(L.shoes ? L.shoes[1] : -9, L.gloves ? L.gloves[1] : 99, 0, 0) };
      sh.vertexShader = 'varying vec3 vBP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBP = position;');
      sh.fragmentShader = 'varying vec3 vBP;\nuniform vec3 cShirt, cPants, cShoes, cGlove;\nuniform vec4 rShirt, rPants, rMisc;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    float ax = abs(vBP.x); float y = vBP.y;
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float k = 0.72 + 0.55 * lum;
    float pants = step(rPants.x, y) * step(y, rPants.y) * step(ax, rPants.z);
    float shirt = step(rShirt.x, y) * step(y, rShirt.y) * step(ax, rShirt.z);
    shirt = max(shirt, step(0.001, rShirt.w) * step(ax, rShirt.w) * step(1.33, y) * step(y, 1.58));
    float shoes = step(y, rMisc.x);
    float glove = step(rMisc.y, ax) * step(1.2, y);
    diffuseColor.rgb = mix(diffuseColor.rgb, cPants * k, pants);
    diffuseColor.rgb = mix(diffuseColor.rgb, cShirt * k, shirt);
    diffuseColor.rgb = mix(diffuseColor.rgb, cShoes * k, shoes);
    diffuseColor.rgb = mix(diffuseColor.rgb, cGlove * k, glove);
  }`);
    };
    m.customProgramCacheKey = () => 'clothes';
  }
  let OUTLINE = null;
  function outlineMat() {
    if (OUTLINE) return OUTLINE;
    OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0a0610, side: THREE.BackSide });
    OUTLINE.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n  transformed += normalize(objectNormal) * 0.014;');
    };
    OUTLINE.customProgramCacheKey = () => 'outline';
    return OUTLINE;
  }

  /* ---------- character views ---------- */
  function makeView(lookKey, sc) {
    const L = LOOKS[lookKey] || LOOKS.punk;
    const src = L.body === 'f' ? R.base.f : R.base.m;
    const model = THREE.SkeletonUtils.clone(src.scene);
    const mats = [];
    let body = null;
    const skinned = [];
    model.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    for (const o of skinned) {
      o.frustumCulled = false;
      const isBody = o.geometry.attributes.position.count > 5000;
      const isBrow = /Hair/.test(o.material.name || '');
      const m = toonMat(o.material, L, isBody ? L.skin : isBrow ? L.hairCol : 0xffffff, isBody);
      o.material = m; mats.push(m);
      if (isBody) body = o;
    }
    for (const h of L.hair.filter((n) => R.hair[n])) {
      const hs = R.hair[h];
      const hm = new THREE.SkinnedMesh(hs.geometry, toonMat(hs.material, L, L.hairCol, false));
      hm.bind(body.skeleton, hs.bindMatrix);
      hm.frustumCulled = false;
      body.parent.add(hm); mats.push(hm.material); skinned.push(hm);
    }
    for (const o of skinned) {
      if (o.geometry.attributes.position.count < 2000) continue; // eyes/brows: no outline
      const ol = new THREE.SkinnedMesh(o.geometry, outlineMat());
      ol.bind(o.skeleton, o.bindMatrix); ol.frustumCulled = false;
      o.parent.add(ol);
    }
    const pitch = new THREE.Group(); pitch.position.y = 0.95; model.position.y = -0.95; pitch.add(model);
    const yaw = new THREE.Group(); yaw.add(pitch);
    const root = new THREE.Group(); root.add(yaw);
    root.scale.setScalar(sc || 1);
    if (L.wide) model.scale.set(L.wide, 1, L.wide);
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT); blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1;
    const mixer = new THREE.AnimationMixer(model);
    let hand = null; model.traverse((o) => { if (!hand && o.isBone && o.name === 'hand_r') hand = o; });
    const ws = new THREE.Vector3(); if (hand) { model.updateMatrixWorld(true); hand.getWorldScale(ws); }
    const v = { root, yaw, pitch, model, mats, mixer, cur: null, key: '', blob, yawNow: Math.PI / 2, spin: 0, roll: 0, look: lookKey, hand, handScale: hand ? ws.x : 1, wk: null, wpn: null };
    R.scene.add(root); R.scene.add(blob);
    return v;
  }
  function dropView(v) {
    R.scene.remove(v.root); R.scene.remove(v.blob);
    v.mixer.stopAllAction(); v.mixer.uncacheRoot(v.model);
    for (const m of v.mats) m.dispose();
  }
  const BLOB_GEO = new THREE.CircleGeometry(0.42, 20);
  const BLOB_MAT = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  })();

  function play(v, name, o = {}) {
    const key = name + '|' + (o.key || '');
    const clip = R.clips[name];
    if (!clip) return;
    const speed = o.dur ? clip.duration * (1 - (o.start || 0)) / o.dur : (o.speed ?? 1);
    if (v.key === key) { if (v.cur) v.cur.timeScale = speed; return; }
    v.key = key;
    const a = v.mixer.clipAction(clip);
    const prev = v.cur;
    a.reset();
    a.setLoop(o.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !o.loop;
    a.timeScale = speed;
    if (o.start) a.time = o.start * clip.duration;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, o.fade ?? 0.08, false);
    v.cur = a;
  }

  function animPlayer(v, p) {
    const ch = p.ch || 'girl';
    switch (p.st) {
      case 'idle': return G.phase === 'end' || G.phase === 'clear' && G.phaseT > 60 ? play(v, 'Dance_Loop', { loop: 1 }) : play(v, 'Idle_Loop', { loop: 1 });
      case 'walk': return play(v, 'Jog_Fwd_Loop', { loop: 1, speed: ch === 'guy' ? 0.95 : 1.12 });
      case 'atk':
        if (p.anim === 'jab') return play(v, 'Punch_Jab', { dur: 0.24, key: 'j' });
        if (p.anim === 'punch') return play(v, 'Punch_Cross', { dur: 0.26, key: 'c' });
        if (p.anim === 'chop') return play(v, 'Sword_Regular_B', { dur: 0.26, key: 'ch' });
        return play(v, 'Melee_Hook', { dur: 0.42, key: 'h' });
      case 'watk': {
        const W = WEAPONS[(p.wpn && p.wpn.k) || 'bat'], n = Math.max(0, Math.min(2, (+String(p.anim).slice(3) || 1) - 1));
        const dur = W.ticks[n].reduce((a, b) => a + b, 0) / 60;
        return play(v, ['Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C'][n], { dur, key: 'w' + n });
      }
      case 'wthrow': return play(v, 'OverhandThrow', { dur: 0.3, start: 0.2 });
      case 'roll': return play(v, 'Roll', { dur: PLAYER.rollTicks / 60 });
      case 'taunt': return play(v, 'Yes', { dur: 1.05 });
      case 'jump': return p.fr === 0 ? play(v, 'NinjaJump_Start', { dur: 0.12 }) : play(v, 'NinjaJump_Idle_Loop', { loop: 1 });
      case 'jkick': return play(v, 'Melee_Hook', { dur: 0.3, start: 0.25 });
      case 'land': return play(v, 'NinjaJump_Land', { dur: 0.16 });
      case 'dive': return p.fr < 3 ? play(v, 'Slide_Start', { dur: 0.17 }) : play(v, 'Slide_Loop', { loop: 1 });
      case 'spin': return play(v, 'Melee_Hook', { loop: 1, speed: 2.2 });
      case 'grab':
        if (p.anim === 'kick') return play(v, 'Punch_Jab', { dur: 0.2, key: 'k' + p.fr });
        if (p.anim === 'punch' && p.fr >= 1) return play(v, 'OverhandThrow', { dur: 0.3, start: 0.3 });
        return play(v, 'Push_Loop', { loop: 1, speed: 0.4 });
      case 'hurt': return play(v, 'Hit_Chest', { dur: 0.3 });
      case 'down': case 'lie': return play(v, 'Death01', { dur: 0.55, key: 'ko' });
      case 'getup': return play(v, 'LayToIdle', { dur: 0.3 });
      case 'respawn': return play(v, 'NinjaJump_Idle_Loop', { loop: 1 });
      default: return play(v, 'Idle_Loop', { loop: 1 });
    }
  }
  function animEnemy(v, e) {
    const T = ENEMY[e.type] || {};
    const runner = e.type === 'dash' || e.type === 'boss2' || e.type === 'elite';
    switch (e.st) {
      case 'enter': case 'walk': return play(v, runner ? 'Jog_Fwd_Loop' : 'Walk_Loop', { loop: 1, speed: runner ? 1 : 1.25 * (T.spd || 1) });
      case 'idle': case 'recover': return play(v, T.boss ? 'Idle_FoldArms_Loop' : 'Idle_Loop', { loop: 1 });
      case 'wind':
        if (e.move === 'slam') return play(v, 'NinjaJump_Start', { dur: 0.35 });
        if (e.move === 'charge') return play(v, 'Sprint_Loop', { loop: 1, speed: 0.25 });
        if (e.move === 'wswing') return play(v, 'Sword_Attack', { dur: 4, key: 'w' });
        return play(v, 'Punch_Cross', { dur: 3.5, key: 'w' });
      case 'atk':
        if (e.move === 'heavy') return play(v, 'Melee_Hook', { dur: 0.4 });
        if (e.move === 'combo') return play(v, 'Sword_Regular_Combo', { dur: 0.7 });
        if (e.move === 'charge') return play(v, 'Sprint_Loop', { loop: 1, speed: 1.4 });
        if (e.move === 'dash') return e.anim === 'walk' ? play(v, 'Sprint_Loop', { loop: 1, speed: 1.3 }) : play(v, 'Punch_Cross', { dur: 0.2 });
        if (e.move === 'slam') return play(v, 'NinjaJump_Idle_Loop', { loop: 1 });
        if (e.move === 'wswing') return play(v, 'Sword_Attack', { dur: 0.4, start: 0.15 });
        return play(v, 'Punch_Cross', { dur: 0.28, key: 'a' });
      case 'hurt': return play(v, e.id % 2 ? 'Hit_Head' : 'Hit_Chest', { dur: 0.3 });
      case 'down': case 'lie': case 'dying': return play(v, 'Death01', { dur: 0.5, key: 'ko' });
      case 'getup': return play(v, 'LayToIdle', { dur: 0.27 });
      case 'grabbed': return play(v, 'Hit_Chest', { speed: 0, start: 0.35 });
      case 'thrown': return play(v, 'Death01', { speed: 0, start: 0.3, key: 'thr' });
      default: return play(v, 'Idle_Loop', { loop: 1 });
    }
  }

  function placeView(v, o, isP, dt) {
    const x = wx(o.x), y = wy(o.y), z = wz(o.z);
    v.root.position.set(x, y, z);
    const sc = isP ? 1 : (ENEMY[o.type] ? ENEMY[o.type].sc : 1);
    v.blob.position.set(x, 0.015, z);
    const h = Math.min(1, y / 3);
    v.blob.scale.setScalar(sc * (1.1 - h * 0.6));
    // facing
    const target = o.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (isP && o.st === 'spin') v.spin += dt * 26; else v.spin = 0;
    let d = target - v.yawNow; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    v.yawNow += d * Math.min(1, dt * 18);
    v.yaw.rotation.y = v.yawNow + v.spin;
    // body tilt for flying moves / thrown enemies
    let pitch = 0;
    if (isP && o.st === 'jkick') pitch = 0.5;
    if (isP && o.st === 'dive' && o.fr >= 3) pitch = -0.15;
    if (!isP && o.st === 'thrown') v.roll += dt * 14 * (o.face > 0 ? -1 : 1); else v.roll = 0;
    v.pitch.rotation.x += (pitch - v.pitch.rotation.x) * Math.min(1, dt * 14);
    v.pitch.rotation.z = v.roll;
    // flash / telegraph / blink
    let em = 0, er = 0;
    if (o.flash) em = (RFRAME >> 1) % 2 ? 0.9 : 0.3;
    if (!isP && o.tele) er = (RFRAME >> 2) % 2 ? 0.7 : 0.15;
    if (!isP && o.rage) er = Math.max(er, 0.18 + 0.1 * Math.sin(RFRAME * 0.3));
    for (const m of v.mats) m.emissive.setRGB(Math.max(em, er), em, em);
    v.root.visible = !(isP && o.inv && o.st !== 'dive' && (RFRAME >> 2) % 2) && !(!isP && o.st === 'dying' && (RFRAME >> 2) % 2);
  }

  // more variety for regular enemies: same type, different hair and outfit per id
  const VAR = {
    punk: [['buzzed'], ['simpleparted'], ['beard', 'buzzed']], dash: [['buns'], ['long'], ['buzzedfemale']], brute: [['beard'], ['beard', 'buzzed'], []],
    elite: [['simpleparted'], ['buzzed'], ['beard', 'simpleparted']], batter: [['buns'], ['long']], piper: [['beard'], ['beard', 'buzzed']],
  };
  const SHIRTS = [0x1f5f5f, 0x6a1a2a, 0x2a2a5a, 0x3a3a3a, 0x5a4a1a, 0x1a4a2a];
  function enemyLook(e) {
    const base = LOOKS[e.type] ? e.type : 'punk';
    const vars = VAR[e.type];
    if (!vars) return base;
    const key = base + '#' + (e.id % 6);
    if (!LOOKS[key]) {
      const L = Object.assign({}, LOOKS[base]);
      L.hair = vars[e.id % vars.length].filter((h) => R.hair[h]);
      if (L.shirt) L.shirt = [SHIRTS[(e.id * 7) % SHIRTS.length], ...L.shirt.slice(1)];
      LOOKS[key] = L;
    }
    return key;
  }
  function lookForPlayer(p) { return LOOKS[p.pal] ? p.pal : (p.ch === 'guy' ? 'guy1' : 'p1'); }

  /* ---------- stage ---------- */
  const MOODS = {
    dusk:  { sky: ['#2a1640', '#c0507a', '#ffb070'], hemi: [0xffd0b0, 0x3a2440, 1.0], sun: [0xffa66a, 1.25], fog: [0xb06878, 26, 95], lamps: 0, skyline: 0x5a2a52, road: 0x3a3442, side: 0x8a7a86 },
    night: { sky: ['#03031a', '#141250', '#3a1e5e'], hemi: [0x7080d0, 0x101020, 0.55], sun: [0x8090ff, 0.35], fog: [0x0b0a26, 22, 80], lamps: 1, skyline: 0x2a2a6a, road: 0x24222e, side: 0x5a5a72 },
    rain:  { sky: ['#020208', '#101428', '#1e2a44'], hemi: [0x6070b0, 0x0a0a14, 0.5], sun: [0x7080c0, 0.3], fog: [0x141c2c, 14, 60], lamps: 1, rain: 1, skyline: 0x1a2440, road: 0x1a1c26, side: 0x4a4e5e },
    fog:   { sky: ['#8890a4', '#b8c0d0', '#dde2ea'], hemi: [0xe8eef8, 0x6a7080, 1.05], sun: [0xfff0dd, 0.55], fog: [0xc4ccda, 5, 30], lamps: 0, skyline: 0x9aa0b0, road: 0x5a5c66, side: 0x9a9ca8 },
    dark:  { sky: ['#000000', '#03030a', '#08081a'], hemi: [0x304060, 0x000000, 0.12], sun: [0x203060, 0.06], fog: [0x020208, 12, 46], lamps: 1, dark: 1, skyline: 0x0a0a1a, road: 0x18181e, side: 0x3a3a44 },
  };

  function setupLights() {
    R.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1); R.scene.add(R.hemi);
    R.sun = new THREE.DirectionalLight(0xffffff, 1); R.sun.position.set(-12, 16, 14); R.scene.add(R.sun); R.scene.add(R.sun.target);
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc890, 0, 11, 1.6); R.scene.add(l); R.lamps.push(l); }
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xbcd0ff, 0, 7, 1.4); R.scene.add(l); R.pl.push(l); }
  }

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  }
  function pixelTex(img, sx, sy, sw, sh) {
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
    return t;
  }

  function buildStage3D(si) {
    if (R.stage) {
      R.scene.remove(R.stage);
      R.stage.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    }
    for (const b of R.barrels.values()) R.scene.remove(b); R.barrels.clear();
    for (const i of R.items.values()) R.scene.remove(i); R.items.clear();
    R.si = si;
    const S = STAGES[si], M = MOODS[S.mood] || MOODS.night;
    R.mood = S.mood;
    const grp = new THREE.Group();
    R.signs = []; R.lampPos = []; R.scroll = []; R.trainShake = false;
    const theme = S.theme || 'street';
    R.propKind = theme === 'street' || theme === 'pier' ? 'barrel' : 'crate';
    if (theme !== 'street') BUILD[theme](grp, S, M);
    else {
    const st = buildStage(si);
    R.st2d = st;
    const W = st.c.width * U, x0 = -st.pad * U;
    // ground floor facades: the pixel-art street from the 2D version
    const ft = new THREE.CanvasTexture(st.c);
    ft.encoding = THREE.sRGBEncoding; ft.magFilter = THREE.NearestFilter; ft.minFilter = THREE.LinearFilter; ft.generateMipmaps = false;
    ft.repeat.set(1, 96 / 240); ft.offset.set(0, 1 - 96 / 240);
    const FH3 = 96 * U;
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(W, FH3), new THREE.MeshLambertMaterial({ map: ft }));
    facade.position.set(x0 + W / 2, FH3 / 2, FACADE_Z); grp.add(facade);
    // upper floors
    const T = IMG.tileset;
    const upTex = pixelTex(T, 192, 112, 48, 96); upTex.wrapS = THREE.RepeatWrapping; upTex.wrapT = THREE.RepeatWrapping;
    upTex.repeat.set(W / (48 * U), 2);
    const UPH = 96 * U * 2;
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(W, UPH), new THREE.MeshLambertMaterial({ map: upTex, color: 0xb0a0a8 }));
    upper.position.set(x0 + W / 2, FH3 + UPH / 2, FACADE_Z - 0.01); grp.add(upper);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, 0.6), new THREE.MeshLambertMaterial({ color: 0x2a2230 }));
    cornice.position.set(x0 + W / 2, FH3 + UPH + 0.17, FACADE_Z + 0.2); grp.add(cornice);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x3a3040 }));
    ledge.position.set(x0 + W / 2, FH3 + 0.09, FACADE_Z + 0.15); grp.add(ledge);
    // window glow on upper floors at night
    if (M.lamps) {
      const winTex = canvasTex(64, 256, (g, w, h) => {
        g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
        for (let y = 20; y < h; y += 64) for (let x = 8; x < w; x += 32) if (Math.random() < 0.45) { g.fillStyle = Math.random() < 0.5 ? '#ffd27a' : '#7ad8ff'; g.fillRect(x, y, 16, 22); }
      }, [W / 4, 1]);
      const wins = new THREE.Mesh(new THREE.PlaneGeometry(W, UPH), new THREE.MeshBasicMaterial({ map: winTex, transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
      wins.position.set(x0 + W / 2, FH3 + UPH / 2, FACADE_Z + 0.02); grp.add(wins);
    }
    // sidewalk, curb, road
    const sideTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#9a98a4'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = 'rgba(40,40,50,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    }, [W / 1.6, 2.6]);
    const side = new THREE.Mesh(new THREE.PlaneGeometry(W, 4.2), new THREE.MeshLambertMaterial({ map: sideTex, color: M.side }));
    side.rotation.x = -Math.PI / 2; side.position.set(x0 + W / 2, 0, FACADE_Z + 2.1); grp.add(side);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(W, 0.16, 0.3), new THREE.MeshLambertMaterial({ color: 0x7a7884 }));
    curb.position.set(x0 + W / 2, 0.05, FACADE_Z + 4.25); grp.add(curb);
    const roadTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#3a3a44'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { const v = Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 8},0.25)`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      g.fillStyle = '#e8b020'; g.fillRect(0, 196, w, 3); g.fillRect(0, 203, w, 3);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 252, w, 4);
    }, [W / 6, 1]);
    const roadMat = S.mood === 'rain' ? new THREE.MeshPhongMaterial({ map: roadTex, color: M.road, shininess: 90, specular: 0x6070a0 }) : new THREE.MeshLambertMaterial({ map: roadTex, color: M.road });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(W, 22), roadMat);
    road.rotation.x = -Math.PI / 2; road.position.set(x0 + W / 2, -0.02, FACADE_Z + 4.4 + 11); grp.add(road);
    // far skyline
    const skyTex = new THREE.CanvasTexture(IMG.back); skyTex.encoding = THREE.sRGBEncoding;
    skyTex.wrapS = THREE.RepeatWrapping; skyTex.repeat.set(30, 1); skyTex.magFilter = THREE.NearestFilter;
    const skyline = new THREE.Mesh(new THREE.PlaneGeometry(520, 46), new THREE.MeshBasicMaterial({ map: skyTex, color: M.skyline, fog: false }));
    skyline.position.set(x0 + W / 2, 16, -70); grp.add(skyline);
    R.scene.background = canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, M.sky[0]); gr.addColorStop(0.55, M.sky[1]); gr.addColorStop(1, M.sky[2]);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    // neon signs
    R.signs = [];
    for (const s of st.signs) {
      const im1 = IMG[s.k + '1'], im2 = IMG[s.k + '2'];
      const t1 = pixelTex(im1, 0, 0, im1.width, im1.height), t2 = pixelTex(im2, 0, 0, im2.width, im2.height);
      const mat = new THREE.MeshBasicMaterial({ map: t1, transparent: true, fog: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(im1.width * U, im1.height * U), mat);
      mesh.position.set(x0 + (s.x + im1.width / 2) * U, FH3 - (s.y + im1.height / 2) * U, FACADE_Z + 0.05);
      grp.add(mesh); R.signs.push({ mesh, t1, t2, seed: s.x });
      if (M.lamps) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: s.k === 'sushi' ? 0x40d8ff : 0xff40c8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.scale.set(im1.width * U * 2.2, im1.height * U * 3, 1); glow.position.copy(mesh.position).z += 0.1; grp.add(glow);
      }
    }
    // street lamps along the back of the sidewalk
    R.lampPos = [];
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x1e2a30 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: M.lamps ? 0xffe2a0 : 0x8a8a80 });
    for (let lx = st.lamps[0] * 0.8; lx < st.c.width; lx += 330) {
      const X = x0 + lx * U;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), poleMat); pole.position.set(X, 2.6, FACADE_Z + 0.7); grp.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), poleMat); arm.position.set(X, 5.1, FACADE_Z + 1.35); grp.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.5), poleMat); head.position.set(X, 5.05, FACADE_Z + 2.0); grp.add(head);
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.4), bulbMat); bulb.position.set(X, 4.97, FACADE_Z + 2.0); grp.add(bulb);
      if (M.lamps) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.8, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        cone.position.set(X, 2.55, FACADE_Z + 2.0); grp.add(cone);
      }
      R.lampPos.push(new THREE.Vector3(X, 4.6, FACADE_Z + 2.0));
    }
    // fire hydrants
    const hydMat = new THREE.MeshToonMaterial({ color: 0xc8282e, gradientMap: R.gradient });
    for (let hx = 500; hx < st.c.width; hx += 640) {
      const hy = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10), hydMat); b.position.y = 0.35; hy.add(b);
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hydMat); c.position.y = 0.7; hy.add(c);
      const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), hydMat); n.rotation.z = Math.PI / 2; n.position.y = 0.45; hy.add(n);
      hy.position.set(x0 + hx * U, 0, FACADE_Z + 0.5); grp.add(hy);
    }
    }
    // fog banks
    R.fogPlanes = [];
    if (S.mood === 'fog') {
      for (let i = 0; i < 10; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xe8eef6, transparent: true, opacity: 0.35, depthWrite: false }));
        sp.scale.set(16, 4, 1); sp.userData = { off: i * 13, z: 1 + (i % 5) * 1.8, y: 0.6 + (i % 3) * 0.7, sp: 0.2 + (i % 4) * 0.08 };
        grp.add(sp); R.fogPlanes.push(sp);
      }
    }
    // rain
    R.rain = null;
    if (M.rain) {
      const n = 700, pos = new Float32Array(n * 6);
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      R.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa8b8ff, transparent: true, opacity: 0.45 }));
      R.rain.frustumCulled = false; R.rain.userData.drops = Array.from({ length: n }, () => [Math.random() * 30 - 15, Math.random() * 12, Math.random() * 14 - 3]);
      grp.add(R.rain);
    }
    // lighting
    R.hemi.color.setHex(M.hemi[0]); R.hemi.groundColor.setHex(M.hemi[1]); R.hemi.intensity = M.hemi[2];
    R.sun.color.setHex(M.sun[0]); R.sun.intensity = M.sun[1];
    R.scene.fog.color.setHex(M.fog[0]); R.scene.fog.near = M.fog[1]; R.scene.fog.far = M.fog[2];
    R.M = M;
    R.stage = grp; R.scene.add(grp);
  }

  const GLOW_TEX = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();


  /* ---------- themed stages (built from primitives) ---------- */
  const LAM = (c, map) => new THREE.MeshLambertMaterial({ color: c, map: map || null });
  const BAS = (c, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o));
  function bx(grp, w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); return m; }
  function cyl(grp, r, h, mat, x, y, z, seg = 12) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y, z); grp.add(m); return m; }
  function floorPlane(grp, W, x0, z0, depth, mat) { const m = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), mat); m.rotation.x = -Math.PI / 2; m.position.set(x0 + W / 2, 0, z0 + depth / 2); grp.add(m); return m; }
  function stageSpan(S) { const pad = 320; return { W: (S.len + pad * 2) * U, x0: -pad * U }; }
  function windowTex(lit, cols) {
    return canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#14141e'; g.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 14) { g.fillStyle = Math.random() < lit ? cols[Math.floor(Math.random() * cols.length)] : '#1e1e2a'; g.fillRect(x, y, 8, 10); }
    });
  }
  function towers(grp, S, zFrom, zTo, n, hMin, hMax, tex) {
    const { W, x0 } = stageSpan(S);
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, color: 0x9aa0b0 });
    for (let i = 0; i < n; i++) {
      const w = 4 + Math.random() * 8, h = hMin + Math.random() * (hMax - hMin), d = 4 + Math.random() * 6;
      bx(grp, w, h, d, mat, x0 - 20 + Math.random() * (W + 40), h / 2 - 2, zFrom + Math.random() * (zTo - zFrom));
    }
  }
  function textTex(txt, bg, fg, w = 256, h = 96, font = 'Kanit') {
    return canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = fg; g.font = `700 ${Math.round(h * 0.5)}px ${font}, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 4);
    });
  }
  function streetLamp(grp, X, Z, M) {
    const pole = LAM(0x1e2a30);
    cyl(grp, 0.08, 5.2, pole, X, 2.6, Z, 8);
    bx(grp, 0.08, 0.08, 1.4, pole, X, 5.1, Z + 0.65);
    bx(grp, 0.3, 0.05, 0.4, BAS(M.lamps ? 0xffe2a0 : 0x8a8a80), X, 4.98, Z + 1.3);
    R.lampPos.push(new THREE.Vector3(X, 4.6, Z + 1.3));
  }

  const BUILD = {
    market(grp, S, M) {
      const { W, x0 } = stageSpan(S);
      floorPlane(grp, W, x0, -4, 30, LAM(0x6a6470, canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#4a4650'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, w, 2);
      }, [W / 3, 10])));
      const stripes = [['#d82a3a', '#fff3e0'], ['#2e8be6', '#f0f6ff'], ['#ffb627', '#2e7d44'], ['#ff4f8b', '#fff0f6'], ['#2ec4b6', '#fffbe6']];
      const foods = ['หมูปิ้ง', 'ชาไทย', 'ผัดไทย', 'ส้มตำ', 'ไก่ทอด', 'ลูกชิ้น', 'ข้าวเหนียว', 'น้ำปั่น', 'โรตี', 'ขนมครก'];
      const wood = LAM(0x6a4028), pole = LAM(0x2a2a34), dark = LAM(0x1c1622);
      const goods = [0xff5a3a, 0xffd23f, 0x7dff5a, 0xff9d1f, 0xffffff, 0xd8321c].map((c) => new THREE.MeshToonMaterial({ color: c, gradientMap: R.gradient }));
      const lantern = BAS(0xff3a3a);
      let k = 0;
      for (let x = x0 + 2; x < x0 + W; x += 5.4) {
        const st = stripes[k % stripes.length], z = -1.6;
        bx(grp, 4.6, 2.6, 0.1, dark, x + 2.3, 1.3, z - 1.1);
        bx(grp, 4.4, 0.9, 1.0, wood, x + 2.3, 0.45, z);
        bx(grp, 4.5, 0.08, 1.1, LAM(0xf4efe4), x + 2.3, 0.92, z);
        for (const px of [0.1, 4.5]) for (const pz of [-1.0, 0.5]) cyl(grp, 0.05, 2.8, pole, x + px, 1.4, z + pz, 6);
        const aw = canvasTex(64, 16, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = st[i % 2]; g.fillRect(i * 8, 0, 8, 16); } });
        const awn = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.9), new THREE.MeshLambertMaterial({ map: aw, side: THREE.DoubleSide }));
        awn.rotation.x = -Math.PI / 2 + 0.35; awn.position.set(x + 2.3, 2.95, z - 0.15); grp.add(awn);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.6), new THREE.MeshBasicMaterial({ map: textTex(foods[k % foods.length], '#fff6d6', '#3a1a2a') }));
        sign.position.set(x + 2.3, 2.2, z - 1.0); grp.add(sign);
        for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), goods[(i + k) % goods.length]); m.position.set(x + 0.6 + i * 0.55, 1.08, z + (i % 2) * 0.25); grp.add(m); }
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lantern); l.scale.y = 1.2; l.position.set(x + 4.3, 2.4, z + 0.55); grp.add(l);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff5030, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.set(1.8, 1.8, 1); glow.position.copy(l.position); grp.add(glow);
        k++;
      }
      // string lights over the walkway
      const bulbs = [], cols = [0xff5d8f, 0xffd23f, 0x2ee6c5, 0xff8c42, 0xffffff];
      for (let x = x0; x < x0 + W; x += 3.2) for (let i = 0; i <= 12; i++) { const t = i / 12; bulbs.push([x + Math.sin(t * Math.PI) * 0.4, 4.7 - Math.sin(t * Math.PI) * 1.1, -1.4 + t * 9.6, cols[(i + Math.round(x)) % cols.length]]); }
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), BAS(0xffffff), bulbs.length);
      const mtx = new THREE.Matrix4(), col = new THREE.Color();
      bulbs.forEach((b, i) => { mtx.setPosition(b[0], b[1], b[2]); inst.setMatrixAt(i, mtx); inst.setColorAt(i, col.setHex(b[3])); });
      grp.add(inst);
      // buildings behind
      towers(grp, S, -10, -18, 26, 6, 16, windowTex(0.45, ['#ffd27a', '#ff9a5a', '#7ad8ff']));
      for (let x = x0 + 6; x < x0 + W; x += 9) R.lampPos.push(new THREE.Vector3(x, 3.6, 2.6));
    },

    pier(grp, S, M) {
      const { W, x0 } = stageSpan(S);
      floorPlane(grp, W, x0, -6, 14.2, new THREE.MeshPhongMaterial({ color: 0x8a6a4a, shininess: 40, specular: 0x404050, map: canvasTex(128, 128, (g, w, h) => {
        for (let y = 0; y < h; y += 16) { g.fillStyle = y % 32 ? '#6a4a30' : '#5a3e28'; g.fillRect(0, y, w, 16); g.fillStyle = '#2a1a10'; g.fillRect(0, y + 15, w, 1); g.fillRect((y * 37) % w, y, 2, 16); }
      }, [W / 4, 4]) }));
      bx(grp, W, 0.3, 0.4, LAM(0x3a2616), x0 + W / 2, 0.05, 8.2);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 200, 120), new THREE.MeshPhongMaterial({ color: 0x0a1a30, shininess: 120, specular: 0x5070b0, emissive: 0x020610 }));
      water.rotation.x = -Math.PI / 2; water.position.set(x0 + W / 2, -0.6, 68); grp.add(water);
      const bol = LAM(0x22252c);
      for (let x = x0 + 3; x < x0 + W; x += 7) { cyl(grp, 0.18, 0.6, bol, x, 0.3, 7.9, 10); }
      // shipping containers
      const ccols = [0xb8322e, 0x2e5ab8, 0x2e8a4a, 0xd8841e, 0x2a9a9a, 0x7a3ab8];
      const corr = canvasTex(64, 32, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 4) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 2, h); } g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); });
      let c = 0;
      for (let x = x0; x < x0 + W; x += 6.6 + (c % 3 === 0 ? 2.2 : 0)) {
        const stack = 1 + (c * 7 % 3);
        for (let s2 = 0; s2 < stack; s2++) bx(grp, 6.1, 2.5, 2.4, new THREE.MeshLambertMaterial({ color: ccols[(c + s2 * 2) % ccols.length], map: corr }), x + 3.05, 1.25 + s2 * 2.55, -3.6 - (s2 % 2) * 0.3);
        c++;
      }
      // cranes
      const yel = LAM(0xe0b020);
      for (let x = x0 + 20; x < x0 + W; x += 42) {
        for (const dz of [-14, -20]) bx(grp, 0.7, 24, 0.7, yel, x, 12, dz);
        for (const dz of [-14, -20]) bx(grp, 0.7, 24, 0.7, yel, x + 8, 12, dz);
        bx(grp, 10, 1.2, 8, yel, x + 4, 24, -17);
        bx(grp, 1, 1, 34, yel, x + 4, 23, -6);
        const warn = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), BAS(0xff2020)); warn.position.set(x + 4, 25, -17); grp.add(warn);
      }
      for (let x = x0 + 4; x < x0 + W; x += 12.5) streetLamp(grp, x, -1.9, M);
    },

    roof(grp, S, M) {
      const { W, x0 } = stageSpan(S);
      floorPlane(grp, W, x0, -2.2, 11, LAM(0x8a8c94, canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#7a7c86'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.07})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
        g.strokeStyle = 'rgba(40,40,50,0.4)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
      }, [W / 2.5, 4])));
      const wall = LAM(0x5a5c66);
      bx(grp, W, 1.1, 0.35, wall, x0 + W / 2, 0.55, -2.1);
      bx(grp, W, 0.55, 0.3, wall, x0 + W / 2, 0.27, 8.6);
      // the rooftop is a block standing above the street
      bx(grp, W, 40, 11, LAM(0x2a2a34), x0 + W / 2, -20.02, 3.3);
      const unit = LAM(0xb0b4bc), fan = canvasTex(64, 64, (g) => { g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#2a2e34'; g.beginPath(); g.arc(32, 32, 24, 0, 7); g.fill(); g.strokeStyle = '#9aa0a8'; g.lineWidth = 3; for (let a = 0; a < 6; a++) { g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24); g.stroke(); } });
      for (let x = x0 + 3; x < x0 + W; x += 6 + (Math.round(x) % 3)) {
        const u = bx(grp, 1.4, 1.1, 0.9, unit, x, 0.55, -1.3);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshLambertMaterial({ map: fan })); f.position.set(x, 0.6, -0.84); grp.add(f);
      }
      const tank = LAM(0x6a7a8a), leg = LAM(0x3a3a44);
      for (let x = x0 + 14; x < x0 + W; x += 26) {
        cyl(grp, 1.1, 2.2, tank, x, 3.4, -4.2, 16);
        for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) bx(grp, 0.15, 2.4, 0.15, leg, x + dx, 1.2, -4.2 + dz);
      }
      const bills = ['STREET BRAWL', 'ศึกถนนสองเรา', 'KING ZERO', 'NIGHT CITY'];
      let b = 0;
      for (let x = x0 + 22; x < x0 + W; x += 34) {
        const t = textTex(bills[b++ % bills.length], '#140a24', b % 2 ? '#ff3d7f' : '#34e6ff', 512, 128);
        const bb = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.3), new THREE.MeshBasicMaterial({ map: t }));
        bb.position.set(x, 5.6, -6.5); grp.add(bb);
        for (const dx of [-3.5, 3.5]) bx(grp, 0.2, 5.4, 0.2, leg, x + dx, 2.7, -6.6);
      }
      // helipad near the boss area
      const hp = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshLambertMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = '#3a3c44'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); g.fillStyle = '#ffffff'; g.font = '900 80px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 64, 68); }) }));
      hp.rotation.x = -Math.PI / 2; hp.position.set(x0 + W - 320 * U - 7, 0.02, 3.2); grp.add(hp);
      towers(grp, S, -14, -70, 70, 14, 60, windowTex(0.35, ['#ffd27a', '#e8eef8', '#7ad8ff']));
    },

    train(grp, S, M) {
      const { W, x0 } = stageSpan(S);
      floorPlane(grp, W, x0, -1.4, 9, LAM(0x5a6478, canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#4a5466'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
        g.fillStyle = '#d8b020'; g.fillRect(0, 10, w, 4);
      }, [W / 4, 1])));
      const wallM = LAM(0xc8ccd4), seat = LAM(0x2a5ab0), steel = new THREE.MeshPhongMaterial({ color: 0xc8ccd8, shininess: 80 });
      bx(grp, W, 3.2, 0.2, wallM, x0 + W / 2, 1.6, -1.5);
      bx(grp, W, 0.5, 0.3, LAM(0x9aa0aa), x0 + W / 2, 0.25, 7.6);
      const city = canvasTex(512, 128, (g, w, h) => {
        g.fillStyle = '#06061a'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) { const bw = 10 + Math.random() * 30, bh = 20 + Math.random() * 90, bxp = Math.random() * w; g.fillStyle = '#10102a'; g.fillRect(bxp, h - bh, bw, bh); for (let y = h - bh + 4; y < h; y += 8) for (let xx = bxp + 2; xx < bxp + bw - 3; xx += 6) if (Math.random() < 0.4) { g.fillStyle = Math.random() < 0.7 ? '#ffd27a' : '#7ad8ff'; g.fillRect(xx, y, 3, 4); } }
      });
      city.wrapS = THREE.RepeatWrapping; R.scroll.push(city);
      const glass = new THREE.MeshBasicMaterial({ map: city });
      const frame = LAM(0x6a707c);
      const carLen = 21;
      for (let cx = x0; cx < x0 + W; cx += carLen) {
        for (let i = 0; i < 5; i++) {
          const wxp = cx + 2.4 + i * 3.6;
          const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.2), glass); win.position.set(wxp, 1.95, -1.38); grp.add(win);
          bx(grp, 2.8, 0.1, 0.12, frame, wxp, 2.6, -1.36); bx(grp, 2.8, 0.1, 0.12, frame, wxp, 1.3, -1.36);
          bx(grp, 2.6, 0.18, 0.7, seat, wxp, 0.5, -1.0); bx(grp, 2.6, 0.6, 0.15, seat, wxp, 0.85, -1.33);
          bx(grp, 2.6, 0.45, 0.6, LAM(0x2a2e38), wxp, 0.2, -1.05);
          cyl(grp, 0.04, 2.9, steel, wxp + 1.7, 1.45, -0.5, 8);
        }
        bx(grp, 0.5, 3.2, 0.3, LAM(0x2a2a30), cx + 0.2, 1.6, -1.4);
        const light = bx(grp, carLen - 2, 0.12, 0.25, BAS(0xf0f4ff), cx + carLen / 2, 3.05, -1.3);
        R.signs.push({ flick: light });
        cyl(grp, 0.035, carLen - 1, steel, cx + carLen / 2, 2.7, 0.1, 6).rotation.z = Math.PI / 2;
        for (let i = 0; i < 12; i++) bx(grp, 0.12, 0.28, 0.04, LAM(0xf0f0f0), cx + 1.4 + i * 1.6, 2.5, 0.1);
        for (let i = 0; i < 3; i++) R.lampPos.push(new THREE.Vector3(cx + 4 + i * 6.5, 2.8, 2.4));
      }
      R.trainShake = true;
    },
  };

  /* ---------- props: barrels + items ---------- */
  const BARREL_TEX = (() => canvasTex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5a2a10'); gr.addColorStop(0.5, '#c8641e'); gr.addColorStop(1, '#5a2a10');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1408'; g.fillRect(0, 10, w, 5); g.fillRect(0, 48, w, 5);
  }))();
  const CRATE_TEX = (() => canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#a8743a'; g.fillRect(0, 0, w, h); g.fillStyle = '#7a4e22';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 3); g.fillRect(0, 0, 5, h); g.fillRect(w - 5, 0, 5, h);
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4); g.fillRect(-44, -3, 88, 6); g.restore();
  }))();
  function crateMesh() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), new THREE.MeshToonMaterial({ map: CRATE_TEX, gradientMap: R.gradient }));
    m.position.y = 0.475; const g = new THREE.Group(); g.add(m); return g;
  }
  function barrelMesh() {
    if (R.propKind === 'crate') return crateMesh();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 14), new THREE.MeshToonMaterial({ map: BARREL_TEX, gradientMap: R.gradient }));
    m.position.y = 0.6; const g = new THREE.Group(); g.add(m); return g;
  }
  function weaponMesh(k) {
    const g = new THREE.Group();
    if (k === 'bat') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.025, 0.95, 10), new THREE.MeshToonMaterial({ color: 0xd8a868, gradientMap: R.gradient }));
      m.position.y = 0.38; g.add(m);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), new THREE.MeshToonMaterial({ color: 0x2a1a10, gradientMap: R.gradient })); grip.position.y = -0.05; g.add(grip);
    } else {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 10), new THREE.MeshPhongMaterial({ color: 0x9aa4b0, shininess: 90, specular: 0xffffff }));
      m.position.y = 0.35; g.add(m);
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), new THREE.MeshPhongMaterial({ color: 0x6a7280 })); j.position.y = 0.78; g.add(j);
    }
    return g;
  }
  function attachWeapon(v, k) {
    if (v.wk === k) return;
    if (v.wpn) { v.wpn.parent.remove(v.wpn); v.wpn = null; }
    v.wk = k;
    if (!k || !v.hand) return;
    const w = weaponMesh(k);
    // hand bone space: point the weapon out of the fist
    w.rotation.set(W_ROT[0], W_ROT[1], W_ROT[2]); w.position.set(W_POS[0], W_POS[1], W_POS[2]);
    const s = 1 / (v.handScale || 1); w.scale.setScalar(s);
    v.hand.add(w); v.wpn = w;
  }
  const W_ROT = [0, 0, Math.PI / 2], W_POS = [0.02, 0.06, 0];
  function itemMesh(kind) {
    if (kind === 'bat' || kind === 'pipe') {
      const g = new THREE.Group(); const w = weaponMesh(kind); w.rotation.z = Math.PI / 2; w.position.y = 0.05; g.add(w);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(1.3, 0.8, 1); g.add(glow); g.userData.flat = true; return g;
    }
    const T = (c, e = 0) => new THREE.MeshToonMaterial({ color: c, emissive: e, gradientMap: R.gradient });
    const g = new THREE.Group();
    if (kind === 'pizza') {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 3, 1, false, 0, Math.PI * 2), T(0xffd23f, 0x332200)); s.scale.set(1.2, 1, 0.8); g.add(s);
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.07, 10), T(0xd8321c)); p.position.set(-0.08 + i * 0.08, 0.02, (i % 2) * 0.08 - 0.04); g.add(p); }
    } else if (kind === 'burger') {
      [[0.28, 0.1, 0xe09a3a, 0.2], [0.3, 0.05, 0x4fc23a, 0.12], [0.3, 0.09, 0x6a3416, 0.05], [0.28, 0.08, 0xe09a3a, -0.04]].forEach(([r, h, c, y]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), T(c, 0x110800)); m.position.y = y; g.add(m); });
    } else if (kind === 'soda') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 14), T(0xff3d7f, 0x330010)); g.add(c);
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.1, 14), T(0xffffff)); g.add(w);
    } else {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), T(0x34e6ff, 0x0a4a5a)); g.add(m);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color: kind === 'gem' ? 0x34e6ff : 0xffd23f, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(1.1, 1.1, 1); g.add(glow);
    return g;
  }

  /* ---------- particles ---------- */
  const CAP = 900;
  function setupParticles() {
    const mk = (blending) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAP * 3), 3));
      geo.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(CAP * 4), 4));
      geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(CAP), 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending,
        vertexShader: 'attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;\nvoid main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec4 vCol;\nvoid main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vCol.rgb, vCol.a * smoothstep(0.5, 0.05, r)); }',
      });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; R.scene.add(pts);
      return pts;
    };
    R.ptsAdd = mk(THREE.AdditiveBlending);
    R.ptsNorm = mk(THREE.NormalBlending);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; R.scene.add(m); R.rings.push(m);
    }
  }
  const tmpC = new THREE.Color();
  function writeParticles() {
    const A = R.ptsAdd.geometry.attributes, Nn = R.ptsNorm.geometry.attributes;
    let na = 0, nn = 0, nr = 0;
    const push = (P, x, y, z, col, a, size) => {
      const tgt = P === 'a' ? A : Nn; const i = P === 'a' ? na++ : nn++;
      if (i >= CAP) return;
      tgt.position.array[i * 3] = x; tgt.position.array[i * 3 + 1] = y; tgt.position.array[i * 3 + 2] = z;
      tmpC.set(col); tgt.aCol.array[i * 4] = tmpC.r; tgt.aCol.array[i * 4 + 1] = tmpC.g; tgt.aCol.array[i * 4 + 2] = tmpC.b; tgt.aCol.array[i * 4 + 3] = a;
      tgt.aSize.array[i] = size;
    };
    for (const p of PARTS) {
      if (p.life < 0 || p.type === 'rain' || p.type === 'splash') continue;
      const k = p.life / p.max;
      const x = wx(p.x), y = Math.max(0.03, wy(p.y)) , z = wz(p.z) + 0.3;
      switch (p.type) {
        case 'spark': push('a', x, y, z, p.col, 1 - k * 0.6, 0.12); break;
        case 'flame': push('a', x, y, z, p.col, 1 - k, 0.22); break;
        case 'star': { const s = (k < 0.3 ? k / 0.3 : 1 - (k - 0.3)) * p.size * 0.09; push('a', x, y, z + 0.2, '#fff6c0', 1, s); push('a', x, y, z + 0.2, '#ffd23f', 0.6, s * 1.8); break; }
        case 'boom': push('a', x, y, z, '#ffb040', 1 - k, p.size * 0.12 * (0.4 + k)); push('a', x, y, z, '#ffffff', (1 - k) * 0.8, p.size * 0.05); break;
        case 'dust': push('n', x, Math.max(0.1, y), z, '#d2c8e6', 0.45 * (1 - k), p.size * 0.09 * (0.6 + k)); break;
        case 'chunk': push('n', x, y, z, p.col, k > 0.8 ? (1 - k) * 5 : 1, 0.14); break;
        case 'ring': case 'shock': {
          if (nr >= R.rings.length) break;
          const m = R.rings[nr++]; m.visible = true;
          const r = Math.max(0.05, p.size * k * U * (p.type === 'shock' ? 1.2 : 1.6));
          m.scale.set(r, r, r); m.position.set(x, p.type === 'shock' ? 0.05 : y, z);
          if (p.type === 'shock') m.rotation.set(-Math.PI / 2, 0, 0); else m.quaternion.copy(R.camera.quaternion);
          m.material.color.set(p.col || '#ffd23f'); m.material.opacity = 1 - k;
          break;
        }
      }
    }
    for (let i = nr; i < R.rings.length; i++) R.rings[i].visible = false;
    for (const [P, n] of [[R.ptsAdd, na], [R.ptsNorm, nn]]) {
      const at = P.geometry.attributes;
      P.geometry.setDrawRange(0, Math.min(n, CAP));
      at.position.needsUpdate = at.aCol.needsUpdate = at.aSize.needsUpdate = true;
      P.material.uniforms.uScale.value = R.renderer.domElement.height / (2 * Math.tan((R.camera.fov * Math.PI) / 360));
    }
  }


  /* ---------- pets ---------- */
  R.petGltf = {}; R.petLoad = {}; R.petBaseH = {}; R.petThumbs = {};
  const PET_YAW = {};   // per-model correction if a model does not face +Z
  function loadPet(m) {
    if (!R.petLoad[m]) R.petLoad[m] = loadGLB('assets/3d/pets/' + m + '.glb').then((g) => {
      R.petGltf[m] = g;
      const box = new THREE.Box3().setFromObject(g.scene); R.petBaseH[m] = Math.max(0.01, box.max.y - box.min.y);
      return g;
    }).catch((e) => { console.error('pet', m, e); });
    return R.petLoad[m];
  }
  function petClip(g, kind) {
    const A = g.animations, f = (re) => A.find((c) => re.test(c.name));
    const fly = f(/flying/i);
    switch (kind) {
      case 'idle': return f(/idle/i) || fly || A[0];
      case 'walk': return fly || f(/_?walk(?!slow)/i) || f(/run/i) || f(/jump/i) || A[0];
      case 'run': return fly || f(/run/i) || f(/walk/i) || f(/jump/i) || A[0];
      case 'atk': return f(/attack(?!2)/i) || f(/jump/i) || A[0];
      case 'roar': return f(/attack2/i) || f(/attack/i) || f(/jump/i) || A[0];
      default: return f(/idle/i) || A[0];
    }
  }
  function makePetView(line, form) {
    const F = PET_LINES[line].forms[form], g = R.petGltf[F.m];
    const model = THREE.SkeletonUtils.clone(g.scene);
    const mats = [], skinned = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = false;
      const src = Array.isArray(o.material) ? o.material : [o.material];
      const out = src.map((m) => { const t = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : new THREE.Color(0xffffff), gradientMap: R.gradient, map: m.map || null }); mats.push(t); return t; });
      o.material = Array.isArray(o.material) ? out : out[0];
      if (o.isSkinnedMesh) skinned.push(o);
    });
    for (const o of skinned) { const ol = new THREE.SkinnedMesh(o.geometry, outlineMat()); ol.bind(o.skeleton, o.bindMatrix); ol.frustumCulled = false; o.parent.add(ol); }
    const sc = F.h / (R.petBaseH[F.m] || 1);
    model.scale.multiplyScalar(sc);
    model.rotation.y = PET_YAW[F.m] || 0;
    const pitch = new THREE.Group(); pitch.add(model);
    const yaw = new THREE.Group(); yaw.add(pitch);
    const root = new THREE.Group(); root.add(yaw);
    if (F.crown) {
      const gold = new THREE.MeshToonMaterial({ color: 0xffd23f, emissive: 0x4a3000, gradientMap: R.gradient });
      const crown = new THREE.Group();
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.14, 12, 1, true), gold); crown.add(band);
      for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), gold); const a = (i / 5) * Math.PI * 2; sp.position.set(Math.cos(a) * 0.22, 0.15, Math.sin(a) * 0.22); crown.add(sp); }
      crown.position.y = F.h * 0.98; crown.scale.setScalar(F.h * 0.9); root.add(crown); mats.push(gold);
    }
    const blob = new THREE.Mesh(BLOB_GEO, BLOB_MAT); blob.rotation.x = -Math.PI / 2;
    const mixer = new THREE.AnimationMixer(model);
    const v = { root, yaw, pitch, model, mats, mixer, cur: null, key: '', blob, yawNow: Math.PI / 2, spin: 0, roll: 0, pet: true, g, F, line, form };
    R.scene.add(root); R.scene.add(blob);
    return v;
  }
  function animPet(v, q) {
    const g = v.g, kind = q.st === 'evolve' ? 'idle' : q.st;
    const clip = petClip(g, kind);
    if (!clip) return;
    const key = clip.name + '|' + (kind === 'atk' || kind === 'roar' ? q.st + q.id + (q.tgt || '') : '');
    if (v.key === key) return;
    v.key = key;
    const a = v.mixer.clipAction(clip), prev = v.cur;
    a.reset();
    const once = kind === 'atk' || kind === 'roar';
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    a.timeScale = once ? clip.duration / (kind === 'roar' ? 0.66 : 0.36) : kind === 'run' ? 1.3 : 1;
    a.play(); if (prev && prev !== a) a.crossFadeFrom(prev, 0.12, false);
    v.cur = a;
  }
  function placePet(v, q, dt) {
    const x = wx(q.x), y = wy(q.y), z = wz(q.z);
    v.root.position.set(x, y, z);
    v.blob.position.set(x, 0.015, z); v.blob.scale.setScalar(Math.max(0.5, v.F.h * 0.9));
    const target = q.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    let d = target - v.yawNow; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    v.yawNow += d * Math.min(1, dt * 10);
    const evo = q.st === 'evolve';
    v.spin = evo ? v.spin + dt * 14 : 0;
    v.yaw.rotation.y = v.yawNow + v.spin;
    const pulse = evo ? 1 + Math.sin(RFRAME * 0.6) * 0.15 : 1;
    v.pitch.scale.setScalar(pulse);
    let em = evo ? 0.5 + 0.4 * Math.sin(RFRAME * 0.5) : 0;
    const aura = v.F.aura;
    for (const m of v.mats) {
      if (aura && !evo) { m.emissive.setHex(aura); m.emissiveIntensity = 0.18 + 0.1 * Math.sin(RFRAME * 0.2); }
      else { m.emissive.setRGB(em, em, em); m.emissiveIntensity = 1; }
    }
    if (aura && RFRAME % 3 === 0) addPart({ type: 'flame', x: q.x + rnd(-14, 14) * v.F.h, y: q.y - rnd(4, 40) * v.F.h, z: q.z, vx: 0, vy: -rnd(0.4, 1.1), life: 0, max: 18, col: '#' + new THREE.Color(aura).getHexString(), size: 2 });
    if (evo && RFRAME % 2 === 0) addPart({ type: 'spark', x: q.x + rnd(-20, 20), y: q.y - rnd(0, 50), z: q.z, vx: rnd(-1, 1), vy: -rnd(1, 2.5), life: 0, max: 20, col: ['#ffffff', '#ffd23f', '#34e6ff'][RFRAME % 3], size: 1 });
  }
  function syncPets(dt, mixDt, seen) {
    for (const q of G.pets || []) {
      if (q.hide || q.x === undefined || !PET_LINES[q.line]) continue;
      const F = PET_LINES[q.line].forms[q.form | 0];
      if (!R.petGltf[F.m]) { loadPet(F.m); continue; }
      const key = 'q' + q.id + ':' + q.form;
      let v = R.views.get(key);
      if (!v) { v = makePetView(q.line, q.form | 0); R.views.set(key, v); }
      seen.add(key);
      animPet(v, q); placePet(v, q, dt); v.mixer.update(mixDt);
    }
  }
  function petThumb(line, form) {
    const k = line + form;
    if (R.petThumbs[k]) return R.petThumbs[k];
    const F = PET_LINES[line].forms[form];
    if (!R.petGltf[F.m]) { loadPet(F.m); return null; }
    const v = makePetView(line, form);
    const h = F.h;
    v.mixer.clipAction(petClip(v.g, 'idle')).play(); v.mixer.update(0.3);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(2, 4, 5); sc.add(dl);
    R.scene.remove(v.root); R.scene.remove(v.blob); sc.add(v.root);
    v.root.position.set(0, PET_LINES[line].fly ? -h * 0.1 : 0, 0); v.yaw.rotation.y = Math.PI / 2 + 0.45;
    const cam = new THREE.PerspectiveCamera(30, 160 / 110, 0.05, 200);
    const box = new THREE.Box3().setFromObject(v.root); const c = box.getCenter(new THREE.Vector3()); const size = box.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.y * 1.45, size.z) * 1.9 + 0.3;
    cam.position.set(c.x + dist * 0.25, c.y + dist * 0.18, c.z + dist); cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(160, 110); rt.texture.encoding = THREE.sRGBEncoding;
    R.renderer.setRenderTarget(rt); R.renderer.setClearColor(0x000000, 0); R.renderer.clear(); R.renderer.render(sc, cam);
    const px = new Uint8Array(160 * 110 * 4); R.renderer.readRenderTargetPixels(rt, 0, 0, 160, 110, px); R.renderer.setRenderTarget(null); rt.dispose();
    const cv2 = document.createElement('canvas'); cv2.width = 160; cv2.height = 110;
    const g2 = cv2.getContext('2d'), id = g2.createImageData(160, 110);
    for (let y = 0; y < 110; y++) id.data.set(px.subarray((109 - y) * 640, (110 - y) * 640), y * 640);
    g2.putImageData(id, 0, 0);
    sc.remove(v.root); v.mixer.stopAllAction(); for (const m of v.mats) m.dispose();
    R.petThumbs[k] = cv2;
    return cv2;
  }
  function drawPetRows() {
    const rows = document.querySelectorAll('.pet-row');
    if (!rows.length || (APP.screen !== 'scrSelect' && APP.screen !== 'scrLobby')) return;
    const line = APP.save.pet, f = petForm(APP.save.pets[line] || 0);
    const th = petThumb(line, f);
    for (const r of rows) {
      const c = r.querySelector('.pet-thumb'); const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
      if (th) g.drawImage(th, 0, Math.sin(RFRAME * 0.08) * 2); else { g.fillStyle = '#a99cc9'; g.font = '14px Kanit, sans-serif'; g.textAlign = 'center'; g.fillText('กำลังโหลด…', 80, 60); }
    }
  }

  /* ---------- per-frame sync ---------- */
  function syncWorld(dt) {
    const seen = new Set();
    const mixDt = G.superT > 0 ? 0 : G.hitstop > 0 ? dt * 0.05 : G.slowmo > 0 ? dt * 0.35 : dt;
    for (const p of G.players) {
      if (p.gone || p.st === 'out' || p.x === undefined) continue;
      const look = lookForPlayer(p), key = 'p' + p.pn + ':' + look;
      let v = R.views.get(key);
      if (!v) { v = makeView(look, 1); R.views.set(key, v); }
      seen.add(key);
      attachWeapon(v, p.wpn ? p.wpn.k : null);
      animPlayer(v, p); placeView(v, p, true, dt); v.mixer.update(mixDt);
      if (p.st === 'dive' && p.fr >= 3) addPart({ type: 'flame', x: p.x - p.face * 8 + rnd(-4, 4), y: p.y - rnd(10, 30), z: p.z, vx: -p.face * rnd(0.3, 1), vy: rnd(-0.6, 0.2), life: 0, max: 18, col: FIRE[Math.floor(Math.random() * 3)], size: 2 });
      if (p.st === 'spin' && RFRAME % 2 === 0) addPart({ type: 'spark', x: p.x + rnd(-34, 34), y: p.y - rnd(6, 40), z: p.z, vx: rnd(-2, 2), vy: rnd(-1.5, 0), life: 0, max: 14, col: HOT[Math.floor(Math.random() * 4)], size: 1 });
    }
    for (const e of G.enemies) {
      if (!ENEMY[e.type]) continue;
      const key = 'e' + e.id;
      let v = R.views.get(key);
      if (!v) { v = makeView(enemyLook(e), ENEMY[e.type].sc); R.views.set(key, v); }
      attachWeapon(v, ENEMY[e.type].weapon && !['down', 'lie', 'dying', 'thrown'].includes(e.st) ? ENEMY[e.type].weapon : null);
      seen.add(key);
      animEnemy(v, e); placeView(v, e, false, dt); v.mixer.update(mixDt);
      if (e.rage && RFRAME % 3 === 0) addPart({ type: 'flame', x: e.x + rnd(-14, 14), y: e.y - rnd(4, 60), z: e.z, vx: 0, vy: -rnd(0.4, 1.2), life: 0, max: 18, col: FIRE[2 + Math.floor(Math.random() * 3)], size: 2 });
    }
    syncPets(dt, mixDt, seen);
    for (const [k, v] of R.views) if (!seen.has(k)) { dropView(v); R.views.delete(k); }
    // barrels
    const bs = new Set();
    for (const b of G.barrels) {
      let m = R.barrels.get(b.id);
      if (!m) { m = barrelMesh(); R.scene.add(m); R.barrels.set(b.id, m); }
      bs.add(b.id);
      m.position.set(wx(b.x), 0, wz(b.z));
      if (b.broken) { m.scale.set(1.15, 0.45, 1.15); m.rotation.z = 0.25; } else { m.scale.set(1, 1, 1); m.rotation.z = 0; }
    }
    for (const [id, m] of R.barrels) if (!bs.has(id)) { R.scene.remove(m); R.barrels.delete(id); }
    // items
    const is = new Set();
    for (const it of G.items) {
      let m = R.items.get(it.id);
      if (!m) { m = itemMesh(it.kind); R.scene.add(m); R.items.set(it.id, m); }
      is.add(it.id);
      m.position.set(wx(it.x), 0.35 + wy(it.y) + Math.sin((RFRAME + it.id * 9) * 0.08) * 0.08, wz(it.z));
      if (!m.userData.flat) m.rotation.y += dt * 2; else m.position.y = 0.12;
    }
    for (const [id, m] of R.items) if (!is.has(id)) { R.scene.remove(m); R.items.delete(id); }
    // thrown weapons
    R.proj = R.proj || new Map();
    const ps = new Set();
    for (const q of G.proj || []) {
      let m = R.proj.get(q.id);
      if (!m) { m = weaponMesh(q.k); R.scene.add(m); R.proj.set(q.id, m); }
      ps.add(q.id);
      m.position.set(wx(q.x), wy(q.y), wz(q.z)); m.rotation.z -= dt * 22 * (q.face || 1);
    }
    for (const [id, m] of R.proj) if (!ps.has(id)) { R.scene.remove(m); R.proj.delete(id); }
  }

  let ATTRACT = null;
  function syncAttract(dt) {
    if (!ATTRACT) ATTRACT = [makeView('p1', 1), makeView('guy1', 1), makeView('boss1', 1.45)];
    const cx = 18 + Math.sin(RFRAME * 0.002) * 4;
    const pos = [[cx - 1.6, 2.6, 1], [cx - 0.2, 3.6, 1], [cx + 2.6, 2.9, -1]];
    ATTRACT.forEach((v, i) => {
      v.root.visible = true;
      play(v, i === 2 ? 'Idle_FoldArms_Loop' : 'Idle_Loop', { loop: 1 });
      v.root.position.set(pos[i][0], 0, pos[i][1]); v.blob.position.set(pos[i][0], 0.015, pos[i][1]);
      v.yawNow = pos[i][2] > 0 ? 0.9 : -0.9; v.yaw.rotation.y = v.yawNow;
      v.mixer.update(dt);
    });
    R.attractX = cx;
  }
  function hideAttract() { if (ATTRACT) { for (const v of ATTRACT) dropView(v); ATTRACT = null; } }

  /* ---------- camera + lights per frame ---------- */
  function updateCamera(dt, world) {
    const aspect = R.renderer.domElement.width / Math.max(1, R.renderer.domElement.height);
    const dist = 12.5, pitch = 0.3;
    const wantW = VIEW_W * U + 1.2;
    const fov = clamp((2 * Math.atan(wantW / (2 * dist * aspect)) * 180) / Math.PI, 26, 62);
    if (Math.abs(R.camera.fov - fov) > 0.01) { R.camera.fov = fov; R.camera.updateProjectionMatrix(); }
    let look, d = dist;
    if (world) look = new THREE.Vector3(wx(G.camX + VIEW_W / 2), 1.1, 2.6);
    else look = new THREE.Vector3(R.attractX || 18, 1.2, 2.8);
    if (world && FXS.cutin && G.players[R.superPn || 0]) { const p = G.players[R.superPn || 0]; look = new THREE.Vector3(wx(p.x), 1.3 + wy(p.y), wz(p.z)); d = 5.2; }
    else if (world && FXS.ko > 60 && R.koPos) { look = R.koPos.clone(); d = 7; }
    const camPos = new THREE.Vector3(look.x, look.y + d * Math.sin(pitch), look.z + d * Math.cos(pitch));
    const k = Math.min(1, dt * (FXS.cutin ? 10 : 6));
    R.camT.lerp(camPos, R.camT.lengthSq() ? k : 1); R.camL.lerp(look, R.camL.lengthSq() ? k : 1);
    R.camera.position.copy(R.camT);
    if (FXS.shake) R.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * FXS.shake * 0.05, (Math.random() - 0.5) * FXS.shake * 0.04, 0));
    R.camera.lookAt(R.camL);
    R.sun.position.set(R.camL.x - 12, 16, 14); R.sun.target.position.copy(R.camL);

    // lamps: light the four closest to the camera
    const M = R.M || {};
    const lamps = (R.lampPos || []).slice().sort((a, b) => Math.abs(a.x - R.camL.x) - Math.abs(b.x - R.camL.x));
    R.lamps.forEach((l, i) => {
      const p = lamps[i];
      if (!M.lamps || !p) { l.intensity = 0; return; }
      l.position.copy(p);
      const flick = M.dark ? (((RFRAME + i * 97) % 211) < 8 ? 0.1 : 1) : 1;
      l.intensity = (M.dark ? 2.2 : 1.6) * flick;
    });
    // fighters carry a little light in the blackout stage
    R.pl.forEach((l, i) => {
      const p = world && G.players[i];
      if (!M.dark || !p || p.gone || p.st === 'out') { l.intensity = 0; return; }
      l.position.set(wx(p.x), 2.2 + wy(p.y), wz(p.z) + 0.8); l.intensity = 1.4;
    });
    // lightning in the rain stage
    if (M.rain && world) {
      if (--R.bolt <= 0) { FXS.lightning = 0.9; R.bolt = 480 + Math.random() * 600; setTimeout(() => sfx('thunder'), 300); }
      R.hemi.intensity = M.hemi[2] + Math.max(0, FXS.lightning) * 2.2;
    }
    // signs flicker
    for (const s of R.signs) {
      if (s.flick) { s.flick.visible = ((RFRAME + s.flick.id * 31) % 173) > 9; continue; }
      const on = ((RFRAME + s.seed) >> 4) % 7 !== 0 && !(M.dark && ((RFRAME + s.seed) >> 3) % 5 === 0); s.mesh.material.map = on ? s.t1 : s.t2;
    }
    for (const t of R.scroll || []) t.offset.x += dt * 0.35;
    if (R.trainShake) { R.camera.position.y += Math.sin(RFRAME * 0.9) * 0.012; R.camera.rotation.z += Math.sin(RFRAME * 0.05) * 0.003; }
    // fog banks drift
    for (const f of R.fogPlanes) { const u = f.userData; f.position.set(R.camL.x - 12 + ((RFRAME * u.sp * 0.02 + u.off) % 26), u.y, u.z); }
    // rain
    if (R.rain) {
      const pos = R.rain.geometry.attributes.position.array, drops = R.rain.userData.drops;
      drops.forEach((d, i) => {
        d[1] -= dt * 18; d[0] -= dt * 3;
        if (d[1] < 0) { d[1] = 10 + Math.random() * 3; d[0] = Math.random() * 30 - 15; if (Math.random() < 0.3) addPart({ type: 'dust', x: (R.camL.x + d[0]) / U, y: -1, z: ZMIN + Math.random() * (ZMAX - ZMIN), vx: 0, vy: -0.1, life: 0, max: 8, size: 2 }); }
        const X = R.camL.x + d[0], Z = d[2];
        pos.set([X, d[1], Z, X + 0.08, d[1] + 0.45, Z], i * 6);
      });
      R.rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ---------- main frame ---------- */
  function renderFrame3D() {
    RFRAME++;
    updParts();
    const now = performance.now();
    const dt = Math.min(0.05, (now - R.lastT) / 1000); R.lastT = now;
    const world = G && G.players && !(G.mode === 'guest' && !G.gotSnap) ? G : null;
    const si = world ? G.stage : 1;
    if (si !== R.si) buildStage3D(si);
    if (world) { hideAttract(); syncWorld(dt); }
    else {
      for (const [k, v] of R.views) { dropView(v); R.views.delete(k); }
      syncAttract(dt);
    }
    updateCamera(dt, world);
    writeParticles();
    R.renderer.render(R.scene, R.camera);

    // HUD on the 2D canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (FXS.cutin) { ctx.fillStyle = 'rgba(10,0,20,0.45)'; ctx.fillRect(0, 0, cv.width, cv.height); }
    if (FXS.flash > 0) { ctx.globalAlpha = Math.min(1, FXS.flash); ctx.fillStyle = FXS.flashCol; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
    if (FXS.lightning > 0) { ctx.globalAlpha = Math.min(0.7, FXS.lightning); ctx.fillStyle = '#e8f0ff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.globalAlpha = 1; }
    if (G && G.players) {
      const saved = TEXTS.splice(0, TEXTS.length);
      const v3 = new THREE.Vector3();
      for (const t of saved) {
        v3.set(wx(t.x), wy(t.y) + 0.4, wz(t.z)).project(R.camera);
        if (v3.z > 1) continue;
        const px = (v3.x + 1) / 2 * cv.width, py = (1 - v3.y) / 2 * cv.height;
        TEXTS.push({ x: (px - OX) / SC, y: 0, z: (py - OY) / SC + CROP, t: t.t, txt: t.txt, col: t.col, big: t.big });
      }
      drawHUD(0, 0, 0);
      TEXTS.length = 0; TEXTS.push(...saved);
    }
  }

  function resize3D() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = window.innerWidth, h = window.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    RW = clamp(Math.round(SH * (w / h)), VIEW_W, 520);
    SC = Math.min(cv.width / RW, cv.height / SH);
    OX = Math.round((cv.width - RW * SC) / 2); OY = Math.round((cv.height - SH * SC) / 2);
    if (R.renderer) { R.renderer.setPixelRatio(Math.min(dpr, 2)); R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); }
  }

  /* ---------- thumbnails (select screen) + HUD portraits ---------- */
  function snap(v, w, h, camPos, look, anim, t) {
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.1));
    const d = new THREE.DirectionalLight(0xffffff, 0.8); d.position.set(2, 4, 5); sc.add(d);
    R.scene.remove(v.root); sc.add(v.root);
    v.root.position.set(0, 0, 0); v.yaw.rotation.y = 0.35;
    v.mixer.stopAllAction(); const a = v.mixer.clipAction(R.clips[anim]); a.play(); v.mixer.update(t);
    const cam = new THREE.PerspectiveCamera(28, w / h, 0.05, 50); cam.position.copy(camPos); cam.lookAt(look);
    const rt = new THREE.WebGLRenderTarget(w, h); rt.texture.encoding = THREE.sRGBEncoding;
    const prevFog = sc.fog;
    R.renderer.setRenderTarget(rt); R.renderer.setClearColor(0x000000, 0); R.renderer.clear(); R.renderer.render(sc, cam);
    const px = new Uint8Array(w * h * 4); R.renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    R.renderer.setRenderTarget(null); rt.dispose(); sc.fog = prevFog;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); const id = g.createImageData(w, h);
    for (let y = 0; y < h; y++) id.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    g.putImageData(id, 0, 0);
    sc.remove(v.root);
    return c;
  }
  function makeThumbs() {
    for (const look of ['p1', 'p2', 'guy1', 'guy2']) {
      const v = makeView(look, 1);
      R.thumbs[look] = snap(v, 192, 126, new THREE.Vector3(0, 1.0, 4.4), new THREE.Vector3(0, 0.95, 0), 'Idle_Loop', 0.4);
      PORTRAIT[look] = snap(v, 96, 88, new THREE.Vector3(0.05, 1.62, 0.85), new THREE.Vector3(0, 1.58, 0), 'Idle_Loop', 0.4);
      dropView(v);
    }
  }
  function drawPreviews3D() {
    if (APP.screen !== 'scrSelect' && APP.screen !== 'scrLobby') return;
    drawPetRows();
    for (const box of [document.getElementById('soloChars'), document.getElementById('lobbyChars')]) {
      if (!box || box.closest('.scr').hidden) continue;
      const pn = box._pn ? box._pn() : 0;
      for (const c of box.querySelectorAll('canvas')) {
        const ch = c.dataset.ch, pal = palFor(pn, ch, NET.remoteChar || '');
        const th = R.thumbs[pal]; if (!th) continue;
        if (c.width !== 192) { c.width = 192; c.height = 126; }
        const g = c.getContext('2d'); g.clearRect(0, 0, 192, 126);
        const bob = ch === APP.myChar ? Math.sin(RFRAME * 0.15) * 3 : 0;
        g.drawImage(th, 0, bob);
      }
    }
  }
  // hooks for automated visual checks
  window.__R3D = { R, makeView, attachWeapon, snap, dropView, W_ROT, W_POS, loadPet, petThumb, PET_YAW };
})();
