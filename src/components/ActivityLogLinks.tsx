import { buildXivAnalysisUrl } from "../logic/fflogsLinks";

type Props = {
  fflogsUrl?: string;
  linkClassName?: string;
};

export default function ActivityLogLinks({
  fflogsUrl,
  linkClassName = "text-sky-300 hover:underline",
}: Props) {
  if (!fflogsUrl?.trim()) {
    return <span>—</span>;
  }

  const xivAnalysisUrl = buildXivAnalysisUrl(fflogsUrl);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a href={fflogsUrl} target="_blank" rel="noreferrer" className={linkClassName}>
        FFLogs
      </a>
      {xivAnalysisUrl ? (
        <a href={xivAnalysisUrl} target="_blank" rel="noreferrer" className={linkClassName}>
          XIVAnalysis
        </a>
      ) : null}
    </div>
  );
}
