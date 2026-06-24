import type { PlanUsage, JobId, SkillData } from "../types";
import { SKILL_MAP } from "../data/skills";
import { applyBarShapes, type CellVisualState } from "../components/cellStyles";
import { getEffectDurationS } from "./skillEffect";
import {
  getParentChildWindowEndSec,
  isChildWithinParentWindow,
} from "./parentChildSkills";
import {
  drawGrantsAstCard,
  getAstNextSlot,
  getAstSlotAtPoint,
  isAstCardSkill,
  isAstDrawSkill,
  type AstDrawSlot,
} from "./astCards";
import {
  getChargeCapacity,
  getChargeStateBeforePoint,
  isChargeSkill,
  simulateChargeUsages,
} from "./skillCharges";
import {
  getSchAetherflowStateAtPoint,
  isSchAetherflowSkill,
  isSchAetherflowSpenderSkill,
  type SchAetherflowSimulation,
} from "./schAetherflow";
import {
  getWhmLilyStateAtPoint,
  isWhmLilyConsumerSkill,
  isWhmLilySkill,
  type WhmLilySimulation,
} from "./whmLilies";
import {
  isSgeAddersgallSkill,
  isSgeAddersgallSpenderSkill,
  type SgeAddersgallSimulation,
} from "./sgeAddersgall";

export type GridVisualColumn = {
  jobId: JobId;
  jobName: string;
  skill: SkillData;
};

type TimelineRow = {
  sec: number;
  secIndex: number;
  line: { label: string; showTime: boolean; moment?: import("../types").Moment };
  lineIndex: number;
  lineCount: number;
  rowIndex: number;
};

function comparePoints(
  leftSec: number,
  leftLineIndex: number,
  rightSec: number,
  rightLineIndex: number
) {
  if (leftSec !== rightSec) {
    return leftSec - rightSec;
  }
  return leftLineIndex - rightLineIndex;
}

export type GridVisualContext = {
  rows: readonly TimelineRow[];
  rowToSec: readonly number[];
  rowIndexLookup: ReadonlyMap<string, number>;
  usagesByJobSkill: ReadonlyMap<string, readonly PlanUsage[]>;
  invalidPlacementKeys: ReadonlySet<string>;
  astDrawSlotsByJob: ReadonlyMap<JobId, readonly AstDrawSlot[]>;
  whmLilySimulationByJob: ReadonlyMap<JobId, WhmLilySimulation>;
  schAetherflowSimulationByJob: ReadonlyMap<JobId, SchAetherflowSimulation>;
  sgeAddersgallSimulationByJob: ReadonlyMap<JobId, SgeAddersgallSimulation>;
  sgeAddersgallStateByRowByJob: ReadonlyMap<
    JobId,
    readonly { available: number; nextGainSec: number | null }[]
  >;
};

function serializeUsages(usages: readonly PlanUsage[]): string {
  return usages.map((usage) => `${usage.t_sec}:${usage.lineIndex}`).join(",");
}

function serializeAstDrawSlots(slots: readonly AstDrawSlot[] | undefined): string {
  if (!slots?.length) {
    return "";
  }
  return slots
    .map(
      (slot) =>
        `${slot.cycleIndex}:${slot.t_sec}:${slot.lineIndex}:${slot.skillId}:${slot.isConflict ? 1 : 0}`
    )
    .join("|");
}

