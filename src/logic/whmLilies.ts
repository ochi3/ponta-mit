import { SKILL_MAP } from "../data/skills";
import type { JobId, PlanUsage, SkillId } from "../types";

export const WHM_LILY_ID = "healer.whm.lily";
export const WHM_AFFLATUS_SOLACE_ID = "healer.whm.afflatus_solace";
export const WHM_AFFLATUS_RAPTURE_ID = "healer.whm.afflatus_rapture";
export const WHM_AFFLATUS_MISERY_ID = "healer.whm.afflatus_misery";

export const WHM_LILY_CYCLE_SECONDS = 20;
export const WHM_LILY_CAPACITY = 3;
export const WHM_BLOOD_LILY_CAPACITY = 3;
export const WHM_INITIAL_LILY_COUNT = 3;
export const WHM_INITIAL_BLOOD_LILY_COUNT = 3;

export type WhmLilyResourceType = "healing_lily" | "blood_lily";

const WHM_HEALING_LILY_SPENDER_IDS = new Set<SkillId>([
  WHM_AFFLATUS_SOLACE_ID,
  WHM_AFFLATUS_RAPTURE_ID,
]);

const WHM_LILY_CONSUMER_IDS = new Set<SkillId>([
  WHM_AFFLATUS_SOLACE_ID,
  WHM_AFFLATUS_RAPTURE_ID,
  WHM_AFFLATUS_MISERY_ID,
]);

export interface WhmLilyUseSimulation {
  usage: PlanUsage;
  resource: WhmLilyResourceType;
  availableBefore: number;
  availableAfter: number;
  bloodLiliesBefore: number;
  bloodLiliesAfter: number;
  isSkillReady: boolean;
  isValid: boolean;
}

export interface WhmLilyResolvedEvent {
  type: "lily_gain" | "lily_override" | "lily_spend" | "blood_spend";
  t_sec: number;
  lineIndex: number;
  skillId: SkillId;
  liliesAfter: number;
  bloodLiliesAfter: number;
  nextLilySecAfter: number | null;
}

export interface WhmLilySimulation {
  manualOverrideKeys: ReadonlySet<string>;
  useSimulationByUsageKey: ReadonlyMap<string, WhmLilyUseSimulation>;
  resolvedEvents: readonly WhmLilyResolvedEvent[];
  lilyGains: readonly WhmLilyResolvedEvent[];
}

export interface WhmLilyStateSnapshot {
  lilies: number;
  bloodLilies: number;
  nextLilySec: number | null;
}

