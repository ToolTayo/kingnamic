import {empireStep} from './empire';
import { DAY_LENGTH, NIGHT_LENGTH, STEP } from './config';
import { combatStep, spawnWave } from './combat';
import { capacity, economyStep, rebalanceJobs, recoverSoldiers } from './economy';
import { army, enemies, log } from './state';
import type { CommanderInput, State } from './types';
import { expeditionStep } from './expedition';
import { plagueStep } from './disease';
import { addResidents, ensureResidents } from './population';
import { CivilianSystem } from './civilians';
import { credit } from './treasury';
const civilians = new WeakMap<State, CivilianSystem>();
function dawn(s: State): void {
  s.stats.nights++; s.day++; s.phase = 'day'; s.phaseTime = 0;
  if(!s.empire)s.bountyPaid=0;
  // Sunlight weakens remaining infected; dawn is not an instant enemy deletion.
  for (const u of enemies(s)) u.hp *= 0.65;
  const arrivals = s.resources.food >= 25 ? Math.min(2, Math.max(0, capacity(s) - s.population)) : 0;
  addResidents(s, arrivals);
  log(s, `Dawn breaks. ${arrivals ? `${arrivals} survivors found the beacon.` : 'The kingdom has endured another night.'}`, 'good');
}
function objectives(s: State): void {
  const done = (id: string, condition: boolean) => { if (condition && !s.completed.includes(id)) { s.completed.push(id); credit(s,'wood',20);credit(s,'stone',15);log(s, 'Milestone reached. +20 timber, +15 crowns.', 'good'); } };
  done('build', s.stats.built > 0); done('recruit', army(s).length >= 5); done('night', s.stats.nights > 0); done('claim', s.owned.length === 4);
  if (!s.endless && s.stats.nights >= 5 && s.owned.length === 4 && enemies(s).length === 0 && !(s.corpses ?? []).some(c=>c.tainted) && s.waveRemaining === 0 && s.outcome === 'playing') {
    done('survive', true); s.outcome = 'won'; s.speed = 0; log(s, 'Five nights. Four banners. The Last Hearth has become a kingdom.', 'good');
  }
}
// Call with a fixed STEP. Wall-clock scaling belongs to the runtime, never saves.
export function step(s: State, dt = STEP,input?:CommanderInput): void {
  if (s.expedition) { expeditionStep(s, dt); return; }
  if (s.outcome === 'won' && s.lostBattalions) { recoverSoldiers(s, dt); s.lostBattalions.cooldown = Math.max(0, s.lostBattalions.cooldown - dt); return; }
  if (s.outcome !== 'playing') return;
  ensureResidents(s);
  if (s.lostBattalions) s.lostBattalions.cooldown = Math.max(0, s.lostBattalions.cooldown - dt);
  s.time += dt; s.phaseTime += dt;
  s.musterClock=Math.max(0,(s.musterClock??0)-dt);
  economyStep(s, dt); plagueStep(s, dt); combatStep(s, dt, false,input); rebalanceJobs(s);
  let people=civilians.get(s);if(!people){people=new CivilianSystem();civilians.set(s,people);}people.update(s,dt);
  for (const e of s.effects) e.ttl -= dt;
  s.effects = s.effects.filter(e => e.ttl > 0);
  empireStep(s,dt);
  if(s.region){if(s.phaseTime>=DAY_LENGTH){s.phaseTime=0;s.day++;if(!s.empire)s.bountyPaid=0;}return;}
  if (s.phase === 'day' && s.phaseTime >= DAY_LENGTH) { s.phase = 'night'; s.phaseTime = 0; spawnWave(s); }
  else if (s.phase === 'night' && s.phaseTime >= NIGHT_LENGTH) dawn(s);
  objectives(s);
}
export function advance(s: State, seconds: number): void { for (let i = 0; i < Math.round(seconds / STEP); i++) step(s); }
