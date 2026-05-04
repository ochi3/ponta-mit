import { useDeferredValue, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { validatePlan, type ValidationIssue } from "../logic/validation";

interface ValidationPanelProps {
  className?: string;
  onSelectIssue?: (issue: ValidationIssue) => void;
}

function formatTime(sec: number) {
  const isNegative = sec < 0;
  const absSec = Math.abs(sec);
  const m = Math.floor(absSec / 60);
  const s = absSec % 60;
  const timeStr = `${m}:${s.toString().padStart(2, "0")}`;
  return isNegative ? `-${timeStr}` : timeStr;
}

function getSeverityLabel(severity: ValidationIssue["severity"]) {
  switch (severity) {
    case "error":
      return "エラー";
    case "warning":
      return "注意";
    case "info":
      return "情報";
  }
}

function getSummaryText(errorCount: number, warningCount: number) {
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`エラー ${errorCount}件`);
  }
  if (warningCount > 0) {
    parts.push(`注意 ${warningCount}件`);
  }
  return parts.join(" / ");
}

export default function ValidationPanel({
  className = "",
  onSelectIssue,
}: ValidationPanelProps) {
  const usages = useStore((s) => s.usages);
  const deferredUsages = useDeferredValue(usages);
  const [expanded, setExpanded] = useState(false);

  const issues = useMemo(() => {
    return validatePlan({ usages: deferredUsages });
  }, [deferredUsages]);

  const hasIssues = issues.length > 0;
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className={`validation-panel-container ${className}`}>
      <div
        className={`validation-panel ${
          hasIssues ? "validation-panel--active" : "validation-panel--empty"
        }`}
      >
        {hasIssues ? (
          <>
            <button
              className="validation-panel-header"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              type="button"
            >
              <span className="validation-panel-icon">!</span>
              <span className="validation-panel-summary">
                {getSummaryText(errorCount, warningCount)} が見つかりました
              </span>
              <span
                className={`validation-panel-chevron ${
                  expanded ? "expanded" : ""
                }`}
              >
                ▾
              </span>
            </button>

            {expanded && (
              <ul className="validation-panel-list">
                {issues.map((issue, index) => {
                  const locationLabel = issue.location
                    ? formatTime(issue.location.t_sec)
                    : "場所なし";
                  const canSelect = Boolean(issue.location && onSelectIssue);

                  return (
                    <li
                      key={`${issue.type}-${issue.location?.jobId ?? "none"}-${
                        issue.location?.skillId ?? "none"
                      }-${issue.location?.t_sec ?? "none"}-${
                        issue.location?.lineIndex ?? "none"
                      }-${index}`}
                      className={`validation-issue validation-issue--${issue.severity}`}
                    >
                      <button
                        type="button"
                        className="validation-issue-button"
                        onClick={() => onSelectIssue?.(issue)}
                        disabled={!canSelect}
                      >
                        <span className="validation-issue-meta">
                          <span className="validation-issue-badge">
                            {getSeverityLabel(issue.severity)}
                          </span>
                          <span className="validation-issue-time">
                            {locationLabel}
                          </span>
                        </span>
                        <span className="validation-issue-message">
                          {issue.message}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <div className="validation-panel-empty">
            <span className="validation-panel-empty-icon">✓</span>
            <span className="validation-panel-empty-text">
              現在のテーブルに問題はありません
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
