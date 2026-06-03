import type { JobId, SkillData, SkillId } from "../../types";

export type EvolveSkillPerformanceOverrides = Partial<
  Omit<
    SkillData,
    "id" | "name" | "icon" | "fflogsAliases" | "evolveBaseSkillId"
  >
>;

export type EvolveSkillSpec = {
  baseSkillId: SkillId;
  overrides?: EvolveSkillPerformanceOverrides;
};

function evolve(
  baseSkillId: SkillId,
  overrides?: EvolveSkillPerformanceOverrides
): EvolveSkillSpec {
  return overrides ? { baseSkillId, overrides } : { baseSkillId };
}

const TANK_EVOLVE_SKILLS = [
  evolve("tank.reprisal"),
  evolve("tank.rampart"),
  evolve("tank.drk.dark_mind"),
] as const satisfies readonly EvolveSkillSpec[];

const MELEE_EVOLVE_SKILLS = [
  evolve("melee.feint"),
  evolve("caster.addle"),
  evolve("ranged.mch.dismantle"),
] as const satisfies readonly EvolveSkillSpec[];

const CASTER_EVOLVE_SKILLS = [
  evolve("caster.addle"),
  evolve("caster.rdm.magick_barrier"),
  evolve("caster.pct.tempera_grassa"),
] as const satisfies readonly EvolveSkillSpec[];

export const EVOLVE_SKILL_SPECS_BY_JOB: Record<
  JobId,
  readonly EvolveSkillSpec[]
> = {
  "tank.war": [
    evolve("tank.war.shake"),
    evolve("tank.war.damnation"),
    evolve("tank.war.bloodwhetting"),
  ],
  "tank.pld": [
    evolve("tank.pld.divine_veil"),
    evolve("tank.pld.passage_of_arms"),
    evolve("tank.pld.holy_sheltron"),
  ],
  "tank.drk": [
    evolve("tank.drk.dark_missionary", {
      cooldown_s: 10,
      duration_s: 12,
      magic_pct: 0.85,
    }),
    evolve("tank.drk.dark_mind"),
    evolve("tank.drk.blackest_night"),
  ],
  "tank.gnb": [
    evolve("tank.gnb.heart_of_light"),
    evolve("tank.gnb.great_nebula"),
    evolve("tank.gnb.heart_of_corundum"),
  ],

  "healer.whm": [
    evolve("healer.whm.temperance"),
    evolve("healer.whm.asylum"),
    evolve("healer.whm.divine_benison"),
  ],
  "healer.sch": [
    evolve("healer.sch.sacred_soil"),
    evolve("healer.sch.fey_illumination"),
    evolve("healer.sch.expedient"),
  ],
  "healer.ast": [
    evolve("healer.ast.neutral_sect"),
    evolve("healer.ast.collective_unconscious"),
    evolve("healer.ast.exaltation"),
  ],
  "healer.sge": [
    evolve("healer.sge.kerachole"),
    evolve("healer.sge.holos"),
    evolve("healer.sge.panhaima"),
  ],

  "melee.drg": MELEE_EVOLVE_SKILLS,
  "melee.mnk": [
    evolve("melee.mnk.mantra"),
    evolve("melee.feint"),
    evolve("caster.addle"),
  ],
  "melee.nin": MELEE_EVOLVE_SKILLS,
  "melee.rpr": MELEE_EVOLVE_SKILLS,
  "melee.sam": MELEE_EVOLVE_SKILLS,
  "melee.vpr": MELEE_EVOLVE_SKILLS,

  "ranged.brd": [
    evolve("ranged.brd.troubadour"),
    evolve("ranged.mch.dismantle"),
    evolve("ranged.dnc.improvisation"),
  ],
  "ranged.dnc": [
    evolve("ranged.dnc.shield_samba"),
    evolve("ranged.dnc.improvisation"),
    evolve("ranged.dnc.improvised_finish"),
  ],
  "ranged.mch": [
    evolve("ranged.mch.tactician"),
    evolve("ranged.mch.dismantle"),
    evolve("ranged.dnc.improvised_finish"),
  ],

  "caster.blm": CASTER_EVOLVE_SKILLS,
  "caster.pct": [
    evolve("caster.pct.tempera_grassa"),
    evolve("caster.addle"),
    evolve("caster.rdm.magick_barrier"),
  ],
  "caster.rdm": [
    evolve("caster.rdm.magick_barrier"),
    evolve("caster.addle"),
    evolve("caster.pct.tempera_grassa"),
  ],
  "caster.smn": CASTER_EVOLVE_SKILLS,
};

export const FALLBACK_EVOLVE_SKILL_SPECS_BY_ROLE: Record<
  string,
  readonly EvolveSkillSpec[]
> = {
  tank: TANK_EVOLVE_SKILLS,
  healer: [
    evolve("healer.whm.temperance"),
    evolve("healer.sch.sacred_soil"),
    evolve("healer.sge.kerachole"),
  ],
  melee: MELEE_EVOLVE_SKILLS,
  ranged: [
    evolve("ranged.brd.troubadour"),
    evolve("ranged.mch.dismantle"),
    evolve("ranged.dnc.improvisation"),
  ],
  caster: CASTER_EVOLVE_SKILLS,
};

