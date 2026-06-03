import type { SkillData } from "../../types";
import { SKILL_ICON } from "./icon.skills";

export const SKILLS_MELEE = [
  {
    id: "melee.feint",
    name: "牽制",
    fflogsAliases: ["Feint"],
    cooldown_s: 90,
    duration_s: 15,
    scope: "single_target",
    phys_pct: 0.9,
    magic_pct: 0.95,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["melee.feint"],
  },
] as const satisfies readonly SkillData[];

export const SKILLS_MELEE_MNK = [
  {
    id: "melee.mnk.mantra",
    name: "マントラ",
    fflogsAliases: ["Mantra"],
    cooldown_s: 90,
    duration_s: 15,
    scope: "range_party",
    phys_pct: 0.9,
    magic_pct: 0.9,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["melee.mnk.mantra"],
  },
] as const satisfies readonly SkillData[];
