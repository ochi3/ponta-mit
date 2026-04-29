import type { JobId } from "../types";

export const DEFAULT_JOB_PRIORITY: readonly JobId[] = [
  "tank.drk","tank.pld","tank.war","tank.gnb",
  "healer.whm","healer.ast","healer.sch","healer.sge",
  "melee.mnk","melee.drg","melee.nin","melee.sam","melee.rpr","melee.vpr",
  "ranged.brd","ranged.mch","ranged.dnc",
  "caster.blm","caster.smn","caster.rdm","caster.pct",
] as const;

export const JOB_RANK = Object.fromEntries(
  DEFAULT_JOB_PRIORITY.map((id, i) => [id, i])
) as Record<JobId, number>;

export function jobCmp(a: JobId, b: JobId): number {
  return (JOB_RANK[a] ?? 1e9) - (JOB_RANK[b] ?? 1e9);
}

export function normalizeTeam(input: JobId[]): JobId[] {
  return Array.from(new Set(input)) as JobId[];
}
