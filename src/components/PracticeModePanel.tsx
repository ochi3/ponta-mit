import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatClock,
  loadYouTubeIframeApi,
  parseYouTubeUrl,
  type YouTubePlayer,
} from "../logic/youtube";
import type {
  ThemeMode,
  TimelinePracticeConfig,
  VideoSyncPoint,
} from "../types";

type PracticeViewMode = "timeline" | "icons";

type Props = {
  theme: ThemeMode;
  practice: TimelinePracticeConfig;
  currentTimelineSec: number | null;
  viewMode: PracticeViewMode;
  onClose: () => void;
  onViewModeChange: (mode: PracticeViewMode) => void;
  onTimelineTimeChange: (timelineSec: number | null) => void;
  onVideoTimeChange: (videoSec: number | null) => void;
};

type PlayerUiState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

const PLAYER_STATE_LABELS: Record<PlayerUiState, string> = {
  idle: "未設定",
  loading: "読み込み中",
  ready: "準備完了",
  playing: "再生中",
  paused: "一時停止",
  error: "エラー",
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

function buildEffectiveSyncPoints(
  syncPoints: readonly VideoSyncPoint[],
  fallbackVideoStartSec: number
) {
  const normalized = normalizeSyncPoints(syncPoints);
  if (normalized.length > 0) {
    return normalized;
  }
  return [{ t_sec: 0, video_sec: fallbackVideoStartSec }];
}

function findActiveSyncPointIndex(
  syncPoints: readonly VideoSyncPoint[],
  videoSec: number
) {
  let index = 0;
  for (let i = 0; i < syncPoints.length; i++) {
    if (syncPoints[i].video_sec <= videoSec + 0.2) {
      index = i;
    }
  }
  return index;
}

export default function PracticeModePanel({
  theme,
  practice,
  currentTimelineSec,
  viewMode,
  onClose,
  onViewModeChange,
  onTimelineTimeChange,
  onVideoTimeChange,
}: Props) {
  const isLight = theme === "light";
  const parsedVideo = useMemo(
    () => parseYouTubeUrl(practice.youtubeUrl),
    [practice.youtubeUrl]
  );
  const effectiveSyncPoints = useMemo(
    () => buildEffectiveSyncPoints(practice.syncPoints, parsedVideo?.startSeconds ?? 0),
    [parsedVideo?.startSeconds, practice.syncPoints]
  );
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const playerPollerRef = useRef<number | null>(null);
  const syncPointsRef = useRef<VideoSyncPoint[]>(effectiveSyncPoints);
  const onTimelineTimeChangeRef = useRef(onTimelineTimeChange);
  const onVideoTimeChangeRef = useRef(onVideoTimeChange);
  const [playerState, setPlayerState] = useState<PlayerUiState>("idle");
  const [currentVideoSec, setCurrentVideoSec] = useState<number | null>(null);

  syncPointsRef.current = effectiveSyncPoints;
  onTimelineTimeChangeRef.current = onTimelineTimeChange;
  onVideoTimeChangeRef.current = onVideoTimeChange;

  const timelineClock =
    currentTimelineSec === null ? "--:--" : formatClock(currentTimelineSec);
  const videoClock = currentVideoSec === null ? "--:--" : formatClock(currentVideoSec);

  function emitTimelineTime(value: number | null) {
    onTimelineTimeChangeRef.current(value);
  }

  function emitVideoTime(value: number | null) {
    onVideoTimeChangeRef.current(value);
  }

  function stopPlayerPoller() {
    if (playerPollerRef.current !== null) {
      window.clearInterval(playerPollerRef.current);
      playerPollerRef.current = null;
    }
  }

  function syncFromPlayer() {
    const player = playerRef.current;
    if (!player) {
      setCurrentVideoSec(null);
      emitVideoTime(null);
      emitTimelineTime(null);
      return;
    }

    const syncPoints = syncPointsRef.current;
    const videoSec = player.getCurrentTime();
    if (!Number.isFinite(videoSec)) {
      return;
    }

    if (syncPoints.length === 0) {
      setCurrentVideoSec(videoSec);
      emitVideoTime(videoSec);
      emitTimelineTime(Math.max(0, Math.floor(videoSec)));
      return;
    }

    const activeIndex = findActiveSyncPointIndex(syncPoints, videoSec);
    const activePoint = syncPoints[activeIndex];
    const nextPoint = syncPoints[activeIndex + 1];
    const timelineSec = activePoint.t_sec + (videoSec - activePoint.video_sec);

    if (
      nextPoint &&
      timelineSec >= nextPoint.t_sec - 0.15 &&
      Math.abs(videoSec - nextPoint.video_sec) > 0.35
    ) {
      player.seekTo(nextPoint.video_sec, true);
      setCurrentVideoSec(nextPoint.video_sec);
      emitVideoTime(nextPoint.video_sec);
      emitTimelineTime(nextPoint.t_sec);
      return;
    }

    setCurrentVideoSec(videoSec);
    emitVideoTime(videoSec);
    emitTimelineTime(Math.max(0, Math.floor(timelineSec)));
  }

  useEffect(() => {
    if (!parsedVideo) {
      playerRef.current?.destroy();
      playerRef.current = null;
      stopPlayerPoller();
      setCurrentVideoSec(null);
      emitVideoTime(null);
      emitTimelineTime(null);
      setPlayerState(practice.youtubeUrl.trim() ? "error" : "idle");
      if (playerHostRef.current) {
        playerHostRef.current.replaceChildren();
      }
      return;
    }

    const hostElement = playerHostRef.current;
    if (!hostElement) {
      return;
    }

    let cancelled = false;
    setPlayerState("loading");

    void loadYouTubeIframeApi()
      .then((yt) => {
        if (cancelled || !playerHostRef.current) {
          return;
        }

        playerRef.current?.destroy();
        playerRef.current = null;
        playerHostRef.current.replaceChildren();

        const player = new yt.Player(playerHostRef.current, {
          videoId: parsedVideo.videoId,
          playerVars: {
            autoplay: 0,
            controls: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (cancelled) {
                return;
              }

              playerRef.current = player;
              const firstSyncPoint = syncPointsRef.current[0];
              player.seekTo(firstSyncPoint?.video_sec ?? parsedVideo.startSeconds, true);
              setPlayerState("ready");
              syncFromPlayer();
              stopPlayerPoller();
              playerPollerRef.current = window.setInterval(syncFromPlayer, 250);
            },
            onStateChange: (event) => {
              if (cancelled) {
                return;
              }

              if (event.data === yt.PlayerState.PLAYING) {
                setPlayerState("playing");
              } else if (
                event.data === yt.PlayerState.PAUSED ||
                event.data === yt.PlayerState.CUED
              ) {
                setPlayerState("paused");
              }

              syncFromPlayer();
            },
          },
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setPlayerState("error");
        setCurrentVideoSec(null);
        emitVideoTime(null);
        emitTimelineTime(null);
      });

    return () => {
      cancelled = true;
      stopPlayerPoller();
      playerRef.current?.destroy();
      playerRef.current = null;
      if (hostElement) {
        hostElement.replaceChildren();
      }
    };
  }, [parsedVideo?.startSeconds, parsedVideo?.videoId, practice.youtubeUrl]);

  useEffect(() => {
    syncFromPlayer();
  }, [effectiveSyncPoints]);

  const panelClass = isLight
    ? "rounded-2xl border border-slate-200 bg-white/90 shadow-sm"
    : "rounded-2xl border border-slate-800 bg-slate-950/90 shadow-[0_20px_50px_rgba(2,6,23,0.35)]";
  const subtleTextClass = isLight ? "text-slate-500" : "text-slate-400";
  const actionButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900";
  const viewButtonClass = isLight
    ? "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors"
    : "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors";
  const inactiveViewButtonClass = isLight
    ? `${viewButtonClass} border-slate-300 bg-white text-slate-700 hover:border-sky-400 hover:bg-sky-50`
    : `${viewButtonClass} border-slate-700 bg-slate-950 text-slate-300 hover:border-sky-500 hover:bg-slate-900`;
  const activeViewButtonClass = isLight
    ? `${viewButtonClass} border-sky-500 bg-sky-100 text-sky-900`
    : `${viewButtonClass} border-sky-500 bg-sky-500/15 text-sky-100`;

  return (
    <section className={`${panelClass} p-4 xl:sticky xl:top-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
            動画モード
          </div>
          <p className={`mt-1 text-xs ${subtleTextClass}`}>
            動画とタイムラインを同期しながら、選んだジョブの動きを確認できます。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onViewModeChange("timeline")}
            className={viewMode === "timeline" ? activeViewButtonClass : inactiveViewButtonClass}
          >
            タイムライン
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("icons")}
            className={viewMode === "icons" ? activeViewButtonClass : inactiveViewButtonClass}
          >
            アイコン
          </button>
          <button type="button" onClick={onClose} className={actionButtonClass}>
            閉じる
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3">
          <div className="flex items-end gap-3">
            <div className="text-xs text-slate-400">
              現在位置
            </div>
            <div className={`text-3xl font-semibold leading-none ${isLight ? "text-slate-900" : "text-slate-100"}`}>
              {timelineClock}
            </div>
          </div>
          <div className={`text-xs ${subtleTextClass}`}>
            動画 {videoClock} ・ {PLAYER_STATE_LABELS[playerState]}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black">
          <div className="aspect-video min-h-[220px] w-full bg-black">
            {parsedVideo ? (
              <div ref={playerHostRef} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div>
                  <div className={`text-base font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                    先に YouTube 動画を設定してください
                  </div>
                  <p className={`mt-2 text-sm ${subtleTextClass}`}>
                    上部の `YT` ボタンから動画URLと同期ポイントを保存すると、ここに表示されます。
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
