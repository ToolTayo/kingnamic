import type { ArmyOrder, Point, Unit } from '../game/types';
import { isFriendly } from '../game/state';
// Pick the visible body as well as its ground position. Touch margins are in
// screen pixels, so zooming out does not make a soldier impossible to tap.
export function pickSoldier(units:Unit[],pointer:Point,project:(p:Point)=>Point,zoom:number,touch=false,order?:ArmyOrder|null):Unit|undefined {
  let best:Unit|undefined,score=Infinity;
  for(const u of units){
    if(u.hp<=0||order==='attack'&&isFriendly(u)||order==='escort'&&!isFriendly(u))continue;
    const p=project(u),dx=Math.abs(pointer.x-p.x),dy=pointer.y-p.y,margin=touch?8:2;
    if(dx>11*zoom+margin||dy< -39*zoom-margin||dy>8*zoom+margin)continue;
    const feet=Math.hypot(dx,dy),n=feet<9*zoom+margin?feet*.1:20+dx+Math.abs(dy+19*zoom)*.35;
    if(n<score||n===score&&u.x+u.y>(best?.x??0)+(best?.y??0)){best=u;score=n;}
  }
  return best;
}
