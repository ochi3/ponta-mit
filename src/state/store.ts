import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { DEFAULT_TIMELINE_ID } from "../data/timelines/registry";
import { normalizeTeam } from "../config/jobPriority";
import { getRealtimeChannelName, getRoomId, REALTIME_EVENTS, supabase } from "../logic/realtime";
import type {
  JobId,
  PlanUsage,
  PracticeSettings,
  SharePayload,
  TimelinePracticeConfig,
  Timeline,
  VideoSyncPoint,
} from "../types";

type PlannerContentState = {
  team: JobId[];
  usages: PlanUsage[];
  expandedJobs: JobId[];
  cardOnlyJobs: JobId[];
  practice: PracticeSettings;
  practiceSelectedJobId: JobId | null;
  needsRemoteSave: boolean;
  lastRemoteSavedAt: string | null;
};

type PersistedStore = {
  timelineId?: string;
  importedTimeline?: Timeline | null;
  plansByTimeline?: Record<string, Partial<PlannerContentState>>;
  practiceDefaultsByTimeline?: Record<string, TimelinePracticeConfig>;
  team?: JobId[];
  usages?: PlanUsage[];
  expandedJobs?: JobId[];
  cardOnlyJobs?: JobId[];
};

type Store = {
  timelineId: string;
  importedTimeline: Timeline | null;
  plansByTimeline: Record<string, PlannerContentState>;
  practiceDefaultsByTimeline: Record<string, TimelinePracticeConfig>;
  team: JobId[];
  usages: PlanUsage[];
  expandedJobs: JobId[];
  cardOnlyJobs: JobId[];

  setTimeline(id: string): void;
  setImportedTimeline: (tl: Timeline | null) => void;
  setTeam(team: JobId[]): void;
  addJob(jobId: JobId): void;
  removeJob(jobId: JobId): void;
  toggleJob(jobId: JobId): void;
  toggleJobExpand(jobId: JobId): void;
  toggleJobCardOnly(jobId: JobId): void;

  addUsage(jobId: JobId, skillId: string, t_sec: number, lineIndex: number, stacks?: number): void;
  updateUsageStacks(jobId: JobId, skillId: string, t_sec: number, lineIndex: number, stacks: number): void;
  removeUsage(jobId: JobId, skillId: string, t_sec: number, lineIndex: number): void;
  clearUsages(): void;

  removeUsageForSkill(jobId: JobId, skillId: string): void;
  setPracticeConfig(practice: TimelinePracticeConfig): void;
  setPracticeYoutubeUrl(youtubeUrl: string): void;
  replacePracticeSyncPoints(syncPoints: VideoSyncPoint[]): void;
  setPracticeSelectedJob(jobId: JobId | null): void;

  applySharePayload(payload: SharePayload): void;
  applyPersistedSharedState(payload: SharePayload, updatedAt?: string | null): void;
  markTimelineSaved(timelineId?: string, updatedAt?: string | null): void;
  applyExternalUsage(event: string, payload: unknown, timelineId?: string): void;

  requestState(timelineId?: string): void;
  broadcastCurrentState(timelineId?: string): void;
  resetTimelineState(timelineId: string): void;
};

type TimelineScopedStoreState = Pick<
  Store,
  "timelineId" | "plansByTimeline" | "team" | "usages" | "expandedJobs"
  | "cardOnlyJobs"
>;

const FALLBACK_STORAGE: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function normalizeTimelineId(timelineId?: string | null) {
  return timelineId?.trim() || DEFAULT_TIMELINE_ID;
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

function normalizeSyncPoints(syncPoints?: readonly VideoSyncPoint[]) {
  const byTimelineSecond = new Map<number, VideoSyncPoint>();

  for (const point of syncPoints ?? []) {
    if (!Number.isFinite(point.t_sec) || !Number.isFinite(point.video_sec)) {
      continue;
    }

    const t_sec = Math.max(0, Math.floor(point.t_sec));
    const video_sec = Math.max(0, Math.floor(point.video_sec));
    byTimelineSecond.set(t_sec, { t_sec, video_sec });
  }

  return Array.from(byTimelineSecond.values()).sort(
    (a, b) => a.t_sec - b.t_sec || a.video_sec - b.video_sec
  );
}

function normalizePracticeSettings(
  settings?: Partial<PracticeSettings> | null
): PracticeSettings {
  return {
    youtubeUrl: settings?.youtubeUrl?.trim() ?? "",
    syncPoints: normalizeSyncPoints(settings?.syncPoints),
    selectedJobId:
      typeof settings?.selectedJobId === "string" && settings.selectedJobId.trim()
        ? settings.selectedJobId
        : null,
  };
}

function syncPracticeSelection(
  team: readonly JobId[],
  practice?: Partial<PracticeSettings> | null
) {
  const normalizedPractice = normalizePracticeSettings(practice);
  if (normalizedPractice.selectedJobId && team.includes(normalizedPractice.selectedJobId)) {
    return normalizedPractice;
  }

  return {
    ...normalizedPractice,
    selectedJobId: team[0] ?? null,
  } satisfies PracticeSettings;
}

function toTimelinePracticeConfig(practice: PracticeSettings): TimelinePracticeConfig {
  return {
    youtubeUrl: practice.youtubeUrl,
    syncPoints: practice.syncPoints,
  };
}

function normalizeTimelinePracticeConfig(
  practice?: Partial<TimelinePracticeConfig> | null
): TimelinePracticeConfig {
  return {
    youtubeUrl: practice?.youtubeUrl?.trim() ?? "",
    syncPoints: normalizeSyncPoints(practice?.syncPoints),
  };
}

function hasTimelinePracticeConfig(
  practice?: Partial<TimelinePracticeConfig> | null
) {
  return Boolean(practice?.youtubeUrl?.trim() || practice?.syncPoints?.length);
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
      base?.practice.selectedJobId,
  });

  return {
    team,
    usages: sortUsages(merged.usages ?? []),
    expandedJobs: normalizeExpandedJobs(merged.expandedJobs),
    cardOnlyJobs: normalizeCardOnlyJobs(merged.cardOnlyJobs).filter((jobId) =>
      team.includes(jobId)
    ),
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
    expandedJobs: normalizedContentState.expandedJobs,
    cardOnlyJobs: normalizedContentState.cardOnlyJobs,
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
    expandedJobs: currentContentState.expandedJobs,
    cardOnlyJobs: currentContentState.cardOnlyJobs,
  };
}

