import { useState } from "react";
import {
  fetchFflogsAccessToken,
  importFflogsTimeline,
  type FflogsTimelineImportResult,
} from "../logic/fflogsTimeline";
import type { JobId, ThemeMode, Timeline } from "../types";

type Props = {
  theme: ThemeMode;
  baseTimeline?: Timeline | null;
  evolveJobs?: readonly JobId[];
  onClose: () => void;
  onImport: (result: FflogsTimelineImportResult) => void;
};

export default function FflogsTimelineImportDialog({
  theme,
  baseTimeline,
  evolveJobs,
  onClose,
  onImport,
}: Props) {
  const [reportUrl, setReportUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [importMode, setImportMode] = useState<"overlay" | "generate">("overlay");
  const [includeAutoAttacks, setIncludeAutoAttacks] = useState(true);
  const [damageMergeWindowSec, setDamageMergeWindowSec] = useState("0");
  const [autoAttackMergeWindowSec, setAutoAttackMergeWindowSec] = useState("1");
  const [cooldownDedupeWindowSec, setCooldownDedupeWindowSec] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTokenLoading, setIsTokenLoading] = useState(false);
  const [message, setMessage] = useState("");
  const isLight = theme === "light";
  const canOverlayCurrentTimeline = Boolean(baseTimeline);
  const resolvedImportMode = canOverlayCurrentTimeline ? importMode : "generate";

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
  const sectionClass = isLight
    ? "rounded-xl border border-slate-200 bg-slate-50"
    : "rounded-xl border border-slate-800 bg-slate-900/60";
  const secondaryButtonClass = isLight
    ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:border-sky-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50";
  const primaryButtonClass = isLight
    ? "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
    : "rounded-lg border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50";

  async function handleFetchToken() {
    setIsTokenLoading(true);
    setMessage("");
    try {
      const result = await fetchFflogsAccessToken({ clientId, clientSecret });
      setAccessToken(result.accessToken);
      setMessage(
        `access_tokenを取得しました。${result.expiresIn ? `有効期限: ${result.expiresIn}秒` : ""}`
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(detail);
    } finally {
      setIsTokenLoading(false);
    }
  }

  async function handleImport() {
    setIsLoading(true);
    setMessage("");
    try {
      const result = await importFflogsTimeline({
        reportUrl,
        accessToken,
        baseTimeline:
          resolvedImportMode === "overlay" ? baseTimeline : undefined,
        evolveJobs,
        options: {
          includeAutoAttacks,
          damageMergeWindowSec: Number(damageMergeWindowSec || 0),
          autoAttackMergeWindowSec: Number(autoAttackMergeWindowSec || 0),
          cooldownDedupeWindowSec: cooldownDedupeWindowSec.trim()
            ? Number(cooldownDedupeWindowSec)
            : undefined,
          unmatchedCooldownLimit: 40,
        },
      });
      onImport(result);
      const unmatchedLines = result.unmatchedCooldowns.map((entry) =>
        `- ${entry.t_sec}s ${entry.abilityName}${
          entry.actorName ? ` / ${entry.actorName}` : ""
        }${entry.actorJobId ? ` (${entry.actorJobId})` : ""} x${entry.count}`
      );
      setMessage(
        [
          `${result.eventCount}件の敵タイムライン、${result.cooldownUsageCount}件のCD使用を読み込みました。`,
          unmatchedLines.length
            ? `未一致のCD候補:\n${unmatchedLines.join("\n")}`
            : "未一致のCD候補はありません。",
        ].join("\n")
      );
      if (unmatchedLines.length === 0) {
        onClose();
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(detail);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={`fixed inset-0 z-[130] flex items-center justify-center px-4 ${overlayClass}`}>
      <div className={`max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 shadow-2xl ${panelClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">FFLogsからタイムライン生成</h2>
            <p className={`mt-1 text-sm ${subtleClass}`}>
              敵タイムラインと、パーティメンバーが使った軽減・CDスキルを読み込みます。
            </p>
          </div>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            閉じる
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <section className={`${sectionClass} p-4`}>
            <label className="block text-sm font-medium">
              FFLogsレポートURL
              <input
                type="url"
                value={reportUrl}
                onChange={(event) => setReportUrl(event.target.value)}
                placeholder="https://www.fflogs.com/reports/xxxx#fight=1"
                className={`${inputClass} mt-2`}
              />
            </label>
            <p className={`mt-2 text-xs ${subtleClass}`}>
              URLにfight番号がない場合は、レポート内の最初のボス戦を使います。
            </p>
          </section>

          {canOverlayCurrentTimeline && (
            <section className={`${sectionClass} space-y-3 p-4`}>
              <div className="text-sm font-medium">取り込み先</div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  checked={importMode === "overlay"}
                  onChange={() => setImportMode("overlay")}
                  className="mt-1"
                />
                <span>
                  選択中の敵タイムラインを複製して、LogsのCD使用を重ねる
                  <span className={`block text-xs ${subtleClass}`}>
                    既存の攻撃タイムラインを保ったまま、実際の軽減使用だけを追加します。
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="radio"
                  checked={importMode === "generate"}
                  onChange={() => setImportMode("generate")}
                  className="mt-1"
                />
                <span>
                  Logsから敵タイムラインも生成して、CD使用を重ねる
                  <span className={`block text-xs ${subtleClass}`}>
                    敵の詠唱・ダメージもFFLogsから作り直します。
                  </span>
                </span>
              </label>
            </section>
          )}

          <section className={`${sectionClass} space-y-3 p-4`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Client ID
                <input
                  type="text"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="block text-sm font-medium">
                Client Secret
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  placeholder="FFLogs client secret"
                  className={`${inputClass} mt-2`}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-xs ${subtleClass}`}>
                Client credentials flowでBearer tokenを取得します。入力値は保存しません。
              </p>
              <button
                type="button"
                onClick={handleFetchToken}
                className={secondaryButtonClass}
                disabled={isTokenLoading || !clientId.trim() || !clientSecret.trim()}
              >
                {isTokenLoading ? "取得中..." : "Bearer tokenを取得"}
              </button>
            </div>
          </section>

          <section className={`${sectionClass} p-4`}>
            <label className="block text-sm font-medium">
              FFLogs API Bearer token
              <input
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="eyJ..."
                className={`${inputClass} mt-2`}
              />
            </label>
            <p className={`mt-2 text-xs ${subtleClass}`}>
              既にaccess_tokenを持っている場合は、この欄へ直接貼り付けても使えます。
            </p>
          </section>

          <section className={`${sectionClass} space-y-3 p-4`}>
            <div className="text-sm font-medium">重複・AA調整</div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={includeAutoAttacks}
                onChange={(event) => setIncludeAutoAttacks(event.target.checked)}
              />
              AAをタイムラインに含める
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium">
                同名ダメージまとめ秒
                <input
                  type="number"
                  min="0"
                  value={damageMergeWindowSec}
                  onChange={(event) => setDamageMergeWindowSec(event.target.value)}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="block text-sm font-medium">
                AAまとめ秒
                <input
                  type="number"
                  min="0"
                  value={autoAttackMergeWindowSec}
                  onChange={(event) => setAutoAttackMergeWindowSec(event.target.value)}
                  className={`${inputClass} mt-2`}
                />
              </label>
              <label className="block text-sm font-medium">
                CD重複まとめ秒
                <input
                  type="number"
                  min="0"
                  value={cooldownDedupeWindowSec}
                  onChange={(event) => setCooldownDedupeWindowSec(event.target.value)}
                  placeholder="空欄はスキルごと"
                  className={`${inputClass} mt-2`}
                />
              </label>
            </div>
            <p className={`text-xs ${subtleClass}`}>
              AAや同名ダメージが二重に出る場合は、まとめ秒を1-2秒に上げてください。
            </p>
          </section>

          {message && (
            <div className={`whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm ${subtleClass}`}>
              {message}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleImport}
            className={primaryButtonClass}
            disabled={isLoading || !reportUrl.trim() || !accessToken.trim()}
          >
            {isLoading ? "取得中..." : "読み込み"}
          </button>
        </div>
      </div>
    </div>
  );
}
