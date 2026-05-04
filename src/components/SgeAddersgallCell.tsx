import { memo, useCallback } from "react";
import { useStore } from "../state/store";
import type { JobId, PlanUsage, SkillData } from "../types";
import type { CellVisualState } from "./cellStyles";
import { getColorClass, getShapeClass } from "./cellStyles";

interface SgeAddersgallCellProps {
  jobId: JobId;
  skill: SkillData;
  t: number;
  lineIndex: number;
  visual: CellVisualState;
  usage?: PlanUsage;
}

function normalizeCount(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(3, Math.floor(value)));
}

function SgeAddersgallCellComponent({
  jobId,
  skill,
  t,
  lineIndex,
  visual,
  usage,
}: SgeAddersgallCellProps) {
  const addUsage = useStore((s) => s.addUsage);
  const updateUsageStacks = useStore((s) => s.updateUsageStacks);
  const removeUsage = useStore((s) => s.removeUsage);

  const onToggle = useCallback(() => {
    const current = normalizeCount(usage?.stacks ?? visual.chargeCount);

    if (!usage) {
      addUsage(jobId, skill.id, t, lineIndex, 0);
      return;
    }

    if (current >= 3) {
      removeUsage(jobId, skill.id, t, lineIndex);
      return;
    }

    updateUsageStacks(jobId, skill.id, t, lineIndex, current + 1);
  }, [
    addUsage,
    jobId,
    lineIndex,
    removeUsage,
    skill.id,
    t,
    updateUsageStacks,
    usage,
    visual.chargeCount,
  ]);

  const isEmpty =
    visual.color === "none" && visual.shape === "none" && !visual.checked;
  const addersgallCount = normalizeCount(visual.chargeCount);
  const title = usage
    ? `${skill.name}: 手動補正 ${normalizeCount(usage.stacks)}`
    : `${skill.name}: アダーガル ${addersgallCount}。クリックで0から手動補正`;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`mp-bar ${getColorClass(visual.color)} ${getShapeClass(visual.shape)} ${
        isEmpty ? "mp-bar-empty" : ""
      }`}
      title={title}
    >
      <span className="mp-charge-count" aria-hidden="true">
        {addersgallCount}
      </span>
      <span className="mp-resource-value" aria-hidden="true">
        {usage ? "*" : ""}
      </span>
    </button>
  );
}

export default memo(SgeAddersgallCellComponent, (prev, next) => {
  return (
    prev.visual.color === next.visual.color &&
    prev.visual.checked === next.visual.checked &&
    prev.visual.shape === next.visual.shape &&
    prev.visual.chargeCount === next.visual.chargeCount &&
    prev.jobId === next.jobId &&
    prev.skill.id === next.skill.id &&
    prev.t === next.t &&
    prev.lineIndex === next.lineIndex &&
    prev.usage?.stacks === next.usage?.stacks &&
    prev.usage?.t_sec === next.usage?.t_sec &&
    prev.usage?.lineIndex === next.usage?.lineIndex
  );
});
