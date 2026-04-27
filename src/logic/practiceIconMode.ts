import { getJobSkillIds, SKILL_MAP } from "../data/skills";
import type { JobId, PlanUsage, SkillData } from "../types";

export type PracticeSkillVisualState = "ready" | "active" | "cooldown";

export type PracticeSkillSnapshot = {
  skill: SkillData;
  status: PracticeSkillVisualState;
  remainingSec: number | null;
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

export function getPracticeSkillsForJob(
  jobId: JobId,
  usages: readonly PlanUsage[],
  expandedJobs: readonly JobId[]
) {
  const visibleSkillIds = getJobSkillIds(jobId, expandedJobs.includes(jobId));
  const usedSkillIds = usages
    .filter((usage) => usage.jobId === jobId)
    .map((usage) => usage.skillId);
  const orderedSkillIds = Array.from(new Set([...visibleSkillIds, ...usedSkillIds]));

  return orderedSkillIds
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
    return {
      skill,
      status: "ready",
      remainingSec: null,
    };
  }

  const skillUsages = getSortedSkillUsages(usages, jobId, skill.id);
  const activeDuration = getVisualActiveDuration(skill);
  const cooldownDuration = Math.max(0, Math.floor(skill.cooldown_s ?? 0));
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
      status: "ready",
      remainingSec: null,
    };
  }

  const activeEndSec = activeUsage.t_sec + activeDuration;
  if (currentTimelineSec < activeEndSec) {
    return {
      skill,
      status: "active",
      remainingSec: Math.max(1, activeEndSec - currentTimelineSec),
    };
  }

  const cooldownEndSec = activeUsage.t_sec + cooldownDuration;
  if (currentTimelineSec < cooldownEndSec) {
    return {
      skill,
      status: "cooldown",
      remainingSec: Math.max(1, cooldownEndSec - currentTimelineSec),
    };
  }

  return {
    skill,
    status: "ready",
    remainingSec: null,
  };
}
