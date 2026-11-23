'use strict';
/* Tiny synth: sound effects + chiptune loops, no audio files. */

const AU = { ctx: null, master: null, mus: null, sfx: null, noise: null, muted: false, song: null, step: 0, next: 0, timer: 0 };

function audioUnlock() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  try { AU.ctx = new C(); } catch (e) { return; }
  const c = AU.ctx;
  AU.master = c.createGain(); AU.master.gain.value = AU.muted ? 0 : 0.8; AU.master.connect(c.destination);
  AU.mus = c.createGain(); AU.mus.gain.value = 0.2; AU.mus.connect(AU.master);
  AU.sfx = c.createGain(); AU.sfx.gain.value = 0.6; AU.sfx.connect(AU.master);
  const len = c.sampleRate * 0.6;
  AU.noise = c.createBuffer(1, len, c.sampleRate);
  const d = AU.noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // iOS needs a sound started inside the gesture
  const o = c.createOscillator(), g = c.createGain(); g.gain.value = 0; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.02);
  AU.timer = setInterval(scheduleMusic, 25);
}

function setMuted(m) {
  AU.muted = m;
  if (AU.master) AU.master.gain.value = m ? 0 : 0.8;
}

function tone(type, f0, f1, dur, vol, when, dest) {
  const c = AU.ctx; if (!c) return;
  const t = when || c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest || AU.sfx); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, vol, when, freq, type, dest) {
  const c = AU.ctx; if (!c) return;
  const t = when || c.currentTime;
  const s = c.createBufferSource(); s.buffer = AU.noise;
  const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq || 1200;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || AU.sfx); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.03);
}

const SFX = {
  swing() { noise(0.08, 0.22, 0, 3000, 'highpass'); },
  hit() { noise(0.07, 0.7, 0, 1600); tone('square', 190, 70, 0.08, 0.25); },
  hvy() { noise(0.16, 0.9, 0, 900); tone('square', 130, 38, 0.18, 0.4); },
  jump() { tone('square', 280, 620, 0.12, 0.1); },
  land() { noise(0.06, 0.25, 0, 380, 'lowpass'); },
  pick() { const t = AU.ctx.currentTime; tone('square', 660, 0, 0.08, 0.15, t); tone('square', 990, 0, 0.14, 0.15, t + 0.07); },
  brk() { noise(0.25, 0.7, 0, 600); tone('triangle', 220, 70, 0.2, 0.25); },
  ko() { tone('sawtooth', 420, 50, 0.6, 0.22); noise(0.35, 0.6, 0, 500); },
  sp() { tone('sawtooth', 180, 1000, 0.32, 0.2); noise(0.35, 0.5, 0, 3200, 'highpass'); },
  sup() { const t = AU.ctx.currentTime; tone('sawtooth', 110, 880, 0.7, 0.25, t); noise(0.8, 0.6, t + 0.35, 700); tone('square', 60, 30, 0.8, 0.5, t + 0.4); },
  boss() { const t = AU.ctx.currentTime; for (let i = 0; i < 4; i++) tone('square', 220, 110, 0.22, 0.16, t + i * 0.28); },
  clear() { const t = AU.ctx.currentTime; [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('square', f, 0, 0.18, 0.14, t + i * 0.11)); },
  slam() { noise(0.5, 1, 0, 260, 'lowpass'); tone('sine', 90, 28, 0.5, 0.7); },
  grab() { tone('square', 200, 140, 0.07, 0.14); },
  thr() { noise(0.18, 0.4, 0, 1200, 'highpass'); tone('triangle', 400, 120, 0.2, 0.2); },
  lvl() { const t = AU.ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone('square', f, 0, 0.12, 0.13, t + i * 0.07)); },
  hurt() { tone('square', 320, 110, 0.14, 0.16); },
  thunder() { noise(1.4, 0.9, 0, 180, 'lowpass'); },
  go() { const t = AU.ctx.currentTime; tone('square', 880, 0, 0.08, 0.1, t); tone('square', 880, 0, 0.08, 0.1, t + 0.14); },
};
function sfx(name) { if (!AU.ctx || AU.muted || !SFX[name]) return; try { SFX[name](); } catch (e) { /* ignore */ } }

