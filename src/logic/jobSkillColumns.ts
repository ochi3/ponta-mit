import { getJobSkillIds, JOB_SKILLS } from "../data/skills";
import type { JobId, JobSkillMode, SkillId } from "../types";
import { isAstCardSkill, isAstDrawSkill } from "./astCards";
import { isSgeAddersgallRelatedSkill } from "./sgeAddersgall";

export type JobSkillDisplayOptions = {
  expandedJobs: readonly JobId[];
  cardOnlyJobs: readonly JobId[];
  addersgallOnlyJobs: readonly JobId[];
  evolveJobs: readonly JobId[];
};

function shouldIncludeSecondarySkill(
  jobId: JobId,
  skillId: SkillId,
  secondarySkillIds: ReadonlySet<SkillId>,
  options: {
    isExpanded: boolean;
    isCardVisible: boolean;
    isAddersgallVisible: boolean;
  }
) {
  if (!secondarySkillIds.has(skillId)) {
    return true;
  }

  if (jobId === "healer.ast") {
    const isCardSkill = isAstCardSkill(skillId) || isAstDrawSkill(skillId);
    if (options.isExpanded && options.isCardVisible) {
      return true;
    }
    if (options.isExpanded) {
      return !isCardSkill;
    }
    if (options.isCardVisible) {
      return isCardSkill;
    }
    return false;
  }

  if (jobId === "healer.sge") {
    const isAddersgallRelated = isSgeAddersgallRelatedSkill(skillId);
    if (options.isExpanded && options.isAddersgallVisible) {
      return true;
    }
    if (options.isExpanded) {
      return !isAddersgallRelated;
    }
    if (options.isAddersgallVisible) {
      return isAddersgallRelated;
    }
    return false;
  }

  return true;
}

export function resolveDisplayedSkillIds(
  jobId: JobId,
  options: JobSkillDisplayOptions
): SkillId[] {
  const skillMode: JobSkillMode = options.evolveJobs.includes(jobId)
    ? "evolve"
    : "normal";
  const isCardVisible =
    skillMode === "normal" && options.cardOnlyJobs.includes(jobId);
  const isAddersgallVisible =
    skillMode === "normal" && options.addersgallOnlyJobs.includes(jobId);
  const isExpanded = options.expandedJobs.includes(jobId);
  const includeSecondary = isExpanded || isCardVisible || isAddersgallVisible;
  const skillSet =
    skillMode === "evolve"
      ? JOB_SKILLS[jobId]?.evolve ?? JOB_SKILLS[jobId]
      : JOB_SKILLS[jobId];
  const secondarySkillIds = new Set<SkillId>(skillSet?.secondary ?? []);

  return getJobSkillIds(jobId, includeSecondary, skillMode).filter((skillId) => {
    if (!includeSecondary) {
      return true;
    }

    return shouldIncludeSecondarySkill(jobId, skillId, secondarySkillIds, {
      isExpanded,
      isCardVisible,
      isAddersgallVisible,
    });
  });
}
