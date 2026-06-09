import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, JSX, MouseEvent } from "react";
import { useStore } from "../state/store";
import { JOBS } from "../data/jobs/jobs.registry";
import { JOB_SKILLS, SKILL_MAP, hasSecondarySkills, getJobSkillIds } from "../data/skills";
import type {
  Timeline,
  JobId,
  SkillData,
  Moment,
  ElementType,
  PlanUsage,
  MomentTag,
} from "../types";
import Cell, { type CellVisualState } from "./Cell";
import { applyBarShapes } from "./cellStyles";
import AstDrawCell from "./AstDrawCell";
import SchAetherflowCell from "./SchAetherflowCell";
import SgeAddersgallCell from "./SgeAddersgallCell";
import WhmLilyCell from "./WhmLilyCell";
import StackCell from "./StackCell";
import {
  formatTimelineSec,
  loadTimelineTimeDisplayMode,
  saveTimelineTimeDisplayMode,
  type TimelineTimeDisplayMode,
} from "../logic/timelineView";
import {
  TIMELINE_ROW_HEIGHT_PX,
  TIMELINE_VIRTUAL_MIN_ROWS,
  buildMechanismRunRanges,
  computeTimelineVirtualRange,
  findDisplayIndexForTimelineSec,
  isDisplayIndexInComfortZone,
  resolveVirtualMechanismCell,
  scrollWrapperToDisplayIndex,
} from "../logic/timelineVirtualScroll";
import { resolveMomentNote } from "../logic/momentNotes";
import {
  clampMemoColumnWidth,
  resolveMemoColumnWidth,
} from "../logic/layoutPrefs";
import { resolveTimelineId } from "../data/timelines/registry";
import { getSkillIcon } from "../data/skills/icon.skills";
import { getJobIcon } from "../data/jobs/jobIcons";
import { getDamageTypeIcon } from "../data/damageTypeIcons";
import {
  buildMitigationEffect,
  buildTargetMitigationEffect,
  isUsageActiveAtPoint,
  summarizeMitigation,
} from "../logic/mitigation";
import { getEffectDurationS } from "../logic/skillEffect";
import { getEffectStartPlacementFromEndClick } from "../logic/placeUsageAtEffectEnd";
import {
  getParentChildWindowEndSec,
  isChildWithinParentWindow,
} from "../logic/parentChildSkills";
import { validatePlan, type ValidationIssue } from "../logic/validation";
import {
  buildAstDrawSlots,
  drawGrantsAstCard,
  getAstCycleIndex,
  getAstNextSlot,
  getAstSlotAtPoint,
  isAstCardSkill,
  isAstDrawSkill,
} from "../logic/astCards";
import {
  getChargeCapacity,
  getChargeStateBeforePoint,
  isChargeSkill,
  simulateChargeUsages,
} from "../logic/skillCharges";
import {
  getSchAetherflowCycleIndex,
  getSchAetherflowStateAtPoint,
  isSchAetherflowSkill,
  isSchAetherflowSpenderSkill,
  simulateSchAetherflow,
} from "../logic/schAetherflow";
import {
  getWhmLilyStateAtPoint,
  isWhmLilyConsumerSkill,
  isWhmLilySkill,
  simulateWhmLilies,
} from "../logic/whmLilies";
import {
  getSgeAddersgallStateAtPoint,
  isSgeAddersgallSkill,
  isSgeAddersgallSpenderSkill,
  simulateSgeAddersgall,
} from "../logic/sgeAddersgall";
import { useI18n } from "../i18n";

type Col = { jobId: JobId; jobName: string; skill: SkillData };
type DropIndicator = {
  jobId: JobId;
  position: "before" | "after";
};
type DamagePopoverState = {
  rowIndex: number;
  x: number;
  y: number;
};

const SKILL_COL_CSS_VAR = "var(--mp-skill-col-w)";
const SKILL_COL_STACK_CSS_VAR = "var(--mp-skill-col-stack-w)";
const MECHANISM_COL_CSS_VAR = "var(--mp-col-mech-w)";
const TIME_COL_CSS_VAR = "var(--mp-col-time-w)";
const EVENT_COL_CSS_VAR = "var(--mp-col-event-w)";
const MEMO_COL_CSS_VAR = "var(--mp-col-memo-w)";
const ELEMENT_COL_CSS_VAR = "var(--mp-col-elem-w)";

const ELEMENT_LABELS: Record<ElementType, string> = {
  physical: "物理",
  magic: "魔法",
  unique: "特殊",
  none: "無",
};

