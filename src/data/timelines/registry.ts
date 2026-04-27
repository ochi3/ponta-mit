import type { Timeline } from "../../types";
import { FRU } from "./fru";
import { M12S_P1 } from "./m12s-p1";
import { M12S_P2 } from "./m12s-p2";

export const BUILTIN_TIMELINES: Record<string, Timeline> = {
  fru: FRU,
  "m12s-p1": M12S_P1,
  "m12s-p2": M12S_P2,
};

export const DEFAULT_TIMELINE_ID = "fru";

export function getBuiltinTimeline(id: string): Timeline | undefined {
  return BUILTIN_TIMELINES[id];
}
