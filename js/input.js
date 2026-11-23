'use strict';
/* Keyboard + gamepad + touch. Presses are latched so a quick tap is never lost between ticks. */

const BTN = ['atk', 'jmp', 'grab', 'sp'];
const KEYMAP = {
  l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW'], d: ['ArrowDown', 'KeyS'],
  atk: ['KeyJ', 'KeyZ'], jmp: ['KeyK', 'KeyX', 'Space'], grab: ['KeyL', 'KeyC'], sp: ['KeyI', 'KeyV'],
};
const KEYS = new Set();
const LATCH = { atk: 0, jmp: 0, grab: 0, sp: 0 };
const TOUCH = { l: 0, r: 0, u: 0, d: 0, atk: 0, jmp: 0, grab: 0, sp: 0 };
const PREV = { atk: 0, jmp: 0, grab: 0, sp: 0 };

const KEY_TO_BTN = {};
for (const b of BTN) for (const k of KEYMAP[b]) KEY_TO_BTN[k] = b;

window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (!KEYS.has(e.code) && KEY_TO_BTN[e.code]) LATCH[KEY_TO_BTN[e.code]] = 1;
  KEYS.add(e.code);
  if (/Arrow|Space/.test(e.code)) e.preventDefault();
  if (typeof onGlobalKey === 'function') onGlobalKey(e);
});
window.addEventListener('keyup', (e) => KEYS.delete(e.code));
window.addEventListener('blur', () => KEYS.clear());

function keyHeld(name) { for (const k of KEYMAP[name]) if (KEYS.has(k)) return 1; return 0; }

function padState() {
  const out = { l: 0, r: 0, u: 0, d: 0, atk: 0, jmp: 0, grab: 0, sp: 0 };
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = (i) => (p.buttons[i] && p.buttons[i].pressed ? 1 : 0);
    out.l |= ax < -0.4 || b(14); out.r |= ax > 0.4 || b(15); out.u |= ay < -0.4 || b(12); out.d |= ay > 0.4 || b(13);
    out.atk |= b(2); out.jmp |= b(0); out.grab |= b(3); out.sp |= b(1) || b(5);
    break;
  }
  return out;
}

/** Called once per simulation tick. */
function sampleInput() {
  const g = padState();
  const s = {};
  for (const k of ['l', 'r', 'u', 'd']) s[k] = keyHeld(k) || TOUCH[k] || g[k] ? 1 : 0;
  for (const b of BTN) {
    const held = keyHeld(b) || TOUCH[b] || g[b] ? 1 : 0;
    s[b] = held;
    s[b + 'P'] = (held && !PREV[b]) || LATCH[b] ? 1 : 0;
    PREV[b] = held; LATCH[b] = 0;
  }
  return s;
}

/* ---------- touch UI ---------- */
function setupTouch() {
  const zone = document.getElementById('stickZone');
  const base = document.getElementById('stickBase');
  const knob = document.getElementById('stickKnob');
  let sid = null, cx = 0, cy = 0;
  const R = 46;
  const resetBase = () => { base.style.left = ''; base.style.top = ''; base.style.bottom = ''; knob.style.transform = ''; };
  const setDir = (dx, dy) => {
    const m = Math.hypot(dx, dy) || 1, k = Math.min(1, m / R);
    knob.style.transform = `translate(${(dx / m) * k * R}px, ${(dy / m) * k * R}px)`;
    const nx = dx / R, ny = dy / R;
    TOUCH.l = nx < -0.35 ? 1 : 0; TOUCH.r = nx > 0.35 ? 1 : 0;
    TOUCH.u = ny < -0.35 ? 1 : 0; TOUCH.d = ny > 0.35 ? 1 : 0;
  };
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault(); audioUnlock();
    if (sid !== null) return;
    sid = e.pointerId; zone.setPointerCapture(sid);
    const zr = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    base.style.left = (cx - zr.left - 66) + 'px'; base.style.top = (cy - zr.top - 66) + 'px'; base.style.bottom = 'auto';
    setDir(0, 0);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setDir(e.clientX - cx, e.clientY - cy); });
  const end = (e) => { if (e.pointerId !== sid) return; sid = null; TOUCH.l = TOUCH.r = TOUCH.u = TOUCH.d = 0; resetBase(); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  for (const el of document.querySelectorAll('.pad')) {
    const b = el.dataset.b;
    const down = (e) => { e.preventDefault(); audioUnlock(); el.setPointerCapture(e.pointerId); TOUCH[b] = 1; LATCH[b] = 1; el.classList.add('on'); };
    const up = (e) => { e.preventDefault(); TOUCH[b] = 0; el.classList.remove('on'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
