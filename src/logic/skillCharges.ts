import type { PlanUsage, SkillData } from "../types";

export interface ChargeUsageSimulation {
  usage: PlanUsage;
  cost: number;
  availableBefore: number;
  availableAfter: number;
  isValid: boolean;
  nextRecoverySec: number | null;
}

export interface ChargeStateSnapshot {
  available: number;
  capacity: number;
  nextRecoverySec: number | null;
}

function sortUsages(usages: readonly PlanUsage[]) {
  return usages
    .slice()
    .sort((a, b) => a.t_sec - b.t_sec || a.lineIndex - b.lineIndex);
}

function releaseRecoveredCharges(pendingRecoveries: number[], sec: number) {
  while (pendingRecoveries.length > 0 && pendingRecoveries[0] <= sec) {
    pendingRecoveries.shift();
  }
}

export function getChargeCapacity(skill: SkillData) {
  return Math.max(1, Math.floor(skill.stack ?? 1));
}

export function isChargeSkill(skill: SkillData) {
  return getChargeCapacity(skill) > 1;
}

export function getUsageChargeCost(skill: SkillData, usage?: Pick<PlanUsage, "stacks"> | null) {
  if (!isChargeSkill(skill)) {
    return 1;
  }

  const requested = typeof usage?.stacks === "number" ? Math.floor(usage.stacks) : 1;
  return Math.max(1, Math.min(getChargeCapacity(skill), requested));
}

function queueRecoveries(
  pendingRecoveries: number[],
  sec: number,
  cooldownSec: number,
  cost: number
) {
  for (let i = 0; i < cost; i++) {
    const baseSec = Math.max(sec, pendingRecoveries[pendingRecoveries.length - 1] ?? sec);
    pendingRecoveries.push(baseSec + cooldownSec);
  }
}

export function simulateChargeUsages(
  skill: SkillData,
  usages: readonly PlanUsage[]
): ChargeUsageSimulation[] {
  const capacity = getChargeCapacity(skill);
  const cooldownSec = Math.max(0, Math.floor(skill.cooldown_s ?? 0));
  const pendingRecoveries: number[] = [];

  return sortUsages(usages).map((usage) => {
    releaseRecoveredCharges(pendingRecoveries, usage.t_sec);

    const cost = getUsageChargeCost(skill, usage);
    const availableBefore = Math.max(0, capacity - pendingRecoveries.length);
    const isValid = availableBefore >= cost;

    queueRecoveries(pendingRecoveries, usage.t_sec, cooldownSec, cost);

    return {
      usage,
      cost,
      availableBefore,
      availableAfter: Math.max(0, capacity - pendingRecoveries.length),
      isValid,
      nextRecoverySec: pendingRecoveries[0] ?? null,
    };
  });
}

export function getChargeStateBeforePoint(
  skill: SkillData,
  usages: readonly PlanUsage[],
  sec: number,
  lineIndex: number
): ChargeStateSnapshot {
  const capacity = getChargeCapacity(skill);
  const cooldownSec = Math.max(0, Math.floor(skill.cooldown_s ?? 0));
  const pendingRecoveries: number[] = [];

  for (const usage of sortUsages(usages)) {
    if (usage.t_sec > sec || (usage.t_sec === sec && usage.lineIndex >= lineIndex)) {
      break;
    }

    releaseRecoveredCharges(pendingRecoveries, usage.t_sec);
    queueRecoveries(
      pendingRecoveries,
      usage.t_sec,
      cooldownSec,
      getUsageChargeCost(skill, usage)
    );
  }

  releaseRecoveredCharges(pendingRecoveries, sec);

  return {
    available: Math.max(0, capacity - pendingRecoveries.length),
    capacity,
    nextRecoverySec: pendingRecoveries[0] ?? null,
  };
}

export function getChargeStateAtSecond(
  skill: SkillData,
  usages: readonly PlanUsage[],
  sec: number
): ChargeStateSnapshot {
  return getChargeStateBeforePoint(skill, usages, sec, Number.MAX_SAFE_INTEGER);
}
