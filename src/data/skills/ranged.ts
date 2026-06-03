import type { SkillData } from "../../types";
import { SKILL_ICON } from "./icon.skills";

export const SKILLS_RANGED_BRD = [
  {
    id: "ranged.brd.troubadour",
    name: "トルバドゥール",
    fflogsAliases: ["Troubadour"],
    cooldown_s: 90,
    duration_s: 15,
    scope: "range_party",
    phys_pct: 0.85,
    magic_pct: 0.85,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["ranged.brd.troubadour"],
  },
] as const satisfies readonly SkillData[];

export const SKILLS_RANGED_MCH = [
  {
    id: "ranged.mch.tactician",
    name: "タクティシャン",
    fflogsAliases: ["Tactician"],
    cooldown_s: 90,
    duration_s: 15,
    scope: "range_party",
    phys_pct: 0.85,
    magic_pct: 0.85,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["ranged.mch.tactician"],
  },
  {
    id: "ranged.mch.dismantle",
    name: "ディスマントル",
    fflogsAliases: ["Dismantle"],
    cooldown_s: 90,
    duration_s: 10,
    scope: "single_target",
    phys_pct: 0.9,
    magic_pct: 0.9,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["ranged.mch.dismantle"],
  },
] as const satisfies readonly SkillData[];

export const SKILLS_RANGED_DNC = [
  {
    id: "ranged.dnc.shield_samba",
    name: "シールドサンバ",
    fflogsAliases: ["Shield Samba", "守りのサンバ"],
    cooldown_s: 90,
    duration_s: 15,
    scope: "range_party",
    phys_pct: 0.85,
    magic_pct: 0.85,
    unique_pct: 1,
    kinds: ["mitigation"],
    icon: SKILL_ICON["ranged.dnc.shield_samba"],
  },
  {
    id: "ranged.dnc.improvisation",
    name: "インプロビゼーション",
    fflogsAliases: ["Improvisation"],
    cooldown_s: 120,
    duration_s: 15,
    scope: "range_party",
    kinds: ["heal"],
    icon: SKILL_ICON["ranged.dnc.improvisation"],
  },
  {
    id: "ranged.dnc.improvised_finish",
    name: "インプロビゼーション・フィニッシュ",
    fflogsAliases: ["Improvised Finish"],
    cooldown_s: 1,
    duration_s: 30,
    shield_pct_target: 0.1,
    scope: "range_party",
    kinds: ["shield"],
    maxStacks: 4,
    icon: SKILL_ICON["ranged.dnc.improvised_finish"],
    parentSkillId: "ranged.dnc.improvisation",
  },
] as const satisfies readonly SkillData[];

export const IMPROV_SHIELD_PCT_BY_STACK: number[] = [
  0.05,
  0.06,
  0.07,
  0.08,
  0.10,
];