const N = null;
const SONGS = {
  title: { bpm: 112, bass: [45, N, N, 45, N, N, 52, N, 50, N, N, 50, N, N, 48, N],
    lead: [69, N, 72, N, 76, N, 74, N, 72, N, 69, N, 67, N, 69, N, 72, N, 76, N, 79, N, 76, 74, 76, N, N, N, N, N, N, N], drum: 'k...s...k.k.s...' },
  s1: { bpm: 132, bass: [45, N, 45, N, 48, N, 50, N, 52, N, 52, N, 50, N, 48, N],
    lead: [76, N, 79, 76, 74, N, 72, N, 69, N, 72, 74, 76, N, N, N, 79, N, 81, 79, 76, N, 74, N, 72, 74, 76, N, 69, N, N, N], drum: 'k.h.s.h.k.k.s.hh' },
  s2: { bpm: 124, bass: [38, N, N, 38, 45, N, N, 45, 43, N, N, 43, 41, N, 43, N],
    lead: [74, N, 77, N, 79, N, 81, N, 79, 77, 74, N, 72, N, 74, N, 77, N, 79, N, 81, N, 84, N, 81, N, 79, 77, 74, N, N, N], drum: 'k..hs.h.k.khs.h.' },
  s3: { bpm: 140, bass: [40, 40, N, 40, 43, N, 40, N, 45, 45, N, 45, 47, N, 43, N],
    lead: [76, N, N, 79, N, N, 83, N, 81, N, 79, N, 76, N, 74, 76, 79, N, N, 83, N, N, 86, N, 83, N, 81, N, 79, N, N, N], drum: 'k.hhs.hhk.hks.hh' },
  boss: { bpm: 156, bass: [40, N, 40, 41, 40, N, 40, 43, 40, N, 40, 41, 40, N, 46, 45],
    lead: [N, N, 76, N, 77, N, 76, N, N, N, 79, N, 77, N, 76, N, N, N, 76, N, 77, N, 82, N, 81, N, 79, N, 77, N, 76, N], drum: 'kkhskkhskkhskhss' },
  win: { bpm: 120, bass: [48, N, 55, N, 52, N, 55, N, 53, N, 57, N, 55, N, 59, N],
    lead: [72, N, 76, N, 79, N, 84, N, 83, N, 79, N, 81, N, N, N, 77, N, 81, N, 84, N, 86, N, 84, N, N, N, N, N, N, N], drum: 'k...s...k...s.s.' },
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function playSong(name) {
  if (AU.song === name) return;
  AU.song = name; AU.step = 0;
  if (AU.ctx) AU.next = AU.ctx.currentTime + 0.08;
}
function scheduleMusic() {
  const c = AU.ctx; if (!c || !AU.song) return;
  const S = SONGS[AU.song]; if (!S) return;
  const sd = 60 / S.bpm / 4;
  if (AU.next < c.currentTime) AU.next = c.currentTime + 0.05;
  while (AU.next < c.currentTime + 0.15) {
    const i = AU.step, t = AU.next;
    const b = S.bass[i % 16]; if (b != null) tone('triangle', midi(b), 0, sd * 1.8, 0.55, t, AU.mus);
    const l = S.lead[i % 32]; if (l != null) tone('square', midi(l), 0, sd * 1.5, 0.15, t, AU.mus);
    const d = S.drum[i % 16];
    if (d === 'k') tone('sine', 150, 40, 0.12, 0.8, t, AU.mus);
    else if (d === 's') noise(0.1, 0.35, t, 1800, 'bandpass', AU.mus);
    else if (d === 'h') noise(0.03, 0.14, t, 7000, 'highpass', AU.mus);
    AU.step++; AU.next += sd;
  }
}