export function buildColumnDepKey(
  col: GridVisualColumn,
  ctx: GridVisualContext
): string {
  const jobSkillKey = `${col.jobId}::${col.skill.id}`;
  const skillUsages = ctx.usagesByJobSkill.get(jobSkillKey) ?? [];
  const parts = [String(ctx.rows.length), serializeUsages(skillUsages)];

  const parentSkillId = col.skill.parentSkillId;
  if (parentSkillId) {
    parts.push(
      serializeUsages(
        ctx.usagesByJobSkill.get(`${col.jobId}::${parentSkillId}`) ?? []
      )
    );
  }

  const invalidForCol = [...ctx.invalidPlacementKeys]
    .filter((key) => key.startsWith(`${jobSkillKey}::`))
    .sort();
  parts.push(invalidForCol.join(","));

  if (
    col.jobId === "healer.ast" ||
    isAstDrawSkill(col.skill.id) ||
    isAstCardSkill(col.skill.id)
  ) {
    parts.push(serializeAstDrawSlots(ctx.astDrawSlotsByJob.get(col.jobId)));
  }

  if (
    col.jobId === "healer.whm" &&
    (isWhmLilySkill(col.skill.id) || isWhmLilyConsumerSkill(col.skill.id))
  ) {
    const simulation = ctx.whmLilySimulationByJob.get(col.jobId);
    parts.push(
      simulation
        ? `${simulation.manualOverrideKeys.size}:${simulation.useSimulationByUsageKey.size}`
        : "0"
    );
  }

  if (
    col.jobId === "healer.sch" &&
    (isSchAetherflowSkill(col.skill.id) ||
      isSchAetherflowSpenderSkill(col.skill.id))
  ) {
    const simulation = ctx.schAetherflowSimulationByJob.get(col.jobId);
    parts.push(
      simulation
        ? `${simulation.slots.length}:${simulation.aetherflowConflictKeys.size}`
        : "0"
    );
  }

  if (
    col.jobId === "healer.sge" &&
    (isSgeAddersgallSkill(col.skill.id) ||
      isSgeAddersgallSpenderSkill(col.skill.id))
  ) {
    const simulation = ctx.sgeAddersgallSimulationByJob.get(col.jobId);
    parts.push(
      simulation
        ? `${simulation.manualOverrideKeys.size}:${simulation.useSimulationByUsageKey.size}`
        : "0"
    );
  }

  return parts.join(";");
}

