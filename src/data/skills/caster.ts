import type { SkillData } from "../../types";
import { SKILL_ICON } from "./icon.skills";

export const SKILLS_CASTER = [
  {
    id: "caster.addle",
    name: "アドル",
    cooldown_s: 90,
    duration_s: 15,
    scope: "single_target",
    phys_pct: 0.95,
    magic_pct: 0.9,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["caster.addle"],
  },
] as const satisfies readonly SkillData[];

export const SKILLS_CASTER_RDM = [
  {
    id: "caster.rdm.magick_barrier",
    name: "マジチE��バリア",
    cooldown_s: 120,
    duration_s: 10,
    scope: "range_party",
    kinds: ["mitigation"],
    phys_pct: 1.0,
    magic_pct: 0.9,
    unique_pct: 1,
    icon: SKILL_ICON["caster.rdm.magick_barrier"],
  },
] as const satisfies readonly SkillData[];

export const SKILLS_CASTER_PCT = [
  {
    id: "caster.pct.tempera_grassa",
    name: "チE��ペラ・グラチE��",
    cooldown_s: 90,
    duration_s: 10,
    scope: "range_party",
    kinds: ["shield"],
    icon: SKILL_ICON["caster.pct.tempera_grassa"],
  },
] as const satisfies readonly SkillData[];