function withRemoteSaveQueued(contentState: PlannerContentState) {
  return {
    ...contentState,
    needsRemoteSave: true,
  } satisfies PlannerContentState;
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

function mergePersistedState(
  persistedState: PersistedStore | undefined,
  currentState: Store
) {
  if (!persistedState) return currentState;

  const migratedPlans: Record<string, PlannerContentState> = {};

  for (const [timelineId, contentState] of Object.entries(
    persistedState.plansByTimeline ?? {}
  )) {
    migratedPlans[normalizeTimelineId(timelineId)] = normalizeContentState(contentState);
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
    persistedState.cardOnlyJobs !== undefined
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
    importedTimeline: persistedState.importedTimeline ?? currentState.importedTimeline,
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
    expandedJobs: activeContentState.expandedJobs,
    cardOnlyJobs: activeContentState.cardOnlyJobs,
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
      expandedJobs: [],
      cardOnlyJobs: [],

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
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          }));
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
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          }));
        }),

      removeJob: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextTeam = contentState.team.filter((memberId) => memberId !== jobId);
          broadcast(REALTIME_EVENTS.TEAM_UPDATED, nextTeam, timelineId);
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          }));
        }),

      toggleJob: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextTeam = contentState.team.includes(jobId)
            ? contentState.team.filter((memberId) => memberId !== jobId)
            : normalizeTeam([...contentState.team, jobId]);
          broadcast(REALTIME_EVENTS.TEAM_UPDATED, nextTeam, timelineId);
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            team: nextTeam,
            practice: syncPracticeSelection(nextTeam, contentState.practice),
          }));
        }),

      toggleJobExpand: (jobId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextExpandedJobs = contentState.expandedJobs.includes(jobId)
            ? contentState.expandedJobs.filter((expandedJobId) => expandedJobId !== jobId)
            : [...contentState.expandedJobs, jobId];
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            expandedJobs: nextExpandedJobs,
          }));
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

          return updateTimelineState(state, timelineId, {
            ...contentState,
            cardOnlyJobs: nextCardOnlyJobs,
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

          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            usages: [...others, newUsage],
          }));
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
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            usages: contentState.usages.map((usage) =>
              usage.jobId === jobId &&
              usage.skillId === skillId &&
              usage.t_sec === t_sec &&
              usage.lineIndex === lineIndex
                ? { ...usage, stacks }
                : usage
            ),
          }));
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
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
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
          }));
        }),

      clearUsages: () =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          broadcast(REALTIME_EVENTS.CLEAR_ALL, {}, timelineId);
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            usages: [],
          }));
        }),

      removeUsageForSkill: (jobId, skillId) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          return updateTimelineState(state, timelineId, withRemoteSaveQueued({
            ...contentState,
            usages: contentState.usages.filter(
              (usage) => !(usage.jobId === jobId && usage.skillId === skillId)
            ),
          }));
        }),

      setPracticeConfig: (practice) =>
        set((state) => {
          const timelineId = normalizeTimelineId(state.timelineId);
          const contentState = getContentState(state.plansByTimeline, timelineId);
          const nextPractice = syncPracticeSelection(contentState.team, {
            ...contentState.practice,
            youtubeUrl: practice.youtubeUrl,
            syncPoints: practice.syncPoints,
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
            ...updateTimelineState(state, timelineId, withRemoteSaveQueued({
              ...contentState,
              practice: nextPractice,
            })),
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
            ...updateTimelineState(state, timelineId, withRemoteSaveQueued({
              ...contentState,
              practice: nextPractice,
            })),
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
            ...updateTimelineState(state, timelineId, withRemoteSaveQueued({
              ...contentState,
              practice: nextPractice,
            })),
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
          return updateTimelineState(state, timelineId, {
            ...contentState,
            practice: syncPracticeSelection(contentState.team, {
              ...contentState.practice,
              selectedJobId: jobId,
            }),
            practiceSelectedJobId: jobId,
          });
        }),

      applySharePayload: (payload) => {
        const timelineId = normalizeTimelineId(payload.timelineId ?? get().timelineId);
        set((state) => ({
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
                expandedJobs: payload.expandedJobs,
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
        }));
      },

      applyPersistedSharedState: (payload, updatedAt) => {
        const timelineId = normalizeTimelineId(payload.timelineId ?? get().timelineId);
        set((state) => ({
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
                expandedJobs: payload.expandedJobs,
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
        }));
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
                expandedJobs: syncedPayload.expandedJobs ?? contentState.expandedJobs,
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
            expandedJobs: contentState.expandedJobs,
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
      merge: (persistedState, currentState) =>
        mergePersistedState(
          persistedState as PersistedStore | undefined,
          currentState
        ),
    }
  )
);
