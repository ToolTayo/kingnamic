import type { BuildingDef, BuildingKind, Job, Resources, TerritoryId, UnitKind } from './types';
// A broad 60×48 wilderness surrounds the unchanged 30×26 Heartmere valley.
// This is a single connected play space rather than a zoomed-out board of maps.
export const MAP_W = 60, MAP_H = 48, STEP = 0.1;
export const LEGACY_MAP_W = 30, LEGACY_MAP_H = 26;
export const DAY_LENGTH = 72, NIGHT_LENGTH = 38, MAX_ARMY = 200, MAX_HOSTILES = 200, MAX_UNITS = 400, MAX_BUILDINGS = 150, MAX_RESIDENTS = 1000;
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  hearth: { name: 'The Last Hearth', subtitle: 'Heart of your kingdom', description: 'Keep the beacon burning. If the Hearth falls, Hearthmere is lost. Shelters 12 villagers.', cost: {}, hp: 1000, time: 1, category: 'settlement', icon: 'crown' },
  cottage: { name: 'Cottage', subtitle: '+6 population capacity', description: 'A warm roof for new arrivals. Two survivors arrive each dawn if food and housing are available.', cost: { wood: 35 }, hp: 180, time: 10, category: 'settlement', icon: 'home' },
  farm: { name: 'Croft', subtitle: 'Employs 5 farmers', description: 'Farmers grow food. Every villager and soldier needs provisions. Each worker produces 0.55 food per second.', cost: { wood: 40 }, hp: 160, time: 10, category: 'settlement', job: 'farmers', capacity: 5, icon: 'wheat' },
  lumberyard: { name: 'Woodcutter’s lodge', subtitle: 'Employs 4 woodcutters', description: 'Turns the surrounding woodland into timber. Each worker produces 0.3 wood per second.', cost: { wood: 30 }, hp: 180, time: 10, category: 'production', job: 'woodcutters', capacity: 4, icon: 'wood' },
  quarry: { name: 'Trading post', subtitle: '4 traders · earn Crowns', description: 'Traders sell local wares for Crowns. Each assigned trader earns 0.22 Crowns per second.', cost: { wood: 40 }, hp: 230, time: 12, category: 'production', job: 'miners', capacity: 4, icon: 'crown' },
  barracks: { name: 'Garrison', subtitle: '24 soldiers per level', description: 'Equip healthy, unassigned residents. Each level supports 24 soldiers, up to 200. Level 2 unlocks spearmen and scouts. Every soldier needs food.', cost: { wood: 65, stone: 25 }, hp: 330, time: 18, category: 'defense', icon: 'sword' },
  infirmary: { name: 'Herbalist’s refuge', subtitle: 'Employs 3 healers', description: 'Healers gather herbs and automatically cure one infected resident or soldier every 12 seconds for 3 herbs. Enables ground cleansing.', cost: { wood: 45 }, hp: 200, time: 14, category: 'settlement', job: 'healers', capacity: 3, icon: 'herb' },
  tower: { name: 'Watchtower', subtitle: 'Range 6 · 14 damage', description: 'An elevated ranger fires over palisades. Upgrades improve damage and reach. Holds without a worker.', cost: { wood: 70, stone: 30 }, hp: 280, time: 20, category: 'defense', icon: 'tower' },
  wall: { name: 'Palisade', subtitle: '420 health · blocks infected', description: 'Forces the Hollow to detour or break through. Leave a gate so your soldiers can pass.', cost: { wood: 8 }, hp: 420, time: 3, category: 'defense', icon: 'wall' },
  gate: { name: 'Timber gate', subtitle: '340 health · allied passage', description: 'Friendly troops pass through. Infected must go around or destroy it. Automatically guarded and closed.', cost: { wood: 18 }, hp: 340, time: 5, category: 'defense', icon: 'gate' },
};
export const JOBS: { id: Job; name: string; icon: string }[] = [
  { id: 'farmers', name: 'Farmers', icon: 'wheat' }, { id: 'woodcutters', name: 'Woodcutters', icon: 'wood' },
  { id: 'miners', name: 'Traders', icon: 'crown' }, { id: 'healers', name: 'Healers', icon: 'herb' }, { id: 'builders', name: 'Builders', icon: 'hammer' },
];
export const UNITS: Record<UnitKind, { name: string; hp: number; damage: number; range: number; speed: number; cooldown: number; cost: Partial<Resources>; armor: number }> = {
  warden: { name: 'Warden', hp: 145, damage: 17, range: 1.25, speed: 1.45, cooldown: 1, cost: { stone: 20 }, armor: 4 },
  ranger: { name: 'Ranger', hp: 75, damage: 12, range: 4.8, speed: 1.55, cooldown: 1.2, cost: { stone: 25 }, armor: 0 },
  spearman: { name: 'Spearman', hp: 110, damage: 14, range: 1.9, speed: 1.3, cooldown: 1.2, cost: { stone: 22 }, armor: 2 },
  scout: { name: 'Scout', hp: 65, damage: 8, range: 3.6, speed: 1.9, cooldown: .95, cost: { stone: 24 }, armor: 0 },
  hollow: { name: 'Hollow', hp: 55, damage: 8, range: 1.05, speed: 0.72, cooldown: 1.3, cost: {}, armor: 0 },
  runner: { name: 'Ash runner', hp: 36, damage: 6, range: 1.05, speed: 1.4, cooldown: 0.8, cost: {}, armor: 0 },
  brute: { name: 'Bellbreaker', hp: 180, damage: 22, range: 1.15, speed: 0.48, cooldown: 1.8, cost: {}, armor: 3 },
};
export const TERRITORIES: Record<TerritoryId, { name: string; title: string; description: string; cost: Partial<Resources>; x: number; y: number; requirement?: TerritoryId; route: { x: number; y: number } }> = {
  hearthmere: { name: 'Hearthmere', title: 'Your last safe haven', description: 'A hearth worth defending.', cost: {}, x: 14, y: 12, route: { x: 14, y: 24 } },
  pinewatch: { name: 'Pinewatch', title: 'The timber march', description: '+35% timber production and up to 3 survivors if you have spare beds. Opens the western invasion route.', cost: { wood: 45, stone: 20 }, x: 5, y: 12, route: { x: 1, y: 12 } },
  greybank: { name: 'Greybank', title: 'The old highlands', description: '+40% Crown income and up to 3 survivors if housed. Opens the northern invasion route. Requires Pinewatch.', cost: { wood: 45, stone: 30 }, x: 15, y: 3, requirement: 'pinewatch', route: { x: 15, y: 0 } },
  fen: { name: 'Saintless Fen', title: 'The drowned gardens', description: '+60% herbs and up to 3 survivors if housed. Opens the eastern invasion route. Requires Greybank. Two arriving survivors carry infection.', cost: { wood: 50, stone: 35 }, x: 26, y: 12, requirement: 'greybank', route: { x: 29, y: 12 } },
};
export const OBJECTIVES = [
  { id: 'build', title: 'Raise a new building', detail: 'Build a Trading post for Crown income, or a refuge for treatment.' },
  { id: 'recruit', title: 'Gather a fighting force', detail: 'Recruit until 5 soldiers defend Hearthmere.' },
  { id: 'night', title: 'Hold through the darkness', detail: 'Survive the first night with your Hearth intact.' },
  { id: 'claim', title: 'Reclaim the three marches', detail: 'Pinewatch → Greybank → Saintless Fen. Each opens a new front.' },
  { id: 'survive', title: 'A kingdom that endures', detail: 'Survive 5 nights and reclaim all territories.' },
];
