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

