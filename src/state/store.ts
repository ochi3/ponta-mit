import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  DEFAULT_TIMELINE_ID,
  resolveTimelineId,
} from "../data/timelines/registry";
import { normalizeTeam } from "../config/jobPriority";
import { buildMomentNoteKey, normalizeMomentNotes } from "../logic/momentNotes";
import { normalizeLayoutPrefs } from "../logic/layoutPrefs";
import {
  filterPracticeJobFieldsForTeam,
  hasAnyPracticeVideo,
  normalizeJobSyncPoints,
  normalizeJobVideoSource,
  normalizeJobYoutubeUrls,
  normalizeSyncPoints,
} from "../logic/practiceVideo";
import { getRealtimeChannelName, getRoomId, REALTIME_EVENTS, supabase } from "../logic/realtime";
import type {
  JobId,
  PlanUsage,
  PracticeSettings,
  SharePayload,
  TimelinePracticeConfig,
  Timeline,
  PlannerLayoutPrefs,
  VideoSyncPoint,
  PracticeVideoSource,
} from "../types";

type PlannerContentState = {
  team: JobId[];
  usages: PlanUsage[];
  momentNotes: Record<string, string>;
  layoutPrefs: PlannerLayoutPrefs;
  expandedJobs: JobId[];
  cardOnlyJobs: JobId[];
  evolveJobs: JobId[];
  hideRowsWithoutEvents: boolean;
  practice: PracticeSettings;
  practiceSelectedJobId: JobId | null;
  needsRemoteSave: boolean;
  lastRemoteSavedAt: string | null;
};

type PlannerHistorySnapshot = Pick<
  PlannerContentState,
  | "team"
  | "usages"
  | "momentNotes"
  | "expandedJobs"
  | "cardOnlyJobs"
  | "evolveJobs"
  | "practice"
  | "practiceSelectedJobId"
>;

type PersistedStore = {
  timelineId?: string;
  importedTimeline?: Timeline | null;
  plansByTimeline?: Record<string, Partial<PlannerContentState>>;
  practiceDefaultsByTimeline?: Record<string, TimelinePracticeConfig>;
  team?: JobId[];
  usages?: PlanUsage[];
  expandedJobs?: JobId[];
  cardOnlyJobs?: JobId[];
  evolveJobs?: JobId[];
};

type Store = {
  timelineId: string;
  importedTimeline: Timeline | null;
  plansByTimeline: Record<string, PlannerContentState>;
  practiceDefaultsByTimeline: Record<string, TimelinePracticeConfig>;
  team: JobId[];
  usages: PlanUsage[];
  momentNotes: Record<string, string>;
  layoutPrefs: PlannerLayoutPrefs;
  expandedJobs: JobId[];
  cardOnlyJobs: JobId[];
  evolveJobs: JobId[];
  hideRowsWithoutEvents: boolean;
  undoStackByTimeline: Record<string, PlannerHistorySnapshot[]>;
  redoStackByTimeline: Record<string, PlannerHistorySnapshot[]>;

  setTimeline(id: string): void;
  setImportedTimeline: (tl: Timeline | null) => void;
  setTeam(team: JobId[]): void;
  addJob(jobId: JobId): void;
  removeJob(jobId: JobId): void;
  toggleJob(jobId: JobId): void;
  toggleJobExpand(jobId: JobId): void;
  toggleAllJobExpand(): void;
  toggleJobCardOnly(jobId: JobId): void;
  toggleJobEvolve(jobId: JobId): void;
  toggleHideRowsWithoutEvents(): void;

  addUsage(jobId: JobId, skillId: string, t_sec: number, lineIndex: number, stacks?: number): void;
  updateUsageStacks(jobId: JobId, skillId: string, t_sec: number, lineIndex: number, stacks: number): void;
  removeUsage(jobId: JobId, skillId: string, t_sec: number, lineIndex: number): void;
  clearUsages(): void;
  setMomentNote(t_sec: number, lineIndex: number, note: string): void;
  setMemoColumnWidth(widthPx: number): void;
  replaceTimelinePlan(
    timelineId: string,
    plan: {
      team: JobId[];
      usages: PlanUsage[];
      expandedJobs?: JobId[];
      evolveJobs?: JobId[];
    }
  ): void;

  removeUsageForSkill(jobId: JobId, skillId: string): void;
  setPracticeConfig(practice: TimelinePracticeConfig): void;
  setPracticeYoutubeUrl(youtubeUrl: string): void;
  replacePracticeSyncPoints(syncPoints: VideoSyncPoint[]): void;
  setPracticeSelectedJob(jobId: JobId | null): void;
  setPracticeJobVideoSource(jobId: JobId, source: PracticeVideoSource): void;

  applySharePayload(payload: SharePayload): void;
  applyPersistedSharedState(payload: SharePayload, updatedAt?: string | null): void;
  markTimelineSaved(timelineId?: string, updatedAt?: string | null): void;
  applyExternalUsage(event: string, payload: unknown, timelineId?: string): void;
  undo(): void;
  redo(): void;

  requestState(timelineId?: string): void;
  broadcastCurrentState(timelineId?: string): void;
  resetTimelineState(timelineId: string): void;
};

type TimelineScopedStoreState = Pick<
  Store,
  "timelineId" | "plansByTimeline" | "team" | "usages" | "expandedJobs"
  | "cardOnlyJobs" | "evolveJobs"
>;

