const FFLOGS_REPORT_ID_RE = /\/reports\/([A-Za-z0-9]+)/;

/** FFLogs のレポート URL からレポート ID を取り出す */
export function extractFflogsReportId(fflogsUrl: string): string | null {
  const trimmed = fflogsUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(FFLOGS_REPORT_ID_RE);
    return match?.[1] ?? null;
  } catch {
    const match = trimmed.match(FFLOGS_REPORT_ID_RE);
    return match?.[1] ?? null;
  }
}

/** FFLogs URL に対応する XIVAnalysis URL を生成する */
export function buildXivAnalysisUrl(fflogsUrl: string): string | null {
  const reportId = extractFflogsReportId(fflogsUrl);
  if (!reportId) return null;
  return `https://xivanalysis.com/fflogs/${reportId}`;
}
