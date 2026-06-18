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

function sortMoments(moments: readonly Moment[]) {
  return [...moments].sort(
    (a, b) =>
      a.t_sec - b.t_sec ||
      (a.order ?? 0) - (b.order ?? 0) ||
      a.name.localeCompare(b.name, "ja")
  );
}

function storageKey(timelineId: string) {
  return `${STORAGE_PREFIX}${resolveTimelineId(timelineId)}`;
}

export function momentDevSecondsKey(moment: Moment) {
  return `${moment.t_sec}::${moment.order ?? 0}::${moment.name}`;
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
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(config));
}

export function formatMomentOptionLabel(moment: Moment, index: number) {
  const orderLabel =
    moment.order !== undefined ? ` / order ${moment.order}` : "";
  return `#${index + 1} [${moment.t_sec}s] ${moment.name}${orderLabel}`;
}

/** 開発時のみ: 表示用の連番秒数（内部 t_sec は変更しない） */
export function buildDevDisplaySecondsByMomentKey(
  timeline: Timeline
): Map<string, number> | null {
  if (!isDevTimelineSecondsEnabled()) {
    return null;
  }

  const config = loadDevTimelineSecondsConfig(timeline.id);
  if (!config) {
    return null;
  }

  const sortedMoments = sortMoments(timeline.moments);
  const { anchorMomentIndex, anchorStartSec } = config;

  if (
    anchorMomentIndex < 0 ||
    anchorMomentIndex >= sortedMoments.length ||
    !Number.isFinite(anchorStartSec)
  ) {
    return null;
  }

  const map = new Map<string, number>();
  for (let index = anchorMomentIndex; index < sortedMoments.length; index++) {
    map.set(
      momentDevSecondsKey(sortedMoments[index]),
      anchorStartSec + (index - anchorMomentIndex)
    );
  }

  return map;
}

export function getDevDisplaySecForMoment(
  displaySecByMomentKey: Map<string, number> | null,
  moment: Moment | undefined
): number | null {
  if (!displaySecByMomentKey || !moment) {
    return null;
  }

  return displaySecByMomentKey.get(momentDevSecondsKey(moment)) ?? null;
}

