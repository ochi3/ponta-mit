import { useEffect, useMemo, useState } from "react";
import MitigationPlannerPage from "./pages/MitigationPlannerPage";
import { useStore } from "./state/store";
import type { Timeline } from "./types";
import {
  DEFAULT_TIMELINE_ID,
  loadBuiltinTimeline,
} from "./data/timelines/registry";

export default function App() {
  const timelineId = useStore((s) => s.timelineId);
  const importedTimeline = useStore((s) => s.importedTimeline);
  const [builtinTimeline, setBuiltinTimeline] = useState<Timeline | null>(null);

  const activeTimelineId = timelineId || DEFAULT_TIMELINE_ID;
  const importedSelectedTimeline = useMemo(() => {
    if (importedTimeline && importedTimeline.id === activeTimelineId) {
      return importedTimeline;
    }
    return null;
  }, [activeTimelineId, importedTimeline]);

  useEffect(() => {
    if (importedSelectedTimeline) {
      return;
    }
    if (builtinTimeline?.id === activeTimelineId) {
      return;
    }

    let cancelled = false;
    setBuiltinTimeline(null);

    void loadBuiltinTimeline(activeTimelineId).then((timeline) => {
      if (cancelled || !timeline) {
        return;
      }
      setBuiltinTimeline(timeline);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTimelineId, builtinTimeline?.id, importedSelectedTimeline]);

  const tl = importedSelectedTimeline ?? builtinTimeline;

  if (!tl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Loading timeline...
      </div>
    );
  }

  return <MitigationPlannerPage tl={tl} />;
}
