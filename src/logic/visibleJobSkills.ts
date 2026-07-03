import type { JobId, PlanUsage, SkillData } from "../types";
import { isAstCardSkill, isAstDrawSkill } from "./astCards";
import {
  resolveDisplayedSkillIds,
  type JobSkillDisplayOptions,
} from "./jobSkillColumns";
import { isSchAetherflowSkill, isSchAetherflowSpenderSkill } from "./schAetherflow";
import {
  isSgeAddersgallSkill,
  isSgeAddersgallSpenderSkill,
} from "./sgeAddersgall";
import {
  isWhmLilyConsumerSkill,
  isWhmLilySkill,
} from "./whmLilies";

/** 1ジョブ表示でも常に残す列（バースト・薬・LB など） */
export const UTILITY_UNKNOWN_JOB_ID: JobId = "utility.unknown";

export type VisibleSkillColumn = {
  jobId: JobId;
  skill: Pick<SkillData, "id">;
};

export function resolveVisibleTeam(
  team: readonly JobId[],
  jobFilter: JobId | null | undefined
): JobId[] {
  if (!jobFilter) {
    return [...team];
  }

  return team.filter(
    (jobId) =>
      jobId === jobFilter ||
      (jobId === UTILITY_UNKNOWN_JOB_ID && jobFilter !== UTILITY_UNKNOWN_JOB_ID)
  );
}

export function buildVisibleJobSkillKeySet(
  visibleTeam: readonly JobId[],
  options: JobSkillDisplayOptions
): Set<string> {
  const keys = new Set<string>();

  for (const jobId of visibleTeam) {
    for (const skillId of resolveDisplayedSkillIds(jobId, options)) {
      keys.add(`${jobId}::${skillId}`);
    }
  }

  return keys;
}

export function buildVisibleJobSkillKeySetFromCols(
  cols: readonly VisibleSkillColumn[]
): Set<string> {
  return new Set(cols.map((col) => `${col.jobId}::${col.skill.id}`));
}

export function filterUsagesToVisibleSkills(
  usages: readonly PlanUsage[],
  visibleJobSkillKeys: ReadonlySet<string>
): PlanUsage[] {
  if (visibleJobSkillKeys.size === 0) {
    return [];
  }

  return usages.filter((usage) =>
    visibleJobSkillKeys.has(`${usage.jobId}::${usage.skillId}`)
  );
}

export function colsNeedAstDrawSimulation(cols: readonly VisibleSkillColumn[]): boolean {
  return cols.some(
    (col) =>
      col.jobId === "healer.ast" &&
      (isAstDrawSkill(col.skill.id) || isAstCardSkill(col.skill.id))
  );
}

export function colsNeedSchAetherflowSimulation(
  cols: readonly VisibleSkillColumn[]
): boolean {
  return cols.some(
    (col) =>
      col.jobId === "healer.sch" &&
      (isSchAetherflowSkill(col.skill.id) || isSchAetherflowSpenderSkill(col.skill.id))
  );
}

export function colsNeedWhmLilySimulation(cols: readonly VisibleSkillColumn[]): boolean {
  return cols.some(
    (col) =>
      col.jobId === "healer.whm" &&
      (isWhmLilySkill(col.skill.id) || isWhmLilyConsumerSkill(col.skill.id))
  );
}

export function colsNeedSgeAddersgallSimulation(
  cols: readonly VisibleSkillColumn[]
): boolean {
  return cols.some(
    (col) =>
      col.jobId === "healer.sge" &&
      (isSgeAddersgallSkill(col.skill.id) || isSgeAddersgallSpenderSkill(col.skill.id))
  );
}

export type VisibleJobSkillSelectionInput = {
  team: readonly JobId[];
  jobFilter?: JobId | null;
  expandedJobs: readonly JobId[];
  cardOnlyJobs: readonly JobId[];
  addersgallOnlyJobs: readonly JobId[];
  evolveJobs: readonly JobId[];
};

/** 現在の表示設定から検証・計算対象の skill キー集合を作る */
export function selectVisibleJobSkillKeys(
  input: VisibleJobSkillSelectionInput
): Set<string> {
  return buildVisibleJobSkillKeySet(resolveVisibleTeam(input.team, input.jobFilter), {
    expandedJobs: input.expandedJobs,
    cardOnlyJobs: input.cardOnlyJobs,
    addersgallOnlyJobs: input.addersgallOnlyJobs,
    evolveJobs: input.evolveJobs,
  });
}
