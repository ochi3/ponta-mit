import type { SkillData } from "../types";
import {IMPROV_SHIELD_PCT_BY_STACK} from "../data/skills/ranged";

export function getShieldPctForImprovisation(
  skill: SkillData,
  ctx: { stacks?: number }
): number {
  if (skill.id === "ranged.dnc.improvisation") {
    const s = Math.max(0, Math.min(skill.maxStacks ?? 0, ctx.stacks ?? 0));
    return IMPROV_SHIELD_PCT_BY_STACK[s] ?? 0;
  }
  return skill.unique_pct ?? 0;
}