import {relocationError,relocate,placementAccessError} from './relocation';
import {returnToHomeWatch,gatherCompany,travel,outpostError,foundOutpost,accessError,captureStronghold} from './empire';
import { BUILDINGS, MAX_BUILDINGS, TERRITORIES, UNITS } from './config';
import { canAfford, capacity, idle, jobCapacity, rebalanceJobs, spend } from './economy';
import { distance, key, tileAt } from './map';
import { nearestOpen } from './navigation';
import { army, enemies, hostiles, log, makeBuilding, makeUnit } from './state';
import { expeditionAction, launchExpedition } from './expedition';
import { assignDestinations, available, orderArmy } from './army';
import { addResidents, ensureResidents, removeResidents, assignResidentJobs } from './population';
import { cure, illnessFor } from './disease';
import { RESOURCE_NAMES } from './treasury';
import { recruitmentBlocker, recruitmentCost, recruitmentPlan, selectRecruitResidents } from './recruitment';
import type { Building, BuildingKind, Command, CommandResult, Resources, State } from './types';
const result = (ok: boolean, message: string): CommandResult => ({ ok, message });
export function shortage(s:State,cost:Partial<Resources>):string {return Object.entries(cost).filter(([r,n])=>s.resources[r as keyof Resources]<n).map(([r,n])=>`${Math.ceil(n-s.resources[r as keyof Resources])} ${RESOURCE_NAMES[r as keyof Resources]}`).join(' + ');}
export function buildError(s: State, kind: BuildingKind, x: number, y: number, rotation?:0|1): string | null {
  const tile = tileAt(x, y,s);
  if(kind==='hearth'){const error=outpostError(s,x,y);if(error)return error;}
  if (!tile || !Number.isInteger(x) || !Number.isInteger(y)) return 'Choose a tile in the valley.';
  if(s.region&&kind!=='hearth'&&!s.march?.secured)return 'Clear the region and establish an outpost first.';
  if(s.region&&tile.terrain==='rock')return 'The bedrock cannot support a foundation. Choose open ground.';
  if(s.region&&tile.terrain==='forest')return 'Keep the dense grove for timber. Build on open ground beside it.';
  if(s.region&&hostiles(s).some(u=>distance(u,tile)<5))return 'Drive defenders and infected away from this building site.';
  if ((tile.territory === 'wild' || !s.owned.includes(tile.territory)) && !(s.region==='march'&&s.march?.secured)) return 'Reclaim this territory before building here.';
  if (tile.terrain === 'water') return 'You cannot build on the river.';
  if (s.buildings.some(b => b.x === x && b.y === y)) return 'There is already a building here.';
  if (s.units.some(u => distance(u, tile) < 0.65)) return 'Move the troops off this tile first.';
  if (s.buildings.length >= MAX_BUILDINGS) return 'The settlement has reached its building limit.';
  if(s.region){const access=accessError(s,x,y,kind);if(access)return access;}
  if(s.region||kind==='wall'||kind==='gate'){const access=placementAccessError(s,kind,x,y,rotation);if(access)return access;}
  if (kind!=='hearth'&&!canAfford(s, BUILDINGS[kind].cost)) return `Need ${shortage(s,BUILDINGS[kind].cost)} more.`;
  return null;
}
export function upgradeCost(b: Building): Partial<Resources> { return { wood: Math.ceil((BUILDINGS[b.kind].cost.wood ?? 65) * 0.7 * b.level), stone: Math.ceil((BUILDINGS[b.kind].cost.stone ?? (b.kind==='wall'||b.kind==='gate'?5:20)) * 0.7 * b.level) }; }
export function repairCost(b: Building): Partial<Resources> { return { wood: Math.ceil((b.maxHp - b.hp) / 18) }; }
export function command(s:State,c:Command):CommandResult{
  const r=applyCommand(s,c);if(s.empire){const other=s.empire.reserve;other.resources=s.resources;other.squads=s.squads;other.nextId=s.nextId;for(const u of army(other))if(u.squadId&&!s.squads?.some(q=>q.id===u.squadId))delete u.squadId;}return r;
}
function applyCommand(s: State, c: Command): CommandResult {
  if (c.type === 'speed') { s.speed = c.speed; if (c.speed) s.lastSpeed = c.speed; return result(true, c.speed ? `Time flows at ${c.speed}×.` : 'The kingdom is paused.'); }
  if(c.type==='travel')return travel(s,c.ids);
  if(c.type==='home-watch')return returnToHomeWatch(s);
  if(c.type==='gather-company')return gatherCompany(s,c.ids);
  if(c.type==='commander-appoint'){
    if(s.expedition)return result(false,'Return from the expedition first.');
    if(s.commander&&army(s).some(u=>u.id===s.commander!.id))return result(false,'Your commander is already serving.');
    const u=army(s).find(u=>(c.id===undefined?u.kind==='warden':u.id===c.id)&&available(s,u)&&!illnessFor(s,u.id));
    if(!u)return result(false,'Choose a fit, uninfected soldier.');
    s.commander={id:u.id,weapon:'sword',xp:0};u.kind='warden';return result(true,'Commander appointed from your existing army. Lead personally or use tactical orders.');
  }
  if(c.type==='commander-weapon'){
    const u=army(s).find(u=>u.id===s.commander?.id);if(!u||s.expedition)return result(false,'The commander is not available here.');
    if(!['sword','spear','bow'].includes(c.weapon))return result(false,'Choose sword, spear or bow.');
    s.commander!.weapon=c.weapon;u.kind=c.weapon==='bow'?'ranger':c.weapon==='spear'?'spearman':'warden';return result(true,c.weapon+' equipped. Health and recovery remain unchanged.');
  }
  if(c.type==='settlement-rename'){
    if(s.expedition)return result(false,'Return from the expedition before naming a settlement.');
    const b=s.buildings.find(b=>b.id===c.id&&b.kind==='hearth'),name=c.name.trim().replace(/\s+/g,' ').slice(0,32);
    if(!b||name.length<2)return result(false,'Choose a settlement and give it a name of at least two characters.');
    b.name=name;log(s,`${name} is entered in the kingdom ledger.`,'good');return result(true,`${name} named.`);
  }
  if(c.type==='stronghold-capture')return captureStronghold(s);
  if (c.type === 'expedition-launch') {if(s.region)return result(false,'Depart for the Broken Standard from Hearthmere.');return launchExpedition(s, c.ids, c.approach);}
  if (c.type === 'expedition-share' || c.type === 'expedition-retreat' || c.type === 'expedition-extract') return expeditionAction(s, c.type);
  if (s.expedition) {
    if (c.type === 'treat') {
      if(s.expedition.medicine<1||!s.expedition.world.infection.some(i=>!c.ids||c.ids.includes(i.personId!)))return result(false,'No medicine or living infected people in this patrol.');
      s.expedition.medicine--;cure(s.expedition.world,1,c.ids);return result(true,'One packed herb treated the most urgent selected infection.');
    }
    if (c.type === 'rally' || c.type === 'formation' || c.type==='order' || c.type.startsWith('squad-')) {
      const r=command(s.expedition.world,c);
      if(r.ok&&c.type.startsWith('squad-')) {
        // Names and group IDs are a kingdom ledger even while its clock waits.
        // Membership edits still address only the soldiers in this battlefield.
        s.squads=(s.expedition.world.squads??[]).map(q=>({...q}));
        s.nextId=Math.max(s.nextId,s.expedition.world.nextId);
        for(const u of army(s))if(u.squadId&&!s.squads.some(q=>q.id===u.squadId))delete u.squadId;
      }
      return r;
    }
    return result(false, 'Return from the expedition before managing the kingdom.');
  }
  if(c.type==='continue'&&s.outcome==='won'){s.endless=true;s.outcome='playing';s.speed=0;return result(true,'The watch continues. Build garrisons, house settlers and sustain a larger army.');}
  if (s.outcome !== 'playing') return result(false, 'This chapter has ended. Continue the watch or start a new kingdom.');
  ensureResidents(s); assignResidentJobs(s);
  switch (c.type) {
    case 'demobilize': {
      const ids=new Set(c.ids),people=army(s).filter(u=>ids.has(u.id));
      if(s.commander&&ids.has(s.commander.id))return result(false,'Keep the serving commander in the army.');
      if(s.theatre||s.phase!=='day'||enemies(s).length||!people.length||people.length!==ids.size||people.some(u=>u.injury||illnessFor(s,u.id)))return result(false,'Release fit, uninfected soldiers during peaceful daylight.');
      if(capacity(s)-s.population<people.length)return result(false,'Build enough spare beds for these soldiers first.');
      s.units=s.units.filter(u=>!ids.has(u.id));
      for(const u of people){const r=addResidents(s,1)[0];r.id=u.id;r.hp=r.maxHp*u.hp/u.maxHp;r.exposure=u.exposure;r.immune=u.immune;}
      return result(true,`${people.length} soldiers returned to civilian work. Equipment costs are not refunded.`);
    }
    case 'continue': return result(false,'Finish the first chapter before continuing the watch.');
    case 'settlers': {
      if(s.region&&!s.march?.secured)return result(false,'Establish a secure outpost before inviting settlers.');
      if(s.phase!=='day'||enemies(s).length||(s.musterClock??0)>0)return result(false,'Invite settlers during peaceful daylight, once every 20 seconds.');
      if(capacity(s)-s.population<5)return result(false,'Build five spare beds before inviting settlers.');
      if(!canAfford(s,{stone:20}))return result(false,'Inviting five settlers costs 20 Crowns.');
      spend(s,{stone:20});addResidents(s,5);s.musterClock=20;return result(true,'Five settlers arrived. Assign them work or equip them as soldiers.');
    }
    case 'order': return orderArmy(s,c.ids,c.order,c.x!==undefined&&c.y!==undefined?{x:c.x,y:c.y}:undefined,c.focus);
    case 'squad-create': {
      const ids=new Set(c.ids),members=army(s).filter(u=>ids.has(u.id)&&u.origin!=='battalion');s.squads??=[];
      if(!members.length||members.length!==ids.size||s.squads.length>=20)return result(false,'Choose living soldiers; at most 20 squads can be named.');
      const name=c.name.trim().slice(0,24);if(!name)return result(false,'Give the squad a name.');
      const squad={id:s.nextId++,name,color:s.squads.length%6};s.squads.push(squad);for(const u of members)u.squadId=squad.id;
      return result(true,`${name}: ${members.length} soldiers. Their existing orders are preserved.`);
    }
    case 'squad-assign': {
      if(c.squadId!==undefined&&!s.squads?.some(q=>q.id===c.squadId))return result(false,'That squad no longer exists.');
      const members=army(s).filter(u=>c.ids.includes(u.id)&&u.origin!=='battalion');if(!members.length||members.length!==new Set(c.ids).size)return result(false,'Select living soldiers first.');
      for(const u of members)u.squadId=c.squadId;return result(true,`${members.length} soldiers reassigned; unrelated squads keep their orders.`);
    }
    case 'squad-rename': {const q=s.squads?.find(q=>q.id===c.squadId);if(!q||!c.name.trim())return result(false,'Choose a squad and a name.');q.name=c.name.trim().slice(0,24);return result(true,'Squad renamed.');}
    case 'squad-delete': {if(s.empire)for(const u of army(s.empire.reserve))if(u.squadId===c.squadId)delete u.squadId;s.squads=s.squads?.filter(q=>q.id!==c.squadId);for(const u of army(s))if(u.squadId===c.squadId)delete u.squadId;return result(true,'Squad dissolved. Its soldiers and orders remain.');}
    case 'relocate': {if(s.buildings.some(b=>b.id===c.id&&b.owner==='rival'))return result(false,'Capture the stronghold before moving its structures.');const error=relocationError(s,c.id,c.x,c.y,c.rotation);if(error)return result(false,error);relocate(s,c.id,c.x,c.y,c.rotation);return result(true,'Building rearranged. Health, level, work and resources preserved.');}
    case 'build': {
      if(c.rotation!==undefined&&(![0,1].includes(c.rotation)||!['wall','gate'].includes(c.kind)))return result(false,'Choose a supported barrier orientation.');
      const error = buildError(s, c.kind, c.x, c.y,c.rotation); if (error) return result(false, error);
      if(c.kind==='hearth'){foundOutpost(s,c.x,c.y);const b=s.buildings.filter(v=>v.kind==='hearth').at(-1)!;return result(true,`${b.name} founded. Build freely on accessible open terrain.`);}
      spend(s, BUILDINGS[c.kind].cost); const built=makeBuilding(s, c.kind, c.x, c.y);if(c.rotation!==undefined)built.rotation=c.rotation;
      return result(true, `${BUILDINGS[c.kind].name} construction started.`);
    }
    case 'upgrade': case 'repair': {
      const b = s.buildings.find(b => b.id === c.id); if (!b) return result(false, 'That building is no longer standing.');
      if (b.owner==='rival')return result(false,'Capture this structure before repairing or upgrading it.');
      if (b.progress < 1) return result(false, 'Wait for construction to finish.');
      if (c.type === 'upgrade' && b.level >= 3) return result(false, 'This building is fully upgraded.');
      if (c.type === 'repair' && b.hp >= b.maxHp) return result(false, 'This building is already in good repair.');
      if (hostiles(s).some(u => distance(u, b) < 2)) return result(false, 'Drive the defenders and infected away before repairing or upgrading.');
      const cost = c.type === 'upgrade' ? upgradeCost(b) : repairCost(b);
      if (!canAfford(s, cost)) return result(false, 'Not enough supplies.');
      spend(s, cost);
      if (c.type === 'upgrade') { b.level++; b.maxHp = Math.round(BUILDINGS[b.kind].hp * (1 + (b.level - 1) * 0.5)); }
      b.hp = b.maxHp; log(s, `${BUILDINGS[b.kind].name} ${c.type === 'upgrade' ? `upgraded to level ${b.level}` : 'repaired'}.`, 'good');
      return result(true, 'Your settlement grows stronger.');
    }
    case 'job': {
      if (!Number.isInteger(c.delta) || Math.abs(c.delta) !== 1) return result(false, 'Change one assignment at a time.');
      if (c.delta > 0 && idle(s) <= 0) return result(false, 'No healthy villagers are unassigned.');
      if (c.delta > 0 && s.jobs[c.job] >= jobCapacity(s, c.job)) return result(false, 'Build or upgrade a workplace for more jobs.');
      s.jobs[c.job] = Math.max(0, s.jobs[c.job] + c.delta); return result(true, 'Work assignment updated.');
    }
    case 'recruit': {
      const barracks = s.buildings.find(b => b.kind === 'barracks' && b.owner !== 'rival' && b.progress >= 1 && b.hp > 0);
      if (!barracks) return result(false, 'Build a garrison first.');
      const count = c.count ?? 1, plan = recruitmentPlan(s, c.kind);
      const blocker = recruitmentBlocker(s, c.kind, count, plan);
      if (blocker) return result(false, blocker);
      const cost = recruitmentCost(c.kind, count);
      const recruits = selectRecruitResidents(s, count);
      if (recruits.length !== count) return result(false, 'Not enough fit residents are available to enlist.');
      spend(s, cost);
      const reserved = new Set(s.units.map(key));
      for (const person of recruits) if (person.job !== 'idle') s.jobs[person.job] = Math.max(0, s.jobs[person.job] - 1);
      removeResidents(s, recruits.map(person => person.id));
      let armySize = army(s).length;
      for (const person of recruits) {
        const p = nearestOpen(s, { x: barracks.x, y: barracks.y + 1 }, reserved);
        reserved.add(key(p));
        const u = makeUnit(s, c.kind, p.x, p.y);
        u.id = person.id;
        u.hp = u.maxHp * person.hp / person.maxHp;
        u.exposure = person.exposure;
        u.exposureSourceId = person.exposureSourceId;
        u.immune = person.immune;
        u.target = nearestOpen(s, { x: 12 + armySize % 5, y: c.kind === 'warden' ? 17 : 16 });
        armySize++;
      }
      log(s, `${count} ${UNITS[c.kind].name.toLowerCase()}${count>1?'s':''} joined the defense.`, 'good'); return result(true, 'New soldiers answer your call.');
    }
    case 'rally': {
      const t = tileAt(c.x, c.y,s); if (!t || t.terrain === 'water') return result(false, 'Choose passable ground.');
      const troops = army(s).filter(u => available(s,u) && u.origin !== 'battalion' && (!c.ids || c.ids.includes(u.id)));
      if (!troops.length) return result(false, 'Recruit soldiers at your garrison first.');
      assignDestinations(s,troops,c);
      return result(true, `${troops.length} soldiers are moving to the rally point.`);
    }
    case 'formation': if(c.ids){for(const u of army(s))if(c.ids.includes(u.id))u.formation=c.formation;}else{s.formation=c.formation;for(const u of army(s))u.formation=c.formation;} return result(true,c.formation==='line'?'Shield line: nearby wardens gain 3 armor.':c.formation==='column'?'Road column: rally orders use a narrow file.':'Loose order: bowmen gain 0.6 range.');
    case 'claim': {
      if(s.region)return result(false,'Explore and clear Briar March; land here is never purchased.');
      const t = TERRITORIES[c.territory];
      if (s.owned.includes(c.territory)) return result(false, 'This territory already flies your banner.');
      if (t.requirement && !s.owned.includes(t.requirement)) return result(false, `Reclaim ${TERRITORIES[t.requirement].name} first.`);
      if (s.phase === 'night' || enemies(s).length) return result(false, 'Secure the valley and wait for daylight before expanding.');
      if (army(s).length < 4) return result(false, 'You need at least 4 soldiers to secure a new frontier.');
      if (!canAfford(s, t.cost)) return result(false, 'Gather the required supplies before reclaiming this march.');
      spend(s, t.cost); s.owned.push(c.territory); s.stats.claimed++;
      const arrivals = Math.min(3, Math.max(0, capacity(s) - s.population)); addResidents(s,arrivals);
      rebalanceJobs(s); log(s, `${t.name} reclaimed. ${arrivals} survivors join you. A new invasion route is open. New infections require a confirmed zombie bite.`, 'warn');
      return result(true, `${t.name} now flies the Hearthmere banner.`);
    }
    case 'treat': {
      if (!s.infection.length) return result(false, 'No villagers need treatment.');
      if (!canAfford(s, { herbs: 5, food: 8 })) return result(false, 'Treatment needs 5 herbs and 8 food.');
      if(c.ids&&!s.infection.some(i=>c.ids!.includes(i.personId!)))return result(false,'No living selected soldier needs treatment.');
      spend(s, { herbs: 5, food: 8 }); const n = cure(s,3,c.ids);
      log(s, `${n} ${n === 1 ? 'villager has' : 'villagers have'} recovered. Assign their jobs again.`, 'good'); return result(true, 'The fever has broken.');
    }
    case 'quarantine': s.quarantine = !s.quarantine; log(s, s.quarantine ? 'Quarantine declared. Production falls 20%; the sick are isolated and their illness slows.' : 'Quarantine lifted. The village returns to work.', 'warn'); return result(true, 'Quarantine order updated.');
    case 'cleanse': {
      if (!s.buildings.some(b => b.kind === 'infirmary' && b.progress >= 1)) return result(false, 'Build an herbalist’s refuge first.');
      if (!canAfford(s, { herbs: 8, wood: 10 })) return result(false, 'Cleansing needs 8 herbs and 10 wood.');
      spend(s, { herbs: 8, wood: 10 }); s.contamination = s.contamination.map(v => Math.max(0, v - 70));s.suppliesTaint=0;for(const c of s.corpses??[])c.tainted=false;
      log(s, 'Cleansing fires remove ground contamination and prevent infected remains from reanimating.', 'good'); return result(true, 'The valley breathes again.');
    }
  }
}
