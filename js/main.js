'use strict';
/* App flow: screens, game loop, online lobby. */

const $ = (s) => document.querySelector(s);
const APP = { screen: 'title', lastPhase: null, endShown: false, tick: 0, prevScreen: 'scrTitle', myChar: 'girl' };

/* ---------- saved progress (level + pets) ---------- */
function loadSave() {
  const d = { lvl: 1, exp: 0, pet: 'hunter', pets: {} };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('sb-save') || '{}')); } catch (e) { return d; }
}
APP.save = loadSave();
function writeSave() { try { localStorage.setItem('sb-save', JSON.stringify(APP.save)); } catch (e) { /* private mode */ } }
function myProg() { const pet = PET_LINES[APP.save.pet] ? APP.save.pet : 'hunter'; return { lvl: APP.save.lvl, exp: APP.save.exp, pet: window.__INIT3D ? pet : null, petExp: APP.save.pets[pet] || 0 }; }
function syncSave() {
  if (!G || !G.players) return;
  const me = G.players[G.mode === 'guest' ? 1 : 0];
  if (!me || me.lvl === undefined) return;
  if (me.lvl < APP.save.lvl || (me.lvl === APP.save.lvl && me.exp < APP.save.exp && G.mode === 'guest')) return;
  APP.save.lvl = me.lvl; APP.save.exp = me.exp;
  if (me.petLine) APP.save.pets[me.petLine] = Math.max(APP.save.pets[me.petLine] || 0, Math.floor(me.petExp || 0));
  writeSave();
}

/* ---------- pet pick (3D only) ---------- */
function petStep(d) {
  const i = PET_ORDER.indexOf(APP.save.pet);
  APP.save.pet = PET_ORDER[(i + d + PET_ORDER.length) % PET_ORDER.length];
  writeSave(); updatePetRows();
  if (NET.open) netSend({ t: 'ch', ch: APP.myChar, prog: myProg() });
}
function updatePetRows() {
  const L = PET_LINES[APP.save.pet], exp = APP.save.pets[APP.save.pet] || 0, f = petForm(exp);
  const next = f < 2 ? `EXP ${exp}/${PET.exp[f + 1]}` : 'ร่างสุดท้าย';
  for (const row of document.querySelectorAll('.pet-row')) {
    row.querySelector('.pet-name').textContent = `${L.name} · ${L.forms[f].name}`;
    row.querySelector('.pet-sub').textContent = `ร่าง ${f + 1}/3 · ${next}`;
  }
  const lv = document.querySelectorAll('.my-level');
  lv.forEach((e) => { e.textContent = `เลเวลของคุณ: ${APP.save.lvl}`; });
}

/* ---------- character pick ---------- */
function palFor(pn, ch, otherCh) { const C = CHARS[ch] || CHARS.girl; return pn === 1 && ch === otherCh ? C.pals[1] : C.pals[0]; }
function buildCharButtons(box, pnFn) {
  box.innerHTML = '';
  for (const [key, C] of Object.entries(CHARS)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'char'; b.dataset.ch = key;
    const c = document.createElement('canvas'); c.width = FW; c.height = FH; c.dataset.ch = key;
    const name = document.createElement('b'); name.textContent = C.name;
    const tag = document.createElement('small'); tag.textContent = C.tag;
    b.append(c, name, tag);
    b.onclick = () => { audioUnlock(); pickChar(key); };
    box.append(b);
  }
  box._pn = pnFn;
  markChars();
}
function pickChar(ch) {
  APP.myChar = ch; store('sb-char', ch); markChars();
  if (NET.open) netSend({ t: 'ch', ch, prog: myProg() });
  updateSlots();
}
function markChars() { for (const b of document.querySelectorAll('.char')) b.setAttribute('aria-pressed', String(b.dataset.ch === APP.myChar)); }
function drawCharPreviews() {
  if (APP.screen !== 'scrSelect' && APP.screen !== 'scrLobby') return;
  for (const box of [$('#soloChars'), $('#lobbyChars')]) {
    if (!box || box.closest('.scr').hidden) continue;
    const pn = box._pn ? box._pn() : 0;
    for (const c of box.querySelectorAll('canvas')) {
      const ch = c.dataset.ch, C = CHARS[ch];
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, FW, FH);
      const sel = ch === APP.myChar;
      const pal = palFor(pn, ch, NET.remoteChar || '');
      const fr = sel ? Math.floor(RFRAME / 6) % 4 : Math.floor(RFRAME / 10) % 4;
      drawSprite(g, C.sheet, pal, sel ? 'walk' : 'idle', fr, AX, AY, 1, 1, 0, false, false);
    }
  }
}
function updateSlots() {
  const host = NET.role === 'host';
  const myC = CHARS[APP.myChar].name, otherC = NET.remoteChar ? CHARS[NET.remoteChar].name : '-';
  $('#slot1c').textContent = 'ผู้เล่น 1 · ' + (host ? myC : otherC);
  $('#slot2c').textContent = 'ผู้เล่น 2 · ' + (host ? (NET.open ? otherC : '-') : myC);
}

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
function myName() { const v = ($('#inName').value || '').trim().slice(0, 10); return v || 'ผู้เล่น'; }

