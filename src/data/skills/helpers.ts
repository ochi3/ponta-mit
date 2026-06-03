import type { SkillData } from "../../types";

export function defineSkills<const T extends readonly SkillData[]>(skills: T) {
  return skills;
}

export function mitigationMultiplier(percent: number) {
  return Number(Math.max(0, 1 - percent / 100).toFixed(4));
}

export function shieldRatio(percent: number) {
  return Number((percent / 100).toFixed(4));
}

export function mitigationPct(args: {
  physical?: number;
  magic?: number;
  unique?: number;
}) {
  return {
    ...(args.physical !== undefined ? { phys_pct: mitigationMultiplier(args.physical) } : {}),
    ...(args.magic !== undefined ? { magic_pct: mitigationMultiplier(args.magic) } : {}),
    ...(args.unique !== undefined ? { unique_pct: mitigationMultiplier(args.unique) } : {}),
  };
}

export function shieldPct(args: {
  self?: number;
  target?: number;
}) {
  return {
    ...(args.self !== undefined ? { shield_pct_self: shieldRatio(args.self) } : {}),
    ...(args.target !== undefined ? { shield_pct_target: shieldRatio(args.target) } : {}),
  };
}
