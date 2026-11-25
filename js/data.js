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
  // playable guy (built from the punk sheet, recoloured so he never looks like an enemy)
  guy1: { '#ce2038': '#24202e', '#8a0b41': '#100c16', '#ed4924': '#4a4458', '#004040': '#f2f0f8', '#806060': '#c8c4d8', '#4060a0': '#2b4fa8', '#6080e0': '#4a78e0', '#b5b6ff': '#a8c4ff' },
  guy2: { '#ce2038': '#ffcf3a', '#8a0b41': '#b07a10', '#ed4924': '#fff2a0', '#004040': '#ff3d7f', '#806060': '#ffb0c8', '#4060a0': '#2a2a3a', '#6080e0': '#4a4a60', '#b5b6ff': '#9a9ab4' },
  elite: { '#ce2038': '#ff8a1f', '#8a0b41': '#a04a10', '#ed4924': '#ffd23f', '#004040': '#141018', '#4060a0': '#5a1020', '#6080e0': '#8a2030', '#b5b6ff': '#d06070' },
  boss4: { '#ce2038': '#8adfff', '#8a0b41': '#2f6f9a', '#ed4924': '#e0f8ff', '#004040': '#3a4450', '#4060a0': '#5a6470', '#6080e0': '#8a96a4', '#b5b6ff': '#d0dae4',
    '#ffb164': '#c98a5a', '#ffb66b': '#c98a5a', '#d77e4b': '#9a5a32', '#9c5c37': '#6a3a20' },
  boss5: { '#ce2038': '#ff1f3a', '#8a0b41': '#7a0010', '#ed4924': '#ff9aa8', '#004040': '#0c0a10', '#4060a0': '#1c1824', '#6080e0': '#ff1f3a', '#b5b6ff': '#ff9aa8', '#806060': '#ff1f3a',
    '#ffb164': '#a87050', '#ffb66b': '#a87050', '#d77e4b': '#7a4428', '#9c5c37': '#4e2a16' },
};

/* Playable characters. `pals` = [main colours, second-player colours]. */
const CHARS = {
  girl: { name: 'มายา', tag: 'หญิง · ว่องไว', sheet: 'girl', pals: ['p1', 'p2'], hp: 120, speed: 1.55, zspeed: 1.1, jump: 5.4, dmg: 1.0, reach: 0 },
  guy:  { name: 'ไค',   tag: 'ชาย · หมัดหนัก', sheet: 'punk', pals: ['guy1', 'guy2'], hp: 150, speed: 1.3, zspeed: 0.95, jump: 4.9, dmg: 1.3, reach: 4 },
};

const PLAYER = {
  hp: 120, speed: 1.55, zspeed: 1.1, jump: 5.4, lives: 3,
  // per combo step: anim, frame ticks, which frame hits, reach, damage, heavy?
  combo: [
    { anim: 'jab',   ticks: [3, 4, 6],       hitF: 1, reach: 34, dmg: 6,  heavy: false },
    { anim: 'punch', ticks: [3, 4, 7],       hitF: 1, reach: 38, dmg: 7,  heavy: false },
    { anim: 'chop',  ticks: [3, 4, 7],       hitF: 1, reach: 38, dmg: 8,  heavy: false },
    { anim: 'kick',  ticks: [3, 3, 4, 5, 9], hitF: 3, reach: 34, dmg: 12, heavy: true },
  ],
  jumpKick: { reach: 30, dmg: 12 },
  diveCost: 8, diveDmg: 16,
  spinCost: 8, spinDmg: 14,
  rollTicks: 24, rollSpeed: 2.7, tauntHold: 28, tauntGain: 18,
  superDmg: 30,
};