function show(id) {
  for (const s of document.querySelectorAll('.scr')) s.hidden = s.id !== id;
  APP.screen = id || 'game';
  updateTouchUI();
}
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function updateTouchUI() {
  const inGame = APP.screen === 'game' && G;
  $('#touch').hidden = !(inGame && isTouch());
  $('#corner').hidden = !inGame;
  const portrait = window.innerHeight > window.innerWidth;
  $('#rotate').hidden = !(isTouch() && portrait);
}

/* ---------- game start/stop ---------- */
function enterGame() {
  APP.lastPhase = null; APP.endShown = false;
  PARTS.length = 0; TEXTS.length = 0; FXS.banner = null; FXS.cutin = null; FXS.ko = 0; FXS.warn = 0;
  show(null);
}

function startSolo() {
  audioUnlock();
  G = newWorld('solo');
  G.petsOn = !!window.__INIT3D;
  G.players = [newPlayer(0, myName(), APP.myChar, null, myProg())];
  G.players.forEach(makePet);
  startStage(0);
  enterGame();
}

function startHostGame() {
  G = newWorld('host');
  G.petsOn = !!window.__INIT3D;
  G.players = [newPlayer(0, myName(), APP.myChar, palFor(0, APP.myChar), myProg())];
  if (NET.open) { const rc = NET.remoteChar || 'girl'; G.players.push(newPlayer(1, NET.remoteName || 'แฟน', rc, palFor(1, rc, APP.myChar), NET.remoteProg)); }
  G.players.forEach(makePet);
  startStage(0);
  netSend({ t: 'start' });
  enterGame();
}

function startGuestGame() {
  G = newWorld('guest');
  G.players = []; G.gotSnap = false;
  enterGame();
}

function quitToTitle(msg) {
  syncSave();
  if (NET.role === 'host') netSend({ t: 'quit' });
  netClose();
  G = null;
  show('scrTitle');
  playSong('title');
  if (msg) toast(msg);
}

/* ---------- fixed-step loop ---------- */
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  acc += dt;
  while (acc >= 1000 / 60) { tick(); acc -= 1000 / 60; }
  renderFrame();
  drawCharPreviews();
}

function tick() {
  APP.tick++;
  if (!G) { sampleInput(); return; }
  if (G.mode === 'solo') {
    const inp = sampleInput();
    simStep([inp]);
  } else if (G.mode === 'host') {
    const inp = sampleInput();
    hostManageGuest();
    simStep([inp, hostRemoteInput()]);
    if (APP.tick % 2 === 0 && NET.open) netSend({ t: 's', s: makeSnapshot() });
  } else if (G.mode === 'guest') {
    const inp = sampleInput();
    if (inp.atkP) sfx('swing');
    guestSendInput(inp);
    guestSmooth();
  }
  watchPhase();
  if (APP.tick % 300 === 0) syncSave();
  const me = G.players[G.mode === 'guest' ? 1 : 0];
  const ready = me && me.meter >= 100;
  const sp = document.querySelector('.pad-sp'); if (sp) sp.classList.toggle('ready', !!ready);
}

