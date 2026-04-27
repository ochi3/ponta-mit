import { createClient } from "@supabase/supabase-js";
import { DEFAULT_TIMELINE_ID } from "../data/timelines/registry";

const DEFAULT_ROOM_ID = "default-room";
const ROOM_QUERY_KEY = "room";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

export const REALTIME_EVENTS = {
  USAGE_ADDED: "usage_added",
  USAGE_REMOVED: "usage_removed",
  USAGE_UPDATED: "usage_updated",
  CLEAR_ALL: "clear_all",
  TEAM_UPDATED: "team_updated",
  REQUEST_STATE: "request_state",
  SYNC_STATE: "sync_state",
} as const;

export function getRoomId() {
  if (typeof window === "undefined") {
    return DEFAULT_ROOM_ID;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get(ROOM_QUERY_KEY)?.trim() || DEFAULT_ROOM_ID;
}

function createRoomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `room-${Math.random().toString(36).slice(2, 10)}`;
}

export function ensureRoomId() {
  if (typeof window === "undefined") {
    return DEFAULT_ROOM_ID;
  }

  const url = new URL(window.location.href);
  const existingRoomId = url.searchParams.get(ROOM_QUERY_KEY)?.trim();
  if (existingRoomId) {
    return existingRoomId;
  }

  const roomId = createRoomId();
  url.searchParams.set(ROOM_QUERY_KEY, roomId);
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return roomId;
}

export function getRealtimeChannelName(roomId: string, timelineId?: string) {
  const normalizedRoomId = roomId.trim() || DEFAULT_ROOM_ID;
  const normalizedTimelineId = timelineId?.trim() || DEFAULT_TIMELINE_ID;
  return `room:${normalizedRoomId}:timeline:${normalizedTimelineId}`;
}
