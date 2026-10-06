import { MAP_H, MAP_W } from '../game/config';
import { hash, TILES } from '../game/map';
import type { BuildingKind, Tile } from '../game/types';
export const TW = 64, TH = 32, ORIGIN_X = (MAP_H - 1) * TW / 2 + 80, ORIGIN_Y = 80;
export const iso = (x: number, y: number) => ({ x: ORIGIN_X + (x - y) * TW / 2, y: ORIGIN_Y + (x + y) * TH / 2 });
export const uniso = (x: number, y: number) => ({ x: ((x - ORIGIN_X) / 32 + (y - ORIGIN_Y) / 16) / 2, y: ((y - ORIGIN_Y) / 16 - (x - ORIGIN_X) / 32) / 2 });
export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')!]; }
function poly(c: CanvasRenderingContext2D, points: number[], color: string, stroke?: string): void {
  c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.closePath(); c.fillStyle = color; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function line(c: CanvasRenderingContext2D, points: number[], color: string, width = 1): void { c.beginPath(); c.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], points[i + 1]); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string): void { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, colors = ['#d6ccb1', '#a79e86', '#e8dfc7']): void {
  poly(c, [x, y, x - w, y - w / 2, x - w, y - w / 2 - h, x, y - h], colors[0]);
  poly(c, [x, y, x + d, y - d / 2, x + d, y - d / 2 - h, x, y - h], colors[1]);
  poly(c, [x, y - h, x - w, y - w / 2 - h, x - w + d, y - (w + d) / 2 - h, x + d, y - d / 2 - h], colors[2]);
}
function roof(c: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, h: number, colors = ['#718985', '#3e5e5c']): void {
  poly(c, [x - w - 4, y - w / 2, x + 2, y + 4, x + d + 5, y - d / 2 + 3, x + d - w / 2, y - d / 2 - w / 4 - h, x - w / 2, y - w / 4 - h], colors[0]);
  poly(c, [x + 2, y + 4, x + d + 5, y - d / 2 + 3, x + d - w / 2, y - d / 2 - w / 4 - h, x - w / 2, y - w / 4 - h], colors[1]);
  line(c, [x - w / 2, y - w / 4 - h, x + d - w / 2, y - d / 2 - w / 4 - h], '#b1bab0', 2);
  for (let i = 1; i < 4; i++) line(c, [x - w / 2 + w / 2 * i / 4, y - w / 4 - h + (w / 4 + h) * i / 4, x + d - w / 2 + w / 2 * i / 4, y - d / 2 - w / 4 - h + (w / 4 + h) * i / 4], '#8b9c8c44');
}
function windowLight(c: CanvasRenderingContext2D, x: number, y: number): void { c.fillStyle = '#4c5146'; c.fillRect(x - 1, y - 1, 7, 10); c.fillStyle = '#e6bc71'; c.fillRect(x, y, 5, 7); line(c, [x + 2, y, x + 2, y + 7], '#826847'); }
function banner(c: CanvasRenderingContext2D, x: number, y: number, color = '#c5a05e'): void { line(c, [x, y + 26, x, y - 10], '#c8bea0', 2); poly(c, [x + 1, y - 8, x + 16, y - 4, x + 15, y + 11, x + 7, y + 7, x + 1, y + 7], color); line(c, [x + 8, y - 2, x + 8, y + 4], '#f8e8be', 2); }
function tree(c: CanvasRenderingContext2D, x: number, y: number, scale = 1, variant = 0): void {
  c.save(); c.translate(x, y); c.scale(scale, scale); ellipse(c, 5, 1, 18, 7, '#1e302c35');
  c.fillStyle = '#655f40'; c.fillRect(-2, -17, 4, 19);
  const colors = variant ? ['#536950', '#647958', '#819269'] : ['#355b50', '#406c5c', '#64806a'];
  for (let i = 0; i < 3; i++) { const top = -54 + i * 11, width = 12 + i * 4; poly(c, [0, top, -width, top + 28, 0, top + 25, width, top + 28], colors[i]); poly(c, [0, top, 0, top + 25, width, top + 28], '#2a4d4138'); }
  c.restore();
}
export function terrainArt(source:Tile[]=TILES,march=false): HTMLCanvasElement {
  const [cv, c] = canvas(ORIGIN_X + (MAP_W - 1) * TW / 2 + 80, Math.max(1080, ORIGIN_Y + (MAP_W + MAP_H) * TH / 2 + 48));
  // The river and land continue under the vignette; tile edges are intentionally subtle.
  const tiles = [...source].sort((a, b) => a.x + a.y - b.x - b.y);
  for (const t of tiles) {
    const p = iso(t.x, t.y), n = t.variant;
    const color = t.terrain === 'water' ? ['#426c70', '#456f72', '#487477'][Math.floor(n * 3)] : t.terrain === 'road' ? ['#929274', '#989779', '#a09c7c'][Math.floor(n * 3)] : t.terrain === 'marsh' ? ['#687f6a', '#6b826f', '#6b7e65'][Math.floor(n * 3)] : t.terrain === 'rock' ? '#8b927d' : t.terrain === 'heath' ? ['#78836b','#85896d','#707b64'][Math.floor(n*3)] : t.terrain === 'field' ? ['#92936c','#a29a70','#888e68'][Math.floor(n*3)] : ['#7d906e', '#829674', '#899a75', '#819373'][Math.floor(n * 4)];
    poly(c, [p.x, p.y - 16, p.x + 32, p.y, p.x, p.y + 16, p.x - 32, p.y], color);
    if (t.terrain === 'water') {
      line(c, [p.x - 12, p.y + 2, p.x + 6, p.y + 2], '#91b1a733'); line(c, [p.x, p.y - 7, p.x + 12, p.y - 7], '#b6cbc233');
    } else {
      for (let i = 0; i < 5; i++) { const nx = hash(t.x * 5 + i, t.y), ny = hash(t.y * 7 + i, t.x); const x = p.x + (nx - 0.5) * 35, y = p.y + (ny - 0.5) * 15; c.fillStyle = i % 2 ? '#c4c29930' : '#4b694331'; c.fillRect(x, y, 2, 1); }
      if (t.terrain === 'grass' && n > 0.55) { const x = p.x + 8, y = p.y + 3; line(c, [x - 2, y - 2, x, y, x + 2, y - 4], '#607c55', 1); }
      if(t.terrain==='field'&&n>.35){line(c,[p.x-11,p.y-2,p.x-4,p.y+2],'#c4b67d88',1);line(c,[p.x+5,p.y-5,p.x+12,p.y-1],'#c4b67d66',1);}
      if(t.terrain==='heath'&&n>.7)line(c,[p.x-3,p.y+2,p.x-1,p.y-3,p.x+1,p.y+1],'#a07c6577',1);
    }
    if (!march&&((t.y === 20 || t.y === 21) && (t.x === 14 || t.x === 15) || (t.x === 23 || t.x === 24) && (t.y === 11 || t.y === 12))) {
      poly(c, [p.x, p.y - 15, p.x + 30, p.y, p.x, p.y + 15, p.x - 30, p.y], '#b1a17b');
      for (let i = -2; i <= 2; i++) line(c, [p.x - 22 + i * 5, p.y - 11 - i * 2.5, p.x + 8 + i * 5, p.y + 4 - i * 2.5], '#786c52', 2);
    }
  }
  return cv;
}
export const SCENERY = TILES.filter(t => t.terrain === 'forest' || t.terrain === 'rock' || t.terrain === 'marsh' && t.variant > .65);
export function sceneryArt(kind: 'forest' | 'rock' | 'marsh', variant = 0): HTMLCanvasElement {
  const [cv, c] = canvas(80, 100), x = 40, y = 80;
  if (kind === 'forest') tree(c, x, y, 1, variant);
  if (kind === 'rock') {
    ellipse(c, x + 3, y + 4, 18, 7, '#3d55462d');
    poly(c, [x - 16, y + 3, x - 11, y - 13, x + 4, y - 19, x + 18, y - 7, x + 15, y + 7, x, y + 9], '#a3aa99');
    poly(c, [x + 4, y - 19, x + 18, y - 7, x + 15, y + 7, x, y + 9], '#6d7f73');
  }
  if (kind === 'marsh') for (let i = 0; i < 4; i++) line(c, [x + i * 3, y, x + i * 3 - 2, y - 12 - i % 2 * 4], '#4a6854', 1.5);
  return cv;
}
export type LandmarkArtKind='village'|'grove'|'ruin'|'ford'|'shrine'|'homestead'|'camp'|'watch';
export function landmarkArt(kind:LandmarkArtKind):HTMLCanvasElement{
 const [cv,c]=canvas(112,128),x=56,y=106;
 ellipse(c,x,y,42,13,'#172d2730');
 const stone=['#a7a58d','#777b6b','#c1b99d'];
 if(kind==='village'||kind==='homestead'){
   box(c,x-17,y-2,23,18,21,stone);roof(c,x-17,y-2,23,18,21,['#725e4d','#504a3e']);
   box(c,x+13,y+2,17,15,17,['#a79c7f','#76694f','#beb18b']);roof(c,x+13,y+2,17,15,17,['#73634a','#514a3d']);
   if(kind==='homestead')poly(c,[x-28,y-4,x-9,y-13,x+12,y-5,x+12,y+1,x-8,y-7,x-28,y+1],'#3e4d42');
   line(c,[x-39,y+6,x-14,y+14,x+13,y+8,x+38,y+15],'#79694d',2);
 }else if(kind==='grove'){
   tree(c,x,y,1.18,1);line(c,[x-10,y-34,x-8,y-57,x+3,y-68,x+11,y-55],'#9a8960',3);
 }else if(kind==='ruin'||kind==='watch'){
   poly(c,[x-37,y+3,x-33,y-31,x-22,y-43,x-11,y-30,x-13,y+2],'#a7a894','#5a6558');
   poly(c,[x+10,y+4,x+8,y-39,x+20,y-54,x+34,y-39,x+31,y+6],'#8e9686','#505c52');
   if(kind==='watch')box(c,x-8,y-6,18,12,36,['#aaa991','#7b806d','#d1c8a7']);
   else line(c,[x-12,y-8,x-12,y-24,x+9,y-24,x+9,y-7],'#625f4f',3);
 }else if(kind==='ford'){
   ellipse(c,x,y+5,41,12,'#4d7778');
   for(let i=-2;i<=2;i++)ellipse(c,x+i*13,y+2+(i%2)*3,6,3,['#aaa991','#c1b99d','#868b7b'][Math.abs(i)%3]);
   line(c,[x-35,y-10,x-21,y-9,x-11,y-7],'#c7b38b',3);line(c,[x+15,y+10,x+27,y+11,x+39,y+15],'#c7b38b',3);
 }else if(kind==='shrine'){
   poly(c,[x-19,y+7,x-15,y-34,x-5,y-51,x+6,y-40,x+10,y+5],'#aaa991','#626a5a');
   line(c,[x-4,y-28,x+2,y-35,x+8,y-28],'#d1c59f',2);
   poly(c,[x+13,y+10,x+17,y-7,x+32,y-11,x+34,y+12],'#8a8d7b');
 }else{
   line(c,[x-34,y+3,x-31,y-35,x-7,y-35,x-7,y+5],'#a98e61',4);line(c,[x-34,y-33,x-19,y-50,x-4,y-32],'#a76e4f',5);
   line(c,[x+4,y+7,x+8,y-24,x+34,y-24,x+36,y+12],'#a98e61',4);line(c,[x+5,y-25,x+21,y-40,x+37,y-24],'#8f674e',5);
   ellipse(c,x-1,y+1,6,4,'#d3a85e');ellipse(c,x-1,y+1,3,2,'#f1cc7a');
 }
 return cv;
}
export function buildingArt(kind: BuildingKind): HTMLCanvasElement {
  const [cv, c] = canvas(156, 180); const x = 78, y = 143;
  ellipse(c, x + 7, y - 5, kind === 'wall' ? 27 : 37, 14, '#172d2735');
  if (kind === 'wall' || kind === 'gate') {
    const width = kind === 'gate' ? 25 : 29;
    for (let i = -width; i <= width; i += 6) {
      if (kind === 'gate' && Math.abs(i) < 10) continue;
      const py = y + i / 2;
      poly(c, [x + i - 3, py, x + i - 3, py - 29, x + i, py - 36, x + i + 3, py - 29, x + i + 3, py], '#8b8060', '#605f49');
      line(c, [x + i + 1, py - 27, x + i + 1, py - 2], '#beb08866');
    }
    line(c, [x - width, y - width / 2 - 8, x + width, y + width / 2 - 8], '#5d5b43', 4);
    if (kind === 'gate') {
      poly(c,[x-10,y-5,x-10,y-31,x+10,y-21,x+10,y+5],'#796b4e','#484d39');
      for(let n=-6;n<=6;n+=6)line(c,[x+n,y+n/2-25,x+n,y+n/2-1],'#bdab79',1);
      line(c,[x-9,y-12,x+9,y-3],'#424938',3);banner(c, x + 21, y - 39);
    }
    return cv;
  }
  if (kind === 'farm') {
    poly(c, [x, y + 5, x - 39, y - 15, x, y - 34, x + 39, y - 14], '#817257');
    for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) { const px = x - 27 + row * 6 + col * 6, py = y - 14 + row * 3 - col * 3; line(c, [px, py, px, py - 9], '#b6ae70', 2); line(c, [px - 2, py - 9, px, py - 6, px + 2, py - 11], '#dacd8d', 1.5); }
    box(c, x + 10, y - 24, 16, 20, 16); roof(c, x + 10, y - 40, 16, 20, 10, ['#ae9369', '#8c744f']);
    return cv;
  }
  if (kind === 'quarry') {
    poly(c,[x-38,y-12,x,y+7,x+36,y-11,x,y-30],'#8d8567');
    box(c,x,y-6,30,24,18,['#ad946c','#736750','#cabb8b']);
    for(const dx of [-27,25])line(c,[x+dx,y+dx/2-4,x+dx,y+dx/2-56],'#655c43',4);
    poly(c,[x-33,y-70,x+27,y-40,x+35,y-25,x-25,y-55],'#87906a','#566b50');
    for(let n=0;n<4;n++)poly(c,[x-33+n*16,y-70+n*8,x-25+n*16,y-66+n*8,x-17+n*16,y-51+n*8,x-25+n*16,y-55+n*8],'#d8c69a');
    box(c,x+26,y+1,10,12,13,['#927c54','#625d42','#c3ab72']);
    ellipse(c,x-8,y-23,5,2,'#e5c36d');ellipse(c,x+4,y-18,5,2,'#e5c36d');
    return cv;
  }
  if (kind === 'tower' || kind === 'hearth') {
    const h = kind === 'hearth' ? 61 : 68, w = kind === 'hearth' ? 31 : 19;
    box(c, x, y, w + 4, w + 4, 7, ['#a8a98e', '#7d8b7e', '#c5c2a7']);
    box(c, x, y - 6, w, w, h, ['#bfc0a6', '#8f9e8f', '#d7d2b6']);
    for (let i = 0; i < h / 12; i++) line(c, [x - w, y - 13 - i * 12 - w / 2, x, y - 13 - i * 12, x + w, y - 13 - i * 12 - w / 2], '#647a6748');
    if (kind === 'hearth') {
      roof(c, x, y - h - 6, w + 3, w + 3, 24, ['#547b77', '#355958']);
      box(c, x + 24, y - 1, 15, 16, 31); roof(c, x + 24, y - 32, 16, 18, 15);
      banner(c, x + 5, y - h - 49); windowLight(c, x - 18, y - 46); windowLight(c, x + 9, y - 60);
      poly(c, [x - 9, y - 7, x - 9, y - 30, x - 4, y - 36, x + 1, y - 30, x + 1, y - 2], '#465d53');
      ellipse(c, x - 21, y - 5, 5, 3, '#665b3e'); ellipse(c, x - 21, y - 11, 3, 6, '#edbc66'); ellipse(c, x - 21, y - 12, 1.5, 4, '#fff0bb');
    } else {
      box(c, x, y - h - 6, w + 6, w + 6, 10, ['#a6ae93', '#788e7c', '#cdd0ad']);
      for (let i = 0; i < 4; i++) { box(c, x - 23 + i * 8, y - h - 17 - (23 - i * 8) / 2, 4, 5, 8); box(c, x + i * 8, y - h - 17 - i * 4, 4, 5, 8); }
      windowLight(c, x - 11, y - 40); banner(c, x + 11, y - h - 37, '#587e88');
    }
    return cv;
  }
  const large = kind === 'barracks', w = large ? 33 : 27, d = large ? 35 : 28, h = large ? 31 : 27;
  box(c, x, y, w + 2, d + 2, 4, ['#a5a588', '#758571', '#bab79c']);
  box(c, x, y - 4, w, d, h);
  for (let i = 0; i < 3; i++) { line(c, [x - w + i * w / 2, y - 4 - (w - i * w / 2) / 2, x - w + i * w / 2, y - h - 4 - (w - i * w / 2) / 2], '#6e6c54', 2.5); }
  roof(c, x, y - h - 4, w, d, 23, kind === 'infirmary' ? ['#889580', '#5d7667'] : kind === 'barracks' ? ['#927366', '#704e47'] : ['#b1946a', '#8a704c']);
  windowLight(c, x - 19, y - 24); windowLight(c, x + 10, y - 31);
  poly(c, [x - 7, y - 4, x - 7, y - 23, x - 1, y - 20, x - 1, y - 1], '#655e48');
  if (kind === 'cottage') { box(c, x + 10, y - 60, 5, 7, 18, ['#aaad99', '#78877b', '#d0c9ae']); line(c, [x + 8, y - 84, x + 11, y - 91], '#e3e2cc70', 3); }
  if (kind === 'barracks') { banner(c, x + 29, y - 55, '#a45f49'); line(c, [x + 26, y - 16, x + 40, y - 38], '#cbd0ba', 3); line(c, [x + 37, y - 17, x + 22, y - 40], '#cbd0ba', 3); }
  if (kind === 'infirmary') { c.fillStyle = '#d5d0a9'; c.fillRect(x - 17, y - 31, 13, 13); c.fillStyle = '#587860'; c.fillRect(x - 12, y - 29, 3, 9); c.fillRect(x - 15, y - 26, 9, 3); for (let i = 0; i < 3; i++) { ellipse(c, x + 30 + i * 5, y - 2 - i * 3, 4, 3, '#9c9971'); ellipse(c, x + 30 + i * 5, y - 6 - i * 3, 4, 4, '#527b55'); } }
  if (kind === 'lumberyard') { for (let i = 0; i < 3; i++) { line(c, [x + 9 + i * 6, y + 1 - i * 3, x + 31 + i * 6, y - 10 - i * 3], '#736245', 6); ellipse(c, x + 9 + i * 6, y + 1 - i * 3, 3, 3, '#c7ad79'); } }
  return cv;
}
export function unitArt(kind: string, frame: number): HTMLCanvasElement {
  const [cv, c] = canvas(40, 52), x = 20, y = 43, enemy = ['hollow', 'runner', 'brute'].includes(kind), brute = kind === 'brute';
  const cloak = enemy ? kind === 'runner' ? '#95765e' : '#61786b' : kind === 'warden' ? '#4b7b86' : kind === 'spearman' ? '#817b9b' : kind === 'scout' ? '#729985' : kind === 'ranger' ? '#6c8060' : kind === 'healers' ? '#c4c6a7' : kind === 'farmers' ? '#c5ae76' : kind === 'miners' ? '#899fa0' : kind === 'woodcutters' ? '#9b8871' : kind === 'builders' ? '#b78261' : '#b99b70';
  ellipse(c, x + 2, y, brute ? 10 : 7, 3.5, '#152a284a');
  // Pose changes are baked once into tiny textures; no per-frame canvas drawing.
  if (frame === 1 || frame === 2) c.translate(frame === 1 ? .5 : -.5, -1);
  if (frame === 5 || frame === 6) c.translate(frame === 5 ? .25 : -.25, -.3);
  if(enemy)c.transform(1,0,-.07,1,2,1);
  if (frame === 3) c.transform(1, 0, -.09, 1, 3, 0);
  if (frame === 4) c.transform(1, 0, .05, 1, -1, 1);
  const shift = frame === 1 ? 3 : frame === 2 ? -3 : frame === 5 ? 1 : frame === 6 ? -1 : frame === 3 ? -5 : 0;
  line(c, [x - 3, y - 10, x - 3 + shift, y], '#4e5446', 3); line(c, [x + 3, y - 10, x + 3 - shift, y], '#4e5446', 3);
  poly(c, [x - (brute ? 8 : 5), y - 24, x + (brute ? 8 : 5), y - 24, x + 7, y - 6, x - 7, y - 6], cloak);
  line(c, [x - 5, y - 21, x - 9, y - 11 + shift], enemy ? '#8a9b79' : '#baa383', 3);
  line(c, frame === 3 ? [x + 4, y - 21, x + 15, y - 20] : enemy&&frame===4?[x+4,y-21,x+16,y-13]:[x + 4, y - 21, x + 8, y - 12 - shift], enemy ? '#8a9b79' : '#baa383', brute ? 4 : 2.5);
  ellipse(c, x, y - 28, brute ? 6 : 4.5, brute ? 6 : 5, enemy ? '#9dae84' : '#d4bc96');
  if (enemy) { c.fillStyle = '#dbcda0'; c.fillRect(x - 3, y - 29, 2, 1.5); c.fillRect(x + 2, y - 29, 2, 1.5); }
  if (kind === 'warden') { poly(c, [x - 5, y - 28, x - 4, y - 35, x + 2, y - 36, x + 6, y - 30, x + 5, y - 27], '#c3c8b7'); poly(c, [x - 11, y - 22, x - 3, y - 20, x - 3, y - 9, x - 8, y - 6, x - 13, y - 12], '#b4a574', '#ddd1a0'); line(c, frame === 3 ? [x + 5, y - 16, x + 18, y - 29] : frame === 4 ? [x + 6, y - 18, x + 18, y - 13] : [x + 8, y - 8, x + 10, y - 32], '#e0dfc1', 2); line(c, [x + 5, y - 14, x + 12, y - 13], '#c8a674', 2); }
  if (kind === 'ranger' || kind === 'scout') { poly(c, [x - 6, y - 28, x - 3, y - 37, x + 6, y - 30], '#5b745a'); c.beginPath(); c.arc(x + 5, y - 18, 10, -1.3, 1.3); c.strokeStyle = '#bcab79'; c.lineWidth = 2; c.stroke(); line(c, frame === 3 ? [x + 8, y - 28, x + 1, y - 18, x + 8, y - 8] : [x + 8, y - 28, x + 8, y - 8], '#dbd6b5'); if (frame === 3) line(c, [x + 1, y - 18, x + 18, y - 18], '#ead9ac', 1.5); }
  if (kind === 'spearman') { poly(c, [x - 5, y - 28, x - 4, y - 35, x + 3, y - 35, x + 6, y - 28], '#c0bfc4'); line(c, frame === 3 ? [x - 6, y - 12, x + 18, y - 32] : [x + 9, y - 3, x + 11, y - 44], '#b9a178', 2); poly(c, frame === 3 ? [x + 18, y - 32, x + 10, y - 30, x + 15, y - 24] : [x + 11, y - 47, x + 7, y - 38, x + 14, y - 38], '#d7d7ce'); }
  if (!enemy && !['warden', 'ranger', 'spearman', 'scout'].includes(kind)) { ellipse(c, x, y - 32, 6, 2.5, '#ad9768'); if (['woodcutters', 'miners', 'builders', 'farmers'].includes(kind)) { line(c, [x + 8, y - 7 + shift, x + 8, y - 24 + shift], '#776347', 2); line(c, [x + 5, y - 23 + shift, x + 12, y - 24 + shift], '#bfc3ae', kind === 'farmers' ? 1 : 3); } if (kind === 'healers') { c.fillStyle = '#71846a'; c.fillRect(x + 5, y - 16, 7, 7); line(c, [x + 8, y - 15, x + 8, y - 10], '#e4dac2', 1); line(c, [x + 6, y - 12, x + 10, y - 12], '#e4dac2', 1); } }
  return cv;
}