export function computeGridVisualColumn(
  col: GridVisualColumn,
  ctx: GridVisualContext
): CellVisualState[] {
  const {
    rows,
    rowToSec,
    rowIndexLookup,
    usagesByJobSkill,
    invalidPlacementKeys,
    astDrawSlotsByJob,
    whmLilySimulationByJob,
    schAetherflowSimulationByJob,
    sgeAddersgallSimulationByJob,
    sgeAddersgallStateByRowByJob,
  } = ctx;

  const columnVisual = Array<CellVisualState>(rows.length).fill({
    color: "none",
    checked: false,
    shape: "none",
  });

      // col は引数
      const parentSkillId = col.skill.parentSkillId;
      const jobSkillKey = `${col.jobId}::${col.skill.id}`;
      const skillUsages = usagesByJobSkill.get(jobSkillKey) ?? [];

      // Calculate valid time ranges for child skills (where parent is active)
      let parentActiveRows: boolean[] = [];
      let parentUsages: readonly PlanUsage[] = [];
      
      if (parentSkillId) {
        parentActiveRows = Array(rows.length).fill(false);
        const parentSkill = SKILL_MAP[parentSkillId];
        const parentDuration = parentSkill?.duration_s ?? 0;

        // Get parent usages from index
        const parentKey = `${col.jobId}::${parentSkillId}`;
        parentUsages = usagesByJobSkill.get(parentKey) ?? [];

        if (parentUsages.length > 0 && parentDuration > 0) {
          // Sort parent usages by time
          const sortedParentUsages = parentUsages.slice().sort((a, b) => a.t_sec - b.t_sec);
          
          // Use pointer to track relevant parent usages
          let puIdx = 0;
          for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const rowSec = row.sec;
            
            // Move pointer forward past usages that have ended
            while (
              puIdx < sortedParentUsages.length &&
              getParentChildWindowEndSec(
                sortedParentUsages[puIdx].t_sec,
                parentDuration,
                col.skill
              ) < rowSec
            ) {
              puIdx++;
            }
            
            // Check if any active parent usage covers this row
            for (let i = puIdx; i < sortedParentUsages.length; i++) {
              const pu = sortedParentUsages[i];
              // If this usage starts after current row, no need to check more
              if (pu.t_sec > rowSec) break;
              
              const startSec = pu.t_sec;
              const endSec = getParentChildWindowEndSec(startSec, parentDuration, col.skill);
              
              if (rowSec > startSec && rowSec <= endSec) {
                parentActiveRows[r] = true;
                break;
              } else if (rowSec === startSec && row.lineIndex >= pu.lineIndex) {
                parentActiveRows[r] = true;
                break;
              }
            }
          }
        }
      }

      // 按使用记录标记影响的行 (反向思路：遍历使用记录，标记影响的行)
      const dur = col.skill.duration_s ?? 0;

      const findFirstRowAtOrAfter = (targetSec: number): number => {
        let lo = 0, hi = rows.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (rowToSec[mid] < targetSec) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };

      const astDrawSlots = astDrawSlotsByJob.get(col.jobId) ?? [];
      if (isAstDrawSkill(col.skill.id) && astDrawSlots.length > 0) {
        const conflictKeys = new Set<string>();
        for (const slot of astDrawSlots) {
          if (!slot.isConflict) {
            continue;
          }
          for (const usage of slot.manualUsages) {
            conflictKeys.add(`${usage.t_sec}::${usage.lineIndex}::${usage.skillId}`);
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const rowKey = `${row.sec}::${row.lineIndex}::${col.skill.id}`;
          const activeSlot = astDrawSlots.find(
            (slot) =>
              slot.skillId === col.skill.id &&
              slot.t_sec === row.sec &&
              slot.lineIndex === row.lineIndex
          );

          let color: "none" | "green" | "blue" | "red" | "conflict" = "none";
          let checked = false;

          if (conflictKeys.has(rowKey)) {
            color = "conflict";
            checked = true;
          } else if (activeSlot) {
            color = activeSlot.isConflict ? "conflict" : "green";
            checked = true;
          }

          columnVisual[r] = { color, checked, shape: "none" };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      if (isAstCardSkill(col.skill.id) && astDrawSlots.length > 0) {
        const cardUsagesByCycle = new Map<number, PlanUsage[]>();
        for (const usage of skillUsages.slice().sort((a, b) => a.t_sec - b.t_sec || a.lineIndex - b.lineIndex)) {
          const slotAtUsage = getAstSlotAtPoint(
            astDrawSlots,
            usage.t_sec,
            usage.lineIndex
          );
          if (!slotAtUsage) {
            continue;
          }
          const cycleIndex = slotAtUsage.cycleIndex;
          const list = cardUsagesByCycle.get(cycleIndex) ?? [];
          list.push(usage);
          cardUsagesByCycle.set(cycleIndex, list);
        }

        const firstValidUsageByCycle = new Map<number, PlanUsage>();
        const duplicateUsageKeys = new Set<string>();
        const invalidUsageKeys = new Set<string>();

        for (const [cycleIndex, cycleUsages] of cardUsagesByCycle.entries()) {
          const slot = astDrawSlots.find((entry) => entry.cycleIndex === cycleIndex);
          const grantedBySlot = slot ? drawGrantsAstCard(slot.skillId, col.skill.id) : false;

          if (!slot || !grantedBySlot) {
            for (const usage of cycleUsages) {
              invalidUsageKeys.add(`${usage.t_sec}::${usage.lineIndex}`);
            }
            continue;
          }

          const validUsages = cycleUsages.filter(
            (usage) =>
              comparePoints(
                usage.t_sec,
                usage.lineIndex,
                slot.t_sec,
                slot.lineIndex
              ) >= 0
          );
          const firstValidUsage = validUsages[0];

          if (firstValidUsage) {
            firstValidUsageByCycle.set(cycleIndex, firstValidUsage);
          }

          for (const usage of cycleUsages) {
            const usageKey = `${usage.t_sec}::${usage.lineIndex}`;
            if (!firstValidUsage) {
              invalidUsageKeys.add(usageKey);
              continue;
            }

            if (
              usage.t_sec === firstValidUsage.t_sec &&
              usage.lineIndex === firstValidUsage.lineIndex
            ) {
              continue;
            }

            duplicateUsageKeys.add(usageKey);
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const slot = getAstSlotAtPoint(astDrawSlots, row.sec, row.lineIndex);
          const nextSlot = slot ? getAstNextSlot(astDrawSlots, slot.cycleIndex) : null;
          const cycleUsages = slot ? cardUsagesByCycle.get(slot.cycleIndex) ?? [] : [];
          const grantedBySlot = slot ? drawGrantsAstCard(slot.skillId, col.skill.id) : false;
          const usageAtRow = cycleUsages.find(
            (usage) => usage.t_sec === row.sec && usage.lineIndex === row.lineIndex
          );
          const firstValidUsage = slot
            ? firstValidUsageByCycle.get(slot.cycleIndex) ?? null
            : null;
          const usageAtRowKey = usageAtRow
            ? `${usageAtRow.t_sec}::${usageAtRow.lineIndex}`
            : null;

          const afterDraw = (() => {
            if (!slot || !grantedBySlot) {
              return false;
            }

            return (
              row.sec > slot.t_sec ||
              (row.sec === slot.t_sec && row.lineIndex >= slot.lineIndex)
            );
          })();
          let activeEffectUsage: PlanUsage | null = null;
          if ((col.skill.duration_s ?? 0) > 0) {
            for (const usage of Array.from(firstValidUsageByCycle.values())) {
              const effectEndSec = usage.t_sec + (col.skill.duration_s ?? 0);
              if (
                comparePoints(row.sec, row.lineIndex, usage.t_sec, usage.lineIndex) >= 0 &&
                row.sec < effectEndSec
              ) {
                activeEffectUsage = usage;
              }
            }
          }
          const beforeFirstUse =
            !firstValidUsage ||
            row.sec < firstValidUsage.t_sec ||
            (row.sec === firstValidUsage.t_sec && row.lineIndex < firstValidUsage.lineIndex);

          let color: "none" | "green" | "blue" | "red" | "conflict" = "none";
          let checked = false;

          if (usageAtRow) {
            checked = true;
            if (
              !slot ||
              !grantedBySlot ||
              !usageAtRowKey ||
              invalidUsageKeys.has(usageAtRowKey) ||
              duplicateUsageKeys.has(usageAtRowKey)
            ) {
              color = "conflict";
            } else {
              color = "green";
            }
          } else if (activeEffectUsage) {
            color = "green";
          } else if (afterDraw && beforeFirstUse) {
            color = "blue";
          } else if (
            afterDraw &&
            firstValidUsage &&
            (!nextSlot ||
              comparePoints(
                row.sec,
                row.lineIndex,
                nextSlot.t_sec,
                nextSlot.lineIndex
              ) < 0)
          ) {
            color = "red";
          }

          columnVisual[r] = { color, checked, shape: "none" };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      const whmLilySimulation = whmLilySimulationByJob.get(col.jobId);
      if (isWhmLilySkill(col.skill.id) && whmLilySimulation) {
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const rowKey = `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`;
          const lilyState = getWhmLilyStateAtPoint(
            whmLilySimulation,
            row.sec,
            row.lineIndex
          );
          const checked = whmLilySimulation.manualOverrideKeys.has(rowKey);

          columnVisual[r] = {
            color: checked ? "green" : "none",
            checked,
            shape: "none",
            chargeCount: lilyState.lilies,
            bloodCount: lilyState.bloodLilies,
          };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      if (isWhmLilyConsumerSkill(col.skill.id) && whmLilySimulation) {
        const cd = Math.max(0, Math.floor(col.skill.cooldown_s ?? 0));
        const effectCounts = new Array(rows.length).fill(0);
        const cooldownCounts = new Array(rows.length).fill(0);
        const checkedRows = new Set<number>();
        const skillUsageSimulations = skillUsages
          .map((usage) =>
            whmLilySimulation.useSimulationByUsageKey.get(
              `${usage.jobId}::${usage.skillId}::${usage.t_sec}::${usage.lineIndex}`
            )
          )
          .filter((simulation): simulation is NonNullable<typeof simulation> => Boolean(simulation));

        const findFirstRowAfter = (targetSec: number): number => {
          let lo = 0, hi = rows.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (rowToSec[mid] <= targetSec) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        };

        for (const simulation of skillUsageSimulations) {
          const startRowIdx = rowIndexLookup.get(
            `${simulation.usage.t_sec}::${simulation.usage.lineIndex}`
          );
          if (startRowIdx !== undefined) {
            checkedRows.add(startRowIdx);
          }

          if (!simulation.isValid) {
            continue;
          }

          if (dur > 0) {
            const effectEndSec = simulation.usage.t_sec + dur;
            const effectStartRow = findFirstRowAtOrAfter(simulation.usage.t_sec);
            const effectEndRow = findFirstRowAtOrAfter(effectEndSec);

            for (let r = effectStartRow; r < effectEndRow; r++) {
              const row = rows[r];
              if (
                row.sec === simulation.usage.t_sec &&
                row.lineIndex < simulation.usage.lineIndex
              ) {
                continue;
              }
              effectCounts[r] += 1;
            }
          }

          if (cd > 0) {
            const cdStartSec = simulation.usage.t_sec + dur;
            const cdEndSec = simulation.usage.t_sec + cd;

            if (cdStartSec < cdEndSec) {
              const cdStartRow = findFirstRowAtOrAfter(cdStartSec);
              const cdEndRow = findFirstRowAfter(cdEndSec);

              for (let r = cdStartRow; r < cdEndRow; r++) {
                cooldownCounts[r] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const checked = checkedRows.has(r);
          const simulation = whmLilySimulation.useSimulationByUsageKey.get(
            `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`
          );
          const effectCount = effectCounts[r];
          const cooldownCount = cooldownCounts[r];

          let color: "none" | "green" | "blue" | "red" | "conflict" = "none";

          if (simulation && !simulation.isValid) {
            color = "conflict";
          } else if (effectCount >= 1 || checked) {
            color = "green";
          } else if (cooldownCount >= 1) {
            color = "red";
          }

          columnVisual[r] = {
            color,
            checked,
            shape: "none",
          };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      const sgeAddersgallSimulation = sgeAddersgallSimulationByJob.get(col.jobId);
      const sgeAddersgallRowStates = sgeAddersgallStateByRowByJob.get(col.jobId);
      if (isSgeAddersgallSkill(col.skill.id) && sgeAddersgallSimulation && sgeAddersgallRowStates) {
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const rowKey = `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`;
          const addersgallState = sgeAddersgallRowStates[r];
          const checked = sgeAddersgallSimulation.manualOverrideKeys.has(rowKey);

          columnVisual[r] = {
            color: checked ? "green" : "none",
            checked,
            shape: "none",
            chargeCount: addersgallState.available,
          };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      if (isSgeAddersgallSpenderSkill(col.skill.id) && sgeAddersgallSimulation) {
        const cd = Math.max(0, Math.floor(col.skill.cooldown_s ?? 0));
        const effectCounts = new Array(rows.length).fill(0);
        const cooldownCounts = new Array(rows.length).fill(0);
        const checkedRows = new Set<number>();
        const skillUsageSimulations = skillUsages
          .map((usage) =>
            sgeAddersgallSimulation.useSimulationByUsageKey.get(
              `${usage.jobId}::${usage.skillId}::${usage.t_sec}::${usage.lineIndex}`
            )
          )
          .filter((simulation): simulation is NonNullable<typeof simulation> => Boolean(simulation));

        const findFirstRowAfter = (targetSec: number): number => {
          let lo = 0, hi = rows.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (rowToSec[mid] <= targetSec) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        };

        for (const simulation of skillUsageSimulations) {
          const startRowIdx = rowIndexLookup.get(
            `${simulation.usage.t_sec}::${simulation.usage.lineIndex}`
          );
          if (startRowIdx !== undefined) {
            checkedRows.add(startRowIdx);
          }

          if (!simulation.isValid) {
            continue;
          }

          if (dur > 0) {
            const effectEndSec = simulation.usage.t_sec + dur;
            const effectStartRow = findFirstRowAtOrAfter(simulation.usage.t_sec);
            const effectEndRow = findFirstRowAtOrAfter(effectEndSec);

            for (let r = effectStartRow; r < effectEndRow; r++) {
              const row = rows[r];
              if (
                row.sec === simulation.usage.t_sec &&
                row.lineIndex < simulation.usage.lineIndex
              ) {
                continue;
              }
              effectCounts[r] += 1;
            }
          }

          if (cd > 0) {
            const cdStartSec = simulation.usage.t_sec + dur;
            const cdEndSec = simulation.usage.t_sec + cd;

            if (cdStartSec < cdEndSec) {
              const cdStartRow = findFirstRowAtOrAfter(cdStartSec);
              const cdEndRow = findFirstRowAfter(cdEndSec);

              for (let r = cdStartRow; r < cdEndRow; r++) {
                cooldownCounts[r] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const checked = checkedRows.has(r);
          const simulation = sgeAddersgallSimulation.useSimulationByUsageKey.get(
            `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`
          );
          const effectCount = effectCounts[r];
          const cooldownCount = cooldownCounts[r];

          let color: "none" | "green" | "blue" | "red" | "conflict" = "none";

          if (simulation && !simulation.isValid) {
            color = "conflict";
          } else if (effectCount >= 1 || checked) {
            color = "green";
          } else if (cooldownCount >= 1) {
            color = "red";
          }

          columnVisual[r] = {
            color,
            checked,
            shape: "none",
          };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      const schAetherflowSimulation = schAetherflowSimulationByJob.get(col.jobId);
      if (isSchAetherflowSkill(col.skill.id) && schAetherflowSimulation) {
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const rowKey = `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`;
          const activeSlot = schAetherflowSimulation.slots.find(
            (slot) => slot.t_sec === row.sec && slot.lineIndex === row.lineIndex
          );
          const aetherflowState = getSchAetherflowStateAtPoint(
            schAetherflowSimulation,
            row.sec,
            row.lineIndex
          );

          let color: "none" | "green" | "blue" | "red" | "conflict" = "none";
          let checked = false;

          if (schAetherflowSimulation.aetherflowConflictKeys.has(rowKey)) {
            color = "conflict";
            checked = true;
          } else if (activeSlot) {
            color = activeSlot.isConflict ? "conflict" : "green";
            checked = true;
          }

          columnVisual[r] = {
            color,
            checked,
            shape: "none",
            chargeCount: aetherflowState.available,
          };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      if (isSchAetherflowSpenderSkill(col.skill.id) && schAetherflowSimulation) {
        const cd = Math.max(0, Math.floor(col.skill.cooldown_s ?? 0));
        const effectCounts = new Array(rows.length).fill(0);
        const cooldownCounts = new Array(rows.length).fill(0);
        const checkedRows = new Set<number>();
        const skillUsageSimulations = skillUsages
          .map((usage) =>
            schAetherflowSimulation.spendSimulationByUsageKey.get(
              `${usage.jobId}::${usage.skillId}::${usage.t_sec}::${usage.lineIndex}`
            )
          )
          .filter((simulation): simulation is NonNullable<typeof simulation> => Boolean(simulation));

        const findFirstRowAfter = (targetSec: number): number => {
          let lo = 0, hi = rows.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (rowToSec[mid] <= targetSec) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        };

        for (const simulation of skillUsageSimulations) {
          const startRowIdx = rowIndexLookup.get(
            `${simulation.usage.t_sec}::${simulation.usage.lineIndex}`
          );
          if (startRowIdx !== undefined) {
            checkedRows.add(startRowIdx);
          }

          if (!simulation.isValid) {
            continue;
          }

          if (dur > 0) {
            const effectEndSec = simulation.usage.t_sec + dur;
            const effectStartRow = findFirstRowAtOrAfter(simulation.usage.t_sec);
            const effectEndRow = findFirstRowAtOrAfter(effectEndSec);

            for (let r = effectStartRow; r < effectEndRow; r++) {
              const row = rows[r];
              if (
                row.sec === simulation.usage.t_sec &&
                row.lineIndex < simulation.usage.lineIndex
              ) {
                continue;
              }
              effectCounts[r] += 1;
            }
          }

          if (cd > 0) {
            const cdStartSec = simulation.usage.t_sec + dur;
            const cdEndSec = simulation.usage.t_sec + cd;

            if (cdStartSec < cdEndSec) {
              const cdStartRow = findFirstRowAtOrAfter(cdStartSec);
              const cdEndRow = findFirstRowAfter(cdEndSec);

              for (let r = cdStartRow; r < cdEndRow; r++) {
                cooldownCounts[r] += 1;
              }
            }
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const checked = checkedRows.has(r);
          const simulation = schAetherflowSimulation.spendSimulationByUsageKey.get(
            `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`
          );
          const effectCount = effectCounts[r];
          const cooldownCount = cooldownCounts[r];

          let color: "none" | "green" | "blue" | "red" | "conflict" = "none";

          if (simulation && !simulation.isValid) {
            color = "conflict";
          } else if (effectCount >= 1 || checked) {
            color = "green";
          } else if (cooldownCount >= 1) {
            color = "red";
          }

          columnVisual[r] = {
            color,
            checked,
            shape: "none",
          };
        }

        applyBarShapes(columnVisual);
        return columnVisual;
      }

      if (isChargeSkill(col.skill)) {
        const chargeCapacity = getChargeCapacity(col.skill);
        const checkedRows = new Set<number>();
        const effectCounts = new Array(rows.length).fill(0);
        const usageSimulation = simulateChargeUsages(col.skill, skillUsages);
        const usageSimulationByRow = new Map<string, (typeof usageSimulation)[number]>();

        for (const simulation of usageSimulation) {
          usageSimulationByRow.set(
            `${simulation.usage.t_sec}::${simulation.usage.lineIndex}`,
            simulation
          );

          const startRowIdx = rowIndexLookup.get(
            `${simulation.usage.t_sec}::${simulation.usage.lineIndex}`
          );
          if (startRowIdx !== undefined) {
            checkedRows.add(startRowIdx);
          }

          if (dur > 0) {
            const effectEndSec = simulation.usage.t_sec + dur;
            const effectStartRow = findFirstRowAtOrAfter(simulation.usage.t_sec);
            const effectEndRow = findFirstRowAtOrAfter(effectEndSec);

            for (let r = effectStartRow; r < effectEndRow; r++) {
              const row = rows[r];
              if (
                row.sec === simulation.usage.t_sec &&
                row.lineIndex < simulation.usage.lineIndex
              ) {
                continue;
              }
              effectCounts[r] += simulation.cost;
            }
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const checked = checkedRows.has(r);
          const simulation = usageSimulationByRow.get(`${row.sec}::${row.lineIndex}`);
          const chargeState = getChargeStateBeforePoint(
            col.skill,
            skillUsages,
            row.sec,
            row.lineIndex
          );
          const effectCount = effectCounts[r];

          let color: "none" | "green" | "red" | "conflict" = "none";

          if (simulation && !simulation.isValid) {
            color = "conflict";
          } else if (effectCount > chargeCapacity) {
            color = "conflict";
          } else if (effectCount >= 1 || checked) {
            color = "green";
          } else if (chargeState.available === 0) {
            color = "red";
          }

          columnVisual[r] = {
            color,
            checked,
            shape: "none",
            chargeCount: chargeState.available,
            chargeCapacity,
          };
        }
      } else {
        const cd = col.skill.cooldown_s ?? 0;
        const effectCounts = new Array(rows.length).fill(0);
        const cooldownCounts = new Array(rows.length).fill(0);
        const checkedRows = new Set<number>();

        const findFirstRowAfter = (targetSec: number): number => {
          let lo = 0, hi = rows.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (rowToSec[mid] <= targetSec) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        };

        for (const u of skillUsages) {
          const startRowIdx = rowIndexLookup.get(`${u.t_sec}::${u.lineIndex}`);
          if (startRowIdx !== undefined) {
            checkedRows.add(startRowIdx);
          }

          const usageDur = getEffectDurationS(col.skill, u);
          if (usageDur > 0) {
            const effectEndSec = u.t_sec + usageDur;
            const effectStartRow = findFirstRowAtOrAfter(u.t_sec);
            const effectEndRow = findFirstRowAtOrAfter(effectEndSec);

            for (let r = effectStartRow; r < effectEndRow; r++) {
              const row = rows[r];
              if (row.sec === u.t_sec && row.lineIndex < u.lineIndex) continue;
              effectCounts[r]++;
            }
          }

          if (cd > 0) {
            const cdStartSec = u.t_sec + usageDur;
            const cdEndSec = u.t_sec + cd;

            if (cdStartSec < cdEndSec) {
              const cdStartRow = findFirstRowAtOrAfter(cdStartSec);
              const cdEndRow = findFirstRowAfter(cdEndSec);

              for (let r = cdStartRow; r < cdEndRow; r++) {
                cooldownCounts[r]++;
              }
            }
          }
        }

        for (let r = 0; r < rows.length; r++) {
          const effectCount = effectCounts[r];
          const cooldownCount = cooldownCounts[r];
          const checked = checkedRows.has(r);
          const row = rows[r];
          const placementKey = `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`;
          const isInvalidPlacement = checked && invalidPlacementKeys.has(placementKey);

          let color: "none" | "green" | "red" | "conflict" = "none";

          if (isInvalidPlacement) {
            color = "conflict";
          } else if (effectCount >= 1 || checked) {
            color = "green";
          } else if (cooldownCount >= 1) {
            color = "red";
          }

          columnVisual[r] = { color, checked, shape: "none" };
        }
      }

      // For child skills: check for conflicts
      if (parentSkillId && skillUsages.length > 0) {
        const parentSkill = SKILL_MAP[parentSkillId];
        const parentDuration = parentSkill?.duration_s ?? 0;
        const childDuration = col.skill.duration_s ?? 0;

        // Track which child usages are duplicates (more than one per parent activation)
        const duplicateChildUsages = new Set<string>();
        const skipDuplicateChildCheck = col.skill.id === "healer.sch.consolation";

        for (const pu of parentUsages) {
          // Find all child usages within this parent's duration (+ grace period)
          const childrenInThisParent: PlanUsage[] = [];
          for (const cu of skillUsages) {
            if (isChildWithinParentWindow(cu, pu, parentDuration, col.skill)) {
              childrenInThisParent.push(cu);
            }
          }
          
          // If more than one, mark all but the first as duplicates
          if (!skipDuplicateChildCheck && childrenInThisParent.length > 1) {
            const sorted = childrenInThisParent.slice().sort((a, b) => {
              if (a.t_sec !== b.t_sec) return a.t_sec - b.t_sec;
              return a.lineIndex - b.lineIndex;
            });
            for (let i = 1; i < sorted.length; i++) {
              duplicateChildUsages.add(`${sorted[i].t_sec}::${sorted[i].lineIndex}`);
            }
          }
        }

        for (const cu of skillUsages) {
          // Use index lookup instead of findIndex
          const startRowIdx = rowIndexLookup.get(`${cu.t_sec}::${cu.lineIndex}`);
          if (startRowIdx === undefined) continue;

          // Check if the start is outside parent's active time
          const isOutsideParent = !parentActiveRows[startRowIdx];
          const isDuplicate = duplicateChildUsages.has(`${cu.t_sec}::${cu.lineIndex}`);

          if (isOutsideParent || isDuplicate) {
            // Mark ALL cells in this skill's duration as conflict
            const startSec = cu.t_sec;
            const endSec = startSec + childDuration;
            
            for (let r = 0; r < rows.length; r++) {
              const rowSec = rowToSec[r];
              if (rowSec >= startSec && rowSec <= endSec && columnVisual[r].color !== "none") {
                columnVisual[r].color = "conflict";
              }
            }
          }
        }
      }

  applyBarShapes(columnVisual);
  return columnVisual;
}

export type GridVisualCacheEntry = {
  depKey: string;
  visual: CellVisualState[];
};

export function buildGridVisualWithCache(
  cols: readonly GridVisualColumn[],
  ctx: GridVisualContext,
  cache: Map<string, GridVisualCacheEntry>
): CellVisualState[][] {
  const activeKeys = new Set<string>();
  const result: CellVisualState[][] = new Array(cols.length);

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const columnKey = `${col.jobId}::${col.skill.id}`;
    const depKey = buildColumnDepKey(col, ctx);
    activeKeys.add(columnKey);

    const cached = cache.get(columnKey);
    if (cached?.depKey === depKey) {
      result[ci] = cached.visual;
      continue;
    }

    const visual = computeGridVisualColumn(col, ctx);
    cache.set(columnKey, { depKey, visual });
    result[ci] = visual;
  }

  for (const key of cache.keys()) {
    if (!activeKeys.has(key)) {
      cache.delete(key);
    }
  }

  return result;
}
