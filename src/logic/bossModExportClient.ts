import type { BossModExportRequest, BossModExportResult } from "./bossModExport";

export type BossModExportApiResponse = BossModExportResult & {
  mapPath?: string;
  mapMtime?: string;
  error?: string;
};

/** dev サーバー経由で BossMod plan JSON を生成（本番ビルドでは呼ばない） */
export async function fetchBossModExport(
  request: BossModExportRequest
): Promise<BossModExportApiResponse> {
  const response = await fetch("/__dev/bossmod-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = (await response.json()) as BossModExportApiResponse;
  if (!response.ok) {
    throw new Error(payload.error ?? `BossMod エクスポート失敗 (${response.status})`);
  }
  return payload;
}

export function downloadBossModPlan(fileName: string, plan: unknown) {
  const json = `${JSON.stringify(plan, null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
