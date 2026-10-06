import { describe, expect, it } from 'vitest';
import { command } from '../src/game/commands';
import { combatStep } from '../src/game/combat';
import { battalion, expeditionParty, launchError, missionRoute, ROUTE, trusted } from '../src/game/expedition';
import { decode } from '../src/game/persistence';
import { advance, step } from '../src/game/simulation';
import { army, enemies, makeUnit, newGame } from '../src/game/state';
import type { State } from '../src/game/types';

// Isolated mission fixture; the fresh-economy campaign earns its own Crowns.
function prepared() { const s = newGame(); s.resources.stone=200; command(s, { type: 'recruit', kind: 'warden' }); command(s, { type: 'recruit', kind: 'ranger' }); return s; }
function run(s: State, seconds: number, act = true) {
  for (let t = 0; t < seconds * 10 && s.expedition; t++) {
    if (act && t % 10 === 0) {
      const e = s.expedition;
      if (e.discovered && !e.shared) command(s, { type: 'expedition-share' });
      const p = e.stage === 'search' || e.stage === 'hold' ? ROUTE.camp : e.stage === 'standard' ? missionRoute(e).standard : ROUTE.exit;
      if (!expeditionParty(e).some(u => u.order)) command(s, { type: 'rally', ...p });
      if (e.stage === 'return' || e.stage === 'retreat') command(s, { type: 'expedition-extract' });
    }
    step(s);
  }
}
describe('Lost Battalions expedition', () => {
  it('deploys three real soldiers, reserves home guards and charges the pack once', () => {
    const s = prepared(), food = s.resources.food;
    expect(command(s, { type: 'expedition-launch' }).ok).toBe(true);
    expect(army(s)).toHaveLength(2); expect(expeditionParty(s.expedition!)).toHaveLength(3); expect(s.resources.food).toBe(food - 30);
    expect(command(s, { type: 'expedition-launch' }).ok).toBe(false);
    const clock = s.time; advance(s, 3); expect(s.time).toBe(clock);
    expect(command(s, { type: 'recruit', kind: 'warden' }).ok).toBe(false);
  });
  it('completes the entire mission with normal movement, real combat and permanent surviving recruits', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); run(s, 220);
    console.log('EXPEDITION', JSON.stringify({ active: s.expedition && { stage: s.expedition.stage, wave: s.expedition.wave, foes: enemies(s.expedition.world).length, hold: s.expedition.holdTime, party: expeditionParty(s.expedition).map(u => ({ x: u.x, y: u.y, target:u.target, hp:u.hp, order:u.order })), allies: battalion(s.expedition).map(u=>({kind:u.kind,x:u.x,y:u.y,hp:u.hp})) }, report: s.lostBattalions?.report }));
    expect(s.expedition).toBeUndefined(); expect(s.lostBattalions?.report?.outcome).toBe('success');
    expect(s.lostBattalions?.recruited).toBeGreaterThan(0); expect(army(s).length).toBeGreaterThan(5);
    expect(army(s).some(u => u.injury)).toBe(true);
    expect(decode(JSON.stringify(s))).not.toBeNull();
    const count = army(s).length; expect(command(s, { type: 'expedition-extract' }).ok).toBe(false); expect(army(s)).toHaveLength(count);
  });
  it('retreats before discovery without spawning recruits or refunding supplies', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); command(s, { type: 'expedition-retreat' });
    expect(command(s, { type: 'expedition-extract' }).ok).toBe(true);
    expect(army(s)).toHaveLength(5); expect(s.lostBattalions?.remaining).toHaveLength(4); expect(s.lostBattalions?.recruited).toBe(0);
    expect(launchError(s)).toContain('recover');
  });
  it('rejects extraction from the far ridge and shares each supply pack once', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); command(s, { type: 'rally', ...ROUTE.camp }); run(s, 7, false);
    expect(s.expedition?.discovered).toBe(true); expect(command(s, { type: 'expedition-share' }).ok).toBe(true);
    expect(command(s, { type: 'expedition-share' }).ok).toBe(false); expect(s.expedition?.supplies).toBe(4);
    expect(command(s, { type: 'expedition-extract' }).ok).toBe(false); expect(trusted(s.expedition!)).toBe(false);
  });
  it('preserves active battle, trust, losses and consumed supplies across a deterministic reload', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); run(s, 12);
    const resumed = decode(JSON.stringify(s)); expect(resumed).not.toBeNull();
    s.expedition!.world.effects = [];
    expect(resumed).toEqual(s); run(s, 180); run(resumed!, 180); expect(resumed).toEqual(s);
  });
  it('records total patrol defeat and prevents allies or dead soldiers from being awarded', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' });
    for (const u of expeditionParty(s.expedition!)) u.hp = 0;
    step(s); expect(s.expedition).toBeUndefined(); expect(army(s)).toHaveLength(2);
    expect(s.lostBattalions?.report).toMatchObject({ outcome: 'defeat', lost: 3, recruited: 0 });
  });
  it('excludes injured soldiers from deployment and combat until recovery', () => {
    const s = prepared(); const u = army(s)[0]; u.injury = 20; u.hp = 30;
    expect(launchError(s)).toContain('five fit');
    s.units = [u]; u.x = 4; u.y = 4;
    const foe = makeUnit(s, 'hollow', u.x + .5, u.y); const hp = foe.hp; step(s); expect(foe.hp).toBe(hp);
    s.units = s.units.filter(v => v !== foe); advance(s, 21); expect(u.injury).toBeUndefined(); expect(u.hp).toBe(u.maxHp);
  });
  it('validates nested battle bounds and rejects repeated or forged battalion rosters', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); expect(decode(JSON.stringify(s))).not.toBeNull();
    s.expedition!.initialAllies.push('scout'); expect(decode(JSON.stringify(s))).toBeNull();
    s.expedition!.initialAllies.pop(); s.expedition!.world.expedition = { ...s.expedition!, world: newGame() }; expect(decode(JSON.stringify(s))).toBeNull();
  });
  it('uses spear reach against runners and scouts shoot while moving away from pressure', () => {
    const s = newGame(); s.units = []; s.buildings = [];
    const spear = makeUnit(s, 'spearman', 10, 10), runner = makeUnit(s, 'runner', 11.7, 10);
    spear.origin = 'battalion'; combatStep(s, .1); expect(runner.hp).toBe(16); expect(spear.hp).toBe(spear.maxHp);
    s.units = []; s.effects = [];
    const scout = makeUnit(s, 'scout', 10, 10), foe = makeUnit(s, 'hollow', 11.5, 10);
    scout.origin = 'battalion'; combatStep(s, .1);
    expect(foe.hp).toBeLessThan(foe.maxHp); expect(s.effects.some(e => e.kind === 'arrow')).toBe(true); expect(scout.x).toBeLessThan(10);
  });
  it('never targets other soldiers as enemies, including new permanent specialists', () => {
    const s = newGame(); s.units = [];
    for (const kind of ['warden', 'ranger', 'spearman', 'scout'] as const) makeUnit(s, kind, 10, 10);
    advance(s, 5); expect(s.units.every(u => u.hp === u.maxHp)).toBe(true); expect(enemies(s)).toHaveLength(0);
    expect(command(s, { type: 'rally', x: 14, y: 16 }).ok).toBe(true); expect(s.units.every(u => u.order === 'move')).toBe(true);
  });
  it('keeps battalion casualties out of retries and preserves the survivors after a retreat', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); command(s, { type: 'rally', ...ROUTE.camp }); run(s, 6, false);
    const e = s.expedition!; const dead = battalion(e).find(u => u.kind === 'scout')!; dead.hp = 0; step(s);
    command(s, { type: 'expedition-retreat' }); run(s, 60);
    expect(s.expedition).toBeUndefined(); expect(s.lostBattalions?.remaining).not.toContain('scout');
    expect(s.lostBattalions?.report?.lost).toBeGreaterThanOrEqual(1);
    advance(s, 46); expect(command(s, { type: 'expedition-launch' }).ok).toBe(true);
    expect(s.expedition?.initialAllies).not.toContain('scout');
  });
  it('automatically withdraws when the entire stranded battalion dies', () => {
    const s = prepared(); command(s, { type: 'expedition-launch' }); command(s, { type: 'rally', ...ROUTE.camp }); run(s, 6, false);
    for (const u of battalion(s.expedition!)) u.hp = 0;
    step(s); expect(s.expedition?.stage).toBe('retreat'); run(s, 70);
    expect(s.expedition).toBeUndefined(); expect(s.lostBattalions?.remaining).toHaveLength(0);
  });
  it('permits post-victory expeditions and recovery without restarting kingdom waves', () => {
    const s = prepared(); s.outcome = 'won'; command(s, { type: 'expedition-launch' }); command(s, { type: 'expedition-retreat' }); command(s, { type: 'expedition-extract' });
    const time = s.time; advance(s, 46); expect(army(s).some(u => u.injury)).toBe(false); expect(s.time).toBe(time); expect(s.outcome).toBe('won');
    expect(command(s, { type: 'expedition-launch' }).ok).toBe(true);
  });
  it('allows an explicitly chosen specialist patrol and rejects duplicates without spending', () => {
    const s = prepared(), spear = makeUnit(s, 'spearman', 12, 16), scout = makeUnit(s, 'scout', 13, 16);
    const ids = [spear.id, scout.id, army(s)[0].id], food = s.resources.food;
    expect(command(s, { type: 'expedition-launch', ids: [spear.id, spear.id, scout.id] }).ok).toBe(false); expect(s.resources.food).toBe(food);
    expect(command(s, { type: 'expedition-launch', ids }).ok).toBe(true);
    expect(expeditionParty(s.expedition!).map(u => u.kind)).toEqual(['spearman', 'scout', 'warden']);
    expect(army(s).map(u => u.id)).not.toContain(spear.id);
  });
  it('rejects launching at night, without provisions, or without room for allied survivors', () => {
    const s = prepared(); s.phase = 'night'; expect(launchError(s)).toContain('daylight'); s.phase = 'day';
    s.resources.food = 29; expect(launchError(s)).toContain('30'); s.resources.food = 200;
    while (army(s).length < 21) makeUnit(s, 'warden', 13, 16);
    expect(launchError(s)).toContain('garrison');
  });
});
