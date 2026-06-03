import { useEffect, useMemo, useState } from "react";
import { JOBS } from "../data/jobs/jobs.registry";
import {
  buildFullSyncPoints,
  normalizeJobSyncPoints,
  normalizeJobYoutubeUrls,
  splitSyncPoints,
} from "../logic/practiceVideo";
import { formatClock, parseYouTubeUrl } from "../logic/youtube";
import type { JobId, ThemeMode, TimelinePracticeConfig, VideoSyncPoint } from "../types";

type Props = {
  theme: ThemeMode;
  team: readonly JobId[];
  practice: TimelinePracticeConfig;
  onClose: () => void;
  onSave: (practice: TimelinePracticeConfig) => void;
};

type SyncDraft = {
  baseVideoSec: number;
  extraPoints: VideoSyncPoint[];
};

type SyncEditorTarget = "base" | JobId;

function clampSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function createBaseSyncDraft(practice: TimelinePracticeConfig): SyncDraft {
  const split = splitSyncPoints(practice.syncPoints, practice.youtubeUrl);
  return {
    baseVideoSec: split.baseVideoSec,
    extraPoints: split.extraPoints,
  };
}

function createJobSyncDrafts(
  practice: TimelinePracticeConfig,
  team: readonly JobId[]
): Partial<Record<JobId, SyncDraft>> {
  const drafts: Partial<Record<JobId, SyncDraft>> = {};
  for (const jobId of team) {
    const jobUrl = practice.jobYoutubeUrls?.[jobId] ?? "";
    const split = splitSyncPoints(practice.jobSyncPoints?.[jobId] ?? [], jobUrl);
    drafts[jobId] = {
      baseVideoSec: split.baseVideoSec,
      extraPoints: split.extraPoints,
    };
  }
  return drafts;
}

function buildPracticeConfig(
  youtubeUrl: string,
  baseSync: SyncDraft,
  jobYoutubeUrls: Partial<Record<JobId, string>>,
  jobSyncDrafts: Partial<Record<JobId, SyncDraft>>,
  jobVideoSource: TimelinePracticeConfig["jobVideoSource"]
): TimelinePracticeConfig {
  const trimmedUrl = youtubeUrl.trim();
  const normalizedJobUrls = normalizeJobYoutubeUrls(jobYoutubeUrls);
  const hasJobUrls = Object.keys(normalizedJobUrls).length > 0;

  const jobSyncPoints: Partial<Record<JobId, VideoSyncPoint[]>> = {};
  for (const [jobId, draft] of Object.entries(jobSyncDrafts)) {
    if (!draft) {
      continue;
    }
    const jobUrl = normalizedJobUrls[jobId as JobId] ?? "";
    const points = buildFullSyncPoints(draft.baseVideoSec, draft.extraPoints);
    if (jobUrl || points.length > 0) {
      jobSyncPoints[jobId as JobId] = points;
    }
  }
  const normalizedJobSyncPoints = normalizeJobSyncPoints(jobSyncPoints);
  const hasJobSync = Object.keys(normalizedJobSyncPoints).length > 0;
  const baseSyncPoints = buildFullSyncPoints(baseSync.baseVideoSec, baseSync.extraPoints);

  if (
    !trimmedUrl &&
    baseSyncPoints.length === 0 &&
    !hasJobUrls &&
    !hasJobSync
  ) {
    return {
      youtubeUrl: "",
      syncPoints: [],
    };
  }

  const config: TimelinePracticeConfig = {
    youtubeUrl: trimmedUrl,
    syncPoints: baseSyncPoints,
  };

  if (hasJobUrls) {
    config.jobYoutubeUrls = normalizedJobUrls;
  }
  if (jobVideoSource && Object.keys(jobVideoSource).length > 0) {
    config.jobVideoSource = jobVideoSource;
  }
  if (hasJobSync) {
    config.jobSyncPoints = normalizedJobSyncPoints;
  }

  return config;
}

type SyncFieldsProps = {
  targetLabel: string;
  baseVideoSec: number;
  extraPoints: VideoSyncPoint[];
  subtleClass: string;
  inputClass: string;
  syncPanelClass: string;
  syncPointRowClass: string;
  secondaryButtonClass: string;
  onBaseVideoSecChange: (value: number) => void;
  onRemovePoint: (timelineSec: number) => void;
};

