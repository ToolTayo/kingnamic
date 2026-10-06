import {barrierIndex,barrierMask,isBarrier} from '../game/barriers';
import Phaser from 'phaser';
import { BUILDINGS, JOBS, MAP_W, TERRITORIES } from '../game/config';
import { CivilianSystem } from '../game/civilians';
import { distance, tileAt, tilesFor } from '../game/map';
import type { Runtime } from '../game/runtime';
import { isFriendly } from '../game/state';
import type { Point, State, TerritoryId } from '../game/types';
import { buildingArt, barrierArt, iso, sceneryArt, terrainArt, unitArt, uniso } from './art';
import { missionRoute } from '../game/expedition';
import { ambushFronts } from '../game/encounters';
import { indexActorsByScreenY, obscuresActor } from './visibility';
import {LANDMARKS,ROAD_EXIT} from '../game/empire';
import { SQUAD_COLORS } from '../game/army';
import { pickSoldier } from './battlefield';
export class WorldScene extends Phaser.Scene {
  private rt: Runtime;
  private landscape?:Phaser.GameObjects.Image;private terrainRegion='';
  private buildings = new Map<number, Phaser.GameObjects.Image>();
  private units = new Map<number, Phaser.GameObjects.Image>();
  private workers = new Map<number, Phaser.GameObjects.Image>();
  private actorDensity = new Map<number, number>();
  readonly civilians = new CivilianSystem();
  private health = new Map<number, { hp: number; until: number }>();
  private renderedState?: State;
  private scenery: { tile: Point; sprite: Phaser.GameObjects.Image; height: number; width: number }[] = [];
  private rewards=new Map<number,Phaser.GameObjects.Text>();
  private fallen = new Map<number, Phaser.GameObjects.Image>();
  private remains = new Map<number, Phaser.GameObjects.Image>();
  private ground!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private borders!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Rectangle;
  private hover!: Phaser.GameObjects.Graphics;
  private ghost?: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private labelSignature = '';
  private hoverTile: Point | null = null;
  private dragStart: Point | null = null;
  private dragged = false;
  private boxSelecting = false;
  private boxEnd: Point | null = null;
  private pinchDistance = 0;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private lastDraw = 0;
  constructor(rt: Runtime) { super('valley'); this.rt = rt; }
  create(): void {

    for (const kind of Object.keys(BUILDINGS)) this.textures.addCanvas(`building-${kind}`, buildingArt(kind as keyof typeof BUILDINGS));
    for(let mask=1;mask<16;mask++)this.textures.addCanvas('barrier-'+mask,barrierArt(mask));
    for(const mask of [3,12])this.textures.addCanvas('gate-'+mask,barrierArt(mask,true));
    for (const kind of ['warden', 'ranger', 'spearman', 'scout', 'hollow', 'runner', 'brute', ...JOBS.map(j => j.id), 'idle']) for (let frame = 0; frame < 7; frame++) this.textures.addCanvas(`unit-${kind}-${frame}`, unitArt(kind, frame));

    for (const kind of ['forest', 'rock', 'marsh'] as const) for (let n = 0; n < (kind === 'forest' ? 2 : 1); n++) this.textures.addCanvas(`scenery-${kind}-${n}`, sceneryArt(kind, n));
    this.syncTerrain();
    this.borders = this.add.graphics().setDepth(-90);
    this.ground = this.add.graphics().setDepth(-80);
    this.overlay = this.add.graphics().setDepth(3000);
    this.hover = this.add.graphics().setDepth(3100);
    this.night = this.add.rectangle(0, 0, 4000, 3000, 0x12263f, 0).setOrigin(0).setScrollFactor(0).setDepth(3500);
    this.cameras.main.setBackgroundColor('#61776b');
    this.cameras.main.setBounds(50, 0, 1820, 1050);
    this.home();
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { const touches=this.input.manager.pointers.filter(q=>q.isDown&&q.wasTouch);if(touches.length>=2){this.pinchDistance=Phaser.Math.Distance.Between(touches[0].x,touches[0].y,touches[1].x,touches[1].y);this.dragStart=null;this.dragged=true;return;}this.dragStart = { x: p.x, y: p.y }; this.dragged = false; this.boxSelecting=!!(p.event as MouseEvent).shiftKey&&!this.rt.placement;this.boxEnd=null; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const touches=this.input.manager.pointers.filter(q=>q.isDown&&q.wasTouch);
      if(touches.length>=2){const a=touches[0],b=touches[1],d=Phaser.Math.Distance.Between(a.x,a.y,b.x,b.y);if(this.pinchDistance>1)this.zoom(this.cameras.main.zoom*(d/this.pinchDistance-1),{x:(a.x+b.x)/2,y:(a.y+b.y)/2});this.pinchDistance=d;this.dragged=true;return;}
      const wp = this.cameras.main.getWorldPoint(p.x, p.y), t = uniso(wp.x, wp.y); this.hoverTile = { x: Math.round(t.x), y: Math.round(t.y) };this.rt.heroAim={x:t.x,y:t.y};
      if(this.rt.editingId!==null&&p.isDown){this.rt.placementPreview=this.hoverTile;this.rt.onChange();return;}
      if (p.isDown && this.dragStart && (this.dragged || Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 7)) {
        this.dragged = true;
        if(this.boxSelecting)this.boxEnd={x:p.x,y:p.y};
        else {this.cameras.main.scrollX -= (p.x - p.prevPosition.x) / this.cameras.main.zoom; this.cameras.main.scrollY -= (p.y - p.prevPosition.y) / this.cameras.main.zoom;}
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if(this.pinchDistance){this.pinchDistance=0;this.dragStart=null;this.dragged=true;this.boxEnd=null;return;}
      if(this.dragged&&this.boxSelecting&&this.dragStart){const a=this.dragStart;this.rt.selectUnits(this.rt.world.units.filter(u=>{const t=this.screenPoint(u);return isFriendly(u)&&t.x>=Math.min(a.x,p.x)&&t.x<=Math.max(a.x,p.x)&&t.y>=Math.min(a.y,p.y)&&t.y<=Math.max(a.y,p.y);}).map(u=>u.id));}
      if (!this.dragged && this.rt.ready) { const wp = this.cameras.main.getWorldPoint(p.x, p.y); this.choose(uniso(wp.x, wp.y), p.rightButtonReleased(), p.wasTouch,!!(p.event as MouseEvent).shiftKey,{x:p.x,y:p.y}); }
      this.dragStart = null;this.boxEnd=null;
    });
    this.input.on('pointerupoutside',()=>{this.dragStart=null;this.boxEnd=null;this.pinchDistance=0;this.dragged=true;});
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoom(dy > 0 ? -0.08 : 0.08, p));
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,F,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    this.scale.on('resize', (_game: Phaser.Structs.Size, _base: Phaser.Structs.Size, _display: Phaser.Structs.Size, previousWidth: number, previousHeight: number) => {
      // Phaser resizes the camera before this listener. Preserve the old world
      // center so rotation or a resized panel does not jump away from the town.
      const cam = this.cameras.main;
      cam.centerOn(cam.scrollX + previousWidth / 2, cam.scrollY + previousHeight / 2);
      this.night.setSize(this.scale.width, this.scale.height);
    });
    this.game.canvas.setAttribute('aria-label', 'Hearthmere isometric world. Drag to pan, scroll to zoom, select a building or use the command panel.');
    this.game.canvas.setAttribute('role', 'img');
    this.game.canvas.setAttribute('data-testid', 'world-canvas');
    this.updateBorders();
  }
  private syncTerrain():void{
    const region=this.rt.world.region??'home';if(this.terrainRegion===region)return;
    this.terrainRegion=region;this.landscape?.destroy();if(this.textures.exists('valley'))this.textures.remove('valley');
    this.textures.addCanvas('valley',terrainArt(tilesFor(this.rt.world),region==='march'));this.landscape=this.add.image(0,0,'valley').setOrigin(0).setDepth(-100);
    for(const prop of this.scenery)prop.sprite.destroy();
    this.scenery = tilesFor(this.rt.world).filter(t=>t.terrain==='forest'||t.terrain==='rock'||t.terrain==='marsh'&&t.variant>.65).map(t => {
      const p = iso(t.x, t.y), tree = t.terrain === 'forest', scale = tree ? .75 + t.variant * .5 : 1;
      const sprite = this.add.image(p.x + (tree ? (t.variant - .5) * 18 : 0), p.y + 4, `scenery-${t.terrain}-${tree && t.variant > .8 ? 1 : 0}`).setOrigin(.5, .8).setScale(scale).setDepth(p.y + 4);
      return { tile: t, sprite, height: tree ? 60 * scale : 26, width: tree ? 22 * scale : 18 };
    });

    this.renderedState=undefined;this.labelSignature='';
  }
  home(): void { const p = iso(14, 12); this.cameras.main.setZoom(this.scale.width < 700 ? 0.72 : Math.min(1.25, Math.max(0.8, this.scale.width / 1080))); this.cameras.main.centerOn(p.x, p.y - 20); }
  zoom(delta: number, anchor?: Point): void {
    const cam = this.cameras.main, old = cam.zoom, next = Phaser.Math.Clamp(old + delta, 0.48, 1.8);
    cam.setZoom(next);
    if (anchor) { cam.scrollX += (anchor.x - cam.width / 2) * (1 / old - 1 / next); cam.scrollY += (anchor.y - cam.height / 2) * (1 / old - 1 / next); }
  }
  focus(point: Point): void { const p = iso(point.x, point.y); this.cameras.main.pan(p.x, p.y - 25, 350, 'Sine.easeInOut'); }
  private choose(point: Point, right: boolean, touch = false, shift = false, pointer?:Point): void {
    const x = Math.round(point.x), y = Math.round(point.y), tile = tileAt(x, y,this.rt.world); if (!tile) return;
    const mode=this.rt.orderMode;
    const clicked=pickSoldier(this.rt.world.units,pointer??this.screenPoint(point),p=>this.screenPoint(p),this.cameras.main.zoom,touch,this.rt.rallyMode?mode:null);
    if(this.rt.editingId!==null){this.rt.placementPreview={x,y};this.rt.notify(this.rt.placementError({x,y})??'Valid site. Confirm move to apply.');this.rt.onChange();return;}
    if (this.rt.rallyMode || right&&!this.rt.heroMode) { const focused=mode==='attack'||mode==='escort'?clicked:undefined;this.rt.orderAt(focused??{x,y},focused?.id); return; }
    if (this.rt.placement) {
      if (touch) {
        this.rt.placementPreview = { x, y }; this.hoverTile = { x, y };
        this.rt.notify(this.rt.placementError({x,y}) ?? 'Check the preview, then tap Build here.'); this.rt.onChange(); return;
      }
      const kind = this.rt.placement, r = this.rt.act({ type: 'build', kind, x, y,rotation:isBarrier({kind})?this.rt.placementRotation:undefined });
      this.rt.placementPreview = null;
      if (r.ok && kind !== 'wall') this.rt.placement = null;
      this.rt.onChange(); return;
    }
    if(this.rt.heroMode&&!shift){if(right||clicked&&!isFriendly(clicked)){this.rt.heroAim=clicked??point;this.rt.heroTap=true;}else if(this.rt.state.commander)this.rt.act({type:'order',order:'move',ids:[this.rt.state.commander.id],x,y});return;}
    if(clicked&&isFriendly(clicked)){this.rt.selectUnits([clicked.id],shift||this.rt.multiSelect);return;}
    if(this.rt.world.theatre)return;
    // Buildings have tall roofs: also accept the visible sprite above its footprint.
    const wp = iso(point.x, point.y);
    const visible = [...this.rt.world.buildings].sort((a, b) => b.x + b.y - a.x - a.y).find(b => {
      const p = iso(b.x, b.y); return Math.abs(wp.x - p.x) < 26 && wp.y < p.y + 10 && wp.y > p.y - (b.kind === 'hearth' || b.kind === 'tower' ? 90 : b.kind === 'wall' ? 30 : 58);
    });
    const b = this.rt.world.buildings.find(b => b.x === x && b.y === y) ?? visible;
    if (b) this.rt.selection = { type: 'building', id: b.id };
    else if (this.rt.world.units.some(u => isFriendly(u) && distance(u, point) < 0.8)) this.rt.selection = { type: 'army' };
    else if (tile.territory !== 'wild' && tile.territory !== 'hearthmere') this.rt.selection = { type: 'territory', id: tile.territory };
    else this.rt.selection = null;
    this.rt.onSound('click'); this.rt.onChange();
  }
  private diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, alpha = 1, fill = false): void {
    const p = iso(x, y), points = [{ x: p.x, y: p.y - 16 }, { x: p.x + 32, y: p.y }, { x: p.x, y: p.y + 16 }, { x: p.x - 32, y: p.y }];
    if (fill) g.fillStyle(color, alpha).fillPoints(points, true); else g.lineStyle(2, color, alpha).strokePoints(points, true);
  }
  private updateBorders(): void {
    const sig = (this.rt.world.region??'')+(this.rt.world.march?.seen.join()??'')+(this.rt.state.commander?'commander':'')+(this.rt.world.theatre ?? '') + (this.rt.state.expedition?.approach ?? '') + this.rt.world.owned.join(); if (sig === this.labelSignature) return;
    this.labelSignature = sig; this.borders.clear(); this.labels.forEach(l => l.destroy()); this.labels = [];
    if (this.rt.world.theatre) {
      for (const [key, point] of Object.entries(missionRoute(this.rt.state.expedition!))) {
        const p = iso(point.x, point.y); const label = this.add.text(p.x, p.y - 55, key === 'exit' ? '⚑ ENTRY BANNERS' : key === 'camp' ? '⚑ GREY PENNANT OUTPOST' : '◇ BROKEN STANDARD', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#f1dda2', backgroundColor: '#213832dd', padding: { x: 8, y: 6 } }).setOrigin(.5).setDepth(2500);
        this.labels.push(label);
      }
      return;
    }
    if(this.rt.state.commander){const p=iso(ROAD_EXIT.x,ROAD_EXIT.y);this.labels.push(this.add.text(p.x,p.y-42,this.rt.world.region?'← HEARTHMERE ROAD':'BRIAR MARCH ROAD →',{fontFamily:'Georgia',fontSize:'13px',color:'#f1dda2',backgroundColor:'#213832dd',padding:{x:8,y:6}}).setOrigin(.5).setDepth(2500));}
    if(this.rt.world.region){for(const site of LANDMARKS)if(this.rt.world.march?.seen.includes(site.id)){const p=iso(site.x,site.y);this.labels.push(this.add.text(p.x,p.y-55,site.name,{fontFamily:'Georgia',fontSize:'14px',color:'#f1dda2',backgroundColor:'#213832dd',padding:{x:8,y:6}}).setOrigin(.5).setDepth(2500));}return;}
    const bounds: Record<TerritoryId, [number, number, number, number]> = { hearthmere: [8.5, 6.5, 20.5, 18.5], pinewatch: [0.5, 6.5, 8.5, 18.5], greybank: [8.5, -0.5, 20.5, 6.5], fen: [20.5, 6.5, 29.5, 18.5] };
    for (const id of Object.keys(bounds) as TerritoryId[]) {
      const [x1, y1, x2, y2] = bounds[id], owned = this.rt.world.owned.includes(id), points = [iso(x1, y1), iso(x2, y1), iso(x2, y2), iso(x1, y2)];
      if (!owned) this.borders.fillStyle(0x122b29, 0.24).fillPoints(points, true);
      this.borders.lineStyle(1.4, owned ? 0xe2ce98 : 0xd2d5b5, owned ? 0.5 : 0.19).strokePoints(points, true);
      if (id === 'hearthmere') continue;
      const t = TERRITORIES[id], p = iso(t.x, t.y);
      const label = this.add.text(p.x, p.y - 65, `${owned ? '⚑' : '◇'}  ${t.name.toUpperCase()}`, { fontFamily: 'Georgia, serif', fontSize: '15px', color: owned ? '#f2deaa' : '#e2e4c9', backgroundColor: '#253e37d9', padding: { x: 12, y: 8 } }).setOrigin(0.5).setDepth(2500).setInteractive({ useHandCursor: true });
      label.on('pointerup', () => { if (!this.dragged && !this.rt.placement && !this.rt.rallyMode) { this.rt.selection = { type: 'territory', id }; this.rt.onChange(); } }); this.labels.push(label);
    }
  }
  update(time: number, delta: number): void {
    this.syncTerrain();
    const inputAllowed=this.rt.heroMode&&!this.rt.placement&&!this.rt.rallyMode&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName??'');
    if(this.keys&&inputAllowed){const k=this.keys,h=Number(k.D.isDown||k.RIGHT.isDown)-Number(k.A.isDown||k.LEFT.isDown),v=Number(k.S.isDown||k.DOWN.isDown)-Number(k.W.isDown||k.UP.isDown);this.rt.heroWalk=this.rt.heroTouchWalk??{x:h+v,y:v-h};this.rt.heroAttack=k.F.isDown||this.rt.heroTouchAttack;}
    else{this.rt.heroWalk={x:0,y:0};this.rt.heroAttack=false;}
    this.rt.tick(delta); this.rt.fps = this.game.loop.actualFps;
    if (!this.rt.heroMode && this.keys && this.rt.ready && !document.querySelector('dialog[open]') && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName ?? '')) {
      const speed = delta * 0.55 / this.cameras.main.zoom;
      if (this.keys.A.isDown || this.keys.LEFT.isDown) this.cameras.main.scrollX -= speed;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) this.cameras.main.scrollX += speed;
      if (this.keys.W.isDown || this.keys.UP.isDown) this.cameras.main.scrollY -= speed;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) this.cameras.main.scrollY += speed;
    }
    const hero=this.rt.world.units.find(u=>u.id===this.rt.state.commander?.id);if(this.rt.heroMode&&hero){const p=iso(hero.x,hero.y);this.cameras.main.centerOn(p.x,p.y-30);}
    if (time - this.lastDraw < 32) return; const blend = Math.min(1, (time - this.lastDraw) / 65); this.lastDraw = time;
    const s = this.rt.world; this.updateBorders(); this.overlay.clear(); this.hover.clear(); this.ground.clear();
    if(hero){const p=iso(hero.x,hero.y);this.overlay.lineStyle(3,0xffde7d,.95).strokeEllipse(p.x,p.y,37,19);}
    const selected=new Set(this.rt.selectedIds), illnesses=new Map(s.infection.map(i=>[i.personId,i]));
    const attacks=new Map(s.effects.filter(e=>e.to&&e.source).map(e=>[e.source,e]));
    const squadColors=new Map((s.squads??[]).map(q=>[q.id,SQUAD_COLORS[q.color]]));
    if(this.boxSelecting&&this.dragStart&&this.boxEnd){const a=this.cameras.main.getWorldPoint(this.dragStart.x,this.dragStart.y),b=this.cameras.main.getWorldPoint(this.boxEnd.x,this.boxEnd.y);this.hover.lineStyle(2,0xf6df99).strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(a.x-b.x),Math.abs(a.y-b.y));}
    if (this.renderedState !== s) {
      if (this.renderedState && this.renderedState.theatre !== s.theatre) this.home();
      for (const sprites of [this.buildings, this.units, this.workers, this.fallen,this.remains]) { for (const sprite of sprites.values()) sprite.destroy(); sprites.clear(); }
      this.health.clear(); this.renderedState = s;
    }
    const flowing = this.rt.ready && this.rt.state.speed > 0 && s.outcome === 'playing';
    this.civilians.observe(s,this.rt.inspectedPersonId);
    const actorPoints = indexActorsByScreenY([...s.units, ...this.civilians.people].map(u => iso(u.x, u.y)));
    for (const label of this.labels) label.setAlpha(actorPoints.byY.some(p =>
      Math.abs(p.x - label.x) < label.width / 2 + 8 && p.y > label.y - label.height / 2 && p.y < label.y + label.height / 2 + 43
    ) ? .18 : 1);
    const occupied = new Set(s.buildings.map(b => b.y * MAP_W + b.x));
    for (const prop of this.scenery) {
      prop.sprite.setVisible(!occupied.has(prop.tile.y * MAP_W + prop.tile.x));
      prop.sprite.setAlpha(obscuresActor(prop.sprite, prop.width, prop.height, actorPoints) ? .28 : 1);
    }
    const bIds = new Set(s.buildings.map(b => b.id));
    const barriers=barrierIndex(s.buildings);
    for (const [id, image] of this.buildings) if (!bIds.has(id)) { image.destroy(); this.buildings.delete(id); this.health.delete(id); }
    for (const b of s.buildings) {
      const p = iso(b.x, b.y); let sprite = this.buildings.get(b.id);
      if (!sprite) { sprite = this.add.image(p.x, p.y, `building-${b.kind}`).setOrigin(0.5, 143 / 180); this.buildings.set(b.id, sprite); }
      sprite.setPosition(p.x,p.y);if(isBarrier(b))sprite.setTexture((b.kind==='gate'?'gate-':'barrier-')+barrierMask(b,barriers)).setFlipX(false);
      const fade = obscuresActor(p, b.kind === 'wall' || b.kind === 'gate' ? 24 : 30, b.kind === 'tower' || b.kind === 'hearth' ? 85 : b.kind === 'wall' || b.kind === 'gate' ? 30 : 55, actorPoints);
      sprite.setDepth(p.y).setAlpha((b.progress < 1 ? 0.45 + b.progress * 0.5 : 1) * (fade ? .55 : 1));
      sprite.setTint(this.damageTint(b.id, b.hp, s.time) ? 0xffa58b : b.hp < b.maxHp * .4 ? 0xb9a798 : 0xffffff);
      if (b.progress < 1) {
        this.overlay.lineStyle(2, 0x8f7653, .8).lineBetween(p.x - 25, p.y + 5, p.x - 25, p.y - 32).lineBetween(p.x + 25, p.y - 5, p.x + 25, p.y - 42).lineBetween(p.x - 25, p.y - 23, p.x + 25, p.y - 33);
      }
      if (!s.theatre && (b.kind === 'hearth' || b.kind === 'cottage')) {
        for (let n = 0; n < 3; n++) {
          const v = (s.time * .35 + b.id * .4 + n / 3) % 1;
          this.overlay.fillStyle(0xe5e2cf, (1 - v) * .16).fillCircle(p.x - 12 + v * 12, p.y - (b.kind === 'hearth' ? 90 : 53) - v * 26, 2 + v * 4);
        }
      }
      if (b.progress < 1 || b.hp < b.maxHp || this.rt.selection?.type === 'building' && this.rt.selection.id === b.id) {
        const v = b.progress < 1 ? b.progress : b.hp / b.maxHp;
        this.overlay.fillStyle(0x18332b, 0.85).fillRoundedRect(p.x - 19, p.y + 11, 38, 4, 2);
        this.overlay.fillStyle(b.progress < 1 ? 0xe5cf94 : v > 0.4 ? 0xadd194 : 0xd88b72).fillRoundedRect(p.x - 19, p.y + 11, 38 * v, 4, 2);
      }
      if (b.level > 1) for (let n = 0; n < b.level; n++) this.overlay.fillStyle(0xe9cd8a, 0.9).fillCircle(p.x - 5 + n * 5, p.y + 21, 1.6);
      if (this.rt.selection?.type === 'building' && this.rt.selection.id === b.id) {
        this.diamond(this.overlay, b.x, b.y, 0xffe7aa);
        if (b.kind === 'tower') this.overlay.lineStyle(1, 0xf0db9b, 0.3).strokeEllipse(p.x, p.y, (6 + (b.level - 1) * 0.7) * 128, (6 + (b.level - 1) * 0.7) * 64);
      }
    }
    this.actorDensity.clear();
    for (const u of s.units) this.addActorDensity(u.x, u.y);
    for (const c of this.civilians.people) this.addActorDensity(c.x, c.y);
    const uIds = new Set(s.units.map(u => u.id)); for (const [id, sprite] of this.units) if (!uIds.has(id)) { sprite.destroy(); this.units.delete(id); this.health.delete(id); }
    for (const u of s.units) {
      const p = iso(u.x, u.y), moving = flowing && u.path.length > 0 && u.attackFlash === 0, frame = u.attackFlash > 0 ? u.attackFlash > .15 ? 3 : 4 : moving ? [1,5,2,6][Math.floor(s.time / (u.kind==='brute'?.18:.12) + u.id) % 4] : 0;
      let sprite = this.units.get(u.id); if (!sprite) { sprite = this.add.image(p.x, p.y, `unit-${u.kind}-${frame}`).setOrigin(0.5, 43 / 52); this.units.set(u.id, sprite); }
      const lastX: number = sprite.getData('footX') ?? p.x, lastY: number = sprite.getData('footY') ?? p.y;
      if (Math.abs(p.x - lastX) > .15) sprite.setFlipX(p.x < lastX);
      const attack = u.attackFlash > 0 ? attacks.get(u.id) : undefined;
      if (attack?.to) sprite.setFlipX(iso(attack.to.x, attack.to.y).x < p.x);
      const x = flowing ? Phaser.Math.Linear(lastX, p.x, blend) : p.x, y = flowing ? Phaser.Math.Linear(lastY, p.y, blend) : p.y;
      sprite.setData('footX', x).setData('footY', y);
      const hurt = this.damageTint(u.id, u.hp, s.time), strike = u.attackFlash / .3;
      const recoil = hurt ? Math.sin((this.health.get(u.id)!.until - s.time) / .24 * Math.PI) * 3 : 0;
      const illness=illnesses.get(u.id),sickColor=illness?(illness.age>=55?0xe8a37c:illness.age>=18?0xb4cb77:0xe0d6a0):0xffffff;
      const bob=moving?Math.sin(s.time*(u.kind==='brute'?9:13)+u.id)*.6:0;
      let bodyScale = 1;
      if (isFriendly(u) && u.id !== s.commander?.id) { const density = this.localActorDensity(u.x, u.y); bodyScale = density >= 28 ? .72 : density >= 18 ? .84 : 1; }
      if (sprite.scaleX !== bodyScale || sprite.scaleY !== bodyScale) sprite.setScale(bodyScale);
      sprite.setTexture(`unit-${u.kind}-${frame}`).setPosition(x + (sprite.flipX ? -1 : 1) * (strike * 2 - recoil), y+bob).setDepth(y + 1).setRotation((sprite.flipX?-1:1)*(strike*.055-recoil*.018)).setTint(hurt ? 0xff967d : u.attackFlash > 0 ? 0xffe5ad : sickColor);
      const view=this.cameras.main.worldView,visible=p.x>view.x-55&&p.x<view.right+55&&p.y>view.y-55&&p.y<view.bottom+55;sprite.setVisible(visible);if(!visible)continue;
      const selectedUnit=selected.has(u.id),color=selectedUnit?0xffe29a:isFriendly(u)?squadColors.get(u.squadId!)??0xb5d5d8:u.kind==='brute'?0xf1ba72:0xe6a37d;
      const massSelection=selectedUnit&&selected.size>24,markScale=massSelection?.8:1;
      this.ground.lineStyle(selectedUnit?(massSelection?1.2:1.8):isFriendly(u)?.7:1.8,color,selectedUnit?(massSelection?.6:.9):isFriendly(u)?.45:.95).strokeEllipse(p.x,p.y,(u.kind==='brute'?23:17)*markScale,(u.kind==='brute'?11:8)*markScale);
      if (u.hp < u.maxHp*.65 || hurt || selectedUnit&&selected.size<=24 || illness) {
        this.overlay.fillStyle(0x18332b, 0.8).fillRect(p.x - 10, p.y - 42, 20, 3); this.overlay.fillStyle(isFriendly(u) ? 0xbbd7ac : 0xd29179).fillRect(p.x - 10, p.y - 42, 20 * u.hp / u.maxHp, 3);
      }
      if (u.injury) { this.overlay.lineStyle(2, 0xf0cd8d).lineBetween(p.x - 3, p.y - 49, p.x + 3, p.y - 49).lineBetween(p.x, p.y - 52, p.x, p.y - 46); }
      else if (isFriendly(u) && u.hp < u.maxHp * .3) this.overlay.lineStyle(2, 0xf7a88a, .75 + Math.sin(s.time * 7) * .2).strokeTriangle(p.x, p.y - 56, p.x - 4, p.y - 49, p.x + 4, p.y - 49);
      if (u.origin === 'battalion') this.overlay.lineStyle(2, 0xf0cd8d, .9).strokeEllipse(p.x, p.y, 23, 11);
      if(illness)this.overlay.lineStyle(2,illness.age>=55?0xff967d:illness.age>=18?0xc7d975:0xf1d695).strokeCircle(p.x,p.y-48,4);
      if(illness&&s.quarantine)this.overlay.lineStyle(1.5,0xc4e2da).strokeRect(p.x-6,p.y-54,12,12);
      if(this.rt.inspectedPersonId===u.id)this.overlay.lineStyle(2,0xffffff).strokeEllipse(p.x,p.y,28,15);
      if(u.squadId)this.ground.fillStyle(squadColors.get(u.squadId)??0xb5d5d8).fillCircle(p.x,p.y+6,2);
      if (selectedUnit && u.order && selected.size<=12) { const destination = iso(u.target.x, u.target.y); this.ground.lineStyle(1, squadColors.get(u.squadId!)??0xc9dfd2, .3).lineBetween(p.x, p.y, destination.x, destination.y).strokeEllipse(destination.x, destination.y, 14, 7); }
    }
    if(selected.size>12){
      const groups=new Map<string,{n:number;x:number;y:number;tx:number;ty:number;color:number}>();
      for(const u of s.units)if(selected.has(u.id)&&u.order){const key=(u.squadId??0)+':'+u.order;const g=groups.get(key)??{n:0,x:0,y:0,tx:0,ty:0,color:squadColors.get(u.squadId!)??0xe4d2a3};g.n++;g.x+=u.x;g.y+=u.y;g.tx+=u.target.x;g.ty+=u.target.y;groups.set(key,g);}
      let n=0;for(const g of groups.values()){if(n++>=20)break;const p=iso(g.x/g.n,g.y/g.n),t=iso(g.tx/g.n,g.ty/g.n);if(this.rt.rallyMode||performance.now()<this.rt.orderFeedbackUntil)this.ground.lineStyle(2,g.color,.55).lineBetween(p.x,p.y,t.x,t.y);this.ground.lineStyle(2,g.color,.7).strokeEllipse(t.x,t.y,28,14);}
    }
    const corpseIds=new Set((s.corpses??[]).map(c=>c.id));for(const[id,sprite]of this.remains)if(!corpseIds.has(id)){sprite.destroy();this.remains.delete(id);}
    for(const corpse of s.corpses??[]){const p=iso(corpse.x,corpse.y);let sprite=this.remains.get(corpse.id);if(!sprite){sprite=this.add.image(p.x,p.y,`unit-${corpse.kind==='resident'?'idle':corpse.kind}-0`).setOrigin(.5,43/52);this.remains.set(corpse.id,sprite);}const stirring=corpse.tainted?Math.max(0,1-corpse.remaining/2):0;sprite.setPosition(p.x,p.y-2).setDepth(p.y+.2).setRotation(-1.45+stirring*.35).setAlpha(corpse.tainted?.8:.4).setTint(corpse.tainted?0xb9bb7a:0x9c9e88);this.ground.lineStyle(2,corpse.tainted?0xeab081:0xb4b7a5,.85).strokeEllipse(p.x,p.y,25,12);if(corpse.tainted){this.overlay.lineStyle(2,0xf0ad78,.9).beginPath().arc(p.x,p.y-7,12,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,corpse.remaining/8)).strokePath();if(stirring)this.overlay.lineStyle(1,0xffb587,.65).strokeEllipse(p.x,p.y,28+stirring*8,14+stirring*4);}}
    this.drawWorkers(flowing, blend);
    if (s.theatre) {
      const e = this.rt.state.expedition;
      const route = missionRoute(e!);
      for (const [name, point] of Object.entries(route)) { const p = iso(point.x, point.y); this.ground.lineStyle(2, name === 'exit' ? 0xb5d5d8 : 0xe5cd8e, .85).strokeEllipse(p.x, p.y, 110, 55); }
      const flag = iso(route.standard.x, route.standard.y), raised = e?.standard;
      this.overlay.lineStyle(3, 0xb7a786).lineBetween(flag.x, flag.y, flag.x + (raised ? 0 : 8), flag.y - (raised ? 57 : 29));
      this.overlay.fillStyle(raised ? 0xe1c57f : 0x9c9f92).fillTriangle(flag.x, flag.y - (raised ? 57 : 29), flag.x + 22, flag.y - (raised ? 51 : 18), flag.x + 4, flag.y - (raised ? 39 : 12));
      if (e && (e.warning > 0 || e.pending?.length)) for (const p of ambushFronts(e)) this.diamond(this.overlay, p.x, p.y, 0xf0a174, .6 + Math.sin(s.time * 5) * .3);
    }
    for (let i = 0; i < s.contamination.length; i++) if (s.contamination[i] > 8) this.diamond(this.ground, i % MAP_W, Math.floor(i / MAP_W), 0x9da853, s.contamination[i] / 300, true);
    const effectIds = new Set(s.effects.filter(e => e.kind === 'death').map(e => e.id));
    for (const [id, sprite] of this.fallen) if (!effectIds.has(id)) { sprite.destroy(); this.fallen.delete(id); }
    const rewardIds=new Set(s.effects.filter(e=>e.kind==='reward').map(e=>e.id));for(const[id,label]of this.rewards)if(!rewardIds.has(id)){label.destroy();this.rewards.delete(id);}
    for (const e of s.effects) {
      const p = iso(e.x, e.y), t = e.to ? iso(e.to.x, e.to.y) : p;
      if(e.kind==='reward'){let label=this.rewards.get(e.id);if(!label&&this.rewards.size<32){label=this.add.text(p.x,p.y,e.note==='reanimated'?'Reanimated · no bounty':e.note==='claimed'?'Bounty already claimed':'+'+e.amount+' Crowns',{fontFamily:'Georgia',fontSize:'13px',color:'#ffdc83',stroke:'#24392b',strokeThickness:3}).setOrigin(.5).setDepth(3200);this.rewards.set(e.id,label);}label?.setPosition(p.x,p.y-35-(1.6-e.ttl)*16).setAlpha(Math.min(1,e.ttl));}
      else if (e.kind === 'death' && e.unit) {
        let corpse = this.fallen.get(e.id);
        if (!corpse) { corpse = this.add.image(p.x, p.y, `unit-${e.unit}-0`).setOrigin(.5, 43 / 52); this.fallen.set(e.id, corpse); }
        const v = 1 - e.ttl;
        corpse.setDepth(p.y - .5).setRotation(-Math.min(1, v * 4) * 1.4).setAlpha(Math.min(1, e.ttl * 1.8)).setTint(0xa29b7d);
        this.ground.fillStyle(0xb4ab8c, e.ttl * .2).fillEllipse(p.x, p.y, 12 + v * 18, 5 + v * 7);
      } else if (e.kind === 'build') {
        const v = 1 - e.ttl / 1.3;
        this.ground.lineStyle(2, 0xe5d69f, 1 - v).strokeEllipse(p.x, p.y, 35 + v * 55, 17 + v * 28);
      } else if (e.kind === 'arrow') {
        const v = Phaser.Math.Clamp(1 - e.ttl / .35, 0, 1), tail = Math.max(0, v - .16);
        const ax = Phaser.Math.Linear(p.x, t.x, v), ay = Phaser.Math.Linear(p.y - 25, t.y - 18, v) - Math.sin(v * Math.PI) * 13;
        this.overlay.lineStyle(2, 0xffe2a3, .95).lineBetween(Phaser.Math.Linear(p.x, t.x, tail), Phaser.Math.Linear(p.y - 25, t.y - 18, tail) - Math.sin(tail * Math.PI) * 13, ax, ay);
        this.overlay.fillStyle(0xffedbc, 1).fillCircle(ax, ay, 1.7);
        if (v > .78) this.overlay.lineStyle(1.5, e.armored ? 0xb9d1d4 : 0xf6ce88, e.ttl / .08).strokeCircle(t.x, t.y - 18, 3 + v * 3);
      } else {
        const v = Math.max(0, 1 - e.ttl / .3), color = e.armored ? 0xb9d1d4 : 0xffd9a3;
        const angle = Math.atan2(t.y - p.y, t.x - p.x);
        if (e.kind === 'hit') {
          this.overlay.lineStyle(e.unit === 'brute' ? 4 : 2, color, Math.max(0, 1 - v));
          if (e.unit === 'spearman') this.overlay.lineBetween(p.x, p.y - 17, t.x, t.y - 17);
          else this.overlay.beginPath().arc(p.x, p.y - 18, 19 + v * 7, angle - .9 + v, angle + .3 + v, false).strokePath();
          for (let n = 0; n < 3; n++) { const a = angle + n * 2.1, d = 4 + v * 9; this.overlay.lineBetween(t.x + Math.cos(a) * d, t.y - 17 + Math.sin(a) * d, t.x + Math.cos(a) * (d + 4), t.y - 17 + Math.sin(a) * (d + 4)); }
        } else this.overlay.lineStyle(2, 0xc5dbaa, Math.max(0, 1 - v)).strokeCircle(t.x, t.y - 15, 3 + v * 11);
      }
    }
    const preview = this.rt.placementPreview ?? this.hoverTile;
    if (this.rt.placement && preview) {
      const { x, y } = preview, valid = !this.rt.placementError({x,y}); this.diamond(this.hover, x, y, valid ? 0xe9e6b7 : 0xe89986, 0.7, true);
      if (!this.ghost) this.ghost = this.add.image(0, 0, `building-${this.rt.placement}`).setOrigin(0.5, 143 / 180).setDepth(3200);
      const candidate={id:-1,kind:this.rt.placement,x,y,rotation:this.rt.placementRotation,hp:1,maxHp:1,level:1,progress:1,cooldown:0},texture=isBarrier(candidate)?(candidate.kind==='gate'?'gate-':'barrier-')+barrierMask(candidate,barrierIndex([...s.buildings.filter(b=>b.id!==this.rt.editingId),candidate])):`building-${this.rt.placement}`;
      const p = iso(x, y); this.ghost.setTexture(texture).setPosition(p.x, p.y).setAlpha(0.65).setTint(valid ? 0xffffff : 0xda8a7a).setVisible(true);
    } else this.ghost?.setVisible(false);
    if (this.rt.rallyMode && this.hoverTile) this.diamond(this.hover, this.hoverTile.x, this.hoverTile.y, 0xffdfa2, 0.8);
    const dusk = s.phase === 'night' ? 0.32 : s.phaseTime > 57 ? (s.phaseTime - 57) / 15 * 0.22 : 0;
    this.night.setAlpha(dusk);
    if (s.phase === 'night') for (const b of s.buildings.filter(b => ['hearth', 'tower', 'cottage'].includes(b.kind))) { const p = iso(b.x, b.y); this.overlay.fillStyle(0xffc46e, 0.12 + Math.sin(s.time * 2.5 + b.id) * 0.02).fillEllipse(p.x, p.y - 5, 100, 55); }
  }
  private damageTint(id: number, hp: number, time: number): boolean {
    const old = this.health.get(id), until = old && hp < old.hp ? time + .24 : old?.until ?? 0;
    this.health.set(id, { hp, until }); return until > time;
  }
  private addActorDensity(x: number, y: number): void {
    const key = Math.floor(x / 3) + Math.floor(y / 3) * 32;
    this.actorDensity.set(key, (this.actorDensity.get(key) ?? 0) + 1);
  }
  private localActorDensity(x: number, y: number): number {
    const bx = Math.floor(x / 3), by = Math.floor(y / 3); let count = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) count += this.actorDensity.get(bx + dx + (by + dy) * 32) ?? 0;
    return count;
  }
  private drawWorkers(flowing: boolean, blend: number): void {
    const s = this.rt.world;
    const ids = new Set(this.civilians.people.map(c => c.id));
    for (const [id, sprite] of this.workers) if (!ids.has(id)) { sprite.destroy(); this.workers.delete(id); }
    for (const c of this.civilians.people) {
      const p = iso(c.x, c.y), working = c.activity === 'work' && !c.path.length && c.wait > 0 && c.job !== 'idle';
      const frame = flowing && c.path.length ? [1,5,2,6][Math.floor(s.time / .15 + c.id) % 4] : working && Math.floor(s.time * 3 + c.id) % 2 ? 3 : 0;
      let sprite = this.workers.get(c.id);
      if (!sprite) { sprite = this.add.image(p.x, p.y, `unit-${c.job}-0`).setOrigin(.5, 43 / 52).setScale(.87); this.workers.set(c.id, sprite); }
      const targetX = p.x;
      if (Math.abs(targetX - sprite.x) > .15) sprite.setFlipX(targetX < sprite.x);
      const x = flowing ? Phaser.Math.Linear(sprite.x, targetX, blend) : targetX, y = flowing ? Phaser.Math.Linear(sprite.y, p.y, blend) : p.y;
      sprite.setTexture(`unit-${c.job}-${frame}`).setPosition(x, y).setDepth(y + .5).setTint(c.sick ? 0xa2b76b : 0xffffff);
      if (c.carrying) this.overlay.fillStyle(c.job === 'farmers' ? 0xe3c275 : c.job === 'miners' ? 0xc4c6b6 : 0x9f8159).fillRoundedRect(p.x + 4, p.y - 13, 6, 6, 1);
      if (c.sick) this.overlay.lineStyle(1.5, 0xe7bf79, .85).strokeCircle(p.x, p.y - 36, 3);
      if(c.sick&&s.quarantine)this.overlay.lineStyle(1.5,0xc4e2da).strokeRect(p.x-5,p.y-42,10,10);
      if(this.rt.inspectedPersonId===c.id)this.overlay.lineStyle(2,0xffffff).strokeEllipse(p.x,p.y,26,14);
    }
  }
  // Useful for deterministic browser input tests; this does not mutate the simulation.
  screenPoint(point: Point): Point { const p = iso(point.x, point.y), cam = this.cameras.main; return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom }; }
}