const HISTORY_LIMIT = 50;

const FALLBACK_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function normalizeTimelineId(timelineId?: string | null) {
  const trimmed = timelineId?.trim();
  if (!trimmed) {
    return DEFAULT_TIMELINE_ID;
  }
  return resolveTimelineId(trimmed);
}

function sortUsages(usages: readonly PlanUsage[]) {
  return [...usages].sort((a, b) => a.t_sec - b.t_sec || a.lineIndex - b.lineIndex);
}

function normalizeExpandedJobs(expandedJobs?: readonly JobId[]) {
  return expandedJobs ? Array.from(new Set(expandedJobs)) : [];
}

function normalizeCardOnlyJobs(cardOnlyJobs?: readonly JobId[]) {
  return cardOnlyJobs
    ? Array.from(new Set(cardOnlyJobs.filter((jobId) => jobId === "healer.ast")))
    : [];
}

function normalizeEvolveJobs(
  evolveJobs?: readonly JobId[],
  team?: readonly JobId[]
) {
  const uniqueJobs = evolveJobs ? Array.from(new Set(evolveJobs)) : [];
  return team ? uniqueJobs.filter((jobId) => team.includes(jobId)) : uniqueJobs;
}

function normalizePracticeSettings(
  settings?: Partial<PracticeSettings> | null,
  team?: readonly JobId[]
): PracticeSettings {
  const normalized: PracticeSettings = {
    youtubeUrl: settings?.youtubeUrl?.trim() ?? "",
    syncPoints: normalizeSyncPoints(settings?.syncPoints),
    selectedJobId:
      typeof settings?.selectedJobId === "string" && settings.selectedJobId.trim()
        ? settings.selectedJobId
        : null,
    jobYoutubeUrls: normalizeJobYoutubeUrls(settings?.jobYoutubeUrls),
    jobVideoSource: normalizeJobVideoSource(settings?.jobVideoSource),
    jobSyncPoints: normalizeJobSyncPoints(settings?.jobSyncPoints),
  };

  if (!team?.length) {
    return normalized;
  }

  const filtered = filterPracticeJobFieldsForTeam(
    {
      youtubeUrl: normalized.youtubeUrl,
      syncPoints: normalized.syncPoints,
      jobYoutubeUrls: normalized.jobYoutubeUrls,
      jobVideoSource: normalized.jobVideoSource,
      jobSyncPoints: normalized.jobSyncPoints,
    },
    team
  );

  return {
    ...normalized,
    jobYoutubeUrls: filtered.jobYoutubeUrls,
    jobVideoSource: filtered.jobVideoSource,
    jobSyncPoints: filtered.jobSyncPoints,
  };
}

function syncPracticeSelection(
  team: readonly JobId[],
  practice?: Partial<PracticeSettings> | null
) {
  const normalizedPractice = normalizePracticeSettings(practice, team);
  if (normalizedPractice.selectedJobId && team.includes(normalizedPractice.selectedJobId)) {
    return normalizedPractice;
  }

  return {
    ...normalizedPractice,
    selectedJobId: team[0] ?? null,
  } satisfies PracticeSettings;
}

