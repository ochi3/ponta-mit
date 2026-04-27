import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { ThemeMode, Timeline } from "../types";
import { BUILTIN_TIMELINES } from "../data/timelines/registry";
import { secondsInPhase } from "../logic/timelineView";
import { encodeShareUrl } from "../logic/share";
import { parseTimelineJson } from "../logic/timelineImport";
import { useStore } from "../state/store";
import PhaseTabs from "./PhaseTabs";
import TeamPicker from "./TeamPicker";
import { useI18n, resolveIntlString } from "../i18n";

const BUILTIN_TIMELINE_ORDER = ["fru", "m12s-p1", "m12s-p2"] as const;

type Props = {
    tl: Timeline;
    theme: ThemeMode;
    onToggleTheme: () => void;
    onPhaseSeconds: (secs: number[], phaseId?: string) => void;
};

export default function TopBar({ tl, theme, onToggleTheme, onPhaseSeconds }: Props) {
    const [shareUrl, setShareUrl] = useState("");
    const [isCopied, setIsCopied] = useState(false);
    const { t } = useI18n();
    const team = useStore((s) => s.team);
    const usages = useStore((s) => s.usages);
    const timelineId = useStore((s) => s.timelineId);
    const importedTimelineState = useStore((s) => s.importedTimeline);
    const isCustomImport =
        importedTimelineState &&
        timelineId === importedTimelineState.id &&
        !(timelineId in BUILTIN_TIMELINES);
    const selectedBuiltinId = isCustomImport
        ? "__import__"
        : timelineId && timelineId in BUILTIN_TIMELINES
          ? timelineId
          : "fru";
    const expandedJobs = useStore((s) => s.expandedJobs);
    const setImportedTimeline = useStore((s) => s.setImportedTimeline);
    const setTimelineId = useStore((s) => s.setTimeline);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isLight = theme === "light";

    function handleGenerateLink() {
        const url = encodeShareUrl({
            v: 1,
            team,
            usages,
            timelineId: timelineId || undefined,
            expandedJobs: expandedJobs.length ? expandedJobs : undefined,
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
        const built = BUILTIN_TIMELINES[id];
        if (built) {
            onPhaseSeconds(secondsInPhase(built, undefined));
        }
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
            onPhaseSeconds(secondsInPhase(tl, undefined));
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            window.alert(`Import failed: ${msg}`);
        }
    }

    const timelineTitle = resolveIntlString(tl.title, undefined, "ja");
    const themeName = t(`topbar.theme.name.${theme}`);
    const themePlaceholder = "__THEME__";
    const plannerTitleTemplate = t("topbar.theme.title", { theme: themePlaceholder });
    const [titlePrefix, titleSuffix] = plannerTitleTemplate.includes(themePlaceholder)
        ? plannerTitleTemplate.split(themePlaceholder)
        : [plannerTitleTemplate, ""];

    const actionButtonClass = isLight
        ? "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-indigo-200/80 text-slate-900 bg-white/70 hover:border-indigo-400 hover:bg-indigo-50"
        : "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-slate-600 text-slate-100 hover:border-sky-500 hover:bg-slate-900";

    const secondaryButtonClass = isLight
        ? "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-emerald-200/80 text-slate-900 bg-white/70 hover:border-emerald-400 hover:bg-emerald-50"
        : "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 border border-slate-600 text-slate-100 hover:border-emerald-500 hover:bg-slate-900";

    const inputClass = isLight
        ? "flex-1 rounded-md px-2 py-1 text-xs truncate transition-colors duration-150 bg-white/80 border border-indigo-100 text-slate-800 placeholder:text-slate-400"
        : "flex-1 rounded-md px-2 py-1 text-xs truncate transition-colors duration-150 bg-slate-900/70 border border-slate-700 text-slate-100";

    const copyButtonClass = isLight
        ? "px-2 py-1 rounded-md border text-[11px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed border-indigo-200 text-slate-900 bg-white/70 hover:border-indigo-400 hover:bg-indigo-50"
        : "px-2 py-1 rounded-md border text-[11px] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed border-slate-600 text-slate-100 hover:border-sky-500 hover:bg-slate-900";

    const labelTone = isLight ? "text-slate-600" : "text-slate-400";

    return (
    <div className="flex flex-col gap-4 mt-2 mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
                <div className="flex items-center gap-2">
                    <h1 className={`text-lg font-semibold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                        {titlePrefix}
                        <button
                            type="button"
                            onClick={onToggleTheme}
                            className={`relative inline-flex font-semibold transition duration-200 focus:outline-none ${
                                isLight
                                    ? "text-transparent bg-clip-text bg-linear-to-b from-[#FFE29F] via-[#FFEEA9] to-[#F9D423] hover:drop-shadow-[0_0_12px_rgba(249,212,35,0.9)]"
                                    : "text-transparent bg-clip-text bg-linear-to-b from-[#312E81] via-[#7C3AED] to-[#A855F7] hover:drop-shadow-[0_0_12px_rgba(124,58,237,0.9)]"
                            }`}
                        >
                            {themeName}
                        </button>
                        {titleSuffix}
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs ${labelTone}`}>
                        {t("topbar.subtitle")}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">

                <button type="button" onClick={handleGenerateLink} className={actionButtonClass}>
                    {t("topbar.actions.generateLink")}
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
                                undefined,
                                "ja"
                            )}{" "}
                            (imported)
                        </option>
                    )}
                    {BUILTIN_TIMELINE_ORDER.map((id) => {
                        const built = BUILTIN_TIMELINES[id];
                        const label = built
                            ? resolveIntlString(built.title, undefined, "ja")
                            : id;
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
            
            <div className="hidden md:block h-4 w-px bg-slate-300 dark:bg-slate-600" />

            <div className="flex items-center gap-2">
            <span className={`text-xs uppercase tracking-wide ${labelTone}`}>
                {t("topbar.labels.phases")}
            </span>
            <PhaseTabs
              key={tl.id}
              tl={tl}
              onPhaseSeconds={onPhaseSeconds}
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
    </div>
);}
