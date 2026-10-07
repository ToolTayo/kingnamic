import {isBarrier} from '../game/barriers';
import {empirePanel} from './empirePanel';
import {LANDMARKS,ROAD_EXIT} from '../game/empire';
import { shopPanel } from './shopPanel';
import { RESOURCE_NAMES } from '../game/treasury';
import { armyPanel } from './armyPanel';
import { plagueDetails } from './plaguePanel';
import { BUILDINGS, DAY_LENGTH, JOBS, NIGHT_LENGTH, OBJECTIVES, TERRITORIES } from '../game/config';
import { repairCost, upgradeCost } from '../game/commands';
import { canAfford, capacity, healthy, idle, jobCapacity, rates } from '../game/economy';
import { tilesFor } from '../game/map';
import type { Runtime } from '../game/runtime';
import { army, enemies } from '../game/state';
import type { ArmyOrder, Building, BuildingKind, ExpeditionApproach, Job, Resources, SoldierKind, TerritoryId } from '../game/types';
import { buildingArt } from '../render/art';
import type { WorldScene } from '../render/WorldScene';
import { icon } from './icons';
import { constructionCrew } from '../game/workforce';
import { expeditionPanel, missionObjective } from './expeditionPanel';
import { missionRoute, defaultPatrol, readyArmy } from '../game/expedition';
import { ambushFronts } from '../game/encounters';
import { isFriendly } from '../game/state';
import { waveSize } from '../game/combat';
import { commandableIds } from '../game/army';
import { nextIllnessDeadline } from '../game/disease';
const escape = (str: string): string => str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const resourceIcon: Record<keyof Resources, string> = { wood: 'wood', stone: 'crown', food: 'wheat', herbs: 'herb' };
export class Interface {
  private rt: Runtime;
  private scene: () => WorldScene;
  private tab = 'build';
  private category = 'settlement';
  private shopDetails:BuildingKind|null=null;
  private thumbs: Record<string, string> = {};
  private panel!: HTMLElement;
  private dialog!: HTMLDialogElement;
  private lastHtml = '';
  private htmlCache = new Map<string, string>();
  private lastOutcome = 'playing';
  private lastLog = 0;
  private wasAway = false;
  private patrol: number[] | null = null;
  private approach: ExpeditionApproach = 'ridge';
  private modalPaused = false;
  private restoreSpeed: 0 | 1 | 2 = 1;
  private sound = false;
  private audio?: AudioContext;
  constructor(rt: Runtime, scene: () => WorldScene) {
    this.rt = rt; this.scene = scene;
    for (const kind of Object.keys(BUILDINGS)) this.thumbs[kind] = buildingArt(kind as BuildingKind).toDataURL();
    this.mount(); this.bind(); this.render(); this.onboard();
    rt.onChange = () => this.render(); rt.onSound = kind => this.beep(kind);
    window.setInterval(() => this.render(), 250);
  }
  private mount(): void {
    document.querySelector('#app')!.innerHTML = `
      <header class="topbar">
        <a class="brand" href="#" aria-label="KINGNAMIC — center on kingdom">${icon('crown')}<span>KINGNAMIC<small>THE LAST HEARTH</small></span></a>
        <div class="resources" aria-label="Kingdom resources">${(['wood', 'stone', 'food', 'herbs'] as const).map(r => `<div class="resource ${r}" title="${r === 'wood' ? 'Timber' : r === 'food' ? 'Provisions' : r === 'herbs' ? 'Medicinal herbs' : 'Crowns'}">${icon(resourceIcon[r])}<div><span class="resource-name">${r === 'wood' ? 'TIMBER' : r === 'food' ? 'PROVISIONS' : r === 'stone' ? 'CROWNS' : r.toUpperCase()}</span><span class="resource-value" id="resource-${r}">0</span><small id="rate-${r}"></small></div></div>`).join('')}</div>
        <div class="population-top">${icon('people')}<div><span id="population">18 / 24</span><small>VILLAGERS</small></div></div>
        <button class="icon-button settings-button" id="settings" aria-label="Settings and help" title="Settings and help">${icon('gear')}</button>
      </header>
      <main class="game-layout">
        <section class="world-wrap" aria-label="Kingdom map">
          <div id="world"></div>
          <div class="world-vignette"></div>
          <div class="world-top"><div><div class="eyebrow">THE ASHEN VALE <span>•</span> CHAPTER I</div><h1 id="world-title">Hearthmere</h1><p id="world-subtitle">A small light in a hollow world.</p></div><div class="day-card"><span id="day-icon">${icon('sun')}</span><div><strong id="day-label">Day 1</strong><span id="phase-label">Daylight · 72s to dusk</span></div><div class="day-track"><i id="day-progress"></i></div></div></div>
          <div class="alert-banner hidden" id="alert-banner" role="status"></div>
          <div class="camera-controls"><button class="icon-button" id="zoom-in" aria-label="Zoom in">${icon('plus')}</button><button class="icon-button" id="zoom-out" aria-label="Zoom out">${icon('minus')}</button><button class="icon-button" id="home-camera" aria-label="Center on Hearthmere" title="Center on Hearthmere (H)">${icon('target')}</button></div>
          <section class="objectives-card"><div class="eyebrow">${icon('flag')} A KINGDOM FROM THE ASHES</div><div id="objectives"></div><div class="objective-footer"><span id="objective-count">0 / 5 milestones</span><span>CHAPTER I</span></div></section>
          <div id="hero-pad" class="hero-pad hidden" aria-label="Commander movement"><button data-walk="-1,-1" aria-label="Walk up">↑</button><div><button data-walk="-1,1" aria-label="Walk left">←</button><button data-walk="1,1" aria-label="Walk down">↓</button><button data-walk="1,-1" aria-label="Walk right">→</button></div><button id="hero-strike">Strike</button></div><div class="placement-bar hidden" id="placement-bar"></div>
          <div class="minimap"><div class="minimap-title">${icon('map')} ASHEN VALE<span>N ↗</span></div><canvas id="minimap" width="180" height="115" aria-label="Overview of the four territories. Click to move the camera."></canvas><div class="minimap-legend"><i></i> Your realm <i class="hostile"></i> The Hollow</div></div>
          <div class="world-hint" id="world-hint">Drag to explore <span>·</span> Scroll to zoom <span>·</span> Right-click to rally</div>
          <div id="bounty-feedback" class="bounty-feedback hidden" role="status" aria-live="polite"></div><div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
        </section>
        <aside class="sidebar"><nav class="tabs" aria-label="Kingdom management">${[['build', 'hammer', 'Build'], ['people', 'people', 'People'], ['army', 'shield', 'Army'], ['territories', 'map', 'Marches'],['empire','crown','Empire']].map(([id, i, name]) => `<button id="tab-${id}" data-tab="${id}" class="tab ${id === 'build' ? 'active' : ''}">${icon(i)}<span>${name}</span></button>`).join('')}</nav><div id="panel" class="panel"></div><div class="sidebar-bottom"><span class="beacon-dot"></span><span id="hearth-status">The beacon burns bright</span><button id="chronicle" title="Open the chronicle" aria-label="Open the chronicle">${icon('scroll')}</button></div></aside>
      </main>
      <footer class="statusbar"><div class="status-left"><span class="live-dot"></span><span id="save-status">Local kingdom</span><button id="save" title="Save now">Save now</button></div><div class="time-controls"><span id="time-status">Time is flowing</span><button id="pause" aria-label="Pause game" title="Pause / resume (Space)">${icon('pause')}</button><button id="speed-1" class="active" aria-label="Normal speed">1×</button><button id="speed-2" aria-label="Double speed">2×</button></div><button class="help-shortcut" id="help">${icon('scroll')} Field guide <kbd>?</kbd></button></footer>
      <dialog id="dialog" class="modal"></dialog>`;
    this.panel = document.querySelector('#panel')!; this.dialog = document.querySelector('#dialog')!;
  }
  private bind(): void {
    document.addEventListener('input', e=>{if((e.target as HTMLElement).id==='squad-name')this.rt.squadName=(e.target as HTMLInputElement).value;});
    document.addEventListener('click', e => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button, .brand'); if (!el) return;
      const id = el.id;
      if(id==='edit-building'&&this.rt.selection?.type==='building'){this.rt.beginEdit(this.rt.selection.id);return;}
      if(id==='rotate-placement'){this.rt.placementRotation=this.rt.placementRotation?0:1;this.render();return;}
      if(el.dataset.tab||el.dataset.build||id==='cancel-placement'||id==='hero-toggle'||id==='place-outpost'||id==='rally'||id==='clear-selection')this.rt.cancelPlacement();

      if(id==='appoint-commander'){this.rt.act({type:'commander-appoint',id:this.rt.selectedIds[0]});return;}
      if(id==='hero-toggle'){this.rt.heroMode=!this.rt.heroMode;this.rt.orderMode=null;this.rt.rallyMode=false;this.rt.placement=null;this.rt.heroWalk={x:0,y:0};this.render();return;}
      if(el.dataset.weapon){this.rt.act({type:'commander-weapon',weapon:el.dataset.weapon as 'sword'|'spear'|'bow'});return;}
      if(id==='hero-strike'){this.rt.heroTap=true;return;}
      if(id==='choose-company'){this.rt.heroMode=false;this.tab='army';this.rt.selection=null;this.rt.armyView='roster';this.render();return;}
      if(id==='gather-road'){const ids=[...new Set([...this.rt.selectedIds,...(this.rt.state.commander?[this.rt.state.commander.id]:[])])];this.rt.act({type:'gather-company',ids});this.scene().focus(ROAD_EXIT);return;}
      if(id==='travel-region'||id==='home-watch'){const r=this.rt.act(id==='home-watch'?{type:'home-watch'}:{type:'travel',ids:this.rt.selectedIds});if(r.ok){this.tab='empire';this.scene().home();this.render();}return;}
      if(id==='place-outpost'){this.rt.heroMode=false;this.rt.placement='hearth';this.rt.rallyMode=false;this.rt.selection=null;this.rt.notify('Choose accessible open ground near the commander.');this.render();return;}
      if(id==='outpost-build'){this.tab='build';this.rt.selection=null;this.render();return;}
      if(el.dataset.landmark){const p=LANDMARKS.find(p=>p.id===el.dataset.landmark);if(p)this.scene().focus(p);return;}
      if(el.dataset.armyView){this.rt.armyView=el.dataset.armyView as typeof this.rt.armyView;this.rt.selection={type:'army'};this.render();this.panel.scrollTop=0;return;}
      if(el.dataset.buildDetails){this.shopDetails=this.shopDetails===el.dataset.buildDetails?null:el.dataset.buildDetails as BuildingKind;this.render();return;}
      if(el.dataset.personFocus){const id=Number(el.dataset.personFocus),person=this.rt.world.units.find(u=>u.id===id)??this.rt.world.residents?.find(r=>r.id===id);if(person){this.rt.inspectedPersonId=id;this.scene().focus(person);}return;}
      if(el.dataset.remainsFocus){const c=this.rt.world.corpses?.find(c=>c.id===Number(el.dataset.remainsFocus));if(c)this.scene().focus(c);return;}
      if(el.dataset.unit){this.rt.selectUnits([Number(el.dataset.unit)],true);return;}
      if(id==='select-all'){this.rt.selectAvailable();return;}
      if(id==='select-none'){this.rt.selectUnits([]);return;}
      if(id==='multi-select'){this.rt.multiSelect=!this.rt.multiSelect;this.render();return;}
      if(el.dataset.order){this.rt.beginOrder(el.dataset.order as ArmyOrder);return;}
      if(el.dataset.squad){this.rt.selectUnits(army(this.rt.world).filter(u=>u.squadId===Number(el.dataset.squad)).map(u=>u.id));return;}
      if(id==='create-squad'){this.rt.act({type:'squad-create',ids:this.rt.selectedIds,name:this.rt.squadName});return;}
      if(el.dataset.squadAssign){this.rt.act({type:'squad-assign',ids:this.rt.selectedIds,squadId:Number(el.dataset.squadAssign)});return;}
      if(el.dataset.squadRename){this.rt.act({type:'squad-rename',squadId:Number(el.dataset.squadRename),name:this.rt.squadName});return;}
      if(el.dataset.squadDelete){this.rt.act({type:'squad-delete',squadId:Number(el.dataset.squadDelete)});return;}
      if(id==='roster-prev'||id==='roster-next'){this.rt.rosterPage+=id==='roster-prev'?-1:1;this.render();return;}
      if(id==='treat-selected'){this.rt.act({type:'treat',ids:this.rt.selectedIds});return;}
      if(id==='demobilize'){const result=this.rt.act({type:'demobilize',ids:this.rt.selectedIds});if(result.ok)this.rt.selectUnits([]);return;}
      if(id==='expedition-treat'){this.rt.act({type:'treat'});return;}
      if(id==='invite-settlers'){this.rt.act({type:'settlers'});return;}
      if(id==='continue-watch'){this.rt.act({type:'continue'});this.lastOutcome='playing';this.closeModal();this.render();return;}
      if (el.dataset.approach) { this.approach = el.dataset.approach as ExpeditionApproach; this.render(); }
      if (id === 'next-action') {
        const s = this.rt.state, quarry = s.buildings.find(b => b.kind === 'quarry');
        this.rt.selection = null;
        if (!quarry && !s.completed.includes('build')) { this.tab = 'build'; this.category = 'production'; this.rt.placement = 'quarry'; this.rt.notify('Choose an empty tile, then assign traders when the Trading post is finished.'); }
        else this.tab = !s.completed.includes('build') || quarry && s.jobs.miners < 3 ? 'people' : s.infection.length ? 'people' : army(s).length < 5 || !s.completed.includes('night') ? 'army' : 'territories';
        this.render(); this.panel.scrollTop = 0;
      }
      if (el.dataset.patrol) { const unitId = Number(el.dataset.patrol); this.patrol ??= defaultPatrol(this.rt.state); if (this.patrol.includes(unitId)) this.patrol = this.patrol.filter(v => v !== unitId); else if (this.patrol.length < 3) this.patrol.push(unitId); else this.rt.notify('Unselect a soldier before choosing a replacement.'); this.render(); }
      if (id === 'open-expedition') { this.patrol = defaultPatrol(this.rt.state); this.tab = 'expedition'; this.rt.selection = null; this.render(); this.panel.scrollTop = 0; }
      if (id === 'expedition-back') { this.tab = 'army'; this.render(); }
      if (['expedition-launch', 'expedition-share', 'expedition-retreat', 'expedition-extract'].includes(id)) {
        if (id === 'expedition-launch') this.rt.act({ type: 'expedition-launch', ids: this.patrol ?? defaultPatrol(this.rt.state), approach: this.approach });
        else this.rt.act({ type: id as 'expedition-share' | 'expedition-retreat' | 'expedition-extract' });
        this.tab = 'expedition'; this.render(); if (id === 'expedition-launch' || !this.rt.state.expedition) { this.scene().home(); this.panel.scrollTop = 0; }
      }
      if (['expedition-camp', 'expedition-standard', 'expedition-exit'].includes(id) && this.rt.state.expedition) {
        const route = missionRoute(this.rt.state.expedition), p = route[id.slice(11) as keyof typeof route]; this.rt.act({ type: 'rally', ...p }); this.scene().focus(p);
      }
      if (this.rt.state.expedition && (el.dataset.tab || el.dataset.build || el.dataset.job || el.dataset.recruit || el.dataset.claim || el.dataset.inspect)) return;
      if (el.dataset.tab || el.dataset.build || id === 'cancel-placement' || id === 'rally') this.rt.placementPreview = null;
      if(el.dataset.tab||el.dataset.build)this.rt.orderMode=null;
      if (el.classList.contains('brand')) { e.preventDefault(); this.scene().home(); }
      if (el.dataset.tab) { this.tab = el.dataset.tab; this.rt.selection = null; this.rt.placement = null; this.rt.rallyMode = false; this.rt.onSound('click'); this.render(); this.panel.scrollTop = 0; }
      if (el.dataset.category) { this.category = el.dataset.category; this.render(); }
      if (el.dataset.build) { this.rt.placement = el.dataset.build as BuildingKind; this.rt.selection = null; this.rt.rallyMode = false; this.rt.notify(`Place ${BUILDINGS[this.rt.placement].name.toLowerCase()} on an empty tile.`, 'info'); this.render(); }
      if (el.dataset.job) this.rt.act({ type: 'job', job: el.dataset.job as Job, delta: Number(el.dataset.delta) });
      if (el.dataset.recruit) this.rt.act({ type: 'recruit', kind: el.dataset.recruit as SoldierKind, count:Number(el.dataset.count??1) });
      if (el.dataset.claim) this.rt.act({ type: 'claim', territory: el.dataset.claim as TerritoryId });
      if (el.dataset.focus) this.scene().focus(TERRITORIES[el.dataset.focus as TerritoryId]);
      if (el.dataset.formation) this.rt.act({ type: 'formation', formation: el.dataset.formation as 'line' | 'loose', ids:this.rt.selectedIds.length?this.rt.selectedIds:undefined });
      if (el.dataset.inspect) { this.rt.selection = { type: 'building', id: Number(el.dataset.inspect) }; const b = this.rt.state.buildings.find(b => b.id === Number(el.dataset.inspect)); if (b) this.scene().focus(b); this.render(); }
      if (id === 'zoom-in' || id === 'zoom-out') this.scene().zoom(id === 'zoom-in' ? 0.12 : -0.12);
      if (id === 'home-camera') this.scene().home();
      if (id === 'pause') this.rt.act({ type: 'speed', speed: this.rt.state.speed ? 0 : this.rt.state.lastSpeed });
      if (id === 'speed-1' || id === 'speed-2') this.rt.act({ type: 'speed', speed: id === 'speed-1' ? 1 : 2 });
      if (id === 'save') { this.rt.persist(); this.rt.notify(this.rt.saveError ? 'Saving is unavailable. Keep this tab open.' : 'Your kingdom is saved on this device.', this.rt.saveError ? 'warn' : 'good'); }
      if (id === 'help' || id === 'settings') this.guide();
      if (id === 'chronicle') { this.tab = 'chronicle'; this.rt.selection = null; this.render(); }
      if (id === 'cancel-placement') { this.rt.placement = null; this.rt.rallyMode = false; this.rt.orderMode=null; this.render(); }
      if (id === 'confirm-placement') {this.rt.confirmPlacement();return;}
      if (id === 'alert-people') { this.tab = 'people'; this.rt.selection = null; this.render(); this.panel.scrollTop = 0; }
      if (id === 'clear-selection') { this.rt.selection = null; this.render(); }
      if (id === 'rally') { this.rt.rallyMode = !this.rt.rallyMode; this.rt.placement = null; this.rt.orderMode='move';this.rt.notify('Choose ground for the selected soldiers, or the whole army if none are selected.'); this.render(); }
      if (id === 'rally-gate') this.rt.act({ type: 'order', order:'defend', ids:commandableIds(this.rt.world,this.rt.selectedIds.length?this.rt.selectedIds:undefined), x:14,y:17 });
      if (id === 'treat' || id === 'quarantine' || id === 'cleanse') this.rt.act({ type: id });
      if ((id === 'upgrade' || id === 'repair') && this.rt.selection?.type === 'building') this.rt.act({ type: id, id: this.rt.selection.id });
      if (id === 'start') { this.rt.ready = true; this.rt.state.tutorialSeen = true; this.closeModal(); this.rt.notify(this.rt.loaded ? 'Welcome back. Your kingdom awaits.' : 'Build a Trading post for Crowns, or timber defenses. Recruit in Army → Recruit.', 'good'); this.rt.persist(); }
      if (id === 'close-dialog') this.closeModal();
      if (id === 'sound-toggle') { this.sound = !this.sound; el.textContent = this.sound ? 'Sound on' : 'Sound off'; this.beep('click'); }
      if (id === 'reset-request') this.confirmReset();
      if (id === 'reset-confirm') { this.restoreSpeed = 1; this.lastOutcome = 'playing'; this.tab = 'build'; this.rt.reset(); this.closeModal(); this.scene().home(); this.render(); }
    });
    document.addEventListener('pointerdown',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-walk],#hero-strike');if(!el)return;if(el.dataset.walk){const [x,y]=el.dataset.walk.split(',').map(Number);this.rt.heroTouchWalk={x,y};}else this.rt.heroTouchAttack=true;e.preventDefault();});
    const releaseHero=()=>{this.rt.heroTouchWalk=undefined;this.rt.heroTouchAttack=false;};document.addEventListener('pointerup',releaseHero);document.addEventListener('pointercancel',releaseHero);window.addEventListener('blur',releaseHero);
    document.addEventListener('dblclick',e=>{const el=(e.target as HTMLElement).closest<HTMLElement>('[data-squad]');if(!el)return;const units=army(this.rt.world).filter(u=>u.squadId===Number(el.dataset.squad));if(units.length)this.scene().focus({x:units.reduce((n,u)=>n+u.x,0)/units.length,y:units.reduce((n,u)=>n+u.y,0)/units.length});});
    document.addEventListener('keydown', e => {
      if (this.dialog.open || !this.rt.ready || ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      // A focused button retains standard keyboard activation.
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); this.rt.act({ type: 'speed', speed: this.rt.state.speed ? 0 : this.rt.state.lastSpeed }); }
      if(e.ctrlKey&&e.key.toLowerCase()==='a'){e.preventDefault();this.rt.selectAvailable();}
      if(this.rt.heroMode&&/^[1-3]$/.test(e.key)){e.preventDefault();this.rt.act({type:'commander-weapon',weapon:(['sword','spear','bow'] as const)[Number(e.key)-1]});return;}
      if(/^[1-9]$/.test(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){const q=this.rt.world.squads?.[Number(e.key)-1];if(q){e.preventDefault();this.rt.selectUnits(army(this.rt.world).filter(u=>u.squadId===q.id).map(u=>u.id));}}
      if(e.key.toLowerCase()==='r'&&this.rt.placement&&['wall','gate'].includes(this.rt.placement)){e.preventDefault();this.rt.placementRotation=this.rt.placementRotation?0:1;this.render();return;}
      if (e.key === 'Escape') {this.rt.cancelPlacement(); this.rt.heroMode=false; this.rt.orderMode=null;this.rt.selectedIds=[]; this.rt.placement = null; this.rt.placementPreview = null; this.rt.rallyMode = false; this.rt.selection = null; this.render(); }
      if (e.key.toLowerCase() === 'h') this.scene().home();
      if (e.key.toLowerCase() === 'b') { this.tab = 'build'; this.rt.selection = null; this.render(); }
      if (e.key.toLowerCase() === 'r') {this.rt.cancelPlacement(); this.rt.orderMode='move';this.rt.rallyMode = true; this.rt.placement = null; this.render(); }
      if (e.key === '?') this.guide();
    });
    this.dialog.addEventListener('cancel', e => { if (!this.rt.ready) e.preventDefault(); });
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) this.restoreModal(); this.render(); });
    document.querySelector('#minimap')!.addEventListener('click', e => { const cv = e.currentTarget as HTMLCanvasElement, rect = cv.getBoundingClientRect(), x = (e as MouseEvent).clientX - rect.left, y = (e as MouseEvent).clientY - rect.top; const a = (x / rect.width * 180 - 88) / 2.85, b = (y / rect.height * 115 - 12) / 1.43; this.scene().focus({ x: Math.max(0, Math.min(29, (a + b) / 2)), y: Math.max(0, Math.min(25, (b - a) / 2)) }); });
  }
  private cost(cost: Partial<Resources>): string { return `<span class="cost">${Object.entries(cost).map(([r, n]) => `<span class="${this.rt.state.resources[r as keyof Resources] < n ? 'unaffordable' : ''}">${icon(resourceIcon[r as keyof Resources])}${n} ${RESOURCE_NAMES[r as keyof Resources]}</span>`).join('')}</span>`; }
  private panelHeader(kicker: string, title: string, sub: string): string { return `<div class="panel-heading"><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${sub}</p></div>`; }
  private buildPanel(): string {
    const s = this.rt.state;
    return shopPanel(s,this.category,this.thumbs,this.rt.placement,this.shopDetails);
  }
  private peoplePanel(): string {
    const s = this.rt.state;
    return this.panelHeader('THE LIVING KINGDOM', s.region?'People of Briar March':'People of Hearthmere', 'Every pair of hands keeps the beacon alive.') + `<div class="three-stats"><div><strong>${s.population}</strong><small>Villagers</small></div><div><strong>${idle(s)}</strong><small>Unassigned</small></div><div><strong class="${s.infection.length ? 'warning-text' : ''}">${s.infection.length}</strong><small>Infected</small></div></div><div class="section-label">WORK ASSIGNMENTS <span>${healthy(s)} healthy</span></div><div class="job-list">${JOBS.map(j => `<div class="job-row">${icon(j.icon)}<div><strong>${j.name}</strong><small>${s.jobs[j.id]} / ${jobCapacity(s, j.id)} assigned</small></div><button id="job-${j.id}-minus" data-job="${j.id}" data-delta="-1" aria-label="Unassign ${j.name.toLowerCase()}" ${s.jobs[j.id] <= 0 ? 'disabled' : ''}>−</button><b>${s.jobs[j.id]}</b><button id="job-${j.id}-plus" data-job="${j.id}" data-delta="1" aria-label="Assign ${j.name.toLowerCase()}" ${idle(s) < 1 || s.jobs[j.id] >= jobCapacity(s, j.id) ? 'disabled' : ''}>+</button></div>`).join('')}</div><div class="section-label">THE HOLLOWING <span>${s.infection.length ? 'Contain the fever' : 'Under control'}</span></div><div class="plague-card ${s.infection.length ? 'infected' : ''}">${icon('herb')}<div><h3>${s.infection.length ? `${s.infection.length} people need help` : 'A healthy hearth'}</h3><p>${s.infection.length ? `Next death risk in about ${Math.ceil(nextIllnessDeadline(s))} seconds at current health. Treatment prioritizes up to 3 urgent cases.` : 'Only a confirmed zombie bite causes infection. Bitten people stay human; treat confirmed illness before it becomes critical.'}</p></div></div><button id="treat" class="primary full" ${!s.infection.length || !canAfford(s, { herbs: 5, food: 8 }) ? 'disabled' : ''}>${icon('herb')} Treat the sick ${this.cost({ herbs: 5, food: 8 })}</button><button id="quarantine" class="secondary full ${s.quarantine ? 'selected' : ''}">${icon('shield')}${s.quarantine ? 'Lift quarantine' : 'Declare quarantine'}</button><p class="fine-print">Quarantine isolates infected residents, withdraws infected soldiers and slows their illness by 75%. Production falls 20%. Environmental taint cannot infect anyone.</p><button id="cleanse" class="text-button full" ${!s.buildings.some(b => b.kind === 'infirmary' && b.progress === 1) || !canAfford(s, { herbs: 8, wood: 10 }) ? 'disabled' : ''} title="Requires a completed Herbalist’s refuge, 8 herbs and 10 timber">Cleanse contaminated ground ${this.cost({ herbs: 8, wood: 10 })}</button><div class="tip-box">${icon('home')}<p><strong>${s.population} / ${capacity(s)} beds occupied</strong>Build cottages to welcome survivors at dawn. Recovered villagers need new assignments.</p></div>`;
  }
  private armyPanel(): string {
    return armyPanel(this.rt);
  }
  private territoryCard(id: TerritoryId): string {
    const t = TERRITORIES[id], s = this.rt.state, owned = s.owned.includes(id), locked = t.requirement && !s.owned.includes(t.requirement);
    return `<article class="territory-card"><div class="territory-top">${icon(id === 'pinewatch' ? 'wood' : id === 'greybank' ? 'crown' : 'herb')}<span class="tag ${owned ? 'owned' : ''}">${owned ? 'RECLAIMED' : locked ? 'UNREACHED' : 'UNCLAIMED'}</span></div><div class="eyebrow">${t.title}</div><h3>${t.name}</h3><p>${t.description}</p><div class="territory-actions"><button id="focus-${id}" class="text-button" data-focus="${id}">${icon('target')} View</button>${owned ? `<span class="owned-text">${icon('check')} Your banner flies</span>` : `<button id="claim-${id}" data-claim="${id}" class="secondary" ${locked || !canAfford(s, t.cost) || army(s).length < 4 || s.phase === 'night' || enemies(s).length ? 'disabled' : ''}>Reclaim ${icon('flag')}</button>`}</div>${!owned ? this.cost(t.cost) : ''}</article>`;
  }
  private territoriesPanel(): string { if(this.rt.state.region)return this.panelHeader('CONNECTED LAND','Briar March','Discover this land by exploring with your commander.')+'<p>Clearing the infected and founding an outpost secures this region. The original three marches are managed from Hearthmere.</p><button data-tab="empire" class="primary full">Open Empire</button>';return this.panelHeader('BEYOND THE PALISADE', 'The three marches', 'More land. More hope. More ground to defend.') + `<div class="tip-box compact">${icon('flag')}<p>Reclaim in daylight with at least 4 soldiers and no infected remaining.</p></div>` + (['pinewatch', 'greybank', 'fen'] as TerritoryId[]).map(id => this.territoryCard(id)).join(''); }
  private buildingPanel(b: Building): string {
    const d = BUILDINGS[b.kind], s = this.rt.state;
    return `<button class="back-button" id="clear-selection">← Back to kingdom</button>` + this.panelHeader('YOUR SETTLEMENT · LEVEL ' + b.level, d.name, d.subtitle) + `<div class="detail-art"><img alt="${escape(d.name)}" src="${this.thumbs[b.kind]}"/></div><p class="detail-description">${d.description}</p>${b.progress < 1 ? `<div class="crew-note">${constructionCrew(s, b.id)} builder${constructionCrew(s, b.id) === 1 ? '' : 's'} assigned · ${constructionCrew(s, b.id) ? 'crew working' : 'slow resident help only'}</div>` : ''}<div class="section-label">${b.progress < 1 ? 'UNDER CONSTRUCTION' : 'BUILDING HEALTH'}<span>${b.progress < 1 ? Math.floor(b.progress * 100) + '%' : `${Math.ceil(b.hp)} / ${b.maxHp}`}</span></div><div class="health-track"><i style="width:${b.progress < 1 ? b.progress * 100 : b.hp / b.maxHp * 100}%"></i></div><div class="detail-actions"><button id="edit-building" class="secondary full">Edit / Move building</button><button id="upgrade" class="primary full" ${b.level >= 3 || b.progress < 1 || !canAfford(s, upgradeCost(b)) ? 'disabled' : ''}>${icon('hammer')}${b.level >= 3 ? 'Fully upgraded' : 'Upgrade to level ' + (b.level + 1)}${b.level < 3 ? this.cost(upgradeCost(b)) : ''}</button><button id="repair" class="secondary full" ${b.hp >= b.maxHp || b.progress < 1 || !canAfford(s, repairCost(b)) ? 'disabled' : ''}>Repair building ${this.cost(repairCost(b))}</button></div><div class="tip-box">${icon('shield')}<p><strong>Invest in what you defend</strong>Upgrades restore health and increase durability${d.job ? ', worker capacity' : ''}${b.kind === 'tower' ? ', damage, and range' : ''}${b.kind === 'cottage' ? ', and housing' : ''}. Repairs require nearby ground to be clear of infected.</p></div>`;
  }
  private chroniclePanel(): string { return this.panelHeader('WORDS BY FIRELIGHT', 'The chronicle', 'A record of the kingdom you are becoming.') + `<div class="chronicle-list">${this.rt.state.logs.map(l => `<article class="log-${l.tone}"><span>${Math.floor(l.time / 60)}:${String(Math.floor(l.time % 60)).padStart(2, '0')}</span><p>${escape(l.text)}</p></article>`).join('')}</div>`; }
  render(): void {
    const s = this.rt.state, production = rates(s);
    if (this.patrol) this.patrol = this.patrol.filter(id => readyArmy(s).some(u => u.id === id));
    if (this.wasAway && !s.expedition) { this.tab = 'expedition'; this.panel.scrollTop = 0; this.patrol = null; }
    this.wasAway = !!s.expedition;
    if (s.expedition) this.lastOutcome = s.outcome;
    for (const r of Object.keys(production) as (keyof Resources)[]) { this.text(`resource-${r}`, String(Math.floor(s.resources[r]))); this.text(`rate-${r}`, `${production[r] >= 0 ? '+' : ''}${(production[r] * 60).toFixed(0)}/m`); document.querySelector(`#rate-${r}`)!.classList.toggle('negative', production[r] < 0); }
    document.querySelector('.resources')!.classList.toggle('show-supplies',this.tab==='people'||this.tab==='expedition'||!!s.expedition||production.food<0&&s.resources.food<120||s.infection.length>0);
    this.text('population', `${s.population} / ${capacity(s)}`);
    this.text('world-subtitle', s.outcome === 'won' ? 'Four banners. A valley reclaimed.' : s.phase === 'day' ? `Tonight: ${waveSize(s)} infected · ${s.owned.length} invasion ${s.owned.length === 1 ? 'front' : 'fronts'}` : `${enemies(s).length} attackers in the valley · ${s.waveRemaining} approaching`);
    this.text('day-label', `${s.phase === 'night' ? 'Night' : 'Day'} ${s.day}`);
    const remaining = Math.ceil((s.phase === 'day' ? DAY_LENGTH : NIGHT_LENGTH) - s.phaseTime);
    this.text('phase-label', `${s.phase === 'day' ? 'Daylight' : 'Hold fast'} · ${remaining}s to ${s.phase === 'day' ? 'dusk' : 'dawn'}`);
    this.html('day-icon', icon(s.phase === 'day' ? 'sun' : 'moon'));
    (document.querySelector('#day-progress') as HTMLElement).style.width = `${s.phaseTime / (s.phase === 'day' ? DAY_LENGTH : NIGHT_LENGTH) * 100}%`;
    document.querySelector('.day-card')!.classList.toggle('night', s.phase === 'night');
    this.text('save-status', this.rt.saveLabel); document.querySelector('#save-status')!.classList.toggle('warning-text', this.rt.saveError);
    this.text('hearth-status', s.infection.length ? `${s.infection.length} people need treatment` : s.phase === 'night' ? 'Hold until first light' : 'The beacon burns bright');
    this.text('time-status', s.speed === 0 ? 'Kingdom paused' : s.speed === 2 ? 'Time moves quickly' : 'Time is flowing');
    this.html('pause', icon(s.speed ? 'pause' : 'play')); document.querySelector('#pause')!.setAttribute('aria-label', s.speed ? 'Pause game' : 'Resume game');
    for (const speed of [1, 2]) document.querySelector(`#speed-${speed}`)!.classList.toggle('active', s.speed === speed);
    document.querySelector('#pause')!.classList.toggle('active', !s.speed);
    const next = OBJECTIVES.find(o => !s.completed.includes(o.id));
    const quarry = s.buildings.find(b => b.kind === 'quarry');
    const action = !s.completed.includes('build') ? quarry ? 'Assign builders' : 'Build Trading post' : quarry && s.jobs.miners < 3 ? 'Assign traders' : s.infection.length ? 'Treat sickness' : army(s).length < 5 ? 'Recruit soldiers' : !s.completed.includes('night') ? 'Position defense' : s.owned.length < 4 ? 'Review marches' : '';
    const guidance = action === 'Assign traders' ? 'Trading post needs workers. Open People and assign three traders.' : action === 'Assign builders' ? 'Builders finish your construction. Open People to check the crew.' : next?.detail ?? 'You have given the valley a future.';
    document.querySelector('.objectives-card')!.classList.toggle('combat', !!s.expedition || s.phase === 'night' || enemies(s).length > 0);
    this.html('objectives',s.region?`<h3>${s.march?.secured?'Hold Briar March':'A new foothold'}</h3><p>${s.march?.secured?'Build, staff and defend your settlement.':enemies(s).length+' infected remain. Explore with your commander, then found an outpost.'}</p><button id="tab-empire-objective" data-tab="empire" class="secondary">Empire →</button>`: s.expedition ? `<h3>${missionObjective(s.expedition)}</h3>` : `<h3>${next?.title ?? 'The kingdom endures'}</h3><p>${guidance}</p>${action && s.outcome === 'playing' && s.phase === 'day' && !enemies(s).length ? `<button id="next-action" class="secondary">${action} →</button>` : ''}<div class="milestone-dots">${OBJECTIVES.map(o => `<i class="${s.completed.includes(o.id) ? 'done' : next?.id === o.id ? 'current' : ''}" title="${o.title}"></i>`).join('')}</div>`);
    this.text('objective-count', s.expedition ? 'Bring your soldiers home' : `${s.completed.length} / 5 milestones`);
    for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) { b.classList.toggle('active', b.dataset.tab === this.tab && !this.rt.selection); b.setAttribute('aria-pressed', String(b.classList.contains('active'))); }
    let html: string;
    if (s.expedition || this.tab === 'expedition') html = expeditionPanel(s, (this.patrol ?? defaultPatrol(s)).filter(id => readyArmy(s).some(u => u.id === id)), this.approach)+(s.expedition?armyPanel(this.rt):'');
    else if (this.rt.selection?.type === 'building') { const b = s.buildings.find(b => b.id === (this.rt.selection as { id: number }).id); if (b) html = this.buildingPanel(b); else { this.rt.selection = null; html = this.buildPanel(); } }
    else if (this.rt.selection?.type === 'territory') html = `<button class="back-button" id="clear-selection">← Back to kingdom</button>` + this.panelHeader('BEYOND THE PALISADE', 'A new frontier', 'Where your banner flies, your people follow.') + this.territoryCard(this.rt.selection.id);
    else if (this.rt.selection?.type === 'army' || this.tab === 'army') html = this.armyPanel();
    else if(this.tab==='empire')html=empirePanel(this.rt);
    else if (this.tab === 'people') html = this.peoplePanel()+plagueDetails(s);
    else if (this.tab === 'territories') html = this.territoriesPanel();
    else if (this.tab === 'chronicle') html = this.chroniclePanel();
    else html = this.buildPanel();
    if (html !== this.lastHtml && document.activeElement?.id !== 'squad-name') { const focused = this.panel.contains(document.activeElement) ? document.activeElement?.id : null; this.panel.innerHTML = html; this.lastHtml = html; if (focused) document.getElementById(focused)?.focus({ preventScroll: true }); }
    document.querySelector('#app')!.classList.toggle('targeting',this.rt.rallyMode||this.rt.editingId!==null);
    document.querySelector('#app')!.classList.toggle('commander-mode',this.rt.heroMode);document.querySelector('#hero-pad')?.classList.toggle('hidden',!this.rt.heroMode||!!s.expedition);
    const placement = document.querySelector('#placement-bar')!; placement.classList.toggle('hidden', !this.rt.placement && !this.rt.rallyMode);
    if (this.rt.placement || this.rt.rallyMode) {
      const point = this.rt.placementPreview, error = point && this.rt.placement ? this.rt.placementError(point) : null;
      const content = `${icon(this.rt.rallyMode ? 'flag' : 'hammer')}<span>${this.rt.rallyMode ? (this.rt.orderMode??'move').toUpperCase()+' · '+(this.rt.selectedIds.length||'All')+' soldiers · choose target' : `${this.rt.editingId!==null?'Moving':'Placing'} ${BUILDINGS[this.rt.placement!].name}`}${point ? `<small>${error ?? (this.rt.editingId!==null?'Valid move · no cost':'Ready to build')}</small>` : ''}</span>${point ? `<button class="primary" id="confirm-placement" ${error ? 'disabled' : ''}>${this.rt.editingId!==null?'Confirm move':'Build here'}</button>` : ''}${this.rt.placement&&isBarrier({kind:this.rt.placement})?`<button id="rotate-placement" title="Two grid axes; walls join adjacent segments">Rotate ↻ <small>${this.rt.placementRotation?'↙ ↗':'↖ ↘'} · R</small></button>`:''}<button id="cancel-placement">Cancel <kbd>Esc</kbd></button>`;
      if (placement.innerHTML !== content) placement.innerHTML = content;
    }
    const reward=document.querySelector('#bounty-feedback')!;reward.textContent=this.rt.bountyFeedback;reward.classList.toggle('hidden',performance.now()>this.rt.bountyFeedbackUntil);
    const toast = document.querySelector('#toast')!; toast.className = `toast ${this.rt.messageTone} ${performance.now() > this.rt.messageUntil ? 'hidden' : ''}`; if (toast.textContent !== this.rt.message) toast.textContent = this.rt.message;
    const alert = document.querySelector('#alert-banner')!;
    const threats = enemies(s).length, turning = s.infection.length ? Math.ceil(nextIllnessDeadline(s)) : 0;
    this.text('world-hint',this.rt.heroMode?'WASD / pad · F / Strike · 1–3 weapons · Esc tactics':'Drag to explore · Scroll to zoom · Right-click to rally');
    const warning = [s.march?.warning?'Eastern incursion in '+Math.ceil(s.march.warning)+'s · defend the old watch':'',production.food<0&&s.resources.food<Math.max(30,-production.food*60)?'Provisions running low · assign farmers in People':'',(s.corpses??[]).some(c=>c.tainted)?'Infected remains · use the Herbalist’s refuge to stop them rising':'', threats ? `${threats} attackers · ${s.waveRemaining} approaching` : '', s.infection.length ? `${s.infection.length} infected · next death risk ≈ ${turning}s` : '', !threats && !s.infection.length && !s.region && s.phase === 'day' && remaining < 16 ? 'Dusk approaches. Position your army and check your defenses.' : ''].filter(Boolean).join(' / ');
    const alertHtml = `${warning ? `<span>${escape(warning)}</span>` : ''}${s.infection.length||(s.corpses??[]).some(c=>c.tainted) ? '<button id="alert-people">Contain in People →</button>' : ''}`;
    if (!s.expedition) { alert.classList.toggle('hidden', !warning); this.html('alert-banner', alertHtml); }
    if (s.logs[0]?.id !== this.lastLog) { this.lastLog = s.logs[0]?.id ?? 0; if (s.logs[0]?.tone === 'danger' && this.rt.ready) this.beep('warn'); }
    if (s.expedition) {
      const e = s.expedition;
      for (const r of Object.keys(production)) this.text(`rate-${r}`, 'held');
      this.text('world-title', 'Broken Standard'); this.text('world-subtitle', 'Lost Battalions · kingdom time held');
      this.text('day-label', 'Expedition'); this.text('phase-label', Math.floor(e.world.time) + 's in the pass');
      this.text('hearth-status', 'Your home watch is holding');
      const plague=e.world.infection.length?e.world.infection.length+' infected allies · use packed herbs / ':'';
      const message = plague + (e.warning > 0 ? 'Ambush in ' + Math.ceil(e.warning) + 's · protect your bowmen' : enemies(e.world).length || e.pending?.length ? enemies(e.world).length + ' infected · ' + (e.pending?.length ?? 0) + ' approaching' : e.world.corpses?.some(c=>c.tainted)?'Infected remains rising · keep watch':'');
      alert.classList.toggle('hidden', !message); this.html('alert-banner', escape(message));
    } else {this.text('world-title',s.region?'Briar March':'Hearthmere');if(s.region){this.text('world-subtitle',s.march?.secured?'Your outpost · '+enemies(s).length+' threats':'Explore · clear infected · establish an outpost');this.text('day-label','Briar March');this.text('phase-label',s.march?.secured?'Incursions from the east':'Clear the three landmarks');}}
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-tab]')) { b.disabled = !!s.expedition; if (s.expedition) b.classList.toggle('active', b.dataset.tab === 'army'); }
    this.drawMinimap();
    if (s.outcome !== 'playing' && this.lastOutcome !== s.outcome && this.rt.ready) { this.lastOutcome = s.outcome; this.ending(); this.rt.persist(); }
  }
  private text(id: string, value: string): void { const el = document.getElementById(id)!; if (el.textContent !== value) el.textContent = value; }
  private html(id: string, value: string): void { if (this.htmlCache.get(id) !== value) { document.getElementById(id)!.innerHTML = value; this.htmlCache.set(id, value); } }
  private drawMinimap(): void {
    const c = document.querySelector<HTMLCanvasElement>('#minimap')!.getContext('2d')!, s = this.rt.world;
    c.clearRect(0, 0, 180, 115);
    for (const t of tilesFor(s)) { const x = 88 + (t.x - t.y) * 2.85, y = 12 + (t.x + t.y) * 1.43; c.fillStyle = t.terrain === 'water' ? '#456b71' : t.territory !== 'wild' && s.owned.includes(t.territory) ? '#a2a77c' : '#4d685a'; c.beginPath(); c.moveTo(x, y - 1.5); c.lineTo(x + 3, y); c.lineTo(x, y + 1.5); c.lineTo(x - 3, y); c.fill(); }
    if (!s.theatre && !s.region && (s.phase === 'night' || s.phaseTime > 45)) for (const id of s.owned) { const p = TERRITORIES[id].route; c.fillStyle = '#f5b07b'; c.beginPath(); c.arc(88 + (p.x - p.y) * 2.85, 12 + (p.x + p.y) * 1.43, 3.5, 0, Math.PI * 2); c.fill(); }
    if (this.rt.state.expedition?.warning || this.rt.state.expedition?.pending?.length) for (const p of ambushFronts(this.rt.state.expedition!)) { c.fillStyle = '#f5b07b'; c.beginPath(); c.arc(88 + (p.x - p.y) * 2.85, 12 + (p.x + p.y) * 1.43, 3.5, 0, Math.PI * 2); c.fill(); }
    if(s.region&&s.march?.warning){c.fillStyle='#ffb179';c.beginPath();c.arc(88+(27-9)*2.85,12+(27+9)*1.43,5,0,Math.PI*2);c.fill();}
    for (const b of s.buildings) { c.fillStyle = '#ede0b6'; c.fillRect(87 + (b.x - b.y) * 2.85, 11 + (b.x + b.y) * 1.43, 2, 2); }
    const infected=new Set(s.infection.map(i=>i.personId));
    for(const p of [...s.units,...(s.residents??[])])if(infected.has(p.id)){c.strokeStyle='#e7dd75';c.lineWidth=1.5;c.beginPath();c.arc(88+(p.x-p.y)*2.85,12+(p.x+p.y)*1.43,4,0,Math.PI*2);c.stroke();}
    for(const p of s.corpses??[])if(p.tainted){c.strokeStyle='#ffaf7d';c.lineWidth=2;c.beginPath();c.arc(88+(p.x-p.y)*2.85,12+(p.x+p.y)*1.43,3,0,Math.PI*2);c.stroke();}
    for (const u of s.units) { c.fillStyle = isFriendly(u) ? u.origin === 'battalion' ? '#e4ca88' : '#97c5d0' : '#ec9e7f'; c.fillRect(87 + (u.x - u.y) * 2.85, 11 + (u.x + u.y) * 1.43, 2.5, 2.5); }
  }
  private restoreModal(): void { if (!this.modalPaused) return; this.modalPaused = false; if (this.rt.ready && (this.rt.state.outcome === 'playing' || this.rt.state.expedition)) this.rt.state.speed = this.restoreSpeed; }
  private closeModal(): void { this.restoreModal(); this.dialog.close(); }
  private showModal(html: string): void { if (!this.dialog.open) { this.restoreSpeed = this.rt.state.speed; this.modalPaused = true; this.rt.state.speed = 0; } this.dialog.innerHTML = html; if (!this.dialog.open) this.dialog.showModal(); }
  private onboard(): void {
    this.showModal(`<div class="intro-crest">${icon('crown')}</div><div class="eyebrow">KINGNAMIC · CHAPTER I</div><h2>${this.rt.loaded ? 'The hearth remembers.' : 'A kingdom worth defending.'}</h2><p class="modal-lead">${this.rt.loaded ? 'Your people kept the beacon burning. Return to Hearthmere and finish what you began.' : 'The Hollowing has silenced the old kingdoms. In one sheltered valley, a few still gather around the fire. Their future is in your hands.'}</p><div class="intro-steps"><div>${icon('hammer')}<strong>Build a home</strong><p>Assign workers. Gather supplies. Fortify your settlement.</p></div><div>${icon('shield')}<strong>Hold the night</strong><p>Recruit wardens and rangers. Defend the river crossing.</p></div><div>${icon('flag')}<strong>Reclaim the vale</strong><p>Secure three marches and survive five nights.</p></div></div><div class="intro-note">${icon('sun')}A chapter lasts about 9 minutes. Pause whenever you need.</div>${this.rt.message ? `<p class="load-message">${escape(this.rt.message)}</p>` : ''}<button class="primary intro-start" id="start">${this.rt.loaded ? 'Resume kingdom' : 'Light the beacon'}${icon('arrow')}</button><span class="modal-footnote">Original world · Offline saves · No accounts</span>`);
  }
  private guide(): void {
    this.showModal(`<button id="close-dialog" class="modal-close" aria-label="Close guide">${icon('close')}</button><div class="eyebrow">THE HEARTHKEEPER’S COMPANION</div><h2>Field guide</h2><div class="guide-grid"><section><h3>A strong beginning</h3><p>Timber builds homes, workplaces and palisades. Crowns fund recruitment and upgrades. Build a Trading post and assign 3 traders in People. Recruit two more soldiers in Army → Recruit. Build a Herbalist’s refuge and assign a healer before the second dawn.</p><h3>Surviving the Hollowing</h3><p>A confirmed zombie bite causes the Hollowing. Infected residents stop working. At 18 seconds symptoms appear; untreated illness can kill by 75 seconds of disease progression, and critical wounds can kill sooner. Only infected remains rise after 8 seconds. Ordinary wounds, proximity, ground and supplies do not spread infection. Infected people remain human and treatable. A death can reanimate only after confirmed infection and an eight-second corpse delay. Treat up to three for 5 herbs + 8 food, or quarantine to slow illness.</p><h3>Lead beyond the valley</h3><p>In Empire, appoint an existing soldier as commander. Choose a company in the Army roster and gather at the southern road. Briar March is free to explore. Clear its infected pockets, then bring two fit soldiers and two idle home residents to found an outpost for 80 Timber and 40 Crowns. Lead personally with WASD and F, or use tactical orders. Other settlements retain their defenders and share upkeep; their encounters hold while you are away.</p><h3>Expansion has a price</h3><p>Every credited infected kill pays Crowns: 1 Hollow, 2 runner, 3 brute, with no daily cutoff. Expedition encounter slots pay once across all visits; reanimated people pay none. Rewards appear over the battlefield and in the chronicle. With four soldiers, reclaim the marches during peaceful daylight. New resources and survivors arrive, but the next wave can attack from the new frontier. Add towers and move troops to cover it.</p></section><section><h3>Know your ground</h3><p>Each builder advances one construction project; the crew is shared between active sites. Scouts show tonight’s wave size below the kingdom name; orange minimap markers show its possible entry points. Wardens protect fragile rangers, whose damage falls at point-blank range. Spearmen punish runners; scouts evade nearby threats close to their rally ground. Shield line gives nearby wardens extra armor. Highlands strengthen rangers. Marshes slow movement. Walls divert enemies; gates let allies through across their opening. Select a building and Edit / Move to rearrange it for free during peace. Drag or tap a destination, then Confirm move; Cancel keeps the original. Rotate palisades and gates with R or Rotate. Walls connect to adjacent grid cells, including corners. Use stepped grid runs for diagonal perimeters.</p><h3>Command your kingdom</h3><dl><dt>Pan / zoom</dt><dd>Drag / scroll</dd><dt>Move camera</dt><dd>WASD / arrows</dd><dt>Pause / resume</dt><dd>Space</dd><dt>Build / rally</dt><dd>B / R</dd><dt>Rally directly</dt><dd>Right-click</dd><dt>Center / cancel</dt><dd>H / Esc</dd></dl><p>On touch screens, drag the map and use +/− to zoom. Tap a building site to preview it, then tap “Build here” to confirm. Tap “Set rally point” before choosing ground. Move orders take priority; guards return to protect a breached Hearth.</p></section></div><div class="guide-settings"><button class="secondary" id="sound-toggle">${this.sound ? 'Sound on' : 'Sound off'}</button><button class="text-button danger" id="reset-request">Start a new kingdom</button></div><p class="fine-print">Saves every 12 seconds while time runs, when leaving the tab, and on request. This device only. No progress passes while you are away.</p>`);
  }
  private confirmReset(): void { this.showModal(`<div class="eyebrow">A NEW CHAPTER</div><h2>Begin again?</h2><p class="modal-lead">This replaces your current kingdom and its progress on this device. Your old realm will remain in the recovery backup until the next save.</p><div class="confirm-actions"><button id="close-dialog" class="secondary">Keep my kingdom</button><button id="reset-confirm" class="primary">Start a new kingdom</button></div>`); }
  private ending(): void { const s = this.rt.state, won = s.outcome === 'won'; this.showModal(`<div class="intro-crest">${icon(won ? 'crown' : 'shield')}</div><div class="eyebrow">${won ? 'CHAPTER COMPLETE' : 'THE BEACON HAS FALLEN'}</div><h2>${won ? 'From a hearth, a kingdom.' : 'Even embers remember.'}</h2><p class="modal-lead">${won ? 'Five nights endured. Three marches reclaimed. The valley speaks your kingdom’s name, and for the first time, it speaks with hope.' : 'The Hollow reached the Last Hearth. A stronger line, more towers, and a watchful herbalist may change the next chapter.'}</p><div class="three-stats"><div><strong>${s.stats.nights}</strong><small>Nights held</small></div><div><strong>${s.stats.slain}</strong><small>Hollow defeated</small></div><div><strong>${s.stats.lost}</strong><small>Lives lost</small></div></div><div class="confirm-actions"><button class="secondary" id="close-dialog">Survey the kingdom</button>${won?'<button class="primary" id="continue-watch">Continue the watch</button>':'<button class="primary" id="reset-request">Begin a new chapter</button>'}</div>`); }
  private beep(kind: 'click' | 'build' | 'warn'): void { if (!this.sound) return; try { this.audio ??= new AudioContext(); void this.audio.resume(); const o = this.audio.createOscillator(), g = this.audio.createGain(); o.connect(g); g.connect(this.audio.destination); o.type = 'sine'; o.frequency.value = kind === 'warn' ? 165 : kind === 'build' ? 440 : 330; g.gain.setValueAtTime(0.025, this.audio.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.audio.currentTime + 0.16); o.start(); o.stop(this.audio.currentTime + 0.17); } catch { this.sound = false; } }
}
