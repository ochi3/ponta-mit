import type {
  JobId,
  JobSkillMode,
  JobSkillSet,
  SkillData,
  SkillId,
  JobSkillsMap,
  SkillMap,
  JobSkillsEntry,
} from "../../types";
import {
  SKILLS_TANK, SKILLS_TANK_SECONDARY,
  SKILLS_TANK_WAR, SKILLS_TANK_WAR_SECONDARY,
  SKILLS_TANK_PLD, SKILLS_TANK_PLD_SECONDARY,
  SKILLS_TANK_DRK, SKILLS_TANK_DRK_SECONDARY,
  SKILLS_TANK_GNB, SKILLS_TANK_GNB_SECONDARY,
} from "./tank";
import { SKILLS_MELEE, SKILLS_MELEE_MNK } from "./melee";
import { SKILLS_CASTER, SKILLS_CASTER_PCT, SKILLS_CASTER_RDM } from "./caster";
import { SKILLS_RANGED_BRD, SKILLS_RANGED_DNC, SKILLS_RANGED_MCH } from "./ranged";
import {
  SKILLS_HEALER_WHM, SKILLS_HEALER_WHM_SECONDARY,
  SKILLS_HEALER_AST, SKILLS_HEALER_AST_SECONDARY,
  SKILLS_HEALER_SCH, SKILLS_HEALER_SCH_SECONDARY,
  SKILLS_HEALER_SGE, SKILLS_HEALER_SGE_SECONDARY
} from "./healer";
import {
  EVOLVE_SKILL_SPECS_BY_JOB,
  FALLBACK_EVOLVE_SKILL_SPECS_BY_ROLE,
  type EvolveSkillSpec,
} from "./evolve";
import {
  CUSTOM_EVOLVE_SKILL_SPECS_BY_JOB,
  CUSTOM_SKILL_ENTRIES,
  CUSTOM_SKILL_GROUPS,
  type CustomSkillRow,
} from "./custom";
import { SKILLS_UTILITY_UNKNOWN, SKILLS_UTILITY_UNKNOWN_SECONDARY } from "./utility";

type SkillDataSet = {
  primary: readonly SkillData[];
  secondary?: readonly SkillData[];
};

type EvolveSkillDataSet = {
  primary?: readonly SkillData[];
  secondary?: readonly SkillData[];
  replacePrimary?: boolean;
  replaceSecondary?: boolean;
};

type JobSkillDataGroup = SkillDataSet & {
  evolve?: EvolveSkillDataSet;
};

const ROLE_SKILLS: Record<string, SkillDataSet> = {
  "tank": { primary: SKILLS_TANK, secondary: SKILLS_TANK_SECONDARY },
  "melee": { primary: SKILLS_MELEE },
  "caster": { primary: SKILLS_CASTER },
};

const BASE_SKILL_GROUPS: readonly (readonly SkillData[])[] = [
  ...Object.values(ROLE_SKILLS).flatMap((group) => [group.primary, group.secondary ?? []]),
  ...CUSTOM_SKILL_GROUPS,
  SKILLS_TANK_WAR,
  SKILLS_TANK_WAR_SECONDARY,
  SKILLS_TANK_PLD,
  SKILLS_TANK_PLD_SECONDARY,
  SKILLS_TANK_DRK,
  SKILLS_TANK_DRK_SECONDARY,
  SKILLS_TANK_GNB,
  SKILLS_TANK_GNB_SECONDARY,
  SKILLS_HEALER_WHM,
  SKILLS_HEALER_WHM_SECONDARY,
  SKILLS_HEALER_AST,
  SKILLS_HEALER_AST_SECONDARY,
  SKILLS_HEALER_SCH,
  SKILLS_HEALER_SCH_SECONDARY,
  SKILLS_HEALER_SGE,
  SKILLS_HEALER_SGE_SECONDARY,
  SKILLS_RANGED_BRD,
  SKILLS_RANGED_DNC,
  SKILLS_RANGED_MCH,
  SKILLS_CASTER_PCT,
  SKILLS_CASTER_RDM,
  SKILLS_UTILITY_UNKNOWN,
  SKILLS_UTILITY_UNKNOWN_SECONDARY,
];

const BASE_SKILLS_BY_ID = new Map<SkillId, SkillData>(
  BASE_SKILL_GROUPS.flatMap((group) =>
    group.map((skill) => [skill.id as SkillId, skill] as const)
  )
);

function getEvolveSkillId(jobId: JobId, baseSkillId: SkillId, index: number) {
  const suffix = baseSkillId.split(".").at(-1) || `slot_${index + 1}`;
  return `${jobId}.evolve.${suffix}` as SkillId;
}

