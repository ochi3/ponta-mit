/** 1行あたりの推定高さ（px）。実測値で上書き可能 */
export const TIMELINE_ROW_HEIGHT_PX = 34;

/** ビューポート外に余分に描画する行数（上下それぞれ） */
export const TIMELINE_VIRTUAL_OVERSCAN = 30;

/** これ未満の列数では横仮想化しない */
export const TIMELINE_HORIZONTAL_VIRTUAL_MIN_COLS = 24;

/** 横方向に余分に描画する列数（左右それぞれ） */
export const TIMELINE_HORIZONTAL_OVERSCAN = 5;

/** 通常スキル列幅（px）。CSS --mp-skill-col-w: 2.5rem 相当 */
export const TIMELINE_SKILL_COL_WIDTH_PX = 40;

/** スタック列幅（px）。CSS --mp-skill-col-stack-w: 2.8rem 相当 */
export const TIMELINE_SKILL_COL_STACK_WIDTH_PX = 45;

export type TimelineHorizontalVirtualRange = {
  enabled: boolean;
  start: number;
  end: number;
  paddingLeft: number;
  paddingRight: number;
};

export function isStackSkillColumn(skill: {
  maxStacks?: number;
}): boolean {
  return typeof skill.maxStacks === "number" && skill.maxStacks > 0;
}

export function getSkillColumnWidthPx(
  skill: { maxStacks?: number },
  isStack = isStackSkillColumn(skill)
): number {
  return isStack
    ? TIMELINE_SKILL_COL_STACK_WIDTH_PX
    : TIMELINE_SKILL_COL_WIDTH_PX;
}

export function buildSkillColumnWidths(
  cols: readonly { skill: { maxStacks?: number } }[],
  isStackColumn?: (skill: { maxStacks?: number }) => boolean
): number[] {
  const resolveStack = isStackColumn ?? isStackSkillColumn;
  return cols.map((col) => getSkillColumnWidthPx(col.skill, resolveStack(col.skill)));
}

export function computeHorizontalVirtualRange(
  columnWidths: readonly number[],
  scrollLeft: number,
  viewportWidth: number,
  overscan = TIMELINE_HORIZONTAL_OVERSCAN,
  minCols = TIMELINE_HORIZONTAL_VIRTUAL_MIN_COLS
): TimelineHorizontalVirtualRange {
  const columnCount = columnWidths.length;
  if (columnCount < minCols || viewportWidth <= 0) {
    return {
      enabled: false,
      start: 0,
      end: Math.max(0, columnCount - 1),
      paddingLeft: 0,
      paddingRight: 0,
    };
  }

  let paddingLeft = 0;
  let start = 0;
  for (let index = 0; index < columnCount; index++) {
    const width = columnWidths[index];
    if (paddingLeft + width > scrollLeft) {
      start = index;
      break;
    }
    paddingLeft += width;
    if (index === columnCount - 1) {
      start = columnCount - 1;
    }
  }

  const visibleRight = scrollLeft + viewportWidth;
  let end = start;
  let acc = columnWidths.slice(0, start).reduce((sum, width) => sum + width, 0);
  for (let index = start; index < columnCount; index++) {
    acc += columnWidths[index];
    end = index;
    if (acc >= visibleRight) {
      break;
    }
  }

  start = Math.max(0, start - overscan);
  end = Math.min(columnCount - 1, end + overscan);

  paddingLeft = columnWidths.slice(0, start).reduce((sum, width) => sum + width, 0);
  const paddingRight = columnWidths
    .slice(end + 1)
    .reduce((sum, width) => sum + width, 0);

  return {
    enabled: true,
    start,
    end,
    paddingLeft,
    paddingRight,
  };
}

export type VisibleJobHeaderGroup = {
  jobId: string;
  count: number;
  startIndex: number;
};

export function groupVisibleJobHeaders(
  cols: readonly { jobId: string }[],
  start: number,
  end: number
): VisibleJobHeaderGroup[] {
  const groups: VisibleJobHeaderGroup[] = [];
  for (let index = start; index <= end; index++) {
    const col = cols[index];
    const last = groups[groups.length - 1];
    if (last && last.jobId === col.jobId) {
      last.count += 1;
      continue;
    }
    groups.push({ jobId: col.jobId, count: 1, startIndex: index });
  }
  return groups;
}


