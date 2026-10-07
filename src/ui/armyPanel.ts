import {empireArmy} from '../game/empire';
import { armyCapacity, available, ORDER_NAMES, SQUAD_COLORS } from '../game/army';
import { MAX_UNITS, UNITS } from '../game/config';
import { diseaseStage, illnessDeadline, illnessFor } from '../game/disease';
import { idle, rates } from '../game/economy';
import type { Runtime } from '../game/runtime';
import { army } from '../game/state';
import { recruitmentBlocker, recruitmentCost, recruitmentPlan } from '../game/recruitment';
import { price } from './shopPanel';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function armyPanel(rt: Runtime): string {
  const s=rt.world,troops=army(s).filter(u=>u.origin!=='battalion'),chosen=new Set(rt.selectedIds),fit=troops.filter(u=>available(s,u));
  const selected=troops.filter(u=>chosen.has(u.id)),ready=selected.filter(u=>available(s,u)).length;
  const view=rt.armyView??'orders',pages=Math.max(1,Math.ceil(troops.length/12));rt.rosterPage=Math.max(0,Math.min(rt.rosterPage,pages-1));
  const names=selected.length?[...new Set(selected.map(u=>u.order?ORDER_NAMES[u.order]:'Guard'))].join(', '):'Select soldiers on the map or in Roster';
  const tabs=s.theatre?[['orders','Orders'],['squads','Squads'],['roster','Roster']]:[['orders','Orders'],['recruit','Recruit'],['squads','Squads'],['roster','Roster']];
  const quick=`<div class="quick-squads" aria-label="Recall squads">${(s.squads??[]).map((q,i)=>`<button id="squad-${q.id}" data-squad="${q.id}" class="${selected.length&&selected.every(u=>u.squadId===q.id)?'active':''}" title="${i<9?'Press '+(i+1)+' to recall. ':''}${escape(q.name)}">${i<9?'<kbd>'+(i+1)+'</kbd> ':''}${escape(q.name)} · ${troops.filter(u=>u.squadId===q.id).length}</button>`).join('')}</div>`;
  let content='';
  if(view==='orders'||s.theatre&&view==='recruit')content=`${quick}<div class="army-command-deck">
    <div class="segmented"><button id="select-all">Select available</button><button id="select-none">Clear</button><button id="multi-select" aria-pressed="${rt.multiSelect}" class="${rt.multiSelect?'active':''}">Multi-select</button></div>
    <div class="order-grid">${Object.entries(ORDER_NAMES).map(([id,name])=>`<button id="order-${id}" data-order="${id}" aria-pressed="${rt.orderMode===id}" class="secondary ${rt.orderMode===id?'selected':''}" ${!ready?'disabled':''}>${name}</button>`).join('')}</div>
    <p class="selection-summary" id="selection-summary">${ready} ready${chosen.size-ready?' · '+(chosen.size-ready)+' recovering or isolated':''} · ${names}</p></div>
    <p class="army-help">${rt.orderMode?escape(ORDER_NAMES[rt.orderMode])+': choose a map target.':'Right-click or long-press and drag to move all available soldiers; use Roster or squads for smaller groups.'} Other squads keep their orders.</p>
    ${s.theatre?'':`<div class="segmented formations"><button id="formation-line" data-formation="line" aria-pressed="${(selected.length?selected:troops).every(u=>(u.formation??s.formation)==='line')}">Shield line</button><button id="formation-loose" data-formation="loose" aria-pressed="${(selected.length?selected:troops).every(u=>(u.formation??s.formation)==='loose')}">Loose</button><button id="formation-column" data-formation="column" class="secondary">Road column</button></div>
    <p class="army-help">Line protects wardens. Loose spreads bowmen for range. Road column narrows the march and reforms on the next order.</p>`}
    ${s.theatre?'':`<div class="army-shortcuts"><button id="rally" class="primary">Set rally point</button><button id="rally-gate" class="secondary">Defend south gate</button></div>`}
    <details class="army-help"><summary>How orders work</summary><p>Hunt pursues within 12 tiles of its destination. Defend protects a 4-tile melee screen; Hold never pursues. Patrol travels out and back. Retreat avoids fighting. Escort follows an allied soldier. Orders address selected available members only.</p></details>`;
  if(view==='squads')content=`${quick}<p class="army-help">Select soldiers, then name a squad. Reassign a selection to split or merge groups; existing orders stay with each soldier.</p>
    <label class="squad-label" for="squad-name">Squad name</label><input id="squad-name" maxlength="24" placeholder="e.g. Gate Watch" value="${escape(rt.squadName)}"/>
    <button id="create-squad" class="primary full" ${!chosen.size?'disabled':''}>Name ${chosen.size||'selected'} soldiers</button>
    <div class="section-label">YOUR SQUADS <span>${s.squads?.length??0} / 20</span></div>
    ${(s.squads??[]).map(q=>`<div class="squad-card" style="border-color:#${SQUAD_COLORS[q.color].toString(16).padStart(6,'0')}"><button data-squad="${q.id}" class="secondary full">${escape(q.name)} · ${troops.filter(u=>u.squadId===q.id).length}</button><div class="segmented"><button data-squad-assign="${q.id}" ${!chosen.size?'disabled':''}>Assign selected</button><button data-squad-rename="${q.id}">Rename</button><button data-squad-delete="${q.id}">Dissolve</button></div></div>`).join('')}
    <p class="army-help">Rename uses the name above. Keys 1–9 recall squads. Double-click a squad to center the camera.</p>`;
  if(view==='roster')content=`<div class="section-label">SOLDIERS <span>${rt.rosterPage+1} / ${pages}</span></div>
    <div class="unit-roster">${troops.slice(rt.rosterPage*12,rt.rosterPage*12+12).map(u=>{const i=illnessFor(s,u.id),deadline=i?illnessDeadline(s,i,u):Infinity,status=i?deadline<=8?'Dying · infected':diseaseStage(i.age):u.exposureSourceId?`Bitten by zombie #${u.exposureSourceId} · ${Math.floor(u.exposure??0)}% exposure`:u.hp<u.maxHp*.98?'Wounded':u.injury?'Recovering':'Fit';return `<button id="unit-${u.id}" data-unit="${u.id}" aria-pressed="${chosen.has(u.id)}" class="unit-row ${chosen.has(u.id)?'selected':''}"><span>${chosen.has(u.id)?'☑':'☐'} ${UNITS[u.kind].name} #${u.id}</span><small>${Math.ceil(u.hp)} / ${u.maxHp} HP · ${status}${u.injury&&!i?' · rest '+Math.ceil(u.injury)+'s':u.order?' · '+ORDER_NAMES[u.order]:''}</small></button>`;}).join('')}</div>
    ${pages>1?`<div class="segmented"><button id="roster-prev" ${!rt.rosterPage?'disabled':''}>Previous</button><button id="roster-next" ${rt.rosterPage>=pages-1?'disabled':''}>Next</button></div>`:''}
    <button id="treat-selected" class="secondary full" ${!s.infection.some(i=>chosen.has(i.personId!))?'disabled':''}>Treat selected${s.theatre?' · 1 packed herb':' · 5 herbs + 8 provisions'}</button>
    ${s.theatre?'':`<button id="demobilize" class="secondary full" ${!chosen.size?'disabled':''}>Return selected to civilian work</button><p class="army-help">Requires spare beds, fit uninfected soldiers and peaceful daylight. Equipment is not refunded.</p>`}`;
  if(view==='recruit'&&!s.theatre){
    const foodRate=rates(s).food,armyPlaces=Math.max(0,Math.min(armyCapacity(s)-empireArmy(s),MAX_UNITS-s.units.length));
    content=`<p class="food-forecast ${foodRate<0?'warning-text':''}">${foodRate<0?'Provisions falling '+(-foodRate).toFixed(2)+'/s · about '+Math.floor(s.resources.food/-foodRate)+'s remain. Add farmers.':'Provisions +'+foodRate.toFixed(2)+'/s after upkeep.'}</p><p class="army-help">${idle(s)} idle residents · ${armyPlaces} army places. Garrison levels add 24 places. Each soldier eats 0.04 provisions/s.</p>
    ${(['warden','ranger','spearman','scout'] as const).map(kind=>{
      const plan=recruitmentPlan(s,kind),actions=[1,5,10,50,100].map(n=>({n,label:String(n)})).concat([{n:plan.max,label:`Max · ${plan.max}`}]);
      const status=`${plan.residents} fit eligible · ${plan.affordable} affordable · ${plan.capacity} places`;
      const blockedBatch=[1,5,10,50,100].find(n=>n>plan.max),blocker=plan.reason|| (blockedBatch?recruitmentBlocker(s,kind,blockedBatch,plan):'');
      return `<article class="recruit-card compact-recruit"><div><h3>${UNITS[kind].name}</h3><p>${kind==='warden'?'Armored sword infantry; holds gates.':kind==='ranger'?'Long range; vulnerable at close quarters.':kind==='spearman'?'Long thrusts; counters fast runners.':'Fast bow support; light armor, shorter reach.'}</p>${price(s,UNITS[kind].cost)}<p class="recruit-batch-cost">Max batch cost: ${plan.max?price(s,recruitmentCost(kind,plan.max)):'unavailable'}</p><div class="segmented recruit-actions">${actions.map(({n,label},i)=>{const amount=i===5?plan.max:n,reason=amount?recruitmentBlocker(s,kind,amount,plan):plan.reason;return `<button id="recruit-${kind}${i===0?'':i===5?'-max':'-'+n}" data-recruit="${kind}" data-count="${amount}" ${reason?'disabled':''} title="${reason||`Equip ${amount} ${UNITS[kind].name.toLowerCase()}${amount===1?'':'s'}`}" ${i===5?'class="primary"':''}>Recruit ${label}</button>`;}).join('')}</div><p class="recruit-reason" aria-live="polite">${status} · ${plan.max?`Up to ${plan.max} ready`:''}${blocker?`${plan.max?' · Larger batches blocked: ':' '}${blocker}`:''}</p></div></article>`;
    }).join('')}`;
  }
  return `<div class="panel-heading compact-heading"><h2>${s.theatre?'Patrol orders':'The Hearthguard'}</h2></div>
    ${s.outcome==='won'?'<button id="continue-watch" class="primary full">Continue the watch</button>':''}
    <div class="army-status"><span><strong>${troops.length}${s.theatre?'':' / '+armyCapacity(s)}</strong> local soldiers${s.empire?' · '+empireArmy(s)+' across empire':''}</span><span>${fit.length} ready</span><span><strong id="selected-count">${chosen.size}</strong> selected</span>${troops.some(u=>u.injury)?`<span>${troops.filter(u=>u.injury).length} recovering</span>`:''}</div>
    <nav class="segmented army-views" aria-label="Army management">${tabs.map(([id,name])=>`<button id="army-${id}" data-army-view="${id}" aria-pressed="${view===id}" class="${view===id?'active':''}">${name}</button>`).join('')}</nav>${content}
    ${s.theatre?'':'<button id="open-expedition" class="secondary full expedition-entry">Lost Battalions →</button>'}`;
}
