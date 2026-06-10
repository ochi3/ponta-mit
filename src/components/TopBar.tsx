import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { ThemeMode, Timeline, TimelinePracticeConfig } from "../types";
import {
    BUILTIN_TIMELINE_OPTIONS,
    DEFAULT_TIMELINE_ID,
    isBuiltinTimelineId,
    loadBuiltinTimeline,
    resolveTimelineId,
} from "../data/timelines/registry";
import {
    DEFAULT_ACTIVITY_RECORD_ID,
    getBuiltinActivityRecordBook,
} from "../data/activity-records/registry";
import { computeActivityRecordStats } from "../logic/activityRecordStats";
import { encodeShareUrl } from "../logic/share";
import SiteBrandingNav from "./SiteBrandingNav";
import { parseTimelineJson } from "../logic/timelineImport";
import { serializeTimelineJson } from "../logic/timelineExport";
import { useStore } from "../state/store";
import FflogsTimelineImportDialog from "./FflogsTimelineImportDialog";
import type { FflogsTimelineImportResult } from "../logic/fflogsTimeline";
import PhaseTabs from "./PhaseTabs";
import TeamPicker from "./TeamPicker";
import { hasAnyPracticeVideo } from "../logic/practiceVideo";
import { useI18n, resolveIntlString } from "../i18n";

function hasPracticeConfig(practice?: Partial<TimelinePracticeConfig> | null) {
    return hasAnyPracticeVideo(practice);
}