function PracticeSyncFields({
  targetLabel,
  baseVideoSec,
  extraPoints,
  subtleClass,
  inputClass,
  syncPanelClass,
  syncPointRowClass,
  secondaryButtonClass,
  onBaseVideoSecChange,
  onRemovePoint,
}: SyncFieldsProps) {
  return (
    <div className={syncPanelClass}>
      <p className="text-xs font-medium">{targetLabel}の同期</p>
      <label className="block text-sm font-medium">
        <span className="block">開始秒数</span>
        <span className={`mt-1 block text-xs font-normal ${subtleClass}`}>
          タイムライン 0:00 に合わせる動画秒数
        </span>
        <input
          type="number"
          min={0}
          step={1}
          value={baseVideoSec}
          onChange={(event) => onBaseVideoSecChange(clampSeconds(Number(event.target.value)))}
          className={`${inputClass} mt-2 max-w-[220px]`}
        />
      </label>

      {extraPoints.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {extraPoints.map((point) => (
            <li
              key={point.t_sec}
              className={syncPointRowClass}
            >
              <span>
                タイムライン {formatClock(point.t_sec)} → 動画 {formatClock(point.video_sec)}
              </span>
              <button
                type="button"
                onClick={() => onRemovePoint(point.t_sec)}
                className={secondaryButtonClass}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`text-xs ${subtleClass}`}>
          追加の同期ポイントはタイムライン左端の時間をクリックして設定します。
        </p>
      )}
    </div>
  );
}

export default function TimelineVideoSettingsDialog({
  theme,
  team,
  practice,
  onClose,
  onSave,
}: Props) {
  const isLight = theme === "light";
  const initialBaseSync = useMemo(() => createBaseSyncDraft(practice), [practice]);
  const initialJobSyncDrafts = useMemo(
    () => createJobSyncDrafts(practice, team),
    [practice, team]
  );

  const [youtubeUrl, setYoutubeUrl] = useState(practice.youtubeUrl);
  const [baseSync, setBaseSync] = useState<SyncDraft>(initialBaseSync);
  const [jobYoutubeUrls, setJobYoutubeUrls] = useState<Partial<Record<JobId, string>>>(
    () => ({ ...practice.jobYoutubeUrls })
  );
  const [jobSyncDrafts, setJobSyncDrafts] = useState<Partial<Record<JobId, SyncDraft>>>(
    initialJobSyncDrafts
  );
  const [expandedSyncTarget, setExpandedSyncTarget] = useState<SyncEditorTarget | null>(
    null
  );

  useEffect(() => {
    setYoutubeUrl(practice.youtubeUrl);
    setBaseSync(initialBaseSync);
    setJobYoutubeUrls({ ...practice.jobYoutubeUrls });
    setJobSyncDrafts(initialJobSyncDrafts);
  }, [initialBaseSync, initialJobSyncDrafts, practice]);

  const parsedVideo = useMemo(() => parseYouTubeUrl(youtubeUrl), [youtubeUrl]);
  const overlayClass = isLight
    ? "bg-slate-900/35 backdrop-blur-sm"
    : "bg-black/60 backdrop-blur-sm";
  const panelClass = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-slate-800 bg-slate-950 text-slate-100";
  const inputClass = isLight
    ? "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
    : "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100";
  const subtleClass = isLight ? "text-slate-500" : "text-slate-400";
  const sectionClass = isLight
    ? "rounded-xl border border-slate-200 bg-slate-50"
    : "rounded-xl border border-slate-800 bg-slate-900/60";
  const footerClass = isLight
    ? "shrink-0 border-t border-slate-200 bg-white px-5 py-4"
    : "shrink-0 border-t border-slate-800 bg-slate-950 px-5 py-4";
  const secondaryButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900";
  const primaryButtonClass = isLight
    ? "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
    : "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400";
  const syncToggleClass = isLight
    ? "shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50"
    : "shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900";
  const syncToggleActiveClass = isLight
    ? "shrink-0 rounded-lg border border-sky-500 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700"
    : "shrink-0 rounded-lg border border-sky-500 bg-sky-950/40 px-3 py-2 text-xs font-medium text-sky-300";
  const jobRowClass = isLight
    ? "border-b border-slate-200/90 pb-4 pt-4 first:pt-0 last:border-b-0 last:pb-0"
    : "border-b border-slate-800/90 pb-4 pt-4 first:pt-0 last:border-b-0 last:pb-0";
  const syncPanelClass = isLight
    ? "mt-3 space-y-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-3"
    : "mt-3 space-y-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-3 py-3";
  const syncPointRowClass = isLight
    ? "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
    : "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2";

  function toggleSyncTarget(target: SyncEditorTarget) {
    setExpandedSyncTarget((current) => (current === target ? null : target));
  }

  function updateJobSyncDraft(jobId: JobId, updater: (draft: SyncDraft) => SyncDraft) {
    setJobSyncDrafts((current) => {
      const existing =
        current[jobId] ??
        splitSyncPoints(practice.jobSyncPoints?.[jobId] ?? [], jobYoutubeUrls[jobId] ?? "");
      return {
        ...current,
        [jobId]: updater({
          baseVideoSec: existing.baseVideoSec ?? 0,
          extraPoints: existing.extraPoints ?? [],
        }),
      };
    });
  }

  function handleSave() {
    onSave(
      buildPracticeConfig(
        youtubeUrl,
        baseSync,
        jobYoutubeUrls,
        jobSyncDrafts,
        practice.jobVideoSource
      )
    );
  }

  return (
    <div className={`fixed inset-0 z-[130] flex items-center justify-center px-4 ${overlayClass}`}>
      <div
        className={`flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-2xl ${panelClass}`}
      >
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">YouTube設定</h2>
              <p className={`mt-1 text-sm ${subtleClass}`}>
                基本動画とジョブ別動画のURL・同期を設定できます。同期は動画ごとに独立です。
              </p>
            </div>
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              閉じる
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <section className={`${sectionClass} p-4`}>
              <h3 className="text-sm font-semibold">基本の動画</h3>
              <p className={`mt-1 text-xs ${subtleClass}`}>
                動画モードで「基本の動画」を選んだとき、またはジョブ別URL未設定時に使います。
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="block text-sm font-medium">動画URL</label>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(event) => setYoutubeUrl(event.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className={`${inputClass} mt-2`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => toggleSyncTarget("base")}
                  className={
                    expandedSyncTarget === "base" ? syncToggleActiveClass : syncToggleClass
                  }
                >
                  同期設定
                  {baseSync.extraPoints.length > 0 && (
                    <span className="ml-1 opacity-80">({baseSync.extraPoints.length})</span>
                  )}
                </button>
              </div>
              <div className={`mt-2 text-xs ${subtleClass}`}>
                {parsedVideo
                  ? `URL開始位置: ${formatClock(parsedVideo.startSeconds)}`
                  : youtubeUrl.trim()
                    ? "YouTube URLを読み取れませんでした"
                    : "URL未設定でも保存できます"}
              </div>
              {expandedSyncTarget === "base" && (
                <PracticeSyncFields
                  targetLabel="基本の動画"
                  baseVideoSec={baseSync.baseVideoSec}
                  extraPoints={baseSync.extraPoints}
                  subtleClass={subtleClass}
                  inputClass={inputClass}
                  syncPanelClass={syncPanelClass}
                  syncPointRowClass={syncPointRowClass}
                  secondaryButtonClass={secondaryButtonClass}
                  onBaseVideoSecChange={(value) =>
                    setBaseSync((current) => ({ ...current, baseVideoSec: value }))
                  }
                  onRemovePoint={(timelineSec) =>
                    setBaseSync((current) => ({
                      ...current,
                      extraPoints: current.extraPoints.filter(
                        (point) => point.t_sec !== timelineSec
                      ),
                    }))
                  }
                />
              )}
            </section>

            {team.length > 0 && (
              <section className={`${sectionClass} p-4`}>
                <h3 className="text-sm font-semibold">ジョブ別の動画</h3>
                <p className={`mt-1 text-xs ${subtleClass}`}>
                  各ジョブ用のURLと同期を設定すると、動画モードで「ジョブの動画」を選べます。
                </p>
                <div className="mt-3 space-y-0">
                  {team.map((jobId) => {
                    const jobName = JOBS.find((job) => job.id === jobId)?.name ?? jobId;
                    const jobUrl = jobYoutubeUrls[jobId] ?? "";
                    const parsedJobVideo = parseYouTubeUrl(jobUrl);
                    const jobDraft =
                      jobSyncDrafts[jobId] ??
                      splitSyncPoints(practice.jobSyncPoints?.[jobId] ?? [], jobUrl);

                    return (
                      <div key={jobId} className={jobRowClass}>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <label className="block text-xs font-medium">{jobName}</label>
                            <input
                              type="url"
                              value={jobUrl}
                              onChange={(event) =>
                                setJobYoutubeUrls((current) => ({
                                  ...current,
                                  [jobId]: event.target.value,
                                }))
                              }
                              placeholder="未設定の場合は基本の動画を使用"
                              className={`${inputClass} mt-1`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSyncTarget(jobId)}
                            className={
                              expandedSyncTarget === jobId
                                ? syncToggleActiveClass
                                : syncToggleClass
                            }
                          >
                            同期設定
                            {jobDraft.extraPoints.length > 0 && (
                              <span className="ml-1 opacity-80">
                                ({jobDraft.extraPoints.length})
                              </span>
                            )}
                          </button>
                        </div>
                        {parsedJobVideo && (
                          <div className={`mt-1 text-xs ${subtleClass}`}>
                            URL開始位置: {formatClock(parsedJobVideo.startSeconds)}
                          </div>
                        )}
                        {expandedSyncTarget === jobId && (
                          <PracticeSyncFields
                            targetLabel={jobName}
                            baseVideoSec={jobDraft.baseVideoSec}
                            extraPoints={jobDraft.extraPoints}
                            subtleClass={subtleClass}
                            inputClass={inputClass}
                            syncPanelClass={syncPanelClass}
                            syncPointRowClass={syncPointRowClass}
                            secondaryButtonClass={secondaryButtonClass}
                            onBaseVideoSecChange={(value) =>
                              updateJobSyncDraft(jobId, (draft) => ({
                                ...draft,
                                baseVideoSec: value,
                              }))
                            }
                            onRemovePoint={(timelineSec) =>
                              updateJobSyncDraft(jobId, (draft) => ({
                                ...draft,
                                extraPoints: draft.extraPoints.filter(
                                  (point) => point.t_sec !== timelineSec
                                ),
                              }))
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className={`${footerClass} flex justify-end gap-2`}>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            キャンセル
          </button>
          <button type="button" onClick={handleSave} className={primaryButtonClass}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
