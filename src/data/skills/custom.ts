import type { JobId, SkillData, SkillId } from "../../types";
import type { EvolveSkillPerformanceOverrides, EvolveSkillSpec } from "./evolve";

export type CustomSkillRow = "primary" | "secondary";

export type CustomSkillEntry = {
  jobId: JobId;
  row?: CustomSkillRow;
  skill: SkillData;
};

export type CustomEvolveSkillEntry = {
  jobId: JobId;
  baseSkillId: SkillId;
  overrides?: EvolveSkillPerformanceOverrides;
};

export type CustomSkillPack = {
  skills?: readonly CustomSkillEntry[];
  evolve?: readonly CustomEvolveSkillEntry[];
};

const CUSTOM_SKILL_MODULES = import.meta.glob<{ default: CustomSkillPack }>(
  "./custom/*.json",
  { eager: true }
);

function getCustomSkillPacks() {
  return Object.values(CUSTOM_SKILL_MODULES).map((module) => module.default);
}

export const CUSTOM_SKILL_ENTRIES: readonly CustomSkillEntry[] =
  getCustomSkillPacks().flatMap((pack) => pack.skills ?? []);

export const CUSTOM_SKILL_GROUPS: readonly (readonly SkillData[])[] =
  CUSTOM_SKILL_ENTRIES.map((entry) => [entry.skill]);

export const CUSTOM_EVOLVE_SKILL_SPECS_BY_JOB: Record<
  JobId,
  readonly EvolveSkillSpec[]
> = {};

for (const entry of getCustomSkillPacks().flatMap((pack) => pack.evolve ?? [])) {
  const specs = CUSTOM_EVOLVE_SKILL_SPECS_BY_JOB[entry.jobId] ?? [];
  CUSTOM_EVOLVE_SKILL_SPECS_BY_JOB[entry.jobId] = [
    ...specs,
    entry.overrides
      ? { baseSkillId: entry.baseSkillId, overrides: entry.overrides }
      : { baseSkillId: entry.baseSkillId },
  ];
}
