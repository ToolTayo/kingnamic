import {describe,expect,it} from 'vitest';
import {indexActorsByScreenY,obscuresActor} from '../src/render/visibility';
import type {Point} from '../src/game/types';
const scan=(foot:Point,width:number,height:number,actors:Point[])=>actors.some(p=>p.y<foot.y+4&&p.y>foot.y-height&&Math.abs(p.x-foot.x)<width);

describe('indexed screen-space occlusion',()=>{
 it('preserves strict edge behavior and input order independence',()=>{
  const foot={x:120,y:240},actors=[{x:120,y:240},{x:120,y:155},{x:144,y:200},{x:130,y:200},{x:121,y:159}];
  expect(obscuresActor(foot,24,85,indexActorsByScreenY(actors))).toBe(scan(foot,24,85,actors));
  expect(obscuresActor(foot,24,85,indexActorsByScreenY(actors.toReversed()))).toBe(true);
  expect(obscuresActor(foot,24,85,[{x:144,y:200}])).toBe(false);
 });
 it('matches the prior scan for dense armies, buildings and scenery positions',()=>{
  let seed=0x4b494e47;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let run=0;run<200;run++){
   const actors:Point[]=Array.from({length:520},()=>({x:rnd()*1800,y:rnd()*1200})),index=indexActorsByScreenY(actors);
   for(let n=0;n<64;n++){const foot={x:rnd()*1800,y:rnd()*1200},width=n%2?24:30,height=n%3?55:85;expect(obscuresActor(foot,width,height,index)).toBe(scan(foot,width,height,actors));}
  }
 });
});
