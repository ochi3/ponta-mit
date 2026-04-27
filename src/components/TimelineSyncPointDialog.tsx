import { useEffect, useState } from "react";
import { formatClock } from "../logic/youtube";
import type { ThemeMode } from "../types";

type Props = {
  theme: ThemeMode;
  timelineSec: number;
  initialVideoSec: number | null;
  currentVideoSec: number | null;
  onClose: () => void;
  onDelete: () => void;
  onSave: (videoSec: number) => void;
};

function clampSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export default function TimelineSyncPointDialog({
  theme,
  timelineSec,
  initialVideoSec,
  currentVideoSec,
  onClose,
  onDelete,
  onSave,
}: Props) {
  const isLight = theme === "light";
  const [videoSec, setVideoSec] = useState(initialVideoSec ?? currentVideoSec ?? 0);

  useEffect(() => {
    setVideoSec(initialVideoSec ?? currentVideoSec ?? 0);
  }, [currentVideoSec, initialVideoSec, timelineSec]);

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
  const secondaryButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900";
  const primaryButtonClass = isLight
    ? "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600"
    : "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400";

  return (
    <div className={`fixed inset-0 z-[130] flex items-center justify-center px-4 ${overlayClass}`}>
      <div className={`w-full max-w-lg rounded-2xl p-5 shadow-2xl ${panelClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">同期ポイント設定</h2>
            <p className={`mt-1 text-sm ${subtleClass}`}>
              タイムライン {formatClock(timelineSec)} を動画のどの秒数に合わせるか指定します。
            </p>
          </div>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            閉じる
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium">動画秒</label>
            <input
              type="number"
              min={0}
              step={1}
              value={videoSec}
              onChange={(event) => setVideoSec(clampSeconds(Number(event.target.value)))}
              className={`${inputClass} mt-2`}
            />
          </div>

          {currentVideoSec !== null && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setVideoSec(clampSeconds(currentVideoSec))}
                className={secondaryButtonClass}
              >
                現在の動画秒を使う ({formatClock(currentVideoSec)})
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button type="button" onClick={onDelete} className={secondaryButtonClass}>
            同期を削除
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => onSave(clampSeconds(videoSec))}
              className={primaryButtonClass}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