// Cached connection masks share the same occupied tile as the navigation grid.
export function barrierArt(mask:number,gate=false):HTMLCanvasElement {
 const [cv,c]=canvas(156,180),x=78,y=143;
 poly(c,[x,y-16,x+32,y,x,y+16,x-32,y],'#6b715a88','#52634d');
 const dirs=[[16,8,1],[-16,-8,2],[-16,8,4],[16,-8,8]];
 for(const[dx,dy,bit]of dirs)if(mask&bit){
  for(let n=0;n<=4;n++){if(gate&&n<3)continue;const a=n/4,px=x+dx*a,py=y+dy*a;poly(c,[px-2.6,py,px-2.6,py-27,px,py-33,px+2.6,py-27,px+2.6,py],'#8b8060','#5e6048');line(c,[px+1,py-25,px+1,py-2],'#c5b989',1);}
  line(c,[x,y-9,x+dx,y+dy-9],'#57593f',3);
 }
 if(gate){const a=mask===3?1:-1;poly(c,[x-10,y-5*a,x-10,y-28-5*a,x+10,y-28+5*a,x+10,y+5*a],'#796b4e','#414c38');line(c,[x-10,y-19-5*a,x+10,y-7+5*a],'#c9b782',2);banner(c,x+16,y-38);}
 return cv;
}
