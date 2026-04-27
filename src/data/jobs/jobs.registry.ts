import type { Job } from "../../types";

const JOB_ENTRIES = [
  // Tanks
  { id: "tank.pld", name: "ナイト", role: "tank" },
  { id: "tank.war", name: "戦士", role: "tank" },
  { id: "tank.drk", name: "暗黒騎士", role: "tank" },
  { id: "tank.gnb", name: "ガンブレイカー", role: "tank" },

  // Healers
  { id: "healer.whm", name: "白魔道士", role: "healer" },
  { id: "healer.sch", name: "学者", role: "healer" },
  { id: "healer.ast", name: "占星術師", role: "healer" },
  { id: "healer.sge", name: "賢者", role: "healer" },

  // Melee DPS
  { id: "melee.mnk", name: "モンク", role: "melee" },
  { id: "melee.drg", name: "竜騎士", role: "melee" },
  { id: "melee.nin", name: "忍者", role: "melee" },
  { id: "melee.sam", name: "侍", role: "melee" },
  { id: "melee.rpr", name: "リーパー", role: "melee" },
  { id: "melee.vpr", name: "ヴァイパー", role: "melee" },

  // Physical Ranged DPS
  { id: "ranged.brd", name: "吟遊詩人", role: "ranged" },
  { id: "ranged.mch", name: "機工士", role: "ranged" },
  { id: "ranged.dnc", name: "踊り子", role: "ranged" },

  // Magical Ranged DPS
  { id: "caster.blm", name: "黒魔道士", role: "caster" },
  { id: "caster.smn", name: "召喚士", role: "caster" },
  { id: "caster.rdm", name: "赤魔道士", role: "caster" },
  { id: "caster.pct", name: "ピクトマンサー", role: "caster" },
] as const;

export const JOBS: readonly Job[] = JOB_ENTRIES;