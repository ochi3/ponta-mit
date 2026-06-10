import { SKILL_MAP } from "../data/skills";
import type { JobId, PlanUsage, SkillId } from "../types";

export const SCH_AETHERFLOW_ID = "healer.sch.aetherflow";
export const SCH_DISSIPATION_ID = "healer.sch.dissipation";
export const SCH_SACRED_SOIL_ID = "healer.sch.sacred_soil";
export const SCH_INDOMITABILITY_ID = "healer.sch.indomitability";
export const SCH_EXCOGITATION_ID = "healer.sch.excogitation";
export const SCH_RECITATION_ID = "healer.sch.recitation";

export const SCH_AETHERFLOW_CYCLE_SECONDS = 60;
export const SCH_AETHERFLOW_CAPACITY = 3;

const SCH_AETHERFLOW_SPENDER_SKILL_IDS = new Set<SkillId>([
  SCH_SACRED_SOIL_ID,
  SCH_INDOMITABILITY_ID,
  SCH_EXCOGITATION_ID,
]);

const SCH_RECITATION_FREE_SKILL_IDS = new Set<SkillId>([
  SCH_INDOMITABILITY_ID,
  SCH_EXCOGITATION_ID,
]);

const SCH_DISSIPATION_COOLDOWN_SECONDS =
  Math.max(0, Math.floor(SKILL_MAP[SCH_DISSIPATION_ID]?.cooldown_s ?? 180));
const SCH_RECITATION_COOLDOWN_SECONDS =
  Math.max(0, Math.floor(SKILL_MAP[SCH_RECITATION_ID]?.cooldown_s ?? 90));
const SCH_RECITATION_DURATION_SECONDS =
  Math.max(0, Math.floor(SKILL_MAP[SCH_RECITATION_ID]?.duration_s ?? 15));

export interface SchAetherflowSlot {
  cycleIndex: number;
  t_sec: number;
  lineIndex: number;
  source: "auto" | "manual";
  manualUsages: readonly PlanUsage[];
  isConflict: boolean;
}

export interface SchAetherflowSpendSimulation {
  usage: PlanUsage;
  availableBefore: number;
  availableAfter: number;
  isSkillReady: boolean;
  isFree: boolean;
  isValid: boolean;
}

interface SchAetherflowResolvedEvent {
  type: "grant" | "spend";
  t_sec: number;
  lineIndex: number;
  skillId: SkillId;
}

interface SchAetherflowGrantEvent extends SchAetherflowResolvedEvent {
  type: "grant";
  source: "auto" | "manual" | "skill";
}

interface SchAetherflowSpendEvent extends SchAetherflowResolvedEvent {
  type: "spend";
}

export interface SchAetherflowSimulation {
  slots: readonly SchAetherflowSlot[];
  slotManualUsagesByCycle: ReadonlyMap<number, readonly PlanUsage[]>;
  aetherflowConflictKeys: ReadonlySet<string>;
  dissipationConflictKeys: ReadonlySet<string>;
  recitationConflictKeys: ReadonlySet<string>;
  recitationFreeUsageKeys: ReadonlySet<string>;
  spendSimulationByUsageKey: ReadonlyMap<string, SchAetherflowSpendSimulation>;
  resolvedEvents: readonly SchAetherflowResolvedEvent[];
  grants: readonly SchAetherflowGrantEvent[];
}

export interface SchAetherflowStateSnapshot {
  available: number;
  nextGrantSec: number | null;
}

function usageKey(usage: Pick<PlanUsage, "jobId" | "skillId" | "t_sec" | "lineIndex">) {
  return `${usage.jobId}::${usage.skillId}::${usage.t_sec}::${usage.lineIndex}`;
}

function sortUsages(usages: readonly PlanUsage[]) {
  return usages
    .slice()
    .sort(
      (a, b) =>
        a.t_sec - b.t_sec ||
        a.lineIndex - b.lineIndex ||
        a.skillId.localeCompare(b.skillId)
    );
}

