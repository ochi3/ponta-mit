import type { PlanUsage, SkillData } from "../types";
import type { CellColor } from "./colors";

/** Cell highlight: selected/effect window vs cooldown overlap. */
export function colorForCellRow(
  usages: PlanUsage[],
  jobId: string,
  skill: SkillData,
  t: number,
  lineIndex: number
): { color: CellColor; checked: boolean } {
  const skillUsages = usages.filter(
    u => u.jobId === jobId && u.skillId === skill.id
  );

  const dur = skill.duration_s ?? 0;
  const cd  = skill.cooldown_s ?? 0;

  let effectCount = 0;
  let cooldownCount = 0;
  let checked = false;

  for (const u of skillUsages) {
    const sameSecond = u.t_sec === t;

    if (sameSecond && u.lineIndex === lineIndex) {
      checked = true;
    }

    let inEffect = false;
    if (dur > 0) {
      if (t > u.t_sec && t < u.t_sec + dur) {
        inEffect = true;
      } else if (t === u.t_sec && lineIndex >= u.lineIndex) {
        inEffect = true;
      }
    }

    const inCooldown = cd > 0 && t > u.t_sec && t <= u.t_sec + cd;

    if (inEffect) effectCount++;
    else if (inCooldown) cooldownCount++;
  }

  const total = effectCount + cooldownCount;

  let color: CellColor = "none";

  if (total >= 2) {
    color = "conflict";
  } else if (effectCount >= 1 || checked) {
    color = "green";
  } else if (cooldownCount >= 1) {
    color = "red";
  }

  return { color, checked };
}