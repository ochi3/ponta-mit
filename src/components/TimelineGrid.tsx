import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, JSX, MouseEvent } from "react";
import { useStore } from "../state/store";
import { JOBS } from "../data/jobs/jobs.registry";
import { SKILL_MAP, hasSecondarySkills } from "../data/skills";
import { resolveDisplayedSkillIds } from "../logic/jobSkillColumns";
import type {
  Timeline,
  JobId,
  SkillData,
  Moment,
  ElementType,
  PlanUsage,
  MomentTag,
} from "../types";
import Cell from "./Cell";
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
import { buildDevTimelineSecondsView } from "../logic/devTimelineSeconds";
import {
  TIMELINE_ROW_HEIGHT_PX,
  TIMELINE_VIRTUAL_MIN_ROWS,
  buildMechanismRunRanges,
  buildSkillColumnWidths,
  computeHorizontalVirtualRange,
  computeTimelineVirtualRange,
  findDisplayIndexForTimelineSec,
  groupVisibleJobHeaders,
  isDisplayIndexInComfortZone,
  resolveVirtualMechanismCell,
  scrollWrapperToDisplayIndex,
} from "../logic/timelineVirtualScroll";
import {
  buildGridVisualWithCache,
  type GridVisualCacheEntry,
  type GridVisualContext,
} from "../logic/timelineGridVisual";
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
import { getEffectStartPlacementFromEndClick } from "../logic/placeUsageAtEffectEnd";
import { validatePlan, type ValidationIssue } from "../logic/validation";
import {
  buildAstDrawSlots,
  getAstCycleIndex,
  isAstDrawSkill,
} from "../logic/astCards";
import { isChargeSkill } from "../logic/skillCharges";
import {
  getSchAetherflowCycleIndex,
  isSchAetherflowSkill,
  simulateSchAetherflow,
} from "../logic/schAetherflow";
import { isWhmLilySkill, simulateWhmLilies } from "../logic/whmLilies";
import {
  buildSgeAddersgallStatesForRows,
  isSgeAddersgallRelatedSkill,
  isSgeAddersgallSkill,
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
const DEV_TIME_COL_CSS_VAR = "var(--mp-col-dev-time-w)";
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
  onPreviewWidth,
  onWidthCommit,
}: {
  label: string;
  widthPx: number;
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
      className="p-2 text-left mp-col-memo"
      rowSpan={2}
      style={{
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

function HorizontalVirtualSpacer({
  width,
  cellTag,
}: {
  width: number;
  cellTag: "th" | "td";
}) {
  if (width <= 0) {
    return null;
  }

  const CellTag = cellTag;
  return (
    <CellTag
      className="mp-col-virtual-spacer"
      aria-hidden
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        padding: 0,
        border: "none",
        lineHeight: 0,
      }}
    />
  );
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
  devTimelineSecondsRevision = 0,
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
  /** dev 用表示秒数の再読み込みトリガー */
  devTimelineSecondsRevision?: number;
}) {
  const { t } = useI18n();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const gridVisualCacheRef = useRef<Map<string, GridVisualCacheEntry>>(new Map());
  const horizontalScrollRafRef = useRef<number | null>(null);
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
  const devTimelineSecondsView = useMemo(() => {
    return buildDevTimelineSecondsView(tl, devTimelineSecondsRevision);
  }, [devTimelineSecondsRevision, tl]);
  const showDevTimeColumn = devTimelineSecondsView !== null;
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
  const addersgallOnlyJobs = useStore((s) => s.addersgallOnlyJobs);
  const evolveJobs = useStore((s) => s.evolveJobs);
  const toggleJobExpand = useStore((s) => s.toggleJobExpand);
  const toggleJobCardOnly = useStore((s) => s.toggleJobCardOnly);
  const toggleJobAddersgallOnly = useStore((s) => s.toggleJobAddersgallOnly);
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

  const invalidPlacementKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const issue of validationIssues) {
      if (issue.location) {
        keys.add(validationLocationKey(issue.location));
      }
    }

    return keys;
  }, [validationIssues]);

  const cols: Col[] = useMemo(() => {
    const out: Col[] = [];
    for (const jobId of visibleTeam) {
      const jobName = JOBS.find((j) => j.id === jobId)?.name ?? jobId;
      const skillIds = resolveDisplayedSkillIds(jobId, {
        expandedJobs,
        cardOnlyJobs,
        addersgallOnlyJobs,
        evolveJobs,
      });
      for (const sid of skillIds) {
        const sk = SKILL_MAP[sid];
        if (sk) out.push({ jobId, jobName, skill: sk });
      }
    }
    return out;
  }, [visibleTeam, expandedJobs, cardOnlyJobs, addersgallOnlyJobs, evolveJobs]);

  const needsSgeAddersgallSimulation = useMemo(
    () =>
      cols.some(
        (col) =>
          col.jobId === "healer.sge" && isSgeAddersgallRelatedSkill(col.skill.id)
      ),
    [cols]
  );

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
    addersgallOnlyJobs,
    activeMemoWidthPx,
    jobFilter,
    cols.length,
  ]);

  const freezeOffsets = useMemo(() => {
    const beforeTime = hasMechanisms ? [MECHANISM_COL_CSS_VAR] : [];
    const beforeDev = [...beforeTime, TIME_COL_CSS_VAR];
    const beforeEvent = showDevTimeColumn
      ? [...beforeDev, DEV_TIME_COL_CSS_VAR]
      : beforeDev;

    const sumCols = (cols: string[]) => {
      if (cols.length === 0) {
        return "0px";
      }
      if (cols.length === 1) {
        return cols[0];
      }
      return `calc(${cols.join(" + ")})`;
    };

    return {
      mechanism: "0px",
      time: sumCols(beforeTime),
      devTime: sumCols(beforeDev),
      event: sumCols(beforeEvent),
      memo: sumCols([...beforeEvent, EVENT_COL_CSS_VAR]),
      elem: sumCols([...beforeEvent, EVENT_COL_CSS_VAR, MEMO_COL_CSS_VAR]),
      damage: sumCols([
        ...beforeEvent,
        EVENT_COL_CSS_VAR,
        MEMO_COL_CSS_VAR,
        ELEMENT_COL_CSS_VAR,
      ]),
    };
  }, [hasMechanisms, showDevTimeColumn]);

  const freezeStyles = useMemo(
    () => ({
      mechanism: freezeStyle(freezeOffsets.mechanism),
      time: freezeStyle(freezeOffsets.time),
      devTime: freezeStyle(freezeOffsets.devTime),
      event: freezeStyle(freezeOffsets.event),
      memo: freezeStyle(freezeOffsets.memo),
      elem: freezeStyle(freezeOffsets.elem),
      damage: freezeStyle(freezeOffsets.damage),
    }),
    [freezeOffsets]
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

  const formatRowTimeLabel = useCallback(
    (row: (typeof rows)[number]) => formatTimelineSec(row.sec, timeDisplayMode),
    [timeDisplayMode]
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

  const devRowTimeLabels = useMemo(() => {
    if (!devTimelineSecondsView) {
      return null;
    }

    const { offset, anchorTSec } = devTimelineSecondsView;
    const labels: string[] = [];
    labels.length = displayRows.length;

    for (let index = 0; index < displayRows.length; index++) {
      const row = displayRows[index];
      if (row.sec >= anchorTSec) {
        labels[index] = formatTimelineSec(row.sec + offset, timeDisplayMode);
      }
    }

    return labels;
  }, [devTimelineSecondsView, displayRows, timeDisplayMode]);

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
  const [virtualScrollLeft, setVirtualScrollLeft] = useState(0);
  const [wrapperViewportHeight, setWrapperViewportHeight] = useState(0);
  const [wrapperViewportWidth, setWrapperViewportWidth] = useState(0);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const syncViewport = () => {
      setVirtualScrollTop(wrapper.scrollTop);
      setWrapperViewportHeight(wrapper.clientHeight);
      setWrapperViewportWidth(wrapper.clientWidth);

      if (horizontalScrollRafRef.current === null) {
        horizontalScrollRafRef.current = window.requestAnimationFrame(() => {
          horizontalScrollRafRef.current = null;
          setVirtualScrollLeft(wrapper.scrollLeft);
        });
      }
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
      if (horizontalScrollRafRef.current !== null) {
        window.cancelAnimationFrame(horizontalScrollRafRef.current);
        horizontalScrollRafRef.current = null;
      }
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

  const skillColumnWidths = useMemo(
    () =>
      buildSkillColumnWidths(cols, (skill) =>
        isChargeSkill(skill as SkillData) ||
        (typeof skill.maxStacks === "number" && skill.maxStacks > 0)
      ),
    [cols]
  );

  const horizontalVirtualRange = useMemo(
    () =>
      computeHorizontalVirtualRange(
        skillColumnWidths,
        virtualScrollLeft,
        wrapperViewportWidth
      ),
    [skillColumnWidths, virtualScrollLeft, wrapperViewportWidth]
  );

  const visibleSkillColumnIndices = useMemo(() => {
    const indices: number[] = [];
    for (
      let index = horizontalVirtualRange.start;
      index <= horizontalVirtualRange.end;
      index++
    ) {
      indices.push(index);
    }
    return indices;
  }, [
    horizontalVirtualRange.end,
    horizontalVirtualRange.start,
  ]);

  const visibleJobHeaderGroups = useMemo(
    () =>
      horizontalVirtualRange.enabled
        ? groupVisibleJobHeaders(
            cols,
            horizontalVirtualRange.start,
            horizontalVirtualRange.end
          )
        : Array.from(jobColspan.entries()).map(([jobId, count]) => ({
            jobId,
            count,
            startIndex: cols.findIndex((col) => col.jobId === jobId),
          })),
    [cols, horizontalVirtualRange, jobColspan]
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
    (hasMechanisms ? 1 : 0) +
    (showDevTimeColumn ? 1 : 0) +
    5 +
    visibleSkillColumnIndices.length +
    (horizontalVirtualRange.paddingLeft > 0 ? 1 : 0) +
    (horizontalVirtualRange.paddingRight > 0 ? 1 : 0);

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
    if (!needsSgeAddersgallSimulation) {
      return map;
    }

    for (const jobId of visibleTeam) {
      if (jobId !== "healer.sge") {
        continue;
      }

      map.set(jobId, simulateSgeAddersgall(jobId, usages));
    }

    return map;
  }, [needsSgeAddersgallSimulation, usages, visibleTeam]);

  const sgeAddersgallStateByRowByJob = useMemo(() => {
    const map = new Map<JobId, readonly { available: number; nextGainSec: number | null }[]>();
    for (const [jobId, simulation] of sgeAddersgallSimulationByJob) {
      map.set(jobId, buildSgeAddersgallStatesForRows(simulation, rows));
    }
    return map;
  }, [rows, sgeAddersgallSimulationByJob]);

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

  const gridVisualContext = useMemo(
    (): GridVisualContext => ({
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
    }),
    [
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
    ]
  );

  const gridVisual = useMemo(
    () => buildGridVisualWithCache(cols, gridVisualContext, gridVisualCacheRef.current),
    [cols, gridVisualContext]
  );

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
                    style={freezeStyles.mechanism}>
                    {t("timeline.headers.mechanism")}
                  </th>
                )}
                <th
                  className={`p-2 text-left mp-col-time mp-col-freeze ${
                    hasMechanisms ? "mp-col-freeze--middle" : "mp-col-freeze--first"
                  }`}
                  rowSpan={2}
                  style={freezeStyles.time}>
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
                {showDevTimeColumn && (
                  <th
                    className="p-2 text-left mp-col-dev-time mp-col-freeze mp-col-freeze--middle"
                    rowSpan={2}
                    style={freezeStyles.devTime}
                    title="dev 専用: 参考用の連番秒数"
                  >
                    参考秒
                  </th>
                )}
                <th
                  className="p-2 text-left mp-col-event mp-col-freeze mp-col-freeze--middle"
                  rowSpan={2}
                  style={freezeStyles.event}>
                  {t("timeline.headers.event")}
                </th>
                <MemoColumnHeader
                  label={t("timeline.headers.memo")}
                  widthPx={activeMemoWidthPx}
                  onPreviewWidth={setMemoWidthOverridePx}
                  onWidthCommit={setMemoColumnWidth}
                />
                <th
                  className="p-2 text-center mp-col-element"
                  rowSpan={2}
                >
                 {t("timeline.headers.element")}
                </th>
                <th
                  className="p-2 text-right mp-col-damage mp-col-freeze mp-col-freeze--last"
                  rowSpan={2}
                  style={freezeStyles.damage}>
                  {t("timeline.headers.damage")}
                </th>
                <HorizontalVirtualSpacer
                  cellTag="th"
                  width={horizontalVirtualRange.paddingLeft}
                />
                {visibleJobHeaderGroups.map(({ jobId, count, startIndex }) => {
                  const span = count;
                  const job = JOBS.find((j) => j.id === jobId);
                  const name = job?.name ?? jobId;
                  const icon = getJobIcon(jobId);
                  const visibleWidthPx = skillColumnWidths
                    .slice(startIndex, startIndex + count)
                    .reduce((sum, width) => sum + width, 0);
                  const jobWidth = horizontalVirtualRange.enabled
                    ? `${visibleWidthPx}px`
                    : jobHeaderWidth.get(jobId) ?? `calc(${span} * ${SKILL_COL_CSS_VAR})`;

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
                  const isAddersgallVisible =
                    !isEvolve && addersgallOnlyJobs.includes(jobId);
                  const canToggleCardOnly = jobId === "healer.ast" && !isEvolve;
                  const canToggleAddersgallOnly = jobId === "healer.sge" && !isEvolve;
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
                        {canToggleAddersgallOnly && (
                          <button
                            className={`mp-job-extra-btn ${
                              isAddersgallVisible ? "mp-job-extra-btn--active" : ""
                            }`}
                            onClick={() => toggleJobAddersgallOnly(jobId)}
                            title={
                              isAddersgallVisible
                                ? "アダーガル表示を解除"
                                : "アダーガルを表示"
                            }
                            aria-pressed={isAddersgallVisible}
                          >
                            ガル
                          </button>
                        )}
                      </div>
                      {dropIndicator?.jobId === jobId && dropIndicator.position === "after" && (
                        <span className="team-drop-indicator -right-1" />
                      )}
                    </th>
                  );
                })}
                <HorizontalVirtualSpacer
                  cellTag="th"
                  width={horizontalVirtualRange.paddingRight}
                />
              </tr>

              <tr>
                <HorizontalVirtualSpacer
                  cellTag="th"
                  width={horizontalVirtualRange.paddingLeft}
                />
                {visibleSkillColumnIndices.map((ci) => {
                  const c = cols[ci];
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
                <HorizontalVirtualSpacer
                  cellTag="th"
                  width={horizontalVirtualRange.paddingRight}
                />
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
                        style={freezeStyles.mechanism}>
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
                      style={freezeStyles.time}>
                      {row.line.showTime ? (
                        onTimeClick ? (
                          <button
                            type="button"
                            onClick={() => onTimeClick(row.sec)}
                            className="flex w-full items-center gap-1 text-left hover:text-sky-400"
                            title="同期ポイントを設定"
                          >
                            <span className="mp-time-cell-label">{formatRowTimeLabel(row)}</span>
                            {syncSecondsSet.has(row.sec) && (
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-sky-400"
                                aria-label="sync point"
                              />
                            )}
                          </button>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="mp-time-cell-label">{formatRowTimeLabel(row)}</span>
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
                    {showDevTimeColumn && (
                      <td
                        className="p-1 font-mono text-left whitespace-nowrap mp-col-dev-time mp-col-freeze mp-col-freeze--middle"
                        style={freezeStyles.devTime}
                      >
                        {devRowTimeLabels?.[displayIndex] ? (
                          <span className="mp-dev-time-cell-label">
                            {devRowTimeLabels[displayIndex]}
                          </span>
                        ) : null}
                      </td>
                    )}
                    <td
                      className="p-1 mp-col-event mp-col-freeze mp-col-freeze--middle"
                      style={freezeStyles.event}
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
                      className="p-1 mp-col-memo"
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
                      className="p-1 text-center mp-col-element"
                    >
                      {renderElementBadge(moment)}
                    </td>
                    <td
                      className="p-1 text-right mp-col-damage mp-col-freeze mp-col-freeze--last"
                      style={freezeStyles.damage}>
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


                    <HorizontalVirtualSpacer
                      cellTag="td"
                      width={horizontalVirtualRange.paddingLeft}
                    />
                    {visibleSkillColumnIndices.map((ci) => {
                      const c = cols[ci];
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
                    <HorizontalVirtualSpacer
                      cellTag="td"
                      width={horizontalVirtualRange.paddingRight}
                    />
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
