'use strict';
/* ============================================================
   Game data. Add new stages/enemies here — nothing else needs
   to change for a new stage.
   ============================================================ */

const VIEW_W = 384;          // simulation camera width (world pixels)
const VIEW_H = 240;
const ZMIN = 124;            // back edge of the walkable street (feet y on screen)
const ZMAX = 232;            // front edge
const GRAV = 0.32;
const ASSET = 'assets/streets-of-fight/';

// Sprite sheets: 96x63 frames, feet anchored at (45, 62).
const FW = 96, FH = 63, AX = 45, AY = 62;
const SHEETS = {
  girl: { dir: 'Spritesheets/Brawler Girl/', face: 1,
    anims: { idle: 4, walk: 10, jab: 3, punch: 3, kick: 5, jump: 4, jump_kick: 3, dive_kick: 5, hurt: 2 } },
  punk: { dir: 'Spritesheets/Enemy Punk/', face: -1,
    anims: { idle: 4, walk: 4, punch: 3, hurt: 4 } },
};

// Palette swaps: original colour -> new colour.
const PALS = {
  p1: {},
  p2: { '#8a0b41': '#23308f', '#ce2038': '#3f74ff', '#ed4924': '#86e3ff', '#edb021': '#ff6fd8', '#793d4e': '#34407a' },
  punk: {},
  dash: { '#ce2038': '#38c95a', '#8a0b41': '#1b6e36', '#ed4924': '#a6ff70', '#4060a0': '#3a3a48', '#6080e0': '#5c5c74', '#b5b6ff': '#a0a0b8', '#004040': '#3e1838' },
  brute: { '#ce2038': '#a046e0', '#8a0b41': '#561f7e', '#ed4924': '#d79bff', '#4060a0': '#6a4a2a', '#6080e0': '#8c6a3a', '#b5b6ff': '#c6a882', '#004040': '#1e1e24',
    '#ffb164': '#c98a5a', '#ffb66b': '#c98a5a', '#d77e4b': '#9a5a32', '#9c5c37': '#6a3a20' },
  boss1: { '#ce2038': '#ff3b1f', '#8a0b41': '#9c140c', '#ed4924': '#ffd23f', '#004040': '#4e0808', '#4060a0': '#1c1c1c', '#6080e0': '#3c3c3c', '#b5b6ff': '#7c7c7c' },
  boss2: { '#ce2038': '#ffd23f', '#8a0b41': '#ad7810', '#ed4924': '#fff2a0', '#004040': '#0a382a', '#4060a0': '#0f6a4a', '#6080e0': '#2ec48a', '#b5b6ff': '#a0ffd8' },
  boss3: { '#ce2038': '#f4f4ff', '#8a0b41': '#9a9ab4', '#ed4924': '#ffffff', '#004040': '#1a1030', '#4060a0': '#2a1a4c', '#6080e0': '#ffd23f', '#b5b6ff': '#fff2a0', '#806060': '#ffd23f',
    '#ffb164': '#b77d55', '#ffb66b': '#b77d55', '#d77e4b': '#8a5230', '#9c5c37': '#5e341c' },
};

const PLAYER = {
  hp: 120, speed: 1.55, zspeed: 1.1, jump: 5.4, lives: 3,
  // per combo step: anim, frame ticks, which frame hits, reach, damage, heavy?
  combo: [
    { anim: 'jab',   ticks: [3, 4, 6],       hitF: 1, reach: 34, dmg: 6,  heavy: false },
    { anim: 'punch', ticks: [3, 4, 7],       hitF: 1, reach: 38, dmg: 7,  heavy: false },
    { anim: 'kick',  ticks: [3, 3, 4, 5, 9], hitF: 3, reach: 34, dmg: 12, heavy: true },
  ],
  jumpKick: { reach: 30, dmg: 12 },
  diveCost: 8, diveDmg: 16,
  superDmg: 30,
};

