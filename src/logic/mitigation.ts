import type { ElementType, PlanUsage, SkillData } from "../types";

export interface ActiveMitigationEffect {
  skill: SkillData;
  usage: PlanUsage;
  multiplier: number;
  immune: boolean;
}

export interface MitigationSummary {
  effects: ActiveMitigationEffect[];
  hitTaken?: number;
  dotTaken?: number;
  multiplier: number;
  mitigationPct: number;
  immune: boolean;
}

const IMMUNE_INVULN_SKILL_IDS = new Set([
  "tank.pld.hallowed_ground",
  "tank.gnb.superbolide",
]);

function floorsDamage(value: number, multiplier: number): number {
  return Math.max(0, Math.floor(value * multiplier));
}

function isTankPersonalSkill(skill: SkillData): boolean {
  if (!skill.id.startsWith("tank.")) {
    return false;
  }

  return skill.scope === "self" || skill.scope === "single_target" || skill.scope === "single_party";
}

export function isUsageActiveAtPoint(
  usage: PlanUsage,
  skill: SkillData,
  tSec: number,
  lineIndex: number
): boolean {
  const duration = skill.duration_s ?? 0;

  if (duration <= 0) {
    return usage.t_sec === tSec && usage.lineIndex === lineIndex;
  }

  const effectEndSec = usage.t_sec + duration;
  if (tSec < usage.t_sec || tSec >= effectEndSec) {
    return false;
  }

  if (tSec === usage.t_sec && lineIndex < usage.lineIndex) {
    return false;
  }

  return true;
}

export function getMitigationMultiplier(
  skill: SkillData,
  elem: ElementType
): number {
  if (!skill.kinds.includes("mitigation")) {
    return 1;
  }

  if (elem === "physical") {
    return skill.phys_pct ?? 1;
  }
  if (elem === "magic") {
    return skill.magic_pct ?? 1;
  }
  if (elem === "unique") {
    return 1;
  }
  return 1;
}

export function summarizeMitigation(
  effects: ActiveMitigationEffect[],
  damage?: number,
  dot?: number
): MitigationSummary {
  const immune = effects.some((effect) => effect.immune);
  const multiplier = immune
    ? 0
    : effects.reduce((product, effect) => product * effect.multiplier, 1);

  return {
    effects,
    hitTaken:
      typeof damage === "number"
        ? immune
          ? 0
          : floorsDamage(damage, multiplier)
        : undefined,
    dotTaken:
      typeof dot === "number"
        ? immune
          ? 0
          : floorsDamage(dot, multiplier)
        : undefined,
    multiplier,
    mitigationPct: 1 - multiplier,
    immune,
  };
}

export function buildMitigationEffect(
  skill: SkillData,
  usage: PlanUsage,
  elem: ElementType
): ActiveMitigationEffect | null {
  if (isTankPersonalSkill(skill)) {
    return null;
  }

  if (skill.kinds.includes("shield")) {
    return null;
  }

  if (typeof skill.block === "number" || typeof skill.parry === "number") {
    return null;
  }

  const immune = skill.invuln === true && IMMUNE_INVULN_SKILL_IDS.has(skill.id);
  if (skill.invuln === true && !immune) {
    return null;
  }

  const multiplier = getMitigationMultiplier(skill, elem);
  const hasDeterministicMitigation = multiplier < 1 || immune;

  if (!hasDeterministicMitigation) {
    return null;
  }

  return {
    skill,
    usage,
    multiplier,
    immune,
  };
}

export function buildTargetMitigationEffect(
  skill: SkillData,
  usage: PlanUsage,
  elem: ElementType,
  targetJobId: string
): ActiveMitigationEffect | null {
  if (!isTankPersonalSkill(skill)) {
    return buildMitigationEffect(skill, usage, elem);
  }

  if (usage.jobId !== targetJobId) {
    return null;
  }

  if (skill.kinds.includes("shield")) {
    return null;
  }

  if (typeof skill.block === "number" || typeof skill.parry === "number") {
    return null;
  }

  const immune = skill.invuln === true && IMMUNE_INVULN_SKILL_IDS.has(skill.id);
  if (skill.invuln === true && !immune) {
    return null;
  }

  const multiplier = getMitigationMultiplier(skill, elem);
  const hasDeterministicMitigation = multiplier < 1 || immune;

  if (!hasDeterministicMitigation) {
    return null;
  }

  return {
    skill,
    usage,
    multiplier,
    immune,
  };
}
