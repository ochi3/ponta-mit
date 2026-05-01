import type { JobId, PlanUsage, SkillId } from "../types";

export const AST_ASTRAL_DRAW_ID = "healer.ast.astral_draw";
export const AST_UMBRAL_DRAW_ID = "healer.ast.umbral_draw";
export const AST_BALANCE_ID = "healer.ast.the_balance";
export const AST_ARROW_ID = "healer.ast.the_arrow";
export const AST_SPIRE_ID = "healer.ast.the_spire";
export const AST_LORD_ID = "healer.ast.lord_of_crowns";
export const AST_SPEAR_ID = "healer.ast.the_spear";
export const AST_BOLE_ID = "healer.ast.the_bole";
export const AST_EWER_ID = "healer.ast.the_ewer";
export const AST_LADY_ID = "healer.ast.lady_of_crowns";

export const AST_DRAW_CYCLE_SECONDS = 60;

export type AstDrawSkillId =
  | typeof AST_ASTRAL_DRAW_ID
  | typeof AST_UMBRAL_DRAW_ID;

const AST_CARD_SKILL_IDS = new Set<SkillId>([
  AST_BALANCE_ID,
  AST_ARROW_ID,
  AST_SPIRE_ID,
  AST_LORD_ID,
  AST_SPEAR_ID,
  AST_BOLE_ID,
  AST_EWER_ID,
  AST_LADY_ID,
]);

const AST_DRAW_SKILL_IDS = new Set<SkillId>([
  AST_ASTRAL_DRAW_ID,
  AST_UMBRAL_DRAW_ID,
]);

const AST_CARD_IDS_BY_DRAW: Record<AstDrawSkillId, readonly SkillId[]> = {
  [AST_ASTRAL_DRAW_ID]: [AST_BALANCE_ID, AST_ARROW_ID, AST_SPIRE_ID, AST_LORD_ID],
  [AST_UMBRAL_DRAW_ID]: [AST_SPEAR_ID, AST_BOLE_ID, AST_EWER_ID, AST_LADY_ID],
};

export interface AstDrawSlot {
  cycleIndex: number;
  skillId: AstDrawSkillId;
  t_sec: number;
  lineIndex: number;
  source: "auto" | "manual";
  manualUsages: PlanUsage[];
  isConflict: boolean;
}

function sortUsages(usages: readonly PlanUsage[]) {
  return usages
    .slice()
    .sort((a, b) => a.t_sec - b.t_sec || a.lineIndex - b.lineIndex);
}

export function isAstDrawSkill(skillId: string): skillId is AstDrawSkillId {
  return AST_DRAW_SKILL_IDS.has(skillId);
}

export function isAstCardSkill(skillId: string) {
  return AST_CARD_SKILL_IDS.has(skillId);
}

export function isAstManagedSkill(skillId: string) {
  return isAstDrawSkill(skillId) || isAstCardSkill(skillId);
}

export function getAstCycleIndex(sec: number) {
  return Math.max(0, Math.floor(sec / AST_DRAW_CYCLE_SECONDS));
}

export function getAstAutoDrawSkill(cycleIndex: number): AstDrawSkillId {
  return cycleIndex % 2 === 0 ? AST_ASTRAL_DRAW_ID : AST_UMBRAL_DRAW_ID;
}

export function getNextAstDrawSkill(skillId: AstDrawSkillId): AstDrawSkillId {
  return skillId === AST_ASTRAL_DRAW_ID ? AST_UMBRAL_DRAW_ID : AST_ASTRAL_DRAW_ID;
}

export function getAstAutoDrawTime(cycleIndex: number) {
  return cycleIndex * AST_DRAW_CYCLE_SECONDS;
}

export function getAstCardIdsForDraw(skillId: AstDrawSkillId) {
  return AST_CARD_IDS_BY_DRAW[skillId];
}

export function drawGrantsAstCard(drawSkillId: AstDrawSkillId, cardSkillId: string) {
  return AST_CARD_IDS_BY_DRAW[drawSkillId].includes(cardSkillId);
}

export function buildAstDrawSlots(
  jobId: JobId,
  usages: readonly PlanUsage[],
  maxSec: number
) {
  const drawUsages = sortUsages(
    usages.filter(
      (usage) => usage.jobId === jobId && isAstDrawSkill(usage.skillId)
    )
  );
  const manualDrawsByCycle = new Map<number, PlanUsage[]>();

  for (const usage of drawUsages) {
    const cycleIndex = getAstCycleIndex(usage.t_sec);
    const list = manualDrawsByCycle.get(cycleIndex) ?? [];
    list.push(usage);
    manualDrawsByCycle.set(cycleIndex, list);
  }

  const maxCycleIndex = Math.max(0, getAstCycleIndex(maxSec) + 1);
  const slots: AstDrawSlot[] = [];

  for (let cycleIndex = 0; cycleIndex <= maxCycleIndex; cycleIndex++) {
    const prevSlot = slots[slots.length - 1];
    const autoSkillId =
      prevSlot?.skillId ? getNextAstDrawSkill(prevSlot.skillId) : getAstAutoDrawSkill(cycleIndex);
    const autoTime = prevSlot ? prevSlot.t_sec + AST_DRAW_CYCLE_SECONDS : getAstAutoDrawTime(cycleIndex);
    const manualUsages = sortUsages(manualDrawsByCycle.get(cycleIndex) ?? []);
    if (manualUsages.length > 0) {
      const primaryUsage = manualUsages[0];
      slots.push({
        cycleIndex,
        skillId: primaryUsage.skillId as AstDrawSkillId,
        t_sec: primaryUsage.t_sec,
        lineIndex: primaryUsage.lineIndex,
        source: "manual",
        manualUsages,
        isConflict: manualUsages.length > 1,
      });
      continue;
    }

    slots.push({
      cycleIndex,
      skillId: autoSkillId,
      t_sec: autoTime,
      lineIndex: 0,
      source: "auto",
      manualUsages: [],
      isConflict: false,
    });
  }

  return slots;
}

export function getAstSlotAtPoint(
  slots: readonly AstDrawSlot[],
  sec: number,
  lineIndex: number
) {
  let activeSlot: AstDrawSlot | null = null;

  for (const slot of slots) {
    if (slot.t_sec > sec || (slot.t_sec === sec && slot.lineIndex > lineIndex)) {
      break;
    }
    activeSlot = slot;
  }

  return activeSlot;
}

export function getAstNextSlot(
  slots: readonly AstDrawSlot[],
  cycleIndex: number
) {
  return slots.find((slot) => slot.cycleIndex === cycleIndex + 1) ?? null;
}
