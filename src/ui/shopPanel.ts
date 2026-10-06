import { BUILDINGS } from '../game/config';
import { shortage } from '../game/commands';
import { canAfford } from '../game/economy';
import { RESOURCE_NAMES } from '../game/treasury';
import type { BuildingKind, Resources, State } from '../game/types';
import { icon } from './icons';

export function price(s:State,cost:Partial<Resources>):string {
  return `<span class="cost">${Object.entries(cost).map(([r,n])=>`<span class="${s.resources[r as keyof Resources]<n?'unaffordable':''}">${icon(r==='wood'?'wood':r==='stone'?'crown':r==='food'?'wheat':'herb')}${n} ${RESOURCE_NAMES[r as keyof Resources]}</span>`).join('')}</span>`;
}
export function shopPanel(s:State,category:string,thumbs:Record<string,string>,placement:BuildingKind|null,details:BuildingKind|null):string {
  const tabs=[['settlement','Homes'],['production','Work'],['defense','Defenses'],['owned','Village']];
  const items=Object.entries(BUILDINGS).filter(([k,d])=>k!=='hearth'&&d.category===category);
  return `<div class="panel-heading compact-heading"><h2>Build your kingdom</h2><p>Timber builds. Crowns equip and upgrade.</p></div>
  <nav class="segmented shop-categories" aria-label="Building categories">${tabs.map(([id,name])=>`<button id="category-${id}" data-category="${id}" aria-pressed="${category===id}" class="${category===id?'active':''}">${name}</button>`).join('')}</nav>
  ${category==='owned'?`<div class="section-label">YOUR VILLAGE <span>${s.buildings.length} buildings</span></div><div class="building-list">${s.buildings.map(b=>`<button id="inspect-${b.id}" data-inspect="${b.id}">${icon(BUILDINGS[b.kind].icon)}<span>${BUILDINGS[b.kind].name}</span><small>${b.x},${b.y} · ${b.progress<1?Math.floor(b.progress*100)+'%':'Lv. '+b.level}</small>${icon('arrow')}</button>`).join('')}</div>`:
  `<div class="shop-list">${items.map(([key,d])=>{const kind=key as BuildingKind,affordable=canAfford(s,d.cost);return `<article class="shop-card ${placement===kind?'chosen':''}"><img alt="" src="${thumbs[kind]}"/><div class="shop-card-content"><h3>${d.name}</h3><p>${d.subtitle}</p>${price(s,d.cost)}<div class="shop-actions"><button id="build-${kind}" data-build="${kind}" class="primary" ${affordable?'':'disabled'} aria-label="Build ${d.name}">${placement===kind?'Placing…':'Place'}</button><button id="details-${kind}" data-build-details="${kind}" class="secondary" aria-expanded="${details===kind}" aria-label="Details for ${d.name}">Details</button></div><p class="shop-availability ${affordable?'':'warning-text'}">${affordable?'':`Need ${shortage(s,d.cost)} more`}</p></div>${details===kind?`<p class="shop-description">${d.description} Construction: ${Math.ceil(d.time/1.25)}s with two builders.</p>`:''}</article>`;}).join('')}</div><p class="shop-help">${s.jobs.builders} builders share active sites. Select Place, then choose clear ground. Tap a site on touch to preview before confirming.</p>`}`;
}
