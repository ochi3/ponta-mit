import type { Timeline } from "../../types";
import { validateTimeline } from "../../logic/validate";

export const DEFAULT_TIMELINE_ID = "dancing-mad";

/** @deprecated localStorage に残った旧 ID を新 ID へ寄せる */
const TIMELINE_ID_ALIASES: Record<string, string> = {
  "zetsuyousei-ranbu": "dancing-mad",
};

export function resolveTimelineId(id: string): string {
  return TIMELINE_ID_ALIASES[id] ?? id;
}

const PRIMARY_TIMELINE_OPTION = { id: "dancing-mad", label: "DMU" } as const;

const CORE_TIMELINE_OPTIONS = [
  { id: "fru", label: "FRU" },
  { id: "m12s-p1", label: "M12S P1" },
  { id: "m12s-p2", label: "M12S P2" },
] as const;

export const BUILTIN_TIMELINE_ORDER = CORE_TIMELINE_OPTIONS.map(({ id }) => id);

export type BuiltinTimelineId = string;

const CORE_TIMELINE_LOADERS: Record<string, () => Promise<Timeline>> = {
  "dancing-mad": () => import("./dancing-mad").then((module) => module.DANCING_MAD),
  fru: () => import("./fru").then((module) => module.FRU),
  "m12s-p1": () => import("./m12s-p1").then((module) => module.M12S_P1),
  "m12s-p2": () => import("./m12s-p2").then((module) => module.M12S_P2),
};

const CUSTOM_TIMELINE_MODULES = import.meta.glob<{ default: Timeline }>(
  "./custom/*.json",
  { eager: true }
);

function cloneTimeline(timeline: Timeline): Timeline {
  return {
    ...timeline,
    phases: timeline.phases.map((phase) => ({ ...phase })),
    moments: [...timeline.moments]
      .sort(
        (a, b) =>
          a.t_sec - b.t_sec ||
          (a.order ?? 0) - (b.order ?? 0) ||
          a.name.localeCompare(b.name)
      )
      .map((moment) => ({ ...moment })),
    mechanisms: timeline.mechanisms?.map((mechanism) => ({ ...mechanism })),
    practice: timeline.practice
      ? {
          youtubeUrl: timeline.practice.youtubeUrl,
          syncPoints: timeline.practice.syncPoints.map((point) => ({ ...point })),
          jobYoutubeUrls: timeline.practice.jobYoutubeUrls
            ? { ...timeline.practice.jobYoutubeUrls }
            : undefined,
          jobVideoSource: timeline.practice.jobVideoSource
            ? { ...timeline.practice.jobVideoSource }
            : undefined,
          jobSyncPoints: timeline.practice.jobSyncPoints
            ? Object.fromEntries(
                Object.entries(timeline.practice.jobSyncPoints)
                  .filter((entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
                    Boolean(entry[1])
                  )
                  .map(([jobId, points]) => [
                    jobId,
                    points.map((point) => ({ ...point })),
                  ])
              )
            : undefined,
        }
      : undefined,
  };
}

function loadCustomTimelines() {
  const timelines = new Map<string, Timeline>();

  for (const [path, module] of Object.entries(CUSTOM_TIMELINE_MODULES)) {
    try {
      const timeline = cloneTimeline(module.default);
      validateTimeline(timeline);

      if (CORE_TIMELINE_LOADERS[timeline.id] || timelines.has(timeline.id)) {
        console.error(`[timelines] duplicate id "${timeline.id}" in ${path}`);
        continue;
      }

      timelines.set(timeline.id, timeline);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[timelines] skipped ${path}: ${message}`);
    }
  }

  return timelines;
}

const CUSTOM_TIMELINES = loadCustomTimelines();
const CUSTOM_TIMELINE_OPTIONS = Array.from(CUSTOM_TIMELINES.values())
  .filter((timeline) => timeline.id !== PRIMARY_TIMELINE_OPTION.id)
  .map((timeline) => ({ id: timeline.id, label: timeline.title }))
  .sort((a, b) => a.label.localeCompare(b.label, "ja"));

export const BUILTIN_TIMELINE_OPTIONS: ReadonlyArray<{
  id: BuiltinTimelineId;
  label: string;
}> = [PRIMARY_TIMELINE_OPTION, ...CORE_TIMELINE_OPTIONS, ...CUSTOM_TIMELINE_OPTIONS];

const BUILTIN_TIMELINE_LOADERS: Record<string, () => Promise<Timeline>> = {
  ...CORE_TIMELINE_LOADERS,
  ...Object.fromEntries(
    Array.from(CUSTOM_TIMELINES.entries()).map(([id, timeline]) => [
      id,
      () => Promise.resolve(cloneTimeline(timeline)),
    ])
  ),
};

const builtinTimelinePromiseCache = new Map<string, Promise<Timeline>>();

export function isBuiltinTimelineId(id: string): id is BuiltinTimelineId {
  return resolveTimelineId(id) in BUILTIN_TIMELINE_LOADERS;
}

export function loadBuiltinTimeline(id: string): Promise<Timeline | undefined> {
  const resolvedId = resolveTimelineId(id);
  if (!isBuiltinTimelineId(resolvedId)) {
    return Promise.resolve(undefined);
  }

  const cached = builtinTimelinePromiseCache.get(resolvedId);
  if (cached) {
    return cached;
  }

  const promise = BUILTIN_TIMELINE_LOADERS[resolvedId]();
  builtinTimelinePromiseCache.set(resolvedId, promise);
  return promise;
}
