import type { JobId, PlanUsage, SkillId } from "../types";

/** BossMod CD Planner の plan エントリ */
export interface BossModPlanEntry {
  Option: string;
  StateID: string;
  TimeSinceActivation: number;
  WindowLength: number;
  Disabled?: boolean;
  Comment?: string;
}

export interface BossModStateAnchor {
  /** プル基準の秒数 */
  t_sec: number;
  StateID: string;
}

export interface BossModTimelineMap {
  encounter: string;
  level: number;
  phaseDurations?: number[];
  /** t_sec >= 0 のとき、最も近い（左側）アンカーを StateID に使う */
  stateAnchors: BossModStateAnchor[];
  prepull?: {
    stateID: string;
  };
}

export interface BossModSkillTrackMap {
  track: string;
  option?: string;
}

export interface BossModJobMap {
  class: string;
  module: string;
  tracks: Record<SkillId, BossModSkillTrackMap>;
  /** 未使用トラックのデフォルト Option */
  trackDefaults?: Record<string, string>;
}

export interface BossModExportMap {
  version: number;
  defaultWindowLength: number;
  /** skillId の別名（Evolve 等）→ 本番 skillId */
  skillAliases?: Record<SkillId, SkillId>;
  timelines: Record<string, BossModTimelineMap>;
  jobs: Record<JobId, BossModJobMap>;
}

export interface BossModExportRequest {
  timelineId: string;
  planName?: string;
  team: JobId[];
  usages: PlanUsage[];
  windowLength?: number;
}

export interface BossModPlanPayload {
  Name: string;
  Encounter: string;
  Class: string;
  Level: number;
  PhaseDurations: number[];
  Modules: Record<string, Record<string, BossModPlanEntry[] | Record<string, string>>>;
  Targeting: unknown[];
}

export interface BossModExportPlanResult {
  jobId: JobId;
  class: string;
  fileName: string;
  plan: {
    version: number;
    payload: BossModPlanPayload;
  };
}

export interface BossModExportResult {
  plans: BossModExportPlanResult[];
  warnings: string[];
  skipped: string[];
}

function roundTiming(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveSkillId(skillId: SkillId, map: BossModExportMap): SkillId {
  return map.skillAliases?.[skillId] ?? skillId;
}

/** t_sec から StateID と TimeSinceActivation を決定 */
export function resolveBossModTiming(
  t_sec: number,
  timelineMap: BossModTimelineMap
): { stateID: string; timeSinceActivation: number } {
  if (t_sec < 0) {
    const prepull = timelineMap.prepull ?? { stateID: "0x00000000" };
    return {
      stateID: prepull.stateID,
      timeSinceActivation: roundTiming(t_sec),
    };
  }

  const anchors = [...timelineMap.stateAnchors].sort((a, b) => a.t_sec - b.t_sec);
  let anchor = anchors[0];
  for (const candidate of anchors) {
    if (candidate.t_sec <= t_sec) {
      anchor = candidate;
    } else {
      break;
    }
  }

  if (!anchor) {
    return {
      stateID: "0x01000000",
      timeSinceActivation: roundTiming(t_sec),
    };
  }

  return {
    stateID: anchor.StateID,
    timeSinceActivation: roundTiming(t_sec - anchor.t_sec),
  };
}

function sanitizeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 96) || "plan"
  );
}

/** 軽減プランから BossMod plan JSON を生成 */
export function buildBossModPlans(
  request: BossModExportRequest,
  map: BossModExportMap
): BossModExportResult {
  const warnings: string[] = [];
  const skipped: string[] = [];
  const plans: BossModExportPlanResult[] = [];

  const timelineMap = map.timelines[request.timelineId];
  if (!timelineMap) {
    return {
      plans: [],
      warnings: [],
      skipped: [
        `タイムライン「${request.timelineId}」は BossMod マップ未登録です（devtools/bossModExportMap.json）。`,
      ],
    };
  }

  const windowLength = request.windowLength ?? map.defaultWindowLength;
  const jobsWithUsages = new Set<JobId>();

  for (const usage of request.usages) {
    if (request.team.includes(usage.jobId)) {
      jobsWithUsages.add(usage.jobId);
    }
  }

  for (const jobId of jobsWithUsages) {
    const jobMap = map.jobs[jobId];
    if (!jobMap) {
      warnings.push(`ジョブ「${jobId}」は BossMod マップ未登録のためスキップしました。`);
      continue;
    }

    const moduleTracks: Record<string, BossModPlanEntry[]> = {};
    const jobUsages = request.usages
      .filter((usage) => usage.jobId === jobId)
      .sort((a, b) => a.t_sec - b.t_sec || a.lineIndex - b.lineIndex);

    for (const usage of jobUsages) {
      const resolvedSkillId = resolveSkillId(usage.skillId, map);
      const trackMap = jobMap.tracks[resolvedSkillId];
      if (!trackMap) {
        skipped.push(
          `${jobId} / ${usage.skillId} @ ${usage.t_sec}s — BossMod トラック未登録`
        );
        continue;
      }

      const timing = resolveBossModTiming(usage.t_sec, timelineMap);
      const entry: BossModPlanEntry = {
        Option: trackMap.option ?? "Use",
        StateID: timing.stateID,
        TimeSinceActivation: timing.timeSinceActivation,
        WindowLength: windowLength,
      };

      const trackEntries = moduleTracks[trackMap.track] ?? [];
      trackEntries.push(entry);
      moduleTracks[trackMap.track] = trackEntries;
    }

    if (Object.keys(moduleTracks).length === 0) {
      warnings.push(`ジョブ「${jobId}」にエクスポート可能なスキルがありません。`);
      continue;
    }

    const defaults = jobMap.trackDefaults ?? {};
    const modulePayload: Record<string, BossModPlanEntry[] | Record<string, string>> = {
      ...Object.fromEntries(
        Object.entries(moduleTracks).map(([track, entries]) => [
          track,
          entries.sort(
            (a, b) =>
              a.TimeSinceActivation - b.TimeSinceActivation ||
              a.StateID.localeCompare(b.StateID)
          ),
        ])
      ),
      _defaults: defaults,
    };

    const planName =
      request.planName?.trim() ||
      `${timelineMap.encounter.split(".").pop() ?? request.timelineId} ${jobMap.class}`;

    const payload: BossModPlanPayload = {
      Name: planName,
      Encounter: timelineMap.encounter,
      Class: jobMap.class,
      Level: timelineMap.level,
      PhaseDurations: timelineMap.phaseDurations ?? [],
      Modules: {
        [jobMap.module]: modulePayload,
      },
      Targeting: [],
    };

    plans.push({
      jobId,
      class: jobMap.class,
      fileName: `${sanitizeFileName(planName)}.json`,
      plan: {
        version: 1,
        payload,
      },
    });
  }

  return { plans, warnings, skipped };
}
