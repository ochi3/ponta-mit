import type { ActivityRecordEntry } from "../types";
import {
  ACTIVITY_RECORD_OPTIONS,
  getBuiltinActivityRecordBook,
} from "../data/activity-records/registry";

export interface ActivityRecordStats {
  dayCount: number;
  totalMin: number;
  hours: number;
  minutes: number;
  label: string;
}

export type ActivityNavBookSummary = {
  /** ナビ用の短い識別名（DMU / FRU など） */
  label: string;
  dayCount: number;
  durationLabel: string;
  /** 進捗にクリア記録があるか */
  cleared: boolean;
};

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

/** タイトル末尾の英数字略称を優先（例: 絶妖星乱舞 DMU → DMU） */
export function resolveActivityShortLabel(title: string, fallbackId: string): string {
  const parts = title.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  if (/^[A-Za-z][A-Za-z0-9]*$/.test(last)) {
    return last.toUpperCase();
  }
  return fallbackId;
}

/** 進捗メモからクリア済みかを判定 */
export function isActivityCleared(entries: readonly ActivityRecordEntry[]): boolean {
  return entries.some((entry) => {
    const progress = entry.progress.trim().toLowerCase();
    return (
      progress === "クリア" ||
      progress === "clear" ||
      progress.includes("クリア") ||
      /\bclear(ed)?\b/i.test(entry.progress)
    );
  });
}

/** ナビ用: 登録順（優先ブック先頭）で全活動記録の要約を返す */
export function buildActivityNavSummaries(): ActivityNavBookSummary[] {
  return ACTIVITY_RECORD_OPTIONS.flatMap((option) => {
    const book = getBuiltinActivityRecordBook(option.id);
    if (!book) {
      return [];
    }
    const stats = computeActivityRecordStats(book.entries);
    return [
      {
        label: resolveActivityShortLabel(book.title, book.id),
        dayCount: stats.dayCount,
        durationLabel: stats.label,
        cleared: isActivityCleared(book.entries),
      },
    ];
  });
}
