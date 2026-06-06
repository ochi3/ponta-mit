import { parseYouTubeUrl } from "./youtube";
import type {
  JobId,
  TimelinePracticeConfig,
  PracticeVideoSource,
  VideoSyncPoint,
} from "../types";

export type PracticeSyncTarget = "base" | JobId;

function clampTimelineSec(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.floor(value);
}

function clampVideoSec(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function normalizeSyncPoints(syncPoints?: readonly VideoSyncPoint[]) {
  const byTimelineSecond = new Map<number, VideoSyncPoint>();

  for (const point of syncPoints ?? []) {
    if (!Number.isFinite(point.t_sec) || !Number.isFinite(point.video_sec)) {
      continue;
    }

    const t_sec = clampTimelineSec(point.t_sec);
    const video_sec = clampVideoSec(point.video_sec);
    byTimelineSecond.set(t_sec, { t_sec, video_sec });
  }

  return Array.from(byTimelineSecond.values()).sort(
    (a, b) => a.t_sec - b.t_sec || a.video_sec - b.video_sec
  );
}

export function splitSyncPoints(syncPoints: readonly VideoSyncPoint[], youtubeUrl: string) {
  const normalized = normalizeSyncPoints(syncPoints);
  const basePoint = normalized.find((point) => point.t_sec === 0);
  const parsedVideo = parseYouTubeUrl(youtubeUrl);

  return {
    baseVideoSec: basePoint?.video_sec ?? parsedVideo?.startSeconds ?? 0,
    extraPoints: normalized.filter((point) => point.t_sec > 0),
  };
}

export function buildFullSyncPoints(
  baseVideoSec: number,
  extraPoints: readonly VideoSyncPoint[]
) {
  return normalizeSyncPoints([
    { t_sec: 0, video_sec: clampVideoSec(baseVideoSec) },
    ...extraPoints,
  ]);
}

export function normalizeJobYoutubeUrls(
  urls?: Partial<Record<JobId, string>> | null
): Partial<Record<JobId, string>> {
  if (!urls) {
    return {};
  }

  const normalized: Partial<Record<JobId, string>> = {};
  for (const [jobId, url] of Object.entries(urls)) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (trimmed) {
      normalized[jobId] = trimmed;
    }
  }
  return normalized;
}

export function normalizeJobSyncPoints(
  jobSyncPoints?: Partial<Record<JobId, readonly VideoSyncPoint[]>> | null
): Partial<Record<JobId, VideoSyncPoint[]>> {
  if (!jobSyncPoints) {
    return {};
  }

  const normalized: Partial<Record<JobId, VideoSyncPoint[]>> = {};
  for (const [jobId, points] of Object.entries(jobSyncPoints)) {
    const nextPoints = normalizeSyncPoints(points);
    if (nextPoints.length > 0) {
      normalized[jobId] = nextPoints;
    }
  }
  return normalized;
}

export function normalizeJobVideoSource(
  sources?: Partial<Record<JobId, PracticeVideoSource>> | null
): Partial<Record<JobId, PracticeVideoSource>> {
  if (!sources) {
    return {};
  }

  const normalized: Partial<Record<JobId, PracticeVideoSource>> = {};
  for (const [jobId, source] of Object.entries(sources)) {
    if (source === "base" || source === "job") {
      normalized[jobId] = source;
    }
  }
  return normalized;
}

export function filterPracticeJobFieldsForTeam(
  practice: TimelinePracticeConfig,
  team: readonly JobId[]
): TimelinePracticeConfig {
  const teamSet = new Set(team);
  const jobYoutubeUrls = Object.fromEntries(
    Object.entries(practice.jobYoutubeUrls ?? {}).filter(([jobId]) => teamSet.has(jobId))
  );
  const jobVideoSource = Object.fromEntries(
    Object.entries(practice.jobVideoSource ?? {}).filter(([jobId]) => teamSet.has(jobId))
  );
  const jobSyncPoints = Object.fromEntries(
    Object.entries(practice.jobSyncPoints ?? {}).filter(([jobId]) => teamSet.has(jobId))
  );

  return {
    ...practice,
    jobYoutubeUrls:
      Object.keys(jobYoutubeUrls).length > 0 ? jobYoutubeUrls : undefined,
    jobVideoSource:
      Object.keys(jobVideoSource).length > 0 ? jobVideoSource : undefined,
    jobSyncPoints:
      Object.keys(jobSyncPoints).length > 0 ? jobSyncPoints : undefined,
  };
}

export function getJobPracticeVideoUrl(
  practice: TimelinePracticeConfig,
  jobId: JobId | null | undefined
) {
  if (!jobId) {
    return "";
  }
  return practice.jobYoutubeUrls?.[jobId]?.trim() ?? "";
}

export function hasAnyPracticeVideo(practice?: Partial<TimelinePracticeConfig> | null) {
  if (!practice) {
    return false;
  }
  if (practice.youtubeUrl?.trim()) {
    return true;
  }
  if (practice.syncPoints?.length) {
    return true;
  }
  if (Object.values(practice.jobYoutubeUrls ?? {}).some((url) => url?.trim())) {
    return true;
  }
  return Object.values(practice.jobSyncPoints ?? {}).some(
    (points) => (points?.length ?? 0) > 0
  );
}

export function resolvePracticeVideoSource(
  practice: TimelinePracticeConfig,
  jobId: JobId | null | undefined
): PracticeVideoSource {
  if (!jobId) {
    return "base";
  }

  const stored = practice.jobVideoSource?.[jobId];
  if (stored === "job" && getJobPracticeVideoUrl(practice, jobId)) {
    return "job";
  }
  if (stored === "base") {
    return "base";
  }
  return getJobPracticeVideoUrl(practice, jobId) ? "job" : "base";
}