// Enemy types (all drawn from the punk sheet with different palettes/sizes).
const ENEMY = {
  punk:  { name: 'PUNK',    pal: 'punk',  sc: 1.0,  hp: 34,  spd: 0.8,  dmg: 7,  reach: 28, wind: 14, armor: 0, score: 200,  moves: ['punch'] },
  dash:  { name: 'SPEEDY',  pal: 'dash',  sc: 0.95, hp: 26,  spd: 1.35, dmg: 7,  reach: 28, wind: 10, armor: 0, score: 300,  moves: ['punch', 'dash'] },
  brute: { name: 'BIG BO',  pal: 'brute', sc: 1.22, hp: 75,  spd: 0.6,  dmg: 12, reach: 32, wind: 20, armor: 1, score: 500,  moves: ['heavy'] },
  boss1: { name: 'BIG RED', pal: 'boss1', sc: 1.45, hp: 280, spd: 0.75, dmg: 12, reach: 38, wind: 16, armor: 2, score: 5000, boss: true, moves: ['combo', 'charge', 'combo'] },
  boss2: { name: 'VIPER',   pal: 'boss2', sc: 1.35, hp: 320, spd: 1.3,  dmg: 10, reach: 36, wind: 10, armor: 2, score: 7000, boss: true, moves: ['combo', 'dash', 'dash', 'charge'] },
  boss3: { name: 'KING ZERO', pal: 'boss3', sc: 1.6, hp: 460, spd: 0.9, dmg: 14, reach: 42, wind: 14, armor: 2, score: 10000, boss: true, moves: ['combo', 'charge', 'slam'] },
};

const ITEMS = {
  pizza:  { heal: 40,  label: '+40' },
  burger: { heal: 120, label: 'FULL' },
  soda:   { heal: 20,  label: '+20' },
  gem:    { score: 2000, label: '+2000' },
};

/* Stages. `at` = camera x where the screen locks and the wave starts ('end' = end of stage).
   `g` = groups that come in one after another. Add a new object here for a new stage. */
const STAGES = [
  { name: 'STAGE 1', sub: 'ถนนร้านพิซซ่า', len: 2000, mood: 'dusk', seed: 7, song: 's1',
    barrels: [380, 820, 1230, 1640],
    waves: [
      { at: 200,  g: [['punk', 'punk'], ['punk']] },
      { at: 600,  g: [['punk', 'dash'], ['punk', 'punk']] },
      { at: 1020, g: [['dash', 'dash', 'punk'], ['brute']] },
      { at: 1380, g: [['punk', 'brute'], ['dash', 'punk', 'dash']] },
      { at: 'end', boss: 'boss1', g: [['boss1'], ['punk', 'punk'], ['dash', 'punk']] },
    ] },
  { name: 'STAGE 2', sub: 'ซอยไฟนีออน', len: 2300, mood: 'night', seed: 21, song: 's2',
    barrels: [420, 900, 1380, 1880],
    waves: [
      { at: 220,  g: [['dash', 'dash'], ['punk', 'punk']] },
      { at: 680,  g: [['brute', 'punk'], ['dash', 'dash']] },
      { at: 1150, g: [['punk', 'punk', 'dash'], ['brute', 'brute']] },
      { at: 1600, g: [['dash', 'dash', 'dash'], ['punk', 'brute', 'punk']] },
      { at: 'end', boss: 'boss2', g: [['boss2'], ['dash', 'dash'], ['punk', 'dash']] },
    ] },
  { name: 'STAGE 3', sub: 'ถนนสายฝน', len: 2600, mood: 'rain', seed: 33, song: 's3',
    barrels: [380, 980, 1500, 2050],
    waves: [
      { at: 240,  g: [['brute', 'dash', 'punk'], ['punk', 'punk']] },
      { at: 760,  g: [['dash', 'dash', 'brute'], ['punk', 'dash', 'punk']] },
      { at: 1260, g: [['brute', 'brute'], ['dash', 'dash', 'dash']] },
      { at: 1760, g: [['punk', 'brute', 'dash'], ['brute', 'punk', 'dash']] },
      { at: 'end', boss: 'boss3', g: [['boss3'], ['brute'], ['dash', 'dash'], ['punk', 'punk']] },
    ] },
];

// Tileset pieces [x, y, w, h] inside Stage Layers/tileset.png
const TILES = {
  shopA: [0, 0, 224, 96], pillarT: [240, 0, 32, 96], shopB: [288, 0, 224, 96],
  brickL: [0, 112, 48, 96], brick: [64, 112, 48, 96], brickPipe: [128, 112, 48, 96], brickWin: [192, 112, 48, 96], brickDoor: [256, 112, 48, 96],
  brickP: [320, 112, 32, 96], brickE: [368, 112, 32, 96], darkP: [464, 112, 32, 96], rail: [416, 128, 32, 80],
  groundS: [0, 224, 32, 144], ground: [48, 224, 112, 144],
  garageOpen: [176, 224, 112, 96], garage: [304, 224, 112, 96], graffiti: [432, 224, 96, 96],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
