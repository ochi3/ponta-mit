import type { ActivityRecordBook, ActivityRecordEntry } from "../../types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CUSTOM_ACTIVITY_RECORD_MODULES = import.meta.glob<{ default: ActivityRecordBook }>(
  "./custom/*.json",
  { eager: true }
);

function cloneEntry(entry: ActivityRecordEntry): ActivityRecordEntry {
  return { ...entry };
}

function cloneBook(book: ActivityRecordBook): ActivityRecordBook {
  return {
    ...book,
    entries: [...book.entries]
      .sort((a, b) => b.date.localeCompare(a.date) || a.progress.localeCompare(b.progress))
      .map(cloneEntry),
  };
}

function validateActivityRecordBook(book: unknown, source: string): ActivityRecordBook | null {
  if (!book || typeof book !== "object") {
    console.warn(`[activity-records] ${source}: root must be an object`);
    return null;
  }
  const value = book as ActivityRecordBook;
  if (typeof value.id !== "string" || !value.id.trim()) {
    console.warn(`[activity-records] ${source}: id is required`);
    return null;
  }
  if (typeof value.title !== "string" || !value.title.trim()) {
    console.warn(`[activity-records] ${source}: title is required`);
    return null;
  }
  if (value.version !== 1) {
    console.warn(`[activity-records] ${source}: version must be 1`);
    return null;
  }
  if (!Array.isArray(value.entries)) {
    console.warn(`[activity-records] ${source}: entries must be an array`);
    return null;
  }

  const entries: ActivityRecordEntry[] = [];
  const seenDates = new Set<string>();
  for (const [index, raw] of value.entries.entries()) {
    if (!raw || typeof raw !== "object") {
      console.warn(`[activity-records] ${source}: entries[${index}] must be an object`);
      return null;
    }
    const entry = raw as ActivityRecordEntry;
    if (typeof entry.date !== "string" || !DATE_RE.test(entry.date)) {
      console.warn(`[activity-records] ${source}: entries[${index}].date must be YYYY-MM-DD`);
      return null;
    }
    if (seenDates.has(entry.date)) {
      console.warn(`[activity-records] ${source}: duplicate date ${entry.date}`);
      return null;
    }
    seenDates.add(entry.date);
    if (!Number.isFinite(entry.duration_min) || entry.duration_min < 0) {
      console.warn(`[activity-records] ${source}: entries[${index}].duration_min must be >= 0`);
      return null;
    }
    if (typeof entry.progress !== "string") {
      console.warn(`[activity-records] ${source}: entries[${index}].progress must be a string`);
      return null;
    }
    if (entry.fflogs_url !== undefined && typeof entry.fflogs_url !== "string") {
      console.warn(`[activity-records] ${source}: entries[${index}].fflogs_url must be a string`);
      return null;
    }
    entries.push({
      date: entry.date,
      duration_min: Math.round(entry.duration_min),
      progress: entry.progress,
      ...(entry.fflogs_url?.trim() ? { fflogs_url: entry.fflogs_url.trim() } : {}),
    });
  }

  return cloneBook({
    id: value.id.trim(),
    title: value.title.trim(),
    version: 1,
    ...(value.description?.trim() ? { description: value.description.trim() } : {}),
    entries,
  });
}

function loadBuiltinActivityRecordBooks() {
  const books = new Map<string, ActivityRecordBook>();
  for (const [filePath, module] of Object.entries(CUSTOM_ACTIVITY_RECORD_MODULES)) {
    const validated = validateActivityRecordBook(module.default, filePath);
    if (!validated) {
      continue;
    }
    if (books.has(validated.id)) {
      console.warn(`[activity-records] duplicate id "${validated.id}" (${filePath})`);
      continue;
    }
    books.set(validated.id, validated);
  }
  return books;
}

const BUILTIN_ACTIVITY_RECORD_BOOKS = loadBuiltinActivityRecordBooks();

/** プルダウン先頭・ナビ集計の優先ブック（絶妖星乱舞 DMU） */
export const DEFAULT_ACTIVITY_RECORD_ID = "raid-progress";

const ACTIVITY_RECORD_OPTION_PRIORITY: readonly string[] = [
  DEFAULT_ACTIVITY_RECORD_ID,
  "fru",
  "top",
];

export const ACTIVITY_RECORD_OPTIONS = [...BUILTIN_ACTIVITY_RECORD_BOOKS.values()]
  .map((book) => ({ id: book.id, label: book.title }))
  .sort((a, b) => {
    const aPriority = ACTIVITY_RECORD_OPTION_PRIORITY.indexOf(a.id);
    const bPriority = ACTIVITY_RECORD_OPTION_PRIORITY.indexOf(b.id);
    const aRank = aPriority === -1 ? Number.POSITIVE_INFINITY : aPriority;
    const bRank = bPriority === -1 ? Number.POSITIVE_INFINITY : bPriority;
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return a.label.localeCompare(b.label, "ja");
  });

export function getBuiltinActivityRecordBook(id: string): ActivityRecordBook | null {
  const book = BUILTIN_ACTIVITY_RECORD_BOOKS.get(id);
  return book ? cloneBook(book) : null;
}

export function getAllBuiltinActivityRecordBooks(): ActivityRecordBook[] {
  return [...BUILTIN_ACTIVITY_RECORD_BOOKS.values()].map(cloneBook);
}

export function resolveActivityRecordId(id: string | undefined | null): string {
  const normalized = (id ?? "").trim();
  if (normalized && BUILTIN_ACTIVITY_RECORD_BOOKS.has(normalized)) {
    return normalized;
  }
  if (BUILTIN_ACTIVITY_RECORD_BOOKS.has(DEFAULT_ACTIVITY_RECORD_ID)) {
    return DEFAULT_ACTIVITY_RECORD_ID;
  }
  return ACTIVITY_RECORD_OPTIONS[0]?.id ?? DEFAULT_ACTIVITY_RECORD_ID;
}
