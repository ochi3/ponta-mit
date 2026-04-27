import { useStore } from "../state/store";
import { JOBS } from "../data/jobs/jobs.registry";
import { jobCmp } from "../config/jobPriority";
import { getJobIcon } from "../data/jobs/jobIcons";

export default function TeamPicker() {
  const team = useStore((s) => s.team);
  const toggle = useStore((s) => s.toggleJob);

  return (
    <div className="flex flex-wrap gap-2">
      {JOBS.slice()
        .sort((a, b) => jobCmp(a.id, b.id))
        .map((j) => {
          const jobName = j.name;
          const selected = team.includes(j.id);
          const icon = getJobIcon(j.id);

          return (
            <button
              key={j.id}
              onClick={() => toggle(j.id)}
              className={`job-button rounded-full border border-transparent transition
                ${selected ? "job-button-selected" : "job-button-unselected"}`}
              title={jobName}
            >
              {icon ? (
                <img
                  src={icon}
                  alt={j.name}
                  className="w-10 h-10"
                  draggable={false}
                />
              ) : (
                <span className="text-xs">{jobName}</span>
              )}
            </button>
          );
        })}
    </div>
  );
}