function hostManageGuest() {
  const p2 = G.players[1];
  if (NET.open) {
    const rc = NET.remoteChar || 'girl';
    if (p2 && p2.gone && p2.ch !== rc) { G.players.length = 1; G.pets = G.pets.filter((q) => q.owner !== 1); return; }
    if (!p2) { const p = newPlayer(1, NET.remoteName || 'แฟน', rc, palFor(1, rc, G.players[0].ch), NET.remoteProg); p.st = 'respawn'; p.y = -170; p.x = G.camX + 150; p.inv = 200; G.players.push(p); makePet(p); fx('bn', 0, 0, 0, 'PLAYER 2|' + p.name + ' เข้าร่วมแล้ว!'); }
    else if (p2.gone) { p2.gone = false; p2.active = true; p2.lives = Math.max(1, p2.lives); p2.hp = p2.maxHp; p2.st = 'respawn'; p2.t = 0; p2.y = -170; p2.vy = 0; p2.x = G.camX + 150; p2.inv = 200; p2.name = NET.remoteName || p2.name; }
  } else if (p2 && !p2.gone) {
    p2.gone = true; p2.active = false;
    if (p2.st === 'grab') { const e = G.enemies.find((q) => q.id === p2.grab); if (e) e.st = 'idle'; }
  }
}

function watchPhase() {
  if (APP.screen !== 'game' && APP.screen !== 'scrOver' && APP.screen !== 'scrPause') return;
  const ph = G.phase;
  if (ph === APP.lastPhase && !(ph === 'end' && !APP.endShown)) return;
  syncSave();
  if (ph === 'over') {
    APP.lastPhase = ph;
    $('#overTitle').textContent = 'GAME OVER';
    $('#overText').textContent = 'ยังไม่จบ! สู้ต่อได้จากจุดเดิม';
    setOverButtons(true);
    show('scrOver');
  } else if (ph === 'end') {
    if (G.phaseT < 150) return;
    APP.lastPhase = ph; APP.endShown = true;
    $('#overTitle').textContent = 'YOU WIN!';
    const sc = G.players.filter((p) => !p.gone).map((p) => `${p.name}: ${p.score}`).join('  ·  ');
    $('#overText').textContent = 'ถนนกลับมาสงบแล้ว! คะแนน ' + sc;
    setOverButtons(false);
    show('scrOver');
  } else {
    if (APP.screen === 'scrOver') show(null);
    APP.lastPhase = ph;
  }
}

function setOverButtons(isOver) {
  const guest = G.mode === 'guest';
  $('#btnContinue').hidden = guest;
  $('#btnContinue').textContent = isOver ? 'เล่นต่อ' : 'เล่นอีกครั้ง';
  $('#overMenu').dataset.mode = isOver ? 'over' : 'end';
  let note = $('#overNote');
  if (!note) { note = document.createElement('p'); note.id = 'overNote'; note.className = 'status'; $('#overMenu').before(note); }
  note.textContent = guest ? 'รอแฟนกด "เล่นต่อ" ที่เครื่องโฮสต์…' : '';
}

/* ---------- online lobby ---------- */
function setMsg(el, text, err) { el.textContent = text; el.classList.toggle('err', !!err); }

async function doHost() {
  audioUnlock();
  const msg = $('#onlineMsg');
  setMsg(msg, 'กำลังสร้างห้อง…');
  $('#btnHost').disabled = true;
  try {
    const code = await netHost();
    setupNetHandlers();
    $('#lobbyCode').textContent = code;
    $('#slot1').textContent = myName() + ' (คุณ)';
    $('#slot2').textContent = 'รอแฟนเข้าห้อง…';
    updateSlots();
    $('#btnStart').disabled = false; $('#btnStart').hidden = false;
    $('#shareRow').hidden = false;
    setMsg($('#lobbyMsg'), 'ส่งรหัสให้แฟน แล้วรอให้แฟนกด "เข้าห้อง" กดเริ่มก่อนก็ได้ แฟนจะเข้ามาร่วมกลางเกม');
    setMsg(msg, '');
    updatePetRows(); show('scrLobby');
  } catch (e) { setMsg(msg, netErrorText(e), true); }
  $('#btnHost').disabled = false;
}

