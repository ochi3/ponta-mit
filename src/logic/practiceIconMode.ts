import { getJobSkillIds, SKILL_MAP } from "../data/skills";
import type { JobId, JobSkillMode, PlanUsage, SkillData } from "../types";
import {
  AST_DRAW_CYCLE_SECONDS,
  buildAstDrawSlots,
  drawGrantsAstCard,
  getAstSlotAtPoint,
  isAstCardSkill,
  isAstDrawSkill,
  type AstDrawSlot,
} from "./astCards";
import { getChargeStateAtSecond, isChargeSkill } from "./skillCharges";

export type PracticeSkillVisualState = "ready" | "active" | "cooldown";

export type PracticeSkillSnapshot = {
  skill: SkillData;
  status: PracticeSkillVisualState;
  remainingSec: number | null;
  availableCharges: number;
  chargeCapacity: number;
};

export type PracticeSkillFilterOptions = {
  astCardMode?: "hide" | "show" | "only";
  includeAstDraws?: boolean;
  skillMode?: JobSkillMode;
};

function getVisualActiveDuration(skill: SkillData) {
  const duration = Math.max(0, Math.floor(skill.duration_s ?? 0));
  return Math.max(1, duration);
}

function getSortedSkillUsages(
  usages: readonly PlanUsage[],
  jobId: JobId,
  skillId: string
) {
  return usages
    .filter((usage) => usage.jobId === jobId && usage.skillId === skillId)
    .slice()
    .sort((a, b) => a.t_sec - b.t_sec || a.lineIndex - b.lineIndex);
}

function comparePoints(
  leftSec: number,
  leftLineIndex: number,
  rightSec: number,
  rightLineIndex: number
) {
  if (leftSec !== rightSec) {
    return leftSec - rightSec;
  }

  return leftLineIndex - rightLineIndex;
}

function shouldIncludePracticeSkill(
  skillId: string,
  options: PracticeSkillFilterOptions
) {
  const astCardMode = options.astCardMode ?? "show";

  if (isAstCardSkill(skillId)) {
    return astCardMode !== "hide";
  }

  if (astCardMode === "only") {
    return false;
  }

  if (isAstDrawSkill(skillId) && options.includeAstDraws === false) {
    return false;
  }

  return true;
}

function getAstNextGrantSlot(
  slots: readonly AstDrawSlot[],
  currentCycleIndex: number,
  cardSkillId: string
) {
  return (
    slots.find(
      (slot) =>
        slot.cycleIndex > currentCycleIndex &&
        drawGrantsAstCard(slot.skillId, cardSkillId)
    ) ?? null
  );
}

function buildAstCardSnapshot(
  jobId: JobId,
  skill: SkillData,
  usages: readonly PlanUsage[],
  currentTimelineSec: number
): PracticeSkillSnapshot {
  const slots = buildAstDrawSlots(
    jobId,
    usages,
    currentTimelineSec + AST_DRAW_CYCLE_SECONDS * 4
  );
  const currentSlot =
    getAstSlotAtPoint(slots, currentTimelineSec, Number.MAX_SAFE_INTEGER) ?? slots[0] ?? null;

  if (!currentSlot) {
    return {
      skill,
      status: "cooldown",
      remainingSec: null,
      availableCharges: 0,
      chargeCapacity: 1,
    };
  }

  const grantedByCurrentSlot = drawGrantsAstCard(currentSlot.skillId, skill.id);
  const skillUsages = getSortedSkillUsages(usages, jobId, skill.id);
  const validUsages = skillUsages.filter((usage) => {
    const slotAtUsage = getAstSlotAtPoint(slots, usage.t_sec, usage.lineIndex);
    if (!slotAtUsage || slotAtUsage.cycleIndex !== currentSlot.cycleIndex) {
      return false;
    }

    return comparePoints(
      usage.t_sec,
      usage.lineIndex,
      currentSlot.t_sec,
      currentSlot.lineIndex
    ) >= 0;
  });
  const firstValidUsage = validUsages[0] ?? null;
  const nextGrantSlot = grantedByCurrentSlot
    ? getAstNextGrantSlot(slots, currentSlot.cycleIndex, skill.id)
    : getAstNextGrantSlot(slots, currentSlot.cycleIndex - 1, skill.id);

  if (!grantedByCurrentSlot) {
    return {
      skill,
      status: "cooldown",
      remainingSec:
        nextGrantSlot !== null
          ? Math.max(1, nextGrantSlot.t_sec - currentTimelineSec)
          : null,
      availableCharges: 0,
      chargeCapacity: 1,
    };
  }

  if (
    !firstValidUsage ||
    comparePoints(
      currentTimelineSec,
      Number.MAX_SAFE_INTEGER,
      firstValidUsage.t_sec,
      firstValidUsage.lineIndex
    ) < 0
  ) {
    return {
      skill,
      status: "ready",
      remainingSec: null,
      availableCharges: 1,
      chargeCapacity: 1,
    };
  }

  const activeDuration = Math.max(0, Math.floor(skill.duration_s ?? 0));
  if (activeDuration > 0 && currentTimelineSec < firstValidUsage.t_sec + activeDuration) {
    return {
      skill,
      status: "active",
      remainingSec: Math.max(1, firstValidUsage.t_sec + activeDuration - currentTimelineSec),
      availableCharges: 0,
      chargeCapacity: 1,
    };
  }

  return {
    skill,
    status: "cooldown",
    remainingSec:
      nextGrantSlot !== null ? Math.max(1, nextGrantSlot.t_sec - currentTimelineSec) : null,
    availableCharges: 0,
    chargeCapacity: 1,
  };
}

