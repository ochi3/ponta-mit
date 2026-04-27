import { memo, useCallback, useMemo } from "react";
import { useStore } from "../state/store";
import type { SkillData, JobId, PlanUsage } from "../types";
import { type CellVisualState, getColorClass, getShapeClass } from "./cellStyles";

// Special value to represent "not used" state
const NOT_USED_VALUE = "-";

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
  const maxStacks = skill.maxStacks ?? 0;
  const currentStacks = usage?.stacks ?? 0;

  // Memoize stack options to avoid recreating array on each render
  const stackOptions = useMemo(
    () => Array.from({ length: maxStacks + 1 }, (_, i) => i),
    [maxStacks]
  );

  const onStackChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    
    if (value === NOT_USED_VALUE) {
      // Remove usage when selecting "not used"
      if (checked) {
        removeUsage(jobId, skill.id, t, lineIndex);
      }
    } else {
      const newStacks = parseInt(value, 10);
      if (checked) {
        // Update existing usage
        updateUsageStacks(jobId, skill.id, t, lineIndex, newStacks);
      } else {
        // Add new usage with stacks
        addUsage(jobId, skill.id, t, lineIndex, newStacks);
      }
    }
  }, [checked, jobId, skill.id, t, lineIndex, addUsage, updateUsageStacks, removeUsage]);

  const isEmpty = color === "none" && shape === "none" && !checked;
  const selectValue = checked ? String(currentStacks) : NOT_USED_VALUE;

  return (
    <div
      className={`mp-bar ${getColorClass(color)} ${getShapeClass(shape)} ${
        isEmpty ? "mp-bar-empty" : ""
      }`}
      title={skill.name}
    >
      <select
        className="mp-stack-select"
        value={selectValue}
        onChange={onStackChange}
      >
        <option value={NOT_USED_VALUE}>-</option>
        {stackOptions.map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}

// Memoize to prevent re-renders when props haven't changed
export default memo(StackCellComponent, (prev, next) => {
  return (
    prev.visual.color === next.visual.color &&
    prev.visual.checked === next.visual.checked &&
    prev.visual.shape === next.visual.shape &&
    prev.jobId === next.jobId &&
    prev.skill.id === next.skill.id &&
    prev.t === next.t &&
    prev.lineIndex === next.lineIndex &&
    prev.usage?.stacks === next.usage?.stacks
  );
});