const MOMENT_TAG_LABELS: Record<MomentTag, string> = {
  raidwide: "全体",
  tankbuster: "強攻撃",
  spread: "散開",
  stack: "頭割り",
  tower: "塔",
  knockback: "ノックバック",
  downtime: "殴れない",
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

function secondHasTimelineEvent(tl: Timeline, sec: number) {
  return tl.moments.some((moment) => moment.t_sec === sec);
}

function compactSecondLinesForEvents(secondLines: SecondLines[], tl: Timeline) {
  let rowCursor = 0;
  const filtered: SecondLines[] = [];

  for (const secInfo of secondLines) {
    if (!secondHasTimelineEvent(tl, secInfo.sec)) {
      continue;
    }
    filtered.push({ ...secInfo, rowStart: rowCursor });
    rowCursor += secInfo.lines.length;
  }

  return filtered;
}

function freezeStyle(left: string): CSSProperties {
  return { "--mp-freeze-left": left } as CSSProperties;
}

function MemoColumnHeader({
  label,
  widthPx,
  freezeLeft,
  onPreviewWidth,
  onWidthCommit,
}: {
  label: string;
  widthPx: number;
  freezeLeft: string;
  onPreviewWidth: (widthPx: number | null) => void;
  onWidthCommit: (widthPx: number) => void;
}) {
  const handleResizeStart = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widthPx;

    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = clampMemoColumnWidth(
        startWidth + (moveEvent.clientX - startX)
      );
      onPreviewWidth(nextWidth);
    };

    const handleUp = (upEvent: globalThis.MouseEvent) => {
      const nextWidth = clampMemoColumnWidth(
        startWidth + (upEvent.clientX - startX)
      );
      onPreviewWidth(null);
      onWidthCommit(nextWidth);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const displayWidth = widthPx;

  return (
    <th
      className="p-2 text-left mp-col-memo mp-col-freeze mp-col-freeze--middle"
      rowSpan={2}
      style={{
        ...freezeStyle(freezeLeft),
        width: displayWidth,
        minWidth: displayWidth,
        maxWidth: displayWidth,
      }}
    >
      <span>{label}</span>
      <div
        className="mp-col-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={`${label}の列幅を変更`}
        title="ドラッグで列幅を変更（共有されます）"
        onMouseDown={handleResizeStart}
      />
    </th>
  );
}

function MomentNoteInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string;
  placeholder: string;
  onCommit: (nextValue: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="text"
      className="mp-moment-note-input"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

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

type ValidationLocation = NonNullable<ValidationIssue["location"]>;

function validationLocationKey(location: ValidationLocation) {
  return `${location.jobId}::${location.skillId}::${location.t_sec}::${location.lineIndex}`;
}

function validationRowKey(location: Pick<ValidationLocation, "t_sec" | "lineIndex">) {
  return `${location.t_sec}::${location.lineIndex}`;
}

function resolvePhaseScrollRow(
  wrapper: HTMLElement,
  scrollToSecond: number
) {
  const primaryRow = wrapper.querySelector<HTMLTableRowElement>(
    `tr[data-row-key="${scrollToSecond}::0"]`
  );
  if (primaryRow) {
    return primaryRow;
  }

  const rowsAtSecond = Array.from(
    wrapper.querySelectorAll<HTMLTableRowElement>(`tr[data-row-sec="${scrollToSecond}"]`)
  );
  if (rowsAtSecond.length > 0) {
    return rowsAtSecond[0];
  }

  return Array.from(wrapper.querySelectorAll<HTMLTableRowElement>("tr[data-row-sec]")).find(
    (row) => {
      const sec = Number(row.dataset.rowSec);
      return Number.isFinite(sec) && sec >= scrollToSecond;
    }
  );
}

function scrollWrapperToTimelineRow(wrapper: HTMLElement, targetRow: HTMLTableRowElement) {
  const thead = wrapper.querySelector<HTMLElement>("thead.mp-header-sticky");
  const headerHeight = thead ? Math.ceil(thead.getBoundingClientRect().height) : 48;
  const gap = 4;
  const wrapperRect = wrapper.getBoundingClientRect();
  const rowRect = targetRow.getBoundingClientRect();
  const delta = rowRect.top - wrapperRect.top - headerHeight - gap;

  wrapper.scrollTop += delta;
}

export default function TimelineGrid({
  tl,
  seconds,
  jobFilter,
  focusJobId,
  focusSecond,
  followTime = false,
  onTimeClick,
  onEventClick,
  syncSeconds,
  focusLineIndex,
  focusSkillId,
  focusRequestKey,
  scrollToSecond,
  scrollRequestKey,
}: {
  tl: Timeline;
  seconds: number[];
  jobFilter?: JobId | null;
  focusJobId?: JobId | null;
  focusSecond?: number | null;
  followTime?: boolean;
  onTimeClick?: (sec: number) => void;
  /** 動画モード: イベント名クリックで動画をシーク */
  onEventClick?: (sec: number) => void;
  syncSeconds?: readonly number[];
  focusLineIndex?: number | null;
  focusSkillId?: string | null;
  focusRequestKey?: number;
  /** フェーズタブなどからの明示ジャンプ */
  scrollToSecond?: number | null;
  scrollRequestKey?: number;
}) {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const damagePopoverRef = useRef<HTMLDivElement | null>(null);
  const handledPhaseScrollKeyRef = useRef<number | undefined>(undefined);
  const handledValidationFocusKeyRef = useRef<number | undefined>(undefined);
  const team = useStore((s) => s.team);
  const setTeam = useStore((s) => s.setTeam);
  const usages = useStore((s) => s.usages);
  const addUsage = useStore((s) => s.addUsage);
  const momentNotes = useStore((s) => s.momentNotes);
  const setMomentNote = useStore((s) => s.setMomentNote);
  const layoutPrefs = useStore(
    (s) => s.plansByTimeline[resolveTimelineId(s.timelineId)]?.layoutPrefs
  );
  const memoWidthPx = resolveMemoColumnWidth(layoutPrefs);
  const setMemoColumnWidth = useStore((s) => s.setMemoColumnWidth);
  const [memoWidthOverridePx, setMemoWidthOverridePx] = useState<number | null>(
    null
  );
  const [timeDisplayMode, setTimeDisplayMode] = useState<TimelineTimeDisplayMode>(
    loadTimelineTimeDisplayMode
  );
  const activeMemoWidthPx = memoWidthOverridePx ?? memoWidthPx;
  const tableLayoutStyle = useMemo(
    () =>
      ({
        "--mp-col-memo-w": `${activeMemoWidthPx}px`,
      }) as CSSProperties,
    [activeMemoWidthPx]
  );
  const expandedJobs = useStore((s) => s.expandedJobs);
  const hideRowsWithoutEvents = useStore((s) => s.hideRowsWithoutEvents);
  const cardOnlyJobs = useStore((s) => s.cardOnlyJobs);
  const evolveJobs = useStore((s) => s.evolveJobs);
  const toggleJobExpand = useStore((s) => s.toggleJobExpand);
  const toggleJobCardOnly = useStore((s) => s.toggleJobCardOnly);
  const toggleJobEvolve = useStore((s) => s.toggleJobEvolve);
  const [draggingJobId, setDraggingJobId] = useState<JobId | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [damagePopover, setDamagePopover] = useState<DamagePopoverState | null>(null);
  const [astCopyFeedback, setAstCopyFeedback] = useState<{
    skillId: string;
    message: string;
  } | null>(null);
  const hasMechanisms = Boolean(tl.mechanisms?.length);

  const syncSecondsSet = useMemo(
    () => new Set(syncSeconds ?? []),
    [syncSeconds]
  );

  function toggleTimeDisplayMode() {
    setTimeDisplayMode((prev) => {
      const next = prev === "clock" ? "seconds" : "clock";
      saveTimelineTimeDisplayMode(next);
      return next;
    });
  }

  async function handleAstSkillIconClick(skillId: string, skillName: string) {
    if (!import.meta.env.DEV) {
      return;
    }

    const { copyAstReactionCode } = await import("../logic/astReactionDev");
    const result = await copyAstReactionCode(skillId, skillName);
    setAstCopyFeedback({ skillId, message: result.message });
    window.setTimeout(() => {
      setAstCopyFeedback((current) =>
        current?.skillId === skillId ? null : current
      );
    }, 3000);
  }
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

  function handleJobContextMenu(event: MouseEvent<HTMLTableCellElement>, jobId: JobId) {
    event.preventDefault();
    toggleJobEvolve(jobId);
  }

  // Pre-build usage index for O(1) lookup in render
  const usageIndex = useMemo(() => {
    const map = new Map<string, typeof usages[0]>();
    for (const u of usages) {
      map.set(`${u.jobId}::${u.skillId}::${u.t_sec}::${u.lineIndex}`, u);
    }
    return map;
  }, [usages]);

  const validationIssues = useMemo(() => {
    return validatePlan({ usages });
  }, [usages]);

  const validationIssuesByLocation = useMemo(() => {
    const map = new Map<string, ValidationIssue>();

    for (const issue of validationIssues) {
      if (issue.location) {
        map.set(validationLocationKey(issue.location), issue);
      }
      if (issue.relatedLocation) {
        map.set(validationLocationKey(issue.relatedLocation), issue);
      }
    }

    return map;
  }, [validationIssues]);

  const validationRows = useMemo(() => {
    const set = new Set<string>();

    for (const issue of validationIssues) {
      if (issue.location) {
        set.add(validationRowKey(issue.location));
      }
      if (issue.relatedLocation) {
        set.add(validationRowKey(issue.relatedLocation));
      }
    }

    return set;
  }, [validationIssues]);

  const cols: Col[] = useMemo(() => {
    const out: Col[] = [];
    for (const jobId of visibleTeam) {
      const jobName = JOBS.find((j) => j.id === jobId)?.name ?? jobId;
      const skillMode = evolveJobs.includes(jobId) ? "evolve" : "normal";
      const isCardVisible = skillMode === "normal" && cardOnlyJobs.includes(jobId);
      const isExpanded = expandedJobs.includes(jobId);
      const includeSecondary = isExpanded || isCardVisible;
      const skillSet =
        skillMode === "evolve"
          ? JOB_SKILLS[jobId]?.evolve ?? JOB_SKILLS[jobId]
          : JOB_SKILLS[jobId];
      const secondarySkillIds = new Set(skillSet?.secondary ?? []);
      const skillIds = getJobSkillIds(jobId, includeSecondary, skillMode).filter((skillId) => {
        if (!(jobId === "healer.ast" && includeSecondary)) {
          return true;
        }

        if (!secondarySkillIds.has(skillId)) {
          return true;
        }

        const isCardSkill = isAstCardSkill(skillId) || isAstDrawSkill(skillId);
        if (isExpanded && isCardVisible) {
          return true;
        }
        if (isExpanded) {
          return !isCardSkill;
        }
        if (isCardVisible) {
          return isCardSkill;
        }
        return false;
      });
      for (const sid of skillIds) {
        const sk = SKILL_MAP[sid];
        if (sk) out.push({ jobId, jobName, skill: sk });
      }
    }
    return out;
  }, [visibleTeam, expandedJobs, cardOnlyJobs, evolveJobs]);

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

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    /** 画面全体の縦位置（50% より少し上） */
    const SITE_CENTER_RATIO = 0.44;

    const syncMechanismLayoutVars = () => {
      const thead = wrapper.querySelector<HTMLElement>("thead.mp-header-sticky");
      let headerOffset = 48;
      if (thead) {
        headerOffset = Math.ceil(thead.getBoundingClientRect().height);
        wrapper.style.setProperty("--mp-sticky-header-offset", `${headerOffset}px`);
      }

      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const wrapperRect = wrapper.getBoundingClientRect();
      const siteCenterY = viewportH * SITE_CENTER_RATIO;
      let mechanismStickyTop = Math.round(siteCenterY - wrapperRect.top);

      const minTop = headerOffset + 8;
      const maxTop = Math.max(minTop, Math.ceil(wrapper.clientHeight) - 16);
      mechanismStickyTop = Math.min(Math.max(mechanismStickyTop, minTop), maxTop);

      wrapper.style.setProperty("--mp-mechanism-sticky-top", `${mechanismStickyTop}px`);
    };

    syncMechanismLayoutVars();

    const thead = wrapper.querySelector<HTMLElement>("thead.mp-header-sticky");
    const main = wrapper.closest("main");
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncMechanismLayoutVars)
        : null;
    resizeObserver?.observe(wrapper);
    if (thead) {
      resizeObserver?.observe(thead);
    }
    if (main) {
      resizeObserver?.observe(main);
    }

    window.addEventListener("resize", syncMechanismLayoutVars);
    window.addEventListener("scroll", syncMechanismLayoutVars, { passive: true });
    window.visualViewport?.addEventListener("resize", syncMechanismLayoutVars);
    window.visualViewport?.addEventListener("scroll", syncMechanismLayoutVars);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncMechanismLayoutVars);
      window.removeEventListener("scroll", syncMechanismLayoutVars);
      window.visualViewport?.removeEventListener("resize", syncMechanismLayoutVars);
      window.visualViewport?.removeEventListener("scroll", syncMechanismLayoutVars);
    };
  }, [
    team.length,
    expandedJobs,
    evolveJobs,
    cardOnlyJobs,
    activeMemoWidthPx,
    jobFilter,
    cols.length,
  ]);

  const freezeOffsets = useMemo(
    () => ({
      mechanism: "0px",
      time: hasMechanisms ? MECHANISM_COL_CSS_VAR : "0px",
      event: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR})`
        : TIME_COL_CSS_VAR,
      memo: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR})`
        : `calc(${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR})`,
      elem: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR} + ${MEMO_COL_CSS_VAR})`
        : `calc(${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR} + ${MEMO_COL_CSS_VAR})`,
      damage: hasMechanisms
        ? `calc(${MECHANISM_COL_CSS_VAR} + ${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR} + ${MEMO_COL_CSS_VAR} + ${ELEMENT_COL_CSS_VAR})`
        : `calc(${TIME_COL_CSS_VAR} + ${EVENT_COL_CSS_VAR} + ${MEMO_COL_CSS_VAR} + ${ELEMENT_COL_CSS_VAR})`,
    }),
    [hasMechanisms]
  );

  const formatNumber = (value?: number) =>
      typeof value === "number"
      ? value.toLocaleString("ja-JP")
      : "—";
  const formatPct = (value: number) => {
    const pct = value * 100;
    return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`;
  };

  const mechanismNames = useMemo(
    () => mechanismNamesAtSeconds(tl, seconds),
    [seconds, tl]
  );

  const { rows, secondLines } = useMemo(
    () => buildRowData(tl, seconds),
    [seconds, tl]
  );

  const compactEventView = hideRowsWithoutEvents;

  const displaySecondLines = useMemo(() => {
    if (!compactEventView) {
      return secondLines;
    }
    return compactSecondLinesForEvents(secondLines, tl);
  }, [compactEventView, secondLines, tl]);

  const displayRows = useMemo(() => {
    if (!compactEventView) {
      return rows;
    }
    const allowedSecs = new Set(displaySecondLines.map((secInfo) => secInfo.sec));
    return rows.filter((row) => allowedSecs.has(row.sec));
  }, [compactEventView, displaySecondLines, rows]);

  const displayMechanismRuns = useMemo(
    () =>
      buildMechanismRuns(hasMechanisms, mechanismNames, displaySecondLines),
    [displaySecondLines, hasMechanisms, mechanismNames]
  );

  const mechanismRunRanges = useMemo(
    () => buildMechanismRunRanges(displayMechanismRuns),
    [displayMechanismRuns]
  );

  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  const [wrapperViewportHeight, setWrapperViewportHeight] = useState(0);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const syncViewport = () => {
      setVirtualScrollTop(wrapper.scrollTop);
      setWrapperViewportHeight(wrapper.clientHeight);
    };

    syncViewport();
    wrapper.addEventListener("scroll", syncViewport, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncViewport)
        : null;
    resizeObserver?.observe(wrapper);

    return () => {
      wrapper.removeEventListener("scroll", syncViewport);
      resizeObserver?.disconnect();
    };
  }, [displayRows.length, cols.length, hasMechanisms]);

  const virtualRange = useMemo(
    () =>
      computeTimelineVirtualRange(
        displayRows.length,
        virtualScrollTop,
        wrapperViewportHeight,
        TIMELINE_ROW_HEIGHT_PX
      ),
    [displayRows.length, virtualScrollTop, wrapperViewportHeight]
  );

  const visibleDisplayRows = useMemo(() => {
    if (!virtualRange.enabled) {
      return displayRows.map((row, displayIndex) => ({ row, displayIndex }));
    }

    const items: Array<{
      row: (typeof displayRows)[number];
      displayIndex: number;
    }> = [];
    for (let displayIndex = virtualRange.start; displayIndex <= virtualRange.end; displayIndex++) {
      const row = displayRows[displayIndex];
      if (row) {
        items.push({ row, displayIndex });
      }
    }
    return items;
  }, [displayRows, virtualRange]);

  const totalColumnCount =
    (hasMechanisms ? 1 : 0) + 5 + cols.length;

  const rowIndexLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (let r = 0; r < rows.length; r++) {
      map.set(`${rows[r].sec}::${rows[r].lineIndex}`, r);
    }
    return map;
  }, [rows]);

  const rowToSec = useMemo(() => rows.map((row) => row.sec), [rows]);

  function handleSkillCellContextMenu(
    event: MouseEvent<HTMLTableCellElement>,
    col: Col,
    rowSec: number,
    rowLineIndex: number,
    disabled: boolean,
    usageAtClick?: PlanUsage
  ) {
    event.preventDefault();
    if (disabled) {
      return;
    }

    const placement = getEffectStartPlacementFromEndClick(
      col.skill,
      rowSec,
      rowLineIndex,
      rows,
      usageAtClick
    );
    if (!placement) {
      return;
    }

    const { startSec, lineIndex, stacks } = placement;
    const targetKey = `${col.jobId}::${col.skill.id}::${startSec}::${lineIndex}`;
    if (usageIndex.has(targetKey)) {
      return;
    }

    addUsage(col.jobId, col.skill.id, startSec, lineIndex, stacks);
  }

  const usagesByJobSkill = useMemo(() => {
    const map = new Map<string, typeof usages>();
    for (const usage of usages) {
      const key = `${usage.jobId}::${usage.skillId}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(usage);
    }
    return map;
  }, [usages]);

  const astDrawSlotsByJob = useMemo(() => {
    const map = new Map<JobId, ReturnType<typeof buildAstDrawSlots>>();
    const maxSec = seconds[seconds.length - 1] ?? 0;

    for (const jobId of visibleTeam) {
      if (jobId !== "healer.ast") {
        continue;
      }

      map.set(jobId, buildAstDrawSlots(jobId, usages, maxSec));
    }

    return map;
  }, [seconds, usages, visibleTeam]);

  const astManualDrawUsagesByJobCycle = useMemo(() => {
    const map = new Map<string, readonly PlanUsage[]>();

    for (const [jobId, slots] of astDrawSlotsByJob.entries()) {
      for (const slot of slots) {
        map.set(`${jobId}::${slot.cycleIndex}`, slot.manualUsages);
      }
    }

    return map;
  }, [astDrawSlotsByJob]);

  const schAetherflowSimulationByJob = useMemo(() => {
    const map = new Map<JobId, ReturnType<typeof simulateSchAetherflow>>();
    const maxSec = seconds[seconds.length - 1] ?? 0;

    for (const jobId of visibleTeam) {
      if (jobId !== "healer.sch") {
        continue;
      }

      map.set(jobId, simulateSchAetherflow(jobId, usages, maxSec));
    }

    return map;
  }, [seconds, usages, visibleTeam]);

  const schAetherflowManualUsagesByJobCycle = useMemo(() => {
    const map = new Map<string, readonly PlanUsage[]>();

    for (const [jobId, simulation] of schAetherflowSimulationByJob.entries()) {
      for (const [cycleIndex, cycleManualUsages] of simulation.slotManualUsagesByCycle.entries()) {
        map.set(`${jobId}::${cycleIndex}`, cycleManualUsages);
      }
    }

    return map;
  }, [schAetherflowSimulationByJob]);

  const whmLilySimulationByJob = useMemo(() => {
    const map = new Map<JobId, ReturnType<typeof simulateWhmLilies>>();
    const maxSec = seconds[seconds.length - 1] ?? 0;

    for (const jobId of visibleTeam) {
      if (jobId !== "healer.whm") {
        continue;
      }

      map.set(jobId, simulateWhmLilies(jobId, usages, maxSec));
    }

    return map;
  }, [seconds, usages, visibleTeam]);

  const sgeAddersgallSimulationByJob = useMemo(() => {
    const map = new Map<JobId, ReturnType<typeof simulateSgeAddersgall>>();
    const maxSec = seconds[seconds.length - 1] ?? 0;

    for (const jobId of visibleTeam) {
      if (jobId !== "healer.sge") {
        continue;
      }

      map.set(jobId, simulateSgeAddersgall(jobId, usages, maxSec));
    }

    return map;
  }, [seconds, usages, visibleTeam]);

  useEffect(() => {
    if (!followTime || focusSecond === null || focusSecond === undefined) {
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const virtualEnabled =
      displayRows.length >= TIMELINE_VIRTUAL_MIN_ROWS && wrapper.clientHeight > 0;

    if (virtualEnabled) {
      const displayIndex = findDisplayIndexForTimelineSec(displayRows, focusSecond);
      if (displayIndex < 0) {
        return;
      }

      if (
        !isDisplayIndexInComfortZone(
          displayIndex,
          wrapper.scrollTop,
          wrapper.clientHeight,
          TIMELINE_ROW_HEIGHT_PX
        )
      ) {
        scrollWrapperToDisplayIndex(wrapper, displayIndex, TIMELINE_ROW_HEIGHT_PX);
      }
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
  }, [displayRows, followTime, focusSecond]);

  useEffect(() => {
    if (scrollRequestKey === undefined) {
      return;
    }
    if (scrollToSecond === null || scrollToSecond === undefined) {
      return;
    }
    if (handledPhaseScrollKeyRef.current === scrollRequestKey) {
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    let cancelled = false;
    const scrollToTarget = () => {
      if (cancelled) {
        return;
      }

      const virtualEnabled =
        displayRows.length >= TIMELINE_VIRTUAL_MIN_ROWS && wrapper.clientHeight > 0;

      if (virtualEnabled) {
        const displayIndex = findDisplayIndexForTimelineSec(
          displayRows,
          scrollToSecond
        );
        if (displayIndex < 0) {
          return;
        }
        scrollWrapperToDisplayIndex(wrapper, displayIndex, TIMELINE_ROW_HEIGHT_PX);
        handledPhaseScrollKeyRef.current = scrollRequestKey;
        return;
      }

      const targetRow = resolvePhaseScrollRow(wrapper, scrollToSecond);
      if (!targetRow) {
        return;
      }

      scrollWrapperToTimelineRow(wrapper, targetRow);
      handledPhaseScrollKeyRef.current = scrollRequestKey;
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToTarget);
    });

    return () => {
      cancelled = true;
    };
  }, [displayRows, scrollRequestKey, scrollToSecond, wrapperViewportHeight]);

  useEffect(() => {
    if (
      focusRequestKey === undefined ||
      focusSecond === null ||
      focusSecond === undefined ||
      focusLineIndex === null ||
      focusLineIndex === undefined
    ) {
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    if (handledValidationFocusKeyRef.current === focusRequestKey) {
      return;
    }

    const rowKey = `${focusSecond}::${focusLineIndex}`;
    const displayIndex = displayRows.findIndex(
      (row) => row.sec === focusSecond && row.lineIndex === focusLineIndex
    );
    const virtualEnabled =
      displayRows.length >= TIMELINE_VIRTUAL_MIN_ROWS && wrapper.clientHeight > 0;

    const scrollToDomTargets = () => {
      const targetRow = wrapper.querySelector<HTMLTableRowElement>(
        `tr[data-row-key="${rowKey}"]`
      );
      const targetCell =
        focusSkillId
          ? wrapper.querySelector<HTMLTableCellElement>(
              `td[data-cell-key$="::${focusSecond}::${focusLineIndex}"][data-skill-id="${focusSkillId}"]`
            )
          : null;

      if (targetRow) {
        targetRow.scrollIntoView({ block: "center" });
      }
      if (targetCell) {
        targetCell.scrollIntoView({ inline: "center", block: "nearest" });
      }
      handledValidationFocusKeyRef.current = focusRequestKey;
    };

    if (virtualEnabled && displayIndex >= 0) {
      scrollWrapperToDisplayIndex(wrapper, displayIndex, TIMELINE_ROW_HEIGHT_PX);
      requestAnimationFrame(() => {
        requestAnimationFrame(scrollToDomTargets);
      });
      return;
    }

    scrollToDomTargets();
  }, [displayRows, focusLineIndex, focusRequestKey, focusSecond, focusSkillId]);

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

          vis[ci][r] = { color, checked, shape: "none" };
        }

        applyBarShapes(vis[ci]);
        continue;
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

          vis[ci][r] = { color, checked, shape: "none" };
        }

        applyBarShapes(vis[ci]);
        continue;
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

          vis[ci][r] = {
            color: checked ? "green" : "none",
            checked,
            shape: "none",
            chargeCount: lilyState.lilies,
            bloodCount: lilyState.bloodLilies,
          };
        }

        applyBarShapes(vis[ci]);
        continue;
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

          vis[ci][r] = {
            color,
            checked,
            shape: "none",
          };
        }

        applyBarShapes(vis[ci]);
        continue;
      }

      const sgeAddersgallSimulation = sgeAddersgallSimulationByJob.get(col.jobId);
      if (isSgeAddersgallSkill(col.skill.id) && sgeAddersgallSimulation) {
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          const rowKey = `${col.jobId}::${col.skill.id}::${row.sec}::${row.lineIndex}`;
          const addersgallState = getSgeAddersgallStateAtPoint(
            sgeAddersgallSimulation,
            row.sec,
            row.lineIndex
          );
          const checked = sgeAddersgallSimulation.manualOverrideKeys.has(rowKey);

          vis[ci][r] = {
            color: checked ? "green" : "none",
            checked,
            shape: "none",
            chargeCount: addersgallState.available,
          };
        }

        applyBarShapes(vis[ci]);
        continue;
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

          vis[ci][r] = {
            color,
            checked,
            shape: "none",
          };
        }

        applyBarShapes(vis[ci]);
        continue;
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

          vis[ci][r] = {
            color,
            checked,
            shape: "none",
            chargeCount: aetherflowState.available,
          };
        }

        applyBarShapes(vis[ci]);
        continue;
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

          vis[ci][r] = {
            color,
            checked,
            shape: "none",
          };
        }

        applyBarShapes(vis[ci]);
        continue;
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
        const skipDuplicateChildCheck = col.skill.id === "healer.sch.consolation";

        for (const pu of parentUsages) {
          // Find all child usages within this parent's duration (+ grace period)
          const childrenInThisParent: typeof usages = [];
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
              if (rowSec >= startSec && rowSec <= endSec && vis[ci][r].color !== "none") {
                vis[ci][r].color = "conflict";
              }
            }
          }
        }
      }

      applyBarShapes(vis[ci]);
    }

    return vis;
  }, [
    astDrawSlotsByJob,
    cols,
    rowIndexLookup,
    rowToSec,
    rows,
    schAetherflowSimulationByJob,
    sgeAddersgallSimulationByJob,
    usagesByJobSkill,
    whmLilySimulationByJob,
  ]);

  const validUsageKeys = useMemo(() => {
    const keys = new Set<string>();

    for (let ci = 0; ci < cols.length; ci++) {
      for (let ri = 0; ri < rows.length; ri++) {
        const visual = gridVisual[ci]?.[ri];
        if (!visual?.checked || visual.color === "conflict") {
          continue;
        }

        const row = rows[ri];
        keys.add(`${cols[ci].jobId}::${cols[ci].skill.id}::${row.sec}::${row.lineIndex}`);
      }
    }

    return keys;
  }, [cols, gridVisual, rows]);

  const rowMitigationSummaries = useMemo(() => {
    const validMitigationUsages = usages.flatMap((usage) => {
      const usageKey = `${usage.jobId}::${usage.skillId}::${usage.t_sec}::${usage.lineIndex}`;
      if (!validUsageKeys.has(usageKey)) {
        return [];
      }

      const skill = SKILL_MAP[usage.skillId];
      if (!skill) {
        return [];
      }

      if (
        !skill.kinds.includes("mitigation") &&
        !skill.kinds.includes("shield") &&
        !skill.kinds.includes("invuln")
      ) {
        return [];
      }

      return [{ usage, skill }];
    });

    return rows.map((row) => {
      const moment = row.line.moment;
      if (!moment) {
        return null;
      }

      if (typeof moment.damage !== "number" && typeof moment.dot !== "number") {
        return null;
      }

      const effects = [];
      for (const { usage, skill } of validMitigationUsages) {
        if (!isUsageActiveAtPoint(usage, skill, row.sec, row.lineIndex)) {
          continue;
        }

        const effect = buildMitigationEffect(skill, usage, moment.elem);
        if (effect) {
          effects.push(effect);
        }
      }

      if (effects.length === 0) {
        return null;
      }

      return summarizeMitigation(effects, moment.damage, moment.dot);
    });
  }, [rows, usages, validUsageKeys]);

  const tankDamageSummariesByRow = useMemo(() => {
    const tankJobIds = visibleTeam.filter((jobId) =>
      JOBS.find((job) => job.id === jobId)?.role === "tank"
    );

    if (tankJobIds.length === 0) {
      return [];
    }

    const validMitigationUsages = usages.flatMap((usage) => {
      const usageKey = `${usage.jobId}::${usage.skillId}::${usage.t_sec}::${usage.lineIndex}`;
      if (!validUsageKeys.has(usageKey)) {
        return [];
      }

      const skill = SKILL_MAP[usage.skillId];
      if (!skill) {
        return [];
      }

      if (
        !skill.kinds.includes("mitigation") &&
        !skill.kinds.includes("shield") &&
        !skill.kinds.includes("invuln")
      ) {
        return [];
      }

      return [{ usage, skill }];
    });

    return rows.map((row) => {
      const moment = row.line.moment;
      if (!moment) {
        return [];
      }

      if (typeof moment.damage !== "number" && typeof moment.dot !== "number") {
        return [];
      }

      return tankJobIds.map((jobId) => {
        const effects = [];
        for (const { usage, skill } of validMitigationUsages) {
          if (!isUsageActiveAtPoint(usage, skill, row.sec, row.lineIndex)) {
            continue;
          }

          const effect = buildTargetMitigationEffect(skill, usage, moment.elem, jobId);
          if (effect) {
            effects.push(effect);
          }
        }

        return {
          jobId,
          summary: summarizeMitigation(effects, moment.damage, moment.dot),
        };
      });
    });
  }, [rows, usages, validUsageKeys, visibleTeam]);

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

  const renderMomentTags = (moment?: Moment) => {
    if (!moment?.tags?.length) return null;

    return (
      <div className="mp-moment-tags" aria-label="タイムラインタグ">
        {moment.tags.map((tag) => (
          <span
            key={tag}
            className={`mp-moment-tag mp-moment-tag--${tag}`}
            title={MOMENT_TAG_LABELS[tag] ?? tag}
          >
            {MOMENT_TAG_LABELS[tag] ?? tag}
          </span>
        ))}
      </div>
    );
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

  const updateDamagePopover = (
    rowIndex: number,
    event: MouseEvent<HTMLElement>
  ) => {
    const popoverWidth = 360;
    const margin = 12;
    const left = Math.min(
      event.clientX + 16,
      Math.max(margin, window.innerWidth - popoverWidth - margin)
    );
    const top = Math.max(margin, event.clientY + 16);

    setDamagePopover({ rowIndex, x: left, y: top });
  };

  useLayoutEffect(() => {
    if (!damagePopover) {
      return;
    }

    const popover = damagePopoverRef.current;
    if (!popover) {
      return;
    }

    const margin = 12;
    const rect = popover.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    const nextX = Math.min(Math.max(margin, damagePopover.x), maxLeft);
    const nextY = Math.min(Math.max(margin, damagePopover.y), maxTop);

    if (nextX === damagePopover.x && nextY === damagePopover.y) {
      return;
    }

    setDamagePopover((current) => {
      if (!current || current.rowIndex !== damagePopover.rowIndex) {
        return current;
      }
      return { ...current, x: nextX, y: nextY };
    });
  }, [damagePopover]);

  const renderMitigationPopover = () => {
    if (!damagePopover) {
      return null;
    }

    const row = rows[damagePopover.rowIndex];
    const moment = row?.line.moment;
    if (!row || !moment) {
      return null;
    }

    const summary = rowMitigationSummaries[damagePopover.rowIndex];
    const effects = summary?.effects ?? [];
    const tankDamageSummaries =
      tankDamageSummariesByRow[damagePopover.rowIndex] ?? [];
    const totalMitigation = summary?.immune
      ? "無効"
      : summary
        ? formatPct(summary.mitigationPct)
        : "0%";
    const hitTaken =
      typeof moment.damage === "number"
        ? summary?.hitTaken ?? moment.damage
        : undefined;
    const dotTaken =
      typeof moment.dot === "number"
        ? summary?.dotTaken ?? moment.dot
        : undefined;

    return (
      <div
        ref={damagePopoverRef}
        className="mp-mitigation-popover"
        style={{
          left: damagePopover.x,
          top: damagePopover.y,
        }}
      >
        <div className="mp-mitigation-popover-title">
          {formatTimelineSec(row.sec, timeDisplayMode)} {row.line.label || "ダメージ"}
        </div>
        <div className="mp-mitigation-popover-grid">
          {typeof moment.damage === "number" && (
            <>
              <span>元ダメージ</span>
              <strong>{formatNumber(moment.damage)}</strong>
              <span>軽減後</span>
              <strong>{formatNumber(hitTaken)}</strong>
            </>
          )}
          {typeof moment.dot === "number" && (
            <>
              <span>元DoT</span>
              <strong>
                {formatNumber(moment.dot)} x {moment.dot_ticks ?? 1}
              </strong>
              <span>軽減後DoT</span>
              <strong>
                {formatNumber(dotTaken)} x {moment.dot_ticks ?? 1}
              </strong>
            </>
          )}
          <span>合計軽減</span>
          <strong>{totalMitigation}</strong>
        </div>
        {tankDamageSummaries.length > 0 && (
          <div className="mp-mitigation-popover-tanks">
            <div className="mp-mitigation-popover-section-title">
              タンク別被ダメージ
            </div>
            <ul>
              {tankDamageSummaries.map(({ jobId, summary }) => {
                const jobName = JOBS.find((job) => job.id === jobId)?.name ?? jobId;
                const values = [];
                if (typeof moment.damage === "number") {
                  values.push(formatNumber(summary.hitTaken ?? moment.damage));
                }
                if (typeof moment.dot === "number") {
                  values.push(
                    `${formatNumber(summary.dotTaken ?? moment.dot)} x ${
                      moment.dot_ticks ?? 1
                    }`
                  );
                }

                return (
                  <li key={jobId}>
                    <span>{jobName}</span>
                    <strong>{values.join(" / ")}</strong>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="mp-mitigation-popover-effects">
          <div className="mp-mitigation-popover-section-title">適用中の軽減</div>
          {effects.length > 0 ? (
            <ul>
              {effects.map((effect, index) => (
                <li key={`${effect.skill.id}-${index}`}>
                  <span>{effect.skill.name}</span>
                  <strong>
                    {effect.immune ? "無効" : formatPct(1 - effect.multiplier)}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>軽減は入っていません</p>
          )}
        </div>
      </div>
    );
  };

  const renderDamageContentAtRow = (moment: Moment | undefined, rowIndex: number) => {
    if (!moment) {
      return <span className="mp-damage-none">{"\u2014"}</span>;
    }

    const summary = rowMitigationSummaries[rowIndex];
    if (!summary) {
      return renderDamageContent(moment);
    }

    const chunks: JSX.Element[] = [];

    if (typeof moment.damage === "number") {
      const reducedDamage = summary.hitTaken ?? moment.damage;

      chunks.push(
        <span
          key="hit"
          className={`mp-damage-number ${
            summary.immune || summary.mitigationPct > 0 ? "mp-damage-number--mitigated" : ""
          }`}
        >
          {formatNumber(reducedDamage)}
        </span>
      );
    }

    if (typeof moment.dot === "number") {
      const dotIcon = getDamageTypeIcon("dot");
      const reducedDot = summary.dotTaken ?? moment.dot;
      const dotTicks = moment.dot_ticks ?? 1;

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
          <span
            className={`mp-damage-number ${
              summary.immune || summary.mitigationPct > 0 ? "mp-damage-number--mitigated" : ""
            }`}
          >
            {formatNumber(reducedDot)} x {dotTicks}
          </span>
        </span>
      );
    }

    if (chunks.length === 0) {
      return <span className="mp-damage-none">{"\u2014"}</span>;
    }
    if (chunks.length === 1) {
      return chunks[0];
    }

    return <div className="mp-damage-stack">{chunks}</div>;
  };

  return (
    <div className="w-full">
      <div className="w-full px-2 mp-shell">
        <div
          ref={wrapperRef}
          className="rounded mp-wrapper"
          style={tableLayoutStyle}
        >
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
                  <button
                    type="button"
                    onClick={toggleTimeDisplayMode}
                    className="mp-time-header-toggle"
                    title={
                      timeDisplayMode === "clock"
                        ? t("timeline.headers.timeToggleToSeconds")
                        : t("timeline.headers.timeToggleToClock")
                    }
                  >
                    {timeDisplayMode === "clock"
                      ? t("timeline.headers.time")
                      : `${t("timeline.headers.time")}(秒)`}
                  </button>
                </th>
                <th
                  className="p-2 text-left mp-col-event mp-col-freeze mp-col-freeze--middle"
                  rowSpan={2}
                  style={freezeStyle(freezeOffsets.event)}>
                  {t("timeline.headers.event")}
                </th>
                <MemoColumnHeader
                  label={t("timeline.headers.memo")}
                  widthPx={activeMemoWidthPx}
                  freezeLeft={freezeOffsets.memo}
                  onPreviewWidth={setMemoWidthOverridePx}
                  onWidthCommit={setMemoColumnWidth}
                />
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
                  let roleGroup: "tank" | "healer" | "dps" | "utility";
                  if (rawRole === "tank") roleGroup = "tank";
                  else if (rawRole === "healer") roleGroup = "healer";
                  else if (rawRole === "utility") roleGroup = "utility";
                  else if (rawRole === "melee" ||rawRole === "ranged" ||rawRole === "caster") 
                    roleGroup = "dps";
                  else roleGroup = "dps";

                  const roleClass = `mp-job-header--${roleGroup}`;
                  const isExpanded = expandedJobs.includes(jobId);
                  const isEvolve = evolveJobs.includes(jobId);
                  const isCardVisible = !isEvolve && cardOnlyJobs.includes(jobId);
                  const canToggleCardOnly = jobId === "healer.ast" && !isEvolve;
                  const skillMode = isEvolve ? "evolve" : "normal";
                  const hasSecondary = hasSecondarySkills(jobId, skillMode);
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
                      onContextMenu={(event) => handleJobContextMenu(event, jobId)}
                      className={`p-2 text-center border-l mp-job-header mp-job-header--group ${roleClass} ${
                        canReorderJobs ? "mp-job-header--draggable" : ""
                      } ${draggingJobId === jobId ? "mp-job-header--dragging" : ""} ${
                        isSingleColumnJob ? "mp-job-header--single" : ""
                      } ${isEvolve ? "mp-job-header--evolve" : ""
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
                        {isEvolve && (
                          <span className="mp-job-evolve-badge" title="エヴォルヴ">
                            EV
                          </span>
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
                        {canToggleCardOnly && (
                          <button
                            className={`mp-job-extra-btn ${
                              isCardVisible ? "mp-job-extra-btn--active" : ""
                            }`}
                            onClick={() => toggleJobCardOnly(jobId)}
                            title={isCardVisible ? "カード表示を解除" : "カードを表示"}
                            aria-pressed={isCardVisible}
                          >
                            札
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
                  const icon = getSkillIcon(c.skill.id) ?? c.skill.icon;
                  const skillName = c.skill.name;
                  const hasStacks =
                    isChargeSkill(c.skill) ||
                    (typeof c.skill.maxStacks === "number" && c.skill.maxStacks > 0);
                  const isJobStart = ci === 0 || cols[ci - 1]?.jobId !== c.jobId;
                  const isJobEnd = ci === cols.length - 1 || cols[ci + 1]?.jobId !== c.jobId;
                  const isAstDevCopy =
                    import.meta.env.DEV && c.jobId === "healer.ast";
                  const iconTitle =
                    astCopyFeedback?.skillId === c.skill.id
                      ? astCopyFeedback.message
                      : isAstDevCopy
                        ? `${skillName}（クリックで反応マクロをコピー）`
                        : skillName;
                  return (
                    <th
                      key={c.jobId + "::" + c.skill.id}
                      className={`mp-skill-header ${hasStacks ? "mp-skill-header--stack" : ""} ${isJobStart ? "mp-skill-header--job-start" : ""} ${isJobEnd ? "mp-skill-header--job-end" : ""}`}
                    >
                      <div className="mp-skill-header-inner">
                        {icon ? (
                          <img
                            className={`mp-skill-icon${isAstDevCopy ? " mp-skill-icon--dev-copy" : ""}`}
                            src={icon}
                            alt={skillName}
                            title={iconTitle}
                            onClick={
                              isAstDevCopy
                                ? () => {
                                    void handleAstSkillIconClick(
                                      c.skill.id,
                                      skillName
                                    );
                                  }
                                : undefined
                            }
                          />
                        ) : (
                          <span
                            className={
                              isAstDevCopy
                                ? "mp-skill-fallback mp-skill-fallback--dev-copy"
                                : "mp-skill-fallback"
                            }
                            title={iconTitle}
                            onClick={
                              isAstDevCopy
                                ? () => {
                                    void handleAstSkillIconClick(
                                      c.skill.id,
                                      skillName
                                    );
                                  }
                                : undefined
                            }
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
              {virtualRange.enabled && virtualRange.paddingTop > 0 && (
                <tr className="mp-row-virtual-spacer" aria-hidden="true">
                  <td
                    colSpan={totalColumnCount}
                    style={{
                      height: virtualRange.paddingTop,
                      padding: 0,
                      border: "none",
                      lineHeight: 0,
                    }}
                  />
                </tr>
              )}
              {visibleDisplayRows.map(({ row, displayIndex }) => {
                const mechanismCell = hasMechanisms
                  ? virtualRange.enabled
                    ? resolveVirtualMechanismCell(
                        displayIndex,
                        virtualRange.start,
                        virtualRange.end,
                        displayMechanismRuns,
                        mechanismRunRanges
                      )
                    : (() => {
                        const cell = displayMechanismRuns.get(displayIndex);
                        return cell
                          ? { label: cell.label, rowSpan: cell.span }
                          : null;
                      })()
                  : null;
                const summaryRowIndex = row.rowIndex;
                const moment = row.line.moment;
                const rowKey = `${row.sec}::${row.lineIndex}`;
                const hasValidationIssue = validationRows.has(rowKey);

              return (
                  <tr
                    key={rowKey}
                    data-row-sec={row.sec}
                    data-row-key={rowKey}
                    className={`mp-row align-top ${
                      focusSecond === row.sec ? "mp-row--focus" : ""
                    } ${hasValidationIssue ? "mp-row--validation-issue" : ""}`}
                  >
                    {hasMechanisms && mechanismCell && (
                      <td
                        className="p-0 mp-col-mechanism mp-col-freeze mp-col-freeze--first"
                        rowSpan={mechanismCell.rowSpan}
                        style={freezeStyle(freezeOffsets.mechanism)}>
                        <div className="mp-mechanism-anchor">
                          <div className="mp-mechanism-cell" title={mechanismCell.label}>
                            {mechanismCell.label}
                          </div>
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
                            <span>{formatTimelineSec(row.sec, timeDisplayMode)}</span>
                            {syncSecondsSet.has(row.sec) && (
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-sky-400"
                                aria-label="sync point"
                              />
                            )}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span>{formatTimelineSec(row.sec, timeDisplayMode)}</span>
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
                      title={[
                        row.line.label,
                        ...(moment?.tags ?? []).map((tag) => MOMENT_TAG_LABELS[tag] ?? tag),
                        onEventClick ? "クリックで動画をジャンプ" : "",
                      ].filter(Boolean).join(" / ")}
                    >
                      {onEventClick && row.line.label ? (
                        <button
                          type="button"
                          onClick={() => onEventClick(row.sec)}
                          className="mp-event-cell mp-event-cell--clickable w-full text-left"
                        >
                          {renderMomentTags(moment)}
                          <span className="mp-event-name">{row.line.label}</span>
                        </button>
                      ) : (
                        <div className="mp-event-cell">
                          {renderMomentTags(moment)}
                          <span className="mp-event-name">{row.line.label || "—"}</span>
                        </div>
                      )}
                    </td>
                    <td
                      className="p-1 mp-col-memo mp-col-freeze mp-col-freeze--middle"
                      style={freezeStyle(freezeOffsets.memo)}
                    >
                      <MomentNoteInput
                        value={resolveMomentNote(
                          momentNotes,
                          row.sec,
                          row.lineIndex,
                          moment?.note
                        )}
                        placeholder={t("timeline.headers.memo")}
                        onCommit={(nextValue) =>
                          setMomentNote(row.sec, row.lineIndex, nextValue.trim())
                        }
                      />
                    </td>
                    <td
                      className="p-1 text-center mp-col-element mp-col-freeze mp-col-freeze--middle"
                      style={freezeStyle(freezeOffsets.elem)}>
                      {renderElementBadge(moment)}
                    </td>
                    <td
                      className="p-1 text-right mp-col-damage mp-col-freeze mp-col-freeze--last"
                      style={freezeStyle(freezeOffsets.damage)}>
                      <div
                        className="mp-damage-popover-trigger"
                        onMouseEnter={(event) =>
                          updateDamagePopover(summaryRowIndex, event)
                        }
                        onMouseMove={(event) =>
                          updateDamagePopover(summaryRowIndex, event)
                        }
                        onMouseLeave={() => setDamagePopover(null)}
                      >
                        {renderDamageContentAtRow(moment, summaryRowIndex)}
                      </div>
                    </td>


                    {cols.map((c, ci) => {
                      const isAstDraw = isAstDrawSkill(c.skill.id);
                      const isSchAetherflow = isSchAetherflowSkill(c.skill.id);
                      const isSgeAddersgall = isSgeAddersgallSkill(c.skill.id);
                      const isWhmLily = isWhmLilySkill(c.skill.id);
                      const hasStacks =
                        !isAstDraw &&
                        !isSchAetherflow &&
                        !isSgeAddersgall &&
                        !isWhmLily &&
                        (isChargeSkill(c.skill) ||
                          (typeof c.skill.maxStacks === "number" && c.skill.maxStacks > 0));
                      const astCycleIndex = getAstCycleIndex(row.sec);
                      const schAetherflowCycleIndex = getSchAetherflowCycleIndex(row.sec);
                      const astCycleManualUsages = astManualDrawUsagesByJobCycle.get(
                        `${c.jobId}::${astCycleIndex}`
                      ) ?? [];
                      const schAetherflowCycleManualUsages =
                        schAetherflowManualUsagesByJobCycle.get(
                          `${c.jobId}::${schAetherflowCycleIndex}`
                        ) ?? [];
                      const exactUsage = usageIndex.get(
                        `${c.jobId}::${c.skill.id}::${row.sec}::${row.lineIndex}`
                      );
                      const cellUsage = hasStacks
                        ? exactUsage
                        : undefined;
                      const whmLilyUsage = isWhmLily
                        ? usageIndex.get(`${c.jobId}::${c.skill.id}::${row.sec}::${row.lineIndex}`)
                        : undefined;
                      const sgeAddersgallUsage = isSgeAddersgall
                        ? usageIndex.get(`${c.jobId}::${c.skill.id}::${row.sec}::${row.lineIndex}`)
                        : undefined;
                      const isJobStart = ci === 0 || cols[ci - 1]?.jobId !== c.jobId;
                      const isJobEnd = ci === cols.length - 1 || cols[ci + 1]?.jobId !== c.jobId;
                      const cellKey = `${c.jobId}::${c.skill.id}::${row.sec}::${row.lineIndex}`;
                      const validationIssue = validationIssuesByLocation.get(cellKey);
                      const isFocusedCell =
                        focusSecond === row.sec &&
                        focusLineIndex === row.lineIndex &&
                        focusSkillId === c.skill.id;
                      const skipEffectEndPlacement =
                        isAstDraw ||
                        isSchAetherflow ||
                        isSgeAddersgall ||
                        isWhmLily ||
                        isChargeSkill(c.skill);
                      const effectEndTitle = skipEffectEndPlacement
                        ? undefined
                        : "右クリック: この行を効果の最終秒として開始へ逆算";

                      return (
                        <td
                          key={c.jobId + "::" + c.skill.id + "::" + row.sec + "::" + row.lineIndex}
                          data-cell-key={cellKey}
                          data-skill-id={c.skill.id}
                          title={
                            validationIssue?.message
                              ? validationIssue.message
                              : effectEndTitle
                          }
                          onContextMenu={(event) =>
                            handleSkillCellContextMenu(
                              event,
                              c,
                              row.sec,
                              row.lineIndex,
                              skipEffectEndPlacement,
                              cellUsage ?? exactUsage
                            )
                          }
                          className={`mp-cell mp-skill-cell ${hasStacks ? "mp-skill-cell--stack" : ""} ${isJobStart ? "mp-skill-cell--job-start" : ""} ${isJobEnd ? "mp-skill-cell--job-end" : ""} ${
                            validationIssue
                              ? `mp-cell--validation mp-cell--validation-${validationIssue.severity}`
                              : ""
                          } ${isFocusedCell ? "mp-cell--focus-target" : ""}`}
                        >
                          {isAstDraw ? (
                            <AstDrawCell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][summaryRowIndex]}
                              cycleManualUsages={astCycleManualUsages}
                            />
                          ) : isWhmLily ? (
                            <WhmLilyCell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][summaryRowIndex]}
                              usage={whmLilyUsage}
                            />
                          ) : isSchAetherflow ? (
                            <SchAetherflowCell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][summaryRowIndex]}
                              cycleManualUsages={schAetherflowCycleManualUsages}
                            />
                          ) : isSgeAddersgall ? (
                            <SgeAddersgallCell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][summaryRowIndex]}
                              usage={sgeAddersgallUsage}
                            />
                          ) : hasStacks ? (
                            <StackCell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][summaryRowIndex]}
                              usage={cellUsage}
                            />
                          ) : (
                            <Cell
                              jobId={c.jobId}
                              skill={c.skill}
                              t={row.sec}
                              lineIndex={row.lineIndex}
                              visual={gridVisual[ci][summaryRowIndex]}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {virtualRange.enabled && virtualRange.paddingBottom > 0 && (
                <tr className="mp-row-virtual-spacer" aria-hidden="true">
                  <td
                    colSpan={totalColumnCount}
                    style={{
                      height: virtualRange.paddingBottom,
                      padding: 0,
                      border: "none",
                      lineHeight: 0,
                    }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {renderMitigationPopover()}
      </div>
    </div>
  );
}
