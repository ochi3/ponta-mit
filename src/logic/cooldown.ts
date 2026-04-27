import type { PlanUsage } from "../types";
import type { Interval } from "./colors";

/** Get sorted usage times (seconds) for a specific job+skill. */
export function usageTimesForSkill(
  usages: PlanUsage[],
  jobId: string,
  skillId: string
): number[] {
  return usages
    .filter(u => u.jobId === jobId && u.skillId === skillId)
    .map(u => u.t_sec)
    .sort((a,b) => a - b);
}

/** Test if a second lies inside any interval (half-open). */
export function isInAnyInterval(t: number, list: Interval[]): boolean {
  for (const itv of list) {
    if (t >= itv.start && t < itv.end) return true;
  }
  return false;
}

/** Is the cell explicitly checked (selected)? */
export function isChecked(
  usages: PlanUsage[],
  jobId: string,
  skillId: string,
  t: number
): boolean {
  return usages.some(u => u.jobId === jobId && u.skillId === skillId && u.t_sec === t);
}
