import type { PlanUsage, JobId } from "../types";
import { SKILL_MAP } from "../data/skills";
import { isChargeSkill, simulateChargeUsages } from "./skillCharges";
import { simulateSchAetherflow } from "./schAetherflow";
import {
  WHM_AFFLATUS_MISERY_ID,
  simulateWhmLilies,
} from "./whmLilies";
import { simulateSgeAddersgall } from "./sgeAddersgall";

/** 同一親召喚内の重複チェックを行わない子スキル */
const CHILD_SKILL_IDS_SKIP_DUPLICATE_PER_PARENT = new Set<string>([
  "healer.sch.consolation",
]);

function skipsDuplicateChildCheck(skillId: string): boolean {
  return CHILD_SKILL_IDS_SKIP_DUPLICATE_PER_PARENT.has(skillId);
}

export type IssueSeverity = "error" | "warning" | "info";

export type IssueType =
  | "cd_conflict"
  | "child_outside_parent"
  | "duplicate_child"
  | "orphan_parent"
  | "resource_shortage";

export interface ValidationIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  location?: {
    jobId: JobId;
    skillId: string;
    t_sec: number;
    lineIndex: number;
  };
  relatedLocation?: {
    jobId: JobId;
    skillId: string;
    t_sec: number;
    lineIndex: number;
  };
}

export interface ValidationContext {
  usages: PlanUsage[];
}

interface ValidationIndexes {
  byJobSkill: Map<string, PlanUsage[]>;
  byJob: Map<string, PlanUsage[]>;
}

function buildIndexes(usages: PlanUsage[]): ValidationIndexes {
  const byJobSkill = new Map<string, PlanUsage[]>();
  const byJob = new Map<string, PlanUsage[]>();

  for (const usage of usages) {
    const jobSkillKey = `${usage.jobId}::${usage.skillId}`;
    const skillUsages = byJobSkill.get(jobSkillKey) ?? [];
    skillUsages.push(usage);
    byJobSkill.set(jobSkillKey, skillUsages);

    const jobUsages = byJob.get(usage.jobId) ?? [];
    jobUsages.push(usage);
    byJob.set(usage.jobId, jobUsages);
  }

  return { byJobSkill, byJob };
}

function validateCooldownConflicts(
  indexes: ValidationIndexes
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [, skillUsages] of indexes.byJobSkill) {
    if (skillUsages.length < 2) continue;

    const skill = SKILL_MAP[skillUsages[0].skillId];
    if (!skill) continue;

    const cd = skill.cooldown_s ?? 0;
    if (cd === 0) continue;

    if (isChargeSkill(skill)) {
      for (const simulation of simulateChargeUsages(skill, skillUsages)) {
        if (simulation.isValid) {
          continue;
        }

        issues.push({
          type: "cd_conflict",
          severity: "error",
          message: formatChargeConflictMessage(skill.name, simulation.usage.t_sec),
          location: {
            jobId: simulation.usage.jobId,
            skillId: simulation.usage.skillId,
            t_sec: simulation.usage.t_sec,
            lineIndex: simulation.usage.lineIndex,
          },
        });
      }
      continue;
    }

    const sorted = skillUsages.slice().sort((a, b) => {
      if (a.t_sec !== b.t_sec) return a.t_sec - b.t_sec;
      return a.lineIndex - b.lineIndex;
    });

    const skillName = skill.name;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const timeDiff = curr.t_sec - prev.t_sec;

      if (timeDiff < cd) {
        issues.push({
          type: "cd_conflict",
          severity: "error",
          message: formatCdConflictMessage(skillName, curr.t_sec, prev.t_sec),
          location: {
            jobId: curr.jobId,
            skillId: curr.skillId,
            t_sec: curr.t_sec,
            lineIndex: curr.lineIndex,
          },
          relatedLocation: {
            jobId: prev.jobId,
            skillId: prev.skillId,
            t_sec: prev.t_sec,
            lineIndex: prev.lineIndex,
          },
        });
      }
    }
  }

  return issues;
}

function isWithinParentDuration(
  childUsage: PlanUsage,
  parentUsage: PlanUsage,
  parentDuration: number
): boolean {
  const parentStart = parentUsage.t_sec;
  const parentEnd = parentStart + parentDuration;

  if (childUsage.t_sec > parentStart && childUsage.t_sec <= parentEnd) {
    return true;
  }
  if (childUsage.t_sec === parentStart && childUsage.lineIndex >= parentUsage.lineIndex) {
    return true;
  }
  return false;
}

