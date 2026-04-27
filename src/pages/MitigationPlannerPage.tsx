import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  JobId,
  Timeline,
  TimelinePracticeConfig,
  VideoSyncPoint,
} from "../types";
import { BUILTIN_TIMELINES } from "../data/timelines/registry";
import { decodeShareUrl } from "../logic/share";
import { fetchSharedPlanSnapshot, saveSharedPlanSnapshot } from "../logic/sharedPlans";
import { secondsInPhase } from "../logic/timelineView";
import { useStore } from "../state/store";
import {
  supabase,
  getRoomId,
  getRealtimeChannelName,
  REALTIME_EVENTS,
} from "../logic/realtime";

import TopBar from "../components/TopBar";
import TimelineGrid from "../components/TimelineGrid";
import ValidationPanel from "../components/ValidationPanel";
import PracticeModePanel from "../components/PracticeModePanel";
import PracticeIconModePanel from "../components/PracticeIconModePanel";
import PracticeJobSelectDialog from "../components/PracticeJobSelectDialog";
import TimelineVideoSettingsDialog from "../components/TimelineVideoSettingsDialog";
import TimelineSyncPointDialog from "../components/TimelineSyncPointDialog";

const EMPTY_PRACTICE_CONFIG: TimelinePracticeConfig = {
  youtubeUrl: "",
  syncPoints: [],
};

type PracticeViewMode = "timeline" | "icons";
type PracticeJobDialogMode = "primary" | "extra" | null;

function hasPracticeConfig(practice?: Partial<TimelinePracticeConfig> | null) {
  return Boolean(practice?.youtubeUrl?.trim() || practice?.syncPoints?.length);
}

function resolvePracticeConfig(
  roomPractice?: Partial<TimelinePracticeConfig> | null,
  contentPractice?: Partial<TimelinePracticeConfig> | null,
  timelinePractice?: Partial<TimelinePracticeConfig> | null
) {
  if (hasPracticeConfig(roomPractice)) {
    return {
      youtubeUrl: roomPractice?.youtubeUrl?.trim() ?? "",
      syncPoints: roomPractice?.syncPoints ?? [],
    } satisfies TimelinePracticeConfig;
  }

  if (hasPracticeConfig(contentPractice)) {
    return {
      youtubeUrl: contentPractice?.youtubeUrl?.trim() ?? "",
      syncPoints: contentPractice?.syncPoints ?? [],
    } satisfies TimelinePracticeConfig;
  }

  if (hasPracticeConfig(timelinePractice)) {
    return {
      youtubeUrl: timelinePractice?.youtubeUrl?.trim() ?? "",
      syncPoints: timelinePractice?.syncPoints ?? [],
    } satisfies TimelinePracticeConfig;
  }

  return EMPTY_PRACTICE_CONFIG;
}

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

