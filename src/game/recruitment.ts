import { MAX_UNITS, UNITS } from './config';
import { armyCapacity } from './army';
import { empireArmy } from './empire';
import { rates } from './economy';
import { illnessFor } from './disease';
import type { Job, Resident, SoldierKind, State } from './types';

const JOBS: Job[] = ['farmers', 'woodcutters', 'miners', 'healers', 'builders'];
const healthyFit = (s: State): Resident[] => (s.residents ?? []).filter(r =>
  r.hp >= r.maxHp * 0.7 && !illnessFor(s, r.id),
);

function protectedWorkers(s: State): Record<Job, number> {
  const jobs = s.jobs;
  // Keep enough of the existing farm crew to avoid making the kingdom's food
  // balance worse. Recruiting replaces a resident with a soldier, so upkeep
  // itself stays level across that conversion.
  const foodYield = 0.55 * (s.quarantine ? 0.8 : 1);
  const foodRate = rates(s).food;
  const removableFarmers = foodRate >= 0 ? Math.floor((foodRate + 1e-9) / foodYield) : 0;
  const foodFloor = Math.max(0, jobs.farmers - removableFarmers);
  return {
    farmers: Math.min(jobs.farmers, foodFloor),
    miners: jobs.miners ? 1 : 0,
    woodcutters: jobs.woodcutters ? 1 : 0,
    healers: jobs.healers && s.infection.some(i => i.host !== 'soldier') ? 1 : 0,
    builders: jobs.builders && s.buildings.some(b => b.progress < 1 && b.hp > 0) ? 1 : 0,
  };
}

interface RecruitmentPool {
  byJob: Record<Job | 'idle', Resident[]>;
  idle: number;
  floors: Record<Job, number>;
  availableWorkers: number;
}

function recruitmentPool(s: State): RecruitmentPool {
  const byJob = Object.fromEntries(['idle', ...JOBS].map(job => [job, []])) as unknown as Record<Job | 'idle', Resident[]>;
  for (const person of healthyFit(s)) byJob[person.job].push(person);
  const floors = protectedWorkers(s);
  const availableWorkers = JOBS.reduce((total, job) => {
    const assigned = Math.min(s.jobs[job], byJob[job].length);
    return total + Math.max(0, assigned - floors[job]);
  }, 0);
  return { byJob, idle: byJob.idle.length, floors, availableWorkers };
}

export function recruitableResidents(s: State): number {
  const pool = recruitmentPool(s);
  return pool.idle + pool.availableWorkers;
}

export function selectRecruitResidents(s: State, count: number): Resident[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const pool = recruitmentPool(s);
  const selected = pool.byJob.idle.slice(0, Math.min(count, pool.idle));
  const priority: Job[] = ['builders', 'woodcutters', 'healers', 'farmers', 'miners'];
  for (const job of priority) {
    if (selected.length >= count) break;
    const workers = pool.byJob[job];
    const protectedCount = Math.min(s.jobs[job], workers.length, pool.floors[job]);
    selected.push(...workers.slice(0, Math.max(0, workers.length - protectedCount)).slice(0, count - selected.length));
  }
  return selected;
}

export interface RecruitmentPlan {
  max: number;
  reason: string;
  affordable: number;
  residents: number;
  capacity: number;
}

export function recruitmentPlan(s: State, kind: SoldierKind): RecruitmentPlan {
  const barracks = s.buildings.some(b => b.kind === 'barracks' && b.owner !== 'rival' && b.progress >= 1 && b.hp > 0);
  const unlocked = kind !== 'spearman' && kind !== 'scout' || Boolean(s.lostBattalions?.recruited) ||
    s.buildings.some(b => b.kind === 'barracks' && b.owner !== 'rival' && b.progress === 1 && b.level >= 2 && b.hp > 0);
  const pool = recruitmentPool(s);
  const residents = pool.idle + pool.availableWorkers;
  const capacity = Math.max(0, Math.min(armyCapacity(s) - empireArmy(s), MAX_UNITS - s.units.length));
  const affordable = Math.floor(Math.min(...Object.entries(UNITS[kind].cost).map(([resource, unitCost]) =>
    unitCost ? s.resources[resource as keyof typeof s.resources] / unitCost : Infinity,
  )));
  let reason = '';
  if (!barracks) reason = 'Build a completed garrison to recruit.';
  else if (!unlocked) reason = 'Upgrade a garrison or enlist the Lost Battalion to train specialists.';
  else if (!capacity) reason = armyCapacity(s) <= empireArmy(s) ? 'Army capacity reached. Build or upgrade a garrison.' : 'Unit limit reached.';
  else if (!residents) reason = residents === 0 && healthyFit(s).length
    ? 'Fit residents are keeping essential settlement work staffed.'
    : 'No fit residents are available to enlist.';
  else if (!affordable) reason = 'Not enough Crowns to equip a soldier.';
  const max = barracks && unlocked ? Math.max(0, Math.min(capacity, residents, affordable)) : 0;
  if (!reason && max === 0) reason = 'No soldiers can be recruited right now.';
  return { max, reason, affordable, residents, capacity };
}

export function recruitmentBlocker(s: State, kind: SoldierKind, count: number, plan = recruitmentPlan(s, kind)): string {
  if (!Number.isInteger(count) || count < 1) return 'Choose at least one soldier.';
  if (!s.buildings.some(b => b.kind === 'barracks' && b.owner !== 'rival' && b.progress >= 1 && b.hp > 0)) return 'Build a completed garrison to recruit.';
  if ((kind === 'spearman' || kind === 'scout') && !s.lostBattalions?.recruited &&
      !s.buildings.some(b => b.kind === 'barracks' && b.owner !== 'rival' && b.progress === 1 && b.level >= 2 && b.hp > 0)) {
    return 'Upgrade a garrison or enlist the Lost Battalion to train specialists.';
  }
  if (count > plan.capacity) return plan.capacity
    ? `Army capacity allows only ${plan.capacity} more soldier${plan.capacity === 1 ? '' : 's'}.`
    : plan.reason;
  if (count > plan.residents) return `Only ${plan.residents} fit eligible residents can be enlisted safely.`;
  const cost = Object.entries(UNITS[kind].cost).map(([resource, unitCost]) => [resource, unitCost * count] as const);
  for (const [resource, amount] of cost) {
    const missing = Math.ceil(amount - s.resources[resource as keyof typeof s.resources]);
    if (missing > 0) return `Need ${missing} ${resource === 'stone' ? 'Crowns' : resource} more.`;
  }
  return '';
}

export function recruitmentCost(kind: SoldierKind, count: number): Partial<State['resources']> {
  return Object.fromEntries(Object.entries(UNITS[kind].cost).map(([resource, unitCost]) => [resource, unitCost * count]));
}
