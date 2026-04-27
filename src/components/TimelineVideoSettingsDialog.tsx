import { useEffect, useMemo, useState } from "react";
import { formatClock, parseYouTubeUrl } from "../logic/youtube";
import type { ThemeMode, TimelinePracticeConfig, VideoSyncPoint } from "../types";

type Props = {
  theme: ThemeMode;
  practice: TimelinePracticeConfig;
  onClose: () => void;
  onSave: (practice: TimelinePracticeConfig) => void;
};

function clampSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeSyncPoints(syncPoints: readonly VideoSyncPoint[]) {
  const byTimelineSecond = new Map<number, VideoSyncPoint>();

  for (const point of syncPoints) {
    if (!Number.isFinite(point.t_sec) || !Number.isFinite(point.video_sec)) {
      continue;
    }

    const t_sec = clampSeconds(point.t_sec);
    const video_sec = clampSeconds(point.video_sec);
    byTimelineSecond.set(t_sec, { t_sec, video_sec });
  }

  return Array.from(byTimelineSecond.values()).sort(
    (a, b) => a.t_sec - b.t_sec || a.video_sec - b.video_sec
  );
}

function splitPracticeConfig(practice: TimelinePracticeConfig) {
  const normalized = normalizeSyncPoints(practice.syncPoints);
  const basePoint = normalized.find((point) => point.t_sec === 0);
  const parsedVideo = parseYouTubeUrl(practice.youtubeUrl);

  return {
    baseVideoSec: basePoint?.video_sec ?? parsedVideo?.startSeconds ?? 0,
    syncPoints: normalized.filter((point) => point.t_sec > 0),
  };
}

function buildPracticeConfig(
  youtubeUrl: string,
  baseVideoSec: number,
  syncPoints: readonly VideoSyncPoint[]
): TimelinePracticeConfig {
  const trimmedUrl = youtubeUrl.trim();
  const normalizedSyncPoints = normalizeSyncPoints(syncPoints);

  if (!trimmedUrl && baseVideoSec <= 0 && normalizedSyncPoints.length === 0) {
    return {
      youtubeUrl: "",
      syncPoints: [],
    };
  }

  return {
    youtubeUrl: trimmedUrl,
    syncPoints: normalizeSyncPoints([
      { t_sec: 0, video_sec: clampSeconds(baseVideoSec) },
      ...normalizedSyncPoints,
    ]),
  };
}

export default function TimelineVideoSettingsDialog({
  theme,
  practice,
  onClose,
  onSave,
}: Props) {
  const isLight = theme === "light";
  const initialState = useMemo(() => splitPracticeConfig(practice), [practice]);
  const [youtubeUrl, setYoutubeUrl] = useState(practice.youtubeUrl);
  const [baseVideoSec, setBaseVideoSec] = useState(initialState.baseVideoSec);
  const [syncPoints, setSyncPoints] = useState<VideoSyncPoint[]>(initialState.syncPoints);

  useEffect(() => {
    setYoutubeUrl(practice.youtubeUrl);
    setBaseVideoSec(initialState.baseVideoSec);
    setSyncPoints(initialState.syncPoints);
  }, [initialState.baseVideoSec, initialState.syncPoints, practice.youtubeUrl]);

  const parsedVideo = useMemo(() => parseYouTubeUrl(youtubeUrl), [youtubeUrl]);
  const overlayClass = isLight
    ? "bg-slate-900/35 backdrop-blur-sm"
    : "bg-black/60 backdrop-blur-sm";
  const panelClass = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-slate-800 bg-slate-950 text-slate-100";
  const inputClass = isLight
    ? "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
    : "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
  const subtleClass = isLight ? "text-slate-500" : "text-slate-400";
  const sectionClass = isLight
    ? "rounded-xl border border-slate-200 bg-slate-50"
    : "rounded-xl border border-slate-800 bg-slate-900/60";
  const secondaryButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900";
  const primaryButtonClass = isLight
    ? "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
    : "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400";

  function handleSave() {
    onSave(buildPracticeConfig(youtubeUrl, baseVideoSec, syncPoints));
  }

  return (
    <div className={`fixed inset-0 z-[130] flex items-center justify-center px-4 ${overlayClass}`}>
      <div className={`w-full max-w-3xl rounded-2xl p-5 shadow-2xl ${panelClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">YouTube設定</h2>
            <p className={`mt-1 text-sm ${subtleClass}`}>
              動画URLと基準秒数、必要な同期ポイントだけを登録します。
            </p>
          </div>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            閉じる
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <section className={`${sectionClass} p-4`}>
            <label className="block text-sm font-medium">動画URL</label>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className={`${inputClass} mt-2`}
            />
            <div className={`mt-2 text-xs ${subtleClass}`}>
              {parsedVideo
                ? `URL開始位置: ${formatClock(parsedVideo.startSeconds)}`
                : youtubeUrl.trim()
                  ? "YouTube URLを読み取れませんでした"
                  : "URL未設定でも保存できます"}
            </div>
          </section>

          <section className={`${sectionClass} p-4`}>
            <label className="block text-sm font-medium">
              <span className="block">開始秒数</span>
              <span className={`mt-1 block text-xs font-normal ${subtleClass}`}>
                タイムライン 0:00 に合わせる動画秒数
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={baseVideoSec}
                onChange={(event) => setBaseVideoSec(clampSeconds(Number(event.target.value)))}
                className={`${inputClass} mt-2 max-w-[220px]`}
              />
            </label>

            <div className={`mt-4 rounded-xl border border-dashed px-4 py-4 text-sm ${subtleClass}`}>
              同期ポイントはタイムライン左端の時間をクリックして設定します。
              {syncPoints.length > 0 && (
                <span className="ml-2 inline-block font-medium">
                  現在 {syncPoints.length} 点登録済み
                </span>
              )}
            </div>
          </section>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            キャンセル
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
