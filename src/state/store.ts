import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { DEFAULT_TIMELINE_ID } from "../data/timelines/registry";
import { normalizeTeam } from "../config/jobPriority";
import { getRealtimeChannelName, getRoomId, REALTIME_EVENTS, supabase } from "../logic/realtime";
import type { JobId, PlanUsage, SharePayload, Timeline } from "../types";

type PlannerContentState = {
  team: JobId[];
  usages: PlanUsage[];
  expandedJobs: JobId[];
  needsRemoteSave: boolean;
  lastRemoteSavedAt: string | null;
};

type PersistedStore = {
  timelineId?: string;
  importedTimeline?: Timeline | null;
  plansByTimeline?: Record<string, Partial<PlannerContentState>>;
  team?: JobId[];
  usages?: PlanUsage[];
  expandedJobs?: JobId[];
};

type Store = {
  timelineId: string;
  importedTimeline: Timeline | null;
  plansByTimeline: Record<string, PlannerContentState>;
  team: JobId[];
  usages: PlanUsage[];
  expandedJobs: JobId[];

  setTimeline(id: string): void;
  setImportedTimeline: (tl: Timeline | null) => void;
  setTeam(team: JobId[]): void;
  addJob(jobId: JobId): void;
  removeJob(jobId: JobId): void;
  toggleJob(jobId: JobId): void;
  toggleJobExpand(jobId: JobId): void;

  addUsage(jobId: JobId, skillId: string, t_sec: number, lineIndex: number, stacks?: number): void;
  updateUsageStacks(jobId: JobId, skillId: string, t_sec: number, lineIndex: number, stacks: number): void;
  removeUsage(jobId: JobId, skillId: string, t_sec: number, lineIndex: number): void;
  clearUsages(): void;

  removeUsageForSkill(jobId: JobId, skillId: string): void;

  applySharePayload(payload: SharePayload): void;
  applyPersistedSharedState(payload: SharePayload, updatedAt?: string | null): void;
  markTimelineSaved(timelineId?: string, updatedAt?: string | null): void;
  applyExternalUsage(event: string, payload: unknown, timelineId?: string): void;

  requestState(timelineId?: string): void;
  broadcastCurrentState(timelineId?: string): void;
};

type TimelineScopedStoreState = Pick<
  Store,
  "timelineId" | "plansByTimeline" | "team" | "usages" | "expandedJobs"
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

function normalizeContentState(
  state?: Partial<PlannerContentState> | null,
  base?: PlannerContentState
): PlannerContentState {
  const merged = { ...base, ...state };

  return {
    team: normalizeTeam(merged.team ?? []),
    usages: sortUsages(merged.usages ?? []),
    expandedJobs: normalizeExpandedJobs(merged.expandedJobs),
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

  if (
    persistedState.team !== undefined ||
    persistedState.usages !== undefined ||
    persistedState.expandedJobs !== undefined
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
  } satisfies Store;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      timelineId: DEFAULT_TIMELINE_ID,
      importedTimeline: null,
      plansByTimeline: {
        [DEFAULT_TIMELINE_ID]: normalizeContentState(),
      },
      team: [],
      usages: [],
      expandedJobs: [],

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

      applySharePayload: (payload) => {
        const timelineId = normalizeTimelineId(payload.timelineId ?? get().timelineId);
        set((state) => ({
          importedTimeline: null,
          ...activateTimelineState(
            {
              ...state,
              ...updateTimelineState(state, timelineId, {
                team: payload.team,
                usages: payload.usages,
                expandedJobs: payload.expandedJobs,
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
          ...activateTimelineState(
            {
              ...state,
              ...updateTimelineState(state, timelineId, {
                team: payload.team,
                usages: payload.usages,
                expandedJobs: payload.expandedJobs,
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
            return updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
              ...contentState,
              team: syncedPayload.team ?? contentState.team,
              usages: syncedPayload.usages ?? contentState.usages,
              expandedJobs: syncedPayload.expandedJobs ?? contentState.expandedJobs,
            }));
          }

          if (event === REALTIME_EVENTS.TEAM_UPDATED) {
            return updateTimelineState(state, resolvedTimelineId, withRemoteSaveQueued({
              ...contentState,
              team: payload as JobId[],
            }));
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
          },
          resolvedTimelineId
        );
      },
    }),
    {
      name: "mp-planner-state",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : FALLBACK_STORAGE
      ),
      partialize: (state) => ({
        timelineId: state.timelineId,
        importedTimeline: state.importedTimeline ?? undefined,
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