async function doJoin() {
  audioUnlock();
  const msg = $('#onlineMsg');
  const code = ($('#inCode').value || '').replace(/\D/g, '').slice(0, 4);
  if (code.length !== 4) { setMsg(msg, 'ใส่รหัส 4 หลักที่แฟนส่งมา', true); return; }
  store('sb-code', code);
  setMsg(msg, 'กำลังเข้าห้อง ' + code + '…');
  $('#btnJoin').disabled = true;
  try {
    await netJoin(code);
    setupNetHandlers();
    $('#lobbyCode').textContent = code;
    $('#slot1').textContent = 'กำลังโหลด…';
    $('#slot2').textContent = myName() + ' (คุณ)';
    updateSlots();
    $('#btnStart').hidden = true; $('#shareRow').hidden = true;
    setMsg($('#lobbyMsg'), 'เข้าห้องแล้ว! รอแฟนกดเริ่มเกม');
    setMsg(msg, '');
    updatePetRows(); show('scrLobby');
  } catch (e) { setMsg(msg, netErrorText(e), true); netClose(); }
  $('#btnJoin').disabled = false;
}

function setupNetHandlers() {
  NET.handlers = {
    hi(m) {
      if (NET.role === 'host') {
        $('#slot2').textContent = NET.remoteName + ' ♥';
        setMsg($('#lobbyMsg'), NET.remoteName + ' เข้าห้องแล้ว! กดเริ่มเกมได้เลย');
        if (G && G.mode === 'host') toast(NET.remoteName + ' เข้ามาร่วมเล่นแล้ว');
      } else {
        $('#slot1').textContent = NET.remoteName;
      }
      updateSlots();
    },
    ch() { updateSlots(); },
    start() { if (NET.role === 'guest') startGuestGame(); },
    s(m) { if (G && G.mode === 'guest' && m.s) applySnapshot(m.s); },
    quit() { if (NET.role === 'guest') quitToTitle('แฟนออกจากเกมแล้ว'); },
    full() { setMsg($('#onlineMsg'), 'ห้องนี้มีคนเล่นครบ 2 คนแล้ว', true); netClose(); show('scrOnline'); },
    close() {
      if (NET.role === 'guest') { quitToTitle('การเชื่อมต่อกับแฟนหลุด'); return; }
      if (NET.role === 'host') {
        if (G) toast('แฟนหลุดการเชื่อมต่อ ให้แฟนกด "เข้าห้อง" ด้วยรหัสเดิมได้เลย', 4200);
        else { $('#slot2').textContent = 'รอแฟนเข้าห้อง…'; setMsg($('#lobbyMsg'), 'แฟนออกจากห้องแล้ว'); }
      }
    },
  };
}

function netStatusText() {
  if (!G || G.mode !== 'guest') return '';
  const gap = performance.now() - NET.lastRecv;
  return gap > 2500 ? 'สัญญาณขาดหาย… กำลังรอ' : '';
}

/* ---------- global keys ---------- */
function onGlobalKey(e) {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (APP.screen === 'game' && G) openPause();
    else if (APP.screen === 'scrPause') closePause();
  }
}
function openPause() {
  if (G.mode === 'solo') G.paused = true;
  $('#btnSound').textContent = 'เสียง: ' + (AU.muted ? 'ปิด' : 'เปิด');
  show('scrPause');
}
function closePause() { if (G) G.paused = false; show(null); }

