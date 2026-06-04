import type { SkillData } from "../types";
import { IMPROV_SHIELD_PCT_BY_STACK } from "../data/skills/ranged";

export function getStackShieldPct(
  skill: SkillData,
  ctx: { stacks?: number }
): number {
  const stacks = Math.max(0, Math.min(skill.maxStacks ?? 0, ctx.stacks ?? 0));

  if (skill.id === "ranged.dnc.improvised_finish") {
    return IMPROV_SHIELD_PCT_BY_STACK[stacks] ?? 0;
  }

  return skill.shield_pct_target ?? skill.shield_pct_self ?? 0;
}

/** @deprecated getStackShieldPct を使用 */
export function getShieldPctForImprovisation(
  skill: SkillData,
  ctx: { stacks?: number }
): number {
  return getStackShieldPct(skill, ctx);
}