// Enemy types (all drawn from the punk sheet with different palettes/sizes).
const ENEMY = {
  punk:  { name: 'PUNK',    pal: 'punk',  sc: 1.0,  hp: 34,  spd: 0.8,  dmg: 7,  reach: 28, wind: 14, armor: 0, score: 200,  moves: ['punch'] },
  dash:  { name: 'SPEEDY',  pal: 'dash',  sc: 0.95, hp: 26,  spd: 1.35, dmg: 7,  reach: 28, wind: 10, armor: 0, score: 300,  moves: ['punch', 'dash'] },
  brute: { name: 'BIG BO',  pal: 'brute', sc: 1.22, hp: 75,  spd: 0.6,  dmg: 12, reach: 32, wind: 20, armor: 1, score: 500,  moves: ['heavy'] },
  boss1: { name: 'BIG RED', pal: 'boss1', sc: 1.45, hp: 280, spd: 0.75, dmg: 12, reach: 38, wind: 16, armor: 2, score: 5000, boss: true, moves: ['combo', 'charge', 'combo'] },
  boss2: { name: 'VIPER',   pal: 'boss2', sc: 1.35, hp: 320, spd: 1.3,  dmg: 10, reach: 36, wind: 10, armor: 2, score: 7000, boss: true, moves: ['combo', 'dash', 'dash', 'charge'] },
  batter: { name: 'SLUGGER', pal: 'dash',  sc: 1.0,  hp: 40,  spd: 0.8,  dmg: 10, reach: 44, wind: 16, armor: 0, score: 450, moves: ['wswing'], weapon: 'bat' },
  piper:  { name: 'RUSTY',   pal: 'brute', sc: 1.1,  hp: 58,  spd: 0.65, dmg: 14, reach: 38, wind: 20, armor: 1, score: 550, moves: ['wswing'], weapon: 'pipe' },
  elite: { name: 'BLAZE',   pal: 'elite', sc: 1.05, hp: 48,  spd: 1.15, dmg: 9,  reach: 30, wind: 9,  armor: 0, score: 600,  moves: ['punch', 'dash', 'punch'] },
  boss4: { name: 'IRON BO', pal: 'boss4', sc: 1.75, hp: 520, spd: 0.7, dmg: 15, reach: 44, wind: 16, armor: 2, score: 12000, boss: true, moves: ['heavy', 'charge', 'slam', 'combo'] },
  boss5: { name: 'KING ZERO X', pal: 'boss5', sc: 1.65, hp: 650, spd: 1.05, dmg: 15, reach: 44, wind: 10, armor: 2, score: 20000, boss: true, moves: ['combo', 'charge', 'slam', 'dash'] },
  boss3: { name: 'KING ZERO', pal: 'boss3', sc: 1.6, hp: 460, spd: 0.9, dmg: 14, reach: 42, wind: 14, armor: 2, score: 10000, boss: true, moves: ['combo', 'charge', 'slam'] },
};

/* Pick-up weapons: combo damage per swing, reach, swings before it breaks, thrown damage. */
const WEAPONS = {
  bat:  { name: 'ไม้เบสบอล', reach: 54, dmg: [10, 10, 17], ticks: [[3, 4, 8], [3, 4, 8], [4, 5, 11]], uses: 10, thrown: 20 },
  pipe: { name: 'ท่อเหล็ก',  reach: 46, dmg: [13, 13, 21], ticks: [[4, 5, 9], [4, 5, 9], [5, 5, 12]], uses: 10, thrown: 24 },
};

const ITEMS = {
  pizza:  { heal: 40,  label: '+40' },
  burger: { heal: 120, label: 'FULL' },
  soda:   { heal: 20,  label: '+20' },
  gem:    { score: 2000, label: '+2000' },
  bat:    { weapon: 'bat',  label: 'ไม้เบสบอล!' },
  pipe:   { weapon: 'pipe', label: 'ท่อเหล็ก!' },
};

/* Stages. `at` = camera x where the screen locks and the wave starts ('end' = end of stage).
   `g` = groups that come in one after another. Add a new object here for a new stage. */
