import { memo, useCallback } from "react";
import { useStore } from "../state/store";
import type { JobId, PlanUsage, SkillData } from "../types";
import type { CellVisualState } from "./cellStyles";
import { getColorClass, getShapeClass } from "./cellStyles";

interface SchAetherflowCellProps {
  jobId: JobId;
  skill: SkillData;
  t: number;
  lineIndex: number;
  visual: CellVisualState;
  cycleManualUsages: readonly PlanUsage[];
}

function SchAetherflowCellComponent({
  jobId,
  skill,
  t,
  lineIndex,
  visual,
  cycleManualUsages,
}: SchAetherflowCellProps) {
  const addUsage = useStore((s) => s.addUsage);
  const removeUsage = useStore((s) => s.removeUsage);

  const onToggle = useCallback(() => {
    const matchingManualUsage = cycleManualUsages.find(
      (usage) =>
        usage.jobId === jobId &&
        usage.skillId === skill.id &&
        usage.t_sec === t &&
        usage.lineIndex === lineIndex
    );

    if (matchingManualUsage) {
      removeUsage(jobId, skill.id, t, lineIndex);
      return;
    }

    for (const usage of cycleManualUsages) {
      removeUsage(usage.jobId, usage.skillId, usage.t_sec, usage.lineIndex);
    }

    addUsage(jobId, skill.id, t, lineIndex);
  }, [addUsage, cycleManualUsages, jobId, lineIndex, removeUsage, skill.id, t]);

  const isEmpty = visual.color === "none" && visual.shape === "none" && !visual.checked;
  const availableLabel =
    typeof visual.chargeCount === "number" ? `残り ${visual.chargeCount}` : "残り不明";
  const title = visual.checked
    ? `${skill.name} (${availableLabel} / この位置で回復)`
    : `${skill.name} (${availableLabel})`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mp-bar ${getColorClass(visual.color)} ${getShapeClass(visual.shape)} ${
        isEmpty ? "mp-bar-empty" : ""
      }`}
      title={title}
    >
      {typeof visual.chargeCount === "number" && (
        <span className="mp-charge-count" aria-hidden="true">
          {visual.chargeCount}
        </span>
      )}
      <span className="mp-resource-value" aria-hidden="true">
        {visual.checked ? "✓" : ""}
      </span>
    </button>
  );
}

export default memo(SchAetherflowCellComponent, (prev, next) => {
  return (
    prev.visual.color === next.visual.color &&
    prev.visual.checked === next.visual.checked &&
    prev.visual.shape === next.visual.shape &&
    prev.visual.chargeCount === next.visual.chargeCount &&
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
