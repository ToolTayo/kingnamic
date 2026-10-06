import { STEP } from './config';
import {relocationError} from './relocation';
import {barrierIndex,barrierRotation} from './barriers';
import {buildError} from './commands';
import { command } from './commands';
import { load, save } from './persistence';
import { step } from './simulation';
import { army, newGame } from './state';
import { commandableIds, ORDER_NAMES } from './army';
import type { ArmyOrder, BuildingKind, Command, CommandResult, Point, State, TerritoryId } from './types';
// Access the browser property inside the storage boundary: private/blocked
// storage can throw even when merely reading window.localStorage.
const storage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
  removeItem: (key: string) => window.localStorage.removeItem(key),
};
export type Selection = { type: 'building'; id: number } | { type: 'territory'; id: TerritoryId } | { type: 'army' } | null;
export class Runtime {
  state: State;
  selection: Selection = null;
  placement: BuildingKind | null = null;
  placementPreview: Point | null = null;
  editingId:number|null=null;
  placementRotation:0|1=0;
  bountyFeedback='';bountyFeedbackUntil=0;
  cancelPlacement():void {this.placement=null;this.placementPreview=null;this.editingId=null;}
  beginEdit(id:number):void {const b=this.world.buildings.find(v=>v.id===id);if(!b)return;this.heroMode=false;this.rallyMode=false;this.orderMode=null;this.editingId=id;this.placement=b.kind;this.placementRotation=barrierRotation(b,barrierIndex(this.world.buildings));this.placementPreview={x:b.x,y:b.y};this.notify('Drag or tap a destination. The original stays in place until Confirm move.');this.onChange();}
  placementError(p:Point):string|null {return this.editingId!==null?relocationError(this.world,this.editingId,p.x,p.y,['wall','gate'].includes(this.placement!)?this.placementRotation:undefined):this.placement?buildError(this.world,this.placement,p.x,p.y,['wall','gate'].includes(this.placement)?this.placementRotation:undefined):null;}
  confirmPlacement():void {const p=this.placementPreview,kind=this.placement;if(!p||!kind)return;const rotation=['wall','gate'].includes(kind)?this.placementRotation:undefined;const r=this.act(this.editingId!==null?{type:'relocate',id:this.editingId,...p,rotation}:{type:'build',kind,...p,rotation});if(r.ok){if(this.editingId===null)this.persist();this.placementPreview=null;if(this.editingId!==null||kind!=='wall')this.cancelPlacement();}this.onChange();}

