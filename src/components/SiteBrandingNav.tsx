import { buildAppHref } from "../logic/appRoute";
import { useI18n } from "../i18n";

type AppSection = "planner" | "activity";

export type ActivityNavSummary = {
  dayCount: number;
  durationLabel: string;
};

type Props = {
  current: AppSection;
  isLight?: boolean;
  onToggleTheme?: () => void;
  activitySummary?: ActivityNavSummary;
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

function activitySummaryClass(isLight: boolean) {
  return `text-sm font-normal tabular-nums ${
    isLight ? "text-slate-500" : "text-slate-400"
  }`;
}

export default function SiteBrandingNav({
  current,
  isLight = false,
  onToggleTheme,
  activitySummary,
}: Props) {
  const { t } = useI18n();
  const separatorClass = isLight ? "text-slate-400" : "text-slate-600";
  const pontaTextClass = pontaClass(isLight);

  const activityLabel = activitySummary
    ? t("nav.activitySummary", {
        days: activitySummary.dayCount,
        duration: activitySummary.durationLabel,
      })
    : null;

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

      <span className="inline-flex items-baseline gap-2">
        {current === "activity" ? (
          <span className={navCurrentClass(isLight)} aria-current="page">
            {t("nav.activity")}
          </span>
        ) : (
          <a href={buildAppHref("activity")} className={navLinkClass(isLight)}>
            {t("nav.activity")}
          </a>
        )}
        {activityLabel ? (
          <span className={activitySummaryClass(isLight)}>{activityLabel}</span>
        ) : null}
      </span>
    </nav>
  );
}
