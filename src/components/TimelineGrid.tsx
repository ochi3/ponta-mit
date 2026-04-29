import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, JSX } from "react";
import { useStore } from "../state/store";
import { JOBS } from "../data/jobs/jobs.registry";
import { SKILL_MAP, hasSecondarySkills, getJobSkillIds } from "../data/skills";
import type { Timeline, JobId, SkillData, Moment, ElementType } from "../types";
import Cell, { type CellVisualState } from "./Cell";
import StackCell from "./StackCell";
import { formatSec } from "../logic/timelineView";
import { getSkillIcon } from "../data/skills/icon.skills";
import { getJobIcon } from "../data/jobs/jobIcons";
import { getDamageTypeIcon } from "../data/damageTypeIcons";
import {
  getChargeCapacity,
  getChargeStateBeforePoint,
  isChargeSkill,
  simulateChargeUsages,
} from "../logic/skillCharges";
import { useI18n } from "../i18n";

type Col = { jobId: JobId; jobName: string; skill: SkillData };
type DropIndicator = {
  jobId: JobId;
  position: "before" | "after";
};

const SKILL_COL_CSS_VAR = "var(--mp-skill-col-w)";
const SKILL_COL_STACK_CSS_VAR = "var(--mp-skill-col-stack-w)";
const MECHANISM_COL_CSS_VAR = "var(--mp-col-mech-w)";
const TIME_COL_CSS_VAR = "var(--mp-col-time-w)";
const EVENT_COL_CSS_VAR = "var(--mp-col-event-w)";
const ELEMENT_COL_CSS_VAR = "var(--mp-col-elem-w)";

const ELEMENT_LABELS: Record<ElementType, string> = {
  physical: "物理",
  magic: "魔法",
  unique: "特殊",
  none: "無",
};

// Process timeline file
type LabelLine = { label: string; showTime: boolean; moment?: Moment };

function labelsAtSecond(tl: Timeline, sec: number): LabelLine[] {
  const ms = tl.moments.filter(m => m.t_sec === sec);
  if (ms.length === 0) return [{ label: "", showTime: true }];

  const seenAltGroups = new Set<string>();
  return ms.map((m) => {
    const showTime = m.alt_group ? !seenAltGroups.has(m.alt_group) : true;
    if (m.alt_group) seenAltGroups.add(m.alt_group);
    const label = m.name;
    return { label, showTime, moment: m };
  });
}

function mechanismNamesAtSeconds(
  tl: Timeline,
  seconds: readonly number[]
) {
  const map = new Map<number, string>();
  const slices = tl.mechanisms ?? [];

  for (const slice of slices) {
    const label = slice.name;
    for (const sec of seconds) {
      if (sec < slice.start_sec || sec > slice.end_sec) continue;
      if (!map.has(sec)) map.set(sec, label);
    }
  }

  return map;
}

type SecondLines = {
  sec: number;
  lines: LabelLine[];
  rowStart: number;
};

function buildRowData(tl: Timeline, seconds: readonly number[]) {
  const secondLines: SecondLines[] = [];
  const rows: Array<{
    sec: number;
    secIndex: number;
    line: LabelLine;
    lineIndex: number;
    lineCount: number;
    rowIndex: number;
  }> = [];

  let rowCursor = 0;
  for (let si = 0; si < seconds.length; si++) {
    const sec = seconds[si];
    const lines = labelsAtSecond(tl, sec);
    secondLines.push({ sec, lines, rowStart: rowCursor });

    for (let li = 0; li < lines.length; li++) {
      rows.push({
        sec,
        secIndex: si,
        line: lines[li],
        lineIndex: li,
        lineCount: lines.length,
        rowIndex: rowCursor + li,
      });
    }

    rowCursor += lines.length;
  }

  return { rows, secondLines };
}

