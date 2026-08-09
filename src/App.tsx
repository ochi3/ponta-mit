import { useCallback, useEffect, useMemo, useState } from "react";
import MitigationPlannerPage from "./pages/MitigationPlannerPage";
import ActivityRecordPage from "./pages/ActivityRecordPage";
import DmuExaflarePage from "./pages/DmuExaflarePage";
import { PLANNER_STORAGE_KEY, useStore } from "./state/store";
import type { Timeline } from "./types";
import {
  DEFAULT_TIMELINE_ID,
  isBuiltinTimelineId,
  loadBuiltinTimeline,
  resolveTimelineId,
} from "./data/timelines/registry";
import { getCurrentAppView, type AppView } from "./logic/appRoute";

function PlannerApp() {
  const timelineId = useStore((s) => s.timelineId);
  const importedTimeline = useStore((s) => s.importedTimeline);
  const setTimeline = useStore((s) => s.setTimeline);
  const setImportedTimeline = useStore((s) => s.setImportedTimeline);
  const [builtinTimeline, setBuiltinTimeline] = useState<Timeline | null>(null);
  const [builtinLoadState, setBuiltinLoadState] = useState<
    "idle" | "loading" | "missing"
  >("idle");

  const activeTimelineId = resolveTimelineId(timelineId || DEFAULT_TIMELINE_ID);
  const importedSelectedTimeline = useMemo(() => {
    if (importedTimeline && importedTimeline.id === activeTimelineId) {
      return importedTimeline;
    }
    return null;
  }, [activeTimelineId, importedTimeline]);

  const resolvedBuiltinTimeline = useMemo(() => {
    if (builtinTimeline?.id === activeTimelineId) {
      return builtinTimeline;
    }
    return null;
  }, [activeTimelineId, builtinTimeline]);

  const resetPlannerStorage = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PLANNER_STORAGE_KEY);
    }
    setImportedTimeline(null);
    setTimeline(DEFAULT_TIMELINE_ID);
    window.location.reload();
  }, [setImportedTimeline, setTimeline]);

  useEffect(() => {
    if (importedSelectedTimeline) {
      setBuiltinLoadState("idle");
      return;
    }
    if (builtinTimeline?.id === activeTimelineId) {
      setBuiltinLoadState("idle");
      return;
    }

    let cancelled = false;
    setBuiltinLoadState(
      isBuiltinTimelineId(activeTimelineId) ? "loading" : "missing"
    );

    void loadBuiltinTimeline(activeTimelineId)
      .then((timeline) => {
        if (cancelled) {
          return;
        }
        setBuiltinTimeline(timeline ?? null);
        setBuiltinLoadState(timeline ? "idle" : "missing");
      })
      .catch((error) => {
        console.error("[App] タイムラインの読み込みに失敗しました:", error);
        if (!cancelled) {
          setBuiltinLoadState("missing");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTimelineId, importedSelectedTimeline, builtinTimeline?.id]);

  useEffect(() => {
    if (builtinLoadState !== "missing" || importedSelectedTimeline) {
      return;
    }
    if (activeTimelineId === DEFAULT_TIMELINE_ID) {
      return;
    }

    setImportedTimeline(null);
    setTimeline(DEFAULT_TIMELINE_ID);
  }, [
    activeTimelineId,
    builtinLoadState,
    importedSelectedTimeline,
    setImportedTimeline,
    setTimeline,
  ]);

  const tl = importedSelectedTimeline ?? resolvedBuiltinTimeline;

  if (!tl) {
    const isSwitchingBuiltin =
      !importedSelectedTimeline &&
      builtinTimeline !== null &&
      builtinTimeline.id !== activeTimelineId;
    const showLoading =
      builtinLoadState === "loading" ||
      isSwitchingBuiltin ||
      (builtinLoadState !== "missing" && isBuiltinTimelineId(activeTimelineId));

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-sm text-slate-300">
        {showLoading ? (
          "タイムラインを読み込み中…"
        ) : (
          <div className="max-w-md space-y-4">
            <p>
              タイムライン「{activeTimelineId}
              」を読み込めませんでした。保存データが消えているか、インポート済みコンテンツの情報が不足しています。
            </p>
            <button
              type="button"
              className="rounded-lg border border-sky-500 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25"
              onClick={resetPlannerStorage}
            >
              初期状態に戻す
            </button>
          </div>
        )}
      </div>
    );
  }

  return <MitigationPlannerPage tl={tl} />;
}

export default function App() {
  const [view, setView] = useState<AppView>(() => getCurrentAppView());

  useEffect(() => {
    const onHashChange = () => setView(getCurrentAppView());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (view === "activity") {
    return <ActivityRecordPage />;
  }

  if (view === "dmuExa") {
    return <DmuExaflarePage />;
  }

  return <PlannerApp />;
}
