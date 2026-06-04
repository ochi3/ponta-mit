export type ElementType = "physical" | "magic" | "unique" | "none";
export type MomentKind = "hit" | "event" | "mechanic";
export type MomentTag =
  | "raidwide"
  | "tankbuster"
  | "spread"
  | "stack"
  | "tower"
  | "knockback"
  | "downtime";

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
  tags?: MomentTag[];
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
  practice?: TimelinePracticeConfig;
}

export type RoleId = "tank" | "healer" | "melee" | "ranged" | "caster" | "utility";
export type JobId = string;
export type SkillId = string;
export type JobSkillMode = "normal" | "evolve";
export type ThemeMode = "dark" | "light";

export interface VideoSyncPoint {
  t_sec: number;
  video_sec: number;
}

export type PracticeVideoSource = "base" | "job";

export interface TimelinePracticeConfig {
  youtubeUrl: string;
  syncPoints: VideoSyncPoint[];
  /** ジョブごとの動画URL（未設定のジョブは基本動画を使用） */
  jobYoutubeUrls?: Partial<Record<JobId, string>>;
  /** ジョブごとに「基本」か「ジョブ別」を選択 */
  jobVideoSource?: Partial<Record<JobId, PracticeVideoSource>>;
  /** ジョブごとの同期ポイント（基本動画の syncPoints と同じ形式） */
  jobSyncPoints?: Partial<Record<JobId, VideoSyncPoint[]>>;
}

export interface PracticeSettings extends TimelinePracticeConfig {
  selectedJobId: JobId | null;
}

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
  /** Ability names reported by FFLogs that differ from the local display name. */
  fflogsAliases?: readonly string[];
  cooldown_s: number;
  duration_s?: number;
  /** Charge-based skills can hold this many uses at once. */
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

  /** Manual stack/input skills such as scaling shields. */
  maxStacks?: number;
  /** maxStacks セルに表示するラベル（インデックス=スタック数） */
  stackDisplayLabels?: readonly string[];

  invuln?: true;

  icon?: IconRef;

  parentSkillId?: SkillId;
  /** Evolve-mode variants can reuse a base skill's display data with different tuning. */
  evolveBaseSkillId?: SkillId;
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
export type JobSkillSet = {
  primary: SkillId[];
  secondary?: SkillId[];
};
export type JobSkillsEntry = {
  primary: SkillId[];
  secondary?: SkillId[];
  evolve?: JobSkillSet;
};
export type JobSkillsMap = Record<JobId, JobSkillsEntry>;

export type GroupedSkills = Record<JobId, readonly SkillData[]>;

export interface PlannerLayoutPrefs {
  /** Memo column width in pixels. */
  memoWidthPx?: number;
}

export interface SharePayload {
  v: number;
  team: Team;
  usages: PlanUsage[];

  /**
   * 個人スキル展開（共有ルームでは同期しない。URL 共有時のみ任意）。
   */
  expandedJobs?: JobId[];
  /**
   * 進化モード（共有ルームでは同期しない。URL 共有時のみ任意）。
   */
  evolveJobs?: JobId[];

  timelineId?: string;
  practice?: TimelinePracticeConfig;

  timelineInline?: {
    version: number;
    phases: Phase[];
    moments: Pick<Moment, "t_sec" | "name" | "elem" | "damage" | "note" | "tags">[];
  };

  /** Per-row memo overrides keyed by `${t_sec}::${lineIndex}`. */
  momentNotes?: Record<string, string>;

  /** Table layout preferences such as memo column width. */
  layoutPrefs?: PlannerLayoutPrefs;
}
