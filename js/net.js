'use strict';
/* ============================================================
   Online co-op over WebRTC (PeerJS). The host runs the game and
   streams snapshots; the guest sends button states.
   ============================================================ */

const NET = {
  role: null, peer: null, conn: null, code: '', open: false, lastRecv: 0,
  remoteName: '', rin: null, rseen: null, handlers: {},
};
const ROOM_PREFIX = 'sbrawl-th-v1-';

function makePeer(id) {
  if (window.__FakePeer) return new window.__FakePeer(id);
  if (typeof Peer === 'undefined') throw { type: 'no-lib' };
  return id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
}

function openPeer(id) {
  return new Promise((res, rej) => {
    let p;
    try { p = makePeer(id); } catch (e) { rej(e); return; }
    const to = setTimeout(() => { rej({ type: 'timeout' }); try { p.destroy(); } catch (e) { /* */ } }, 15000);
    p.on('open', () => { clearTimeout(to); NET.peer = p; res(p); });
    p.on('error', (e) => { clearTimeout(to); rej(e); });
  });
}

async function netHost() {
  netClose();
  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    try { await openPeer(ROOM_PREFIX + code); NET.code = code; lastErr = null; break; }
    catch (e) { lastErr = e; if (e.type !== 'unavailable-id') break; }
  }
  if (lastErr) throw lastErr;
  NET.role = 'host';
  NET.peer.on('connection', (conn) => {
    if (NET.conn && NET.open) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); }); return; }
    attachConn(conn);
  });
  NET.peer.on('disconnected', () => { try { NET.peer.reconnect(); } catch (e) { /* */ } });
  return NET.code;
}

function netJoin(code) {
  netClose();
  return openPeer(null).then(() => new Promise((res, rej) => {
    NET.role = 'guest'; NET.code = code;
    const conn = NET.peer.connect(ROOM_PREFIX + code, { reliable: true });
    const to = setTimeout(() => rej({ type: 'timeout' }), 15000);
    NET.peer.on('error', (e) => { clearTimeout(to); rej(e); });
    conn.on('open', () => { clearTimeout(to); attachConn(conn); res(); });
  }));
}

function attachConn(conn) {
  NET.conn = conn;
  const onOpen = () => {
    if (NET.open) return;
    NET.open = true; NET.lastRecv = performance.now();
    conn.send({ t: 'hi', name: myName(), ch: APP.myChar, prog: myProg() });
    // a guest (re)joining a game already in progress goes straight in
    if (NET.role === 'host' && typeof G !== 'undefined' && G && G.mode === 'host') conn.send({ t: 'start' });
  };
  if (conn.open) onOpen(); else conn.on('open', onOpen);
  conn.on('data', (m) => {
    if (!m || typeof m !== 'object') return;
    if (!NET.open && conn.open) onOpen();
    NET.lastRecv = performance.now();
    if (m.t === 'in') { NET.rin = m; return; }
    if (m.t === 'hi') NET.remoteName = String(m.name || '').slice(0, 10);
    if ((m.t === 'hi' || m.t === 'ch') && CHARS[m.ch]) NET.remoteChar = m.ch;
    if ((m.t === 'hi' || m.t === 'ch') && m.prog && typeof m.prog === 'object') NET.remoteProg = { lvl: m.prog.lvl | 0, exp: m.prog.exp | 0, pet: PET_LINES[m.prog.pet] ? m.prog.pet : null, petExp: m.prog.petExp | 0 };
    const h = NET.handlers[m.t]; if (h) h(m);
  });
  const onClose = () => {
    if (NET.conn !== conn) return;
    NET.open = false; NET.conn = null; NET.rin = null; NET.rseen = null;
    const h = NET.handlers.close; if (h) h();
  };
  conn.on('close', onClose);
  conn.on('error', onClose);
}

function netSend(m) { if (NET.conn && NET.open) { try { NET.conn.send(m); } catch (e) { /* */ } } }

function netClose() {
  try { if (NET.conn) NET.conn.close(); } catch (e) { /* */ }
  try { if (NET.peer) NET.peer.destroy(); } catch (e) { /* */ }
  NET.peer = null; NET.conn = null; NET.open = false; NET.role = null; NET.rin = null; NET.rseen = null; NET.remoteName = ''; NET.remoteChar = '';
}

/* ---------- guest input encoding ---------- */
const GI = { seq: { atk: 0, jmp: 0, grab: 0, sp: 0, sp2: 0 }, last: '', t: 0 };
function guestSendInput(inp) {
  for (const b of BTN) if (inp[b + 'P']) GI.seq[b]++;
  const bits = (inp.l ? 1 : 0) | (inp.r ? 2 : 0) | (inp.u ? 4 : 0) | (inp.d ? 8 : 0) | (inp.atk ? 16 : 0) | (inp.jmp ? 32 : 0) | (inp.grab ? 64 : 0) | (inp.sp ? 128 : 0) | (inp.sp2 ? 256 : 0);
  const m = { t: 'in', b: bits, a: GI.seq.atk, j: GI.seq.jmp, g: GI.seq.grab, s: GI.seq.sp, k: GI.seq.sp2 };
  const key = [bits, m.a, m.j, m.g, m.s, m.k].join(',');
  GI.t++;
  if (key !== GI.last || GI.t % 20 === 0) { GI.last = key; netSend(m); }
}

/** Host: turn the guest's latest message into an input for this tick. */
function hostRemoteInput() {
  const m = NET.rin;
  const out = { l: 0, r: 0, u: 0, d: 0, atk: 0, jmp: 0, grab: 0, sp: 0, sp2: 0, atkP: 0, jmpP: 0, grabP: 0, spP: 0, sp2P: 0 };
  if (!m) return out;
  const b = m.b | 0;
  out.l = b & 1 ? 1 : 0; out.r = b & 2 ? 1 : 0; out.u = b & 4 ? 1 : 0; out.d = b & 8 ? 1 : 0;
  out.atk = b & 16 ? 1 : 0; out.jmp = b & 32 ? 1 : 0; out.grab = b & 64 ? 1 : 0; out.sp = b & 128 ? 1 : 0; out.sp2 = b & 256 ? 1 : 0;
  const seen = NET.rseen || (NET.rseen = { a: m.a, j: m.j, g: m.g, s: m.s, k: m.k });
  out.atkP = m.a !== seen.a ? 1 : 0; out.jmpP = m.j !== seen.j ? 1 : 0; out.grabP = m.g !== seen.g ? 1 : 0; out.spP = m.s !== seen.s ? 1 : 0; out.sp2P = m.k !== seen.k ? 1 : 0;
  seen.a = m.a; seen.j = m.j; seen.g = m.g; seen.s = m.s; seen.k = m.k;
  return out;
}

function netErrorText(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'ไม่พบห้องนี้ ตรวจรหัสอีกครั้ง หรือให้แฟนสร้างห้องใหม่';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองเช็กอินเทอร์เน็ตแล้วลองใหม่';
  if (t === 'timeout') return 'เชื่อมต่อนานเกินไป ลองใหม่อีกครั้ง หรือเปลี่ยนไปใช้ Wi-Fi';
  if (t === 'browser-incompatible') return 'เบราว์เซอร์นี้เล่นออนไลน์ไม่ได้ ลองใช้ Safari หรือ Chrome';
  if (t === 'no-lib') return 'โหลดระบบออนไลน์ไม่สำเร็จ ลองรีเฟรชหน้าเว็บ';
  return 'เชื่อมต่อไม่สำเร็จ (' + (t || 'ไม่ทราบสาเหตุ') + ') ลองใหม่อีกครั้ง';
}