function toTimelinePracticeConfig(practice: PracticeSettings): TimelinePracticeConfig {
  const jobYoutubeUrls = normalizeJobYoutubeUrls(practice.jobYoutubeUrls);
  const jobVideoSource = normalizeJobVideoSource(practice.jobVideoSource);
  const jobSyncPoints = normalizeJobSyncPoints(practice.jobSyncPoints);
  const config: TimelinePracticeConfig = {
    youtubeUrl: practice.youtubeUrl,
    syncPoints: practice.syncPoints,
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

function normalizeTimelinePracticeConfig(
  practice?: Partial<TimelinePracticeConfig> | null
): TimelinePracticeConfig {
  const jobYoutubeUrls = normalizeJobYoutubeUrls(practice?.jobYoutubeUrls);
  const jobVideoSource = normalizeJobVideoSource(practice?.jobVideoSource);
  const jobSyncPoints = normalizeJobSyncPoints(practice?.jobSyncPoints);
  const config: TimelinePracticeConfig = {
    youtubeUrl: practice?.youtubeUrl?.trim() ?? "",
    syncPoints: normalizeSyncPoints(practice?.syncPoints),
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

function hasTimelinePracticeConfig(
  practice?: Partial<TimelinePracticeConfig> | null
) {
  return hasAnyPracticeVideo(practice);
}

function normalizeContentState(
  state?: Partial<PlannerContentState> | null,
  base?: PlannerContentState
): PlannerContentState {
  const merged = { ...base, ...state };
  const team = normalizeTeam(merged.team ?? []);
  const practice = syncPracticeSelection(team, {
    ...base?.practice,
    ...state?.practice,
    selectedJobId:
      state?.practiceSelectedJobId ??
      state?.practice?.selectedJobId ??
      base?.practiceSelectedJobId ??
      base?.practice?.selectedJobId,
  });

  return {
    team,
    usages: sortUsages(merged.usages ?? []),
    momentNotes: normalizeMomentNotes(merged.momentNotes),
    layoutPrefs: normalizeLayoutPrefs(merged.layoutPrefs),
    expandedJobs: normalizeExpandedJobs(merged.expandedJobs),
    cardOnlyJobs: normalizeCardOnlyJobs(merged.cardOnlyJobs).filter((jobId) =>
      team.includes(jobId)
    ),
    evolveJobs: normalizeEvolveJobs(merged.evolveJobs, team),
    hideRowsWithoutEvents:
      merged.hideRowsWithoutEvents ??
      (merged as { hideOutsideMechanismRows?: boolean }).hideOutsideMechanismRows ??
      false,
    practice,
    practiceSelectedJobId: practice.selectedJobId,
    needsRemoteSave: merged.needsRemoteSave ?? false,
    lastRemoteSavedAt: merged.lastRemoteSavedAt ?? null,
  };
}

function getContentState(
  plansByTimeline: Record<string, PlannerContentState>,
  timelineId: string
) {
  return plansByTimeline[timelineId] ?? normalizeContentState();
}

function createHistorySnapshot(
  contentState: PlannerContentState
): PlannerHistorySnapshot {
  return {
    team: [...contentState.team],
    usages: contentState.usages.map((usage) => ({ ...usage })),
    momentNotes: { ...contentState.momentNotes },
    expandedJobs: [...contentState.expandedJobs],
    cardOnlyJobs: [...contentState.cardOnlyJobs],
    evolveJobs: [...contentState.evolveJobs],
    practice: {
      youtubeUrl: contentState.practice.youtubeUrl,
      syncPoints: contentState.practice.syncPoints.map((point) => ({ ...point })),
      selectedJobId: contentState.practice.selectedJobId,
    },
    practiceSelectedJobId: contentState.practiceSelectedJobId,
  };
}

function pushHistorySnapshot(
  stacksByTimeline: Record<string, PlannerHistorySnapshot[]>,
  timelineId: string,
  snapshot: PlannerHistorySnapshot
) {
  const stack = stacksByTimeline[timelineId] ?? [];
  return {
    ...stacksByTimeline,
    [timelineId]: [...stack, snapshot].slice(-HISTORY_LIMIT),
  };
}

function updateTimelineState(
  state: TimelineScopedStoreState,
  timelineId: string,
  nextContentState: Partial<PlannerContentState>
) {
  const normalizedTimelineId = normalizeTimelineId(timelineId);
  const currentContentState = getContentState(
    state.plansByTimeline,
    normalizedTimelineId
  );
  const normalizedContentState = normalizeContentState(
    nextContentState,
    currentContentState
  );
  const nextPlansByTimeline = {
    ...state.plansByTimeline,
    [normalizedTimelineId]: normalizedContentState,
  };

  if (normalizedTimelineId !== normalizeTimelineId(state.timelineId)) {
    return {
      plansByTimeline: nextPlansByTimeline,
    };
  }

  return {
    plansByTimeline: nextPlansByTimeline,
    team: normalizedContentState.team,
    usages: normalizedContentState.usages,
    momentNotes: normalizedContentState.momentNotes,
    layoutPrefs: normalizedContentState.layoutPrefs,
    expandedJobs: normalizedContentState.expandedJobs,
    cardOnlyJobs: normalizedContentState.cardOnlyJobs,
    evolveJobs: normalizedContentState.evolveJobs,
    hideRowsWithoutEvents: normalizedContentState.hideRowsWithoutEvents,
  };
}

function updateTimelineStateWithHistory(
  state: Store,
  timelineId: string,
  nextContentState: Partial<PlannerContentState>
) {
  const normalizedTimelineId = normalizeTimelineId(timelineId);
  const currentContentState = getContentState(
    state.plansByTimeline,
    normalizedTimelineId
  );

  return {
    ...updateTimelineState(
      state,
      normalizedTimelineId,
      withRemoteSaveQueued({
        ...currentContentState,
        ...nextContentState,
      })
    ),
    undoStackByTimeline: pushHistorySnapshot(
      state.undoStackByTimeline,
      normalizedTimelineId,
      createHistorySnapshot(currentContentState)
    ),
    redoStackByTimeline: {
      ...state.redoStackByTimeline,
      [normalizedTimelineId]: [],
    },
  };
}

function activateTimelineState(
  state: TimelineScopedStoreState,
  timelineId: string
) {
  const normalizedTimelineId = normalizeTimelineId(timelineId);
  const currentContentState = getContentState(
    state.plansByTimeline,
    normalizedTimelineId
  );
  const hasExistingTimeline = normalizedTimelineId in state.plansByTimeline;

  return {
    timelineId: normalizedTimelineId,
    plansByTimeline: hasExistingTimeline
      ? state.plansByTimeline
      : {
          ...state.plansByTimeline,
          [normalizedTimelineId]: currentContentState,
        },
    team: currentContentState.team,
    usages: currentContentState.usages,
    momentNotes: currentContentState.momentNotes,
    layoutPrefs: currentContentState.layoutPrefs,
    expandedJobs: currentContentState.expandedJobs,
    cardOnlyJobs: currentContentState.cardOnlyJobs,
    evolveJobs: currentContentState.evolveJobs,
    hideRowsWithoutEvents: currentContentState.hideRowsWithoutEvents,
  };
}

function withRemoteSaveQueued(contentState: PlannerContentState) {
  return {
    ...contentState,
    needsRemoteSave: true,
  } satisfies PlannerContentState;
}

/** 表示設定のみ更新（共有ルーム／Supabase には送らない） */
function updateTimelineDisplayPrefs(
  state: Store,
  timelineId: string,
  prefs: Partial<
    Pick<
      PlannerContentState,
      "expandedJobs" | "cardOnlyJobs" | "evolveJobs" | "hideRowsWithoutEvents"
    >
  >
) {
  const normalizedTimelineId = normalizeTimelineId(timelineId);
  const contentState = getContentState(state.plansByTimeline, normalizedTimelineId);
  return updateTimelineState(state, normalizedTimelineId, {
    ...contentState,
    ...prefs,
  });
}

function broadcast(event: string, payload: unknown, timelineId: string) {
  if (!supabase) return;
  const channel = supabase.channel(
    getRealtimeChannelName(getRoomId(), normalizeTimelineId(timelineId))
  );
  void channel.send({
    type: "broadcast",
    event,
    payload,
  });
}

function broadcastSyncState(contentState: PlannerContentState, timelineId: string) {
  broadcast(
    REALTIME_EVENTS.SYNC_STATE,
    {
      team: contentState.team,
      usages: contentState.usages,
      momentNotes: contentState.momentNotes,
      layoutPrefs:
        contentState.layoutPrefs.memoWidthPx !== undefined
          ? contentState.layoutPrefs
          : undefined,
      practice: toTimelinePracticeConfig(contentState.practice),
    },
    timelineId
  );
}

function mergePersistedState(
  persistedState: PersistedStore | undefined,
  currentState: Store
) {
  if (!persistedState) return currentState;

  const migratedPlans: Record<string, PlannerContentState> = {};

  for (const [timelineId, contentState] of Object.entries(
    persistedState.plansByTimeline ?? {}
  )) {
    const normalizedId = normalizeTimelineId(timelineId);
    const existing = migratedPlans[normalizedId];
    migratedPlans[normalizedId] = normalizeContentState(
      contentState,
      existing
    );
  }

  const practiceDefaultsByTimeline = Object.fromEntries(
    Object.entries(persistedState.practiceDefaultsByTimeline ?? {}).map(
      ([timelineId, practice]) => [
        normalizeTimelineId(timelineId),
        normalizeTimelinePracticeConfig(practice),
      ]
    )
  ) satisfies Record<string, TimelinePracticeConfig>;

  if (
    persistedState.team !== undefined ||
    persistedState.usages !== undefined ||
    persistedState.expandedJobs !== undefined ||
    persistedState.cardOnlyJobs !== undefined ||
    persistedState.evolveJobs !== undefined
  ) {
    const legacyTimelineId = normalizeTimelineId(
      persistedState.timelineId ?? currentState.timelineId
    );
    const legacyBase = migratedPlans[legacyTimelineId];
    migratedPlans[legacyTimelineId] = normalizeContentState(
      {
        team: persistedState.team ?? legacyBase?.team,
        usages: persistedState.usages ?? legacyBase?.usages,
        expandedJobs: persistedState.expandedJobs ?? legacyBase?.expandedJobs,
        cardOnlyJobs: persistedState.cardOnlyJobs ?? legacyBase?.cardOnlyJobs,
        evolveJobs: persistedState.evolveJobs ?? legacyBase?.evolveJobs,
      },
      legacyBase
    );
  }

  const timelineId = normalizeTimelineId(
    persistedState.timelineId ?? currentState.timelineId
  );
  const activeContentState = getContentState(migratedPlans, timelineId);

  return {
    ...currentState,
    timelineId,
    importedTimeline: persistedState.importedTimeline
      ? {
          ...persistedState.importedTimeline,
          id: resolveTimelineId(persistedState.importedTimeline.id),
        }
      : currentState.importedTimeline,
    practiceDefaultsByTimeline,
    plansByTimeline:
      timelineId in migratedPlans
        ? migratedPlans
        : {
            ...migratedPlans,
            [timelineId]: activeContentState,
          },
    team: activeContentState.team,
    usages: activeContentState.usages,
    momentNotes: activeContentState.momentNotes,
    layoutPrefs: activeContentState.layoutPrefs,
    expandedJobs: activeContentState.expandedJobs,
    cardOnlyJobs: activeContentState.cardOnlyJobs,
    evolveJobs: activeContentState.evolveJobs,
    hideRowsWithoutEvents: activeContentState.hideRowsWithoutEvents,
  } satisfies Store;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      timelineId: DEFAULT_TIMELINE_ID,
      importedTimeline: null,
      practiceDefaultsByTimeline: {},
      plansByTimeline: {
        [DEFAULT_TIMELINE_ID]: normalizeContentState(),
      },
      team: [],
      usages: [],
      momentNotes: {},
      layoutPrefs: {},
      expandedJobs: [],
      cardOnlyJobs: [],
      evolveJobs: [],
      hideRowsWithoutEvents: false,
      undoStackByTimeline: {},
      redoStackByTimeline: {},

      setTimeline: (id) =>
        set((state) => ({
          ...activateTimelineState(state, id),
        })),

      setImportedTimeline: (tl) => set({ importedTimeline: tl }),

      setTeam: (team) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextTeam = normalizeTeam(team);
          broadcast(REALTIME_EVENTS.TEAM_UPDATED, nextTeam, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          });
        }),

      addJob: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          if (contentState.team.includes(jobId)) {
            return {};
          }

          const nextTeam = normalizeTeam([...contentState.team, jobId]);
          broadcast(REALTIME_EVENTS.TEAM_UPDATED, nextTeam, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          });
        }),

      removeJob: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextTeam = contentState.team.filter((memberId) => memberId !== jobId);
          broadcast(REALTIME_EVENTS.TEAM_UPDATED, nextTeam, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          });
        }),

      toggleJob: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextTeam = contentState.team.includes(jobId)
            ? contentState.team.filter((memberId) => memberId !== jobId)
            : normalizeTeam([...contentState.team, jobId]);
          broadcast(REALTIME_EVENTS.TEAM_UPDATED, nextTeam, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          });
        }),

      toggleJobExpand: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextExpandedJobs = contentState.expandedJobs.includes(jobId)
            ? contentState.expandedJobs.filter((expandedJobId) => expandedJobId !== jobId)
            : [...contentState.expandedJobs, jobId];
          return updateTimelineDisplayPrefs(state, timelineId, {
            expandedJobs: nextExpandedJobs,
          });
        }),

      toggleAllJobExpand: () =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const targets = contentState.team;
          const allExpanded =
            targets.length > 0 &&
            targets.every((jobId) => contentState.expandedJobs.includes(jobId));
          const nextExpandedJobs = allExpanded ? [] : [...targets];
          return updateTimelineDisplayPrefs(state, timelineId, {
            expandedJobs: nextExpandedJobs,
          });
        }),

      toggleHideRowsWithoutEvents: () =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          return updateTimelineDisplayPrefs(state, timelineId, {
            hideRowsWithoutEvents: !contentState.hideRowsWithoutEvents,
          });
        }),

      toggleJobCardOnly: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextCardOnlyJobs =
            jobId !== "healer.ast"
              ? contentState.cardOnlyJobs
              : contentState.cardOnlyJobs.includes(jobId)
                ? contentState.cardOnlyJobs.filter(
                    (cardOnlyJobId) => cardOnlyJobId !== jobId
                  )
                : [...contentState.cardOnlyJobs, jobId];

          return updateTimelineDisplayPrefs(state, timelineId, {
            cardOnlyJobs: nextCardOnlyJobs,
          });
        }),

      toggleJobEvolve: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          if (!contentState.team.includes(jobId)) {
            return {};
          }

          const nextEvolveJobs = contentState.evolveJobs.includes(jobId)
            ? contentState.evolveJobs.filter((evolveJobId) => evolveJobId !== jobId)
            : [...contentState.evolveJobs, jobId];

          return updateTimelineDisplayPrefs(state, timelineId, {
            evolveJobs: nextEvolveJobs,
          });
        }),

      addUsage: (jobId, skillId, t_sec, lineIndex, stacks) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const others = contentState.usages.filter(
            (usage) =>
              !(
                usage.jobId === jobId &&
                usage.skillId === skillId &&
                usage.t_sec === t_sec &&
                usage.lineIndex === lineIndex
              )
          );
          const newUsage =
            stacks !== undefined
              ? { jobId, skillId, t_sec, lineIndex, stacks }
              : { jobId, skillId, t_sec, lineIndex };

          broadcast(REALTIME_EVENTS.USAGE_ADDED, newUsage, timelineId);

          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            usages: [...others, newUsage],
          });
        }),

      updateUsageStacks: (jobId, skillId, t_sec, lineIndex, stacks) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          broadcast(
            REALTIME_EVENTS.USAGE_UPDATED,
            { jobId, skillId, t_sec, lineIndex, stacks },
            timelineId
          );
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            usages: contentState.usages.map((usage) =>
              usage.jobId === jobId &&
              usage.skillId === skillId &&
              usage.t_sec === t_sec &&
              usage.lineIndex === lineIndex
                ? { ...usage, stacks }
                : usage
            ),
          });
        }),

      removeUsage: (jobId, skillId, t_sec, lineIndex) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          broadcast(
            REALTIME_EVENTS.USAGE_REMOVED,
            { jobId, skillId, t_sec, lineIndex },
            timelineId
          );
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            usages: contentState.usages.filter(
              (usage) =>
                !(
                  usage.jobId === jobId &&
                  usage.skillId === skillId &&
                  usage.t_sec === t_sec &&
                  usage.lineIndex === lineIndex
                )
            ),
          });
        }),

      clearUsages: () =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          broadcast(REALTIME_EVENTS.CLEAR_ALL, {}, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            usages: [],
          });
        }),

      setMomentNote: (t_sec, lineIndex, note) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const key = buildMomentNoteKey(t_sec, lineIndex);
          const nextNotes = { ...contentState.momentNotes };
          if (note.length === 0) {
            delete nextNotes[key];
          } else {
            nextNotes[key] = note;
          }

          const nextState = updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            momentNotes: nextNotes,
          });

          broadcast(
            REALTIME_EVENTS.SYNC_STATE,
            { momentNotes: nextNotes },
            timelineId
          );

          return nextState;
        }),

      setMemoColumnWidth: (widthPx) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const layoutPrefs = normalizeLayoutPrefs({
            ...contentState.layoutPrefs,
            memoWidthPx: widthPx,
          });

          const nextState = updateTimelineState(state, timelineId, {
            ...withRemoteSaveQueued(contentState),
            layoutPrefs,
          });

          broadcast(
            REALTIME_EVENTS.SYNC_STATE,
            { layoutPrefs },
            timelineId
          );

          return nextState;
        }),

      replaceTimelinePlan: (timelineId, plan) =>
        set((state) => {
          const resolvedTimelineId = normalizeTimelineId(timelineId);
          const contentState = getContentState(
            state.plansByTimeline,
            resolvedTimelineId
          );
          const nextTeam = normalizeTeam(plan.team);
          return updateTimelineState(state, resolvedTimelineId, {
            ...contentState,
            team: nextTeam,
            usages: sortUsages(plan.usages),
            expandedJobs: normalizeExpandedJobs(plan.expandedJobs).filter((jobId) =>
              nextTeam.includes(jobId)
            ),
            evolveJobs: normalizeEvolveJobs(
              plan.evolveJobs ?? contentState.evolveJobs,
              nextTeam
            ),
            cardOnlyJobs: contentState.cardOnlyJobs.filter((jobId) =>
              nextTeam.includes(jobId)
            ),
            practice: syncPracticeSelection(nextTeam, contentState.practice),
            needsRemoteSave: true,
          });
        }),

      removeUsageForSkill: (jobId, skillId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            usages: contentState.usages.filter(
              (usage) => !(usage.jobId === jobId && usage.skillId === skillId)
            ),
          });
        }),

      setPracticeConfig: (practice) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextPractice = syncPracticeSelection(contentState.team, {
            ...contentState.practice,
            youtubeUrl: practice.youtubeUrl,
            syncPoints: practice.syncPoints,
            jobYoutubeUrls: practice.jobYoutubeUrls,
            jobVideoSource: practice.jobVideoSource,
            jobSyncPoints: practice.jobSyncPoints,
            selectedJobId:
              contentState.practiceSelectedJobId ??
              contentState.practice.selectedJobId,
          });
          broadcast(
            REALTIME_EVENTS.PRACTICE_UPDATED,
            toTimelinePracticeConfig(nextPractice),
            timelineId
          );
          return {
            ...updateTimelineStateWithHistory(state, timelineId, {
              ...contentState,
              practice: nextPractice,
            }),
            practiceDefaultsByTimeline: {
              ...state.practiceDefaultsByTimeline,
              [timelineId]: toTimelinePracticeConfig(nextPractice),
            },
          };
        }),

      setPracticeYoutubeUrl: (youtubeUrl) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextPractice = {
            ...contentState.practice,
            youtubeUrl,
          };
          broadcast(
            REALTIME_EVENTS.PRACTICE_UPDATED,
            toTimelinePracticeConfig(nextPractice),
            timelineId
          );
          return {
            ...updateTimelineStateWithHistory(state, timelineId, {
              ...contentState,
              practice: nextPractice,
            }),
            practiceDefaultsByTimeline: {
              ...state.practiceDefaultsByTimeline,
              [timelineId]: toTimelinePracticeConfig(nextPractice),
            },
          };
        }),

      replacePracticeSyncPoints: (syncPoints) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextPractice = {
            ...contentState.practice,
            syncPoints: normalizeSyncPoints(syncPoints),
          };
          broadcast(
            REALTIME_EVENTS.PRACTICE_UPDATED,
            toTimelinePracticeConfig(nextPractice),
            timelineId
          );
          return {
            ...updateTimelineStateWithHistory(state, timelineId, {
              ...contentState,
              practice: nextPractice,
            }),
            practiceDefaultsByTimeline: {
              ...state.practiceDefaultsByTimeline,
              [timelineId]: toTimelinePracticeConfig(nextPractice),
            },
          };
        }),

      setPracticeSelectedJob: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          return updateTimelineStateWithHistory(state, timelineId, {
            ...contentState,
            practice: syncPracticeSelection(contentState.team, {
              ...contentState.practice,
              selectedJobId: jobId,
            }),
            practiceSelectedJobId: jobId,
          });
        }),

      setPracticeJobVideoSource: (jobId, source) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          if (!contentState.team.includes(jobId)) {
            return {};
          }

          const nextPractice = syncPracticeSelection(contentState.team, {
            ...contentState.practice,
            jobVideoSource: {
              ...contentState.practice.jobVideoSource,
              [jobId]: source,
            },
          });
          broadcast(
            REALTIME_EVENTS.PRACTICE_UPDATED,
            toTimelinePracticeConfig(nextPractice),
            timelineId
          );
          return {
            ...updateTimelineStateWithHistory(state, timelineId, {
              ...contentState,
              practice: nextPractice,
            }),
            practiceDefaultsByTimeline: {
              ...state.practiceDefaultsByTimeline,
              [timelineId]: toTimelinePracticeConfig(nextPractice),
            },
          };
        }),

      applySharePayload: (payload) => {
        const timelineId = normalizeTimelineId(payload.timelineId ?? get().timelineId);
        set((state) => {
          const localContentState = getContentState(state.plansByTimeline, timelineId);
          return {
          importedTimeline: null,
          practiceDefaultsByTimeline:
            payload.practice !== undefined && hasTimelinePracticeConfig(payload.practice)
              ? {
                  ...state.practiceDefaultsByTimeline,
                  [timelineId]: normalizeTimelinePracticeConfig(payload.practice),
                }
              : state.practiceDefaultsByTimeline,
          ...activateTimelineState(
            {
              ...state,
              ...updateTimelineState(state, timelineId, {
                team: payload.team,
                usages: payload.usages,
                momentNotes:
                  payload.momentNotes !== undefined
                    ? normalizeMomentNotes(payload.momentNotes)
                    : state.plansByTimeline[timelineId]?.momentNotes,
                layoutPrefs:
                  payload.layoutPrefs !== undefined
                    ? normalizeLayoutPrefs(payload.layoutPrefs)
                    : state.plansByTimeline[timelineId]?.layoutPrefs,
                expandedJobs:
                  payload.expandedJobs !== undefined
                    ? normalizeExpandedJobs(payload.expandedJobs)
                    : localContentState.expandedJobs,
                evolveJobs:
                  payload.evolveJobs !== undefined
                    ? normalizeEvolveJobs(
                        payload.evolveJobs,
                        payload.team ?? localContentState.team
                      )
                    : localContentState.evolveJobs,
                cardOnlyJobs: localContentState.cardOnlyJobs,
                practice:
                  payload.practice !== undefined
                    ? {
                        ...state.plansByTimeline[timelineId]?.practice,
                        ...payload.practice,
                      }
                    : state.plansByTimeline[timelineId]?.practice,
                needsRemoteSave: false,
              }),
            },
            timelineId
          ),
        };
        });
      },

      applyPersistedSharedState: (payload, updatedAt) => {
        const timelineId = normalizeTimelineId(payload.timelineId ?? get().timelineId);
        set((state) => {
          const localContentState = getContentState(state.plansByTimeline, timelineId);
          return {
          practiceDefaultsByTimeline:
            payload.practice !== undefined && hasTimelinePracticeConfig(payload.practice)
              ? {
                  ...state.practiceDefaultsByTimeline,
                  [timelineId]: normalizeTimelinePracticeConfig(payload.practice),
                }
              : state.practiceDefaultsByTimeline,
          ...activateTimelineState(
            {
              ...state,
              ...updateTimelineState(state, timelineId, {
                team: payload.team,
                usages: payload.usages,
                momentNotes:
                  payload.momentNotes !== undefined
                    ? normalizeMomentNotes(payload.momentNotes)
                    : state.plansByTimeline[timelineId]?.momentNotes,
                layoutPrefs:
                  payload.layoutPrefs !== undefined
                    ? normalizeLayoutPrefs(payload.layoutPrefs)
                    : state.plansByTimeline[timelineId]?.layoutPrefs,
                expandedJobs: localContentState.expandedJobs,
                cardOnlyJobs: localContentState.cardOnlyJobs,
                evolveJobs: localContentState.evolveJobs,
                practice:
                  payload.practice !== undefined
                    ? {
                        ...state.plansByTimeline[timelineId]?.practice,
                        ...payload.practice,
                      }
                    : state.plansByTimeline[timelineId]?.practice,
                needsRemoteSave: false,
                lastRemoteSavedAt: updatedAt ?? null,
              }),
            },
            timelineId
          ),
        };
        });
      },

      markTimelineSaved: (timelineId, updatedAt) =>
        set((state) => {
          const resolvedTimelineId = normalizeTimelineId(timelineId ?? state.timelineId);
          const contentState = getContentState(state.plansByTimeline, resolvedTimelineId);
          return updateTimelineState(state, resolvedTimelineId, {
            ...contentState,
            needsRemoteSave: false,
            lastRemoteSavedAt: updatedAt ?? contentState.lastRemoteSavedAt,
          });
        }),

      applyExternalUsage: (event, payload, timelineId) =>
        set((state) => {
          const resolvedTimelineId = normalizeTimelineId(timelineId ?? state.timelineId);
          const contentState = getContentState(
            state.plansByTimeline,
            resolvedTimelineId
          );

          if (event === REALTIME_EVENTS.SYNC_STATE) {
            const syncedPayload = payload as Partial<PlannerContentState>;
            return {
              ...updateTimelineState(state, resolvedTimelineId, {
                ...contentState,
                team: syncedPayload.team ?? contentState.team,
                usages: syncedPayload.usages ?? contentState.usages,
                momentNotes:
                  syncedPayload.momentNotes !== undefined
                    ? normalizeMomentNotes(syncedPayload.momentNotes)
                    : contentState.momentNotes,
                layoutPrefs:
                  syncedPayload.layoutPrefs !== undefined
                    ? normalizeLayoutPrefs(syncedPayload.layoutPrefs)
                    : contentState.layoutPrefs,
                expandedJobs: contentState.expandedJobs,
                cardOnlyJobs: contentState.cardOnlyJobs,
                evolveJobs: contentState.evolveJobs,
                practice:
                  syncedPayload.practice !== undefined
                    ? {
                        ...contentState.practice,
                        ...syncedPayload.practice,
                      }
                    : contentState.practice,
                needsRemoteSave: false,
              }),
              practiceDefaultsByTimeline:
                syncedPayload.practice !== undefined && hasTimelinePracticeConfig(syncedPayload.practice)
                  ? {
                      ...state.practiceDefaultsByTimeline,
                      [resolvedTimelineId]: normalizeTimelinePracticeConfig(
                        syncedPayload.practice
                      ),
                    }
                  : state.practiceDefaultsByTimeline,
            };
          }

          if (event === REALTIME_EVENTS.TEAM_UPDATED) {
            return updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
              ...contentState,
              team: payload as JobId[],
            }));
          }

          if (event === REALTIME_EVENTS.PRACTICE_UPDATED) {
            const nextPracticePayload = payload as TimelinePracticeConfig;
            return {
              ...updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
                ...contentState,
                practice: {
                  ...contentState.practice,
                  ...nextPracticePayload,
                },
              })),
              practiceDefaultsByTimeline: hasTimelinePracticeConfig(nextPracticePayload)
                ? {
                    ...state.practiceDefaultsByTimeline,
                    [resolvedTimelineId]: normalizeTimelinePracticeConfig(
                      nextPracticePayload
                    ),
                  }
                : state.practiceDefaultsByTimeline,
            };
          }

          if (
            event === REALTIME_EVENTS.USAGE_ADDED ||
            event === REALTIME_EVENTS.USAGE_UPDATED
          ) {
            const usage = payload as PlanUsage;
            const others = contentState.usages.filter(
              (existingUsage) =>
                !(
                  existingUsage.jobId === usage.jobId &&
                  existingUsage.skillId === usage.skillId &&
                  existingUsage.t_sec === usage.t_sec &&
                  existingUsage.lineIndex === usage.lineIndex
                )
            );
            return updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
              ...contentState,
              usages: [...others, usage],
            }));
          }

          if (event === REALTIME_EVENTS.USAGE_REMOVED) {
            const usage = payload as PlanUsage;
            return updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
              ...contentState,
              usages: contentState.usages.filter(
                (existingUsage) =>
                  !(
                    existingUsage.jobId === usage.jobId &&
                    existingUsage.skillId === usage.skillId &&
                    existingUsage.t_sec === usage.t_sec &&
                    existingUsage.lineIndex === usage.lineIndex
                  )
              ),
            }));
          }

          if (event === REALTIME_EVENTS.CLEAR_ALL) {
            return updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
              ...contentState,
              usages: [],
            }));
          }

          return {};
        }),

      undo: () =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const undoStack = state.undoStackByTimeline[timelineId] ?? [];
          const previousSnapshot = undoStack[undoStack.length - 1];
          if (!previousSnapshot) {
            return {};
          }

          const contentState = getContentState(state.plansByTimeline, timelineId);
          const currentSnapshot = createHistorySnapshot(contentState);
          const nextUndoStack = undoStack.slice(0, -1);
          const nextRedoStack = pushHistorySnapshot(
            state.redoStackByTimeline,
            timelineId,
            currentSnapshot
          )[timelineId];

          const restoredState = normalizeContentState(previousSnapshot, contentState);
          broadcastSyncState(restoredState, timelineId);

          return {
            ...updateTimelineState(
              state,
              timelineId,
              withRemoteSaveQueued(restoredState)
            ),
            undoStackByTimeline: {
              ...state.undoStackByTimeline,
              [timelineId]: nextUndoStack,
            },
            redoStackByTimeline: {
              ...state.redoStackByTimeline,
              [timelineId]: nextRedoStack,
            },
          };
        }),

      redo: () =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const redoStack = state.redoStackByTimeline[timelineId] ?? [];
          const nextSnapshot = redoStack[redoStack.length - 1];
          if (!nextSnapshot) {
            return {};
          }

          const contentState = getContentState(state.plansByTimeline, timelineId);
          const currentSnapshot = createHistorySnapshot(contentState);
          const nextRedoStack = redoStack.slice(0, -1);
          const nextUndoStack = pushHistorySnapshot(
            state.undoStackByTimeline,
            timelineId,
            currentSnapshot
          )[timelineId];

          const restoredState = normalizeContentState(nextSnapshot, contentState);
          broadcastSyncState(restoredState, timelineId);

          return {
            ...updateTimelineState(
              state,
              timelineId,
              withRemoteSaveQueued(restoredState)
            ),
            undoStackByTimeline: {
              ...state.undoStackByTimeline,
              [timelineId]: nextUndoStack,
            },
            redoStackByTimeline: {
              ...state.redoStackByTimeline,
              [timelineId]: nextRedoStack,
            },
          };
        }),

      requestState: (timelineId) => {
        broadcast(
          REALTIME_EVENTS.REQUEST_STATE,
          {},
          normalizeTimelineId(timelineId ?? get().timelineId)
        );
      },

      broadcastCurrentState: (timelineId) => {
        const resolvedTimelineId = normalizeTimelineId(timelineId ?? get().timelineId);
        const contentState = getContentState(get().plansByTimeline, resolvedTimelineId);
        broadcast(
          REALTIME_EVENTS.SYNC_STATE,
          {
            team: contentState.team,
            usages: contentState.usages,
            momentNotes: contentState.momentNotes,
            layoutPrefs:
              contentState.layoutPrefs.memoWidthPx !== undefined
                ? contentState.layoutPrefs
                : undefined,
            practice: toTimelinePracticeConfig(contentState.practice),
          },
          resolvedTimelineId
        );
      },

      resetTimelineState: (timelineId) =>
        set((state) => {
          const resolvedTimelineId = normalizeTimelineId(timelineId);
          return updateTimelineState(state, resolvedTimelineId, normalizeContentState());
        }),
    }),
    {
      name: "mp-planner-state",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : FALLBACK_STORAGE
      ),
      partialize: (state) => ({
        timelineId: state.timelineId,
        importedTimeline: state.importedTimeline ?? undefined,
        practiceDefaultsByTimeline: state.practiceDefaultsByTimeline,
        plansByTimeline: state.plansByTimeline,
      }),
      merge: (persistedState, currentState) => {
        try {
          return mergePersistedState(
            persistedState as PersistedStore | undefined,
            currentState
          );
        } catch (error) {
          console.error("[mp-planner-state] 保存データの復元に失敗しました:", error);
          return currentState;
        }
      },
    }
  )
);