function validateParentChildRelationships(
  indexes: ValidationIndexes
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [jobId, jobUsages] of indexes.byJob) {
    const childUsagesByParent = new Map<string, PlanUsage[]>();
    
    for (const usage of jobUsages) {
      const skill = SKILL_MAP[usage.skillId];
      if (!skill?.parentSkillId) continue;
      
      const key = skill.parentSkillId;
      const list = childUsagesByParent.get(key) || [];
      list.push(usage);
      childUsagesByParent.set(key, list);
    }

    for (const [parentSkillId, childUsages] of childUsagesByParent) {
      const parentSkill = SKILL_MAP[parentSkillId];
      if (!parentSkill) continue;

      const parentDuration = parentSkill.duration_s ?? 0;
      const parentUsages = indexes.byJobSkill.get(`${jobId}::${parentSkillId}`) ?? [];

      const childSkill = SKILL_MAP[childUsages[0].skillId];
      if (!childSkill) continue;

      const childName = childSkill.name;
      const parentName = parentSkill.name;

      const childrenByParentActivation = new Map<string, PlanUsage[]>();

      for (const childUsage of childUsages) {
        let foundParent: PlanUsage | undefined;
        let nearestParent: PlanUsage | undefined;

        for (const pu of parentUsages) {
          if (isWithinParentDuration(childUsage, pu, parentDuration)) {
            foundParent = pu;
            break;
          }
          if (!nearestParent || Math.abs(pu.t_sec - childUsage.t_sec) < Math.abs(nearestParent.t_sec - childUsage.t_sec)) {
            nearestParent = pu;
          }
        }

        if (!foundParent) {
          if (parentUsages.length === 0) {
            issues.push({
              type: "child_outside_parent",
              severity: "error",
              message: formatChildRequiresParentMessage(childName, parentName),
              location: {
                jobId: childUsage.jobId,
                skillId: childUsage.skillId,
                t_sec: childUsage.t_sec,
                lineIndex: childUsage.lineIndex,
              },
            });
          } else {
            issues.push({
              type: "child_outside_parent",
              severity: "error",
              message: formatChildOutsideParentMessage(childName, parentName, childUsage.t_sec),
              location: {
                jobId: childUsage.jobId,
                skillId: childUsage.skillId,
                t_sec: childUsage.t_sec,
                lineIndex: childUsage.lineIndex,
              },
              relatedLocation: nearestParent ? {
                jobId: nearestParent.jobId,
                skillId: nearestParent.skillId,
                t_sec: nearestParent.t_sec,
                lineIndex: nearestParent.lineIndex,
              } : undefined,
            });
          }
        } else {
          const parentKey = `${foundParent.t_sec}::${foundParent.lineIndex}`;
          const list = childrenByParentActivation.get(parentKey) || [];
          list.push(childUsage);
          childrenByParentActivation.set(parentKey, list);
        }
      }

      if (skipsDuplicateChildCheck(childSkill.id)) {
        continue;
      }

      for (const [, children] of childrenByParentActivation) {
        if (children.length > 1) {
          const sorted = children.slice().sort((a, b) => {
            if (a.t_sec !== b.t_sec) return a.t_sec - b.t_sec;
            return a.lineIndex - b.lineIndex;
          });

          const first = sorted[0];
          for (let i = 1; i < sorted.length; i++) {
            const duplicate = sorted[i];
            issues.push({
              type: "duplicate_child",
              severity: "error",
              message: formatDuplicateChildMessage(childName, parentName, duplicate.t_sec, first.t_sec),
              location: {
                jobId: duplicate.jobId,
                skillId: duplicate.skillId,
                t_sec: duplicate.t_sec,
                lineIndex: duplicate.lineIndex,
              },
              relatedLocation: {
                jobId: first.jobId,
                skillId: first.skillId,
                t_sec: first.t_sec,
                lineIndex: first.lineIndex,
              },
            });
          }
        }
      }
    }
  }

  return issues;
}

function validateScholarAetherflow(
  indexes: ValidationIndexes
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [jobId, jobUsages] of indexes.byJob.entries()) {
    if (jobId !== "healer.sch" || jobUsages.length === 0) {
      continue;
    }

    const maxSec = Math.max(...jobUsages.map((usage) => usage.t_sec), 0);
    const simulation = simulateSchAetherflow(jobId, jobUsages, maxSec);

    for (const spendSimulation of simulation.spendSimulationByUsageKey.values()) {
      if (!spendSimulation.isSkillReady || spendSimulation.isValid) {
        continue;
      }

      const skill = SKILL_MAP[spendSimulation.usage.skillId];
      if (!skill) {
        continue;
      }

      issues.push({
        type: "resource_shortage",
        severity: "error",
        message: formatScholarAetherflowShortageMessage(
          skill.name,
          spendSimulation.usage.t_sec
        ),
        location: {
          jobId: spendSimulation.usage.jobId,
          skillId: spendSimulation.usage.skillId,
          t_sec: spendSimulation.usage.t_sec,
          lineIndex: spendSimulation.usage.lineIndex,
        },
      });
    }
  }

  return issues;
}

