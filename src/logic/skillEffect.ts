import type { ElementType, PlanUsage, SkillData } from "../types";
import {
  TANK_LB_DURATION_S_BY_STACK,
  TANK_LB_MITIGATION_PCT_BY_STACK,
} from "../data/skills/utility";

export function getEffectDurationS(
  skill: SkillData,
  usage?: Pick<PlanUsage, "stacks">
): number {
  if (skill.id === "utility.unknown.lb") {
    const stacks = Math.max(0, Math.min(skill.maxStacks ?? 0, usage?.stacks ?? 0));
    return TANK_LB_DURATION_S_BY_STACK[stacks] ?? 0;
  }

  return skill.duration_s ?? 0;
}

export function getEffectMitigationPct(
  skill: SkillData,
  usage?: Pick<PlanUsage, "stacks">
): number {
  if (skill.id === "utility.unknown.lb") {
    const stacks = Math.max(0, Math.min(skill.maxStacks ?? 0, usage?.stacks ?? 0));
    return TANK_LB_MITIGATION_PCT_BY_STACK[stacks] ?? 0;
  }

  return 0;
}

export function getStackMitigationMultiplier(
  skill: SkillData,
  elem: ElementType,
  usage?: Pick<PlanUsage, "stacks">
): number | null {
  const mitPct = getEffectMitigationPct(skill, usage);
  if (mitPct <= 0) {
    return null;
  }

  if (elem === "physical" || elem === "magic") {
    return 1 - mitPct;
  }

  return 1;
}
