import type { Timeline, Moment } from "../types";

export function uniqueSeconds(ms: Moment[]): number[] {
  const seen = new Set<number>();
  for (const m of ms) {
    seen.add(m.t_sec);
  }
  return Array.from(seen).sort((a,b)=>a-b);
}

/** 戦闘前に遡れる最大秒数（-15秒まで） */
export const PRE_BATTLE_TIMELINE_SEC = 15;

export type TimelineTimeDisplayMode = "clock" | "seconds";

const TIME_DISPLAY_MODE_STORAGE_KEY = "mp-time-display-mode";

export function formatSec(s: number) {
  const sign = s < 0 ? "-" : "";
  const abs = Math.abs(s);

  const m = Math.floor(abs / 60);
  const ss = abs % 60;

  return `${sign}${m.toString().padStart(2, "0")}:${ss
    .toString()
    .padStart(2, "0")}`;
}

export function formatTimelineSec(
  s: number,
  mode: TimelineTimeDisplayMode = "clock"
): string {
  if (mode === "seconds") {
    return String(s);
  }
  return formatSec(s);
}

export function loadTimelineTimeDisplayMode(): TimelineTimeDisplayMode {
  if (typeof window === "undefined") {
    return "clock";
  }
  return window.localStorage.getItem(TIME_DISPLAY_MODE_STORAGE_KEY) === "seconds"
    ? "seconds"
    : "clock";
}

export function saveTimelineTimeDisplayMode(mode: TimelineTimeDisplayMode) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(TIME_DISPLAY_MODE_STORAGE_KEY, mode);
}

export function secondsInPhase(
  tl: Timeline,
  phaseId?: string,
  usageSecs?: readonly number[]
): number[] {
  let start = 0;
  let end = 0;

  if (phaseId) {
    const p = tl.phases.find(x => x.id === phaseId);
    if (p) {
      start = p.start_sec;
      end = p.end_sec ?? (tl.moments.length > 0 ? Math.max(...tl.moments.map(m => m.t_sec)) : start);
    }
  } else {
    // Total range（0秒・戦闘前の負の秒を含める）
    if (tl.moments.length > 0) {
      start = Math.min(
        0,
        ...tl.moments.map((m) => m.t_sec),
        ...tl.phases.map((p) => p.start_sec)
      );
      end = Math.max(...tl.moments.map(m => m.t_sec), ...tl.phases.map(p => p.end_sec ?? 0));
    }
  }

  const preBattleStart = -PRE_BATTLE_TIMELINE_SEC;
  start = Math.min(start, preBattleStart);
  if (usageSecs?.length) {
    start = Math.min(start, ...usageSecs);
  }
  start = Math.max(preBattleStart, start);

  const result: number[] = [];
  for (let s = start; s <= end; s++) {
    result.push(s);
  }
  return result;
}

/** フェーズタブでジャンプする秒（All は先頭フェーズの開始秒） */
export function resolvePhaseScrollSec(tl: Timeline, phaseId?: string): number {
  if (phaseId) {
    const phase = tl.phases.find((p) => p.id === phaseId);
    if (phase) {
      return phase.start_sec;
    }
  }

  if (tl.phases.length > 0) {
    return Math.min(...tl.phases.map((phase) => phase.start_sec));
  }

  if (tl.moments.length > 0) {
    return Math.min(...tl.moments.map((moment) => moment.t_sec));
  }

  return 0;
}