function buildEvolveSkills(jobId: JobId, specs: readonly EvolveSkillSpec[]) {
  const skills: SkillData[] = [];

  for (const [index, spec] of specs.entries()) {
    const baseSkill = BASE_SKILLS_BY_ID.get(spec.baseSkillId);
    if (!baseSkill) {
      continue;
    }

    const base = { ...baseSkill };
    delete base.parentSkillId;
    delete base.fflogsAliases;
    delete base.evolveBaseSkillId;

    skills.push({
      ...base,
      ...spec.overrides,
      id: getEvolveSkillId(jobId, spec.baseSkillId, index),
      name: baseSkill.name,
      icon: baseSkill.icon,
      evolveBaseSkillId: spec.baseSkillId,
    });
  }

  return skills;
}

function mergeEvolveSpecs(
  builtInSpecs: readonly EvolveSkillSpec[],
  customSpecs: readonly EvolveSkillSpec[]
) {
  const specsByBaseSkillId = new Map<SkillId, EvolveSkillSpec>();
  for (const spec of builtInSpecs) {
    specsByBaseSkillId.set(spec.baseSkillId, spec);
  }
  for (const spec of customSpecs) {
    specsByBaseSkillId.set(spec.baseSkillId, spec);
  }
  return Array.from(specsByBaseSkillId.values());
}

function withEvolve(jobId: JobId, group: SkillDataSet): JobSkillDataGroup {
  const roleKey = jobId.split(".")[0];
  const evolveSkillSpecs = mergeEvolveSpecs(
    EVOLVE_SKILL_SPECS_BY_JOB[jobId] ??
      FALLBACK_EVOLVE_SKILL_SPECS_BY_ROLE[roleKey] ??
      [],
    CUSTOM_EVOLVE_SKILL_SPECS_BY_JOB[jobId] ?? []
  );
  return {
    ...group,
    evolve: {
      primary: buildEvolveSkills(jobId, evolveSkillSpecs),
      replacePrimary: true,
      replaceSecondary: true,
    },
  };
}

function getCustomSkills(jobId: JobId, row: CustomSkillRow) {
  return CUSTOM_SKILL_ENTRIES
    .filter((entry) => entry.jobId === jobId && (entry.row ?? "primary") === row)
    .map((entry) => entry.skill);
}

function withCustomSkills(jobId: JobId, group: SkillDataSet): SkillDataSet {
  return {
    primary: [...group.primary, ...getCustomSkills(jobId, "primary")],
    secondary: [
      ...(group.secondary ?? []),
      ...getCustomSkills(jobId, "secondary"),
    ],
  };
}

const JOB_SKILL_GROUPS: Record<JobId, JobSkillDataGroup> = {
  "tank.war": withEvolve("tank.war", withCustomSkills("tank.war", { primary: SKILLS_TANK_WAR, secondary: SKILLS_TANK_WAR_SECONDARY })),
  "tank.pld": withEvolve("tank.pld", withCustomSkills("tank.pld", { primary: SKILLS_TANK_PLD, secondary: SKILLS_TANK_PLD_SECONDARY })),
  "tank.drk": withEvolve("tank.drk", withCustomSkills("tank.drk", { primary: SKILLS_TANK_DRK, secondary: SKILLS_TANK_DRK_SECONDARY })),
  "tank.gnb": withEvolve("tank.gnb", withCustomSkills("tank.gnb", { primary: SKILLS_TANK_GNB, secondary: SKILLS_TANK_GNB_SECONDARY })),

  "healer.whm": withEvolve("healer.whm", withCustomSkills("healer.whm", { primary: SKILLS_HEALER_WHM, secondary: SKILLS_HEALER_WHM_SECONDARY })),
  "healer.sch": withEvolve("healer.sch", withCustomSkills("healer.sch", { primary: SKILLS_HEALER_SCH, secondary: SKILLS_HEALER_SCH_SECONDARY })),
  "healer.ast": withEvolve("healer.ast", withCustomSkills("healer.ast", { primary: SKILLS_HEALER_AST, secondary: SKILLS_HEALER_AST_SECONDARY })),
  "healer.sge": withEvolve("healer.sge", withCustomSkills("healer.sge", { primary: SKILLS_HEALER_SGE, secondary: SKILLS_HEALER_SGE_SECONDARY })),

  "melee.drg": withEvolve("melee.drg", withCustomSkills("melee.drg", { primary: [] })),
  "melee.mnk": withEvolve("melee.mnk", withCustomSkills("melee.mnk", { primary: SKILLS_MELEE_MNK })),
  "melee.nin": withEvolve("melee.nin", withCustomSkills("melee.nin", { primary: [] })),
  "melee.rpr": withEvolve("melee.rpr", withCustomSkills("melee.rpr", { primary: [] })),
  "melee.sam": withEvolve("melee.sam", withCustomSkills("melee.sam", { primary: [] })),
  "melee.vpr": withEvolve("melee.vpr", withCustomSkills("melee.vpr", { primary: [] })),

  "ranged.brd": withEvolve("ranged.brd", withCustomSkills("ranged.brd", { primary: SKILLS_RANGED_BRD })),
  "ranged.dnc": withEvolve("ranged.dnc", withCustomSkills("ranged.dnc", { primary: SKILLS_RANGED_DNC })),
  "ranged.mch": withEvolve("ranged.mch", withCustomSkills("ranged.mch", { primary: SKILLS_RANGED_MCH })),

  "caster.blm": withEvolve("caster.blm", withCustomSkills("caster.blm", { primary: [] })),
  "caster.pct": withEvolve("caster.pct", withCustomSkills("caster.pct", { primary: SKILLS_CASTER_PCT })),
  "caster.rdm": withEvolve("caster.rdm", withCustomSkills("caster.rdm", { primary: SKILLS_CASTER_RDM })),
  "caster.smn": withEvolve("caster.smn", withCustomSkills("caster.smn", { primary: [] })),

  "utility.unknown": {
    primary: SKILLS_UTILITY_UNKNOWN,
    secondary: SKILLS_UTILITY_UNKNOWN_SECONDARY,
  },
};

