import { useMemo, useState } from "react";
import type { Timeline } from "../types";
import {
  formatMomentOptionLabel,
  loadDevTimelineSecondsConfig,
  saveDevTimelineSecondsConfig,
} from "../logic/devTimelineSeconds";

type Props = {
  timeline: Timeline;
  onChange: () => void;
};

export default function DevTimelineSecondsPanel({ timeline, onChange }: Props) {
  const savedConfig = loadDevTimelineSecondsConfig(timeline.id);
  const [open, setOpen] = useState(false);
  const [anchorMomentIndex, setAnchorMomentIndex] = useState(
    savedConfig?.anchorMomentIndex ?? 0
  );
  const [anchorStartSec, setAnchorStartSec] = useState(
    savedConfig?.anchorStartSec ?? 0
  );

  const momentOptions = useMemo(
    () =>
      [...timeline.moments].sort(
        (a, b) =>
          a.t_sec - b.t_sec ||
          (a.order ?? 0) - (b.order ?? 0) ||
          a.name.localeCompare(b.name, "ja")
      ),
    [timeline.moments]
  );

  function handleApply() {
    if (momentOptions.length === 0) {
      return;
    }

    saveDevTimelineSecondsConfig(timeline.id, {
      version: 1,
      anchorMomentIndex,
      anchorStartSec: Math.trunc(anchorStartSec),
    });
    onChange();
    setOpen(false);
  }

  function handleReset() {
    saveDevTimelineSecondsConfig(timeline.id, null);
    onChange();
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded border border-amber-500/50 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-900/50"
        title="dev 専用: タイムライン秒数をローカルに上書き"
      >
        秒数編集(dev)
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[120] mt-2 w-[min(92vw,28rem)] rounded-lg border border-amber-500/40 bg-slate-950 p-3 text-left shadow-xl">
          <p className="mb-2 text-[11px] leading-relaxed text-slate-300">
            選んだイベントを基準に、以降の行へ
            <strong className="font-normal text-amber-200">「参考秒」列</strong>
            を表示します（基準行の差分を全体に加算。同じ秒の行は同じ参考秒）。
            CD 配置やタイムラインの内部秒数は変わりません。
          </p>

          <label className="mb-2 block text-[11px] text-slate-400">
            開始イベント
            <select
              value={anchorMomentIndex}
              onChange={(event) => setAnchorMomentIndex(Number(event.target.value))}
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            >
              {momentOptions.map((moment, index) => (
                <option key={`${index}-${moment.name}-${moment.order ?? 0}`} value={index}>
                  {formatMomentOptionLabel(moment, index)}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 block text-[11px] text-slate-400">
            開始秒数
            <input
              type="number"
              value={anchorStartSec}
              onChange={(event) => setAnchorStartSec(Number(event.target.value))}
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="rounded bg-amber-600 px-3 py-1 text-xs text-white hover:bg-amber-500"
            >
              適用
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
            >
              リセット
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded px-3 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              閉じる
            </button>
          </div>

          {savedConfig && (
            <p className="mt-2 text-[10px] text-amber-200/80">
              現在: #{savedConfig.anchorMomentIndex + 1} から{" "}
              {savedConfig.anchorStartSec}s 始まり（参考秒列に表示）
            </p>
          )}
        </div>
      )}
    </div>
  );
}
