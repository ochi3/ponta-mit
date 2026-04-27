import { BUILTIN_TIMELINES } from "../data/timelines/registry";
import { supabase } from "./realtime";
import type {
  JobId,
  PlanUsage,
  SharePayload,
  Timeline,
  TimelinePracticeConfig,
} from "../types";

const SHARED_PLANS_TABLE = "shared_plans";

type SharedPlanRow = {
  room_id: string;
  timeline_id: string;
  team: JobId[];
  usages: PlanUsage[];
  expanded_jobs: JobId[] | null;
  practice: TimelinePracticeConfig | null;
  timeline: Timeline | null;
  updated_at: string | null;
};

export type SharedPlanSnapshot = {
  payload: SharePayload;
  importedTimeline: Timeline | null;
  updatedAt: string | null;
};

function toSharedPlansError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST205") {
    return new Error(
      "Supabase shared_plans table is missing. Run supabase/shared_plans.sql in the Supabase SQL editor first."
    );
  }

  if (error.code === "42501") {
    return new Error(
      "Supabase shared_plans table exists, but the current anon key cannot read or write it. Re-run supabase/shared_plans.sql to install the public RLS policies."
    );
  }

  return error;
}

function isBuiltinTimelineId(timelineId: string) {
  return timelineId in BUILTIN_TIMELINES;
}

function shouldPersistTimeline(timelineId: string, importedTimeline: Timeline | null) {
  return Boolean(
    importedTimeline &&
      importedTimeline.id === timelineId &&
      !isBuiltinTimelineId(timelineId)
  );
}

function toSharePayload(row: SharedPlanRow): SharePayload {
  return {
    v: 1,
    team: row.team ?? [],
    usages: row.usages ?? [],
    timelineId: row.timeline_id,
    expandedJobs: row.expanded_jobs ?? undefined,
    practice: row.practice ?? undefined,
  };
}

export async function fetchSharedPlanSnapshot(
  roomId: string,
  timelineId: string
): Promise<SharedPlanSnapshot | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(SHARED_PLANS_TABLE)
    .select("room_id, timeline_id, team, usages, expanded_jobs, practice, timeline, updated_at")
    .eq("room_id", roomId)
    .eq("timeline_id", timelineId)
    .maybeSingle();

  if (error) {
    throw toSharedPlansError(error);
  }

  if (!data) {
    return null;
  }

  const row = data as SharedPlanRow;

  return {
    payload: toSharePayload(row),
    importedTimeline:
      row.timeline && shouldPersistTimeline(timelineId, row.timeline)
        ? row.timeline
        : null,
    updatedAt: row.updated_at,
  };
}

export async function saveSharedPlanSnapshot(args: {
  roomId: string;
  timelineId: string;
  payload: SharePayload;
  importedTimeline: Timeline | null;
}) {
  if (!supabase) return null;

  const { roomId, timelineId, payload, importedTimeline } = args;
  const timelineToPersist = shouldPersistTimeline(timelineId, importedTimeline)
    ? importedTimeline
    : null;

  const { data, error } = await supabase
    .from(SHARED_PLANS_TABLE)
    .upsert(
      {
        room_id: roomId,
        timeline_id: timelineId,
        team: payload.team,
        usages: payload.usages,
        expanded_jobs: payload.expandedJobs ?? [],
        practice: payload.practice ?? { youtubeUrl: "", syncPoints: [] },
        timeline: timelineToPersist,
      }
    )
    .select("updated_at")
    .single();

  if (error) {
    console.error("Supabase upsert error:", error);
    throw toSharedPlansError(error);
  }

  return (data as { updated_at?: string | null } | null)?.updated_at ?? null;
}
