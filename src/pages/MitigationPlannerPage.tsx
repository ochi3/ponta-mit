import { useEffect, useRef, useState } from "react";
import type { Timeline } from "../types";
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

export default function MitigationPlannerPage({ tl }: { tl: Timeline }) {
  const [seconds, setSeconds] = useState<number[]>(
    () => secondsInPhase(tl, undefined)
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const team = useStore((s) => s.team);
  const usages = useStore((s) => s.usages);
  const expandedJobs = useStore((s) => s.expandedJobs);
  const importedTimeline = useStore((s) => s.importedTimeline);
  const needsRemoteSave = useStore(
    (s) => s.plansByTimeline[tl.id]?.needsRemoteSave ?? false
  );
  const setTimeline = useStore((s) => s.setTimeline);
  const setImportedTimeline = useStore((s) => s.setImportedTimeline);
  const applySharePayload = useStore((s) => s.applySharePayload);
  const applyPersistedSharedState = useStore((s) => s.applyPersistedSharedState);
  const applyExternalUsage = useStore((s) => s.applyExternalUsage);
  const markTimelineSaved = useStore((s) => s.markTimelineSaved);
  const shareFromUrlApplied = useRef(false);

  /** Resets visible seconds when switching timelines. */
  useEffect(() => {
    setSeconds(secondsInPhase(tl, undefined));
  }, [tl.id]);

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

  /** After persist rehydration, apply `?plan=` so URL wins over localStorage. */
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
      }
    }

    void loadSharedPlan();

    return () => {
      cancelled = true;
    };
  }, [applyPersistedSharedState, setImportedTimeline, tl.id]);

  /** Supabase Realtime subscription */
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
  }, [applyExternalUsage, tl.id]);

  useEffect(() => {
    if (!supabase) return;
    if (!needsRemoteSave) return;
    if (typeof window !== "undefined" && !window.navigator.onLine) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const updatedAt = await saveSharedPlanSnapshot({
            roomId: getRoomId(),
            timelineId: tl.id,
            payload: {
              v: 1,
              team,
              usages,
              timelineId: tl.id,
              expandedJobs: expandedJobs.length ? expandedJobs : undefined,
            },
            importedTimeline,
          });

          if (!cancelled) {
            markTimelineSaved(tl.id, updatedAt);
          }
        } catch (error) {
          console.error("Failed to save shared plan snapshot", error);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    expandedJobs,
    importedTimeline,
    markTimelineSaved,
    needsRemoteSave,
    team,
    tl.id,
    usages,
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

  return (
    <div className={`min-h-screen flex flex-col ${theme === "light" ? "bg-#f2f2f2;" : "bg-slate-950"}`}>
      <main className="flex-1 py-4">
        <div className="w-full">
          <div className="w-full px-2 mp-shell">
            <TopBar
              tl={tl}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              onPhaseSeconds={handlePhaseSeconds}
            />
            <ValidationPanel />
          </div>
        </div>

        <TimelineGrid tl={tl} seconds={seconds} />
      </main>
    </div>
  );
}
