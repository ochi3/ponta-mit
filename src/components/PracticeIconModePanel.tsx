import { useEffect, useMemo, useState } from "react";
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
import { isAstCardSkill } from "../logic/astCards";

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

export default function PracticeIconModePanel({
  theme,
  primaryJobId,
  extraJobIds,
  currentTimelineSec,
  canAddJobs,
  onAddJob,
  onRemoveJob,
}: Props) {
  const team = useStore((state) => state.team);
  const usages = useStore((state) => state.usages);
  const expandedJobs = useStore((state) => state.expandedJobs);
  const evolveJobs = useStore((state) => state.evolveJobs);
  const toggleJobExpand = useStore((state) => state.toggleJobExpand);
  const [cardOnlyJobIds, setCardOnlyJobIds] = useState<JobId[]>([]);
  const [addersgallOnlyJobIds, setAddersgallOnlyJobIds] = useState<JobId[]>([]);
  const isLight = theme === "light";
  const jobIds = useMemo(
    () =>
      primaryJobId
        ? [primaryJobId, ...extraJobIds.filter((jobId) => jobId !== primaryJobId)]
        : extraJobIds,
    [extraJobIds, primaryJobId]
  );

  useEffect(() => {
    setCardOnlyJobIds((prev) => prev.filter((jobId) => jobIds.includes(jobId)));
    setAddersgallOnlyJobIds((prev) => prev.filter((jobId) => jobIds.includes(jobId)));
  }, [jobIds]);

  const jobSections = useMemo(
    () =>
      jobIds.map((jobId) => {
        const skillMode = evolveJobs.includes(jobId) ? "evolve" : "normal";
        return {
          jobId,
          jobName: getJobLabel(jobId),
          jobIcon: getJobIcon(jobId),
          hasSecondary: hasSecondarySkills(jobId, skillMode),
          hasCards: jobId === "healer.ast",
          hasAddersgall: jobId === "healer.sge",
          personalEnabled: expandedJobs.includes(jobId),
          cardsOnlyEnabled: cardOnlyJobIds.includes(jobId),
          addersgallOnlyEnabled: addersgallOnlyJobIds.includes(jobId),
          snapshots: getPracticeSkillsForJob(jobId, usages, expandedJobs, {
            astCardMode: cardOnlyJobIds.includes(jobId)
              ? "only"
              : jobId === "healer.ast"
                ? "show"
                : "hide",
            addersgallOnlyMode: addersgallOnlyJobIds.includes(jobId)
              ? "only"
              : jobId === "healer.sge"
                ? "show"
                : "hide",
            includeAstDraws: false,
            skillMode,
            cardOnlyJobs: cardOnlyJobIds,
            addersgallOnlyJobs: addersgallOnlyJobIds,
            evolveJobs,
          }).map((skill) =>
            getPracticeSkillSnapshot(jobId, skill, usages, currentTimelineSec)
          ),
        };
      }),
    [addersgallOnlyJobIds, cardOnlyJobIds, currentTimelineSec, evolveJobs, expandedJobs, jobIds, usages]
  );

  const panelClass = isLight
    ? "rounded-2xl border border-slate-200 bg-white/90 shadow-sm"
    : "rounded-2xl border border-slate-800 bg-slate-950/90 shadow-[0_20px_50px_rgba(2,6,23,0.35)]";
  const subtleTextClass = isLight ? "text-slate-500" : "text-slate-400";
  const titleClass = isLight ? "text-slate-900" : "text-slate-100";
  const sectionClass = isLight
    ? "rounded-2xl border border-slate-200 bg-slate-50/80"
    : "rounded-2xl border border-slate-800 bg-slate-900/55";
  const actionButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-500 hover:bg-slate-900";
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
          <div className={`text-sm font-semibold ${titleClass}`}>アイコンモード</div>
          <div className={`mt-1 text-xs ${subtleTextClass}`}>
            選択したジョブを先頭に表示し、必要なら他PTメンバーのクールダウンも追加できます。
          </div>
        </div>
        <div className={`text-xs ${subtleTextClass}`}>PT {team.length}人</div>
      </div>

      <div className="mt-4 grid gap-4">
        {jobSections.length > 0 ? (
          jobSections.map((section, index) => (
            <div key={section.jobId} className={`${sectionClass} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {section.jobIcon ? (
                    <img
                      src={section.jobIcon}
                      alt={section.jobName}
                      className="h-11 w-11 rounded-xl border border-slate-700/60 bg-slate-900/70 p-1"
                    />
                  ) : (
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                        isLight
                          ? "border-slate-200 bg-slate-100 text-slate-500"
                          : "border-slate-800 bg-slate-900 text-slate-500"
                      }`}
                    >
                      ?
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className={`truncate text-sm font-semibold ${titleClass}`}>
                      {section.jobName}
                    </div>
                    <div className={`mt-1 text-xs ${subtleTextClass}`}>
                      {section.snapshots.length} スキル
                      {index === 0 ? " / メイン" : " / 追加"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {section.hasSecondary && (
                    <button
                      type="button"
                      onClick={() => toggleJobExpand(section.jobId)}
                      className={
                        section.personalEnabled ? activeToggleClass : inactiveToggleClass
                      }
                    >
                      {section.personalEnabled ? "個人 ON" : "個人 OFF"}
                    </button>
                  )}
                  {section.hasCards && (
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold ${subtleTextClass}`}>
                        占星カード
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCardOnlyJobIds((prev) =>
                            prev.includes(section.jobId)
                              ? prev.filter((jobId) => jobId !== section.jobId)
                              : [...prev, section.jobId]
                          );
                        }}
                        className={
                          section.cardsOnlyEnabled ? activeToggleClass : inactiveToggleClass
                        }
                      >
                        {section.cardsOnlyEnabled ? "カードのみ ON" : "カードのみ OFF"}
                      </button>
                    </div>
                  )}
                  {section.hasAddersgall && (
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold ${subtleTextClass}`}>
                        アダーガル
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setAddersgallOnlyJobIds((prev) =>
                            prev.includes(section.jobId)
                              ? prev.filter((jobId) => jobId !== section.jobId)
                              : [...prev, section.jobId]
                          );
                        }}
                        className={
                          section.addersgallOnlyEnabled
                            ? activeToggleClass
                            : inactiveToggleClass
                        }
                      >
                        {section.addersgallOnlyEnabled ? "アダ ON" : "アダ OFF"}
                      </button>
                    </div>
                  )}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => onRemoveJob(section.jobId)}
                      className={actionButtonClass}
                    >
                      外す
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4">
                {section.snapshots.length > 0 ? (
                  <div className="mp-practice-icon-grid">
                    {section.snapshots.map(({ skill, status, remainingSec, availableCharges, chargeCapacity }) => {
                      const icon = getSkillIcon(skill.id) ?? skill.icon;
                      const timerLabel = remainingSec === null ? null : String(remainingSec);
                      const isCardSkill = isAstCardSkill(skill.id);

                      return (
                        <div
                          key={`${section.jobId}::${skill.id}`}
                          className={`mp-practice-skill mp-practice-skill--${status} ${
                            isCardSkill ? "mp-practice-skill--card" : ""
                          }`}
                          title={skill.name}
                        >
                          <span className="mp-practice-skill-frame">
                            {icon ? (
                              <img
                                src={icon}
                                alt={skill.name}
                                className="mp-practice-skill-icon"
                              />
                            ) : (
                              <span className="mp-practice-skill-fallback">
                                {fallbackSkillLabel(skill.name)}
                              </span>
                            )}
                            {chargeCapacity > 1 && (
                              <span className="mp-practice-skill-charge">
                                {availableCharges}
                              </span>
                            )}
                            {timerLabel && (
                              <span className="mp-practice-skill-timer">{timerLabel}</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl border px-4 py-5 text-sm ${
                      isLight
                        ? "border-slate-200 bg-white/80 text-slate-500"
                        : "border-slate-800 bg-slate-950/60 text-slate-400"
                    }`}
                  >
                    このジョブで表示できるスキルがまだありません。
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div
            className={`rounded-2xl border px-4 py-5 text-sm ${
              isLight
                ? "border-slate-200 bg-slate-50 text-slate-500"
                : "border-slate-800 bg-slate-900/60 text-slate-400"
            }`}
          >
            {team.length > 0
              ? "動画モードを開いて、最初に表示するジョブを選んでください。"
              : "アイコンモードを使うには、先にPTへジョブを追加してください。"}
          </div>
        )}

        <button
          type="button"
          onClick={onAddJob}
          className={addButtonClass}
          disabled={!canAddJobs}
        >
          <span className="text-lg leading-none">+</span>
          <span>ジョブを追加</span>
        </button>
      </div>
    </section>
  );
}
