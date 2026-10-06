import type { Building, State } from './types';

// Each builder contributes to one project. Stable ordering survives saves and
// keeps the visible builder's destination identical to the economic assignment.
export function builderAssignments(s: State): Building[] {
  const sites = s.buildings.filter(b => b.progress < 1 && b.hp > 0).sort((a, b) => a.id - b.id);
  if (!sites.length) return [];
  return Array.from({ length: Math.min(6, s.jobs.builders) }, (_, i) => sites[i % sites.length]);
}
export function constructionCrew(s: State, buildingId: number): number {
  return builderAssignments(s).filter(b => b.id === buildingId).length;
}
