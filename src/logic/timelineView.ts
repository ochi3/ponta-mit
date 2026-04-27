import type { Timeline, Moment } from "../types";

export function uniqueSeconds(ms: Moment[]): number[] {
  const seen = new Set<number>();
  for (const m of ms) {
    seen.add(m.t_sec);
  }
  return Array.from(seen).sort((a,b)=>a-b);
}

export function formatSec(s: number) {
  const sign = s < 0 ? "-" : "";
  const abs  = Math.abs(s);

  const m  = Math.floor(abs / 60);
  const ss = abs % 60;

  return `${sign}${m.toString().padStart(2, "0")}:${ss
    .toString()
    .padStart(2, "0")}`;
}

export function secondsInPhase(tl: Timeline, phaseId?: string): number[] {
  let start = 0;
  let end = 0;

  if (phaseId) {
    const p = tl.phases.find(x => x.id === phaseId);
    if (p) {
      start = p.start_sec;
      end = p.end_sec ?? (tl.moments.length > 0 ? Math.max(...tl.moments.map(m => m.t_sec)) : start);
    }
  } else {
    // Total range
    if (tl.moments.length > 0) {
      start = Math.min(...tl.moments.map(m => m.t_sec), ...tl.phases.map(p => p.start_sec));
      end = Math.max(...tl.moments.map(m => m.t_sec), ...tl.phases.map(p => p.end_sec ?? 0));
    }
  }

  const result: number[] = [];
  for (let s = start; s <= end; s++) {
    result.push(s);
  }
  return result;
}
