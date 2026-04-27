import { useState, useMemo } from "react";
import type { Timeline } from "../types";
import { secondsInPhase } from "../logic/timelineView";

export default function PhaseTabs({
  tl,
  onPhaseSeconds,
}: {
  tl: Timeline;
  onPhaseSeconds: (secs: number[], phaseId?: string) => void;
}) {
  const [active, setActive] = useState<string | undefined>(undefined);

  const allSecs = useMemo(() => secondsInPhase(tl, undefined), [tl]);
  const map = useMemo(() => {
    const o: Record<string, number[]> = {};
    for (const p of tl.phases) o[p.id] = secondsInPhase(tl, p.id);
    return o;
  }, [tl]);

  function set(id?: string) {
    setActive(id);
    onPhaseSeconds(id ? map[id] : allSecs, id);
  }

  return (
    <div className="flex gap-2">
      <button
        className={`phase-chip ${!active ? "phase-chip--active" : ""}`}
        onClick={() => set(undefined)}
      >
        All
      </button>

      {tl.phases.length > 1 &&
        tl.phases.map((p) => (
          <button
            key={p.id}
            className={`phase-chip ${
              active === p.id ? "phase-chip--active" : ""
            }`}
            onClick={() => set(p.id)}
            title={p.title}
          >
            {p.id}
          </button>
        ))}
    </div>
  );
}
