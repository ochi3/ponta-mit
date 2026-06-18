import { memo, useCallback } from "react";
import { useStore } from "../state/store";
import type { SkillData, JobId } from "../types";
import { type CellVisualState, getColorClass, getShapeClass } from "./cellStyles";

export type { CellVisualState } from "./cellStyles";

interface CellProps {
  jobId: JobId;
  skill: SkillData;
  t: number;
  lineIndex: number;
  visual: CellVisualState;
}

function CellComponent({
  jobId,
  skill,
  t,
  lineIndex,
  visual,
}: CellProps) {
  const addUsage = useStore((s) => s.addUsage);
  const removeUsage = useStore((s) => s.removeUsage);

  const { color, checked, shape } = visual;

  const onToggle = useCallback(() => {
    if (checked) {
      removeUsage(jobId, skill.id, t, lineIndex);
    } else {
      addUsage(jobId, skill.id, t, lineIndex);
    }
  }, [checked, jobId, skill.id, t, lineIndex, addUsage, removeUsage]);

  const isEmpty = color === "none" && shape === "none" && !checked;
  const overlayTitle =
    !checked && color !== "none"
      ? `${skill.name}（他の配置による${color === "red" ? "クールダウン" : "効果時間"}の表示。消すには ✓ のあるマスをクリック）`
      : skill.name;

  return (
    <button
      onClick={onToggle}
      className={`mp-bar ${getColorClass(color)} ${getShapeClass(shape)} ${
        isEmpty ? "mp-bar-empty" : ""
      } ${checked && color === "conflict" ? "mp-bar--invalid-placement" : ""}`}
      title={overlayTitle}
    >
      {checked ? "✓" : ""}
    </button>
  );
}

export default memo(CellComponent, (prev, next) => {
  return (
    prev.visual.color === next.visual.color &&
    prev.visual.checked === next.visual.checked &&
    prev.visual.shape === next.visual.shape &&
    prev.jobId === next.jobId &&
    prev.skill.id === next.skill.id &&
    prev.t === next.t &&
    prev.lineIndex === next.lineIndex
  );
});