/* ---------- wiring ---------- */
function wire() {
  const n = store('sb-name'); if (n) $('#inName').value = n;
  const c = store('sb-code'); if (c) $('#inCode').value = c;
  $('#inName').addEventListener('change', () => store('sb-name', myName()));
  const sc = store('sb-char'); if (sc && CHARS[sc]) APP.myChar = sc;
  buildCharButtons($('#soloChars'), () => 0);
  buildCharButtons($('#lobbyChars'), () => (NET.role === 'guest' ? 1 : 0));
  $('#goSolo').onclick = () => { audioUnlock(); store('sb-name', myName()); markChars(); updatePetRows(); show('scrSelect'); };
  for (const b of document.querySelectorAll('.pet-prev')) b.onclick = () => petStep(-1);
  for (const b of document.querySelectorAll('.pet-next')) b.onclick = () => petStep(1);
  updatePetRows();
  $('#btnSoloGo').onclick = () => startSolo();
  $('#goOnline').onclick = () => { audioUnlock(); store('sb-name', myName()); setMsg($('#onlineMsg'), ''); show('scrOnline'); };
  $('#goHelp').onclick = () => { audioUnlock(); show('scrHelp'); };
  for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => { netClose(); show('scrTitle'); };
  $('#btnHost').onclick = doHost;
  $('#btnJoin').onclick = doJoin;
  $('#inCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
  $('#btnStart').onclick = () => { audioUnlock(); startHostGame(); };
  $('#btnLeave').onclick = () => { netClose(); show('scrOnline'); };
  $('#btnShare').onclick = async () => {
    const text = `มาเล่น Street Brawl ด้วยกัน! เปิด ${location.href.split('#')[0]} แล้วกด "เล่นออนไลน์กับแฟน" → ใส่รหัส ${NET.code}`;
    try { if (navigator.share) { await navigator.share({ title: 'Street Brawl', text }); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(text); toast('คัดลอกข้อความแล้ว ส่งให้แฟนได้เลย'); } catch (e) { toast('รหัสห้อง: ' + NET.code); }
  };
  $('#btnPause').onclick = () => { if (G) openPause(); };
  $('#btnResume').onclick = closePause;
  $('#btnSound').onclick = () => { setMuted(!AU.muted); $('#btnSound').textContent = 'เสียง: ' + (AU.muted ? 'ปิด' : 'เปิด'); };
  $('#btnQuit').onclick = () => quitToTitle();
  $('#btnContinue').onclick = () => {
    if (!G) return;
    if ($('#overMenu').dataset.mode === 'end') {
      for (const p of G.players) { p.score = 0; p.lives = PLAYER.lives; p.hp = p.maxHp; p.meter = 0; p.st = 'idle'; p.active = true; }
      startStage(0);
    } else continueGame();
    APP.lastPhase = null; APP.endShown = false;
    show(null);
  };
  $('#btnOverQuit').onclick = () => quitToTitle();
  window.addEventListener('resize', () => { resizeCanvas(); updateTouchUI(); });
  window.addEventListener('orientationchange', () => setTimeout(() => { resizeCanvas(); updateTouchUI(); }, 200));
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.mode === 'solo' && APP.screen === 'game') openPause(); });
  document.addEventListener('pointerdown', () => { audioUnlock(); if (!AU.song) playSong('title'); }, { once: false, passive: true });
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  $('#installHint').hidden = !!standalone || !/iPhone|iPad/.test(navigator.userAgent);
}

async function boot() {
  resizeCanvas();
  wire();
  setupTouch();
  buildIcons();
  try {
    await loadAssets((k) => { $('#loading').textContent = 'กำลังโหลด… ' + Math.round(k * 100) + '%'; });
  } catch (e) {
    $('#loading').textContent = 'โหลดไฟล์เกมไม่สำเร็จ ลองรีเฟรชหน้า';
    return;
  }
  if (window.__INIT3D) {
    try { await window.__INIT3D((k) => { $('#loading').textContent = 'กำลังโหลดโมเดล 3D… ' + Math.round(k * 100) + '%'; }); }
    catch (e) { console.error(e); $('#loading').textContent = 'โหลดโมเดล 3D ไม่สำเร็จ ลองรีเฟรช หรือเล่นเวอร์ชัน 2D'; return; }
  }
  $('#loading').hidden = true;
  show('scrTitle');
  requestAnimationFrame(frame);
}
boot();