function sanitizeDownloadFileName(value: string) {
    return (
        value
            .trim()
            .replace(/[\\/:*?"<>|]+/g, "_")
            .replace(/\s+/g, "_")
            .slice(0, 96) || "timeline"
    );
}

type Props = {
    tl: Timeline;
    theme: ThemeMode;
    isPracticeMode: boolean;
    onToggleTheme: () => void;
    onTogglePracticeMode: () => void;
    onOpenVideoSettings: () => void;
    onPhaseNavigate: (phaseId?: string, scrollSec?: number) => void;
};

export default function TopBar({
    tl,
    theme,
    isPracticeMode,
    onToggleTheme,
    onTogglePracticeMode,
    onOpenVideoSettings,
    onPhaseNavigate,
}: Props) {
    const [shareUrl, setShareUrl] = useState("");
    const [isCopied, setIsCopied] = useState(false);
    const [isFflogsImportOpen, setIsFflogsImportOpen] = useState(false);
    const { t } = useI18n();
    const team = useStore((s) => s.team);
    const usages = useStore((s) => s.usages);
    const momentNotes = useStore((s) => s.momentNotes);
    const timelineId = useStore((s) => s.timelineId);
    const layoutPrefs = useStore(
        (s) =>
            s.plansByTimeline[resolveTimelineId(s.timelineId || tl.id)]?.layoutPrefs
    );
    const undo = useStore((s) => s.undo);
    const redo = useStore((s) => s.redo);
    const undoCount = useStore(
        (s) => s.undoStackByTimeline[s.timelineId]?.length ?? 0
    );
    const redoCount = useStore(
        (s) => s.redoStackByTimeline[s.timelineId]?.length ?? 0
    );
    const importedTimelineState = useStore((s) => s.importedTimeline);
    const isCustomImport =
        importedTimelineState &&
        timelineId === importedTimelineState.id &&
        !isBuiltinTimelineId(timelineId);
    const selectedBuiltinId = isCustomImport
        ? "__import__"
        : timelineId && isBuiltinTimelineId(timelineId)
          ? timelineId
          : DEFAULT_TIMELINE_ID;
    const evolveJobs = useStore((s) => s.evolveJobs);
    const expandedJobs = useStore((s) => s.expandedJobs);
    const hideRowsWithoutEvents = useStore((s) => s.hideRowsWithoutEvents);
    const toggleAllJobExpand = useStore((s) => s.toggleAllJobExpand);
    const toggleHideRowsWithoutEvents = useStore((s) => s.toggleHideRowsWithoutEvents);
    const roomPractice = useStore((s) => s.plansByTimeline[tl.id]?.practice);
    const contentPractice = useStore((s) => s.practiceDefaultsByTimeline[tl.id]);
    const setImportedTimeline = useStore((s) => s.setImportedTimeline);
    const setTimelineId = useStore((s) => s.setTimeline);
    const replaceTimelinePlan = useStore((s) => s.replaceTimelinePlan);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isLight = theme === "light";

    const practice = hasPracticeConfig(roomPractice)
        ? roomPractice
        : hasPracticeConfig(contentPractice)
            ? contentPractice
            : tl.practice;

    function handleGenerateLink() {
        const url = encodeShareUrl({
            v: 1,
            team,
            usages,
            timelineId: timelineId || undefined,
            momentNotes: Object.keys(momentNotes).length ? momentNotes : undefined,
            layoutPrefs:
                layoutPrefs && Object.keys(layoutPrefs).length > 0
                    ? layoutPrefs
                    : undefined,
            practice: practice
                ? {
                    youtubeUrl: practice.youtubeUrl,
                    syncPoints: practice.syncPoints,
                  }
                : undefined,
        });
        setShareUrl(url);
        setIsCopied(false);
    }

    async function handleCopy() {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 1500);
        } catch {
            // Clipboard write may fail (e.g. permission denied).
        }
    }
    function handleBuiltinTimelineChange(event: ChangeEvent<HTMLSelectElement>) {
        const id = event.target.value;
        if (id === "__import__") return;
        setImportedTimeline(null);
        setTimelineId(id);
        void loadBuiltinTimeline(id).then((built) => {
            if (!built) {
                return;
            }
            onPhaseNavigate();
        });
    }

    function handleImportTimelineClick() {
        fileInputRef.current?.click();
    }

    async function handleTimelineFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        try {
            const text = await file.text();
            const tl = parseTimelineJson(text);
            setImportedTimeline(tl);
            setTimelineId(tl.id);
            onPhaseNavigate();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            window.alert(`Import failed: ${msg}`);
        }
    }

    function handleImportFflogsTimeline(result: FflogsTimelineImportResult) {
        setImportedTimeline(result.timeline);
        replaceTimelinePlan(result.timeline.id, {
            team: result.team,
            usages: result.usages,
            expandedJobs: result.expandedJobs,
            evolveJobs: result.evolveJobs,
        });
        setTimelineId(result.timeline.id);
        onPhaseNavigate();
    }

    function handleSaveImportedTimelineJson() {
        if (!isCustomImport || !importedTimelineState) {
            return;
        }

        const json = serializeTimelineJson(importedTimelineState);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${sanitizeDownloadFileName(importedTimelineState.id)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    const timelineTitle = resolveIntlString(tl.title, undefined);
    const activitySummary = useMemo(() => {
        const book = getBuiltinActivityRecordBook(DEFAULT_ACTIVITY_RECORD_ID);
        if (!book) return undefined;
        const stats = computeActivityRecordStats(book.entries);
        return { dayCount: stats.dayCount, durationLabel: stats.label };
    }, []);

    const actionButtonClass = isLight
        ? "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-indigo-200/80 text-slate-900 bg-white/70 hover:border-indigo-400 hover:bg-indigo-50"
        : "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-slate-600 text-slate-100 hover:border-sky-500 hover:bg-slate-900";

    const secondaryButtonClass = isLight
        ? "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-emerald-200/80 text-slate-900 bg-white/70 hover:border-emerald-400 hover:bg-emerald-50"
        : "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-slate-600 text-slate-100 hover:border-emerald-500 hover:bg-slate-900";

    const practiceButtonClass = isPracticeMode
        ? isLight
            ? "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-sky-500 text-sky-900 bg-sky-100"
            : "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-sky-500 text-sky-100 bg-sky-500/15"
        : actionButtonClass;
    const youtubeButtonClass = isLight
        ? "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200/90 bg-white/80 text-[11px] font-bold text-rose-700 transition-colors duration-150 hover:border-rose-400 hover:bg-rose-50"
        : "relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-600 bg-slate-900/70 text-[11px] font-bold text-rose-200 transition-colors duration-150 hover:border-rose-400 hover:bg-slate-800";

    const inputClass = isLight
        ? "flex-1 rounded-md px-2 py-1 text-xs truncate transition-colors duration-150 bg-white/80 border border-indigo-100 text-slate-800 placeholder:text-slate-400"
        : "flex-1 rounded-md px-2 py-1 text-xs truncate transition-colors duration-150 bg-slate-900/70 border border-slate-700 text-slate-100";

    const copyButtonClass = isLight
        ? "px-2 py-1 rounded-md border text-[11px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed border-indigo-200 text-slate-900 bg-white/70 hover:border-indigo-400 hover:bg-indigo-50"
        : "px-2 py-1 rounded-md border text-[11px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed border-slate-600 text-slate-100 hover:border-sky-500 hover:bg-slate-900";

    const labelTone = isLight ? "text-slate-600" : "text-slate-400";
    const hasPracticeVideo = hasAnyPracticeVideo(practice);
    const allPersonalSkillsExpanded = useMemo(
        () => team.length > 0 && team.every((jobId) => expandedJobs.includes(jobId)),
        [expandedJobs, team]
    );
    const viewToggleActiveClass = isLight
        ? "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-sky-500 text-sky-900 bg-sky-100"
        : "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-sky-500 text-sky-100 bg-sky-500/15";
    const viewToggleButtonClass = (active: boolean) =>
        active ? viewToggleActiveClass : actionButtonClass;

    return (
    <div className="flex flex-col gap-4 mt-2 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <SiteBrandingNav
                current="planner"
                isLight={isLight}
                onToggleTheme={onToggleTheme}
                activitySummary={activitySummary}
            />

            <div className="flex flex-wrap items-center gap-2">

                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        onClick={undo}
                        disabled={undoCount === 0}
                        className={copyButtonClass}
                        title="ひとつ前の編集に戻します"
                    >
                        戻す
                    </button>

                    <button
                        type="button"
                        onClick={redo}
                        disabled={redoCount === 0}
                        className={copyButtonClass}
                        title="戻した編集をやり直します"
                    >
                        やり直し
                    </button>

                    <span className={`text-[11px] ${labelTone}`}>
                        {t("topbar.cellClick")}
                    </span>
                </div>

                <button type="button" onClick={handleGenerateLink} className={actionButtonClass}>
                    {t("topbar.actions.generateLink")}
                </button>

                {team.length > 0 && (
                    <button
                        type="button"
                        onClick={() => toggleAllJobExpand()}
                        className={viewToggleButtonClass(allPersonalSkillsExpanded)}
                        aria-pressed={allPersonalSkillsExpanded}
                        title={
                            allPersonalSkillsExpanded
                                ? t("timeline.view.hideAllPersonalSkills")
                                : t("timeline.view.showAllPersonalSkills")
                        }
                    >
                        {allPersonalSkillsExpanded
                            ? t("timeline.view.hideAllPersonalSkillsShort")
                            : t("timeline.view.showAllPersonalSkillsShort")}
                    </button>
                )}

                {tl.moments.length > 0 && (
                    <button
                        type="button"
                        onClick={() => toggleHideRowsWithoutEvents()}
                        className={viewToggleButtonClass(hideRowsWithoutEvents)}
                        aria-pressed={hideRowsWithoutEvents}
                        title={
                            hideRowsWithoutEvents
                                ? t("timeline.view.showAllRows")
                                : t("timeline.view.hideRowsWithoutEvents")
                        }
                    >
                        {hideRowsWithoutEvents
                            ? t("timeline.view.eventsOnlyShortOn")
                            : t("timeline.view.eventsOnlyShort")}
                    </button>
                )}

                <button type="button" onClick={onTogglePracticeMode} className={practiceButtonClass}>
                    {isPracticeMode ? "動画モードを閉じる" : "動画モード"}
                </button>

                <button
                    type="button"
                    onClick={onOpenVideoSettings}
                    className={youtubeButtonClass}
                    title="YouTube設定"
                    aria-label="YouTube設定"
                >
                    YT
                    {hasPracticeVideo && (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                    )}
                </button>

                <div className="flex items-center gap-1 min-w-48 max-w-[20rem]">
                    <input
                        className={inputClass}
                        readOnly
                        value={shareUrl}
                        placeholder={t("topbar.placeholders.share")}
                    />
                    <button
                        type="button"
                        onClick={handleCopy}
                        disabled={!shareUrl}
                        className={copyButtonClass}
                    >
                        {isCopied ? t("topbar.actions.copied") : t("topbar.actions.copy")}
                    </button>
                </div>

            </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs uppercase tracking-wide ${labelTone}`}>
            {t("topbar.labels.duty")}
            </span>

            <span
            className={`text-xs font-medium ${
                isLight ? "text-slate-900" : "text-slate-100"
            }`}
            >
            {timelineTitle || t("topbar.labels.untitledTimeline")}
            </span>

            <label className={`${labelTone} text-xs flex items-center gap-1`}>
                <span className="sr-only">{t("topbar.actions.selectTimeline")}</span>
                <select
                    className={`rounded-md px-2 py-1 text-xs max-w-[14rem] transition-colors duration-150 ${
                        isLight
                            ? "bg-white/80 border border-slate-300 text-slate-800"
                            : "bg-slate-900/70 border border-slate-700 text-slate-100"
                    }`}
                    value={selectedBuiltinId}
                    onChange={handleBuiltinTimelineChange}
                    aria-label={t("topbar.actions.selectTimeline")}
                >
                    {isCustomImport && importedTimelineState && (
                        <option value="__import__" disabled>
                            {resolveIntlString(
                                importedTimelineState.title,
                                undefined
                            )}{" "}
                            (imported)
                        </option>
                    )}
                    {BUILTIN_TIMELINE_OPTIONS.map(({ id, label }) => {
                        return (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        );
                    })}
                </select>
            </label>

            <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleTimelineFile}
            />
            <button
            type="button"
            onClick={handleImportTimelineClick}
            className={`${secondaryButtonClass} text-xs px-2 py-1`}
            >
            {t("topbar.actions.importTimeline")}
            </button>

            <button
            type="button"
            onClick={() => setIsFflogsImportOpen(true)}
            className={`${secondaryButtonClass} text-xs px-2 py-1`}
            >
            Logsから生成
            </button>

            {isCustomImport && importedTimelineState && (
            <button
            type="button"
            onClick={handleSaveImportedTimelineJson}
            className={`${secondaryButtonClass} text-xs px-2 py-1`}
            >
            JSON保存
            </button>
            )}

            <div className="hidden md:block h-4 w-px bg-slate-300 dark:bg-slate-600" />

            <div className="flex items-center gap-2">
            <span className={`text-xs uppercase tracking-wide ${labelTone}`}>
                {t("topbar.labels.phases")}
            </span>
            <PhaseTabs
              key={tl.id}
              tl={tl}
              onPhaseNavigate={onPhaseNavigate}
            />
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
            <span className={`text-xs uppercase tracking-wide ${labelTone}`}>
                {t("topbar.labels.party")}
            </span>
            <TeamPicker />
            </div>
        </div>

        </div>
        {isFflogsImportOpen && (
            <FflogsTimelineImportDialog
                theme={theme}
                baseTimeline={tl}
                evolveJobs={evolveJobs}
                onClose={() => setIsFflogsImportOpen(false)}
                onImport={handleImportFflogsTimeline}
            />
        )}
    </div>
);}