function toSkillIds(skills: Iterable<SkillData>) {
  const skillIds = new Set<SkillId>();
  for (const skill of skills) {
    skillIds.add(skill.id as SkillId);
  }
  return Array.from(skillIds);
}

function buildSkillSet(
  roleGroup: SkillDataSet | undefined,
  jobGroup: JobSkillDataGroup,
  mode: JobSkillMode
): JobSkillSet {
  const evolveGroup = mode === "evolve" ? jobGroup.evolve : undefined;
  const rolePrimary = evolveGroup?.replacePrimary ? [] : roleGroup?.primary ?? [];
  const roleSecondary = evolveGroup?.replaceSecondary ? [] : roleGroup?.secondary ?? [];
  const jobPrimary =
    evolveGroup?.replacePrimary
      ? [...(evolveGroup.primary ?? [])]
      : [...jobGroup.primary, ...(evolveGroup?.primary ?? [])];
  const jobSecondary =
    evolveGroup?.replaceSecondary
      ? [...(evolveGroup.secondary ?? [])]
      : [...(jobGroup.secondary ?? []), ...(evolveGroup?.secondary ?? [])];
  const primary = toSkillIds([...rolePrimary, ...jobPrimary]);
  const secondary = toSkillIds([...roleSecondary, ...jobSecondary]);
  const skillSet: JobSkillSet = { primary };
  if (secondary.length > 0) skillSet.secondary = secondary;
  return skillSet;
}

export const JOB_SKILLS: JobSkillsMap = Object.fromEntries(
  Object.entries(JOB_SKILL_GROUPS).map(([jobId, jobGroup]) => {
    const roleKey = jobId.split(".")[0];
    const roleGroup = ROLE_SKILLS[roleKey];

    const normalSkillSet = buildSkillSet(roleGroup, jobGroup, "normal");
    const entry: JobSkillsEntry = { ...normalSkillSet };
    if (jobGroup.evolve) {
      entry.evolve = buildSkillSet(roleGroup, jobGroup, "evolve");
    }

    return [jobId as JobId, entry];
  })
) as JobSkillsMap;

function resolveSkillSet(entry: JobSkillsEntry | undefined, mode: JobSkillMode) {
  if (!entry) return null;
  return mode === "evolve" ? entry.evolve ?? entry : entry;
}

export function hasSecondarySkills(jobId: JobId, mode: JobSkillMode = "normal"): boolean {
  const entry = JOB_SKILLS[jobId];
  return Boolean(resolveSkillSet(entry, mode)?.secondary?.length);
}

export function getJobSkillIds(
  jobId: JobId,
  includeSecondary: boolean,
  mode: JobSkillMode = "normal"
): SkillId[] {
  const entry = JOB_SKILLS[jobId];
  const skillSet = resolveSkillSet(entry, mode);
  if (!skillSet) return [];
  const skills = [...skillSet.primary];
  if (includeSecondary && skillSet.secondary) {
    skills.push(...skillSet.secondary);
  }
  return skills;
}

const ALL_SKILLS: SkillData[] = [
  ...Object.values(ROLE_SKILLS).flatMap(g => [...g.primary, ...(g.secondary ?? [])]),
  ...Object.values(JOB_SKILL_GROUPS).flatMap(g => [
    ...g.primary,
    ...(g.secondary ?? []),
    ...(g.evolve?.primary ?? []),
    ...(g.evolve?.secondary ?? []),
  ]),
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
