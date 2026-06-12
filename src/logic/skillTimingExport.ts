import { SKILL_MAP } from "../data/skills";
import type { JobId, PlanUsage, SkillId } from "../types";

export const AST_JOB_ID = "healer.ast" as const satisfies JobId;

/** BossMod 手入力など向けの短い表示名（未登録は SKILL_MAP の name を使用） */
const EXPORT_SKILL_LABEL: Partial<Record<SkillId, string>> = {
  "healer.ast.neutral_sect": "ニュートラル",
  "healer.ast.horoscope": "ホロスコープ",
  "healer.ast.collective_unconscious": "運命の輪",
  "healer.ast.lightspeed": "アーサリー",
  "healer.ast.earthly_star": "地星",
  "healer.ast.macrocosmos": "マクロ",
  "healer.ast.celestial_opposition": "星天",
  "healer.ast.sun_sign": "サンサイン",
  "healer.ast.exaltation": "エクザル",
  "healer.ast.aspected_helios": "ヘリオス",
  "healer.ast.helios": "ヘリオス",
  "healer.ast.celestial_intersection": "天交",
};

function canonicalSkillId(skillId: SkillId): SkillId {
  return SKILL_MAP[skillId]?.evolveBaseSkillId ?? skillId;
}

/** 占星術師のスキル配置か（ジョブ行 + スキル ID 両方） */
export function isAstPlanUsage(usage: PlanUsage): boolean {
  if (usage.jobId !== AST_JOB_ID) {
    return false;
  }
  const canonical = canonicalSkillId(usage.skillId);
  return canonical.startsWith(`${AST_JOB_ID}.`);
}

function skillExportLabel(skillId: SkillId): string {
  const canonical = canonicalSkillId(skillId);
  return EXPORT_SKILL_LABEL[canonical] ?? SKILL_MAP[canonical]?.name ?? skillId;
}

/** プル秒を出力用に整形（整数優先、必要なら小数1桁） */
function formatPullSec(t_sec: number): string {
  const rounded = Math.round(t_sec * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export interface SkillTimingExportLine {
  skillId: SkillId;
  label: string;
  times: number[];
}

/** 配置済みスキルをスキルごとにグループ化（占星術師のみ） */
export function buildSkillTimingExportLines(usages: PlanUsage[]): SkillTimingExportLine[] {
  /** @type {Map<SkillId, Set<number>>} */
  const grouped = new Map<SkillId, Set<number>>();

  for (const usage of usages) {
    if (!isAstPlanUsage(usage)) {
      continue;
    }
    const key = canonicalSkillId(usage.skillId);
    const times = grouped.get(key) ?? new Set<number>();
    times.add(usage.t_sec);
    grouped.set(key, times);
  }

  const lines: SkillTimingExportLine[] = [];
  for (const [skillId, timeSet] of grouped) {
    lines.push({
      skillId,
      label: skillExportLabel(skillId),
      times: [...timeSet].sort((a, b) => a - b),
    });
  }

  lines.sort(
    (a, b) =>
      a.times[0] - b.times[0] ||
      a.label.localeCompare(b.label, "ja")
  );

  return lines;
}

/**
 * 占星術師スキルの秒数テキストを生成。
 * 例: ニュートラル 30,220,
 */
export function formatSkillTimingExport(usages: PlanUsage[]): string {
  const lines = buildSkillTimingExportLines(usages);
  if (lines.length === 0) {
    return "";
  }
  return lines
    .map(({ label, times }) => {
      const body = times.map(formatPullSec).join(",");
      return `${label} ${body},`;
    })
    .join("\n");
}

export function downloadSkillTimingText(fileName: string, text: string) {
  const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
