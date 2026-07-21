import { useEffect, useMemo, useState } from "react";
import {
  ACTIVITY_RECORD_OPTIONS,
  getBuiltinActivityRecordBook,
  resolveActivityRecordId,
} from "../data/activity-records/registry";
import {
  ACTIVITY_BOOK_QUERY_KEY,
  buildActivityShareHref,
  getActivityBookIdFromSearch,
} from "../logic/appRoute";
import {
  buildActivityNavSummaries,
  computeActivityRecordStats,
} from "../logic/activityRecordStats";
import ActivityLogLinks from "../components/ActivityLogLinks";
import SiteBrandingNav from "../components/SiteBrandingNav";

export default function ActivityRecordPage() {
  const [bookId, setBookId] = useState(() =>
    resolveActivityRecordId(getActivityBookIdFromSearch())
  );
  const [copied, setCopied] = useState(false);

  const book = useMemo(
    () => getBuiltinActivityRecordBook(bookId),
    [bookId]
  );
  const stats = useMemo(
    () => computeActivityRecordStats(book?.entries ?? []),
    [book?.entries]
  );
  const activitySummaries = useMemo(() => buildActivityNavSummaries(), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set(ACTIVITY_BOOK_QUERY_KEY, bookId);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${qs}#/activity`
    );
  }, [bookId]);

  const handleShare = async () => {
    const url = buildActivityShareHref(bookId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (!book) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-300">
        活動記録「{bookId}」が見つかりません。JSON を追加するか、別の記録を選んでください。
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <SiteBrandingNav current="activity" activitySummaries={activitySummaries} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="rounded-md border border-sky-700 bg-sky-900/40 px-3 py-1.5 text-sm hover:bg-sky-900/70"
            >
              {copied ? "リンクをコピーしました" : "ページリンクをコピー"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4">
        <section className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-[1.2fr_1fr_1fr]">
          <label className="grid gap-1 text-sm">
            <span className="text-slate-400">記録ブック</span>
            <select
              value={bookId}
              onChange={(event) => setBookId(resolveActivityRecordId(event.target.value))}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            >
              {ACTIVITY_RECORD_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-md border border-slate-800 bg-slate-950/70 px-4 py-3">
            <div className="text-xs text-slate-400">活動日数</div>
            <div className="mt-1 text-2xl font-semibold text-sky-300">{stats.dayCount}日</div>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/70 px-4 py-3">
            <div className="text-xs text-slate-400">活動時間の合計</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-300">{stats.label}</div>
          </div>
        </section>

        {book.description ? (
          <p className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
            {book.description}
          </p>
        ) : null}

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">記録一覧</h2>
          <div className="overflow-auto rounded-md border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">日付</th>
                  <th className="px-3 py-2 text-left">時間</th>
                  <th className="px-3 py-2 text-left">進捗</th>
                  <th className="px-3 py-2 text-left">LOGS</th>
                </tr>
              </thead>
              <tbody>
                {book.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                      まだ記録がありません（メンテ GUI から追記してください）
                    </td>
                  </tr>
                ) : (
                  book.entries.map((entry) => (
                    <tr key={entry.date} className="border-t border-slate-800 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{entry.date}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {computeActivityRecordStats([entry]).label}
                      </td>
                      <td className="px-3 py-2 whitespace-pre-wrap">{entry.progress || "—"}</td>
                      <td className="px-3 py-2">
                        <ActivityLogLinks fflogsUrl={entry.fflogs_url} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
