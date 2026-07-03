import type { Timeline } from "../types";
import { resolvePhaseScrollSec } from "../logic/timelineView";

export default function PhaseTabs({
  tl,
  activePhaseId,
  onPhaseNavigate,
}: {
  tl: Timeline;
  activePhaseId: string | null;
  onPhaseNavigate: (phaseId?: string, scrollSec?: number) => void;
}) {
  function select(phaseId?: string) {
    onPhaseNavigate(phaseId, resolvePhaseScrollSec(tl, phaseId));
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        className={`phase-chip ${!activePhaseId ? "phase-chip--active" : ""}`}
        onClick={() => select(undefined)}
      >
        All
      </button>

      {tl.phases.length > 1 &&
        tl.phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            className={`phase-chip ${activePhaseId === phase.id ? "phase-chip--active" : ""}`}
            onClick={() => select(phase.id)}
            title={phase.title}
          >
            {phase.id}
          </button>
        ))}
    </div>
  );
}
