import {
  Suspense,
  lazy,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import type {
  JobId,
  Timeline,
  TimelinePracticeConfig,
  PracticeVideoSource,
} from "../types";
import { JOBS } from "../data/jobs/jobs.registry";
import { isBuiltinTimelineId } from "../data/timelines/registry";
import { decodeShareUrl } from "../logic/share";
import { fetchSharedPlanSnapshot, saveSharedPlanSnapshot } from "../logic/sharedPlans";
import {
  applySyncPointRemoval,
  applySyncPointUpdate,
  getSyncPointsForTarget,
  hasAnyPracticeVideo,
  listSyncTargetOptions,
  normalizeJobSyncPoints,
  normalizeJobVideoSource,
  normalizeJobYoutubeUrls,
  resolvePracticeSyncTarget,
} from "../logic/practiceVideo";
import type { PracticeSyncTarget } from "../logic/practiceVideo";
import {
  loadPracticeAutoScroll,
  savePracticeAutoScroll,
  secondsInPhase,
} from "../logic/timelineView";
import type { ValidationIssue } from "../logic/validation";
import { useStore } from "../state/store";
import {
  supabase,
  getRoomId,
  getRealtimeChannelName,
  REALTIME_EVENTS,
} from "../logic/realtime";

import TopBar from "../components/TopBar";
import TimelineGrid from "../components/TimelineGrid";

const ValidationPanel = lazy(() => import("../components/ValidationPanel"));
const PracticeModePanel = lazy(() => import("../components/PracticeModePanel"));
const PracticeIconModePanel = lazy(
  () => import("../components/PracticeIconModePanel")
);
const PracticeJobSelectDialog = lazy(
  () => import("../components/PracticeJobSelectDialog")
);
const TimelineVideoSettingsDialog = lazy(
  () => import("../components/TimelineVideoSettingsDialog")
);
const TimelineSyncPointDialog = lazy(
  () => import("../components/TimelineSyncPointDialog")
);

const EMPTY_PRACTICE_CONFIG: TimelinePracticeConfig = {
  youtubeUrl: "",
  syncPoints: [],
};

type PracticeViewMode = "timeline" | "icons";
type PracticeJobDialogMode = "primary" | "extra" | null;

function mergePracticeConfig(
  source?: Partial<TimelinePracticeConfig> | null
): TimelinePracticeConfig | null {
  if (!hasAnyPracticeVideo(source)) {
    return null;
  }

  const jobYoutubeUrls = normalizeJobYoutubeUrls(source?.jobYoutubeUrls);
  const jobVideoSource = normalizeJobVideoSource(source?.jobVideoSource);
  const jobSyncPoints = normalizeJobSyncPoints(source?.jobSyncPoints);
  const config: TimelinePracticeConfig = {
    youtubeUrl: source?.youtubeUrl?.trim() ?? "",
    syncPoints: source?.syncPoints ?? [],
  };

  if (Object.keys(jobYoutubeUrls).length > 0) {
    config.jobYoutubeUrls = jobYoutubeUrls;
  }
  if (Object.keys(jobVideoSource).length > 0) {
    config.jobVideoSource = jobVideoSource;
  }
  if (Object.keys(jobSyncPoints).length > 0) {
    config.jobSyncPoints = jobSyncPoints;
  }

  return config;
}

function resolvePracticeConfig(
  roomPractice?: Partial<TimelinePracticeConfig> | null,
  contentPractice?: Partial<TimelinePracticeConfig> | null,
  timelinePractice?: Partial<TimelinePracticeConfig> | null
) {
  return (
    mergePracticeConfig(roomPractice) ??
    mergePracticeConfig(contentPractice) ??
    mergePracticeConfig(timelinePractice) ??
    EMPTY_PRACTICE_CONFIG
  );
}

export default function MitigationPlannerPage({ tl }: { tl: Timeline }) {
  const [devSecondsRevision, setDevSecondsRevision] = useState(0);
  const [phaseNavFocus, setPhaseNavFocus] = useState<{
    t_sec: number;
    requestKey: number;
  } | null>(null);
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
  const [practiceAutoScroll, setPracticeAutoScroll] = useState(loadPracticeAutoScroll);
  const [practiceSeekRequest, setPracticeSeekRequest] = useState<{
    sec: number;
    requestKey: number;
  } | null>(null);
  const [practiceExtraJobIds, setPracticeExtraJobIds] = useState<JobId[]>([]);
  const [editingSyncSecond, setEditingSyncSecond] = useState<number | null>(null);
  const [syncTarget, setSyncTarget] = useState<PracticeSyncTarget>("base");
  const [validationFocus, setValidationFocus] = useState<{
    location: NonNullable<ValidationIssue["location"]>;
    requestKey: number;
  } | null>(null);
  const team = useStore((s) => s.team);
  const usages = useStore((s) => s.usages);
  const seconds = useMemo(
    () => secondsInPhase(tl, undefined, usages.map((usage) => usage.t_sec)),
    [tl, usages]
  );
  const momentNotes = useStore((s) => s.momentNotes);
  const layoutPrefs = useStore((s) => s.plansByTimeline[tl.id]?.layoutPrefs);
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
  const setPracticeJobVideoSource = useStore((s) => s.setPracticeJobVideoSource);
  const resetTimelineState = useStore((s) => s.resetTimelineState);
  const applySharePayload = useStore((s) => s.applySharePayload);
  const applyPersistedSharedState = useStore((s) => s.applyPersistedSharedState);
  const applyExternalUsage = useStore((s) => s.applyExternalUsage);
  const removeUsage = useStore((s) => s.removeUsage);
  const markTimelineSaved = useStore((s) => s.markTimelineSaved);
  const shareFromUrlApplied = useRef(false);
  const practiceLayoutRef = useRef<HTMLDivElement | null>(null);
  const practiceTimelinePaneRef = useRef<HTMLDivElement | null>(null);
  const practiceVideoSecRef = useRef<number | null>(null);
  const prevRoomIdRef = useRef<string>(getRoomId());
  const practiceConfig = useMemo(
    () => resolvePracticeConfig(roomPractice, contentPractice, tl.practice),
    [contentPractice, roomPractice, tl.practice]
  );
  const practiceSeconds = useMemo(
    () => secondsInPhase(tl, undefined, usages.map((usage) => usage.t_sec)),
    [tl, usages]
  );
  const syncTargetOptions = useMemo(
    () =>
      listSyncTargetOptions(practiceConfig, team, (jobId) => {
        return JOBS.find((job) => job.id === jobId)?.name ?? jobId;
      }),
    [practiceConfig, team]
  );
  const visibleSyncPoints = useMemo(
    () => getSyncPointsForTarget(practiceConfig, syncTarget),
    [practiceConfig, syncTarget]
  );
  const syncSeconds = useMemo(
    () => visibleSyncPoints.map((point) => point.t_sec),
    [visibleSyncPoints]
  );
  const editingSyncPoint = useMemo(
    () =>
      editingSyncSecond === null
        ? null
        : visibleSyncPoints.find((point) => point.t_sec === editingSyncSecond) ?? null,
    [editingSyncSecond, visibleSyncPoints]
  );
  const currentRoomId = getRoomId();

  useEffect(() => {
    if (syncTargetOptions.some((option) => option.target === syncTarget)) {
      return;
    }
    setSyncTarget("base");
  }, [syncTarget, syncTargetOptions]);

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
    practiceVideoSecRef.current = null;
    setPracticeVideoPaneWidth(null);
    setEditingSyncSecond(null);
    setPracticeJobDialogMode(null);
    setPracticeExtraJobIds([]);
    setIsVideoSettingsOpen(false);
  }, [tl.id, currentRoomId, resetTimelineState]);

  useEffect(() => {
    if (editingSyncSecond === null) {
      setPracticeVideoSec(null);
      return;
    }
    setPracticeVideoSec(practiceVideoSecRef.current);
  }, [editingSyncSecond]);

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
    let loadFinished = false;

    async function loadSharedPlan() {
      try {
        const snapshot = await fetchSharedPlanSnapshot(getRoomId(), tl.id);
        if (cancelled || !snapshot) {
          return;
        }

        if (snapshot.importedTimeline) {
          setImportedTimeline(snapshot.importedTimeline);
        } else if (isBuiltinTimelineId(tl.id)) {
          setImportedTimeline(null);
        }

        applyPersistedSharedState(snapshot.payload, snapshot.updatedAt);
      } catch (error) {
        console.error("Failed to load shared plan snapshot", error);
      } finally {
        if (!cancelled && !loadFinished) {
          loadFinished = true;
          setIsLoaded(true);
        }
      }
    }

    const loadTimer = window.setTimeout(() => {
      if (cancelled || loadFinished) return;
      loadFinished = true;
      console.warn("[Storage] Load timed out, enabling save anyway.");
      setIsLoaded(true);
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
              momentNotes: Object.keys(momentNotes).length ? momentNotes : undefined,
              layoutPrefs:
                layoutPrefs && Object.keys(layoutPrefs).length > 0
                  ? layoutPrefs
                  : undefined,
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
    importedTimeline,
    markTimelineSaved,
    momentNotes,
    layoutPrefs,
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
              momentNotes: Object.keys(contentState.momentNotes).length
                ? contentState.momentNotes
                : undefined,
              layoutPrefs:
                contentState.layoutPrefs &&
                Object.keys(contentState.layoutPrefs).length > 0
                  ? contentState.layoutPrefs
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

  function handlePhaseNavigate(_phaseId: string | undefined, scrollSec?: number) {
    if (scrollSec === undefined) {
      return;
    }
    const requestKey = Date.now();
    setPhaseNavFocus({ t_sec: scrollSec, requestKey });
    if (isPracticeMode) {
      startTransition(() => {
        setPracticeTimelineSec(scrollSec);
      });
    }
  }

  const timelineFocusSecond =
    validationFocus?.location.t_sec ?? phaseNavFocus?.t_sec;
  const timelineFocusRequestKey =
    validationFocus?.requestKey ?? phaseNavFocus?.requestKey;
  const phaseScrollToSecond = phaseNavFocus?.t_sec;
  const phaseScrollRequestKey = phaseNavFocus?.requestKey;

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
    practiceVideoSecRef.current = null;
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

  function handlePracticeVideoSourceChange(source: PracticeVideoSource) {
    if (!practiceSelectedJobId) {
      return;
    }
    setPracticeJobVideoSource(practiceSelectedJobId, source);
  }

  function handleTimeClick(sec: number) {
    if (isPracticeMode && practiceSelectedJobId) {
      setSyncTarget(resolvePracticeSyncTarget(practiceConfig, practiceSelectedJobId));
    }
    setEditingSyncSecond(sec);
  }

  const handlePracticeEventClick = useCallback((sec: number) => {
    startTransition(() => {
      setPracticeTimelineSec(sec);
      setPracticeSeekRequest({ sec, requestKey: Date.now() });
    });
  }, []);

  const handlePracticeViewModeChange = useCallback((mode: PracticeViewMode) => {
    setPracticeViewMode(mode);
  }, []);

  const handlePracticeAutoScrollChange = useCallback((enabled: boolean) => {
    setPracticeAutoScroll(enabled);
    savePracticeAutoScroll(enabled);
  }, []);

  function handleSyncTargetChange(target: PracticeSyncTarget) {
    setSyncTarget(target);
  }

  function handleSelectValidationIssue(issue: ValidationIssue) {
    if (!issue.location) {
      return;
    }

    setValidationFocus({
      location: issue.location,
      requestKey: Date.now(),
    });
  }

  function handleRemoveValidationIssue(issue: ValidationIssue) {
    if (!issue.location) {
      return;
    }

    removeUsage(
      issue.location.jobId,
      issue.location.skillId,
      issue.location.t_sec,
      issue.location.lineIndex
    );
  }

  function handleSaveSyncPoint(videoSec: number) {
    if (editingSyncSecond === null) {
      return;
    }

    setPracticeConfig(
      applySyncPointUpdate(practiceConfig, syncTarget, editingSyncSecond, videoSec)
    );
    setEditingSyncSecond(null);
  }

  function handleDeleteSyncPoint() {
    if (editingSyncSecond === null) {
      return;
    }

    setPracticeConfig(
      applySyncPointRemoval(practiceConfig, syncTarget, editingSyncSecond)
    );
    setEditingSyncSecond(null);
  }

  const handlePracticeTimelineTimeChange = useCallback((value: number | null) => {
    startTransition(() => {
      setPracticeTimelineSec((prev) => (prev === value ? prev : value));
    });
  }, []);

  const handlePracticeVideoTimeChange = useCallback(
    (value: number | null) => {
      practiceVideoSecRef.current = value;
      if (editingSyncSecond === null) {
        return;
      }

      startTransition(() => {
        setPracticeVideoSec((prev) => (prev === value ? prev : value));
      });
    },
    [editingSyncSecond]
  );

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
              onDevTimelineSecondsChange={() =>
                setDevSecondsRevision((revision) => revision + 1)
              }
              theme={theme}
              isPracticeMode={isPracticeMode}
              onToggleTheme={handleToggleTheme}
              onTogglePracticeMode={handleTogglePracticeMode}
              onOpenVideoSettings={() => setIsVideoSettingsOpen(true)}
              onPhaseNavigate={handlePhaseNavigate}
            />
            <Suspense fallback={null}>
              <ValidationPanel
                onSelectIssue={handleSelectValidationIssue}
                onRemoveIssue={handleRemoveValidationIssue}
              />
            </Suspense>
          </div>
        </div>

        {isPracticeMode ? (
          <div className="w-full px-2 mp-shell">
            <div
              ref={practiceLayoutRef}
              className="mp-practice-layout"
              style={practiceLayoutStyle}
            >
              <Suspense
                fallback={
                  <div className="min-h-[18rem] rounded-3xl border border-slate-800/70 bg-slate-950/60" />
                }
              >
                <PracticeModePanel
                  theme={theme}
                  practice={practiceConfig}
                  currentTimelineSec={practiceTimelineSec}
                  primaryJobId={practiceSelectedJobId}
                  viewMode={practiceViewMode}
                  seekTimelineRequest={practiceSeekRequest}
                  onClose={closePracticeMode}
                  onViewModeChange={handlePracticeViewModeChange}
                  autoScrollEnabled={practiceAutoScroll}
                  onAutoScrollChange={handlePracticeAutoScrollChange}
                  onTimelineTimeChange={handlePracticeTimelineTimeChange}
                  onVideoTimeChange={handlePracticeVideoTimeChange}
                  onVideoSourceChange={handlePracticeVideoSourceChange}
                />
              </Suspense>

              <div ref={practiceTimelinePaneRef} className="min-w-0 mp-practice-aside-pane">
                {practiceViewMode === "icons" ? (
                  <Suspense
                    fallback={
                      <div className="min-h-[18rem] rounded-3xl border border-slate-800/70 bg-slate-950/60" />
                    }
                  >
                    <PracticeIconModePanel
                      theme={theme}
                      primaryJobId={practiceSelectedJobId}
                      extraJobIds={practiceExtraJobIds}
                      currentTimelineSec={practiceTimelineSec}
                      canAddJobs={availableExtraPracticeJobs.length > 0}
                      onAddJob={() => setPracticeJobDialogMode("extra")}
                      onRemoveJob={handleRemoveExtraPracticeJob}
                    />
                  </Suspense>
                ) : (
                  <TimelineGrid
                    tl={tl}
                    seconds={practiceSeconds}
                    devTimelineSecondsRevision={devSecondsRevision}
                    jobFilter={practiceSelectedJobId}
                    focusJobId={practiceSelectedJobId}
                    focusSecond={validationFocus?.location.t_sec ?? practiceTimelineSec}
                    focusLineIndex={validationFocus?.location.lineIndex}
                    focusSkillId={validationFocus?.location.skillId}
                    focusRequestKey={validationFocus?.requestKey}
                    scrollToSecond={phaseScrollToSecond}
                    scrollRequestKey={phaseScrollRequestKey}
                    followTime={practiceAutoScroll}
                    onTimeClick={handleTimeClick}
                    onEventClick={handlePracticeEventClick}
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
            devTimelineSecondsRevision={devSecondsRevision}
            focusSecond={timelineFocusSecond}
            focusLineIndex={validationFocus?.location.lineIndex}
            focusSkillId={validationFocus?.location.skillId}
            focusRequestKey={timelineFocusRequestKey}
            scrollToSecond={phaseScrollToSecond}
            scrollRequestKey={phaseScrollRequestKey}
            onTimeClick={handleTimeClick}
            syncSeconds={syncSeconds}
          />
        )}
      </main>

      {practiceJobDialogMode !== null && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {isVideoSettingsOpen && (
        <Suspense fallback={null}>
        <TimelineVideoSettingsDialog
          theme={theme}
          team={team}
          practice={practiceConfig}
          onClose={() => setIsVideoSettingsOpen(false)}
          onSave={handlePracticeChange}
        />
        </Suspense>
      )}

      {editingSyncSecond !== null && (
        <Suspense fallback={null}>
        <TimelineSyncPointDialog
          theme={theme}
          timelineSec={editingSyncSecond}
          syncTarget={syncTarget}
          syncTargetOptions={syncTargetOptions}
          onSyncTargetChange={handleSyncTargetChange}
          initialVideoSec={editingSyncPoint?.video_sec ?? null}
          currentVideoSec={isPracticeMode ? practiceVideoSec : null}
          onClose={() => setEditingSyncSecond(null)}
          onDelete={handleDeleteSyncPoint}
          onSave={handleSaveSyncPoint}
        />
        </Suspense>
      )}
    </div>
  );
}
