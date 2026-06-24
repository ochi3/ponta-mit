import { resolveTimelineId } from "../data/timelines/registry";
import type { Moment, Timeline } from "../types";

const STORAGE_PREFIX = "mp-dev-timeline-seconds::";

export interface DevTimelineSecondsConfig {
  version: 1;
  /** 連番を開始する moments 配列上のインデックス（ソート済み） */
  anchorMomentIndex: number;
  /** アンカー行に割り当てる表示用秒数 */
  anchorStartSec: number;
}

/** 参考秒列の計算結果（内部 t_sec からのオフセット） */
export interface DevTimelineSecondsView {
  offset: number;
  anchorTSec: number;
}

const sortedMomentsCache = new Map<string, readonly Moment[]>();
let cachedViewKey = "";
let cachedView: DevTimelineSecondsView | null = null;

function sortMoments(moments: readonly Moment[]) {
  return [...moments].sort(
    (a, b) =>
      a.t_sec - b.t_sec ||
      (a.order ?? 0) - (b.order ?? 0) ||
      a.name.localeCompare(b.name, "ja")
  );
}

function getSortedMoments(timeline: Timeline) {
  const timelineId = resolveTimelineId(timeline.id);
  const cacheKey = `${timelineId}::${timeline.version ?? 0}::${timeline.moments.length}`;
  const cached = sortedMomentsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const sorted = sortMoments(timeline.moments);
  sortedMomentsCache.set(cacheKey, sorted);
  return sorted;
}

function storageKey(timelineId: string) {
  return `${STORAGE_PREFIX}${resolveTimelineId(timelineId)}`;
}

export function isDevTimelineSecondsEnabled() {
  return import.meta.env.DEV;
}

export function loadDevTimelineSecondsConfig(
  timelineId: string
): DevTimelineSecondsConfig | null {
  if (!isDevTimelineSecondsEnabled() || typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey(timelineId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as DevTimelineSecondsConfig;
    if (
      parsed?.version !== 1 ||
      typeof parsed.anchorMomentIndex !== "number" ||
      typeof parsed.anchorStartSec !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDevTimelineSecondsConfig(
  timelineId: string,
  config: DevTimelineSecondsConfig | null
) {
  if (!isDevTimelineSecondsEnabled() || typeof window === "undefined") {
    return;
  }

  const key = storageKey(timelineId);
  if (!config) {
    window.localStorage.removeItem(key);
    cachedViewKey = "";
    cachedView = null;
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(config));
  cachedViewKey = "";
  cachedView = null;
}

export function formatMomentOptionLabel(moment: Moment, index: number) {
  const orderLabel =
    moment.order !== undefined ? ` / order ${moment.order}` : "";
  return `#${index + 1} [${moment.t_sec}s] ${moment.name}${orderLabel}`;
}

/** 開発時のみ: アンカー以降の参考秒（内部 t_sec + オフセット、CD は変更しない） */
export function buildDevTimelineSecondsView(
  timeline: Timeline,
  revision = 0
): DevTimelineSecondsView | null {
  if (!isDevTimelineSecondsEnabled()) {
    return null;
  }

  const cacheKey = `${resolveTimelineId(timeline.id)}::${revision}`;
  if (cacheKey === cachedViewKey) {
    return cachedView;
  }

  const config = loadDevTimelineSecondsConfig(timeline.id);
  if (!config) {
    cachedViewKey = cacheKey;
    cachedView = null;
    return null;
  }

  const sortedMoments = getSortedMoments(timeline);
  const { anchorMomentIndex, anchorStartSec } = config;

  if (
    anchorMomentIndex < 0 ||
    anchorMomentIndex >= sortedMoments.length ||
    !Number.isFinite(anchorStartSec)
  ) {
    cachedViewKey = cacheKey;
    cachedView = null;
    return null;
  }

  const anchorTSec = sortedMoments[anchorMomentIndex].t_sec;
  cachedViewKey = cacheKey;
  cachedView = {
    offset: anchorStartSec - anchorTSec,
    anchorTSec,
  };
  return cachedView;
}

export function getDevDisplaySecForRow(
  view: DevTimelineSecondsView | null,
  tSec: number
): number | null {
  if (!view || tSec < view.anchorTSec) {
    return null;
  }

  return tSec + view.offset;
}
