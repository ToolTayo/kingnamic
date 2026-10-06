import type { Resource, State, Unit } from './types';

// Keep the original stone slot as the sole crown ledger. Old stone is exchanged
// 1:1 by interpretation, never added to another balance on load. Jobs/buildings
// keep their stable IDs so active saves and expeditions retain their contracts.
export const RESOURCE_NAMES:Record<Resource,string>={wood:'Timber',stone:'Crowns',food:'Provisions',herbs:'Herbs'};
// The old bountyPaid field is retained only for legacy saves, not a silent cap.
export function credit(s:State,resource:Resource,amount:number):number {
  const paid=Math.max(0,Math.min(amount,(resource==='stone'?1e9:9999)-s.resources[resource]));
  s.resources[resource]+=paid;return paid;
}
export function awardBounty(s:State,u:Unit,expedition=!!s.theatre):number {
  if(u.hp>0||u.bountySettled||!u.bountyEligible)return 0;
  u.bountySettled=true;
  if(u.reanimatedFrom!==undefined)return 0;
  if(expedition){
    if(!s.lostBattalions)return 0;
    const claimed=s.lostBattalions.bounties??=[],key=u.bountyKey??'legacy-'+u.id;
    if(claimed.includes(key))return 0;
    s.lostBattalions.bounties=[...claimed,key];
  }
  const paid=credit(s,'stone',u.kind==='brute'?3:u.kind==='runner'?2:1);
  s.bountyTotal=(s.bountyTotal??0)+paid;return paid;
}
