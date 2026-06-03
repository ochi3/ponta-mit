import { useState } from "react";
import type { Timeline } from "../types";
import { resolvePhaseScrollSec } from "../logic/timelineView";

export default function PhaseTabs({
  tl,
  onPhaseNavigate,
}: {
  tl: Timeline;
  onPhaseNavigate: (phaseId?: string, scrollSec?: number) => void;
}) {
  const [active, setActive] = useState<string | undefined>(undefined);

  function select(phaseId?: string) {
    setActive(phaseId);
    onPhaseNavigate(phaseId, resolvePhaseScrollSec(tl, phaseId));
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={`phase-chip ${!active ? "phase-chip--active" : ""}`}
        onClick={() => select(undefined)}
      >
        All
      </button>

      {tl.phases.length > 1 &&
        tl.phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            className={`phase-chip ${active === phase.id ? "phase-chip--active" : ""}`}
            onClick={() => select(phase.id)}
            title={phase.title}
          >
            {phase.id}
          </button>
        ))}
    </div>
  );
}
