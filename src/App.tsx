import { useEffect, useMemo, useState } from "react";
import MitigationPlannerPage from "./pages/MitigationPlannerPage";
import { useStore } from "./state/store";
import type { Timeline } from "./types";
import {
  DEFAULT_TIMELINE_ID,
  isBuiltinTimelineId,
  loadBuiltinTimeline,
  resolveTimelineId,
} from "./data/timelines/registry";

export default function App() {
  const timelineId = useStore((s) => s.timelineId);
  const importedTimeline = useStore((s) => s.importedTimeline);
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

    void loadBuiltinTimeline(activeTimelineId).then((timeline) => {
      if (cancelled) {
        return;
      }
      setBuiltinTimeline(timeline ?? null);
      setBuiltinLoadState(timeline ? "idle" : "missing");
    });

    return () => {
      cancelled = true;
    };
  }, [activeTimelineId, importedSelectedTimeline, builtinTimeline?.id]);

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
        {showLoading
          ? "タイムラインを読み込み中…"
          : `タイムライン「${activeTimelineId}」を読み込めませんでした。別のコンテンツを選ぶか、localStorage をリセットしてください。`}
      </div>
    );
  }

  return <MitigationPlannerPage tl={tl} />;
}
