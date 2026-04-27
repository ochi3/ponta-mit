import type { SkillData } from "../../types";
import { SKILL_ICON } from "./icon.skills";

export const SKILLS_MELEE = [
  {
    id: "melee.feint",
    name: "牽制",
    cooldown_s: 90,
    duration_s: 15,
    scope: "single_target",
    phys_pct: 0.9,
    magic_pct: 0.95,
    unique_pct: 1.0,
    kinds: ["mitigation"],
    icon: SKILL_ICON["melee.feint"],
  },
] as const satisfies readonly SkillData[];