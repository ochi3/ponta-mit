export type ElementType = "physical" | "magic" | "unique" | "none";
export type MomentKind = "hit" | "event" | "mechanic";

export interface Moment {
  t_sec: number;
  phase_t_sec?: number;
  order?: number;
  /** Same-second alternatives share `alt_group` and render as "(or)". */
  alt_group?: string;
  name: string;
  elem: ElementType;

  damage?: number;
  dot?: number;
  dot_ticks?: number;

  note?: string;
  kind?: MomentKind;
}

export interface Phase {
  id: string;
  title: string;
  start_sec: number;
  /** Inclusive; omit for open-ended. */
  end_sec?: number;
}

export interface MechanismSlice {
  name: string;
  phaseId: string;
  start_sec: number;
  end_sec: number;
}

export interface Timeline {
  id: string;
  title: string;
  version: number;
  phases: Phase[];
  moments: Moment[];
  mechanisms?: MechanismSlice[];
}

export type RoleId = "tank" | "healer" | "melee" | "ranged" | "caster";
export type JobId = string;
export type SkillId = string;
export type ThemeMode = "dark" | "light";

export type IconRef = string;

export interface Job {
  id: JobId;
  name: string;
  role: RoleId;
  icon?: IconRef;
}

export type SkillScope = "self" | "single_party" | "range_party" | "single_target" | "range_target";
export type SkillTag = "mitigation" | "shield" | "invuln" | "heal" | "utility";

export interface SkillData {
  id: SkillId;
  name: string;
  cooldown_s: number;
  duration_s?: number;
  stack?: number;

  scope: SkillScope;     
  kinds: SkillTag[];     

  phys_pct?: number;      
  magic_pct?: number; 
  unique_pct?: number;
  block?: number;
  parry?: number;     
  shield_pct_self?: number;
  shield_pct_target?: number; 
  heal_pwr?: number;

  maxStacks?: number;

  invuln?: true;

  icon?: IconRef;

  parentSkillId?: SkillId;
}

export interface PlanUsage {
  t_sec: number;
  jobId: JobId;
  skillId: SkillId;
  lineIndex: number;
  stacks?: number;
}

export type Team = JobId[];

export type JobsRegistry = Job[];
export type SkillMap = Record<SkillId, SkillData>;
export type JobSkillsEntry = {
  primary: SkillId[];
  secondary?: SkillId[];
};
export type JobSkillsMap = Record<JobId, JobSkillsEntry>;

export type GroupedSkills = Record<JobId, readonly SkillData[]>;

export interface SharePayload {
  v: number;
  team: Team;
  usages: PlanUsage[];

  /** Secondary skill rows expanded for these jobs. */
  expandedJobs?: JobId[];

  timelineId?: string;

  timelineInline?: {
    version: number;
    phases: Phase[];
    moments: Pick<Moment, "t_sec" | "name" | "elem" | "damage" | "note">[];
  };
}
