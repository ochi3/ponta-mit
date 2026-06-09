import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  formatClock,
  loadYouTubeIframeApi,
  parseYouTubeUrl,
  type YouTubePlayer,
} from "../logic/youtube";
import { JOBS } from "../data/jobs/jobs.registry";
import {
  buildEffectiveSyncPoints,
  findActiveSyncPointIndexForVideo,
  getJobPracticeVideoUrl,
  getSyncPointsForTarget,
  resolvePracticeSyncTarget,
  resolvePracticeYoutubeUrl,
  resolvePracticeVideoSource,
  timelineSecToVideoSec,
} from "../logic/practiceVideo";
import type {
  ThemeMode,
  TimelinePracticeConfig,
  VideoSyncPoint,
  JobId,
  PracticeVideoSource,
} from "../types";
import { useStore } from "../state/store";
import {
  getPracticeSkillSnapshot,
  getPracticeSkillsForJob,
} from "../logic/practiceIconMode";
import { getSkillIcon } from "../data/skills/icon.skills";

export type PracticeViewMode = "timeline" | "icons";

type Props = {
  theme: ThemeMode;
  practice: TimelinePracticeConfig;
  currentTimelineSec: number | null;
  primaryJobId: JobId | null;
  viewMode: PracticeViewMode;
  seekTimelineRequest?: { sec: number; requestKey: number } | null;
  onClose: () => void;
  onViewModeChange: (mode: PracticeViewMode) => void;
  autoScrollEnabled: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  onTimelineTimeChange: (timelineSec: number | null) => void;
  onVideoTimeChange: (videoSec: number | null) => void;
  onVideoSourceChange: (source: PracticeVideoSource) => void;
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

export default function PracticeModePanel({
  theme,
  practice,
  currentTimelineSec,
  primaryJobId,
  viewMode,
  seekTimelineRequest,
  onClose,
  onViewModeChange,
  autoScrollEnabled,
  onAutoScrollChange,
  onTimelineTimeChange,
  onVideoTimeChange,
  onVideoSourceChange,
}: Props) {
  const isLight = theme === "light";
  const usages = useStore((state) => state.usages);
  const expandedJobs = useStore((state) => state.expandedJobs);
  const evolveJobs = useStore((state) => state.evolveJobs);
  
  const skillSnapshots = useMemo(() => {
    if (!primaryJobId || currentTimelineSec === null) return [];
    const skillMode = evolveJobs.includes(primaryJobId) ? "evolve" : "normal";
    return getPracticeSkillsForJob(primaryJobId, usages, expandedJobs, { skillMode }).map((skill) =>
      getPracticeSkillSnapshot(primaryJobId, skill, usages, currentTimelineSec)
    );
  }, [primaryJobId, currentTimelineSec, usages, expandedJobs, evolveJobs]);
  const videoSource = useMemo(
    () => resolvePracticeVideoSource(practice, primaryJobId),
    [practice, primaryJobId]
  );
  const activeYoutubeUrl = useMemo(
    () => resolvePracticeYoutubeUrl(practice, primaryJobId, videoSource),
    [practice, primaryJobId, videoSource]
  );
  const parsedVideo = useMemo(
    () => parseYouTubeUrl(activeYoutubeUrl),
    [activeYoutubeUrl]
  );
  const jobVideoUrl = getJobPracticeVideoUrl(practice, primaryJobId);
  const hasBaseVideo = Boolean(practice.youtubeUrl.trim());
  const hasJobVideo = Boolean(jobVideoUrl);
  const primaryJobName =
    JOBS.find((job) => job.id === primaryJobId)?.name ?? primaryJobId ?? "";
  const syncTarget = useMemo(
    () => resolvePracticeSyncTarget(practice, primaryJobId),
    [practice, primaryJobId]
  );
  const effectiveSyncPoints = useMemo(
    () =>
      buildEffectiveSyncPoints(
        getSyncPointsForTarget(practice, syncTarget),
        parsedVideo?.startSeconds ?? 0
      ),
    [parsedVideo?.startSeconds, practice, syncTarget]
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

  const emitTimelineTime = useCallback((value: number | null) => {
    onTimelineTimeChangeRef.current(value);
  }, []);

  const emitVideoTime = useCallback((value: number | null) => {
    onVideoTimeChangeRef.current(value);
  }, []);

  function stopPlayerPoller() {
    if (playerPollerRef.current !== null) {
      window.clearInterval(playerPollerRef.current);
      playerPollerRef.current = null;
    }
  }

  const syncFromPlayer = useCallback(() => {
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
      emitTimelineTime(Math.floor(videoSec));
      return;
    }

    const activeIndex = findActiveSyncPointIndexForVideo(syncPoints, videoSec);
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
    emitTimelineTime(Math.floor(timelineSec));
  }, [emitTimelineTime, emitVideoTime]);

  const seekToTimelineSec = useCallback(
    (timelineSec: number) => {
      const player = playerRef.current;
      if (!player) {
        emitTimelineTime(timelineSec);
        return;
      }

      const videoSec = timelineSecToVideoSec(
        timelineSec,
        syncPointsRef.current,
        parsedVideo?.startSeconds ?? 0
      );
      player.seekTo(videoSec, true);
      setCurrentVideoSec(videoSec);
      emitVideoTime(videoSec);
      emitTimelineTime(timelineSec);
    },
    [emitTimelineTime, emitVideoTime, parsedVideo?.startSeconds]
  );

  useEffect(() => {
    if (!seekTimelineRequest) {
      return;
    }
    seekToTimelineSec(seekTimelineRequest.sec);
  }, [seekTimelineRequest, seekToTimelineSec]);

  useEffect(() => {
    if (!parsedVideo) {
      playerRef.current?.destroy();
      playerRef.current = null;
      stopPlayerPoller();
      setCurrentVideoSec(null);
      emitVideoTime(null);
      emitTimelineTime(null);
      setPlayerState(activeYoutubeUrl.trim() ? "error" : "idle");
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
  }, [activeYoutubeUrl, parsedVideo, syncFromPlayer, emitVideoTime, emitTimelineTime]);

  useEffect(() => {
    syncFromPlayer();
  }, [effectiveSyncPoints, syncFromPlayer]);

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

  const disabledViewButtonClass = `${inactiveViewButtonClass} disabled:cursor-not-allowed disabled:opacity-40`;

  return (
    <section className={`${panelClass} mp-practice-video-panel p-4 xl:sticky xl:top-4`}>
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
          <div className="mp-practice-view-toggle flex flex-wrap items-center justify-end gap-2">
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
            {viewMode === "timeline" && (
              <>
                <span
                  className={`mx-0.5 hidden h-5 w-px sm:inline-block ${
                    isLight ? "bg-slate-300" : "bg-slate-600"
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => onAutoScrollChange(!autoScrollEnabled)}
                  className={autoScrollEnabled ? activeViewButtonClass : inactiveViewButtonClass}
                  title={
                    autoScrollEnabled
                      ? "再生位置に合わせてタイムラインを自動スクロールします"
                      : "自動スクロールをオフにしています"
                  }
                  aria-pressed={autoScrollEnabled}
                >
                  自動スクロール
                </button>
              </>
            )}
            {primaryJobId && (hasBaseVideo || hasJobVideo) && (
              <>
                <span
                  className={`mx-0.5 hidden h-5 w-px sm:inline-block ${
                    isLight ? "bg-slate-300" : "bg-slate-600"
                  }`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  disabled={!hasBaseVideo}
                  onClick={() => onVideoSourceChange("base")}
                  className={
                    videoSource === "base"
                      ? activeViewButtonClass
                      : disabledViewButtonClass
                  }
                  title={hasBaseVideo ? "基本の動画を再生" : "基本の動画が未設定です"}
                >
                  基本の動画
                </button>
                <button
                  type="button"
                  disabled={!hasJobVideo}
                  onClick={() => onVideoSourceChange("job")}
                  className={
                    videoSource === "job"
                      ? activeViewButtonClass
                      : disabledViewButtonClass
                  }
                  title={
                    hasJobVideo
                      ? `${primaryJobName}用の動画を再生`
                      : `${primaryJobName}用の動画が未設定です（YouTube設定から登録）`
                  }
                >
                  {primaryJobName ? `${primaryJobName}の動画` : "ジョブの動画"}
                </button>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} className={actionButtonClass}>
            閉じる
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="mp-practice-video-status flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-800/70 bg-slate-900/50 px-4 py-3">
          <div className="flex items-end gap-3">
            <div className="text-xs text-slate-400">
              現在位置
            </div>
            <div className={`text-3xl font-semibold leading-none ${isLight ? "text-slate-900" : "text-slate-100"}`}>
              {timelineClock}
            </div>
          </div>
          
          {skillSnapshots.length > 0 && (
            <div className="mp-practice-mini-icons flex items-center gap-2">
              {skillSnapshots.map((snapshot) => {
                const { skill, status, remainingSec } = snapshot;
                const skillIcon = getSkillIcon(skill.id) ?? skill.icon;
                const timerLabel = remainingSec === null ? null : String(remainingSec);
                const bgClass = status === "cooldown"
                  ? "opacity-50"
                  : status === "active"
                    ? "ring-2 ring-sky-500"
                    : "";
                return (
                  <div
                    key={`${primaryJobId}-${skill.id}`}
                    className="relative"
                    title={skill.name}
                  >
                    <img
                      src={skillIcon}
                      alt={skill.name}
                      className={`size-8 rounded transition-all ${bgClass}`}
                      loading="lazy"
                    />
                    {timerLabel && (
                      <div 
                        className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white pointer-events-none" 
                        style={{ 
                          textShadow: `
                            -1px -1px 0 rgba(0,0,0,0.8),
                            1px -1px 0 rgba(0,0,0,0.8),
                            -1px 1px 0 rgba(0,0,0,0.8),
                            1px 1px 0 rgba(0,0,0,0.8),
                            0 -1px 0 rgba(0,0,0,0.8),
                            0 1px 0 rgba(0,0,0,0.8),
                            -1px 0 0 rgba(0,0,0,0.8),
                            1px 0 0 rgba(0,0,0,0.8),
                            0 0 4px rgba(0,0,0,0.95)
                          `
                        }}
                      >
                        {timerLabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          <div className={`text-xs ${subtleTextClass} min-w-[7rem]`}>
            動画 {videoClock} ・ {PLAYER_STATE_LABELS[playerState]}
          </div>
        </div>

        <div className="mp-practice-video-frame overflow-hidden rounded-2xl border border-slate-800 bg-black">
          <div className="aspect-video relative min-h-[220px] w-full bg-black">
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
