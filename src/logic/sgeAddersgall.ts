import { SKILL_MAP } from "../data/skills";
import type { JobId, PlanUsage, SkillId } from "../types";

export const SGE_ADDERSGALL_ID = "healer.sge.addersgall";
export const SGE_RHIZOMATA_ID = "healer.sge.rhizomata";
export const SGE_DRUOCHOLE_ID = "healer.sge.druochole";
export const SGE_KERACHOLE_ID = "healer.sge.kerachole";
export const SGE_IXOCHOLE_ID = "healer.sge.ixochole";
export const SGE_TAUROCHOLE_ID = "healer.sge.taurochole";

export const SGE_ADDERSGALL_CYCLE_SECONDS = 20;
export const SGE_ADDERSGALL_CAPACITY = 3;
export const SGE_INITIAL_ADDERSGALL_COUNT = 3;

const SGE_ADDERSGALL_SPENDER_IDS = new Set<SkillId>([
  SGE_DRUOCHOLE_ID,
  SGE_KERACHOLE_ID,
  SGE_IXOCHOLE_ID,
  SGE_TAUROCHOLE_ID,
]);

export interface SgeAddersgallUseSimulation {
  usage: PlanUsage;
  availableBefore: number;
  availableAfter: number;
  isSkillReady: boolean;
  isValid: boolean;
}

export interface SgeAddersgallResolvedEvent {
  type: "gain" | "override" | "spend" | "rhizomata";
  t_sec: number;
  lineIndex: number;
  skillId: SkillId;
  availableAfter: number;
  nextGainSecAfter: number | null;
}

export interface SgeAddersgallSimulation {
  manualOverrideKeys: ReadonlySet<string>;
  useSimulationByUsageKey: ReadonlyMap<string, SgeAddersgallUseSimulation>;
  resolvedEvents: readonly SgeAddersgallResolvedEvent[];
  gains: readonly SgeAddersgallResolvedEvent[];
}

export interface SgeAddersgallStateSnapshot {
  available: number;
  nextGainSec: number | null;
}

