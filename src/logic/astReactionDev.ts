export type AstReactionCopyResult = {
  ok: boolean;
  message: string;
};

/** 開発モード専用: AST スキルに対応する反応マクロコードをクリップボードへコピー */
export async function copyAstReactionCode(
  skillId: string,
  skillName: string
): Promise<AstReactionCopyResult> {
  const params = new URLSearchParams({ skillId, name: skillName });
  // 同一 URL の GET がブラウザキャッシュされると更新前のコードが返るため毎回無効化する
  params.set("_", String(Date.now()));
  const response = await fetch(`/__dev/ast-reaction-code?${params.toString()}`, {
    cache: "no-store",
  });

  let payload: {
    code?: string;
    excelName?: string;
    error?: string;
    hint?: string;
    sourceMtime?: string;
  } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return { ok: false, message: "反応マクロの取得に失敗しました。" };
  }

  if (!response.ok || !payload.code) {
    const detail = payload.hint ? `（${payload.hint}）` : "";
    return {
      ok: false,
      message: `${payload.error ?? "反応マクロの取得に失敗しました。"}${detail}`,
    };
  }

  try {
    await navigator.clipboard.writeText(payload.code);
  } catch {
    return { ok: false, message: "クリップボードへのコピーに失敗しました。" };
  }

  const label = payload.excelName ?? skillName;
  const updatedAt = payload.sourceMtime ? `（定義ファイル更新: ${payload.sourceMtime}）` : "";
  return { ok: true, message: `「${label}」の反応マクロをコピーしました。${updatedAt}` };
}