function compareRowPoint(
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

function compareUsagePoint(
  left: Pick<PlanUsage, "skillId" | "t_sec" | "lineIndex">,
  right: Pick<PlanUsage, "skillId" | "t_sec" | "lineIndex">
) {
  return (
    compareRowPoint(left.t_sec, left.lineIndex, right.t_sec, right.lineIndex) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function compareResolvedEvent(
  left: SchAetherflowResolvedEvent,
  right: SchAetherflowResolvedEvent
) {
  return (
    compareRowPoint(left.t_sec, left.lineIndex, right.t_sec, right.lineIndex) ||
    (left.type === right.type ? 0 : left.type === "grant" ? -1 : 1) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function buildCooldownValidity(
  usages: readonly PlanUsage[],
  cooldownSec: number
) {
  const validKeys = new Set<string>();
  const conflictKeys = new Set<string>();
  let lastValidUsage: PlanUsage | null = null;

  for (const usage of sortUsages(usages)) {
    const key = usageKey(usage);
    if (
      !lastValidUsage ||
      usage.t_sec - lastValidUsage.t_sec >= cooldownSec
    ) {
      validKeys.add(key);
      lastValidUsage = usage;
      continue;
    }

    conflictKeys.add(key);
  }

  return { validKeys, conflictKeys };
}

export function isSchAetherflowSkill(skillId: string) {
  return skillId === SCH_AETHERFLOW_ID;
}

export function isSchAetherflowSpenderSkill(skillId: string) {
  return SCH_AETHERFLOW_SPENDER_SKILL_IDS.has(skillId);
}

export function getSchAetherflowCycleIndex(sec: number) {
  return Math.max(0, Math.floor(sec / SCH_AETHERFLOW_CYCLE_SECONDS));
}

export function buildSchAetherflowSlots(
  jobId: JobId,
  usages: readonly PlanUsage[],
  maxSec: number
) {
  const aetherflowUsages = sortUsages(
    usages.filter(
      (usage) =>
        usage.jobId === jobId &&
        usage.skillId === SCH_AETHERFLOW_ID
    )
  );
  const manualUsagesByCycle = new Map<number, PlanUsage[]>();

  for (const usage of aetherflowUsages) {
    const cycleIndex = getSchAetherflowCycleIndex(usage.t_sec);
    const cycleUsages = manualUsagesByCycle.get(cycleIndex) ?? [];
    cycleUsages.push(usage);
    manualUsagesByCycle.set(cycleIndex, cycleUsages);
  }

  const maxCycleIndex = Math.max(0, getSchAetherflowCycleIndex(maxSec) + 1);
  const slots: SchAetherflowSlot[] = [];

  for (let cycleIndex = 0; cycleIndex <= maxCycleIndex; cycleIndex++) {
    const prevSlot = slots[slots.length - 1];
    const manualUsages = sortUsages(manualUsagesByCycle.get(cycleIndex) ?? []);

    if (manualUsages.length > 0) {
      const primaryUsage = manualUsages[0];
      slots.push({
        cycleIndex,
        t_sec: primaryUsage.t_sec,
        lineIndex: primaryUsage.lineIndex,
        source: "manual",
        manualUsages,
        isConflict: manualUsages.length > 1,
      });
      continue;
    }

    slots.push({
      cycleIndex,
      t_sec: prevSlot
        ? prevSlot.t_sec + SCH_AETHERFLOW_CYCLE_SECONDS
        : cycleIndex * SCH_AETHERFLOW_CYCLE_SECONDS,
      lineIndex: 0,
      source: "auto",
      manualUsages: [],
      isConflict: false,
    });
  }

  return slots;
}

export function getSchAetherflowSlotAtPoint(
  slots: readonly SchAetherflowSlot[],
  sec: number,
  lineIndex: number
) {
  let activeSlot: SchAetherflowSlot | null = null;

  for (const slot of slots) {
    if (compareRowPoint(slot.t_sec, slot.lineIndex, sec, lineIndex) > 0) {
      break;
    }
    activeSlot = slot;
  }

  return activeSlot;
}

export function simulateSchAetherflow(
  jobId: JobId,
  usages: readonly PlanUsage[],
  maxSec: number
): SchAetherflowSimulation {
  const slots = buildSchAetherflowSlots(jobId, usages, maxSec);
  const slotManualUsagesByCycle = new Map<number, readonly PlanUsage[]>();
  const aetherflowConflictKeys = new Set<string>();

  for (const slot of slots) {
    slotManualUsagesByCycle.set(slot.cycleIndex, slot.manualUsages);
    for (const usage of slot.manualUsages.slice(1)) {
      aetherflowConflictKeys.add(usageKey(usage));
    }
  }

  const dissipationUsages = sortUsages(
    usages.filter(
      (usage) =>
        usage.jobId === jobId &&
        usage.skillId === SCH_DISSIPATION_ID
    )
  );
  const dissipationCooldownState = buildCooldownValidity(
    dissipationUsages,
    SCH_DISSIPATION_COOLDOWN_SECONDS
  );

  const recitationUsages = sortUsages(
    usages.filter(
      (usage) =>
        usage.jobId === jobId &&
        usage.skillId === SCH_RECITATION_ID
    )
  );
  const recitationCooldownState = buildCooldownValidity(
    recitationUsages,
    SCH_RECITATION_COOLDOWN_SECONDS
  );

  const spenderUsages = sortUsages(
    usages.filter(
      (usage) =>
        usage.jobId === jobId &&
        isSchAetherflowSpenderSkill(usage.skillId)
    )
  );

  const spenderValidSkillKeys = new Set<string>();
  const spendersBySkill = new Map<string, PlanUsage[]>();

  for (const usage of spenderUsages) {
    const skillUsages = spendersBySkill.get(usage.skillId) ?? [];
    skillUsages.push(usage);
    spendersBySkill.set(usage.skillId, skillUsages);
  }

  for (const [skillId, skillUsages] of spendersBySkill.entries()) {
    const cooldownSec = Math.max(
      0,
      Math.floor(SKILL_MAP[skillId]?.cooldown_s ?? 0)
    );
    const cooldownState = buildCooldownValidity(skillUsages, cooldownSec);
    for (const key of cooldownState.validKeys) {
      spenderValidSkillKeys.add(key);
    }
  }

  const eligibleRecitationUsages = spenderUsages.filter(
    (usage) =>
      SCH_RECITATION_FREE_SKILL_IDS.has(usage.skillId) &&
      spenderValidSkillKeys.has(usageKey(usage))
  );
  const recitationFreeUsageKeys = new Set<string>();

  for (const recitationUsage of recitationUsages) {
    if (!recitationCooldownState.validKeys.has(usageKey(recitationUsage))) {
      continue;
    }

    const recitationEndSec =
      recitationUsage.t_sec + SCH_RECITATION_DURATION_SECONDS;

    for (const eligibleUsage of eligibleRecitationUsages) {
      const key = usageKey(eligibleUsage);
      if (recitationFreeUsageKeys.has(key)) {
        continue;
      }
      if (compareUsagePoint(eligibleUsage, recitationUsage) < 0) {
        continue;
      }
      if (eligibleUsage.t_sec > recitationEndSec) {
        break;
      }

      recitationFreeUsageKeys.add(key);
      break;
    }
  }

  const grants: SchAetherflowGrantEvent[] = [
    ...slots.map((slot) => ({
      type: "grant" as const,
      t_sec: slot.t_sec,
      lineIndex: slot.lineIndex,
      skillId: SCH_AETHERFLOW_ID,
      source: slot.source,
    })),
    ...dissipationUsages
      .filter((usage) => dissipationCooldownState.validKeys.has(usageKey(usage)))
      .map((usage) => ({
        type: "grant" as const,
        t_sec: usage.t_sec,
        lineIndex: usage.lineIndex,
        skillId: usage.skillId,
        source: "skill" as const,
      })),
  ].sort(compareResolvedEvent);

  const spendSimulationByUsageKey = new Map<string, SchAetherflowSpendSimulation>();
  const resolvedEvents: SchAetherflowResolvedEvent[] = [...grants];
  let available = 0;
  let grantIndex = 0;

  for (const usage of spenderUsages) {
    const key = usageKey(usage);

    while (
      grantIndex < grants.length &&
      compareRowPoint(
        grants[grantIndex].t_sec,
        grants[grantIndex].lineIndex,
        usage.t_sec,
        usage.lineIndex
      ) <= 0
    ) {
      available = SCH_AETHERFLOW_CAPACITY;
      grantIndex += 1;
    }

    const isSkillReady = spenderValidSkillKeys.has(key);
    const isFree = isSkillReady && recitationFreeUsageKeys.has(key);
    const availableBefore = available;

    let availableAfter = availableBefore;
    let isValid = false;

    if (isSkillReady) {
      if (isFree) {
        isValid = true;
      } else if (availableBefore > 0) {
        isValid = true;
        availableAfter = availableBefore - 1;
        available = availableAfter;
        resolvedEvents.push({
          type: "spend",
          t_sec: usage.t_sec,
          lineIndex: usage.lineIndex,
          skillId: usage.skillId,
        } satisfies SchAetherflowSpendEvent);
      }
    }

    spendSimulationByUsageKey.set(key, {
      usage,
      availableBefore,
      availableAfter,
      isSkillReady,
      isFree,
      isValid,
    });
  }

  resolvedEvents.sort(compareResolvedEvent);

  return {
    slots,
    slotManualUsagesByCycle,
    aetherflowConflictKeys,
    dissipationConflictKeys: dissipationCooldownState.conflictKeys,
    recitationConflictKeys: recitationCooldownState.conflictKeys,
    recitationFreeUsageKeys,
    spendSimulationByUsageKey,
    resolvedEvents,
    grants,
  };
}

export function getSchAetherflowStateBeforePoint(
  simulation: SchAetherflowSimulation,
  sec: number,
  lineIndex: number
): SchAetherflowStateSnapshot {
  let available = 0;

  for (const event of simulation.resolvedEvents) {
    const compare = compareRowPoint(event.t_sec, event.lineIndex, sec, lineIndex);
    if (compare > 0) {
      break;
    }

    if (event.type === "grant") {
      available = SCH_AETHERFLOW_CAPACITY;
      continue;
    }

    if (compare < 0) {
      available = Math.max(0, available - 1);
    }
  }

  const nextGrantSec =
    simulation.grants.find(
      (grant) => compareRowPoint(grant.t_sec, grant.lineIndex, sec, lineIndex) > 0
    )?.t_sec ?? null;

  return {
    available,
    nextGrantSec,
  };
}

export function getSchAetherflowStateAtPoint(
  simulation: SchAetherflowSimulation,
  sec: number,
  lineIndex: number
): SchAetherflowStateSnapshot {
  let available = 0;

  for (const event of simulation.resolvedEvents) {
    const compare = compareRowPoint(event.t_sec, event.lineIndex, sec, lineIndex);
    if (compare > 0) {
      break;
    }

    if (event.type === "grant") {
      available = SCH_AETHERFLOW_CAPACITY;
      continue;
    }

    available = Math.max(0, available - 1);
  }

  const nextGrantSec =
    simulation.grants.find(
      (grant) => compareRowPoint(grant.t_sec, grant.lineIndex, sec, lineIndex) > 0
    )?.t_sec ?? null;

  return {
    available,
    nextGrantSec,
  };
}