interface WhmLilyProcessEvent {
  type: "lily_gain" | "lily_override" | "lily_spend" | "blood_spend";
  t_sec: number;
  lineIndex: number;
  skillId: SkillId;
  usage?: PlanUsage;
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

function eventOrder(type: WhmLilyProcessEvent["type"]) {
  switch (type) {
    case "lily_gain":
      return 0;
    case "lily_override":
      return 1;
    case "lily_spend":
      return 2;
    case "blood_spend":
      return 3;
  }
}

function compareProcessEvent(
  left: WhmLilyProcessEvent,
  right: WhmLilyProcessEvent
) {
  return (
    compareRowPoint(left.t_sec, left.lineIndex, right.t_sec, right.lineIndex) ||
    eventOrder(left.type) - eventOrder(right.type) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function compareResolvedEvent(
  left: WhmLilyResolvedEvent,
  right: WhmLilyResolvedEvent
) {
  return (
    compareRowPoint(left.t_sec, left.lineIndex, right.t_sec, right.lineIndex) ||
    eventOrder(left.type) - eventOrder(right.type) ||
    left.skillId.localeCompare(right.skillId)
  );
}

function clampResource(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(WHM_LILY_CAPACITY, Math.floor(value)));
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

export function isWhmLilySkill(skillId: string) {
  return skillId === WHM_LILY_ID;
}

export function isWhmHealingLilySpenderSkill(skillId: string) {
  return WHM_HEALING_LILY_SPENDER_IDS.has(skillId);
}

export function isWhmLilyConsumerSkill(skillId: string) {
  return WHM_LILY_CONSUMER_IDS.has(skillId);
}

export function isWhmBloodLilyConsumerSkill(skillId: string) {
  return skillId === WHM_AFFLATUS_MISERY_ID;
}

export function simulateWhmLilies(
  jobId: JobId,
  usages: readonly PlanUsage[],
  maxSec: number
): WhmLilySimulation {
  const manualOverrides = sortUsages(
    usages.filter(
      (usage) => usage.jobId === jobId && usage.skillId === WHM_LILY_ID
    )
  );
  const consumerUsages = sortUsages(
    usages.filter(
      (usage) => usage.jobId === jobId && isWhmLilyConsumerSkill(usage.skillId)
    )
  );

  const validConsumerUsageKeys = new Set<string>();
  const consumersBySkill = new Map<string, PlanUsage[]>();
  for (const usage of consumerUsages) {
    const skillUsages = consumersBySkill.get(usage.skillId) ?? [];
    skillUsages.push(usage);
    consumersBySkill.set(usage.skillId, skillUsages);
  }

  for (const [skillId, skillUsages] of consumersBySkill.entries()) {
    const cooldownSec = Math.max(
      0,
      Math.floor(SKILL_MAP[skillId]?.cooldown_s ?? 0)
    );
    for (const key of buildCooldownValidity(skillUsages, cooldownSec)) {
      validConsumerUsageKeys.add(key);
    }
  }

  const lastSec = Math.max(maxSec, ...usages.map((usage) => usage.t_sec), 0);
  const events: WhmLilyProcessEvent[] = [];

  for (const usage of manualOverrides) {
    events.push({
      type: "lily_override",
      t_sec: usage.t_sec,
      lineIndex: usage.lineIndex,
      skillId: usage.skillId,
      usage,
    });
  }

  for (const usage of consumerUsages) {
    events.push({
      type: isWhmBloodLilyConsumerSkill(usage.skillId)
        ? "blood_spend"
        : "lily_spend",
      t_sec: usage.t_sec,
      lineIndex: usage.lineIndex,
      skillId: usage.skillId,
      usage,
    });
  }

  events.sort(compareProcessEvent);

  const manualOverrideKeys = new Set<string>();
  const useSimulationByUsageKey = new Map<string, WhmLilyUseSimulation>();
  const resolvedEvents: WhmLilyResolvedEvent[] = [];

  let lilies = WHM_INITIAL_LILY_COUNT;
  let bloodLilies = WHM_INITIAL_BLOOD_LILY_COUNT;
  let nextLilySec: number | null =
    lilies < WHM_LILY_CAPACITY ? WHM_LILY_CYCLE_SECONDS : null;

  const pushResolvedEvent = (event: WhmLilyProcessEvent) => {
    resolvedEvents.push({
      type: event.type,
      t_sec: event.t_sec,
      lineIndex: event.lineIndex,
      skillId: event.skillId,
      liliesAfter: lilies,
      bloodLiliesAfter: bloodLilies,
      nextLilySecAfter: nextLilySec,
    });
  };

  const applyLilyGain = (sec: number) => {
    lilies = Math.min(WHM_LILY_CAPACITY, lilies + 1);
    nextLilySec =
      lilies < WHM_LILY_CAPACITY ? sec + WHM_LILY_CYCLE_SECONDS : null;
    pushResolvedEvent({
      type: "lily_gain",
      t_sec: sec,
      lineIndex: 0,
      skillId: WHM_LILY_ID,
    });
  };

  const applyPendingLilyGainsUntil = (sec: number, lineIndex: number) => {
    while (
      nextLilySec !== null &&
      compareRowPoint(nextLilySec, 0, sec, lineIndex) <= 0
    ) {
      applyLilyGain(nextLilySec);
    }
  };

  for (const event of events) {
    applyPendingLilyGainsUntil(event.t_sec, event.lineIndex);

    if (event.type === "lily_override") {
      const usage = event.usage;
      if (!usage) {
        continue;
      }

      lilies = clampResource(usage.stacks ?? 0);
      nextLilySec =
        lilies < WHM_LILY_CAPACITY
          ? usage.t_sec + WHM_LILY_CYCLE_SECONDS
          : null;
      manualOverrideKeys.add(usageKey(usage));
      pushResolvedEvent(event);
      continue;
    }

    const usage = event.usage;
    if (!usage) {
      continue;
    }

    const key = usageKey(usage);
    const isSkillReady = validConsumerUsageKeys.has(key);
    const availableBefore = lilies;
    const bloodLiliesBefore = bloodLilies;
    let isValid = false;

    if (event.type === "lily_spend") {
      if (isSkillReady && lilies > 0) {
        const wasAtCapacity = lilies >= WHM_LILY_CAPACITY;
        lilies = Math.max(0, lilies - 1);
        if (wasAtCapacity && lilies < WHM_LILY_CAPACITY) {
          nextLilySec = usage.t_sec + WHM_LILY_CYCLE_SECONDS;
        } else if (lilies < WHM_LILY_CAPACITY && nextLilySec === null) {
          nextLilySec = usage.t_sec + WHM_LILY_CYCLE_SECONDS;
        }
        bloodLilies = Math.min(WHM_BLOOD_LILY_CAPACITY, bloodLilies + 1);
        isValid = true;
        pushResolvedEvent(event);
      }

      useSimulationByUsageKey.set(key, {
        usage,
        resource: "healing_lily",
        availableBefore,
        availableAfter: lilies,
        bloodLiliesBefore,
        bloodLiliesAfter: bloodLilies,
        isSkillReady,
        isValid,
      });
      continue;
    }

    if (isSkillReady && bloodLilies >= WHM_BLOOD_LILY_CAPACITY) {
      bloodLilies = 0;
      isValid = true;
      pushResolvedEvent(event);
    }

    useSimulationByUsageKey.set(key, {
      usage,
      resource: "blood_lily",
      availableBefore,
      availableAfter: lilies,
      bloodLiliesBefore,
      bloodLiliesAfter: bloodLilies,
      isSkillReady,
      isValid,
    });
  }

  applyPendingLilyGainsUntil(lastSec, Number.MAX_SAFE_INTEGER);
  resolvedEvents.sort(compareResolvedEvent);

  return {
    manualOverrideKeys,
    useSimulationByUsageKey,
    resolvedEvents,
    lilyGains: resolvedEvents.filter((event) => event.type === "lily_gain"),
  };
}

export function getWhmLilyStateAtPoint(
  simulation: WhmLilySimulation,
  sec: number,
  lineIndex: number
): WhmLilyStateSnapshot {
  let lilies = WHM_INITIAL_LILY_COUNT;
  let bloodLilies = WHM_INITIAL_BLOOD_LILY_COUNT;
  let nextLilySec: number | null =
    lilies < WHM_LILY_CAPACITY ? WHM_LILY_CYCLE_SECONDS : null;

  for (const event of simulation.resolvedEvents) {
    if (compareRowPoint(event.t_sec, event.lineIndex, sec, lineIndex) > 0) {
      break;
    }

    lilies = event.liliesAfter;
    bloodLilies = event.bloodLiliesAfter;
    nextLilySec = event.nextLilySecAfter;
  }

  return {
    lilies,
    bloodLilies,
    nextLilySec,
  };
}
