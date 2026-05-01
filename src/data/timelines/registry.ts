import type { Timeline } from "../../types";

export const DEFAULT_TIMELINE_ID = "fru";

export const BUILTIN_TIMELINE_ORDER = [
  "fru",
  "m12s-p1",
  "m12s-p2",
] as const;

export type BuiltinTimelineId = (typeof BUILTIN_TIMELINE_ORDER)[number];

export const BUILTIN_TIMELINE_OPTIONS: ReadonlyArray<{
  id: BuiltinTimelineId;
  label: string;
}> = [
  { id: "fru", label: "FRU" },
  { id: "m12s-p1", label: "M12S P1" },
  { id: "m12s-p2", label: "M12S P2" },
] as const;

const BUILTIN_TIMELINE_LOADERS: Record<
  BuiltinTimelineId,
  () => Promise<Timeline>
> = {
  fru: () => import("./fru").then((module) => module.FRU),
  "m12s-p1": () => import("./m12s-p1").then((module) => module.M12S_P1),
  "m12s-p2": () => import("./m12s-p2").then((module) => module.M12S_P2),
};

const builtinTimelinePromiseCache = new Map<BuiltinTimelineId, Promise<Timeline>>();

export function isBuiltinTimelineId(id: string): id is BuiltinTimelineId {
  return id in BUILTIN_TIMELINE_LOADERS;
}

export function loadBuiltinTimeline(id: string): Promise<Timeline | undefined> {
  if (!isBuiltinTimelineId(id)) {
    return Promise.resolve(undefined);
  }

  const cached = builtinTimelinePromiseCache.get(id);
  if (cached) {
    return cached;
  }

  const promise = BUILTIN_TIMELINE_LOADERS[id]();
  builtinTimelinePromiseCache.set(id, promise);
  return promise;
}
