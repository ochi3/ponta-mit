import { useDeferredValue, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { validatePlan, type ValidationIssue } from "../logic/validation";

interface ValidationPanelProps {
  className?: string;
}

export default function ValidationPanel({ className = "" }: ValidationPanelProps) {
  const usages = useStore((s) => s.usages);
  const deferredUsages = useDeferredValue(usages);
  const [expanded, setExpanded] = useState(false);

  const issues = useMemo(() => {
    return validatePlan({ usages: deferredUsages });
  }, [deferredUsages]);

  const hasIssues = issues.length > 0;
  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  const getSeverityIcon = (severity: ValidationIssue["severity"]): string => {
    switch (severity) {
      case "error": return "⚠️";
      case "warning": return "⚡";
      case "info": return "ℹ️";
    }
  };

  const getNoIssuesText = (): string => "現在のテーブルに問題はありません";

  const getSummaryText = (): string => {
    const parts: string[] = [];
    if (errorCount > 0) {
      parts.push(`${errorCount} 件のエラー`);
    }
    if (warningCount > 0) {
      parts.push(`${warningCount} 件の警告`);
    }
    return parts.join("、");
  };

  return (
    <div className={`validation-panel-container ${className}`}>
      <div className={`validation-panel ${hasIssues ? "validation-panel--active" : "validation-panel--empty"}`}>
        {hasIssues ? (
          <>
            <button
              className="validation-panel-header"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              <span className="validation-panel-icon">⚠️</span>
              <span className="validation-panel-summary">
                {getSummaryText()} が見つかりました
              </span>
              <span className={`validation-panel-chevron ${expanded ? "expanded" : ""}`}>
                ▼
              </span>
            </button>

            {expanded && (
              <ul className="validation-panel-list">
                {issues.map((issue, index) => (
                  <li
                    key={`${issue.type}-${issue.location?.t_sec}-${index}`}
                    className={`validation-issue validation-issue--${issue.severity}`}
                  >
                    <span className="validation-issue-icon">
                      {getSeverityIcon(issue.severity)}
                    </span>
                    <span className="validation-issue-message">
                      {issue.message}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="validation-panel-empty">
            <span className="validation-panel-empty-icon">✓</span>
            <span className="validation-panel-empty-text">{getNoIssuesText()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
