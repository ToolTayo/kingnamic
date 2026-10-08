export type Resource = 'wood' | 'stone' | 'food' | 'herbs';
// `stone` is the stable v2 storage key for Crowns (one legacy stone = one crown).
export type Resources = Record<Resource, number>;
export type Job = 'farmers' | 'woodcutters' | 'miners' | 'healers' | 'builders';
export type BuildingKind = 'hearth' | 'cottage' | 'farm' | 'lumberyard' | 'quarry' | 'barracks' | 'infirmary' | 'tower' | 'wall' | 'gate';
export type SoldierKind = 'warden' | 'ranger' | 'spearman' | 'scout';
export type ArmyOrder = 'move' | 'attack' | 'hunt' | 'defend' | 'patrol' | 'hold' | 'retreat' | 'regroup' | 'escort';
export type ExpeditionApproach = 'ridge' | 'ford';
export type Formation = 'line' | 'protected' | 'loose' | 'column';
export type UnitKind = SoldierKind | 'hollow' | 'runner' | 'brute';
export type TerritoryId = 'hearthmere' | 'pinewatch' | 'greybank' | 'fen';
export type Terrain = 'grass' | 'forest' | 'rock' | 'water' | 'road' | 'marsh' | 'heath' | 'field';
export interface Point { x: number; y: number }
export interface Tile extends Point { terrain: Terrain; territory: TerritoryId | 'wild'; height: number; variant: number }
export interface Building extends Point { id: number; kind: BuildingKind; hp: number; maxHp: number; level: number; progress: number; cooldown: number; rotation?: 0 | 1; name?: string; owner?: 'rival' | 'player' }
export interface Unit extends Point {
  id: number; kind: UnitKind; hp: number; maxHp: number; cooldown: number;
  target: Point; path: Point[]; repath: number; attackFlash: number; order?: ArmyOrder;
  injury?: number; origin?: 'party' | 'battalion'; faction?: 'rival';
  exposure?: number; exposureSourceId?: number; immune?: number; squadId?: number; formation?: Formation;
  anchor?: Point; patrol?: { a: Point; b: Point; leg: 0 | 1 }; focus?: number;
  homeId?: number; reanimatedFrom?: number; reanimatedBy?: number;
  bountyEligible?: boolean; bountySettled?: boolean; bountyKey?: string; commanderCredit?: boolean; muster?: boolean;
}
export interface Infection { id: number; age: number; personId?: number; host?: 'resident' | 'soldier'; source?: 'bite' | 'legacy'; sourceId?: number; legacyCause?: 'bite' | 'unknown' }
export interface Resident extends Point {
  id: number; hp: number; maxHp: number; exposure?: number; exposureSourceId?: number; immune?: number;
  job: Job | 'idle'; sick: boolean; activity: 'work' | 'home' | 'rest' | 'shelter' | 'recover' | 'flee';
  path: Point[]; goal: Point; wait: number; retry: number; trip: number; carrying: boolean;
}
export interface Corpse extends Point { id: number; personId: number; kind: SoldierKind | 'resident'; remaining: number; tainted: boolean; sourceId?: number }
export interface Squad { id: number; name: string; color: number }
export interface LogEntry { id: number; time: number; text: string; tone: 'info' | 'good' | 'warn' | 'danger' }
export interface Effect extends Point { id: number; kind: 'hit' | 'arrow' | 'heal' | 'build' | 'death' | 'reward'; ttl: number; to?: Point; unit?: UnitKind; source?: number; armored?: boolean; amount?: number; note?: 'reanimated' | 'claimed' }
export interface Stats { slain: number; lost: number; built: number; nights: number; cured: number; claimed: number }
export interface Commander { id:number; weapon:'sword'|'spear'|'bow'; xp:number }
export interface CommanderInput { walk:Point; attack:boolean; aim?:Point }
export interface RivalStronghold { id:'mossgate'; name:string; faction:string; status:'unseen'|'occupied'|'captured'; remaining:number; reserve:number; casualties:number; warning:number; leaderId?:number }
export interface March { seen:string[]; rescued?:string[]; secured:boolean; rewarded:boolean; incursion:number; warning:number; rival?:RivalStronghold }
export interface Empire { reserve:State; elapsed:number }
export interface State {
  version: 2; seed: number; rng: number; time: number; day: number; phaseTime: number;
  phase: 'day' | 'night'; speed: 0 | 1 | 2; lastSpeed: 1 | 2;
  resources: Resources; population: number; jobs: Record<Job, number>;
  buildings: Building[]; units: Unit[]; owned: TerritoryId[]; infection: Infection[];
  contamination: number[]; plagueClock: number; economyClock: number; waveClock: number;
  waveRemaining: number; waveNumber: number; nextId: number; formation: Formation;
  quarantine: boolean; logs: LogEntry[]; effects: Effect[]; stats: Stats;
  completed: string[]; outcome: 'playing' | 'won' | 'lost'; tutorialSeen: boolean;
  theatre?: 'expedition'; expedition?: Expedition; lostBattalions?: BattalionRecord;
  residents?: Resident[]; corpses?: Corpse[]; squads?: Squad[]; suppliesTaint?: number;
  musterClock?: number; endless?: boolean; frontierClock?: number;
  economyRevision?: 1; biteRulesRevision?: 1; bountyPaid?: number; bountyTotal?: number;
  region?: 'march'; march?: March; empire?: Empire; commander?: Commander;
}
export interface BuildingDef { name: string; subtitle: string; description: string; cost: Partial<Resources>; hp: number; time: number; category: 'settlement' | 'production' | 'defense'; job?: Job; capacity?: number; icon: string }
export type Command =
  | { type:'commander-appoint'; id?:number }
  | { type:'commander-weapon'; weapon:'sword'|'spear'|'bow' }
  | { type:'settlement-rename'; id:number; name:string }
  | { type:'stronghold-capture' }
  | { type:'travel'|'gather-company'; ids:number[] }
  | { type:'home-watch' }

  | { type: 'build'; kind: BuildingKind; x: number; y: number; rotation?: 0 | 1 }
  | { type: 'relocate'; id: number; x: number; y: number; rotation?: 0 | 1 }
  | { type: 'upgrade' | 'repair'; id: number }
  | { type: 'recruit'; kind: SoldierKind; count?: number }
  | { type: 'job'; job: Job; delta: number }
  | { type: 'rally'; x: number; y: number; ids?: number[] }
  | { type: 'formation'; formation: Formation; ids?: number[] }
  | { type: 'order'; order: ArmyOrder; ids: number[]; x?: number; y?: number; focus?: number; heading?: Point }
  | { type: 'squad-create'; ids: number[]; name: string }
  | { type: 'squad-assign'; ids: number[]; squadId?: number }
  | { type: 'squad-rename'; squadId: number; name: string }
  | { type: 'squad-delete'; squadId: number }
  | { type: 'demobilize'; ids: number[] }
  | { type: 'settlers' | 'continue' }
  | { type: 'claim'; territory: TerritoryId }
  | { type: 'treat'; ids?: number[] }
  | { type: 'quarantine' | 'cleanse' }
  | { type: 'speed'; speed: 0 | 1 | 2 }
  | { type: 'expedition-launch'; ids?: number[]; approach?: ExpeditionApproach }
  | { type: 'expedition-share' | 'expedition-retreat' | 'expedition-extract' };
export interface CommandResult { ok: boolean; message: string }
// A separate battlefield uses the existing fixed-step combat and renderer.
export interface BattalionRecord {
  bounties?: string[];
  attempts: number; remaining: SoldierKind[]; recruited: number; cooldown: number;
  wounds?: Partial<Record<SoldierKind, number>>;
  sickness?: Partial<Record<SoldierKind, number>>;
  sicknessSources?: Partial<Record<SoldierKind, number>>;
  report?: { outcome: 'success' | 'retreated' | 'defeat'; returned: number; recruited: number; lost: number; stranded: number };
}
export interface Expedition {
  world: State; stage: 'search' | 'hold' | 'standard' | 'return' | 'retreat';
  discovered: boolean; shared: boolean; held: boolean; standard: boolean;
  wave: 0 | 1 | 2; warning: number; holdTime: number;
  deployed: number; initialAllies: SoldierKind[]; supplies: number; medicine: number;
  // Optional so an active pre-tactics mission retains its route and costs.
  approach?: ExpeditionApproach; variant?: number; equipment?: number;
  equipmentCurrency?: 'crowns';
  pending?: { kind: 'hollow' | 'runner' | 'brute'; point: Point; delay: number; bountyKey?: string }[];
}