function buildAstDrawSnapshot(
  jobId: JobId,
  skill: SkillData,
  usages: readonly PlanUsage[],
  currentTimelineSec: number
): PracticeSkillSnapshot {
  const slots = buildAstDrawSlots(
    jobId,
    usages,
    currentTimelineSec + AST_DRAW_CYCLE_SECONDS * 4
  );
  const lastMatchingSlot =
    slots
      .filter(
        (slot) => slot.skillId === skill.id && slot.t_sec <= currentTimelineSec
      )
      .at(-1) ?? null;
  const nextMatchingSlot =
    slots.find(
      (slot) => slot.skillId === skill.id && slot.t_sec > currentTimelineSec
    ) ?? null;

  if (lastMatchingSlot && currentTimelineSec === lastMatchingSlot.t_sec) {
    return {
      skill,
      status: "active",
      remainingSec: 1,
      availableCharges: 0,
      chargeCapacity: 1,
    };
  }

  if (nextMatchingSlot) {
    return {
      skill,
      status: "cooldown",
      remainingSec: Math.max(1, nextMatchingSlot.t_sec - currentTimelineSec),
      availableCharges: 0,
      chargeCapacity: 1,
    };
  }

  return {
    skill,
    status: "ready",
    remainingSec: null,
    availableCharges: 1,
    chargeCapacity: 1,
  };
}

export function getPracticeSkillsForJob(
  jobId: JobId,
  usages: readonly PlanUsage[],
  expandedJobs: readonly JobId[],
  options: PracticeSkillFilterOptions = {}
) {
  const visibleSkillIds = getJobSkillIds(
    jobId,
    expandedJobs.includes(jobId),
    options.skillMode ?? "normal"
  );
  const usedSkillIds =
    options.skillMode === "evolve"
      ? []
      : usages
          .filter((usage) => usage.jobId === jobId)
          .map((usage) => usage.skillId);
  const orderedSkillIds = Array.from(new Set([...visibleSkillIds, ...usedSkillIds]));

  return orderedSkillIds
    .filter((skillId) => shouldIncludePracticeSkill(skillId, options))
    .map((skillId) => SKILL_MAP[skillId])
    .filter((skill): skill is SkillData => Boolean(skill));
}

export function getPracticeSkillSnapshot(
  jobId: JobId,
  skill: SkillData,
  usages: readonly PlanUsage[],
  currentTimelineSec: number | null
): PracticeSkillSnapshot {
  if (currentTimelineSec === null) {
    const chargeCapacity = isChargeSkill(skill) ? Math.max(1, Math.floor(skill.stack ?? 1)) : 1;
    return {
      skill,
      status: "ready",
      remainingSec: null,
      availableCharges: chargeCapacity,
      chargeCapacity,
    };
  }

  if (isAstCardSkill(skill.id)) {
    return buildAstCardSnapshot(jobId, skill, usages, currentTimelineSec);
  }

  if (isAstDrawSkill(skill.id)) {
    return buildAstDrawSnapshot(jobId, skill, usages, currentTimelineSec);
  }

  const skillUsages = getSortedSkillUsages(usages, jobId, skill.id);
  const activeDuration = getVisualActiveDuration(skill);
  const cooldownDuration = Math.max(0, Math.floor(skill.cooldown_s ?? 0));
  const chargeState = getChargeStateAtSecond(skill, skillUsages, currentTimelineSec);
  let activeUsage: PlanUsage | null = null;

  for (const usage of skillUsages) {
    if (usage.t_sec > currentTimelineSec) {
      break;
    }

    const activeEndSec = usage.t_sec + activeDuration;
    const cooldownEndSec = usage.t_sec + cooldownDuration;
    if (currentTimelineSec < Math.max(activeEndSec, cooldownEndSec)) {
      activeUsage = usage;
    }
  }

  if (!activeUsage) {
    return {
      skill,
      status: chargeState.available === 0 ? "cooldown" : "ready",
      remainingSec:
        chargeState.available === 0 && chargeState.nextRecoverySec !== null
          ? Math.max(1, chargeState.nextRecoverySec - currentTimelineSec)
          : null,
      availableCharges: chargeState.available,
      chargeCapacity: chargeState.capacity,
    };
  }

  const activeEndSec = activeUsage.t_sec + activeDuration;
  if (currentTimelineSec < activeEndSec) {
    return {
      skill,
      status: "active",
      remainingSec: Math.max(1, activeEndSec - currentTimelineSec),
      availableCharges: chargeState.available,
      chargeCapacity: chargeState.capacity,
    };
  }

  const cooldownEndSec = activeUsage.t_sec + cooldownDuration;
  if (!isChargeSkill(skill) && currentTimelineSec < cooldownEndSec) {
    return {
      skill,
      status: "cooldown",
      remainingSec: Math.max(1, cooldownEndSec - currentTimelineSec),
      availableCharges: chargeState.available,
      chargeCapacity: chargeState.capacity,
    };
  }

  return {
    skill,
    status: chargeState.available === 0 ? "cooldown" : "ready",
    remainingSec:
      chargeState.available === 0 && chargeState.nextRecoverySec !== null
        ? Math.max(1, chargeState.nextRecoverySec - currentTimelineSec)
        : null,
    availableCharges: chargeState.available,
    chargeCapacity: chargeState.capacity,
  };
}