function validateWhiteMageLilies(
  indexes: ValidationIndexes
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [jobId, jobUsages] of indexes.byJob.entries()) {
    if (jobId !== "healer.whm" || jobUsages.length === 0) {
      continue;
    }

    const maxSec = Math.max(...jobUsages.map((usage) => usage.t_sec), 0);
    const simulation = simulateWhmLilies(jobId, jobUsages, maxSec);

    for (const useSimulation of simulation.useSimulationByUsageKey.values()) {
      if (!useSimulation.isSkillReady || useSimulation.isValid) {
        continue;
      }

      const skill = SKILL_MAP[useSimulation.usage.skillId];
      if (!skill) {
        continue;
      }

      issues.push({
        type: "resource_shortage",
        severity: "error",
        message: formatWhiteMageLilyShortageMessage(
          skill.name,
          useSimulation.usage.skillId,
          useSimulation.usage.t_sec
        ),
        location: {
          jobId: useSimulation.usage.jobId,
          skillId: useSimulation.usage.skillId,
          t_sec: useSimulation.usage.t_sec,
          lineIndex: useSimulation.usage.lineIndex,
        },
      });
    }
  }

  return issues;
}

function validateSageAddersgall(
  indexes: ValidationIndexes
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [jobId, jobUsages] of indexes.byJob.entries()) {
    if (jobId !== "healer.sge" || jobUsages.length === 0) {
      continue;
    }

    const maxSec = Math.max(...jobUsages.map((usage) => usage.t_sec), 0);
    const simulation = simulateSgeAddersgall(jobId, jobUsages, maxSec);

    for (const useSimulation of simulation.useSimulationByUsageKey.values()) {
      if (!useSimulation.isSkillReady || useSimulation.isValid) {
        continue;
      }

      const skill = SKILL_MAP[useSimulation.usage.skillId];
      if (!skill) {
        continue;
      }

      issues.push({
        type: "resource_shortage",
        severity: "error",
        message: formatSageAddersgallShortageMessage(
          skill.name,
          useSimulation.usage.t_sec
        ),
        location: {
          jobId: useSimulation.usage.jobId,
          skillId: useSimulation.usage.skillId,
          t_sec: useSimulation.usage.t_sec,
          lineIndex: useSimulation.usage.lineIndex,
        },
      });
    }
  }

  return issues;
}

export function validatePlan(ctx: ValidationContext): ValidationIssue[] {
  const { usages } = ctx;

  if (usages.length === 0) {
    return [];
  }

  const indexes = buildIndexes(usages);

  const issues: ValidationIssue[] = [];

  issues.push(...validateCooldownConflicts(indexes));
  issues.push(...validateParentChildRelationships(indexes));
  issues.push(...validateScholarAetherflow(indexes));
  issues.push(...validateWhiteMageLilies(indexes));
  issues.push(...validateSageAddersgall(indexes));

  return issues;
}

function formatSageAddersgallShortageMessage(skillName: string, time: number): string {
  const t = formatTime(time);
  return `${skillName} (${t}) はアダーガルが足りません`;
}


function formatScholarAetherflowShortageMessage(skillName: string, time: number): string {
  const t = formatTime(time);
  return `${skillName} (${t}) はエーテルフローが足りません`;
}

function formatWhiteMageLilyShortageMessage(
  skillName: string,
  skillId: string,
  time: number
): string {
  const t = formatTime(time);
  const resourceName =
    skillId === WHM_AFFLATUS_MISERY_ID ? "ブラッドリリー" : "ヒーリングリリー";
  return `${skillName} (${t}) は${resourceName}が足りません`;
}


function formatTime(sec: number): string {
  const isNegative = sec < 0;
  const absSec = Math.abs(sec);
  const m = Math.floor(absSec / 60);
  const s = absSec % 60;
  const timeStr = `${m}:${s.toString().padStart(2, "0")}`;
  return isNegative ? `-${timeStr}` : timeStr;
}

function formatCdConflictMessage(skillName: string, currTime: number, prevTime: number): string {
  const curr = formatTime(currTime);
  const prev = formatTime(prevTime);
  return `${skillName} (${curr}) と (${prev}) がクールダウン中に重複しています`;
}

function formatChargeConflictMessage(skillName: string, currTime: number): string {
  const curr = formatTime(currTime);
  return `${skillName} (${curr}) はスタックが足りません`;
}

function formatChildRequiresParentMessage(skillName: string, parentName: string): string {
  return `${skillName} は ${parentName} の効果中に使用する必要があります`;
}

function formatChildOutsideParentMessage(skillName: string, parentName: string, time: number): string {
  const t = formatTime(time);
  return `${skillName} (${t}) は ${parentName} の効果時間外です`;
}

function formatDuplicateChildMessage(skillName: string, parentName: string, duplicateTime: number, firstTime: number): string {
  const dupT = formatTime(duplicateTime);
  const firstT = formatTime(firstTime);
  return `${skillName} (${dupT}) は重複しています。同じ ${parentName} 中に ${firstT} で使用済みです`;
}
