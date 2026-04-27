import pako from "pako";
import { ensureRoomId } from "./realtime";
import type {
  JobId,
  PlanUsage,
  SharePayload,
  TimelinePracticeConfig,
  VideoSyncPoint,
} from "../types";

const SHARE_QUERY_KEY = "plan";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function isPlanUsage(x: unknown): x is PlanUsage {
  if (!x || typeof x !== "object") return false;
  const u = x as Record<string, unknown>;
  return (
    typeof u.t_sec === "number" &&
    typeof u.jobId === "string" &&
    typeof u.skillId === "string" &&
    typeof u.lineIndex === "number" &&
    (u.stacks === undefined || typeof u.stacks === "number")
  );
}

function isTimelineInline(
  x: unknown
): x is NonNullable<SharePayload["timelineInline"]> {
  if (!x || typeof x !== "object") return false;
  const t = x as Record<string, unknown>;
  return (
    typeof t.version === "number" &&
    Array.isArray(t.phases) &&
    Array.isArray(t.moments)
  );
}

function isVideoSyncPoint(x: unknown): x is VideoSyncPoint {
  if (!x || typeof x !== "object") return false;
  const point = x as Record<string, unknown>;
  return typeof point.t_sec === "number" && typeof point.video_sec === "number";
}

function isPracticeConfig(x: unknown): x is TimelinePracticeConfig {
  if (!x || typeof x !== "object") return false;
  const practice = x as Record<string, unknown>;
  return (
    typeof practice.youtubeUrl === "string" &&
    Array.isArray(practice.syncPoints) &&
    practice.syncPoints.every(isVideoSyncPoint)
  );
}

function normalizeParsedPayload(raw: unknown): SharePayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.v !== "number") return null;
  if (!Array.isArray(o.team) || !o.team.every((j) => typeof j === "string")) return null;
  if (!Array.isArray(o.usages) || !o.usages.every(isPlanUsage)) return null;

  const usages = o.usages as PlanUsage[];
  const team = o.team as JobId[];

  let expandedJobs: JobId[] | undefined;
  if (o.expandedJobs !== undefined) {
    if (!Array.isArray(o.expandedJobs) || !o.expandedJobs.every((j) => typeof j === "string")) {
      return null;
    }
    expandedJobs = o.expandedJobs as JobId[];
  }

  const out: SharePayload = {
    v: o.v,
    team,
    usages,
    timelineId: typeof o.timelineId === "string" ? o.timelineId : undefined,
    expandedJobs,
  };

  if (o.practice !== undefined) {
    if (!isPracticeConfig(o.practice)) return null;
    out.practice = o.practice;
  }

  if (o.timelineInline !== undefined) {
    if (!isTimelineInline(o.timelineInline)) return null;
    out.timelineInline = o.timelineInline;
  }

  return out;
}

/**
 * Build a shareable URL with compressed JSON in the `plan` query parameter.
 */
export function encodeShareUrl(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const compressed = pako.deflate(bytes, { level: 9 });
  const base64 = uint8ToBase64(compressed);

  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  if (typeof window !== "undefined") {
    params.set("room", ensureRoomId());
  }
  params.set(SHARE_QUERY_KEY, base64);
  const qs = params.toString();

  if (typeof window === "undefined") {
    return `?${qs}`;
  }

  return `${window.location.origin}${window.location.pathname}?${qs}`;
}

/**
 * Read `plan` from a full URL, relative URL, or `?plan=...` search string.
 */
export function decodeShareUrl(url: string): SharePayload | null {
  let search = "";
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://local.invalid";
    const u = new URL(url, base);
    search = u.search;
  } catch {
    if (url.startsWith("?")) {
      search = url;
    } else {
      return null;
    }
  }

  const params = new URLSearchParams(search);
  const encoded = params.get(SHARE_QUERY_KEY);
  if (!encoded) return null;

  try {
    const compressed = base64ToUint8(encoded);
    const inflated = pako.inflate(compressed);
    const json = new TextDecoder().decode(inflated);
    const parsed: unknown = JSON.parse(json);
    return normalizeParsedPayload(parsed);
  } catch {
    return null;
  }
}
