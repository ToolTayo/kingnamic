import { BUILDINGS, MAP_H, MAP_W, MAX_BUILDINGS, MAX_UNITS, MAX_RESIDENTS, MAX_ARMY, TERRITORIES, UNITS } from './config';
import { isFriendly, newGame } from './state';
import { ensureResidents, civilianCases, assignResidentJobs } from './population';
import type { State } from './types';
export const SAVE_KEY = 'kingnamic.save.v2', BACKUP_KEY = 'kingnamic.backup.v2';
export interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const integer = (n: unknown, min: number, max: number): n is number => finite(n, min, max) && Number.isInteger(n);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const point = (v: unknown): boolean => object(v) && finite(v.x, 0, MAP_W - 1) && finite(v.y, 0, MAP_H - 1);
export function decode(raw: string, battlefield = false,parked=false): State | null {
  try {
    if (raw.length > 4_000_000) return null;
    let s = JSON.parse(raw);
    if (!object(s)) return null;
    if(s.region!==undefined&&s.region!=='march'||battlefield&&(s.region||s.empire||s.commander)||parked&&(s.empire||s.expedition||s.commander)||s.region&&!s.empire&&!parked)return null;
    if(s.region){const m=s.march;if(!object(m)||!Array.isArray(m.seen)||m.seen.length>3||new Set(m.seen).size!==m.seen.length||m.seen.some((id:any)=>!['village','grove','ruins'].includes(id))||typeof m.secured!=='boolean'||typeof m.rewarded!=='boolean'||!finite(m.incursion,0,1e9)||!finite(m.warning,0,8))return null;}else if(s.march!==undefined)return null;
    if(s.commander!==undefined&&(!object(s.commander)||!integer(s.commander.id,1,1e9)||!['sword','spear','bow'].includes(s.commander.weapon)||!integer(s.commander.xp,0,100)))return null;
    if (battlefield ? s.theatre !== 'expedition' || s.expedition !== undefined || s.lostBattalions !== undefined : s.theatre !== undefined) return null;
    // v1 was the pre-release shape; missing new fields receive explicit defaults.
    if (s.version === 1) s = { ...newGame(), ...s, residents: s.residents, version: 2, formation: s.formation ?? 'line', quarantine: s.quarantine ?? false, effects: [], lastSpeed: s.lastSpeed ?? 1 };
    if (s.version !== 2 || !integer(s.seed, 0, 0xffffffff) || !integer(s.rng, 0, 0xffffffff)) return null;
    if (!finite(s.time, 0, 1e9) || !integer(s.day, 1, 100000) || !finite(s.phaseTime, 0, 72.2) || !['day', 'night'].includes(s.phase)) return null;
    if (![0, 1, 2].includes(s.speed) || ![1, 2].includes(s.lastSpeed) || !['line', 'loose'].includes(s.formation) || typeof s.quarantine !== 'boolean' || typeof s.tutorialSeen !== 'boolean') return null;
    if (!object(s.resources) || !['wood', 'stone', 'food', 'herbs'].every(k => finite(s.resources[k], 0, k==='stone'?1e9:10100))) return null;
    if(s.economyRevision!==undefined&&s.economyRevision!==1||s.bountyPaid!==undefined&&!finite(s.bountyPaid,0,40))return null;
    if(s.bountyTotal!==undefined&&!finite(s.bountyTotal,0,1e9))return null;
    if (!integer(s.population, 0, 1000) || !object(s.jobs) || !['farmers', 'woodcutters', 'miners', 'healers', 'builders'].every(k => integer(s.jobs[k], 0, 1000))) return null;
    if (!Array.isArray(s.buildings) || s.buildings.length > MAX_BUILDINGS || !s.buildings.every((b: any) => point(b) && integer(b.x, 0, MAP_W - 1) && integer(b.y, 0, MAP_H - 1) && Object.hasOwn(BUILDINGS, b.kind) && integer(b.id, 1, 1e9) && finite(b.hp, 0.001, 100000) && finite(b.maxHp, b.hp, 100000) && integer(b.level, 1, 3) && finite(b.progress, 0, 1) && finite(b.cooldown, 0, 10) && (b.rotation===undefined||[0,1].includes(b.rotation)&&['wall','gate'].includes(b.kind)))) return null;
    if (!Array.isArray(s.units) || s.units.length > MAX_UNITS || !s.units.every((u: any) => point(u) && Object.hasOwn(UNITS, u.kind) && integer(u.id, 1, 1e9) && finite(u.hp, 0.001, 100000) && finite(u.maxHp, u.hp, 100000) && finite(u.cooldown, 0, 10) && finite(u.repath, -1e9, 10) && finite(u.attackFlash, 0, 1) && point(u.target) && Array.isArray(u.path) && u.path.length <= MAP_W * MAP_H && u.path.every(point))) return null;
    if (!s.units.every((u: any) => u.order === undefined || ['move','attack','hunt','defend','patrol','hold','retreat','regroup','escort'].includes(u.order))) return null;
    if(!s.units.every((u:any)=>u.muster===undefined||isFriendly(u)&&typeof u.muster==='boolean'))return null;
    if(!s.units.every((u:any)=>u.commanderCredit===undefined||!isFriendly(u)&&typeof u.commanderCredit==='boolean'))return null;
    if(!s.units.every((u:any)=>u.bountyEligible===undefined||!isFriendly(u)&&typeof u.bountyEligible==='boolean'))return null;
    if(!s.units.every((u:any)=>(u.bountySettled===undefined||typeof u.bountySettled==='boolean'&&!isFriendly(u))&&(u.bountyKey===undefined||typeof u.bountyKey==='string'&&/^(scout-[01]|wave-[12]-\d{1,2}|legacy-\d{1,9})$/.test(u.bountyKey))))return null;
    const wellness = (p: any) => (p.exposure === undefined || finite(p.exposure,0,100)) && (p.immune === undefined || finite(p.immune,0,35));
    if (!s.units.every((u:any)=>wellness(u) && (u.anchor===undefined||point(u.anchor)) && (u.formation===undefined||['line','loose'].includes(u.formation)) && (u.focus===undefined||integer(u.focus,1,1e9)) && (u.homeId===undefined||battlefield&&u.origin==='party'&&u.homeId===u.id) && (u.patrol===undefined||object(u.patrol)&&point(u.patrol.a)&&point(u.patrol.b)&&[0,1].includes(u.patrol.leg)) && (u.reanimatedFrom===undefined||!isFriendly(u)&&integer(u.reanimatedFrom,1,s.nextId-1)))) return null;
    if (s.units.filter(isFriendly).length > MAX_ARMY) return null;
    if (!s.units.every((u: any) => (u.injury === undefined || isFriendly(u) && finite(u.injury, 0, 80)) && (battlefield ? isFriendly(u) ? ['party', 'battalion'].includes(u.origin) : u.origin === undefined : u.origin === undefined))) return null;
    if (!Array.isArray(s.owned) || s.owned.length < 1 || s.owned.length > 4 || !s.owned.includes('hearthmere') || !s.owned.every((t: string) => Object.hasOwn(TERRITORIES, t)) || new Set(s.owned).size !== s.owned.length) return null;
    if (!Array.isArray(s.infection) || s.infection.length > s.population + s.units.filter(isFriendly).length || !s.infection.every((i: any) => object(i) && integer(i.id, 1, 1e9) && finite(i.age, 0, 75.2) && (i.source===undefined||['arrival','ground','supplies','contact','bite'].includes(i.source)))) return null;
    const modern = s.residents !== undefined;
    if (modern && (!Array.isArray(s.residents) || s.residents.length > MAX_RESIDENTS || s.residents.length !== s.population || !s.residents.every((r:any)=>point(r)&&integer(r.id,1,1e9)&&finite(r.hp,.001,100000)&&finite(r.maxHp,r.hp,100000)&&wellness(r)&&['idle','farmers','woodcutters','miners','healers','builders'].includes(r.job)&&typeof r.sick==='boolean'&&['work','home','rest','shelter','recover','flee'].includes(r.activity)&&point(r.goal)&&Array.isArray(r.path)&&r.path.length<=MAP_W*MAP_H+2&&r.path.every(point)&&finite(r.wait,0,20)&&finite(r.retry,0,5)&&integer(r.trip,0,1e9)&&typeof r.carrying==='boolean'))) return null;
    if (s.corpses!==undefined&&(!Array.isArray(s.corpses)||s.corpses.length>MAX_RESIDENTS+MAX_UNITS||!s.corpses.every((c:any)=>point(c)&&integer(c.id,1,1e9)&&integer(c.personId,1,s.nextId-1)&&['resident','warden','ranger','spearman','scout'].includes(c.kind)&&finite(c.remaining,0,12)&&typeof c.tainted==='boolean'))) return null;
    if (s.squads!==undefined&&(!Array.isArray(s.squads)||s.squads.length>20||!s.squads.every((q:any)=>object(q)&&integer(q.id,1,1e9)&&typeof q.name==='string'&&q.name.trim().length>0&&q.name.length<=24&&integer(q.color,0,5)))) return null;
    if (!s.units.every((u:any)=>u.squadId===undefined||isFriendly(u)&&s.squads?.some((q:any)=>q.id===u.squadId))) return null;
    if (s.suppliesTaint!==undefined&&!finite(s.suppliesTaint,0,100)||s.musterClock!==undefined&&!finite(s.musterClock,0,20)||s.endless!==undefined&&typeof s.endless!=='boolean') return null;
    if (!Array.isArray(s.contamination) || s.contamination.length !== MAP_W * MAP_H || !s.contamination.every((n: unknown) => finite(n, 0, 100))) return null;
    if (!['plagueClock', 'economyClock', 'waveClock'].every(k => finite(s[k], -1e9, 100)) || !integer(s.waveRemaining, 0, 1000000) || !integer(s.waveNumber, 0, 100000) || !integer(s.nextId, 1, 1e9)) return null;
    if (!object(s.stats) || !['slain', 'lost', 'built', 'nights', 'cured', 'claimed'].every(k => integer(s.stats[k], 0, 1e8))) return null;
    if (!Array.isArray(s.completed) || s.completed.length > 5 || !s.completed.every((id: string) => ['build', 'recruit', 'night', 'claim', 'survive'].includes(id))) return null;
    if (!['playing', 'won', 'lost'].includes(s.outcome) || !Array.isArray(s.logs) || s.logs.length > 35 || !s.logs.every((l: any) => object(l) && integer(l.id, 1, 1e9) && finite(l.time, 0, 1e9) && typeof l.text === 'string' && l.text.length < 500 && ['info', 'good', 'warn', 'danger'].includes(l.tone))) return null;
    const ids = [...s.buildings, ...s.units, ...s.infection, ...s.logs, ...(s.residents??[]), ...(s.corpses??[]), ...(s.squads??[])].map(v => v.id);
    if (new Set(ids).size !== ids.length || ids.some(id => id >= s.nextId)) return null;
    if (new Set(s.buildings.map((b: any) => b.y * MAP_W + b.x)).size !== s.buildings.length) return null;
    const departed=[...(s.corpses??[]).map((c:any)=>c.personId),...s.units.filter((u:any)=>u.reanimatedFrom!==undefined).map((u:any)=>u.reanimatedFrom)];
    if (new Set(departed).size!==departed.length||departed.some(id=>ids.includes(id))) return null;
    // Legacy saves contain aggregate cases. Link them once, after validating
    // the legacy census; modern saves must retain exact host identities.
    if (!modern) { if(s.infection.length>s.population)return null;ensureResidents(s as State);assignResidentJobs(s as State); }
    const hosts=new Map([...s.residents,...s.units.filter(isFriendly)].map((p:any)=>[p.id,p]));
    if(new Set(s.infection.map((i:any)=>i.personId)).size!==s.infection.length||!s.infection.every((i:any)=>{const p:any=hosts.get(i.personId);return p&&i.host===('kind'in p?'soldier':'resident');}))return null;
    if (Object.values(s.jobs).reduce((a: number, b: any) => a + b, 0) > s.population - civilianCases(s as State).length) return null;
    if (!battlefield && !s.region && s.outcome !== 'lost' && s.buildings.filter((b: any) => b.kind === 'hearth').length !== 1) return null;
    const kinds = ['warden', 'ranger', 'spearman', 'scout'];
    const roster = (v: any) => Array.isArray(v) && v.length <= 4 && new Set(v).size === v.length && v.every((k: unknown) => kinds.includes(k as string));
    if (s.lostBattalions !== undefined) {
      const r = s.lostBattalions;
      if (!object(r) || !integer(r.attempts, 1, 10000) || !roster(r.remaining) || !integer(r.recruited, 0, 4) || r.recruited + r.remaining.length > 4 || !finite(r.cooldown, 0, 45)) return null;
      if(r.bounties!==undefined&&(!Array.isArray(r.bounties)||r.bounties.length>256||new Set(r.bounties).size!==r.bounties.length||r.bounties.some((k:any)=>typeof k!=='string'||!/^(scout-[01]|wave-[12]-\d{1,2}|legacy-\d{1,9})$/.test(k))))return null;
      if (r.report !== undefined && (!object(r.report) || !['success', 'retreated', 'defeat'].includes(r.report.outcome) || !integer(r.report.returned, 0, 3) || !integer(r.report.recruited, 0, 4) || !integer(r.report.lost, 0, 7) || !integer(r.report.stranded, 0, 4))) return null;
      if (r.wounds !== undefined && (!object(r.wounds) || Object.entries(r.wounds).some(([kind, hp]) => !r.remaining.includes(kind) || !finite(hp, .001, UNITS[kind as keyof typeof UNITS]?.hp ?? 0)))) return null;
      if (r.sickness !== undefined && (!object(r.sickness)||Object.entries(r.sickness).some(([kind,age])=>!r.remaining.includes(kind)||!finite(age,0,75.2)))) return null;
    }
    if (s.expedition !== undefined) {
      const e = s.expedition;
      if (!object(e) || !s.lostBattalions || !['search', 'hold', 'standard', 'return', 'retreat'].includes(e.stage) || !['discovered', 'shared', 'held', 'standard'].every(k => typeof e[k] === 'boolean') || ![0, 1, 2].includes(e.wave) || !finite(e.warning, 0, 6) || !finite(e.holdTime, 0, 12) || e.deployed !== 3 || !roster(e.initialAllies) || JSON.stringify(e.initialAllies) !== JSON.stringify(s.lostBattalions.remaining) || e.supplies !== (e.shared ? 4 : 12) || !integer(e.medicine,0,e.shared ? 1 : 4)) return null;
      if (e.shared && !e.discovered || e.held && !e.discovered || e.standard && (!e.held || !e.shared || e.wave !== 2) || e.stage === 'return' && !e.standard) return null;
      if (e.approach !== undefined && !['ridge', 'ford'].includes(e.approach) || e.variant !== undefined && !integer(e.variant, 0, 2) || e.equipment !== undefined && e.equipment !== e.initialAllies.length) return null;
      if(e.equipmentCurrency!==undefined&&(e.equipmentCurrency!=='crowns'||e.equipment===undefined))return null;
      if (e.pending !== undefined && (!Array.isArray(e.pending) || e.pending.length > 12 || !e.pending.every((a: any) => object(a) && ['hollow', 'runner', 'brute'].includes(a.kind) && point(a.point) && finite(a.delay, 0, 8) && (a.bountyKey===undefined||typeof a.bountyKey==='string'&&/^wave-[12]-\d{1,2}$/.test(a.bountyKey))))) return null;
      const world = decode(JSON.stringify(e.world), true); if (!world || world.outcome !== 'playing' || world.population !== 0 || world.units.filter(u => u.origin === 'party').length > 3) return null;
      const allies = world.units.filter(u => u.origin === 'battalion');
      if (!e.discovered && allies.length || new Set(allies.map(u => u.kind)).size !== allies.length || allies.some(u => !e.initialAllies.includes(u.kind))) return null;
      if (s.units.filter(isFriendly).length + 3 + e.initialAllies.length > MAX_ARMY) return null;
      if(world.units.some(u=>u.homeId&&s.units.some((home:any)=>home.id===u.homeId)))return null;
      e.world = world;
    }
    if(s.commander&&s.commander.id>=s.nextId)return null;
    if(s.region&&s.march.secured&&s.buildings.filter((b:any)=>b.kind==='hearth').length!==1)return null;
    if(s.empire!==undefined){
      if(!object(s.empire)||!finite(s.empire.elapsed,0,1e9)||!object(s.empire.reserve)||s.empire.reserve.region===s.region)return null;
      const other=decode(JSON.stringify(s.empire.reserve),false,true);if(!other)return null;
      if(other.nextId>s.nextId||s.units.filter(isFriendly).length+other.units.filter(isFriendly).length+(s.expedition?3+s.expedition.initialAllies.length:0)>MAX_ARMY)return null;
      if(JSON.stringify(other.resources)!==JSON.stringify(s.resources)||JSON.stringify(other.squads??[])!==JSON.stringify(s.squads??[]))return null;
      const localIds=(w:State)=>[...w.buildings,...w.units,...(w.residents??[]),...w.infection,...(w.corpses??[]),...w.logs].map(v=>v.id);
      const active=new Set(localIds(s)),inactive=localIds(other),away=s.expedition?.world as State|undefined;
      const occupied=new Set([...active,...inactive]);if(inactive.some(id=>active.has(id))||away&&localIds(away).some(id=>occupied.has(id)))return null;
      const living=new Set([...s.units,...s.residents,...other.units,...(other.residents??[]),...(away?.units??[])].map(v=>v.id));
      const dead=[...departed,...(other.corpses??[]).map(c=>c.personId),...other.units.filter(u=>u.reanimatedFrom!==undefined).map(u=>u.reanimatedFrom!),...(away?.corpses??[]).map(c=>c.personId),...(away?.units??[]).filter(u=>u.reanimatedFrom!==undefined).map(u=>u.reanimatedFrom!)];
      if(new Set(dead).size!==dead.length||dead.some(id=>living.has(id)))return null;
      other.resources=s.resources;other.squads=s.squads;s.empire.reserve=other;
    }
    s.economyRevision=1;s.effects = []; return s as State;
  } catch { return null; }
}
export function load(storage: StoragePort): { state: State | null; message: string } {
  try {
    const raw = storage.getItem(SAVE_KEY), old = storage.getItem('kingnamic.save.v1');
    if (raw || old) { const source=(raw??old)!,state = decode(source); if (state) return { state, message: JSON.parse(source).economyRevision===1?'Your kingdom is ready to resume.':'Your stone is now Crowns, exchanged one-for-one. Stoneworks are Trading posts; workers and progress are preserved.' }; }
    const backup = storage.getItem(BACKUP_KEY); if (backup) { const state = decode(backup); if (state) return { state, message: 'The latest save was unreadable. Recovered your backup.' }; }
    return { state: null, message: raw || old ? 'The saved kingdom could not be read. A fresh kingdom is ready; the unreadable save is preserved until you save.' : '' };
  } catch { return { state: null, message: 'Browser storage is unavailable. You can play, but progress cannot be saved.' }; }
}
export function save(storage: StoragePort, state: State): { ok: boolean; message: string } {
  try {
    const raw = JSON.stringify(state, (key, value) => key === 'effects' ? [] : value);
    if (!decode(raw)) return { ok: false, message: 'Save validation failed. The previous save was preserved.' };
    const previous = storage.getItem(SAVE_KEY);
    if (previous && decode(previous)) storage.setItem(BACKUP_KEY, previous);
    storage.setItem(SAVE_KEY, raw);
    return { ok: true, message: 'Kingdom saved on this device.' };
  } catch { return { ok: false, message: 'Saving failed. Browser storage may be blocked or full. Keep this tab open.' }; }
}
