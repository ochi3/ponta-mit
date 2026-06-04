import type { SkillData } from "../../types";
import { SKILL_ICON } from "./icon.skills";

/** LB段階別の効果時間（秒）。インデックス=スタック数 */
export const TANK_LB_DURATION_S_BY_STACK: readonly number[] = [0, 10, 15, 8];

/** LB段階別の軽減率（0.2 = 20%軽減）。インデックス=スタック数 */
export const TANK_LB_MITIGATION_PCT_BY_STACK: readonly number[] = [0, 0.2, 0.4, 0.8];

export const SKILLS_UTILITY_UNKNOWN_SECONDARY = [
  {
    id: "utility.unknown.potion_2",
    name: "薬2",
    fflogsAliases: ["Potion 2", "ポーション2"],
    cooldown_s: 300,
    duration_s: 30,
    scope: "self",
    kinds: ["utility"],
    icon: SKILL_ICON["utility.unknown.potion_2"],
  },
] as const satisfies readonly SkillData[];

export const SKILLS_UTILITY_UNKNOWN = [
  {
    id: "utility.unknown.burst",
    name: "バースト",
    fflogsAliases: ["Burst"],
    cooldown_s: 120,
    duration_s: 20,
    scope: "self",
    kinds: ["utility"],
    icon: SKILL_ICON["utility.unknown.burst"],
  },
  {
    id: "utility.unknown.potion",
    name: "薬",
    fflogsAliases: ["Potion", "ポーション"],
    cooldown_s: 300,
    duration_s: 30,
    scope: "self",
    kinds: ["utility"],
    icon: SKILL_ICON["utility.unknown.potion"],
  },
  {
    id: "utility.unknown.lb",
    name: "リミットブレイク",
    fflogsAliases: ["Limit Break", "リミットブレイク"],
    cooldown_s: 0,
    duration_s: 15,
    scope: "range_party",
    kinds: ["mitigation"],
    phys_pct: 0.8,
    magic_pct: 0.8,
    maxStacks: 3,
    stackDisplayLabels: ["", "LB1", "LB2", "LB3"],
    icon: SKILL_ICON["utility.unknown.lb"],
  },
] as const satisfies readonly SkillData[];
