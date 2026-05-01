import { memo, useCallback } from "react";
import { useStore } from "../state/store";
import { SKILL_MAP } from "../data/skills";
import { getAstCardIdsForDraw, isAstDrawSkill } from "../logic/astCards";
import type { JobId, PlanUsage, SkillData } from "../types";
import type { CellVisualState } from "./cellStyles";
import { getColorClass, getShapeClass } from "./cellStyles";

interface AstDrawCellProps {
  jobId: JobId;
  skill: SkillData;
  t: number;
  lineIndex: number;
  visual: CellVisualState;
  cycleManualUsages: readonly PlanUsage[];
}

function AstDrawCellComponent({
  jobId,
  skill,
  t,
  lineIndex,
  visual,
  cycleManualUsages,
}: AstDrawCellProps) {
  const addUsage = useStore((s) => s.addUsage);
  const removeUsage = useStore((s) => s.removeUsage);

  const onToggle = useCallback(() => {
    const matchingManual = cycleManualUsages.find(
      (usage) =>
        usage.jobId === jobId &&
        usage.skillId === skill.id &&
        usage.t_sec === t &&
        usage.lineIndex === lineIndex
    );

    if (matchingManual) {
      removeUsage(jobId, skill.id, t, lineIndex);
      return;
    }

    for (const usage of cycleManualUsages) {
      removeUsage(usage.jobId, usage.skillId, usage.t_sec, usage.lineIndex);
    }

    addUsage(jobId, skill.id, t, lineIndex);
  }, [addUsage, cycleManualUsages, jobId, lineIndex, removeUsage, skill.id, t]);

  const isEmpty = visual.color === "none" && visual.shape === "none" && !visual.checked;
  const grantedCards = isAstDrawSkill(skill.id)
    ? getAstCardIdsForDraw(skill.id)
        .map((cardId) => SKILL_MAP[cardId]?.name ?? cardId)
        .join(" / ")
    : "";
  const title = grantedCards ? `${skill.name} (${grantedCards})` : skill.name;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mp-bar ${getColorClass(visual.color)} ${getShapeClass(visual.shape)} ${
        isEmpty ? "mp-bar-empty" : ""
      }`}
      title={title}
    >
      {visual.checked ? "✓" : ""}
    </button>
  );
}

export default memo(AstDrawCellComponent, (prev, next) => {
  return (
    prev.visual.color === next.visual.color &&
    prev.visual.checked === next.visual.checked &&
    prev.visual.shape === next.visual.shape &&
    prev.jobId === next.jobId &&
    prev.skill.id === next.skill.id &&
    prev.t === next.t &&
    prev.lineIndex === next.lineIndex &&
    prev.cycleManualUsages.length === next.cycleManualUsages.length &&
    prev.cycleManualUsages.every((usage, index) => {
      const nextUsage = next.cycleManualUsages[index];
      return (
        usage.jobId === nextUsage?.jobId &&
        usage.skillId === nextUsage?.skillId &&
        usage.t_sec === nextUsage?.t_sec &&
        usage.lineIndex === nextUsage?.lineIndex
      );
    })
  );
});
