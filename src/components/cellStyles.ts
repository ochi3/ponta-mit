// Shared cell style utilities

export type CellColor = "none" | "green" | "blue" | "red" | "conflict";
export type CellShape = "none" | "alone" | "start" | "middle" | "end";

export interface CellVisualState {
  color: CellColor;
  checked: boolean;
  shape: CellShape;
  chargeCount?: number;
  chargeCapacity?: number;
  bloodCount?: number;
}

// Color -> CSS class mapping
const COLOR_CLASS: Record<CellColor, string> = {
  green: "cell-color-green",
  blue: "cell-color-blue",
  red: "cell-color-red",
  conflict: "cell-color-conflict",
  none: "cell-color-none",
};
export const getColorClass = (color: CellColor) => COLOR_CLASS[color];

// Shape -> CSS class mapping
const SHAPE_CLASS: Record<CellShape, string> = {
  alone: "cell-shape-alone",
  start: "cell-shape-start",
  middle: "cell-shape-middle",
  end: "cell-shape-end",
  none: "cell-shape-none",
};
export const getShapeClass = (shape: CellShape) => SHAPE_CLASS[shape];

/** 連続する同色セルを start / middle / end にまとめる */
export function applyBarShapes(columnVisual: CellVisualState[]) {
  let runStart = -1;

  for (let r = 0; r <= columnVisual.length; r++) {
    const isActive = r < columnVisual.length && columnVisual[r].color !== "none";

    if (isActive) {
      if (runStart === -1) {
        runStart = r;
      }
      continue;
    }

    if (runStart === -1) {
      continue;
    }

    const runEnd = r - 1;
    if (runStart === runEnd) {
      columnVisual[runStart].shape = "alone";
    } else {
      columnVisual[runStart].shape = "start";
      columnVisual[runEnd].shape = "end";
      for (let k = runStart + 1; k <= runEnd - 1; k++) {
        columnVisual[k].shape = "middle";
      }
    }
    runStart = -1;
  }
}