  rallyMode = false;
  selectedIds: number[] = [];
  orderMode: ArmyOrder | null = null;
  multiSelect = false;
  heroMode=false; heroWalk:Point={x:0,y:0}; heroAttack=false; heroAim?:Point; heroTouchWalk?:Point;heroTouchAttack=false;heroTap=false;
  rosterPage = 0;
  armyView:'orders'|'recruit'|'squads'|'roster'='orders';
  squadName = '';
  inspectedPersonId: number | null = null;
  orderFeedbackUntil = 0;
  ready = false;
  loaded = false;
  message = '';
  messageTone: 'info' | 'good' | 'warn' = 'info';
  messageUntil = 0;
  saveLabel = 'Not saved yet';
  saveError = false;
  fps = 0;
  private accumulator = 0;
  private autosave = 0;
  onChange: () => void = () => {};
  onSound: (kind: 'click' | 'build' | 'warn') => void = () => {};
  constructor() {
    const loaded = load(storage); this.state = loaded.state ?? newGame(); this.loaded = !!loaded.state;
    this.message = loaded.message;
    if (this.loaded) this.saveLabel = 'Saved kingdom found';
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.ready) this.persist(); this.accumulator = 0; });
    window.addEventListener('blur',()=>{this.heroWalk={x:0,y:0};this.heroAttack=false;});
    window.addEventListener('pagehide', () => { if (this.ready) this.persist(); });
  }
  get world(): State { return this.state.expedition?.world ?? this.state; }
  selectUnits(ids: number[], toggle = false): void {
    this.cancelPlacement();
    if(!toggle)this.armyView='orders';
    const valid = new Set(army(this.world).filter(u=>u.origin!=='battalion').map(u=>u.id));
    const chosen = new Set(toggle ? this.selectedIds : []);
    for (const id of ids) if(valid.has(id)) { if(toggle&&chosen.has(id)) chosen.delete(id); else chosen.add(id); }
    this.selectedIds = [...chosen].filter(id=>valid.has(id)); this.orderMode=null;this.rallyMode=false;this.selection = {type:'army'}; this.onChange();
  }
  selectAvailable(): void { this.selectUnits(commandableIds(this.world)); }
  private issueOrder(order: ArmyOrder, point?:Point, focus?:number):CommandResult {
    const ids=commandableIds(this.world,this.selectedIds.length?this.selectedIds:undefined);
    const excluded=this.selectedIds.length?this.selectedIds.length-ids.length:0;
    if(!ids.length){const r={ok:false,message:'No selected soldiers are available. Let injuries recover or treat quarantined infections.'};this.notify(r.message,'warn');this.onChange();return r;}
    // Visible-body targeting may pass a Unit. Copy coordinates only, so its
    // own order cannot override the player's Escort/Attack command.
    const r=this.act({type:'order',order,ids,x:point?.x,y:point?.y,focus});
    if(r.ok){this.orderFeedbackUntil=performance.now()+3500;if(excluded)this.notify(`${r.message} ${excluded} recovering or isolated soldiers kept their assignments.`,'good');}
    return r;
  }
  beginOrder(order: ArmyOrder): void {
    this.cancelPlacement();
    this.heroMode=false;
    if(!this.selectedIds.length) { this.notify('Select soldiers in the roster or on the map first.','warn');return; }
    if(['hold','retreat','regroup'].includes(order)) { this.orderMode=null;this.rallyMode=false;this.issueOrder(order);return; }
    this.orderMode=order;this.rallyMode=true;this.placement=null;
    this.notify(`${ORDER_NAMES[order]}: choose ${order==='escort'?'an allied soldier':order==='attack'?'an enemy or ground':'ground'} for ${this.selectedIds.length} selected soldiers.`);this.onChange();
  }
  orderAt(point: Point, focus?: number): void {
    const r=this.issueOrder(this.orderMode??'move',point,focus);
    if(r.ok){this.rallyMode=false;this.orderMode=null;}this.onChange();
  }
  act(c: Command): CommandResult {
    const r = command(this.state, c);
    if(r.ok&&c.type==='relocate')this.persist();
    if (r.ok && (c.type.startsWith('expedition-')||c.type==='travel'||c.type==='home-watch')) { this.heroMode=false;this.heroWalk={x:0,y:0};this.heroAttack=false;this.heroTap=false;this.heroTouchAttack=false;this.heroTouchWalk=undefined;this.heroAim=undefined;this.cancelPlacement();this.selection = null; this.selectedIds=[]; this.orderMode=null; this.placement = null; this.rallyMode = false; this.persist(); }
    this.notify(r.message, r.ok ? 'good' : 'warn'); this.onSound(r.ok ? c.type === 'build' ? 'build' : 'click' : 'warn'); this.onChange(); return r;
  }
  notify(message: string, tone: 'info' | 'good' | 'warn' = 'info'): void { this.message = message; this.messageTone = tone; this.messageUntil = performance.now() + 4500; }
  tick(delta: number): void {
    if (!this.ready || document.hidden || !this.state.speed || this.state.outcome === 'lost') return;
    this.accumulator += Math.min(delta / 1000, 0.25) * this.state.speed;
    const bountyBefore=this.state.bountyTotal??0;
    const wasAway = !!this.state.expedition;
    let stepped=false;
    while (this.accumulator >= STEP) { step(this.state,STEP,this.heroMode&&!this.placement&&!this.rallyMode&&!this.state.expedition?{walk:this.heroWalk,attack:this.heroAttack||this.heroTap,aim:this.heroAim}:undefined); this.heroTap=false;stepped=true;this.accumulator -= STEP; if (!this.state.speed) { this.accumulator = 0; break; } }
    if(this.heroMode&&!this.world.units.some(u=>u.id===this.state.commander?.id&&u.hp>0)){this.heroMode=false;this.heroTap=false;this.heroAttack=false;this.heroTouchAttack=false;this.heroTouchWalk=undefined;this.heroWalk={x:0,y:0};this.notify('Your commander has fallen. Appoint a survivor in Empire, or return to the home watch if the company is lost.','warn');this.onChange();}
    if(stepped&&this.selectedIds.length){const alive=new Set(army(this.world).map(u=>u.id));this.selectedIds=this.selectedIds.filter(id=>alive.has(id));if(!this.selectedIds.length){this.orderMode=null;this.rallyMode=false;}}
    if (wasAway && !this.state.expedition) { this.selection = null; this.selectedIds=[]; this.orderMode=null; this.rallyMode = false; this.persist(); this.onChange(); }
    const earned=(this.state.bountyTotal??0)-bountyBefore;if(earned>0){this.bountyFeedback='+'+earned+' Crowns · infected defeated';this.bountyFeedbackUntil=performance.now()+3000;this.onChange();}
    this.autosave += delta / 1000;
    if (this.autosave >= 12) { this.autosave = 0; this.persist(); }
  }
  persist(): void { const r = save(storage, this.state); this.saveLabel = r.ok ? 'Saved on this device' : 'Save unavailable'; this.saveError = !r.ok; if (!r.ok) this.notify(r.message, 'warn'); }
  reset(): void {this.cancelPlacement();this.heroMode=false;this.heroWalk={x:0,y:0};this.heroTouchWalk=undefined;this.heroAttack=false; this.selectedIds=[];this.orderMode=null;this.rosterPage=0;this.state = newGame(); this.selection = null; this.placement = null; this.placementPreview = null; this.rallyMode = false; this.ready = true; this.accumulator = 0; this.autosave = 0; this.persist(); this.onChange(); }
}
