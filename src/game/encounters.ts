import type { Expedition, ExpeditionApproach, Point, SoldierKind } from './types';

export const APPROACHES: Record<ExpeditionApproach, { name: string; detail: string; standard: Point; fronts: Point[] }> = {
  ridge: { name: 'High ridge', detail: 'Bowmen gain range and damage on the highlands. Three open approaches make the rear vulnerable to runners.', standard: { x: 19, y: 5 }, fronts: [{ x: 22, y: 6 }, { x: 16, y: 2 }, { x: 18, y: 9 }] },
  ford: { name: 'River crossing', detail: 'Hold the narrow eastern bridge with swords and spears. Marshes slow the flanking infected, but bowmen have no elevation bonus.', standard: { x: 22, y: 12 }, fronts: [{ x: 27, y: 11 }, { x: 21, y: 8 }, { x: 21, y: 16 }] },
};
export const ROLE_TIPS: Record<SoldierKind, string> = {
  warden: 'Sword & shield · absorbs heavy blows · slow, short reach',
  ranger: 'Long bow · strong on high ground · weak when enemies close',
  spearman: 'Long spear · +6 damage against runners · less armor than a warden',
  scout: 'Light bow · fast, evasive screening · fragile, shorter reach',
};
export const ENCOUNTER_NAMES = ['Bellbreaker column', 'Runner hunting pack', 'Mixed encirclement'];
export function ambushFronts(e: Expedition): Point[] {
  if (e.wave === 1) return e.variant === 1 ? [{ x: 18, y: 14 }, { x: 11, y: 8 }] : [{ x: 18, y: 15 }, { x: 12, y: 8 }];
  return e.approach ? APPROACHES[e.approach].fronts : [{ x: 22, y: 8 }, { x: 17, y: 6 }, { x: 17, y: 14 }];
}
export function ambushRoster(e: Expedition): ('hollow' | 'runner' | 'brute')[] {
  if (!e.approach) return Array.from({ length: e.wave === 1 ? 7 : 10 }, (_, i) => e.wave === 2 && i === 0 ? 'brute' : i % 4 === 3 ? 'runner' : 'hollow');
  if (e.wave === 1) return e.variant === 1 ? ['runner', 'hollow', 'runner', 'hollow', 'runner', 'hollow', 'runner', 'hollow'] : ['hollow', 'hollow', 'runner', 'hollow', 'hollow', 'runner', 'hollow', 'hollow'];
  if (e.variant === 0) return ['brute', 'hollow', 'runner', 'hollow', 'hollow', 'runner', 'brute', 'hollow', 'hollow', 'runner', 'hollow', 'hollow'];
  if (e.variant === 1) return ['runner', 'runner', 'hollow', 'runner', 'hollow', 'hollow', 'runner', 'runner', 'hollow', 'runner', 'hollow', 'hollow'];
  return ['hollow', 'runner', 'brute', 'hollow', 'runner', 'hollow', 'hollow', 'runner', 'hollow', 'brute', 'hollow', 'runner'];
}
