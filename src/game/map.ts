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
const segmentDistance = (x:number,y:number,a:Point,b:Point):number => {
  const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l)):0;
  return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);
};
function followsRoad(x:number,y:number,points:Point[],width=.58):boolean{
  for(let i=1;i<points.length;i++)if(segmentDistance(x,y,points[i-1],points[i])<width)return true;
  return false;
}
const homeRoad:Point[]=[{x:14,y:24},{x:14,y:31},{x:19,y:37},{x:30,y:41},{x:40,y:40},{x:48,y:33},{x:51,y:24},{x:48,y:17},{x:41,y:14},{x:29,y:14}];
const marchRoad:Point[]=[{x:14,y:24},{x:14,y:32},{x:21,y:38},{x:33,y:39},{x:43,y:34},{x:49,y:27},{x:49,y:18},{x:43,y:14},{x:29,y:14}];
export const TILES: Tile[] = Array.from({ length: MAP_W * MAP_H }, (_, i) => {
  const x = i % MAP_W, y = Math.floor(i / MAP_W), n = hash(x, y), territory = territoryAt(x, y);
  let terrain: Terrain = 'grass';
  if(x<30&&y<26){
    if ((territory === 'pinewatch' || territory === 'wild') && n > 0.45) terrain = 'forest';
    if (territory === 'greybank' && n > 0.6) terrain = 'rock';
    if (territory === 'fen' && n > 0.4) terrain = 'marsh';
    if ((y === 20 || y === 21) && x !== 14 && x !== 15) terrain = 'water';
    if ((x === 23 || x === 24) && y > 4 && y < 20 && y !== 11 && y !== 12) terrain = 'water';
    if ((x === 14 || x === 15) && y >= 7 && y <= 24 || (y === 11 || y === 12) && x > 2 && x < 28) terrain = 'road';
  }else{
    const pine=((x-45)/15)**2+((y-13)/17)**2<1.15||((x-8)/12)**2+((y-37)/13)**2<1.1;
    const ridge=Math.abs(x-(37+5*Math.sin(y*.19)+2*Math.sin(y*.43)))<1.25&&y<36;
    const upland=x>35&&y<27&&hash(x+9,y+33)>.54;
    const riverX=31+5*Math.sin(y*.17)+2*Math.sin(y*.37);
    if(pine&&n>.27)terrain='forest';
    if(upland||ridge)terrain='rock';
    if((x<22&&y>31||x>38&&y>39)&&hash(x+47,y+6)>.37)terrain='marsh';
    if(x>28&&x<43&&y>22&&y<34&&n>.25)terrain='field';
    if(x>30&&y<13&&hash(x+7,y+71)>.3)terrain='heath';
    if(Math.abs(x-riverX)<1.3&&y>20&&y<45)terrain='water';
    if(followsRoad(x,y,homeRoad))terrain='road';
  }
  return { x, y, terrain, territory, height: territory === 'greybank' ? 1 : 0, variant: n };
});
export const MARCH_TILES:Tile[]=TILES.map(t=>{
  const n=hash(t.x+81,t.y+37);let terrain:Terrain='grass';
  if(t.x<30&&t.y<26){
    if((t.x<5||t.x>24||t.y<5)&&n>.35)terrain='forest';
    if(t.x>20&&t.y<9&&n>.7)terrain='rock';
    if(t.x===8&&t.y!==14&&t.y!==15)terrain='water';
    if(t.x>22&&t.y>18&&n>.4)terrain='marsh';
    if(t.x===14||t.y===14)terrain='road';
  }else{
    const woodland=((t.x-7)/13)**2+((t.y-30)/17)**2<1.2||((t.x-49)/13)**2+((t.y-16)/18)**2<1.2;
    const ridge=Math.abs(t.x-(35+6*Math.sin(t.y*.16)+2*Math.sin(t.y*.41)))<1.6&&t.y<35;
    const highland=t.x>38&&t.y<28&&hash(t.x+15,t.y+21)>.46;
    const riverX=30+6*Math.sin(t.y*.15)+2*Math.sin(t.y*.34);
    if(woodland&&n>.25)terrain='forest';
    if(highland||ridge)terrain='rock';
    if((t.x<22&&t.y>34||t.x>40&&t.y>39)&&n>.34)terrain='marsh';
    if(t.x>25&&t.x<42&&t.y>22&&t.y<35&&n>.2)terrain='field';
    if(t.x>30&&t.y<13&&n>.3)terrain='heath';
    if(Math.abs(t.x-riverX)<1.35&&t.y>20&&t.y<45)terrain='water';
    if(followsRoad(t.x,t.y,marchRoad))terrain='road';
  }
  return {...t,terrain,territory:'hearthmere',variant:n,height:t.y<9?1:0};
});
export const tilesFor=(s?:{region?:State['region']})=>s?.region==='march'?MARCH_TILES:TILES;
export function tileAt(x: number, y: number,s?:{region?:State['region']}): Tile | undefined { if(x<0||y<0||x>=MAP_W||y>=MAP_H)return undefined;return tilesFor(s)[Math.floor(y)*MAP_W+Math.floor(x)]; }
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
export const key = (p: Point): number => Math.round(p.y) * MAP_W + Math.round(p.x);
