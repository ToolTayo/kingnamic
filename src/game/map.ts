import { MAP_H, MAP_W } from './config';
import type { Point, Terrain, TerritoryId, Tile, State } from './types';
export function hash(x: number, y: number): number { return ((Math.imul(x + 63, 374761393) ^ Math.imul(y + 71, 668265263)) >>> 0) / 4294967296; }
export function territoryAt(x: number, y: number): TerritoryId | 'wild' {
  if (x >= 9 && x <= 20 && y >= 7 && y <= 18) return 'hearthmere';
  if (x >= 1 && x <= 8 && y >= 7 && y <= 18) return 'pinewatch';
  if (x >= 9 && x <= 20 && y >= 0 && y <= 6) return 'greybank';
  if (x >= 21 && x <= 29 && y >= 7 && y <= 18) return 'fen';
  return 'wild';
}
export const TILES: Tile[] = Array.from({ length: MAP_W * MAP_H }, (_, i) => {
  const x = i % MAP_W, y = Math.floor(i / MAP_W), n = hash(x, y), territory = territoryAt(x, y);
  let terrain: Terrain = 'grass';
  if ((territory === 'pinewatch' || territory === 'wild') && n > 0.45) terrain = 'forest';
  if (territory === 'greybank' && n > 0.6) terrain = 'rock';
  if (territory === 'fen' && n > 0.4) terrain = 'marsh';
  if ((y === 20 || y === 21) && x !== 14 && x !== 15) terrain = 'water';
  if ((x === 23 || x === 24) && y > 4 && y < 20 && y !== 11 && y !== 12) terrain = 'water';
  if ((x === 14 || x === 15) && y >= 7 && y <= 24 || (y === 11 || y === 12) && x > 2 && x < 28) terrain = 'road';
  return { x, y, terrain, territory, height: territory === 'greybank' ? 1 : 0, variant: n };
});
export const MARCH_TILES:Tile[]=TILES.map(t=>{
  const n=hash(t.x+81,t.y+37);let terrain:Terrain='grass';
  if((t.x<5||t.x>24||t.y<5)&&n>.35)terrain='forest';
  if(t.x>20&&t.y<9&&n>.7)terrain='rock';
  if(t.x===8&&t.y!==14&&t.y!==15)terrain='water';
  if(t.x>22&&t.y>18&&n>.4)terrain='marsh';
  if(t.x===14||t.y===14)terrain='road';
  return {...t,terrain,territory:'hearthmere',variant:n,height:t.y<9?1:0};
});
export const tilesFor=(s?:{region?:State['region']})=>s?.region==='march'?MARCH_TILES:TILES;
export function tileAt(x: number, y: number,s?:{region?:State['region']}): Tile | undefined { const TILES=tilesFor(s);return TILES[Math.floor(y) * MAP_W + Math.floor(x)] && x >= 0 && y >= 0 && x < MAP_W && y < MAP_H ? TILES[Math.floor(y) * MAP_W + Math.floor(x)] : undefined; }
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const key = (p: Point): number => Math.round(p.y) * MAP_W + Math.round(p.x);
