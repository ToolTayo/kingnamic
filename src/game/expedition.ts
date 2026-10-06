import {empireArmy} from './empire';
import { combatStep } from './combat';
import { APPROACHES, ambushFronts, ambushRoster } from './encounters';
import { UNITS } from './config';
import { command } from './commands';
import { armyCapacity } from './army';
import { illnessFor, infect, plagueStep, cure } from './disease';
import { distance, key } from './map';
import { nearestOpen } from './navigation';
import { army, enemies, log, makeBuilding, makeUnit, newGame } from './state';
import { credit } from './treasury';
import type { CommandResult, Expedition, ExpeditionApproach, Point, SoldierKind, State } from './types';

export const ROUTE = { exit: { x: 10, y: 16 }, camp: { x: 14, y: 12 }, standard: { x: 19, y: 9 } };
export const missionRoute = (e: Expedition) => ({ ...ROUTE, standard: e.approach ? APPROACHES[e.approach].standard : ROUTE.standard });
export const equipmentReserve = (s: State) => (s.lostBattalions?.remaining.length ?? 4) * 20;
export const LOST_ROSTER: SoldierKind[] = ['warden', 'ranger', 'spearman', 'scout'];
export const readyArmy = (s: State) => army(s).filter(u => !u.injury && !illnessFor(s,u.id) && u.hp >= u.maxHp * .7);
export const expeditionParty = (e: Expedition) => army(e.world).filter(u => u.origin === 'party');
export const battalion = (e: Expedition) => army(e.world).filter(u => u.origin === 'battalion');
export const trusted = (e: Expedition) => e.shared && e.held && e.standard;
const near = (e: Expedition, p: Point, radius = 3) => expeditionParty(e).some(u => distance(u, p) < radius);
const result = (ok: boolean, message: string): CommandResult => ({ ok, message });
export function launchError(s: State): string | null {
  if(s.region)return 'Depart for the Broken Standard from Hearthmere.';
  if (s.expedition) return 'An expedition is already underway.';
  if (s.outcome === 'lost') return 'The Hearth must survive to support an expedition.';
  if (s.phase !== 'day' || enemies(s).length || s.waveRemaining) return 'Leave during peaceful daylight.';
  if (s.lostBattalions && !s.lostBattalions.remaining.length) return 'Every member of this battalion is accounted for.';
  if ((s.lostBattalions?.cooldown ?? 0) > 0) return `Let the patrol recover: ${Math.ceil(s.lostBattalions!.cooldown)} kingdom seconds before returning to the pass.`;
  if (readyArmy(s).length < 5) return 'You need five fit soldiers: three to deploy and two to guard home.';
  if (empireArmy(s) + (s.lostBattalions?.remaining.length ?? 4) > armyCapacity(s)) return 'Build or upgrade a garrison to reserve room for the stranded battalion.';
  if (s.resources.food < 30 || s.resources.herbs < 4) return 'Pack 30 provisions and 4 herbs for the patrol.';
  const reserve = equipmentReserve(s);
  if (s.resources.stone < reserve) return `Reserve ${reserve} Crowns to equip potential recruits, in addition to the patrol pack. Unused equipment is refunded.`;
  return null;
}
export function defaultPatrol(s: State): number[] {
  const fit = readyArmy(s), ranged = fit.find(u => u.kind === 'ranger' || u.kind === 'scout');
  return [...fit.filter(u => u !== ranged).slice(0, 2), ...(ranged ? [ranged] : fit.slice(2, 3))].map(u => u.id);
}
export function launchExpedition(s: State, ids = defaultPatrol(s), approach: ExpeditionApproach = 'ridge'): CommandResult {
  const error = launchError(s); if (error) return result(false, error);
  if (ids.length !== 3 || new Set(ids).size !== 3 || ids.some(id => !readyArmy(s).some(u => u.id === id))) return result(false, 'Select exactly three different fit soldiers for the patrol.');
  if (!Object.hasOwn(APPROACHES, approach)) return result(false, 'Choose the high ridge or river crossing.');
  s.lostBattalions ??= { attempts: 0, remaining: [...LOST_ROSTER], recruited: 0, cooldown: 0 };
  const record = s.lostBattalions; record.attempts++;
  // Keep a ranged soldier in the patrol when available, while always leaving two fit guards.
  const party = ids.map(id => readyArmy(s).find(u => u.id === id)!);
  const equipment = record.remaining.length;
  s.resources.food -= 30; s.resources.stone -= equipment * 20; s.resources.herbs -= 4;
  s.units = s.units.filter(u => !party.includes(u));
  const world = newGame(s.seed); world.theatre = 'expedition'; world.rng = s.rng;
  world.units = []; world.buildings = []; world.population = 0; world.residents = []; world.infection = []; world.corpses = [];
  world.squads = s.squads?.map(q => ({...q}));
  world.jobs = { farmers: 0, woodcutters: 0, miners: 0, builders: 0, healers: 0 };
  world.logs = []; world.nextId = s.nextId; world.time = 0; world.phaseTime = 40;
  world.owned = ['hearthmere', 'pinewatch', 'greybank', 'fen'];
  // The same valley terrain becomes a deserted forward outpost, not a second economy.
  makeBuilding(world, 'cottage', 12, 12, true); makeBuilding(world, 'wall', 16, 11, true);
  makeBuilding(world, 'wall', 16, 12, true); makeBuilding(world, 'cottage', 20, 10, true);
  for (let i = 0; i < party.length; i++) {
    const veteran = party[i], u = makeUnit(world, veteran.kind, 9 + i, 16);
    u.id = veteran.id; u.homeId = veteran.id; u.hp = veteran.hp; u.maxHp = veteran.maxHp; u.origin = 'party';
    u.squadId = veteran.squadId; u.formation = veteran.formation; u.exposure = veteran.exposure; u.immune = veteran.immune;
  }
  makeUnit(world, 'hollow', 15, 15).bountyKey='scout-0'; makeUnit(world, 'runner', 15, 13).bountyKey='scout-1';
  s.expedition = { world, stage: 'search', discovered: false, shared: false, held: false, standard: false, wave: 0, warning: 0, holdTime: 0, deployed: party.length, initialAllies: [...record.remaining], supplies: 12, medicine: 4, approach, variant: (s.seed + record.attempts - 1) % 3, equipment, equipmentCurrency:'crowns', pending: [] };
  s.nextId = world.nextId; s.speed = 1; s.lastSpeed = 1;
  log(s, 'Three soldiers departed for the Broken Standard. The home watch holds time until their return.', 'info');
  world.nextId = s.nextId;
  return result(true, 'Follow the broken banners to the outpost. Your kingdom waits while you lead the patrol.');
}
function spawnAmbush(e: Expedition): void {
  const points = ambushFronts(e), roster = ambushRoster(e);
  e.pending = roster.map((kind, i) => ({ kind, point: { ...points[i % points.length] }, bountyKey:'wave-'+e.wave+'-'+i, delay: e.approach ? Math.floor(i / points.length) * 2.5 : 0 }));
}
function advanceAmbush(e: Expedition, dt: number): void {
  const reserved = new Set(e.world.units.map(key));
  for (const arrival of e.pending ?? []) {
    arrival.delay = Math.max(0, arrival.delay - dt);
    if (arrival.delay) continue;
    const p = nearestOpen(e.world, arrival.point, reserved); reserved.add(key(p));
    makeUnit(e.world, arrival.kind, p.x, p.y).bountyKey=arrival.bountyKey;
  }
  e.pending = (e.pending ?? []).filter(a => a.delay > 0);
}
function finish(s: State, outcome: 'success' | 'retreated' | 'defeat'): void {
  const e = s.expedition!, record = s.lostBattalions!;
  const returning = expeditionParty(e).filter(u => distance(u, ROUTE.exit) < 3.5);
  const joined = outcome === 'success' && trusted(e) ? battalion(e).filter(u => distance(u, ROUTE.exit) < 3.5) : [];
  const remaining = e.discovered ? battalion(e).filter(u => !joined.includes(u)).map(u => u.kind as SoldierKind) : e.initialAllies;
  const casualties = e.deployed - expeditionParty(e).length + (e.discovered ? e.initialAllies.length - battalion(e).length : 0);
  const reserved = new Set(s.units.map(key));
  s.nextId = Math.max(s.nextId,e.world.nextId);
  // Squad edits made in the field apply to returning members only. Preserve
  // unrelated home groups, and bring newly named patrol groups home.
  s.squads ??= [];
  for (const q of e.world.squads ?? []) if (!s.squads.some(home => home.id === q.id)) s.squads.push({...q});
  for (const veteran of [...returning, ...joined]) {
    const p = nearestOpen(s, { x: 12 + army(s).length % 5, y: 16 }, reserved); reserved.add(key(p));
    const u = makeUnit(s, veteran.kind, p.x, p.y); u.hp = veteran.hp; u.maxHp = veteran.maxHp;
    if (veteran.homeId) u.id = veteran.homeId;
    else if (e.world.units.some(v=>v.homeId) && !s.units.some(v=>v!==u&&v.id===veteran.id) && !s.buildings.some(b=>b.id===veteran.id) && !s.residents?.some(r=>r.id===veteran.id)) u.id=veteran.id;
    u.squadId = veteran.squadId; u.formation = veteran.formation; u.exposure = veteran.exposure; u.immune = veteran.immune;
    const illness = illnessFor(e.world,veteran.id); if (illness) infect(s,u,illness.source,illness.age);
    // All returned soldiers rest briefly; severe wounds take longer. They remain
    // visible at home but cannot fight or depart again until recovery completes.
    u.injury = Math.ceil(20 + (1 - u.hp / u.maxHp) * 60);
  }
  if (e.equipment !== undefined) {
    const unused = Math.max(0, e.equipment - joined.length);
    // Active legacy expeditions settle their original food/timber contract.
    if(e.equipmentCurrency==='crowns')credit(s,'stone',unused*20);
    else {credit(s,'food',unused*8);credit(s,'wood',unused*8);}
  }
  if(outcome==='success')credit(s,'stone',joined.length*3);
  if (e.discovered) {
    record.wounds = Object.fromEntries(battalion(e).filter(u => !joined.includes(u)).map(u => [u.kind, u.hp]));
    record.sickness = Object.fromEntries(battalion(e).filter(u => !joined.includes(u) && illnessFor(e.world,u.id)).map(u => [u.kind,illnessFor(e.world,u.id)!.age]));
  }
  record.remaining = remaining; record.recruited += joined.length; record.cooldown = e.approach ? 20 : 45;
  record.report = { outcome, returned: returning.length, recruited: joined.length, lost: casualties, stranded: remaining.length };
  s.stats.lost += casualties; s.stats.slain += e.world.stats.slain;
  s.rng = e.world.rng; delete s.expedition; s.speed = 0;
  log(s, `Broken Standard: ${returning.length} patrol returned, ${joined.length} allies enlisted, ${casualties} casualties. Survivors need rest.`, joined.length ? 'good' : 'warn');
}
export function expeditionAction(s: State, type: string): CommandResult {
  if (type === 'expedition-launch') return launchExpedition(s);
  const e = s.expedition; if (!e) return result(false, 'There is no active expedition.');
  if (type === 'expedition-share') {
    if (!e.discovered || !near(e, ROUTE.camp) || e.stage === 'retreat') return result(false, 'Bring the patrol to the stranded battalion first.');
    if (e.shared) return result(false, 'Supplies have already been shared.');
    if (e.supplies < 8 || e.medicine < 3) return result(false, 'Not enough expedition supplies.');
    e.supplies -= 8; e.medicine -= 3; e.shared = true;
    cure(e.world,3,battalion(e).map(u=>u.id));
    for (const u of battalion(e)) u.hp = Math.min(u.maxHp, u.hp + 25);
    return result(true, 'Food and medicine shared. The battalion will follow your lead after the ambush.');
  }
  if (type === 'expedition-retreat') {
    e.stage = 'retreat'; e.warning = 0; e.pending = []; command(e.world, { type: 'rally', ...ROUTE.exit });
    return result(true, 'Fall back to the entry banners. Extraction requires every surviving patrol soldier nearby.');
  }
  if (type === 'expedition-extract') {
    const party = expeditionParty(e);
    if (!party.length) return result(false, 'No patrol soldiers remain.');
    if (!party.every(u => distance(u, ROUTE.exit) < 3.5)) return result(false, 'Gather every surviving patrol soldier at the entry banners.');
    if (enemies(e.world).some(u => distance(u, ROUTE.exit) < 4)) return result(false, 'Clear the infected from the extraction ground.');
    if (trusted(e) && !battalion(e).every(u => distance(u, ROUTE.exit) < 3.5)) return result(false, 'Wait for the allied survivors to reach the banners.');
    finish(s, trusted(e) ? 'success' : 'retreated');
    return result(true, s.lostBattalions!.report!.recruited ? 'The patrol returned. Surviving recruits are now part of the permanent army.' : 'The surviving patrol returned. No new soldiers enlisted.');
  }
  return result(false, 'Unknown expedition action.');
}
export function expeditionStep(s: State, dt: number): void {
  const e = s.expedition!, w = e.world, route = missionRoute(e); w.time += dt; w.speed = s.speed;
  if (!e.discovered && e.stage !== 'retreat' && near(e, ROUTE.camp)) {
    e.discovered = true; e.stage = 'hold'; e.wave = 1; e.warning = 5;
    for (let i = 0; i < e.initialAllies.length; i++) {
      const kind = e.initialAllies[i], p = nearestOpen(w, { x: 13 + i % 2, y: 10 + Math.floor(i / 2) });
      const u = makeUnit(w, kind, p.x, p.y); u.hp = Math.min(UNITS[kind].hp, s.lostBattalions?.wounds?.[kind] ?? u.hp * .8); u.origin = 'battalion';
      const age = s.lostBattalions?.sickness?.[kind]; if (age !== undefined) infect(w,u,'bite',age);
    }
    log(w, 'The Grey Pennants are alive. Infected approach from two fronts in 5 seconds!', 'warn');
  }
  if (e.warning > 0) { e.warning = Math.max(0, e.warning - dt); if (e.warning === 0) spawnAmbush(e); }
  if (e.pending?.length) advanceAmbush(e, dt);
  if (e.stage === 'hold' && !e.warning && !e.pending?.length && !enemies(w).length && !w.corpses?.some(c=>c.tainted) && near(e, ROUTE.camp)) {
    e.held = true; e.stage = 'standard'; log(w, `You held the outpost together. Recover their standard ${e.approach === 'ford' ? 'at the river crossing' : 'on the ridge'}.`, 'good');
  }
  if (e.stage === 'standard' && e.shared && near(e, route.standard, 2.7) && e.wave === 1) {
    e.wave = 2; e.warning = 6; log(w, 'The standard draws another ambush. Clear the attackers and hold the ground together for 12 seconds.', 'warn');
  }
  if (e.wave === 2 && !e.warning && near(e, route.standard, 3.5) && battalion(e).some(u => distance(u, route.standard) < 5) && !enemies(w).some(u => distance(u, route.standard) < 2.5)) e.holdTime = Math.min(12, e.holdTime + dt);
  if (e.stage === 'standard' && e.wave === 2 && !e.pending?.length && e.holdTime >= 12 && !enemies(w).length && !w.corpses?.some(c=>c.tainted)) {
    e.standard = true; e.stage = 'return'; log(w, 'Their standard stands again. The Grey Pennants pledge their surviving soldiers. Escort them home.', 'good');
  }
  // Allied front line follows the patrol; archers/scouts stay behind it. Before
  // relief they defend their actual camp. No teleporting and no scripted damage.
  const party = expeditionParty(e), lead = party.find(u => u.kind === 'warden' || u.kind === 'spearman') ?? party[0];
  const allySlots = new Set(party.map(u => key(u.target)));
  if (lead && e.shared && e.held) for (let i = 0; i < battalion(e).length; i++) {
    const u = battalion(e)[i], retreat = e.stage === 'retreat' || e.stage === 'return';
    const ranged = u.kind === 'ranger' || u.kind === 'scout';
    const anchor = retreat ? ROUTE.exit : lead.target;
    u.target = nearestOpen(w, { x: anchor.x + (i % 2 ? 1 : -1), y: anchor.y + (ranged ? 1 : 0) }, allySlots); allySlots.add(key(u.target));
    if (!retreat && distance(u, u.target) > (ranged ? 3 : 4)) u.order = 'move';
    if (retreat && trusted(e)) u.order = 'move';
  }
  plagueStep(w,dt); combatStep(w, dt,true,undefined,s);
  w.effects = w.effects.filter(effect => (effect.ttl -= dt) > 0);
  if (e.discovered && !battalion(e).length && e.stage !== 'retreat') {
    e.stage = 'retreat'; e.warning = 0; e.pending = []; command(w, { type: 'rally', ...ROUTE.exit }); log(w, 'The Grey Pennants have fallen. Bring the surviving patrol home.', 'danger');
  }
  if (!army(w).some(u => u.origin === 'party')) finish(s, 'defeat');
}