/** これ未満の行数では仮想化しない（短いタイムラインは従来どおり全行描画） */
export const TIMELINE_VIRTUAL_MIN_ROWS = 120;

export type TimelineVirtualRange = {
  enabled: boolean;
  start: number;
  end: number;
  paddingTop: number;
  paddingBottom: number;
};

export function computeTimelineVirtualRange(
  rowCount: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = TIMELINE_ROW_HEIGHT_PX,
  overscan = TIMELINE_VIRTUAL_OVERSCAN
): TimelineVirtualRange {
  if (rowCount < TIMELINE_VIRTUAL_MIN_ROWS || viewportHeight <= 0) {
    return {
      enabled: false,
      start: 0,
      end: Math.max(0, rowCount - 1),
      paddingTop: 0,
      paddingBottom: 0,
    };
  }

  const firstVisible = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(
    rowCount - 1,
    firstVisible + visibleCount + overscan
  );

  return {
    enabled: true,
    start,
    end,
    paddingTop: start * rowHeight,
    paddingBottom: Math.max(0, (rowCount - end - 1) * rowHeight),
  };
}

export function findDisplayIndexForTimelineSec(
  displayRows: readonly { sec: number }[],
  timelineSec: number
): number {
  return displayRows.findIndex((row) => row.sec === timelineSec);
}

export function scrollWrapperToDisplayIndex(
  wrapper: HTMLElement,
  displayIndex: number,
  rowHeight = TIMELINE_ROW_HEIGHT_PX
) {
  const thead = wrapper.querySelector<HTMLElement>("thead.mp-header-sticky");
  const headerHeight = thead ? Math.ceil(thead.getBoundingClientRect().height) : 48;
  const gap = 4;
  const targetTop = displayIndex * rowHeight - headerHeight - gap;
  wrapper.scrollTop = Math.max(0, targetTop);
}

export function isDisplayIndexInComfortZone(
  displayIndex: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight = TIMELINE_ROW_HEIGHT_PX,
  topRatio = 0.25,
  bottomRatio = 0.75
) {
  const rowTop = displayIndex * rowHeight;
  const rowBottom = rowTop + rowHeight;
  const comfortTop = scrollTop + viewportHeight * topRatio;
  const comfortBottom = scrollTop + viewportHeight * bottomRatio;
  return rowTop >= comfortTop && rowBottom <= comfortBottom;
}

export type MechanismRunRange = {
  start: number;
  end: number;
  label: string;
  span: number;
};

export function buildMechanismRunRanges(
  mechanismRuns: ReadonlyMap<number, { label: string; span: number }>
): MechanismRunRange[] {
  return Array.from(mechanismRuns.entries())
    .map(([start, cell]) => ({
      start,
      end: start + cell.span - 1,
      label: cell.label,
      span: cell.span,
    }))
    .sort((a, b) => a.start - b.start);
}

/** 仮想スクロール時: 表示範囲内でギミック列を描画すべき行と rowSpan を返す */
export function resolveVirtualMechanismCell(
  displayIndex: number,
  visibleStart: number,
  visibleEnd: number,
  mechanismRuns: ReadonlyMap<number, { label: string; span: number }>,
  runRanges: readonly MechanismRunRange[]
): { label: string; rowSpan: number } | null {
  const direct = mechanismRuns.get(displayIndex);
  if (direct) {
    return {
      label: direct.label,
      rowSpan: Math.min(direct.span, visibleEnd - displayIndex + 1),
    };
  }

  for (const run of runRanges) {
    if (displayIndex < run.start || displayIndex > run.end) {
      continue;
    }

    const firstVisibleInRun = Math.max(run.start, visibleStart);
    if (displayIndex !== firstVisibleInRun) {
      return null;
    }

    return {
      label: run.label,
      rowSpan: Math.min(run.end - displayIndex + 1, visibleEnd - displayIndex + 1),
    };
  }

  return null;
}
