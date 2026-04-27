import { useMemo } from "react";
import MitigationPlannerPage from "./pages/MitigationPlannerPage";
import { useStore } from "./state/store";
import { BUILTIN_TIMELINES, DEFAULT_TIMELINE_ID } from "./data/timelines/registry";
import { FRU } from "./data/timelines/fru";

export default function App() {
  const timelineId = useStore((s) => s.timelineId);
  const importedTimeline = useStore((s) => s.importedTimeline);

  const tl = useMemo(() => {
    const id = timelineId || DEFAULT_TIMELINE_ID;
    if (importedTimeline && importedTimeline.id === id) {
      return importedTimeline;
    }
    return BUILTIN_TIMELINES[id] ?? FRU;
  }, [timelineId, importedTimeline]);

  return <MitigationPlannerPage tl={tl} />;
}
