import { MAP_W, MAX_HOSTILES, MAX_UNITS, TERRITORIES, UNITS } from './config';
import { distance, key, tileAt } from './map';
import { clearMelee, findPath, movementBlocker, nearestOpen, navigation, type Navigation } from './navigation';
import { separateCrowd } from './crowd';
import { army, enemies, isFriendly, log, makeUnit, random } from './state';
import type { Building, CommanderInput, Point, Resident, State, Unit, UnitKind } from './types';
import { SpatialGrid } from './spatial';
import { expose, recordDeath, resolveResidentDeaths } from './disease';
import { awardBounty } from './treasury';
function move(s: State, u: Unit, target: Point, dt: number, enemy: boolean, nav: Navigation): Building | undefined {
  const endpoint = u.path[u.path.length - 1];
  if (endpoint && distance(endpoint, target) > 1.5) u.repath = 0;
  if (u.repath <= 0) {
    u.path = findPath(s, u, target, enemy,nav);
    // A* returns no nodes when both positions round to the same tile. Finish
    // that last fraction instead of leaving a move order permanently pending.
    if (!u.path.length && key(u) === key(target)) u.path = [{ x: target.x, y: target.y }];
    u.repath = 1.6 + u.id % 7 * 0.12;
  }
  const next = u.path[0]; if (!next) return;
  const b=nav.buildings[key(next)];const obstruction=b&&b.hp>0&&(enemy||b.kind!=='gate')?b:undefined;
  if (obstruction && distance(u, obstruction) < 1.3) return obstruction;
  const d = distance(u, next), speed = UNITS[u.kind].speed * (tileAt(u.x, u.y,s)?.terrain === 'marsh' ? 0.6 : 1);
  const fraction=d?Math.min(1,speed*dt/d):1,p={x:u.x+(next.x-u.x)*fraction,y:u.y+(next.y-u.y)*fraction};
  const blocked=movementBlocker(nav,u,p,enemy,true);
  if(blocked){u.path=[];u.repath=0;return blocked==='terrain'?undefined:blocked;}
  u.x=p.x;u.y=p.y;if(fraction===1)u.path.shift();
  return;
}
function hit(s: State, attacker: Unit | Building, target: Unit | Building | Resident, damage: number, ranged: boolean, friends: SpatialGrid<Unit>): void {
  if (attacker.cooldown > 0) return;
  let armor = 'kind' in target && target.kind in UNITS ? UNITS[target.kind as UnitKind].armor : 0;
  if ('kind' in target && target.kind === 'warden' && ((target as Unit).formation??s.formation) === 'line' && friends.nearest(target,2.5,u=>u.id!==target.id&&u.hp>0&&u.kind==='warden')) armor += 3;
  if('attackFlash' in attacker&&!isFriendly(attacker)&&('job' in target||'attackFlash' in target&&isFriendly(target)))expose(s,target as Unit|Resident,attacker.kind==='brute'?22:attacker.kind==='runner'?10:14,'bite');
  target.hp -= Math.max(1, damage - armor);
  if('attackFlash' in target&&!isFriendly(target)&&(attacker.kind==='tower'||'attackFlash' in attacker&&isFriendly(attacker))){target.bountyEligible=true;if(attacker.id===s.commander?.id)target.commanderCredit=true;}
  attacker.cooldown = attacker.kind === 'tower' ? 1.5 : UNITS[attacker.kind as UnitKind].cooldown;
  if ('attackFlash' in attacker) attacker.attackFlash = 0.3;
  if (s.effects.length < 100) s.effects.push({ id: s.nextId++, x: attacker.x, y: attacker.y, kind: ranged ? 'arrow' : 'hit', to: { x: target.x, y: target.y }, ttl: ranged ? 0.35 : 0.3, source: attacker.id, unit: attacker.kind in UNITS ? attacker.kind as UnitKind : undefined, armored: armor >= 3 });
}
export const waveSize = (s: State): number => s.endless ? Math.min(135,45+Math.floor(army(s).length*.45)) : Math.min(45, 6 + s.day * 3 + (s.owned.length - 1) * 3);
export function spawnWave(s: State): void {
  s.waveNumber++; s.waveRemaining = waveSize(s); s.waveClock = 0;
  log(s, `Night ${s.day}. ${s.waveRemaining} infected approach the ${s.owned.length > 1 ? `${s.owned.length} open fronts` : 'southern crossing'}.`, 'danger');
}
export function combatStep(s: State, dt: number, separate = true,input?:CommanderInput,treasury:State=s): void {
  s.waveClock -= dt;
  if (s.waveRemaining > 0 && s.waveClock <= 0 && s.units.length < MAX_UNITS && enemies(s).length < MAX_HOSTILES) {
    s.waveRemaining--; s.waveClock = 0.8;
    const route = TERRITORIES[s.owned[Math.floor(random(s) * s.owned.length)]].route;
    const n = random(s), kind: UnitKind = s.day >= 3 && n > (s.endless?.65:.8) ? 'brute' : s.day >= 2 && n > (s.endless?.3:.55) ? 'runner' : 'hollow';
    const p = { x: Math.min(29, Math.max(0, route.x + (random(s) - 0.5))), y: Math.min(25, Math.max(0, route.y + (random(s) - 0.5))) };
    makeUnit(s, kind, p.x, p.y);
  }
  const friends = army(s), foes = enemies(s), hearth = s.buildings.find(b => b.kind === 'hearth');
  const nav=navigation(s),friendGrid=new SpatialGrid(friends),foeGrid=new SpatialGrid(foes),humanGrid=new SpatialGrid<Unit|Resident>([...friends,...(s.residents??[])]);
  const illnesses=new Map(s.infection.map(i=>[i.personId,i]));
  const isolated=new Map<number,Point>();
  if(s.quarantine&&illnesses.size){
    const refuge=s.buildings.find(b=>b.kind==='infirmary'&&b.progress===1)??hearth;
    if(refuge){const reserved=new Set(friends.filter(u=>!illnesses.has(u.id)).map(u=>key(u.target)));
      for(const u of friends)if(illnesses.has(u.id)){const p=nearestOpen(s,{x:refuge.x,y:refuge.y+1},reserved,nav);reserved.add(key(p));isolated.set(u.id,p);}
    }
  }
  const byId=new Map(s.units.map(u=>[u.id,u]));
  const breached = hearth && foes.some(u => u.hp > 0 && distance(u, hearth) < 3);
  for (const b of s.buildings) {
    b.cooldown = Math.max(0, b.cooldown - dt);
    if (b.kind === 'tower' && b.progress >= 1) {
      const target = foeGrid.nearest(b,6+(b.level-1)*.7,u=>u.hp>0);
      if (target) hit(s, b, target, 14 + (b.level - 1) * 7, true,friendGrid);
    }
  }
  for (const u of s.units) {
    if (u.hp <= 0 || u.injury) continue;
    u.cooldown = Math.max(0, u.cooldown - dt); u.repath -= dt; u.attackFlash = Math.max(0, u.attackFlash - dt);
    const friendly = isFriendly(u), ranged = u.kind === 'ranger' || u.kind === 'scout', def = UNITS[u.kind];
    const illness=illnesses.get(u.id);
    if(friendly&&s.quarantine&&illness){const p=isolated.get(u.id);if(p)move(s,u,p,dt,false,nav);continue;}
    if(friendly&&input&&u.id===s.commander?.id){
      const walk=input.walk,len=Math.hypot(walk.x,walk.y),weapon=s.commander.weapon;
      if(len){delete u.muster;const speed=1.9*dt*(tileAt(u.x,u.y,s)?.terrain==='marsh'?.6:1),p={x:u.x+walk.x/len*speed,y:u.y+walk.y/len*speed};if(!movementBlocker(nav,u,p,false,true)){u.x=p.x;u.y=p.y;}else{for(const p2 of [{x:p.x,y:u.y},{x:u.x,y:p.y}])if(!movementBlocker(nav,u,p2,false,true)){u.x=p2.x;u.y=p2.y;break;}}u.path=[];u.order='hold';u.target={x:u.x,y:u.y};}
      else if(u.order==='move'){if(distance(u,u.target)>.2)move(s,u,u.target,dt,false,nav);else{u.order='hold';u.path=[];}}
      if(input.attack&&u.cooldown<=0){
        const reach=weapon==='bow'?5.2:weapon==='spear'?2.2:1.4,aim=input.aim;
        const victim=foeGrid.nearest(u,reach,v=>v.hp>0&&(weapon==='bow'||clearMelee(s,u,v,nav))&&(!aim||distance(aim,u)<.2||((v.x-u.x)*(aim.x-u.x)+(v.y-u.y)*(aim.y-u.y))/(distance(u,v)*distance(u,aim)||1)>.45));
        const power=(weapon==='bow'?14:weapon==='spear'?19:22)+Math.min(5,Math.floor(s.commander.xp/6))*2;
        if(victim)hit(s,u,victim,power*(illness&&illness.age>=18?.8:1)*(weapon==='bow'&&distance(u,victim)<1.5?.6:1),weapon==='bow',friendGrid);
        else if(s.effects.length<100)s.effects.push({id:s.nextId++,x:u.x,y:u.y,to:aim??{x:u.x,y:u.y+1},kind:weapon==='bow'?'arrow':'hit',source:u.id,unit:u.kind,ttl:.3});
        u.attackFlash=.3;u.cooldown=weapon==='sword'?.7:weapon==='spear'?1:1.15;
      }
      continue;
    }
    const anchor=u.anchor??u.target;
    if(friendly&&u.order==='patrol'&&u.patrol&&distance(u,u.target)<.35){u.patrol.leg=u.patrol.leg?0:1;u.target={...(u.patrol.leg?u.patrol.b:u.patrol.a)};u.path=[];u.repath=0;}
    if(friendly&&u.order==='escort'){const escorted=byId.get(u.focus!);if(escorted&&escorted.hp>0){if(distance(u.target,escorted)>2){u.target=nearestOpen(s,{x:escorted.x+(u.id%3-1),y:escorted.y+1},undefined,nav);u.repath=0;}}else{u.order='defend';delete u.focus;}}
    const elevation = tileAt(u.x, u.y,s)?.height ?? 0;
    const range = def.range + (ranged ? elevation * 0.8 + ((u.formation??s.formation) === 'loose' ? 0.6 : 0) : 0);
    const radius=friendly?(u.order==='hunt'?12:u.order==='attack'?8:u.order==='hold'?range:range+(ranged?.4:2)):u.order==='defend'?5.5:4;
    let target:Unit|Resident|undefined=friendly?foeGrid.nearest(u,radius,v=>v.hp>0&&(u.order==='hunt'?distance(v,anchor)<=12:u.order==='hold'||u.order==='attack'||ranged||distance(v,anchor)<(u.order==='defend'?4:6)||!u.order&&!!hearth&&distance(v,hearth)<3)):humanGrid.nearest(u,radius,v=>v.hp>0);
    if(friendly&&u.order==='attack'&&u.focus){const focused=byId.get(u.focus);if(focused&&focused.hp>0&&!isFriendly(focused))target=focused;else delete u.focus;}
    // Runners punish an exposed rear. A front-line soldier already in reach
    // still intercepts them, so a screen has practical value.
    if (u.kind === 'runner' && target && distance(u, target) > 1.3) target = friendGrid.nearest(u,Math.min(4,distance(u,target)+1.5),v=>v.hp>0&&(v.kind==='ranger'||v.kind==='scout'))??target;
    const damage = (def.damage + (ranged ? elevation * 3 : u.kind === 'spearman' && target && 'kind' in target && target.kind === 'runner' ? 6 : 0))*(illness&&illness.age>=18?.8:1);
    const shotDamage = u.kind === 'ranger' && target && distance(u, target) < 1.5 ? damage * .6 : damage;
    const canHit = target && distance(u, target) <= range && (ranged || clearMelee(s, u, target,nav));
    if (friendly && (u.order === 'move'||u.order==='retreat'||u.order==='regroup')) {
      if (distance(u, u.target) <= .2) { if(u.order==='move')delete u.order;else u.order='hold'; u.path = []; u.repath = 0; }
      else {
        if (canHit&&u.order!=='retreat') hit(s, u, target!, shotDamage, ranged,friendGrid);
        move(s, u, u.target, dt, false,nav);
        continue;
      }
    }
    if (canHit) {
      hit(s, u, target!, shotDamage, ranged,friendGrid);
      if (ranged&&u.order!=='hold'&&distance(u,target!)<(u.kind==='scout'?2:1.7)&&distance(u,anchor)<4) { const dx=u.x-target!.x,dy=u.y-target!.y,d=Math.hypot(dx,dy)||1;move(s,u,nearestOpen(s,{x:u.x+dx/d*2,y:u.y+dy/d*2},undefined,nav),dt,false,nav); }
    } else {
      // An idle guard must help at a breach instead of watching the Hearth fall
      // from a distant rally point. Explicit move orders above still take priority.
      const defense = friendly && !u.order && breached && hearth ? nearestOpen(s, { x: hearth.x + u.id % 3 - 1, y: hearth.y + 2 },undefined,nav) : u.target;
      const destination = friendly&&u.order==='hold'?undefined:friendly&&ranged&&u.order!=='attack'&&u.order!=='hunt'?defense:target??(friendly?defense:u.order==='defend'?u.anchor??u.target:hearth??friendGrid.nearest(u,45,v=>v.hp>0));
      if (destination && distance(u, destination) > 0.2) {
        const blocking = move(s, u, destination, dt, !friendly,nav);
        if (blocking && !friendly) hit(s, u, blocking, def.damage,false,friendGrid);
      }
    }
    if (!friendly) {
      const k = key(u); if (k >= 0 && k < s.contamination.length) s.contamination[k] = Math.min(100, s.contamination[k] + dt * 5);
      // Reaching an occupied tile is unnecessary: infected attack from its edge.
      if (!target && hearth && distance(u, hearth) <= 1.2) hit(s, u, hearth, def.damage,false,friendGrid);
    }
  }
  let bounty=0,rewarded=0,reanimated=0,claimed=0;
  for (const u of s.units) if (u.hp <= 0) {
    if (s.effects.length < 100) s.effects.push({ id: s.nextId++, x: u.x, y: u.y, kind: 'death', ttl: 1, unit: u.kind });
    if (isFriendly(u)) { recordDeath(s,u);s.stats.lost++; log(s, `A ${UNITS[u.kind].name.toLowerCase()} has fallen.`, 'danger'); }
    else {
      if(u.commanderCredit&&u.reanimatedFrom===undefined&&s.commander)s.commander.xp=Math.min(100,s.commander.xp+1);
      s.stats.slain++;
      const paid=awardBounty(treasury,u,!!s.theatre);
      if(paid){
        bounty+=paid;rewarded++;
        if(s.effects.length<100)s.effects.push({id:s.nextId++,kind:'reward',x:u.x,y:u.y,ttl:1.6,amount:paid});
      }else if(u.bountyEligible){
        if(u.reanimatedFrom!==undefined)reanimated++;else if(s.theatre)claimed++;
        if(s.effects.length<100&&(u.reanimatedFrom!==undefined||s.theatre))s.effects.push({id:s.nextId++,kind:'reward',x:u.x,y:u.y,ttl:1.6,amount:0,note:u.reanimatedFrom!==undefined?'reanimated':'claimed'});
      }
      s.resources.herbs=Math.min(Math.max(9999,s.resources.herbs),s.resources.herbs+.12);
      const k=key(u);if(k>=0&&k<MAP_W*26)s.contamination[k]=Math.min(100,s.contamination[k]+15);
    }
  }
  if(bounty)log(s,`+${bounty} Crowns · ${rewarded} infected defeated.`,'good');
  if(reanimated||claimed)log(s,[reanimated?`${reanimated} reanimated dead: no bounty.`:'',claimed?`${claimed} expedition foes: bounty already claimed.`:''].filter(Boolean).join(' '),'info');
  s.units = s.units.filter(u => u.hp > 0);
  if(separate)separateCrowd(s, s.units, dt);
  for (const b of s.buildings) if (b.hp <= 0) {
    log(s, `${b.kind === 'hearth' ? 'The Last Hearth' : 'Your ' + b.kind} has fallen.`, 'danger');
    if (b.kind !== 'wall' && b.kind !== 'gate' && b.kind !== 'tower') for(const r of [...(s.residents??[])].sort((a,c)=>distance(a,b)-distance(c,b)).slice(0,2))r.hp=0;
    for (const u of s.units) u.repath = 0;
  }
  s.buildings = s.buildings.filter(b => b.hp > 0);
  resolveResidentDeaths(s);
  if (!s.theatre && !s.region && !s.buildings.some(b => b.kind === 'hearth')) { s.outcome = 'lost'; s.speed = 0; }
}
