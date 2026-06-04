import { memo, useCallback } from "react";
import { useStore } from "../state/store";
import type { SkillData, JobId, PlanUsage } from "../types";
import { type CellVisualState, getColorClass, getShapeClass } from "./cellStyles";
import { getChargeCapacity, isChargeSkill } from "../logic/skillCharges";
import { getStackShieldPct } from "../logic/getShieldPct";
import { getEffectDurationS, getEffectMitigationPct } from "../logic/skillEffect";

interface StackCellProps {
  jobId: JobId;
  skill: SkillData;
  t: number;
  lineIndex: number;
  visual: CellVisualState;
  usage?: PlanUsage;
}

function StackCellComponent({
  jobId,
  skill,
  t,
  lineIndex,
  visual,
  usage,
}: StackCellProps) {
  const addUsage = useStore((s) => s.addUsage);
  const updateUsageStacks = useStore((s) => s.updateUsageStacks);
  const removeUsage = useStore((s) => s.removeUsage);

  const { color, checked, shape } = visual;
  const chargeSkill = isChargeSkill(skill);
  const maxStacks = chargeSkill ? getChargeCapacity(skill) : skill.maxStacks ?? 0;
  const currentStacks = checked
    ? chargeSkill
      ? usage?.stacks ?? 1
      : usage?.stacks ?? 0
    : 0;
  const availableChargeCount = visual.chargeCount ?? maxStacks;
  const maxSelectableStacks = chargeSkill
    ? Math.max(availableChargeCount, currentStacks)
    : Math.max(maxStacks, currentStacks);

  const onClickCell = useCallback(() => {
    if (chargeSkill) {
      if (checked) {
        removeUsage(jobId, skill.id, t, lineIndex);
        return;
      }

      if (availableChargeCount <= 0) {
        return;
      }

      addUsage(jobId, skill.id, t, lineIndex, 1);
      return;
    }

    if (maxSelectableStacks <= 0) {
      return;
    }

    let nextStacks = 1;
    if (checked && currentStacks > 0) {
      nextStacks = currentStacks < maxSelectableStacks ? currentStacks + 1 : 0;
    }

    if (nextStacks <= 0) {
      removeUsage(jobId, skill.id, t, lineIndex);
      return;
    }

    if (checked) {
      updateUsageStacks(jobId, skill.id, t, lineIndex, nextStacks);
    } else {
      addUsage(jobId, skill.id, t, lineIndex, nextStacks);
    }
  }, [
    addUsage,
    availableChargeCount,
    checked,
    chargeSkill,
    currentStacks,
    jobId,
    lineIndex,
    maxSelectableStacks,
    removeUsage,
    skill.id,
    t,
    updateUsageStacks,
  ]);

  const isEmpty = color === "none" && shape === "none" && !checked;
  const stackLabel =
    checked && currentStacks > 0 && skill.stackDisplayLabels?.[currentStacks]
      ? skill.stackDisplayLabels[currentStacks]
      : checked && currentStacks > 0
        ? String(currentStacks)
        : "";
  const displayValue = stackLabel;
  const usageLabel = chargeSkill
    ? `Use ${displayValue || "0"} / Ready ${availableChargeCount}`
    : `Stacks ${displayValue || "0"}`;
  const effectNote = (() => {
    if (!checked || currentStacks <= 0) {
      return "";
    }
    const duration = getEffectDurationS(skill, { stacks: currentStacks });
    const mitPct = getEffectMitigationPct(skill, { stacks: currentStacks });
    if (mitPct > 0) {
      return ` ${duration}秒 軽減${Math.round(mitPct * 100)}%`;
    }
    if (skill.kinds.includes("shield")) {
      return ` 盾${Math.round(getStackShieldPct(skill, { stacks: currentStacks }) * 100)}%`;
    }
    return duration > 0 ? ` ${duration}秒` : "";
  })();
  const title = `${skill.name} (${usageLabel})${effectNote}`;
  const actionLabel = checked ? "remove" : "set";

  return (
    <div
      className={`mp-bar ${getColorClass(color)} ${getShapeClass(shape)} ${
        isEmpty ? "mp-bar-empty" : ""
      }`}
      title={title}
    >
      {chargeSkill && (
        <span className="mp-charge-count" aria-hidden="true">
          {availableChargeCount}
        </span>
      )}
      <button
        type="button"
        className="mp-stack-button"
        onClick={onClickCell}
        aria-label={`${title}. Click to ${actionLabel}.`}
      >
        <span className="mp-stack-value" aria-hidden="true">
          {displayValue}
        </span>
      </button>
    </div>
  );
}

export default memo(StackCellComponent, (prev, next) => {
  return (
    prev.visual.color === next.visual.color &&
    prev.visual.checked === next.visual.checked &&
    prev.visual.shape === next.visual.shape &&
    prev.jobId === next.jobId &&
    prev.skill.id === next.skill.id &&
    prev.t === next.t &&
    prev.lineIndex === next.lineIndex &&
    prev.usage?.stacks === next.usage?.stacks &&
    prev.visual.chargeCount === next.visual.chargeCount &&
    prev.visual.chargeCapacity === next.visual.chargeCapacity
  );
});
