import type { PlanUsage, SkillData } from "../types";

export function getParentChildWindowEndSec(
  parentStartSec: number,
  parentDuration: number,
  childSkill?: Pick<SkillData, "parentGracePeriod_s"> | null
): number {
  const grace = childSkill?.parentGracePeriod_s ?? 0;
  return parentStartSec + parentDuration + grace;
}

export function isChildWithinParentWindow(
  childUsage: Pick<PlanUsage, "t_sec" | "lineIndex">,
  parentUsage: Pick<PlanUsage, "t_sec" | "lineIndex">,
  parentDuration: number,
  childSkill?: Pick<SkillData, "parentGracePeriod_s"> | null
): boolean {
  const parentStart = parentUsage.t_sec;
  const parentEnd = getParentChildWindowEndSec(parentStart, parentDuration, childSkill);

  if (childUsage.t_sec > parentStart && childUsage.t_sec <= parentEnd) {
    return true;
  }
  if (childUsage.t_sec === parentStart && childUsage.lineIndex >= parentUsage.lineIndex) {
    return true;
  }
  return false;
}