interface SgeAddersgallProcessEvent {
  type: "override" | "spend" | "rhizomata";
  t_sec: number;
  lineIndex: number;
  skillId: SkillId;
  usage: PlanUsage;
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

function eventOrder(type: SgeAddersgallProcessEvent["type"] | "gain") {
  switch (type) {
    case "gain":
      return 0;
    case "override":
      return 1;
    case "rhizomata":
      return 2;
    case "spend":
      return 3;
  }
}

function compareProcessEvent(
  left: SgeAddersgallProcessEvent,
  right: SgeAddersgallProcessEvent
) {
  return (
    compareRowPoint(left.t_sec, left.lineIndex, right.t_sec, right.lineIndex) ||
    eventOrder(left.type) - eventOrder(right.type) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function compareResolvedEvent(
  left: SgeAddersgallResolvedEvent,
  right: SgeAddersgallResolvedEvent
) {
  return (
    compareRowPoint(left.t_sec, left.lineIndex, right.t_sec, right.lineIndex) ||
    eventOrder(left.type) - eventOrder(right.type) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function clampAddersgall(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(SGE_ADDERSGALL_CAPACITY, Math.floor(value)));
}

function buildCooldownValidity(
  usages: readonly PlanUsage[],
  cooldownSec: number
) {
  const validKeys = new Set<string>();
  let lastValidUsage: PlanUsage | null = null;

  for (const usage of sortUsages(usages)) {
    const key = usageKey(usage);
    if (
      !lastValidUsage ||
      cooldownSec <= 0 ||
      usage.t_sec - lastValidUsage.t_sec >= cooldownSec
    ) {
      validKeys.add(key);
      lastValidUsage = usage;
    }
  }

  return validKeys;
}

export function isSgeAddersgallSkill(skillId: string) {
  return skillId === SGE_ADDERSGALL_ID;
}

export function isSgeAddersgallSpenderSkill(skillId: string) {
  return SGE_ADDERSGALL_SPENDER_IDS.has(skillId);
}

export function isSgeAddersgallGrantSkill(skillId: string) {
  return skillId === SGE_RHIZOMATA_ID;
}

export function simulateSgeAddersgall(
  jobId: JobId,
  usages: readonly PlanUsage[],
  maxSec: number
): SgeAddersgallSimulation {
  const manualOverrides = sortUsages(
    usages.filter(
      (usage) => usage.jobId === jobId && usage.skillId === SGE_ADDERSGALL_ID
    )
  );
  const spenderUsages = sortUsages(
    usages.filter(
      (usage) => usage.jobId === jobId && isSgeAddersgallSpenderSkill(usage.skillId)
    )
  );
  const rhizomataUsages = sortUsages(
    usages.filter(
      (usage) => usage.jobId === jobId && usage.skillId === SGE_RHIZOMATA_ID
    )
  );

  const validUsageKeys = new Set<string>();
  const usagesBySkill = new Map<string, PlanUsage[]>();

  for (const usage of [...spenderUsages, ...rhizomataUsages]) {
    const skillUsages = usagesBySkill.get(usage.skillId) ?? [];
    skillUsages.push(usage);
    usagesBySkill.set(usage.skillId, skillUsages);
  }

  for (const [skillId, skillUsages] of usagesBySkill.entries()) {
    const cooldownSec = Math.max(
      0,
      Math.floor(SKILL_MAP[skillId]?.cooldown_s ?? 0)
    );
    for (const key of buildCooldownValidity(skillUsages, cooldownSec)) {
      validUsageKeys.add(key);
    }
  }

  const lastSec = Math.max(maxSec, ...usages.map((usage) => usage.t_sec), 0);
  const events: SgeAddersgallProcessEvent[] = [
    ...manualOverrides.map((usage) => ({
      type: "override" as const,
      t_sec: usage.t_sec,
      lineIndex: usage.lineIndex,
      skillId: usage.skillId,
      usage,
    })),
    ...rhizomataUsages.map((usage) => ({
      type: "rhizomata" as const,
      t_sec: usage.t_sec,
      lineIndex: usage.lineIndex,
      skillId: usage.skillId,
      usage,
    })),
    ...spenderUsages.map((usage) => ({
      type: "spend" as const,
      t_sec: usage.t_sec,
      lineIndex: usage.lineIndex,
      skillId: usage.skillId,
      usage,
    })),
  ].sort(compareProcessEvent);

  const manualOverrideKeys = new Set<string>();
  const useSimulationByUsageKey = new Map<string, SgeAddersgallUseSimulation>();
  const resolvedEvents: SgeAddersgallResolvedEvent[] = [];

  let available = SGE_INITIAL_ADDERSGALL_COUNT;
  let nextGainSec: number | null =
    available < SGE_ADDERSGALL_CAPACITY ? SGE_ADDERSGALL_CYCLE_SECONDS : null;

  const pushResolvedEvent = (
    event: Pick<SgeAddersgallResolvedEvent, "type" | "t_sec" | "lineIndex" | "skillId">
  ) => {
    resolvedEvents.push({
      ...event,
      availableAfter: available,
      nextGainSecAfter: nextGainSec,
    });
  };

  const applyGain = (sec: number) => {
    available = Math.min(SGE_ADDERSGALL_CAPACITY, available + 1);
    nextGainSec =
      available < SGE_ADDERSGALL_CAPACITY
        ? sec + SGE_ADDERSGALL_CYCLE_SECONDS
        : null;
    pushResolvedEvent({
      type: "gain",
      t_sec: sec,
      lineIndex: 0,
      skillId: SGE_ADDERSGALL_ID,
    });
  };

  const applyPendingGainsUntil = (sec: number, lineIndex: number) => {
    while (
      nextGainSec !== null &&
      compareRowPoint(nextGainSec, 0, sec, lineIndex) <= 0
    ) {
      applyGain(nextGainSec);
    }
  };

  for (const event of events) {
    applyPendingGainsUntil(event.t_sec, event.lineIndex);

    if (event.type === "override") {
      available = clampAddersgall(event.usage.stacks ?? 0);
      nextGainSec =
        available < SGE_ADDERSGALL_CAPACITY
          ? event.usage.t_sec + SGE_ADDERSGALL_CYCLE_SECONDS
          : null;
      manualOverrideKeys.add(usageKey(event.usage));
      pushResolvedEvent(event);
      continue;
    }

    const key = usageKey(event.usage);
    const isSkillReady = validUsageKeys.has(key);
    const availableBefore = available;
    let availableAfter = availableBefore;
    let isValid = false;

    if (event.type === "rhizomata") {
      if (isSkillReady) {
        available = Math.min(SGE_ADDERSGALL_CAPACITY, available + 1);
        availableAfter = available;
        nextGainSec =
          available >= SGE_ADDERSGALL_CAPACITY
            ? null
            : nextGainSec ?? event.usage.t_sec + SGE_ADDERSGALL_CYCLE_SECONDS;
        pushResolvedEvent(event);
      }
      continue;
    }

    if (isSkillReady && availableBefore > 0) {
      const wasAtCapacity = available >= SGE_ADDERSGALL_CAPACITY;
      available = Math.max(0, available - 1);
      availableAfter = available;
      if (wasAtCapacity && available < SGE_ADDERSGALL_CAPACITY) {
        nextGainSec = event.usage.t_sec + SGE_ADDERSGALL_CYCLE_SECONDS;
      } else if (available < SGE_ADDERSGALL_CAPACITY && nextGainSec === null) {
        nextGainSec = event.usage.t_sec + SGE_ADDERSGALL_CYCLE_SECONDS;
      }
      isValid = true;
      pushResolvedEvent(event);
    }

    useSimulationByUsageKey.set(key, {
      usage: event.usage,
      availableBefore,
      availableAfter,
      isSkillReady,
      isValid,
    });
  }

  applyPendingGainsUntil(lastSec, Number.MAX_SAFE_INTEGER);
  resolvedEvents.sort(compareResolvedEvent);

  return {
    manualOverrideKeys,
    useSimulationByUsageKey,
    resolvedEvents,
    gains: resolvedEvents.filter((event) => event.type === "gain"),
  };
}

export function getSgeAddersgallStateAtPoint(
  simulation: SgeAddersgallSimulation,
  sec: number,
  lineIndex: number
): SgeAddersgallStateSnapshot {
  let available = SGE_INITIAL_ADDERSGALL_COUNT;
  let nextGainSec: number | null =
    available < SGE_ADDERSGALL_CAPACITY ? SGE_ADDERSGALL_CYCLE_SECONDS : null;

  for (const event of simulation.resolvedEvents) {
    if (compareRowPoint(event.t_sec, event.lineIndex, sec, lineIndex) > 0) {
      break;
    }

    available = event.availableAfter;
    nextGainSec = event.nextGainSecAfter;
  }

  return {
    available,
    nextGainSec,
  };
}