const STAGES = [
  { name: 'STAGE 1', sub: 'ถนนร้านพิซซ่า', len: 2000, mood: 'dusk', seed: 7, song: 's1',
    barrels: [380, 820, 1230, 1640],
    waves: [
      { at: 200,  g: [['punk', 'punk'], ['punk']] },
      { at: 600,  g: [['punk', 'dash'], ['punk', 'punk']] },
      { at: 1020, g: [['dash', 'batter', 'punk'], ['brute']] },
      { at: 1380, g: [['punk', 'brute'], ['dash', 'punk', 'dash']] },
      { at: 'end', boss: 'boss1', g: [['boss1'], ['punk', 'punk'], ['dash', 'punk']] },
    ] },
  { name: 'STAGE 2', sub: 'ตลาดนัดกลางคืน', len: 2300, mood: 'night', theme: 'market', seed: 21, song: 's2',
    barrels: [420, 900, 1380, 1880],
    waves: [
      { at: 220,  g: [['dash', 'dash'], ['punk', 'punk']] },
      { at: 680,  g: [['batter', 'punk'], ['dash', 'piper']] },
      { at: 1150, g: [['punk', 'punk', 'dash'], ['brute', 'brute']] },
      { at: 1600, g: [['dash', 'batter', 'dash'], ['punk', 'piper', 'punk']] },
      { at: 'end', boss: 'boss2', g: [['boss2'], ['dash', 'dash'], ['punk', 'dash']] },
    ] },
  { name: 'STAGE 3', sub: 'ท่าเรือคืนฝนตก', len: 2600, mood: 'rain', theme: 'pier', seed: 33, song: 's3',
    barrels: [380, 980, 1500, 2050],
    waves: [
      { at: 240,  g: [['brute', 'dash', 'punk'], ['punk', 'punk']] },
      { at: 760,  g: [['piper', 'dash', 'batter'], ['punk', 'dash', 'punk']] },
      { at: 1260, g: [['brute', 'brute'], ['dash', 'dash', 'dash']] },
      { at: 1760, g: [['batter', 'brute', 'dash'], ['piper', 'punk', 'batter']] },
      { at: 'end', boss: 'boss3', g: [['boss3'], ['brute'], ['dash', 'dash'], ['punk', 'punk']] },
    ] },
  { name: 'STAGE 4', sub: 'ดาดฟ้าตึกในหมอก', len: 2500, mood: 'fog', theme: 'roof', seed: 47, song: 's4',
    barrels: [420, 1000, 1560, 2100],
    waves: [
      { at: 240,  g: [['elite', 'punk'], ['dash', 'dash', 'punk']] },
      { at: 760,  g: [['piper', 'elite'], ['batter', 'dash'], ['punk', 'punk']] },
      { at: 1280, g: [['elite', 'elite'], ['brute', 'dash', 'dash']] },
      { at: 1800, g: [['piper', 'brute', 'elite'], ['batter', 'elite', 'batter']] },
      { at: 'end', boss: 'boss4', g: [['boss4'], ['brute'], ['elite', 'dash'], ['punk', 'punk']] },
    ] },
  { name: 'STAGE 5', sub: 'รถไฟฟ้าไฟดับ', len: 2800, mood: 'dark', theme: 'train', seed: 59, song: 's5',
    barrels: [380, 900, 1450, 2000, 2450],
    waves: [
      { at: 260,  g: [['elite', 'elite', 'dash'], ['brute', 'punk']] },
      { at: 800,  g: [['dash', 'dash', 'dash'], ['elite', 'brute'], ['punk', 'punk']] },
      { at: 1340, g: [['piper', 'elite', 'piper'], ['batter', 'dash', 'elite']] },
      { at: 1900, g: [['elite', 'batter', 'elite'], ['brute', 'piper'], ['batter', 'dash']] },
      { at: 'end', boss: 'boss5', g: [['boss5'], ['elite', 'elite'], ['brute', 'dash'], ['elite', 'dash', 'dash']] },
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

/* ---------- player levels (saved on the device) ---------- */
const LEVEL = { max: 30, need: (l) => 400 + 30 * l * l, hp: 4, dmg: 0.025, meter: 0.02, superPet: 10 };

/* ---------- pets (3D version only): three forms each, small to big ----------
   m = model file in assets/3d/pets, h = height in metres, aura = glow colour of the final form */
const PET = { exp: [0, 1500, 9000], dmg: [5, 10, 17], cool: [80, 64, 52], speed: [1.9, 2.15, 2.4], reach: [22, 30, 40], roarEvery: 420, roarDmg: 22 };
const PET_LINES = {
  hunter: { name: 'สายนักล่า', forms: [{ m: 'raptor', h: 0.9, name: 'แรปเตอร์' }, { m: 'trex', h: 1.8, name: 'ทีเร็กซ์' }, { m: 'trex', h: 2.9, name: 'ทีเร็กซ์เพลิง', aura: 0xff5a1f }] },
  armor:  { name: 'สายเกราะ', forms: [{ m: 'stego', h: 0.85, name: 'สเตโกซอรัส' }, { m: 'trike', h: 1.45, name: 'ไทรเซอราทอปส์' }, { m: 'apato', h: 3.0, name: 'อะแพโทซอรัสยักษ์', aura: 0xffd23f }] },
  duck:   { name: 'สายปากเป็ด', forms: [{ m: 'para', h: 0.9, name: 'พาราซอร์จิ๋ว' }, { m: 'para', h: 1.6, name: 'พาราซอร์' }, { m: 'para', h: 2.7, name: 'พาราซอร์สายฟ้า', aura: 0x34e6ff }] },
  dragon: { name: 'สายมังกร', fly: true, forms: [{ m: 'bat', h: 0.6, name: 'ค้างคาว' }, { m: 'dragon', h: 1.2, name: 'มังกร' }, { m: 'dragon', h: 2.3, name: 'มังกรไฟ', aura: 0xff3a1f }] },
  slime:  { name: 'สายสไลม์', forms: [{ m: 'slime', h: 0.4, name: 'สไลม์จิ๋ว' }, { m: 'slime', h: 0.85, name: 'สไลม์' }, { m: 'slime', h: 1.7, name: 'ราชาสไลม์', aura: 0x7dff5a, crown: true }] },
  bone:   { name: 'สายกระดูก', forms: [{ m: 'skeleton', h: 0.9, name: 'โครงกระดูกจิ๋ว' }, { m: 'skeleton', h: 1.5, name: 'โครงกระดูก' }, { m: 'skeleton', h: 2.6, name: 'อัศวินกระดูก', aura: 0xb46aff }] },
  farm:   { name: 'สายฟาร์ม', forms: [{ m: 'pug', h: 0.55, name: 'ปั๊ก' }, { m: 'zebra', h: 1.5, name: 'ม้าลาย' }, { m: 'horse', h: 2.3, name: 'ม้าศึก', aura: 0xffd23f }] },
  cow:    { name: 'สายวัว', forms: [{ m: 'cow', h: 0.75, name: 'ลูกวัว' }, { m: 'cow', h: 1.3, name: 'วัว' }, { m: 'cow', h: 2.2, name: 'วัวยักษ์', aura: 0xff6fd8 }] },
  sheep:  { name: 'สายแกะ', forms: [{ m: 'sheep', h: 0.5, name: 'ลูกแกะ' }, { m: 'sheep', h: 0.95, name: 'แกะ' }, { m: 'sheep', h: 1.8, name: 'แกะยักษ์', aura: 0xffffff }] },
  pig:    { name: 'สายหมู', forms: [{ m: 'pig', h: 0.45, name: 'ลูกหมู' }, { m: 'pig', h: 0.85, name: 'หมู' }, { m: 'pig', h: 1.7, name: 'หมูยักษ์', aura: 0xff9aa8 }] },
  llama:  { name: 'สายลามะ', forms: [{ m: 'llama', h: 0.8, name: 'ลามะน้อย' }, { m: 'llama', h: 1.4, name: 'ลามะ' }, { m: 'llama', h: 2.4, name: 'ลามะยักษ์', aura: 0x34e6ff }] },
};
const PET_ORDER = Object.keys(PET_LINES);
function petForm(exp) { return exp >= PET.exp[2] ? 2 : exp >= PET.exp[1] ? 1 : 0; }
