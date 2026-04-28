import { useMemo } from "react";
import { JOBS } from "../data/jobs/jobs.registry";
import { getJobIcon } from "../data/jobs/jobIcons";
import { hasSecondarySkills } from "../data/skills";
import { getSkillIcon } from "../data/skills/icon.skills";
import {
  getPracticeSkillSnapshot,
  getPracticeSkillsForJob,
} from "../logic/practiceIconMode";
import { useStore } from "../state/store";
import type { JobId, ThemeMode } from "../types";

type Props = {
  theme: ThemeMode;
  primaryJobId: JobId | null;
  extraJobIds: JobId[];
  currentTimelineSec: number | null;
  canAddJobs: boolean;
  onAddJob: () => void;
  onRemoveJob: (jobId: JobId) => void;
};

function fallbackSkillLabel(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1))
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function getJobLabel(jobId: JobId) {
  return JOBS.find((entry) => entry.id === jobId)?.name ?? jobId;
}

export default function SkillIconPanel({
  theme,
  primaryJobId,
  extraJobIds,
  currentTimelineSec,
  canAddJobs,
  onAddJob,
  onRemoveJob,
}: Props) {
  const usages = useStore((state) => state.usages);
  const expandedJobs = useStore((state) => state.expandedJobs);
  const toggleJobExpand = useStore((state) => state.toggleJobExpand);
  const isLight = theme === "light";
  const jobIds = useMemo(
    () =>
      primaryJobId
        ? [primaryJobId, ...extraJobIds.filter((jobId) => jobId !== primaryJobId)]
        : extraJobIds,
    [extraJobIds, primaryJobId]
  );

  const jobSections = useMemo(
    () =>
      jobIds.map((jobId) => ({
        jobId,
        jobName: getJobLabel(jobId),
        jobIcon: getJobIcon(jobId),
        hasSecondary: hasSecondarySkills(jobId),
        personalEnabled: expandedJobs.includes(jobId),
        snapshots: getPracticeSkillsForJob(jobId, usages, expandedJobs).map((skill) =>
          getPracticeSkillSnapshot(jobId, skill, usages, currentTimelineSec)
        ),
      })),
    [currentTimelineSec, expandedJobs, jobIds, usages]
  );

  const panelClass = isLight
    ? "rounded-2xl border border-slate-200 bg-white/90 shadow-sm"
    : "rounded-2xl border border-slate-800 bg-slate-950/90 shadow-[0_20px_50px_rgba(2,6,23,0.35)]";
  const subtleTextClass = isLight ? "text-slate-500" : "text-slate-400";
  const titleClass = isLight ? "text-slate-900" : "text-slate-100";
  const sectionClass = isLight
    ? "rounded-2xl border border-slate-200 bg-slate-50/80"
    : "rounded-2xl border border-slate-800 bg-slate-900/55";
  const activeToggleClass = isLight
    ? "rounded-lg border border-sky-500 bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900"
    : "rounded-lg border border-sky-500 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100";
  const inactiveToggleClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-sky-500 hover:bg-slate-900";
  const addButtonClass = isLight
    ? "flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm font-semibold text-slate-700 hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45"
    : "flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 px-4 py-4 text-sm font-semibold text-slate-200 hover:border-sky-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <section className={`${panelClass} mp-practice-aside-content inline-block max-w-full p-4 align-top`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-semibold ${titleClass}`}>アイコン</div>
          <div className={`mt-1 text-xs ${subtleTextClass}`}></div>
        </div>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-lg px-2 py-2 text-xs font-semibold ${inactiveToggleClass}`}
          onClick={onAddJob}
          disabled={!canAddJobs}
        >
          + ジョブ追加
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {jobSections.map(({ jobId, jobName, jobIcon, hasSecondary, personalEnabled, snapshots }) => (
          <div key={jobId} className={`${sectionClass} p-4`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={jobIcon}
                  alt={jobName}
                  className="size-6 flex-shrink-0 rounded"
                  loading="lazy"
                />
                <span className={`text-sm font-semibold truncate ${titleClass}`}>
                  {jobName}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasSecondary && (
                  <button
                    type="button"
                    className={personalEnabled ? activeToggleClass : inactiveToggleClass}
                    onClick={() => toggleJobExpand(jobId)}
                  >
                    サブ
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-red-400 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-red-500 dark:hover:bg-red-500/15"
                  onClick={() => onRemoveJob(jobId)}
                >
                  削除
                </button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {snapshots.map((snapshot) => {
                const { skill, status } = snapshot;
                const skillIcon = getSkillIcon(skill.id);
                const label = fallbackSkillLabel(skill.name);
                const bgClass = status === "cooldown"
                  ? isLight
                    ? "bg-slate-200"
                    : "bg-slate-700"
                  : status === "active"
                    ? isLight
                      ? "bg-sky-200"
                      : "bg-sky-500/30"
                    : isLight
                      ? "bg-slate-100"
                      : "bg-slate-800";
                const textClass = status === "cooldown"
                  ? isLight
                    ? "text-slate-600"
                    : "text-slate-300"
                  : status === "active"
                    ? isLight
                      ? "text-sky-900"
                      : "text-sky-100"
                    : isLight
                      ? "text-slate-700"
                      : "text-slate-200";

                return (
                  <div
                    key={`${jobId}-${skill.id}`}
                    className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-colors ${bgClass}`}
                    title={skill.name}
                  >
                    <img
                      src={skillIcon}
                      alt={skill.name}
                      className="size-8 rounded"
                      loading="lazy"
                    />
                    <div
                      className={`text-center text-xs font-semibold line-clamp-2 ${textClass}`}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {jobIds.length === 0 && (
        <button
          type="button"
          className={addButtonClass}
          onClick={onAddJob}
          disabled={!canAddJobs}
        >
          ジョブを追加
        </button>
      )}
    </section>
  );
}
