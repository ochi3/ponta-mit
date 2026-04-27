import { JOBS } from "../data/jobs/jobs.registry";
import { getJobIcon } from "../data/jobs/jobIcons";
import type { JobId, ThemeMode } from "../types";

type Props = {
  theme: ThemeMode;
  team: JobId[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  onClose: () => void;
  onSelect: (jobId: JobId) => void;
};

function getJobLabel(jobId: JobId) {
  return JOBS.find((job) => job.id === jobId)?.name ?? jobId;
}

export default function PracticeJobSelectDialog({
  theme,
  team,
  title = "ジョブを選択",
  description = "動画モードで表示したいジョブを選んでください。",
  emptyMessage = "先にPTへジョブを追加してください。",
  onClose,
  onSelect,
}: Props) {
  const isLight = theme === "light";
  const overlayClass = isLight
    ? "bg-slate-900/35 backdrop-blur-sm"
    : "bg-black/55 backdrop-blur-sm";
  const panelClass = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-slate-800 bg-slate-950 text-slate-100";
  const buttonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900";
  const hintClass = isLight ? "text-slate-500" : "text-slate-400";

  return (
    <div className={`fixed inset-0 z-[120] flex items-center justify-center px-4 ${overlayClass}`}>
      <div className={`w-full max-w-xl rounded-2xl p-5 shadow-2xl ${panelClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className={`mt-1 text-sm ${hintClass}`}>{description}</p>
          </div>
          <button type="button" onClick={onClose} className={buttonClass}>
            閉じる
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {team.length === 0 && (
            <p className={`text-sm ${hintClass}`}>{emptyMessage}</p>
          )}
          {team.map((jobId) => {
            const icon = getJobIcon(jobId);
            const label = getJobLabel(jobId);

            return (
              <button
                key={jobId}
                type="button"
                onClick={() => onSelect(jobId)}
                className="job-button h-auto w-auto rounded-xl border border-transparent px-3 py-3 transition hover:scale-[1.02] hover:border-sky-500"
                title={label}
              >
                <div className="flex flex-col items-center gap-2">
                  {icon ? (
                    <img src={icon} alt={label} className="h-10 w-10" draggable={false} />
                  ) : (
                    <span className="text-xs">{label}</span>
                  )}
                  <span className="text-xs font-medium">{label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
