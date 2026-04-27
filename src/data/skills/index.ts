import type { JobId, SkillData, SkillId, JobSkillsMap, SkillMap, JobSkillsEntry } from "../../types";
import {
  SKILLS_TANK, SKILLS_TANK_SECONDARY,
  SKILLS_TANK_WAR, SKILLS_TANK_WAR_SECONDARY,
  SKILLS_TANK_PLD, SKILLS_TANK_PLD_SECONDARY,
  SKILLS_TANK_DRK, SKILLS_TANK_DRK_SECONDARY,
  SKILLS_TANK_GNB, SKILLS_TANK_GNB_SECONDARY,
} from "./tank";
import { SKILLS_MELEE } from "./melee";
import { SKILLS_CASTER, SKILLS_CASTER_PCT, SKILLS_CASTER_RDM } from "./caster";
import { SKILLS_RANGED_BRD, SKILLS_RANGED_DNC, SKILLS_RANGED_MCH } from "./ranged";
import {
  SKILLS_HEALER_WHM, SKILLS_HEALER_WHM_SECONDARY,
  SKILLS_HEALER_AST, SKILLS_HEALER_AST_SECONDARY,
  SKILLS_HEALER_SCH, SKILLS_HEALER_SCH_SECONDARY,
  SKILLS_HEALER_SGE, SKILLS_HEALER_SGE_SECONDARY
} from "./healer";

const ROLE_SKILLS: Record<string, { primary: readonly SkillData[]; secondary?: readonly SkillData[] }> = {
  "tank": { primary: SKILLS_TANK, secondary: SKILLS_TANK_SECONDARY },
  "melee": { primary: SKILLS_MELEE },
  "caster": { primary: SKILLS_CASTER },
};

const JOB_SKILL_GROUPS: Record<JobId, { primary: readonly SkillData[]; secondary?: readonly SkillData[] }> = {
  "tank.war": { primary: SKILLS_TANK_WAR, secondary: SKILLS_TANK_WAR_SECONDARY },
  "tank.pld": { primary: SKILLS_TANK_PLD, secondary: SKILLS_TANK_PLD_SECONDARY },
  "tank.drk": { primary: SKILLS_TANK_DRK, secondary: SKILLS_TANK_DRK_SECONDARY },
  "tank.gnb": { primary: SKILLS_TANK_GNB, secondary: SKILLS_TANK_GNB_SECONDARY },

  "healer.whm": { primary: SKILLS_HEALER_WHM, secondary: SKILLS_HEALER_WHM_SECONDARY },
  "healer.sch": { primary: SKILLS_HEALER_SCH, secondary: SKILLS_HEALER_SCH_SECONDARY },
  "healer.ast": { primary: SKILLS_HEALER_AST, secondary: SKILLS_HEALER_AST_SECONDARY },
  "healer.sge": { primary: SKILLS_HEALER_SGE, secondary: SKILLS_HEALER_SGE_SECONDARY },

  "melee.drg": { primary: [] },
  "melee.mnk": { primary: [] },
  "melee.nin": { primary: [] },
  "melee.rpr": { primary: [] },
  "melee.sam": { primary: [] },
  "melee.vpr": { primary: [] },

  "ranged.brd": { primary: SKILLS_RANGED_BRD },
  "ranged.dnc": { primary: SKILLS_RANGED_DNC },
  "ranged.mch": { primary: SKILLS_RANGED_MCH },

  "caster.blm": { primary: [] },
  "caster.pct": { primary: SKILLS_CASTER_PCT },
  "caster.rdm": { primary: SKILLS_CASTER_RDM },
  "caster.smn": { primary: [] },
};

export const JOB_SKILLS: JobSkillsMap = Object.fromEntries(
  Object.entries(JOB_SKILL_GROUPS).map(([jobId, jobGroup]) => {
    const roleKey = jobId.split(".")[0];
    const roleGroup = ROLE_SKILLS[roleKey];

    const primaryMap = new Map<SkillId, SkillData>();
    for (const s of roleGroup?.primary ?? []) primaryMap.set(s.id as SkillId, s);
    for (const s of jobGroup.primary) primaryMap.set(s.id as SkillId, s);
    const primary = Array.from(primaryMap.keys());

    const secondaryMap = new Map<SkillId, SkillData>();
    for (const s of roleGroup?.secondary ?? []) secondaryMap.set(s.id as SkillId, s);
    for (const s of jobGroup.secondary ?? []) secondaryMap.set(s.id as SkillId, s);
    const secondary = Array.from(secondaryMap.keys());

    const entry: JobSkillsEntry = { primary };
    if (secondary.length > 0) entry.secondary = secondary;

    return [jobId as JobId, entry];
  })
) as JobSkillsMap;

export function hasSecondarySkills(jobId: JobId): boolean {
  const entry = JOB_SKILLS[jobId];
  return Boolean(entry?.secondary?.length);
}

export function getJobSkillIds(jobId: JobId, includeSecondary: boolean): SkillId[] {
  const entry = JOB_SKILLS[jobId];
  if (!entry) return [];
  const skills = [...entry.primary];
  if (includeSecondary && entry.secondary) {
    skills.push(...entry.secondary);
  }
  return skills;
}

const ALL_SKILLS: SkillData[] = [
  ...Object.values(ROLE_SKILLS).flatMap(g => [...g.primary, ...(g.secondary ?? [])]),
  ...Object.values(JOB_SKILL_GROUPS).flatMap(g => [...g.primary, ...(g.secondary ?? [])]),
];

export const SKILL_MAP: SkillMap = Object.fromEntries(
  ALL_SKILLS.map((s) => [s.id as SkillId, s])
) as SkillMap;

(function guardUnique() {
  const seen = new Set<string>();
  for (const s of Object.values(SKILL_MAP)) {
    if (seen.has(s.id)) throw new Error(`Duplicate SkillId: ${s.id}`);
    seen.add(s.id);
  }
})();
