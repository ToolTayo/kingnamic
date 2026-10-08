import { TERRITORIES } from './config';
import { army, hostiles } from './state';
import { available, armyCapacity } from './army';
import { capacity, idle, rates } from './economy';
import { distance } from './map';
import type { Building, State, Unit } from './types';

export interface KingdomSettlementView {
  id: number;
  name: string;
  regionName: string;
  active: boolean;
  x: number;
  y: number;
  nearbyResidents: number;
  stationed: number;
  fitStationed: number;
  committed: number;
  fitCommitted: number;
  inbound: number;
  buildings: Building[];
  repairs: Building[];
  construction: Building[];
  threats: number;
}

export interface KingdomAlert {
  tone: 'danger' | 'warn' | 'good';
  message: string;
  action?: 'people' | 'settlement' | 'repairs' | 'army';
  settlementId?: number;
}

export interface KingdomOverview {
  settlements: KingdomSettlementView[];
  territories: string[];
  population: number;
  housing: number;
  availableWorkers: number;
  fitSoldiers: number;
  soldiers: number;
  capacity: number;
  foodRate: number;
  alerts: KingdomAlert[];
}

const localArmy = (s: State) => army(s).filter(u => u.origin !== 'battalion');
type OverviewWorld = { state: State; active: boolean; troops: Unit[]; hostiles: Unit[] };

function settlementView(world: State, b: Building, active: boolean, troops: Unit[], hostilesHere: Unit[]): KingdomSettlementView {
  const close = troops.filter(u => distance(u, b) < 7);
  const assigned = (u: Unit) => u.order === 'defend' && distance(u.anchor ?? u.target, b) < 8;
  const threats = hostilesHere.filter(u => distance(u, b) < 12).length;
  const buildings = world.buildings.filter(v => v.id !== b.id && v.owner !== 'rival' && distance(v, b) < 7);
  const repairable = [...buildings, b];
  return {
    id: b.id,
    name: b.name ?? (world.region ? 'Frontier settlement' : 'Hearthmere'),
    regionName: world.region === 'march' ? 'Briar March' : 'Hearthmere',
    active,
    x: b.x,
    y: b.y,
    nearbyResidents: (world.residents ?? []).filter(r => distance(r, b) < 7).length,
    stationed: close.length,
    fitStationed: close.filter(u => available(world, u)).length,
    committed: close.filter(assigned).length,
    fitCommitted: close.filter(u => assigned(u) && available(world, u)).length,
    inbound: troops.filter(u => !close.includes(u) && assigned(u)).length,
    buildings,
    repairs: repairable.filter(v => v.progress >= 1 && v.hp < v.maxHp && v.owner !== 'rival'),
    construction: buildings.filter(v => v.progress < 1 && v.owner !== 'rival'),
    threats,
  };
}

export function kingdomOverview(s: State): KingdomOverview {
  const reserve = s.empire?.reserve;
  const regions: { state: State; active: boolean }[] = reserve ? [{ state: s, active: true }, { state: reserve, active: false }] : [{ state: s, active: true }];
  const worlds: OverviewWorld[] = regions.map(w => ({ ...w, troops: localArmy(w.state), hostiles: hostiles(w.state) }));
  const settlements = worlds.flatMap(w => w.state.buildings
    .filter(b => b.kind === 'hearth' && b.owner !== 'rival')
    .map(b => settlementView(w.state, b, w.active, w.troops, w.hostiles)));
  const uniqueTerritories = new Set([...s.owned, ...(reserve?.owned ?? [])]);
  const territories = [...uniqueTerritories].map(id => TERRITORIES[id].name);
  if (s.march?.secured || reserve?.march?.secured) territories.push('Briar March');
  const soldiers = worlds.reduce((n, w) => n + w.troops.length, 0);
  const fitSoldiers = worlds.reduce((n, w) => n + w.troops.filter(u => available(w.state, u)).length, 0);
  const foodRate = rates(s).food;
  const alerts: KingdomAlert[] = [];

  for (const { state, active } of worlds) {
    if (active && (state.march?.warning ?? 0) > 0) alerts.push({ tone: 'danger', message: 'Eastern incursion expected in ' + Math.ceil(state.march!.warning) + 's.', action: 'army' });
    if (active && state.phase === 'night' && state.waveRemaining > 0) alerts.push({ tone: 'danger', message: state.waveRemaining + ' attackers are approaching your settlements.', action: 'army' });
    for (const site of settlements.filter(v => v.active === active)) {
      if (site.threats) {
        alerts.push({ tone: 'danger', message: site.threats + ' threat' + (site.threats === 1 ? '' : 's') + ' near ' + site.name + '.', action: 'settlement', settlementId: site.id });
        if (site.fitCommitted < 2) alerts.push({ tone: 'warn', message: site.name + ' has only ' + site.fitCommitted + ' fit assigned defender' + (site.fitCommitted === 1 ? '' : 's') + '.', action: 'settlement', settlementId: site.id });
      }
      if (site.repairs.length) alerts.push({ tone: 'warn', message: site.repairs.length + ' damaged structure' + (site.repairs.length === 1 ? '' : 's') + ' at ' + site.name + '.', action: 'repairs', settlementId: site.id });
    }
    if (active) for (const garrison of [state.march?.rival, state.march?.weirward]) {
      if (garrison?.status === 'occupied' && garrison.remaining > 0) alerts.push({ tone: 'warn', message: garrison.name + ' is still contested · ' + garrison.remaining + ' defenders remain.', action: 'army' });
    }
    const completed = state.logs.find(l => l.tone === 'good' && l.text.endsWith('is ready.') && state.time - l.time < 30);
    if (completed) alerts.push({ tone: 'good', message: completed.text, action: 'settlement' });
  }

  if (foodRate < 0 && s.resources.food < Math.max(45, -foodRate * 60)) {
    const seconds = Math.max(0, Math.floor(s.resources.food / -foodRate));
    alerts.push({ tone: 'danger', message: 'Provisions are falling · about ' + seconds + 's remain at the current rate.', action: 'people' });
  }
  const priority = { danger: 0, warn: 1, good: 2 };
  alerts.sort((a, b) => priority[a.tone] - priority[b.tone]);
  return {
    settlements,
    territories,
    population: s.population + (reserve?.population ?? 0),
    housing: capacity(s) + (reserve ? capacity(reserve) : 0),
    availableWorkers: idle(s) + (reserve ? idle(reserve) : 0),
    fitSoldiers,
    soldiers,
    capacity: armyCapacity(s),
    foodRate,
    alerts: alerts.slice(0, 5),
  };
}
