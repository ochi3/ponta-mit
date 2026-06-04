import type { PlanUsage, SkillData } from "../types";
import { PRE_BATTLE_TIMELINE_SEC } from "./timelineView";
import { getEffectDurationS } from "./skillEffect";

const MIN_PLACEMENT_SEC = -PRE_BATTLE_TIMELINE_SEC;

export type TimelineRowRef = {
  sec: number;
  lineIndex: number;
};

function getPlanningDuration(
  skill: SkillData,
  usageAtClick?: Pick<PlanUsage, "stacks">
): number {
  const duration = getEffectDurationS(skill, usageAtClick);
  if (duration > 0) {
    return duration;
  }
  return skill.duration_s ?? 0;
}

/** 効果開始秒に対応するタイムライン行 */
export function resolvePlacementAtEffectStart(
  rows: readonly TimelineRowRef[],
  startSec: number,
  preferredLineIndex: number
): TimelineRowRef | null {
  if (rows.length === 0) {
    return null;
  }

  const atSec = rows.filter((row) => row.sec === startSec);
  if (atSec.length > 0) {
    return (
      atSec.find((row) => row.lineIndex === preferredLineIndex) ?? atSec[0]
    );
  }

  const beforeStart = rows.filter((row) => row.sec <= startSec);
  if (beforeStart.length > 0) {
    return beforeStart[beforeStart.length - 1];
  }

  return rows.find((row) => row.sec >= startSec) ?? null;
}

/**
 * 右クリック行を効果の最終秒（その秒を含む）とみなし、開始秒へ逆算する。
 * 効果区間は [開始, 開始+効果時間)（緑バーと同じ）。最終秒 = 開始+効果時間-1。
 */
export function getEffectStartPlacementFromEndClick(
  skill: SkillData,
  endSec: number,
  endLineIndex: number,
  rows: readonly TimelineRowRef[],
  usageAtClick?: Pick<PlanUsage, "stacks">
): { lineIndex: number; startSec: number; stacks?: number } | null {
  const duration = getPlanningDuration(skill, usageAtClick);
  if (duration <= 0) {
    return null;
  }

  const startSec = Math.max(MIN_PLACEMENT_SEC, endSec - duration + 1);
  const target = resolvePlacementAtEffectStart(rows, startSec, endLineIndex);
  if (!target) {
    return null;
  }

  if (
    duration <= 1 &&
    startSec === endSec &&
    target.lineIndex === endLineIndex
  ) {
    return null;
  }

  return {
    lineIndex: target.lineIndex,
    startSec,
    stacks: usageAtClick?.stacks,
  };
}
