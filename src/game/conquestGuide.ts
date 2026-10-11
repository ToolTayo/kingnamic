import {LANDMARKS, ROAD_EXIT, STRONGHOLDS, strongholdCaptureError} from './empire';
import {army, rivalStronghold} from './state';
import {distance} from './map';
import {nearestOpen} from './navigation';
import type {Command, Point, State, StrongholdId} from './types';

export interface RouteStop extends Point {name:string}
export const CONQUEST_IDS:StrongholdId[]=['mossgate','tallowmere','stonewake','alderwatch','redwater'];
// Waypoints use the existing roads and outside staging positions, never a
// destination inside an unrevealed keep. The normal commander proximity and
// report rules still discover and raise each garrison.
export const CONQUEST_ROUTES={
 mossgate:{region:'Eastern pasture',clue:'Explore Briar village, then follow the eastern road beyond Splitwater Ford.',report:'village',rumor:undefined,discovery:[{x:14,y:17,name:'Briar village approach'},{x:14,y:11,name:'Briar village'}],approach:[{x:21,y:10,name:'Old watch road'},{x:33,y:24,name:'Splitwater Ford'},{x:40,y:29,name:'Mossgate western approach'}],objective:'Breach the western gate, defeat the Gloamward and every relief company, then secure the hall.',tactics:'Wardens hold the gate; keep bowmen behind the melee line.'},
 tallowmere:{region:'Southern river causeway',clue:'Follow the southern road through Saltwick Causeway to the wayfarers’ camp.',report:'wayfarer-camp',rumor:'weirward',discovery:[{x:14,y:32,name:'Southern road'},{x:21,y:38,name:'River approach'},{x:29,y:39,name:'Saltwick Causeway'},{x:28,y:44,name:'Wayfarers’ camp'}],approach:[{x:32,y:42,name:'Causeway staging ground'}],objective:'Breach the causeway gate or eastern postern, defeat all defenders and warned reserves, then secure the hall.',tactics:'A heavy spear line shields archers. Two gates offer different approaches.'},
 stonewake:{region:'Greybank ridge · quarry',clue:'Take the old watch road northeast, then follow the cart tracks into the Greybank ridge.',report:'stonewake-quarry',rumor:'stonewake',discovery:[{x:21,y:10,name:'Old watch road'},{x:35,y:9,name:'North heath'},{x:40,y:9,name:'North quarry track'},{x:40,y:13,name:'Quarry flank'},{x:43,y:13,name:'Quarry scouting overlook'}],approach:[{x:44,y:13,name:'Southwestern quarry approach'}],objective:'Breach a quarry pass, destroy the Signal Tower to delay reserves, defeat every company, then secure the hall.',tactics:'Spears guard narrow cuts; ranged defenders use high ground and scouts threaten exposed flanks.'},
 alderwatch:{region:'Southwestern abbey ravines',clue:'Follow the southwest abbey branch. The roadside ledger names the Wardens.',report:'abbey-road',rumor:'alderwatch',discovery:[{x:14,y:29,name:'Abbey branch'},{x:8,y:32,name:'Abbey ledger approach'}],approach:[{x:12,y:33,name:'Outside the watch-post ranges'}],objective:'Breach either ravine gate, neutralize the raised watch posts, defeat every Warden and reserve, then secure the hall.',tactics:'Keep your commander outside both watch-post ranges while your companies establish bow cover.'},
 redwater:{region:'Northeastern heath · ravine',clue:'Follow the old watch road to the Redwater cairn. Its tally reveals the ravine Watch.',report:'redwater-cairn',rumor:'redwater',discovery:[{x:21,y:10,name:'Old watch road'},{x:35,y:14,name:'Redwater cairn'}],approach:[{x:39,y:17,name:'Southern heath screen'},{x:43,y:17,name:'Warned northeast approach'}],objective:'Clear Westcut, High Heath and East Ravine camps, defeat all finite reserves, then secure Redwater Hall.',tactics:'Disciplined spears and rotating archers defend three camps. Avoid rushing the central keep.'},
} satisfies Record<StrongholdId,{region:string;clue:string;report:string;rumor:string|undefined;discovery:RouteStop[];approach:RouteStop[];objective:string;tactics:string}>;

export function frontierState(s:State):State|undefined {return s.region==='march'?s:s.empire?.reserve.region==='march'?s.empire.reserve:undefined;}
export function conquestGuide(s:State,id:StrongholdId){
 const frontier=frontierState(s),march=frontier?.march,war=frontier&&rivalStronghold(frontier,id),info=STRONGHOLDS[id],route=CONQUEST_ROUTES[id];
 const surveyed=!!march?.seen.includes(route.report),reported=surveyed||!!(route.rumor&&march?.rumors?.includes(route.rumor));
 const status=war?.status==='captured'?'secured':war?.status==='occupied'?'besieged':reported?'scouted':'unknown';
 const stage=status==='unknown'?'discover':status==='scouted'?'approach':status==='secured'?'visit':'siege';
 const stops:RouteStop[]=stage==='discover'?route.discovery:stage==='approach'?route.approach:stage==='visit'?[{...nearestOpen(frontier??s,info.center),name:info.name+' Hall entrance'}]:route.approach.slice(-1);
 const clueMarker=status==='unknown'||status==='scouted'&&!route.rumor;
 const marker=clueMarker?LANDMARKS.find(p=>p.id===route.report)!:info.center;
 const blocker=s.region==='march'&&war?.status==='occupied'?strongholdCaptureError(s,id):null;
 return {id,info,route,war,status,stage,stops,marker,clueMarker,reported,surveyed,blocker,local:s.region==='march'};
}

export interface ConquestNavigation {id:StrongholdId;stage:string;leg:number;point?:RouteStop;path:Point[]}
// Scouting requires the commander to reach the actual clue, not an offset
// formation slot. Escorts keep the established formation and independent guards
// retain their orders. Commands still pass through the normal command validator.
export function conquestMoveOrders(s:State,ids:number[],point:Point):Command[]{
 const commander=s.commander?.id;if(commander===undefined||!ids.includes(commander))return [];
 const escorts=ids.filter(id=>id!==commander);
 return [...(escorts.length?[{type:'order',order:'move',ids:escorts,x:point.x,y:point.y} as Command]:[]),{type:'order',order:'move',ids:[commander],x:point.x,y:point.y}];
}
// Presentation progress is transient. Saves contain only the established
// discoveries/campaign ledger, and selecting a route never mutates that ledger.
export function advanceRoute(s:State,nav:ConquestNavigation):RouteStop|undefined {
 if(s.expedition)return undefined;
 if(s.region!=='march')return {...ROAD_EXIT,name:'Southern road · Briar March'};
 const guide=conquestGuide(s,nav.id);
 if(nav.stage!==guide.stage){nav.stage=guide.stage;nav.leg=0;}
 const hero=army(s).find(u=>u.id===s.commander?.id);
 while(hero&&nav.leg<guide.stops.length-1&&distance(hero,guide.stops[nav.leg])<1)nav.leg++;
 return guide.stops[nav.leg];
}
