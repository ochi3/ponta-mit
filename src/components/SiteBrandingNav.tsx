import { buildAppHref } from "../logic/appRoute";
import { useI18n } from "../i18n";
import type { ActivityNavBookSummary } from "../logic/activityRecordStats";

type AppSection = "planner" | "activity" | "dmuExa";

type Props = {
  current: AppSection;
  isLight?: boolean;
  onToggleTheme?: () => void;
  activitySummaries?: readonly ActivityNavBookSummary[];
};

type SummaryTone = {
  chip: string;
  label: string;
  stats: string;
};

function navLinkClass(isLight: boolean) {
  return `transition-colors duration-150 hover:text-sky-400 ${
    isLight ? "text-slate-600" : "text-slate-400"
  }`;
}

function navCurrentClass(isLight: boolean) {
  return isLight ? "text-slate-900" : "text-slate-100";
}

function pontaClass(isLight: boolean) {
  return `font-semibold transition-colors duration-150 focus:outline-none ${
    isLight
      ? "text-orange-600 hover:text-orange-500"
      : "text-orange-400 hover:text-orange-300"
  }`;
}

const SUMMARY_TONES_LIGHT: readonly SummaryTone[] = [
  {
    // DMU: 紫
    chip: "border-violet-300/80 bg-violet-50 text-violet-900",
    label: "bg-violet-500 text-white",
    stats: "text-violet-800",
  },
  {
    // FRU: 青
    chip: "border-sky-300/80 bg-sky-50 text-sky-900",
    label: "bg-sky-500 text-white",
    stats: "text-sky-800",
  },
  {
    // TOP: 白
    chip: "border-slate-300 bg-white text-slate-800",
    label: "bg-slate-100 text-slate-800 ring-1 ring-slate-300",
    stats: "text-slate-700",
  },
];

const SUMMARY_TONES_DARK: readonly SummaryTone[] = [
  {
    // DMU: 紫
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-100",
    label: "bg-violet-400/90 text-slate-950",
    stats: "text-violet-200",
  },
  {
    // FRU: 青
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-100",
    label: "bg-sky-500/90 text-slate-950",
    stats: "text-sky-200",
  },
  {
    // TOP: 白
    chip: "border-slate-300/50 bg-white/10 text-slate-100",
    label: "bg-white text-slate-900",
    stats: "text-slate-200",
  },
];

const SUMMARY_TONE_BY_LABEL: Record<string, number> = {
  DMU: 0,
  FRU: 1,
  TOP: 2,
};

function resolveSummaryTone(label: string, index: number, isLight: boolean): SummaryTone {
  const tones = isLight ? SUMMARY_TONES_LIGHT : SUMMARY_TONES_DARK;
  const preferred = SUMMARY_TONE_BY_LABEL[label.toUpperCase()];
  const toneIndex =
    preferred !== undefined ? preferred : index % tones.length;
  return tones[toneIndex] ?? tones[0];
}

export default function SiteBrandingNav({
  current,
  isLight = false,
  onToggleTheme,
  activitySummaries,
}: Props) {
  const { t } = useI18n();
  const separatorClass = isLight ? "text-slate-400" : "text-slate-600";
  const pontaTextClass = pontaClass(isLight);

  return (
    <nav
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-semibold ${
        isLight ? "text-slate-900" : "text-slate-100"
      }`}
      aria-label={t("nav.ariaLabel")}
    >
      {onToggleTheme ? (
        <button type="button" onClick={onToggleTheme} className={pontaTextClass}>
          {t("nav.siteName")}
        </button>
      ) : (
        <span className={pontaTextClass}>{t("nav.siteName")}</span>
      )}

      <span className={separatorClass} aria-hidden="true">
        /
      </span>

      {current === "planner" ? (
        <span className={navCurrentClass(isLight)} aria-current="page">
          {t("nav.planner")}
        </span>
      ) : (
        <a href={buildAppHref("planner")} className={navLinkClass(isLight)}>
          {t("nav.planner")}
        </a>
      )}

      <span className={separatorClass} aria-hidden="true">
        /
      </span>

      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        {current === "activity" ? (
          <span className={navCurrentClass(isLight)} aria-current="page">
            {t("nav.activity")}
          </span>
        ) : (
          <a href={buildAppHref("activity")} className={navLinkClass(isLight)}>
            {t("nav.activity")}
          </a>
        )}

        {activitySummaries && activitySummaries.length > 0 ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {activitySummaries.map((summary, index) => {
              const tone = resolveSummaryTone(summary.label, index, isLight);
              const titleParts = [
                `${summary.label}: ${summary.dayCount}日 / ${summary.durationLabel}`,
                summary.cleared ? "Clear" : null,
              ].filter(Boolean);
              const clearedChip = summary.cleared
                ? isLight
                  ? "border-amber-400/80 bg-gradient-to-r from-amber-100 via-amber-50 to-white"
                  : "border-amber-400/50 bg-gradient-to-r from-amber-500/30 via-amber-400/15 to-transparent"
                : tone.chip;
              return (
                <span
                  key={`${summary.label}-${index}`}
                  className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs font-medium ${clearedChip}`}
                  title={titleParts.join(" · ")}
                >
                  {summary.cleared ? (
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 flex items-center justify-end pr-1 text-[11px] font-black tracking-[0.18em] ${
                        isLight ? "text-amber-500/25" : "text-amber-200/20"
                      }`}
                    >
                      CLEAR
                    </span>
                  ) : null}
                  <span
                    className={`relative rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${tone.label}`}
                  >
                    {summary.label}
                  </span>
                  <span className={`relative tabular-nums ${tone.stats}`}>
                    {t("nav.activitySummary", {
                      days: summary.dayCount,
                      duration: summary.durationLabel,
                    })}
                  </span>
                </span>
              );
            })}
          </span>
        ) : null}
      </span>

      <span className={separatorClass} aria-hidden="true">
        /
      </span>

      {current === "dmuExa" ? (
        <span className={navCurrentClass(isLight)} aria-current="page">
          {t("nav.dmuExa")}
        </span>
      ) : (
        <a href={buildAppHref("dmuExa")} className={navLinkClass(isLight)}>
          {t("nav.dmuExa")}
        </a>
      )}
    </nav>
  );
}