function buildMechanismRuns(
  hasMechanisms: boolean,
  mechanismNames: Map<number, string>,
  secondLines: SecondLines[]
) {
  if (!hasMechanisms) return new Map<number, { label: string; span: number }>();

  const mechanisms = new Map<number, { label: string; span: number }>();
  let currentLabel: string | undefined = undefined;
  let currentSpan = 0;
  let currentRowStart = 0;

  for (const secInfo of secondLines) {
    const label = mechanismNames.get(secInfo.sec) ?? "";

    if (currentLabel === undefined) {
      currentLabel = label;
      currentSpan = secInfo.lines.length;
      currentRowStart = secInfo.rowStart;
      continue;
    }

    if (label === currentLabel) {
      currentSpan += secInfo.lines.length;
      continue;
    }

    mechanisms.set(currentRowStart, { label: currentLabel, span: currentSpan });
    currentLabel = label;
    currentSpan = secInfo.lines.length;
    currentRowStart = secInfo.rowStart;
  }

  if (currentLabel !== undefined) {
    mechanisms.set(currentRowStart, { label: currentLabel, span: currentSpan });
  }

  return mechanisms;
}

function freezeStyle(left: string): CSSProperties {
  return { "--mp-freeze-left": left } as CSSProperties;
}


export default function TimelineGrid({
  tl,
  seconds,
  jobFilter,
  focusJobId,
  focusSecond,
  followTime = false,
  onTimeClick,
  syncSeconds,
}: {
  tl: Timeline;
  seconds: number[];
  jobFilter?: JobId | null;
  focusJobId?: JobId | null;
  focusSecond?: number | null;
  followTime?: boolean;
  onTimeClick?: (sec: number) => void;
  syncSeconds?: readonly number[];
}) {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const team = useStore((s) => s.team);
  const setTeam = useStore((s) => s.setTeam);
  const usages = useStore((s) => s.usages);
  const expandedJobs = useStore((s) => s.expandedJobs);
  const toggleJobExpand = useStore((s) => s.toggleJobExpand);
  const [draggingJobId, setDraggingJobId] = useState<JobId | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const hasMechanisms = Boolean(tl.mechanisms?.length);
  const syncSecondsSet = useMemo(
    () => new Set(syncSeconds ?? []),
    [syncSeconds]
  );
  const visibleTeam = useMemo(
    () => (jobFilter ? team.filter((jobId) => jobId === jobFilter) : team),
    [jobFilter, team]
  );
  const canReorderJobs = !jobFilter && visibleTeam.length > 1;

  function clearJobDragState() {
    setDraggingJobId(null);
    setDropIndicator(null);
  }

  function handleJobDragStart(jobId: JobId) {
    if (!canReorderJobs) {
      return;
    }
    setDraggingJobId(jobId);
  }

  function handleJobDragOver(event: DragEvent<HTMLTableCellElement>, jobId: JobId) {
    if (!canReorderJobs || !draggingJobId || draggingJobId === jobId) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const position = event.clientX < midpoint ? "before" : "after";
    setDropIndicator({ jobId, position });
  }

  function handleJobDrop(jobId: JobId) {
    if (!canReorderJobs || !draggingJobId || draggingJobId === jobId) {
      clearJobDragState();
      return;
    }

    const indicator =
      dropIndicator?.jobId === jobId
        ? dropIndicator
        : { jobId, position: "after" as const };
    const nextTeam = team.filter((memberId) => memberId !== draggingJobId);
    const targetIndex = nextTeam.indexOf(jobId);

    if (targetIndex === -1) {
      clearJobDragState();
      return;
    }

    const insertIndex =
      indicator.position === "before" ? targetIndex : targetIndex + 1;
    nextTeam.splice(insertIndex, 0, draggingJobId);
    setTeam(nextTeam);
    clearJobDragState();
  }

  // Pre-build usage index for O(1) lookup in render
  const usageIndex = useMemo(() => {
    const map = new Map<string, typeof usages[0]>();
    for (const u of usages) {
      map.set(`${u.jobId}::${u.skillId}::${u.t_sec}::${u.lineIndex}`, u);
    }
    return map;
  }, [usages]);

  const cols: Col[] = useMemo(() => {
    const out: Col[] = [];
    for (const jobId of visibleTeam) {
      const jobName = JOBS.find((j) => j.id === jobId)?.name ?? jobId;
      const isExpanded = expandedJobs.includes(jobId);
      const skillIds = getJobSkillIds(jobId, isExpanded);
      for (const sid of skillIds) {
        const sk = SKILL_MAP[sid];
        if (sk) out.push({ jobId, jobName, skill: sk });
      }
    }
    return out;
  }, [visibleTeam, expandedJobs]);

  const jobColspan = useMemo(() => {
    const m = new Map<JobId, number>();
    for (const c of cols) m.set(c.jobId, (m.get(c.jobId) ?? 0) + 1);
    return m;
  }, [cols]);

  // Calculate job header width considering stack skills have wider columns
  const jobHeaderWidth = useMemo(() => {
    const m = new Map<JobId, string>();
    for (const jobId of jobColspan.keys()) {
      const jobCols = cols.filter(c => c.jobId === jobId);
      const normalCount = jobCols.filter(
        (c) => !(isChargeSkill(c.skill) || c.skill.maxStacks)
      ).length;
      const stackCount = jobCols.filter(
        (c) => isChargeSkill(c.skill) || Boolean(c.skill.maxStacks)
      ).length;
      const totalCount = normalCount + stackCount;
      
      // アイコンと展開ボタンのために最低 3.5rem を確保する
      const minHeaderW = "3.8rem";
      let calcW = "";
      if (stackCount > 0 && normalCount > 0) {
        calcW = `calc(${normalCount} * ${SKILL_COL_CSS_VAR} + ${stackCount} * ${SKILL_COL_STACK_CSS_VAR})`;
      } else if (stackCount > 0) {
        calcW = `calc(${stackCount} * ${SKILL_COL_STACK_CSS_VAR})`;
      } else {
        calcW = `calc(${normalCount} * ${SKILL_COL_CSS_VAR})`;
      }
      m.set(jobId, totalCount === 1 ? calcW : `max(${minHeaderW}, ${calcW})`);
    }
    return m;
  }, [cols, jobColspan]);


  const freezeOffsets = useMemo(
    () => ({
      mechanism: "0px",
      time: hasMechanisms ? MECHANISM_COL_CSS_VAR : "0px",
      event: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR})`
        : TIME_COL_CSS_VAR,
      elem: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR})`
        : `calc(${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR})`,
      damage: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR} + ${ELEMENT_COL_CSS_VAR})`
        : `calc(${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR} + ${ELEMENT_COL_CSS_VAR})`,
    }),
    [hasMechanisms]
  );

  const formatNumber = (value?: number) =>
      typeof value === "number"
      ? value.toLocaleString("ja-JP")
      : t("timeline.damage.none");

  const mechanismNames = useMemo(
    () => mechanismNamesAtSeconds(tl, seconds),
    [seconds, tl]
  );

  const { rows, secondLines } = useMemo(
    () => buildRowData(tl, seconds),
    [seconds, tl]
  );

  const mechanismRuns = useMemo(
    () => buildMechanismRuns(hasMechanisms, mechanismNames, secondLines),
    [hasMechanisms, mechanismNames, secondLines]
  );

  useEffect(() => {
    if (!followTime || focusSecond === null || focusSecond === undefined) {
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const targetRow = wrapper.querySelector<HTMLTableRowElement>(
      `tr[data-row-sec="${focusSecond}"]`
    );
    if (!targetRow) {
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const rowRect = targetRow.getBoundingClientRect();
    const topThreshold = wrapperRect.top + wrapperRect.height * 0.25;
    const bottomThreshold = wrapperRect.bottom - wrapperRect.height * 0.25;

    if (rowRect.top < topThreshold || rowRect.bottom > bottomThreshold) {
      targetRow.scrollIntoView({ block: "center" });
    }
  }, [followTime, focusSecond]);

  useEffect(() => {
    if (!focusJobId) {
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const targetHeader = wrapper.querySelector<HTMLElement>(
      `th[data-job-id="${focusJobId}"]`
    );
    if (!targetHeader) {
      return;
    }

    targetHeader.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  }, [focusJobId]);

  const gridVisual: CellVisualState[][] = useMemo(() => {
    // 第一维：列；第二维：绝对行 rowIndex（0..rows.length-1）
    const vis: CellVisualState[][] = cols.map(() =>
      Array<CellVisualState>(rows.length).fill({
        color: "none",
        checked: false,
        shape: "none",
      })
    );

    // Pre-build indexes for faster lookups
    const usagesByJobSkill = new Map<string, typeof usages>();
    for (const u of usages) {
      const key = `${u.jobId}::${u.skillId}`;
      if (!usagesByJobSkill.has(key)) {
        usagesByJobSkill.set(key, []);
      }
      usagesByJobSkill.get(key)!.push(u);
    }

    // Build row index lookup: "sec::lineIndex" -> rowIndex
    const rowIndexMap = new Map<string, number>();
    for (let r = 0; r < rows.length; r++) {
      rowIndexMap.set(`${rows[r].sec}::${rows[r].lineIndex}`, r);
    }

    // Build a map from row index to time (seconds)
    const rowToSec = rows.map((r) => r.sec);

    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci];
      const parentSkillId = col.skill.parentSkillId;
      const jobSkillKey = `${col.jobId}::${col.skill.id}`;
      const skillUsages = usagesByJobSkill.get(jobSkillKey) ?? [];

      // Calculate valid time ranges for child skills (where parent is active)
      let parentActiveRows: boolean[] = [];
      let parentUsages: typeof usages = [];
      
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
            while (puIdx < sortedParentUsages.length && 
                   sortedParentUsages[puIdx].t_sec + parentDuration < rowSec) {
              puIdx++;
            }
            
            // Check if any active parent usage covers this row
            for (let i = puIdx; i < sortedParentUsages.length; i++) {
              const pu = sortedParentUsages[i];
              // If this usage starts after current row, no need to check more
              if (pu.t_sec > rowSec) break;
              
              const startSec = pu.t_sec;
              const endSec = startSec + parentDuration;
              
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

          const startRowIdx = rowIndexMap.get(
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

          vis[ci][r] = {
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
          const startRowIdx = rowIndexMap.get(`${u.t_sec}::${u.lineIndex}`);
          if (startRowIdx !== undefined) {
            checkedRows.add(startRowIdx);
          }

          if (dur > 0) {
            const effectEndSec = u.t_sec + dur;
            const effectStartRow = findFirstRowAtOrAfter(u.t_sec);
            const effectEndRow = findFirstRowAtOrAfter(effectEndSec);

            for (let r = effectStartRow; r < effectEndRow; r++) {
              const row = rows[r];
              if (row.sec === u.t_sec && row.lineIndex < u.lineIndex) continue;
              effectCounts[r]++;
            }
          }

          if (cd > 0) {
            const cdStartSec = u.t_sec + dur;
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
          const total = effectCount + cooldownCount;

          let color: "none" | "green" | "red" | "conflict" = "none";

          if (total >= 2) {
            color = "conflict";
          } else if (effectCount >= 1 || checked) {
            color = "green";
          } else if (cooldownCount >= 1) {
            color = "red";
          }

          vis[ci][r] = { color, checked, shape: "none" };
        }
      }

      // For child skills: check for conflicts
      if (parentSkillId && skillUsages.length > 0) {
        const parentSkill = SKILL_MAP[parentSkillId];
        const parentDuration = parentSkill?.duration_s ?? 0;
        const childDuration = col.skill.duration_s ?? 0;

        // Track which child usages are duplicates (more than one per parent activation)
        const duplicateChildUsages = new Set<string>();
        
        for (const pu of parentUsages) {
          const parentStart = pu.t_sec;
          const parentEnd = parentStart + parentDuration;
          
          // Find all child usages within this parent's duration
          const childrenInThisParent: typeof usages = [];
          for (const cu of skillUsages) {
            if (cu.t_sec > parentStart && cu.t_sec <= parentEnd) {
              childrenInThisParent.push(cu);
            } else if (cu.t_sec === parentStart && cu.lineIndex >= pu.lineIndex) {
              childrenInThisParent.push(cu);
            }
          }
          
          // If more than one, mark all but the first as duplicates
          if (childrenInThisParent.length > 1) {
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
          const startRowIdx = rowIndexMap.get(`${cu.t_sec}::${cu.lineIndex}`);
          if (startRowIdx === undefined) continue;

          // Check if the start is outside parent's active time
          const isOutsideParent = !parentActiveRows[startRowIdx];
          // Check if this is a duplicate child usage
          const isDuplicate = duplicateChildUsages.has(`${cu.t_sec}::${cu.lineIndex}`);
          
          if (isOutsideParent || isDuplicate) {
            // Mark ALL cells in this skill's duration as conflict
            const startSec = cu.t_sec;
            const endSec = startSec + childDuration;
            
            for (let r = 0; r < rows.length; r++) {
              const rowSec = rowToSec[r];
              if (rowSec >= startSec && rowSec <= endSec && vis[ci][r].color !== "none") {
                vis[ci][r].color = "conflict";
              }
            }
          }
        }
      }

      // 按行序列算条形 shape（run start/middle/end）
      let runStart = -1;
      for (let r = 0; r <= rows.length; r++) {
        const isActive = r < rows.length && vis[ci][r].color !== "none";

        if (isActive) {
          if (runStart === -1) runStart = r;
        } else if (runStart !== -1) {
          const runEnd = r - 1;
          if (runStart === runEnd) {
            vis[ci][runStart].shape = "alone";
          } else {
            vis[ci][runStart].shape = "start";
            vis[ci][runEnd].shape = "end";
            for (let k = runStart + 1; k <= runEnd - 1; k++) {
              vis[ci][k].shape = "middle";
            }
          }
          runStart = -1;
        }
      }
    }

    return vis;
  }, [cols, rows, usages]);

  const renderElementBadge = (moment?: Moment) => {
    const elem = moment?.elem ?? "none";

    if (elem === "physical" || elem === "magic" || elem === "unique") {
      const label = ELEMENT_LABELS[elem];
      const icon = getDamageTypeIcon(elem);
      return (
        <span className="mp-element-icon" title={label} aria-label={label}>
          {icon ? (
            <img src={icon} alt={label} className="mp-element-icon-img" />
          ) : (
            <span className="mp-element-empty">—</span>
          )}
        </span>
      );
    }

    return <span className="mp-element-empty">—</span>;
  };

  const renderDamageContent = (moment?: Moment) => {
        if (!moment) return <span className="mp-damage-none">—</span>;

    const chunks: JSX.Element[] = [];

    if (typeof moment.damage === "number") {
      chunks.push(
        <span key="hit" className="mp-damage-number">
          {formatNumber(moment.damage)}
        </span>
      );
    }

    if (typeof moment.dot === "number") {
      const dotIcon = getDamageTypeIcon("dot");
      chunks.push(
        <span key="dot" className="mp-damage-dot">
          {dotIcon && (
            <img
              src={dotIcon}
              alt="DoT"
              className="mp-dot-icon"
              aria-hidden="true"
            />
          )}
          <span className="mp-damage-number">{formatNumber(moment.dot)} x {moment.dot_ticks}</span>
        </span>
      );
    }

    if (chunks.length === 0) return <span className="mp-damage-none">—</span>;
    if (chunks.length === 1) return chunks[0];

    return <div className="mp-damage-stack">{chunks}</div>;
  };

  return (
    <div className="w-full">
      <div className="w-full px-2 mp-shell">
        <div ref={wrapperRef} className="rounded mp-wrapper">
          <table className="mp-table text-sm border-collapse">
            <thead className="mp-header-sticky">
              <tr>
                {hasMechanisms && (
                  <th
                    className="p-2 text-left mp-col-mechanism mp-col-freeze mp-col-freeze--first"
                    rowSpan={2}
                    style={freezeStyle(freezeOffsets.mechanism)}>
                    {t("timeline.headers.mechanism")}
                  </th>
                )}
                <th
                  className={`p-2 text-left mp-col-time mp-col-freeze ${
                    hasMechanisms ? "mp-col-freeze--middle" : "mp-col-freeze--first"
                  }`}
                  rowSpan={2}
                  style={freezeStyle(freezeOffsets.time)}>
                  {t("timeline.headers.time")}
                </th>
                <th
                  className="p-2 text-left mp-col-event mp-col-freeze mp-col-freeze--middle"
                  rowSpan={2}
                  style={freezeStyle(freezeOffsets.event)}>
                  {t("timeline.headers.event")}
                </th>
                <th
                  className="p-2 text-center mp-col-element mp-col-freeze mp-col-freeze--middle"
                  rowSpan={2}
                  style={freezeStyle(freezeOffsets.elem)}>
                 {t("timeline.headers.element")}
                </th>
                <th
                  className="p-2 text-right mp-col-damage mp-col-freeze mp-col-freeze--last"
                  rowSpan={2}
                  style={freezeStyle(freezeOffsets.damage)}>
                  {t("timeline.headers.damage")}
                </th>
                {Array.from(jobColspan.entries()).map(([jobId, span]) => {
                  const job = JOBS.find((j) => j.id === jobId);
                  const name = job?.name ?? jobId;
                  const icon = getJobIcon(jobId);
                  const jobWidth = jobHeaderWidth.get(jobId) ?? `calc(${span} * ${SKILL_COL_CSS_VAR})`;

                  const rawRole = jobId.split(".")[0].toLowerCase();
                  let roleGroup: "tank" | "healer" | "dps";
                  if (rawRole === "tank") roleGroup = "tank";
                  else if (rawRole === "healer") roleGroup = "healer";
                  else if (rawRole === "melee" ||rawRole === "ranged" ||rawRole === "caster") 
                    roleGroup = "dps";
                  else roleGroup = "dps";

                  const roleClass = `mp-job-header--${roleGroup}`;
                  const hasSecondary = hasSecondarySkills(jobId);
                  const isExpanded = expandedJobs.includes(jobId);
                  const isSingleColumnJob = span === 1;

                  return (
                    <th
                      key={jobId}
                      data-job-id={jobId}
                      draggable={canReorderJobs}
                      onDragStart={() => handleJobDragStart(jobId)}
                      onDragEnd={clearJobDragState}
                      onDragOver={(event) => handleJobDragOver(event, jobId)}
                      onDrop={() => handleJobDrop(jobId)}
                      className={`p-2 text-center border-l mp-job-header mp-job-header--group ${roleClass} ${
                        canReorderJobs ? "mp-job-header--draggable" : ""
                      } ${draggingJobId === jobId ? "mp-job-header--dragging" : ""} ${
                        isSingleColumnJob ? "mp-job-header--single" : ""
                      }`}
                      colSpan={span}
                      style={{
                        width: jobWidth,
                        minWidth: jobWidth,
                        maxWidth: jobWidth,
                      }}
                      title={canReorderJobs ? `${name} をドラッグして並び替え` : name}
                    >
                      {dropIndicator?.jobId === jobId && dropIndicator.position === "before" && (
                        <span className="team-drop-indicator -left-1" />
                      )}
                      <div className="mp-job-header-content">
                        {icon ? (
                          <img
                            src={icon}
                            alt={name}
                            className="mp-job-icon"
                          />
                        ) : (
                          <span className="mp-job-fallback">{name}</span>
                        )}
                        {hasSecondary && (
                          <button
                            className="mp-job-expand-btn"
                            onClick={() => toggleJobExpand(jobId)}
                            title={isExpanded ? t("timeline.collapse") : t("timeline.expand")}
                            aria-expanded={isExpanded}
                          >
                            <span className={`mp-job-expand-icon ${isExpanded ? "mp-job-expand-icon--expanded" : ""}`}>
                              ▸
                            </span>
                          </button>
                        )}
                      </div>
                      {dropIndicator?.jobId === jobId && dropIndicator.position === "after" && (
                        <span className="team-drop-indicator -right-1" />
                      )}
                    </th>
                  );
                })}
              </tr>

              <tr>
                {cols.map((c, ci) => {
                  const icon = getSkillIcon(c.skill.id);
                  const skillName = c.skill.name;
                  const hasStacks =
                    isChargeSkill(c.skill) ||
                    (typeof c.skill.maxStacks === "number" && c.skill.maxStacks > 0);
                  const isJobStart = ci === 0 || cols[ci - 1]?.jobId !== c.jobId;
                  const isJobEnd = ci === cols.length - 1 || cols[ci + 1]?.jobId !== c.jobId;
                  return (
                    <th
                      key={c.jobId + "::" + c.skill.id}
                      className={`mp-skill-header ${hasStacks ? "mp-skill-header--stack" : ""} ${isJobStart ? "mp-skill-header--job-start" : ""} ${isJobEnd ? "mp-skill-header--job-end" : ""}`}
                    >
                      <div className="mp-skill-header-inner">
                        {icon ? (
                          <img
                            className="mp-skill-icon"
                            src={icon}
                            alt={skillName}
                            title={skillName}
                          />
                        ) : (
                          <span
                            className="mp-skill-fallback"
                            title={skillName}
                          >
                            {skillName}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIndex) => {
                const mechanismCell = hasMechanisms
                  ? mechanismRuns.get(row.rowIndex)
                  : undefined;
                const mechanismLabel = mechanismCell?.label ?? "";
                const moment = row.line.moment;

              return (
                  <tr
                    key={`${row.sec}::${row.lineIndex}`}
                    data-row-sec={row.sec}
                    className={`mp-row align-top ${
                      focusSecond === row.sec ? "mp-row--focus" : ""
                    }`}
                  >
                    {hasMechanisms && mechanismCell && (
                      <td
                        className="p-1 text-center whitespace-nowrap mp-col-mechanism mp-col-freeze mp-col-freeze--first"
                        rowSpan={mechanismCell.span}
                        style={freezeStyle(freezeOffsets.mechanism)}>
                        <div className="mp-mechanism-cell" title={mechanismLabel || undefined}>
                          {mechanismLabel || ""}
                        </div>
                      </td>
                    )}
                    <td
                      className={`p-1 font-mono text-left whitespace-nowrap mp-col-time mp-col-freeze ${
                        hasMechanisms ? "mp-col-freeze--middle" : "mp-col-freeze--first"
                      }`}
                      style={freezeStyle(freezeOffsets.time)}>
                      {row.line.showTime ? (
                        onTimeClick ? (
                          <button
                            type="button"
                            onClick={() => onTimeClick(row.sec)}
                            className="flex w-full items-center gap-1 text-left hover:text-sky-400"
                            title="同期ポイントを設定"
                          >
                            <span>{formatSec(row.sec)}</span>
                            {syncSecondsSet.has(row.sec) && (
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-sky-400"
                                aria-label="sync point"
                              />
                            )}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span>{formatSec(row.sec)}</span>
                            {syncSecondsSet.has(row.sec) && (
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-sky-400"
                                aria-label="sync point"
                              />
                            )}
                          </span>
                        )
                      ) : (
                        ""
                      )}
                    </td>
                    <td
                      className="p-1 mp-col-event mp-col-freeze mp-col-freeze--middle"
                      style={freezeStyle(freezeOffsets.event)}
                      title={row.line.label}>
                      {row.line.label || "—"}
                    </td>
                    <td
                      className="p-1 text-center mp-col-element mp-col-freeze mp-col-freeze--middle"
                      style={freezeStyle(freezeOffsets.elem)}>
                      {renderElementBadge(moment)}
                    </td>
                    <td
                      className="p-1 text-right mp-col-damage mp-col-freeze mp-col-freeze--last"
                      style={freezeStyle(freezeOffsets.damage)}>
                      {renderDamageContent(moment)}
                    </td>


                    {cols.map((c, ci) => {
                      const hasStacks =
                        isChargeSkill(c.skill) ||
                        (typeof c.skill.maxStacks === "number" && c.skill.maxStacks > 0);
                      const cellUsage = hasStacks
                        ? usageIndex.get(`${c.jobId}::${c.skill.id}::${row.sec}::${row.lineIndex}`)
                        : undefined;
                      const isJobStart = ci === 0 || cols[ci - 1]?.jobId !== c.jobId;
                      const isJobEnd = ci === cols.length - 1 || cols[ci + 1]?.jobId !== c.jobId;

                      return (
                        <td
                          key={c.jobId + "::" + c.skill.id + "::" + row.sec + "::" + row.lineIndex}
                          className={`mp-cell mp-skill-cell ${hasStacks ? "mp-skill-cell--stack" : ""} ${isJobStart ? "mp-skill-cell--job-start" : ""} ${isJobEnd ? "mp-skill-cell--job-end" : ""}`}
                        >
                          {hasStacks ? (
                            <StackCell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][rowIndex]}
                              usage={cellUsage}
                            />
                          ) : (
                            <Cell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][rowIndex]}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
