export type AppView = "planner" | "activity";

export const ACTIVITY_BOOK_QUERY_KEY = "book";

export function parseAppView(hash = ""): AppView {
  const normalized = hash.replace(/^#\/?/, "").split("?")[0]?.trim() ?? "";
  if (normalized === "activity" || normalized.startsWith("activity/")) {
    return "activity";
  }
  return "planner";
}

export function getCurrentAppView(): AppView {
  if (typeof window === "undefined") {
    return "planner";
  }
  return parseAppView(window.location.hash);
}

export function getActivityBookIdFromSearch(search?: string): string | null {
  if (typeof window === "undefined" && search === undefined) {
    return null;
  }
  const params = new URLSearchParams(search ?? window.location.search);
  const bookId = params.get(ACTIVITY_BOOK_QUERY_KEY)?.trim();
  return bookId || null;
}

export function buildAppHref(view: AppView, bookId?: string): string {
  if (typeof window === "undefined") {
    return view === "activity" ? "#/activity" : "";
  }

  const params = new URLSearchParams(window.location.search);
  if (view === "activity") {
    if (bookId) {
      params.set(ACTIVITY_BOOK_QUERY_KEY, bookId);
    }
    const qs = params.toString();
    return `${window.location.pathname}${qs ? `?${qs}` : ""}#/activity`;
  }

  params.delete(ACTIVITY_BOOK_QUERY_KEY);
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

export function buildActivityShareHref(bookId: string): string {
  return buildAppHref("activity", bookId);
}