export default function MitigationPlannerPage({ tl }: { tl: Timeline }) {
  const [seconds, setSeconds] = useState<number[]>(
    () => secondsInPhase(tl, undefined)
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceJobDialogMode, setPracticeJobDialogMode] =
    useState<PracticeJobDialogMode>(null);
  const [isVideoSettingsOpen, setIsVideoSettingsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [practiceTimelineSec, setPracticeTimelineSec] = useState<number | null>(null);
  const [practiceVideoSec, setPracticeVideoSec] = useState<number | null>(null);
  const [practiceVideoPaneWidth, setPracticeVideoPaneWidth] = useState<number | null>(null);
  const [practiceViewMode, setPracticeViewMode] = useState<PracticeViewMode>("timeline");
  const [practiceExtraJobIds, setPracticeExtraJobIds] = useState<JobId[]>([]);
  const [editingSyncSecond, setEditingSyncSecond] = useState<number | null>(null);
  const team = useStore((s) => s.team);
  const usages = useStore((s) => s.usages);
  const expandedJobs = useStore((s) => s.expandedJobs);
  const importedTimeline = useStore((s) => s.importedTimeline);
  const roomPractice = useStore((s) => s.plansByTimeline[tl.id]?.practice);
  const contentPractice = useStore((s) => s.practiceDefaultsByTimeline[tl.id]);
  const practiceSelectedJobId = useStore(
    (s) => s.plansByTimeline[tl.id]?.practiceSelectedJobId ?? null
  );
  const needsRemoteSave = useStore(
    (s) => s.plansByTimeline[tl.id]?.needsRemoteSave ?? false
  );
  const setTimeline = useStore((s) => s.setTimeline);
  const setImportedTimeline = useStore((s) => s.setImportedTimeline);
  const setPracticeConfig = useStore((s) => s.setPracticeConfig);
  const setPracticeSelectedJob = useStore((s) => s.setPracticeSelectedJob);
  const resetTimelineState = useStore((s) => s.resetTimelineState);
  const applySharePayload = useStore((s) => s.applySharePayload);
  const applyPersistedSharedState = useStore((s) => s.applyPersistedSharedState);
  const applyExternalUsage = useStore((s) => s.applyExternalUsage);
  const markTimelineSaved = useStore((s) => s.markTimelineSaved);
  const shareFromUrlApplied = useRef(false);
  const practiceLayoutRef = useRef<HTMLDivElement | null>(null);
  const practiceTimelinePaneRef = useRef<HTMLDivElement | null>(null);
  const prevRoomIdRef = useRef<string>(getRoomId());
  const practiceConfig = useMemo(
    () => resolvePracticeConfig(roomPractice, contentPractice, tl.practice),
    [contentPractice, roomPractice, tl.practice]
  );
  const practiceSeconds = useMemo(() => secondsInPhase(tl, undefined), [tl]);
  const syncSeconds = useMemo(
    () => practiceConfig.syncPoints.map((point) => point.t_sec),
    [practiceConfig.syncPoints]
  );
  const editingSyncPoint = useMemo(
    () =>
      editingSyncSecond === null
        ? null
        : practiceConfig.syncPoints.find((point) => point.t_sec === editingSyncSecond) ?? null,
    [editingSyncSecond, practiceConfig.syncPoints]
  );

  const currentRoomId = useMemo(() => getRoomId(), [typeof window !== "undefined" ? window.location.search : ""]);

  useEffect(() => {
    setSeconds(secondsInPhase(tl, undefined));
  }, [tl]);

  useEffect(() => {
    const body = document.body;

    body.classList.toggle("theme-dark", theme === "dark");
    body.classList.toggle("theme-light", theme === "light");

    return () => {
      body.classList.remove("theme-dark", "theme-light");
    };
  }, [theme]);

  useEffect(() => {
    if (tl.id) {
      setTimeline(tl.id);
    } else {
      setTimeline("");
    }
  }, [setTimeline, tl.id]);

  useEffect(() => {
    if (prevRoomIdRef.current !== currentRoomId) {
      resetTimelineState(tl.id);
    }
    prevRoomIdRef.current = currentRoomId;

    setIsLoaded(false);
    setPracticeTimelineSec(null);
    setPracticeVideoSec(null);
    setPracticeVideoPaneWidth(null);
    setEditingSyncSecond(null);
    setPracticeJobDialogMode(null);
    setPracticeExtraJobIds([]);
    setIsVideoSettingsOpen(false);
  }, [tl.id, currentRoomId, resetTimelineState]);

  useEffect(() => {
    if (!isPracticeMode) {
      setPracticeVideoPaneWidth(null);
      return;
    }

    const layout = practiceLayoutRef.current;
    const timelinePane = practiceTimelinePaneRef.current;
    if (!layout || !timelinePane) {
      return;
    }

    const MIN_VIDEO_WIDTH = 320;
    const TIMELINE_BREATH_WIDTH = 32;
    const GAP_WIDTH = 16;

    const computePaneWidth = () => {
      const containerWidth = layout.clientWidth;
      if (containerWidth <= 0 || window.innerWidth < 1280) {
        setPracticeVideoPaneWidth(null);
        return;
      }

      const preferredContent = timelinePane.querySelector<HTMLElement>(".mp-practice-aside-content");
      const timelineWrapper = timelinePane.querySelector<HTMLElement>(".mp-wrapper");
      const timelineTable = timelinePane.querySelector<HTMLElement>(".mp-table");
      const minAsideWidth = practiceViewMode === "icons" ? 280 : 320;
      const preferredAsideWidth =
        practiceViewMode === "icons"
          ? preferredContent?.scrollWidth ?? minAsideWidth
          : timelineTable?.scrollWidth ?? timelineWrapper?.scrollWidth ?? minAsideWidth;
      const preferredTimelineWidth = Math.max(
        minAsideWidth,
        preferredAsideWidth + TIMELINE_BREATH_WIDTH
      );
      const desiredVideoWidth = containerWidth - GAP_WIDTH - preferredTimelineWidth;
      const nextWidth = Math.max(MIN_VIDEO_WIDTH, desiredVideoWidth);
      setPracticeVideoPaneWidth(Math.round(nextWidth));
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(computePaneWidth);
    });

    observer.observe(layout);
    observer.observe(timelinePane);

    const preferredContent = timelinePane.querySelector<HTMLElement>(".mp-practice-aside-content");
    const timelineWrapper = timelinePane.querySelector<HTMLElement>(".mp-wrapper");
    const timelineTable = timelinePane.querySelector<HTMLElement>(".mp-table");
    if (preferredContent) {
      observer.observe(preferredContent);
    }
    if (timelineWrapper) {
      observer.observe(timelineWrapper);
    }
    if (timelineTable) {
      observer.observe(timelineTable);
    }

    computePaneWidth();

    return () => {
      observer.disconnect();
    };
  }, [
    expandedJobs,
    isPracticeMode,
    practiceExtraJobIds,
    practiceViewMode,
    practiceSelectedJobId,
    team,
    tl.id,
  ]);

  useEffect(() => {
    if (team.length === 0) {
      return;
    }
    if (practiceSelectedJobId && team.includes(practiceSelectedJobId)) {
      return;
    }
    setPracticeSelectedJob(team[0] ?? null);
  }, [practiceSelectedJobId, setPracticeSelectedJob, team]);

  useEffect(() => {
    setPracticeExtraJobIds((prev) =>
      prev.filter(
        (jobId) => team.includes(jobId) && jobId !== practiceSelectedJobId
      )
    );
  }, [practiceSelectedJobId, team]);

  useEffect(() => {
    function applyFromUrl() {
      if (shareFromUrlApplied.current) return;
      if (typeof window === "undefined") return;
      const payload = decodeShareUrl(window.location.href);
      if (!payload) return;
      shareFromUrlApplied.current = true;
      applySharePayload(payload);
      const url = new URL(window.location.href);
      if (url.searchParams.has("plan")) {
        url.searchParams.delete("plan");
        window.history.replaceState(
          {},
          "",
          `${url.pathname}${url.search}${url.hash}`
        );
      }
    }

    const api = useStore.persist;
    if (api.hasHydrated()) {
      applyFromUrl();
      return;
    }
    const unsub = api.onFinishHydration(applyFromUrl);
    return () => {
      unsub?.();
    };
  }, [applySharePayload]);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    async function loadSharedPlan() {
      try {
        const localContentState = useStore.getState().plansByTimeline[tl.id];
        if (localContentState?.needsRemoteSave) {
          return;
        }

        const snapshot = await fetchSharedPlanSnapshot(getRoomId(), tl.id);
        if (cancelled || !snapshot) {
          return;
        }

        const latestLocalState = useStore.getState().plansByTimeline[tl.id];
        if (latestLocalState?.needsRemoteSave) {
          return;
        }

        if (snapshot.importedTimeline) {
          setImportedTimeline(snapshot.importedTimeline);
        } else if (tl.id in BUILTIN_TIMELINES) {
          setImportedTimeline(null);
        }

        applyPersistedSharedState(snapshot.payload, snapshot.updatedAt);
      } catch (error) {
        console.error("Failed to load shared plan snapshot", error);
      } finally {
        setIsLoaded(true);
      }
    }

    const loadTimer = window.setTimeout(() => {
      if (!isLoaded) {
        console.warn("[Storage] Load timed out, enabling save anyway.");
        setIsLoaded(true);
      }
    }, 5000);

    void loadSharedPlan().finally(() => {
      window.clearTimeout(loadTimer);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
    };
  }, [applyPersistedSharedState, setImportedTimeline, tl.id, currentRoomId]);

  useEffect(() => {
    if (!supabase) return;

    const roomId = getRoomId();
    const channel = supabase.channel(getRealtimeChannelName(roomId, tl.id));

    channel
      .on("broadcast", { event: "*" }, ({ event, payload }) => {
        if (event === REALTIME_EVENTS.REQUEST_STATE) {
          useStore.getState().broadcastCurrentState(tl.id);
        } else {
          applyExternalUsage(event, payload, tl.id);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          useStore.getState().requestState(tl.id);
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [applyExternalUsage, tl.id, currentRoomId]);

  useEffect(() => {
    if (!supabase) return;
    if (!needsRemoteSave || !isLoaded) return;
    if (typeof window !== "undefined" && !window.navigator.onLine) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          console.info(`[Storage] Saving plan for room: ${currentRoomId}, timeline: ${tl.id}...`);
          const updatedAt = await saveSharedPlanSnapshot({
            roomId: currentRoomId,
            timelineId: tl.id,
            payload: {
              v: 1,
              team,
              usages,
              timelineId: tl.id,
              expandedJobs: expandedJobs.length ? expandedJobs : undefined,
              practice: practiceConfig,
            },
            importedTimeline,
          });

          if (!cancelled) {
            console.info(`[Storage] Save successful at ${updatedAt}`);
            markTimelineSaved(tl.id, updatedAt);
          }
        } catch (error) {
          console.error("[Storage] Failed to save shared plan snapshot", error);
        }
      })();
    }, 1000); // 頻繁な保存を避けるため1秒に延長

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    expandedJobs,
    importedTimeline,
    markTimelineSaved,
    needsRemoteSave,
    practiceConfig,
    team,
    tl.id,
    usages,
    currentRoomId,
    isLoaded,
  ]);

  useEffect(() => {
    if (!supabase) return;

    function handleOnline() {
      const state = useStore.getState();
      const contentState = state.plansByTimeline[tl.id];
      if (!contentState?.needsRemoteSave) {
        return;
      }

      void (async () => {
        try {
          const updatedAt = await saveSharedPlanSnapshot({
            roomId: getRoomId(),
            timelineId: tl.id,
            payload: {
              v: 1,
              team: contentState.team,
              usages: contentState.usages,
              timelineId: tl.id,
              expandedJobs: contentState.expandedJobs.length
                ? contentState.expandedJobs
                : undefined,
              practice: {
                youtubeUrl: contentState.practice.youtubeUrl,
                syncPoints: contentState.practice.syncPoints,
              },
            },
            importedTimeline:
              state.importedTimeline?.id === tl.id ? state.importedTimeline : null,
          });
          useStore.getState().markTimelineSaved(tl.id, updatedAt);
        } catch (error) {
          console.error("Failed to flush shared plan snapshot after reconnect", error);
        }
      })();
    }

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [tl.id]);

  function handlePhaseSeconds(secs: number[]) {
    setSeconds(secs);
  }

  function handleToggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  function openPracticeJobPicker() {
    if (team.length === 0) {
      setIsPracticeMode(true);
      return;
    }
    setPracticeJobDialogMode("primary");
  }

  function closePracticeMode() {
    setPracticeTimelineSec(null);
    setPracticeVideoSec(null);
    setIsPracticeMode(false);
    setPracticeJobDialogMode(null);
    setPracticeExtraJobIds([]);
  }

  function handleTogglePracticeMode() {
    if (isPracticeMode) {
      closePracticeMode();
      return;
    }

    openPracticeJobPicker();
  }

  function handleSelectPracticeJob(jobId: string) {
    setPracticeSelectedJob(jobId);
    setPracticeExtraJobIds([]);
    setPracticeJobDialogMode(null);
    setIsPracticeMode(true);
  }

  function handleSelectExtraPracticeJob(jobId: JobId) {
    setPracticeExtraJobIds((prev) => {
      if (prev.includes(jobId) || jobId === practiceSelectedJobId) {
        return prev;
      }
      return [...prev, jobId];
    });
    setPracticeJobDialogMode(null);
  }

  function handleRemoveExtraPracticeJob(jobId: JobId) {
    setPracticeExtraJobIds((prev) => prev.filter((entry) => entry !== jobId));
  }

  function handlePracticeChange(nextPractice: TimelinePracticeConfig) {
    setPracticeConfig(nextPractice);
    setIsVideoSettingsOpen(false);
  }

  function handleTimeClick(sec: number) {
    setEditingSyncSecond(sec);
  }

  function handleSaveSyncPoint(videoSec: number) {
    if (editingSyncSecond === null) {
      return;
    }

    setPracticeConfig({
      youtubeUrl: practiceConfig.youtubeUrl,
      syncPoints: normalizeSyncPoints([
        ...practiceConfig.syncPoints.filter((point) => point.t_sec !== editingSyncSecond),
        {
          t_sec: editingSyncSecond,
          video_sec: clampSeconds(videoSec),
        },
      ]),
    });
    setEditingSyncSecond(null);
  }

  function handleDeleteSyncPoint() {
    if (editingSyncSecond === null) {
      return;
    }

    setPracticeConfig({
      youtubeUrl: practiceConfig.youtubeUrl,
      syncPoints: normalizeSyncPoints(
        practiceConfig.syncPoints.filter((point) => point.t_sec !== editingSyncSecond)
      ),
    });
    setEditingSyncSecond(null);
  }

  const practiceLayoutStyle = useMemo(() => {
    if (practiceVideoPaneWidth === null) {
      return undefined;
    }

    return {
      "--mp-practice-left-w": `${practiceVideoPaneWidth}px`,
    } as CSSProperties;
  }, [practiceVideoPaneWidth]);

  const availableExtraPracticeJobs = useMemo(
    () =>
      team.filter(
        (jobId) =>
          jobId !== practiceSelectedJobId && !practiceExtraJobIds.includes(jobId)
      ),
    [practiceExtraJobIds, practiceSelectedJobId, team]
  );

  return (
    <div className={`min-h-screen flex flex-col ${theme === "light" ? "bg-[#f2f2f2]" : "bg-slate-950"}`}>
      <main className="flex-1 py-4">
        <div className="w-full">
          <div className="w-full px-2 mp-shell">
            <TopBar
              tl={tl}
              theme={theme}
              isPracticeMode={isPracticeMode}
              onToggleTheme={handleToggleTheme}
              onTogglePracticeMode={handleTogglePracticeMode}
              onOpenVideoSettings={() => setIsVideoSettingsOpen(true)}
              onPhaseSeconds={handlePhaseSeconds}
            />
            <ValidationPanel />
          </div>
        </div>

        {isPracticeMode ? (
          <div className="w-full px-2 mp-shell">
            <div
              ref={practiceLayoutRef}
              className="mp-practice-layout"
              style={practiceLayoutStyle}
            >
              <PracticeModePanel
                theme={theme}
                practice={practiceConfig}
                currentTimelineSec={practiceTimelineSec}
                viewMode={practiceViewMode}
                onClose={closePracticeMode}
                onViewModeChange={setPracticeViewMode}
                onTimelineTimeChange={setPracticeTimelineSec}
                onVideoTimeChange={setPracticeVideoSec}
              />

              <div ref={practiceTimelinePaneRef} className="min-w-0">
                {practiceViewMode === "icons" ? (
                  <PracticeIconModePanel
                    theme={theme}
                    primaryJobId={practiceSelectedJobId}
                    extraJobIds={practiceExtraJobIds}
                    currentTimelineSec={practiceTimelineSec}
                    canAddJobs={availableExtraPracticeJobs.length > 0}
                    onAddJob={() => setPracticeJobDialogMode("extra")}
                    onRemoveJob={handleRemoveExtraPracticeJob}
                  />
                ) : (
                  <TimelineGrid
                    tl={tl}
                    seconds={practiceSeconds}
                    jobFilter={practiceSelectedJobId}
                    focusJobId={practiceSelectedJobId}
                    focusSecond={practiceTimelineSec}
                    followTime
                    onTimeClick={handleTimeClick}
                    syncSeconds={syncSeconds}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <TimelineGrid
            tl={tl}
            seconds={seconds}
            onTimeClick={handleTimeClick}
            syncSeconds={syncSeconds}
          />
        )}
      </main>

      {practiceJobDialogMode !== null && (
        <PracticeJobSelectDialog
          theme={theme}
          team={
            practiceJobDialogMode === "extra"
              ? availableExtraPracticeJobs
              : team
          }
          title={
            practiceJobDialogMode === "extra"
              ? "追加するジョブを選択"
              : "ジョブを選択"
          }
          description={
            practiceJobDialogMode === "extra"
              ? "クールダウンを一緒に見たいPTメンバーを選んでください。"
              : "動画モードでメイン表示するジョブを選んでください。"
          }
          emptyMessage={
            practiceJobDialogMode === "extra"
              ? "今のPTジョブはすべて表示中です。"
              : "先にPTへジョブを追加してください。"
          }
          onClose={() => setPracticeJobDialogMode(null)}
          onSelect={
            practiceJobDialogMode === "extra"
              ? handleSelectExtraPracticeJob
              : handleSelectPracticeJob
          }
        />
      )}

      {isVideoSettingsOpen && (
        <TimelineVideoSettingsDialog
          theme={theme}
          practice={practiceConfig}
          onClose={() => setIsVideoSettingsOpen(false)}
          onSave={handlePracticeChange}
        />
      )}

      {editingSyncSecond !== null && (
        <TimelineSyncPointDialog
          theme={theme}
          timelineSec={editingSyncSecond}
          initialVideoSec={editingSyncPoint?.video_sec ?? null}
          currentVideoSec={practiceVideoSec}
          onClose={() => setEditingSyncSecond(null)}
          onDelete={handleDeleteSyncPoint}
          onSave={handleSaveSyncPoint}
        />
      )}
    </div>
  );
}
