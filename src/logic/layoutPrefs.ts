import type { PlannerLayoutPrefs } from "../types";

export const DEFAULT_MEMO_COLUMN_WIDTH_PX = Math.round(176 * 0.7);
export const MIN_MEMO_COLUMN_WIDTH_PX = 80;
export const MAX_MEMO_COLUMN_WIDTH_PX = 520;

export function clampMemoColumnWidth(widthPx: number) {
  return Math.round(
    Math.min(MAX_MEMO_COLUMN_WIDTH_PX, Math.max(MIN_MEMO_COLUMN_WIDTH_PX, widthPx))
  );
}

export function normalizeLayoutPrefs(
  raw?: PlannerLayoutPrefs | null
): PlannerLayoutPrefs {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const memoWidthPx =
    typeof raw.memoWidthPx === "number" && Number.isFinite(raw.memoWidthPx)
      ? clampMemoColumnWidth(raw.memoWidthPx)
      : undefined;

  return memoWidthPx !== undefined ? { memoWidthPx } : {};
}

export function resolveMemoColumnWidth(prefs?: PlannerLayoutPrefs | null) {
  return normalizeLayoutPrefs(prefs).memoWidthPx ?? DEFAULT_MEMO_COLUMN_WIDTH_PX;
}
