import type { ActivityRecordEntry } from "../types";

export interface ActivityRecordStats {
  dayCount: number;
  totalMin: number;
  hours: number;
  minutes: number;
  label: string;
}

export function formatDurationMinutes(totalMin: number): string {
  const safe = Math.max(0, Math.round(totalMin));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours <= 0) {
    return `${minutes}分`;
  }
  if (minutes <= 0) {
    return `${hours}時間`;
  }
  return `${hours}時間${minutes}分`;
}

export function computeActivityRecordStats(
  entries: readonly ActivityRecordEntry[]
): ActivityRecordStats {
  const activeEntries = entries.filter(
    (entry) => entry.date && Number.isFinite(entry.duration_min) && entry.duration_min > 0
  );
  const totalMin = activeEntries.reduce((sum, entry) => sum + entry.duration_min, 0);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;

  return {
    dayCount: new Set(activeEntries.map((entry) => entry.date)).size,
    totalMin,
    hours,
    minutes,
    label: formatDurationMinutes(totalMin),
  };
}
