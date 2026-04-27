import type { Timeline } from "../types";
import { validateTimeline } from "./validate";

/**
 * Parse a JSON file in the same shape as built-in timelines (e.g. FRU / m12s-p1 / m12s-p2).
 * Sorts moments by time and validates.
 */
export function parseTimelineJson(text: string): Timeline {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Timeline root must be an object");
  }
  const tl = raw as Timeline;
  if (!tl.id || typeof tl.id !== "string") {
    throw new Error('Timeline must have string "id"');
  }
  if (!Array.isArray(tl.phases) || !Array.isArray(tl.moments)) {
    throw new Error('Timeline must have "phases" and "moments" arrays');
  }
  tl.moments = [...tl.moments].sort(
    (a, b) =>
      a.t_sec - b.t_sec ||
      (a.order ?? 0) - (b.order ?? 0) ||
      String(a.name).localeCompare(String(b.name))
  );
  validateTimeline(tl);
  return tl;
}