export function resolvePracticeSyncTarget(
  practice: TimelinePracticeConfig,
  jobId: JobId | null | undefined
): PracticeSyncTarget {
  if (!jobId) {
    return "base";
  }
  return resolvePracticeVideoSource(practice, jobId) === "job" ? jobId : "base";
}

export function resolvePracticeYoutubeUrl(
  practice: TimelinePracticeConfig,
  jobId: JobId | null | undefined,
  source?: PracticeVideoSource
) {
  const effectiveSource = source ?? resolvePracticeVideoSource(practice, jobId);
  if (effectiveSource === "job" && jobId) {
    const jobUrl = getJobPracticeVideoUrl(practice, jobId);
    if (jobUrl) {
      return jobUrl;
    }
  }
  return practice.youtubeUrl.trim();
}

export function getSyncPointsForTarget(
  practice: TimelinePracticeConfig,
  target: PracticeSyncTarget
) {
  if (target === "base") {
    return practice.syncPoints;
  }
  return practice.jobSyncPoints?.[target] ?? [];
}

export function buildEffectiveSyncPoints(
  syncPoints: readonly VideoSyncPoint[],
  fallbackVideoStartSec: number
) {
  const normalized = normalizeSyncPoints(syncPoints);
  if (normalized.length > 0) {
    return normalized;
  }
  return [{ t_sec: 0, video_sec: fallbackVideoStartSec }];
}

/** 動画秒から、適用中の同期ポイントのインデックスを返す */
export function findActiveSyncPointIndexForVideo(
  syncPoints: readonly VideoSyncPoint[],
  videoSec: number
) {
  let index = 0;
  for (let i = 0; i < syncPoints.length; i++) {
    if (syncPoints[i].video_sec <= videoSec + 0.2) {
      index = i;
    }
  }
  return index;
}

/** タイムライン秒から、対応する動画秒へ変換する */
export function timelineSecToVideoSec(
  timelineSec: number,
  syncPoints: readonly VideoSyncPoint[],
  fallbackVideoStartSec = 0
) {
  const points = buildEffectiveSyncPoints(syncPoints, fallbackVideoStartSec);
  if (points.length === 0) {
    return Math.max(0, timelineSec + fallbackVideoStartSec);
  }

  let activeIndex = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].t_sec <= timelineSec) {
      activeIndex = i;
    } else {
      break;
    }
  }

  const activePoint = points[activeIndex];
  return activePoint.video_sec + (timelineSec - activePoint.t_sec);
}

export function applySyncPointUpdate(
  practice: TimelinePracticeConfig,
  target: PracticeSyncTarget,
  timelineSec: number,
  videoSec: number
): TimelinePracticeConfig {
  const t_sec = clampTimelineSec(timelineSec);
  const video_sec = clampVideoSec(videoSec);

  if (target === "base") {
    const nextPoints = normalizeSyncPoints([
      ...practice.syncPoints.filter((point) => point.t_sec !== t_sec),
      { t_sec, video_sec },
    ]);
    return { ...practice, syncPoints: nextPoints };
  }

  const currentJobPoints = practice.jobSyncPoints?.[target] ?? [];
  const nextJobPoints = normalizeSyncPoints([
    ...currentJobPoints.filter((point) => point.t_sec !== t_sec),
    { t_sec, video_sec },
  ]);

  return {
    ...practice,
    jobSyncPoints: {
      ...practice.jobSyncPoints,
      [target]: nextJobPoints,
    },
  };
}

export function applySyncPointRemoval(
  practice: TimelinePracticeConfig,
  target: PracticeSyncTarget,
  timelineSec: number
): TimelinePracticeConfig {
  const t_sec = clampTimelineSec(timelineSec);

  if (target === "base") {
    return {
      ...practice,
      syncPoints: normalizeSyncPoints(
        practice.syncPoints.filter((point) => point.t_sec !== t_sec)
      ),
    };
  }

  const currentJobPoints = practice.jobSyncPoints?.[target] ?? [];
  const nextJobPoints = normalizeSyncPoints(
    currentJobPoints.filter((point) => point.t_sec !== t_sec)
  );
  const jobSyncPoints = { ...practice.jobSyncPoints };

  if (nextJobPoints.length > 0) {
    jobSyncPoints[target] = nextJobPoints;
  } else {
    delete jobSyncPoints[target];
  }

  return {
    ...practice,
    jobSyncPoints:
      Object.keys(jobSyncPoints).length > 0 ? jobSyncPoints : undefined,
  };
}

export function getSyncTargetLabel(
  target: PracticeSyncTarget,
  jobName?: string
) {
  if (target === "base") {
    return "基本の動画";
  }
  return jobName ? `${jobName}の動画` : "ジョブの動画";
}

export type SyncTargetOption = {
  target: PracticeSyncTarget;
  label: string;
};

export function listSyncTargetOptions(
  practice: TimelinePracticeConfig,
  team: readonly JobId[],
  resolveJobName: (jobId: JobId) => string
): SyncTargetOption[] {
  const options: SyncTargetOption[] = [
    { target: "base", label: getSyncTargetLabel("base") },
  ];

  for (const jobId of team) {
    const hasJobUrl = Boolean(getJobPracticeVideoUrl(practice, jobId));
    const hasJobSync = (practice.jobSyncPoints?.[jobId]?.length ?? 0) > 0;
    const label = getSyncTargetLabel(jobId, resolveJobName(jobId));
    options.push({
      target: jobId,
      label: hasJobUrl || hasJobSync ? label : `${label}（URL未設定）`,
    });
  }

  return options;
}
