import { useMemo } from "react";
import SiteBrandingNav from "../components/SiteBrandingNav";
import { buildActivityNavSummaries } from "../logic/activityRecordStats";

export default function DmuExaflarePage() {
  const activitySummaries = useMemo(() => buildActivityNavSummaries(), []);
  const viewerSrc = `${import.meta.env.BASE_URL}dmu-exaflare/index.html`;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center">
          <SiteBrandingNav current="dmuExa" activitySummaries={activitySummaries} />
        </div>
      </header>
      <iframe
        title="DMU エクサ"
        src={viewerSrc}
        className="min-h-0 w-full flex-1 border-0 bg-[#0b1219]"
        allow="fullscreen"
      />
    </div>
  );
}
