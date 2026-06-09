/** 1行あたりの推定高さ（px）。実測値で上書き可能 */
export const TIMELINE_ROW_HEIGHT_PX = 34;

/** ビューポート外に余分に描画する行数（上下それぞれ） */
export const TIMELINE_VIRTUAL_OVERSCAN = 30;

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
