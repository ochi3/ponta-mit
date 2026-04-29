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
        .map((job) => {
          const selected = team.includes(job.id);
          const icon = getJobIcon(job.id);

          return (
            <button
              key={job.id}
              onClick={() => toggle(job.id)}
              className={`job-button rounded-full border border-transparent transition ${
                selected ? "job-button-selected" : "job-button-unselected"
              }`}
              title={job.name}
            >
              {icon ? (
                <img
                  src={icon}
                  alt={job.name}
                  className="h-10 w-10"
                  draggable={false}
                />
              ) : (
                <span className="text-xs">{job.name}</span>
              )}
            </button>
          );
        })}
    </div>
  );
}
