import { JOB_SKILLS, SKILL_MAP, getJobSkillIds } from "../data/skills";
import { jobCmp } from "../config/jobPriority";
import type {
  ElementType,
  JobId,
  JobSkillMode,
  Moment,
  PlanUsage,
  SkillData,
  SkillId,
  Timeline,
} from "../types";
import { isAstCardSkill } from "./astCards";
import { validateTimeline } from "./validate";

const FFLOGS_GRAPHQL_ENDPOINT = "https://ja.fflogs.com/api/v2/client";
const FFLOGS_TOKEN_ENDPOINT = "https://www.fflogs.com/oauth/token";

type FflogsFight = {
  id: number;
  name?: string;
  encounterID?: number;
  startTime: number;
  endTime: number;
  inferredFromEvents?: boolean;
};

type FflogsEvent = {
  type?: string;
  timestamp?: number;
  packetID?: number;
  packetId?: number;
  sourceID?: number;
  sourceInstance?: number;
  sourceIsFriendly?: boolean;
  targetID?: number;
  duration?: number;
  ability?: {
    name?: string;
    type?: number | string;
  };
  abilityName?: string;
  abilityGameID?: number;
  abilityType?: number | string;
  amount?: number;
  unmitigatedAmount?: number;
  absorbed?: number;
  mitigated?: number;
};

type FflogsActor = {
  id: number;
  name?: string;
  type?: string;
  subType?: string;
};

type FflogsAbility = {
  gameID?: number;
  name?: string;
  type?: number | string;
};

type FflogsMasterData = {
  actors?: FflogsActor[];
  abilities?: FflogsAbility[];
};

type FflogsEventsPage = {
  data?: FflogsEvent[];
  nextPageTimestamp?: number | null;
};

type FflogsEventsStrategy = {
  dataType: "Casts" | "All" | "DamageDone" | "Buffs" | "Resources";
  filterExpression?: string | null;
  hostilityType?: "Enemies" | "Friendlies" | null;
  includeFightIds: boolean;
  maxPages?: number;
  omitTimeRange?: boolean;
};

type FflogsFallbackStrategy = {
  source: "graph" | "table";
  dataType: "Casts" | "Summary";
  includeFightIds: boolean;
};

type FflogsGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

export type FflogsTimelineImportResult = {
  timeline: Timeline;
  fight: FflogsFight;
  eventCount: number;
  usages: PlanUsage[];
  team: JobId[];
  expandedJobs: JobId[];
  evolveJobs: JobId[];
  cooldownUsageCount: number;
  unmatchedCooldowns: FflogsUnmatchedCooldown[];
};

export type FflogsAccessTokenResult = {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
};

export type FflogsUnmatchedCooldown = {
  t_sec: number;
  abilityName: string;
  actorName?: string;
  actorJobId?: JobId | null;
  type?: string;
  count: number;
};

export type FflogsImportOptions = {
  includeAutoAttacks?: boolean;
  damageMergeWindowSec?: number;
  autoAttackMergeWindowSec?: number;
  cooldownDedupeWindowSec?: number;
  unmatchedCooldownLimit?: number;
};

function normalizeAccessToken(input: string) {
  return input.trim().replace(/^Bearer\s+/i, "").trim();
}

function normalizeCredential(input: string) {
  return input.trim();
}

function getTokenEndpoint() {
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1")
  ) {
    return "/fflogs-oauth/token";
  }
  return FFLOGS_TOKEN_ENDPOINT;
}

async function readErrorDetail(response: Response) {
  const detail = await response.text().catch(() => "");
  return cleanFflogsErrorDetail(detail);
}

export async function fetchFflogsAccessToken(args: {
  clientId: string;
  clientSecret: string;
}): Promise<FflogsAccessTokenResult> {
  const clientId = normalizeCredential(args.clientId);
  const clientSecret = normalizeCredential(args.clientSecret);
  if (!clientId || !clientSecret) {
    throw new Error("FFLogsのClient IDとClient Secretを入力してください。");
  }

  const response = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      [`FFLogs token request failed: ${response.status}`, detail]
        .filter(Boolean)
        .join("\n")
    );
  }

  const body = (await response.json()) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new Error("FFLogs token response did not include access_token.");
  }

  return {
    accessToken: body.access_token,
    tokenType: body.token_type,
    expiresIn: body.expires_in,
  };
}

function assertUsableAccessToken(accessToken: string) {
  if (!accessToken) {
    throw new Error("FFLogs APIのBearer tokenを入力してください。");
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accessToken)) {
    throw new Error(
      [
        "入力された値はFFLogs v2のBearer tokenではなく、API keyまたはClient IDの形式に見えます。",
        "FFLogs API v2では、client_id/client_secretをtoken_uriへ送って取得したaccess_tokenが必要です。",
      ].join("\n")
    );
  }
}

function cleanFflogsErrorDetail(detail: string) {
  const trimmed = detail.trim();
  if (!trimmed) {
    return "";
  }

  if (!trimmed.startsWith("<")) {
    return trimmed;
  }

  const text = trimmed
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || "FFLogs returned an HTML error page.";
}

function parseReportUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("FFLogs URLを読み取れませんでした。");
  }

  const pathMatch = url.pathname.match(/\/reports\/([^/?#]+)/);
  const code = pathMatch?.[1];
  if (!code) {
    throw new Error("FFLogsのレポートコードが見つかりません。");
  }

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const queryFight = url.searchParams.get("fight");
  const hashFight = hashParams.get("fight");
  const fightParam = queryFight ?? hashFight ?? "";
  const fightId = /^\d+$/.test(fightParam) ? Number(fightParam) : null;

  return { code, fightId };
}

async function fflogsRequest<T>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  label = "request"
): Promise<T> {
  const response = await fetch(FFLOGS_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const cleanDetail = await readErrorDetail(response);
    throw new Error(
      [`FFLogs API ${label} failed: ${response.status}`, cleanDetail]
        .filter(Boolean)
        .join("\n")
    );
  }

  const body = (await response.json()) as FflogsGraphqlResponse<T>;
  if (body.errors?.length) {
    throw new Error(
      [
        `FFLogs API ${label} error`,
        body.errors.map((error) => error.message).filter(Boolean).join("\n"),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (!body.data) {
    throw new Error(`FFLogs API ${label} response did not include data.`);
  }

  return body.data;
}

async function fetchFights(accessToken: string, code: string) {
  const reportArgs = ["code: $code", "code: $code, allowUnlisted: true"];
  const fieldSets = [
    "id name encounterID startTime endTime",
    "id name startTime endTime",
  ];
  const failures: string[] = [];

  for (const reportArg of reportArgs) {
    for (const fieldSet of fieldSets) {
      const label = `report fights ${reportArg.includes("allowUnlisted") ? "unlisted" : "public"} ${fieldSet.includes("encounterID") ? "full" : "minimal"}`;
      try {
        const data = await fflogsRequest<{
          reportData?: { report?: { fights?: FflogsFight[] } | null };
        }>(
          accessToken,
          `
            query FflogsReportFights($code: String!) {
              reportData {
                report(${reportArg}) {
                  fights {
                    ${fieldSet}
                  }
                }
              }
            }
          `,
          { code },
          label
        );
        return data.reportData?.report?.fights ?? [];
      } catch (error) {
        failures.push(`${label}: ${getErrorSummary(error)}`);
      }
    }
  }

  throw new Error(
    [
      "FFLogsの戦闘一覧を取得できませんでした。",
      "試行した取得方法:",
      ...failures.map((failure) => `- ${failure}`),
    ].join("\n")
  );
}

async function fetchMasterData(accessToken: string, code: string) {
  const data = await fflogsRequest<{
    reportData?: { report?: { masterData?: FflogsMasterData | null } | null };
  }>(
    accessToken,
    `
      query FflogsReportMasterData($code: String!) {
        reportData {
          report(code: $code, allowUnlisted: true) {
            masterData(translate: true) {
              actors {
                id
                name
                type
                subType
              }
              abilities {
                gameID
                name
                type
              }
            }
          }
        }
      }
    `,
    { code },
    "report masterData"
  );

  return data.reportData?.report?.masterData ?? {};
}

function buildAbilityNameMap(masterData: FflogsMasterData) {
  const map = new Map<number, string>();
  for (const ability of masterData.abilities ?? []) {
    if (typeof ability.gameID === "number" && ability.name) {
      map.set(ability.gameID, ability.name);
    }
  }
  return map;
}

function buildAbilityTypeMap(masterData: FflogsMasterData) {
  const map = new Map<number, number | string>();
  for (const ability of masterData.abilities ?? []) {
    if (typeof ability.gameID === "number" && ability.type !== undefined) {
      map.set(ability.gameID, ability.type);
    }
  }
  return map;
}

function buildActorMap(masterData: FflogsMasterData) {
  const map = new Map<number, FflogsActor>();
  for (const actor of masterData.actors ?? []) {
    map.set(actor.id, actor);
  }
  return map;
}

const JOB_SUBTYPE_ALIASES: Array<[JobId, readonly string[]]> = [
  ["tank.pld", ["Paladin", "PLD", "ナイト"]],
  ["tank.war", ["Warrior", "WAR", "戦士"]],
  ["tank.drk", ["Dark Knight", "DarkKnight", "DRK", "暗黒騎士"]],
  ["tank.gnb", ["Gunbreaker", "GNB", "ガンブレイカー"]],
  ["healer.whm", ["White Mage", "WhiteMage", "WHM", "白魔道士"]],
  ["healer.ast", ["Astrologian", "AST", "占星術師"]],
  ["healer.sch", ["Scholar", "SCH", "学者"]],
  ["healer.sge", ["Sage", "SGE", "賢者"]],
  ["melee.mnk", ["Monk", "MNK", "モンク"]],
  ["melee.drg", ["Dragoon", "DRG", "竜騎士"]],
  ["melee.nin", ["Ninja", "NIN", "忍者"]],
  ["melee.sam", ["Samurai", "SAM", "侍"]],
  ["melee.rpr", ["Reaper", "RPR", "リーパー"]],
  ["melee.vpr", ["Viper", "VPR", "ヴァイパー"]],
  ["ranged.brd", ["Bard", "BRD", "吟遊詩人"]],
  ["ranged.mch", ["Machinist", "MCH", "機工士"]],
  ["ranged.dnc", ["Dancer", "DNC", "踊り子"]],
  ["caster.blm", ["Black Mage", "BlackMage", "BLM", "黒魔道士"]],
  ["caster.smn", ["Summoner", "SMN", "召喚士"]],
  ["caster.rdm", ["Red Mage", "RedMage", "RDM", "赤魔道士"]],
  ["caster.pct", ["Pictomancer", "PCT", "ピクトマンサー"]],
];

function normalizeLookupName(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s'"‘’“”`´・･.．,，:：;；/／\\()[\]{}<>＜＞_‐‑‒–—-]+/g, "");
}

function buildJobSubtypeMap() {
  const map = new Map<string, JobId>();
  for (const [jobId, aliases] of JOB_SUBTYPE_ALIASES) {
    map.set(normalizeLookupName(jobId), jobId);
    for (const alias of aliases) {
      map.set(normalizeLookupName(alias), jobId);
    }
  }
  return map;
}

function isImportableCooldownSkill(skill: SkillData) {
  return skill.cooldown_s > 1 || Boolean(skill.parentSkillId) || isAstCardSkill(skill.id);
}

function buildCooldownSkillNameMap() {
  const map = new Map<string, SkillId[]>();
  const addSkill = (name: string, skillId: SkillId) => {
    const key = normalizeLookupName(name);
    const skillIds = map.get(key);
    if (skillIds) {
      if (!skillIds.includes(skillId)) {
        skillIds.push(skillId);
      }
      return;
    }
    map.set(key, [skillId]);
  };

  for (const skill of Object.values(SKILL_MAP)) {
    if (!isImportableCooldownSkill(skill)) {
      continue;
    }

    addSkill(skill.name, skill.id);
    for (const alias of skill.fflogsAliases ?? []) {
      addSkill(alias, skill.id);
    }
  }
  return map;
}

const JOB_SUBTYPE_MAP = buildJobSubtypeMap();
const COOLDOWN_SKILL_NAME_MAP = buildCooldownSkillNameMap();
const JOB_SKILL_ID_SETS = new Map<string, Set<SkillId>>();

function getActorJobId(actor?: FflogsActor) {
  const subType = actor?.subType;
  if (!subType) {
    return null;
  }
  return JOB_SUBTYPE_MAP.get(normalizeLookupName(subType)) ?? null;
}

function isFriendlyActor(actor?: FflogsActor) {
  if (!actor) {
    return false;
  }
  if (actor.type === "Player" || actor.type === "Pet") {
    return true;
  }
  return Boolean(getActorJobId(actor));
}

function inferJobIdFromSkillId(skillId: SkillId) {
  const parts = skillId.split(".");
  if (parts.length < 3) {
    return null;
  }
  return `${parts[0]}.${parts[1]}` as JobId;
}

function getJobSkillIdSet(jobId: JobId, mode: JobSkillMode) {
  const key = `${jobId}:${mode}`;
  const cached = JOB_SKILL_ID_SETS.get(key);
  if (cached) {
    return cached;
  }

  const skillIds = new Set(getJobSkillIds(jobId, true, mode));
  JOB_SKILL_ID_SETS.set(key, skillIds);
  return skillIds;
}

function getPreferredSkillModes(
  jobId: JobId | null,
  evolveJobs: ReadonlySet<JobId>
): JobSkillMode[] {
  return jobId && evolveJobs.has(jobId)
    ? ["evolve", "normal"]
    : ["normal", "evolve"];
}

function jobCanUseSkill(jobId: JobId, skillId: SkillId, mode: JobSkillMode) {
  return getJobSkillIdSet(jobId, mode).has(skillId);
}

function resolveEvents(events: readonly FflogsEvent[], masterData: FflogsMasterData) {
  const abilityNames = buildAbilityNameMap(masterData);
  const abilityTypes = buildAbilityTypeMap(masterData);
  const actors = buildActorMap(masterData);

  return events.map((event) => {
    const abilityName =
      (typeof event.abilityGameID === "number"
        ? abilityNames.get(event.abilityGameID)
        : undefined) ??
      getAbilityName(event) ??
      undefined;
    const abilityType =
      getAbilityType(event) ??
      (typeof event.abilityGameID === "number"
        ? abilityTypes.get(event.abilityGameID)
        : undefined);
    const sourceActor =
      typeof event.sourceID === "number" ? actors.get(event.sourceID) : undefined;

    return {
      ...event,
      abilityName,
      abilityType,
      sourceIsFriendly: event.sourceIsFriendly ?? isFriendlyActor(sourceActor),
    };
  });
}

async function fetchEnemyCastEvents(
  accessToken: string,
  code: string,
  fight: FflogsFight,
  masterData: FflogsMasterData
) {
  const strategies: FflogsEventsStrategy[] = [
    { dataType: "Casts", hostilityType: "Enemies", includeFightIds: true },
    { dataType: "Casts", hostilityType: "Enemies", includeFightIds: false },
    { dataType: "Casts", includeFightIds: true },
    { dataType: "Casts", includeFightIds: false },
    {
      dataType: "All",
      filterExpression: 'type = "begincast" OR type = "cast"',
      hostilityType: "Enemies",
      includeFightIds: true,
    },
    {
      dataType: "All",
      filterExpression: 'type = "begincast" OR type = "cast"',
      hostilityType: "Enemies",
      includeFightIds: false,
    },
    {
      dataType: "All",
      filterExpression: 'type = "begincast" OR type = "cast"',
      includeFightIds: true,
    },
    {
      dataType: "All",
      filterExpression: 'type = "begincast" OR type = "cast"',
      includeFightIds: false,
    },
    { dataType: "All", includeFightIds: true, maxPages: 80 },
    { dataType: "All", includeFightIds: false, maxPages: 80 },
  ];
  const fallbackStrategies: FflogsFallbackStrategy[] = [
    { source: "graph", dataType: "Casts", includeFightIds: true },
    { source: "graph", dataType: "Casts", includeFightIds: false },
    { source: "table", dataType: "Casts", includeFightIds: true },
    { source: "table", dataType: "Casts", includeFightIds: false },
  ];
  const failures: string[] = [];

  for (const strategy of strategies) {
    const label = `events:${strategy.dataType}:${
      strategy.includeFightIds ? "fight" : "time"
    }${strategy.hostilityType ? ":enemies" : ""}${strategy.filterExpression ? ":filter" : ""}`;
    try {
      const events = await fetchCastEventsWithStrategy(
        accessToken,
        code,
        fight,
        strategy
      );
      const resolvedEvents = resolveEvents(events, masterData);
      if (resolvedEvents.some(isCastEventCandidate)) {
        return resolvedEvents;
      }
      failures.push(`${label}: 詠唱イベントなし`);
    } catch (error) {
      failures.push(`${label}: ${getErrorSummary(error)}`);
    }
  }

  for (const strategy of fallbackStrategies) {
    const label = `${strategy.source}:${strategy.dataType}:${
      strategy.includeFightIds ? "fight" : "time"
    }`;
    try {
      const events = await fetchFallbackCastEvents(
        accessToken,
        code,
        fight,
        strategy
      );
      const resolvedEvents = resolveEvents(events, masterData);
      if (resolvedEvents.some(isCastEventCandidate)) {
        return resolvedEvents;
      }
      failures.push(`${label}: 詠唱イベントなし`);
    } catch (error) {
      failures.push(`${label}: ${getErrorSummary(error)}`);
    }
  }

  throw new Error(
    [
      "FFLogsから詠唱タイムラインを取得できませんでした。",
      "試行した取得方法:",
      ...failures.map((failure) => `- ${failure}`),
    ].join("\n")
  );
}

async function fetchEnemyDamageEvents(
  accessToken: string,
  code: string,
  fight: FflogsFight,
  masterData: FflogsMasterData
) {
  const strategies: FflogsEventsStrategy[] = [
    {
      dataType: "DamageDone",
      hostilityType: "Enemies",
      includeFightIds: true,
      maxPages: 80,
    },
    {
      dataType: "DamageDone",
      hostilityType: "Enemies",
      includeFightIds: false,
      maxPages: 80,
    },
    {
      dataType: "All",
      filterExpression: 'type = "calculateddamage" OR type = "damage"',
      hostilityType: "Enemies",
      includeFightIds: true,
      maxPages: 80,
    },
    {
      dataType: "All",
      filterExpression: 'type = "calculateddamage" OR type = "damage"',
      hostilityType: "Enemies",
      includeFightIds: false,
      maxPages: 80,
    },
  ];

  for (const strategy of strategies) {
    try {
      const events = await fetchCastEventsWithStrategy(
        accessToken,
        code,
        fight,
        strategy
      );
      const resolvedEvents = resolveEvents(events, masterData);
      const damageEvents = resolvedEvents.filter(isDamageEventCandidate);
      if (damageEvents.length > 0) {
        return damageEvents;
      }
    } catch {
      // Damage import is best-effort; cast import can still produce a usable timeline.
    }
  }

  return [];
}

function getCooldownSkillCandidates(event: FflogsEvent) {
  const abilityName = getAbilityName(event);
  if (!abilityName) {
    return [];
  }
  return COOLDOWN_SKILL_NAME_MAP.get(normalizeLookupName(abilityName)) ?? [];
}

function getCooldownSkillId(
  event: FflogsEvent,
  actorJobId: JobId | null,
  evolveJobs: ReadonlySet<JobId>
) {
  const candidates = getCooldownSkillCandidates(event);
  if (candidates.length === 0) {
    return null;
  }

  if (actorJobId) {
    for (const mode of getPreferredSkillModes(actorJobId, evolveJobs)) {
      const skillId = candidates.find((candidate) =>
        jobCanUseSkill(actorJobId, candidate, mode)
      );
      if (skillId) {
        return skillId;
      }
    }
  }

  const normalSkillId = candidates.find(
    (candidate) => !SKILL_MAP[candidate]?.evolveBaseSkillId
  );
  return normalSkillId ?? candidates[0] ?? null;
}

function isFriendlyCooldownEventCandidate(event: FflogsEvent) {
  if (typeof event.timestamp !== "number") {
    return false;
  }

  if (event.sourceIsFriendly === false) {
    return false;
  }

  if (getCooldownSkillCandidates(event).length === 0) {
    return false;
  }

  const type = event.type?.toLowerCase() ?? "";
  return (
    !type ||
    type === "cast" ||
    type === "begincast" ||
    type === "applybuff" ||
    type === "refreshbuff" ||
    type === "applybuffstack" ||
    type === "refreshbuffstack" ||
    type === "resourcechange"
  );
}

function isFriendlyPotentialCooldownEvent(event: FflogsEvent) {
  if (typeof event.timestamp !== "number") {
    return false;
  }

  if (event.sourceIsFriendly === false) {
    return false;
  }

  if (!getAbilityName(event)) {
    return false;
  }

  const type = event.type?.toLowerCase() ?? "";
  return (
    !type ||
    type === "cast" ||
    type === "begincast" ||
    type === "applybuff" ||
    type === "refreshbuff" ||
    type === "applybuffstack" ||
    type === "refreshbuffstack" ||
    type === "resourcechange"
  );
}

async function fetchFriendlyCooldownEvents(
  accessToken: string,
  code: string,
  fight: FflogsFight,
  masterData: FflogsMasterData
) {
  const strategies: FflogsEventsStrategy[] = [
    {
      dataType: "Casts",
      hostilityType: "Friendlies",
      includeFightIds: true,
      maxPages: 80,
    },
    {
      dataType: "Casts",
      hostilityType: "Friendlies",
      includeFightIds: false,
      maxPages: 80,
    },
    {
      dataType: "Buffs",
      hostilityType: "Friendlies",
      includeFightIds: true,
      maxPages: 80,
    },
    {
      dataType: "Buffs",
      hostilityType: "Friendlies",
      includeFightIds: false,
      maxPages: 80,
    },
    {
      dataType: "Resources",
      hostilityType: "Friendlies",
      includeFightIds: true,
      maxPages: 80,
    },
    {
      dataType: "Resources",
      hostilityType: "Friendlies",
      includeFightIds: false,
      maxPages: 80,
    },
    {
      dataType: "All",
      filterExpression:
        'type = "cast" OR type = "begincast" OR type = "applybuff" OR type = "refreshbuff" OR type = "applybuffstack" OR type = "refreshbuffstack" OR type = "resourcechange"',
      hostilityType: "Friendlies",
      includeFightIds: true,
      maxPages: 80,
    },
    {
      dataType: "All",
      filterExpression:
        'type = "cast" OR type = "begincast" OR type = "applybuff" OR type = "refreshbuff" OR type = "applybuffstack" OR type = "refreshbuffstack" OR type = "resourcechange"',
      hostilityType: "Friendlies",
      includeFightIds: false,
      maxPages: 80,
    },
  ];
  const events: FflogsEvent[] = [];
  const seenEventKeys = new Set<string>();

  for (const strategy of strategies) {
    try {
      const resolvedEvents = resolveEvents(
        await fetchCastEventsWithStrategy(accessToken, code, fight, strategy),
        masterData
      );
      for (const event of resolvedEvents) {
        if (!isFriendlyPotentialCooldownEvent(event)) {
          continue;
        }

        const eventKey = [
          event.timestamp ?? "",
          event.packetID ?? event.packetId ?? "",
          event.sourceID ?? "",
          event.abilityGameID ?? getAbilityName(event) ?? "",
          event.type ?? "",
        ].join(":");
        if (seenEventKeys.has(eventKey)) {
          continue;
        }

        seenEventKeys.add(eventKey);
        events.push(event);
      }
    } catch {
      // Cooldown import is best-effort. Other strategies may still return enough data.
    }
  }

  return events;
}

type CooldownUsageCandidate = {
  jobId: JobId;
  skillId: SkillId;
  tSec: number;
  timestamp: number;
};

function getCooldownUsageDedupeWindowSec(skill: SkillData) {
  if (skill.stack && skill.stack > 1) {
    return 4;
  }

  return Math.max(
    4,
    Math.min(45, Math.max(skill.duration_s ?? 0, skill.cooldown_s - 5))
  );
}

function resolveCooldownUsageCandidates(
  fight: FflogsFight,
  masterData: FflogsMasterData,
  events: readonly FflogsEvent[],
  evolveJobs: ReadonlySet<JobId>
) {
  const actors = buildActorMap(masterData);
  const candidates: CooldownUsageCandidate[] = [];

  for (const event of events) {
    if (!isFriendlyCooldownEventCandidate(event)) {
      continue;
    }

    const timestamp = event.timestamp;
    if (typeof timestamp !== "number") {
      continue;
    }

    const sourceActor =
      typeof event.sourceID === "number" ? actors.get(event.sourceID) : undefined;
    const actorJobId = getActorJobId(sourceActor);
    const skillId = getCooldownSkillId(event, actorJobId, evolveJobs);
    if (!skillId) {
      continue;
    }

    const inferredJobId = inferJobIdFromSkillId(skillId);
    const actorModes = getPreferredSkillModes(actorJobId, evolveJobs);
    const jobId =
      actorJobId &&
      actorModes.some((mode) => jobCanUseSkill(actorJobId, skillId, mode))
        ? actorJobId
        : inferredJobId;
    const jobModes = getPreferredSkillModes(jobId, evolveJobs);

    if (
      !jobId ||
      !jobModes.some((mode) => jobCanUseSkill(jobId, skillId, mode))
    ) {
      continue;
    }

    candidates.push({
      jobId,
      skillId,
      timestamp,
      tSec: Math.max(0, Math.round((timestamp - fight.startTime) / 1000)),
    });
  }

  return candidates.sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      a.jobId.localeCompare(b.jobId) ||
      a.skillId.localeCompare(b.skillId)
  );
}

function buildCooldownUsages(
  fight: FflogsFight,
  masterData: FflogsMasterData,
  events: readonly FflogsEvent[],
  evolveJobs: ReadonlySet<JobId>,
  options: FflogsImportOptions = {}
) {
  const usages: PlanUsage[] = [];
  const lastUsageByJobSkill = new Map<string, PlanUsage>();

  for (const candidate of resolveCooldownUsageCandidates(
    fight,
    masterData,
    events,
    evolveJobs
  )) {
    const key = `${candidate.jobId}::${candidate.skillId}`;
    const skill = SKILL_MAP[candidate.skillId];
    const lastUsage = lastUsageByJobSkill.get(key);
    const dedupeWindow =
      options.cooldownDedupeWindowSec !== undefined
        ? Math.max(0, options.cooldownDedupeWindowSec)
        : skill
          ? getCooldownUsageDedupeWindowSec(skill)
          : 4;

    if (lastUsage && candidate.tSec - lastUsage.t_sec <= dedupeWindow) {
      continue;
    }

    const usage = {
      jobId: candidate.jobId,
      skillId: candidate.skillId,
      t_sec: candidate.tSec,
      lineIndex: 0,
    } satisfies PlanUsage;
    usages.push(usage);
    lastUsageByJobSkill.set(key, usage);
  }

  return usages;
}

function buildUnmatchedCooldowns(
  fight: FflogsFight,
  masterData: FflogsMasterData,
  events: readonly FflogsEvent[],
  evolveJobs: ReadonlySet<JobId>,
  limit = 30
): FflogsUnmatchedCooldown[] {
  const actors = buildActorMap(masterData);
  const unmatchedByKey = new Map<string, FflogsUnmatchedCooldown>();

  for (const event of events) {
    if (!isFriendlyPotentialCooldownEvent(event)) {
      continue;
    }

    const abilityName = getAbilityName(event);
    const timestamp = event.timestamp;
    if (!abilityName || typeof timestamp !== "number") {
      continue;
    }

    const sourceActor =
      typeof event.sourceID === "number" ? actors.get(event.sourceID) : undefined;
    const actorJobId = getActorJobId(sourceActor);
    if (getCooldownSkillId(event, actorJobId, evolveJobs)) {
      continue;
    }

    const tSec = Math.max(0, Math.round((timestamp - fight.startTime) / 1000));
    const key = [
      abilityName,
      sourceActor?.name ?? "",
      actorJobId ?? "",
      event.type ?? "",
    ].join("::");
    const current = unmatchedByKey.get(key);
    if (current) {
      current.count += 1;
      current.t_sec = Math.min(current.t_sec, tSec);
      continue;
    }

    unmatchedByKey.set(key, {
      t_sec: tSec,
      abilityName,
      actorName: sourceActor?.name,
      actorJobId,
      type: event.type,
      count: 1,
    });
  }

  return Array.from(unmatchedByKey.values())
    .sort((a, b) => a.t_sec - b.t_sec || b.count - a.count || a.abilityName.localeCompare(b.abilityName))
    .slice(0, limit);
}

function buildTeamFromUsages(usages: readonly PlanUsage[]) {
  return Array.from(new Set(usages.map((usage) => usage.jobId))).sort(jobCmp);
}

function buildExpandedJobsFromUsages(usages: readonly PlanUsage[]) {
  const expandedJobs = new Set<JobId>();
  for (const usage of usages) {
    const secondarySkills = JOB_SKILLS[usage.jobId]?.secondary ?? [];
    if (secondarySkills.includes(usage.skillId)) {
      expandedJobs.add(usage.jobId);
    }
  }
  return Array.from(expandedJobs).sort(jobCmp);
}

function buildEvolveJobsFromUsages(
  usages: readonly PlanUsage[],
  requestedEvolveJobs: ReadonlySet<JobId>
) {
  const team = new Set(usages.map((usage) => usage.jobId));
  const evolveJobs = new Set<JobId>();

  for (const jobId of requestedEvolveJobs) {
    if (team.has(jobId)) {
      evolveJobs.add(jobId);
    }
  }

  for (const usage of usages) {
    if (SKILL_MAP[usage.skillId]?.evolveBaseSkillId) {
      evolveJobs.add(usage.jobId);
    }
  }

  return Array.from(evolveJobs).sort(jobCmp);
}

function getErrorSummary(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 240);
}

async function fetchCastEventsWithStrategy(
  accessToken: string,
  code: string,
  fight: FflogsFight,
  strategy: FflogsEventsStrategy
) {
  const events: FflogsEvent[] = [];
  let startTime = fight.startTime;
  let pageCount = 0;

  while (startTime < fight.endTime) {
    const fightIdsVariable = strategy.includeFightIds ? "$fightIds: [Int]" : "";
    const fightIdsArgument = strategy.includeFightIds ? "fightIDs: $fightIds" : "";
    const data = await fflogsRequest<{
      reportData?: { report?: { events?: FflogsEventsPage | null } | null };
    }>(
      accessToken,
      `
        query FflogsEnemyCasts(
          $code: String!
          ${fightIdsVariable}
          $dataType: EventDataType!
          $filterExpression: String
          $hostilityType: HostilityType
          $startTime: Float!
          $endTime: Float!
        ) {
          reportData {
            report(code: $code, allowUnlisted: true) {
              events(
                ${fightIdsArgument}
                dataType: $dataType
                filterExpression: $filterExpression
                hostilityType: $hostilityType
                startTime: $startTime
                endTime: $endTime
                limit: 1000
              ) {
                data
                nextPageTimestamp
              }
            }
          }
        }
      `,
      {
        code,
        ...(strategy.includeFightIds ? { fightIds: [fight.id] } : {}),
        dataType: strategy.dataType,
        filterExpression: strategy.filterExpression ?? null,
        hostilityType: strategy.hostilityType ?? null,
        startTime,
        endTime: fight.endTime,
      },
      `events ${strategy.dataType}`
    );

    const page = data.reportData?.report?.events;
    events.push(...(page?.data ?? []));

    if (!page?.nextPageTimestamp || page.nextPageTimestamp <= startTime) {
      break;
    }
    pageCount += 1;
    if (strategy.maxPages && pageCount >= strategy.maxPages) {
      break;
    }
    startTime = page.nextPageTimestamp;
  }

  return events;
}

async function fetchFallbackCastEvents(
  accessToken: string,
  code: string,
  fight: FflogsFight,
  strategy: FflogsFallbackStrategy
) {
  const fightIdsVariable = strategy.includeFightIds ? "$fightIds: [Int]" : "";
  const fightIdsArgument = strategy.includeFightIds ? "fightIDs: $fightIds" : "";
  const fieldName = strategy.source;
  const dataTypeVariable =
    strategy.source === "graph" ? "$dataType: GraphDataType!" : "$dataType: TableDataType!";
  const data = await fflogsRequest<{
    reportData?: { report?: { fallback?: unknown } | null };
  }>(
    accessToken,
    `
      query FflogsFallbackCasts(
        $code: String!
        ${fightIdsVariable}
        ${dataTypeVariable}
        $startTime: Float!
        $endTime: Float!
      ) {
        reportData {
          report(code: $code, allowUnlisted: true) {
            fallback: ${fieldName}(
              ${fightIdsArgument}
              dataType: $dataType
              startTime: $startTime
              endTime: $endTime
            )
          }
        }
      }
    `,
    {
      code,
      ...(strategy.includeFightIds ? { fightIds: [fight.id] } : {}),
      dataType: strategy.dataType,
      startTime: fight.startTime,
      endTime: fight.endTime,
    },
    `${strategy.source} ${strategy.dataType}`
  );

  return extractCastEventsFromUnknown(data.reportData?.report?.fallback, fight);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStringField(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getNumberField(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getAbilityNameFromRecord(record: Record<string, unknown>) {
  const ability = record.ability;
  if (isRecord(ability)) {
    const abilityName = getStringField(ability, ["name", "abilityName", "gameName"]);
    if (abilityName) {
      return abilityName;
    }
  }

  return getStringField(record, [
    "abilityName",
    "ability",
    "name",
    "spellName",
    "typeName",
  ]);
}

function normalizeTimestamp(raw: number, fight: FflogsFight) {
  const durationMs = fight.endTime - fight.startTime;
  const durationSec = durationMs / 1000;

  if (raw >= fight.startTime && raw <= fight.endTime) {
    return raw;
  }
  if (raw >= 0 && raw <= durationMs) {
    return fight.startTime + raw;
  }
  if (raw >= 0 && raw <= durationSec + 5) {
    return fight.startTime + raw * 1000;
  }
  return null;
}

function getTimestampFromRecord(record: Record<string, unknown>, fight: FflogsFight) {
  const raw = getNumberField(record, [
    "timestamp",
    "time",
    "startTime",
    "start",
    "x",
  ]);
  return raw === null ? null : normalizeTimestamp(raw, fight);
}

function recordLooksCastLike(record: Record<string, unknown>) {
  const type = getStringField(record, ["type", "eventType", "category"]);
  if (!type) {
    return true;
  }

  const normalized = type.toLowerCase();
  return normalized === "cast" || normalized === "begincast" || normalized === "casts";
}

function extractCastEventsFromUnknown(value: unknown, fight: FflogsFight) {
  const events: FflogsEvent[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown, inheritedName: string | null = null) {
    if (!node || seen.has(node)) {
      return;
    }

    if (Array.isArray(node)) {
      seen.add(node);
      for (const item of node) {
        visit(item, inheritedName);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    seen.add(node);
    const name = getAbilityNameFromRecord(node) ?? inheritedName;
    const timestamp = getTimestampFromRecord(node, fight);
    const sourceIsFriendly = node.sourceIsFriendly;

    if (
      name &&
      timestamp !== null &&
      sourceIsFriendly !== true &&
      recordLooksCastLike(node)
    ) {
      events.push({
        type: getStringField(node, ["type"]) ?? "cast",
        timestamp,
        sourceID: getNumberField(node, ["sourceID", "sourceId", "source"]) ?? undefined,
        sourceIsFriendly: false,
        abilityName: name,
      });
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "series" || key === "events" || key === "entries" || key === "auras") {
        visit(child, name);
      } else if (Array.isArray(child) || isRecord(child)) {
        visit(child, name);
      }
    }
  }

  visit(value);
  return events;
}

function selectFight(fights: FflogsFight[], requestedFightId: number | null) {
  if (requestedFightId !== null) {
    const fight = fights.find((entry) => entry.id === requestedFightId);
    if (!fight) {
      throw new Error(`fight=${requestedFightId} がレポート内に見つかりません。`);
    }
    return fight;
  }

  const encounterFight = fights.find((entry) => entry.encounterID && entry.endTime > entry.startTime);
  if (encounterFight) {
    return encounterFight;
  }

  const firstFight = fights.find((entry) => entry.endTime > entry.startTime);
  if (!firstFight) {
    throw new Error("有効な戦闘が見つかりません。");
  }
  return firstFight;
}

function getAbilityName(event: FflogsEvent) {
  return event.abilityName ?? event.ability?.name ?? null;
}

function getDamageTimelineName(event: FflogsEvent) {
  const abilityName = getAbilityName(event);
  return abilityName === "Attack" ? "AA" : abilityName;
}

function getAbilityType(event: FflogsEvent) {
  return event.ability?.type ?? event.abilityType;
}

function isCastEventCandidate(event: FflogsEvent) {
  const abilityName = getAbilityName(event);
  if (!abilityName || typeof event.timestamp !== "number") {
    return false;
  }

  if (abilityName === "Attack" || abilityName.startsWith("unknown_")) {
    return false;
  }

  if (event.sourceIsFriendly === true) {
    return false;
  }

  const type = event.type ?? "";
  return !type || type === "cast" || type === "begincast";
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getDamageAmount(event: FflogsEvent) {
  const unmitigated = getPositiveNumber(event.unmitigatedAmount);
  if (unmitigated !== null) {
    return Math.round(unmitigated);
  }

  const amount = getPositiveNumber(event.amount);
  if (amount === null) {
    return null;
  }

  const absorbed = getPositiveNumber(event.absorbed) ?? 0;
  const mitigated = getPositiveNumber(event.mitigated) ?? 0;
  return Math.round(amount + absorbed + mitigated);
}

function isDamageEventCandidate(event: FflogsEvent) {
  const abilityName = getDamageTimelineName(event);
  if (!abilityName || typeof event.timestamp !== "number") {
    return false;
  }

  if (abilityName.startsWith("unknown_")) {
    return false;
  }

  if (event.sourceIsFriendly === true) {
    return false;
  }

  if (getDamageAmount(event) === null) {
    return false;
  }

  const type = event.type?.toLowerCase() ?? "";
  return !type || type === "damage" || type === "calculateddamage";
}

function getAbilityTypeCode(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getDamageElement(event: FflogsEvent): ElementType {
  if (getDamageTimelineName(event) === "AA") {
    return "physical";
  }

  const typeCode = getAbilityTypeCode(getAbilityType(event));
  if (typeCode === 1 || typeCode === 128) {
    return "physical";
  }

  if (typeCode === 1024) {
    return "unique";
  }

  if (typeCode !== null && typeCode > 0) {
    return "magic";
  }

  return "unique";
}

type DamageOccurrence = {
  key: string;
  abilityName: string;
  timestamp: number;
  tSec: number;
  damage: number;
  elem: ElementType;
};

type DamageSample = {
  damage: number;
  priority: number;
};

type DamageOccurrenceDraft = {
  key: string;
  abilityName: string;
  timestamp: number;
  elem: ElementType;
  samplesByTarget: Map<string, DamageSample>;
};

function getDamagePacketId(event: FflogsEvent) {
  const packetId = event.packetID ?? event.packetId;
  return typeof packetId === "number" && Number.isFinite(packetId)
    ? packetId
    : null;
}

function getDamageOccurrenceKey(
  event: FflogsEvent,
  abilityName: string,
  tSec: number
) {
  const packetId = getDamagePacketId(event);
  return packetId !== null
    ? `packet:${packetId}:${abilityName}`
    : `time:${tSec}:${abilityName}`;
}

function getDamageTargetKey(event: FflogsEvent) {
  if (typeof event.targetID === "number" && Number.isFinite(event.targetID)) {
    return `target:${event.targetID}`;
  }
  return `event:${event.timestamp ?? 0}:${event.type ?? ""}`;
}

function getDamageSamplePriority(event: FflogsEvent) {
  if (getPositiveNumber(event.unmitigatedAmount) !== null) {
    return 3;
  }
  if (event.type?.toLowerCase() === "calculateddamage") {
    return 2;
  }
  return 1;
}

function preferDamageElement(current: ElementType, next: ElementType) {
  if (current === "unique" && next !== "unique") {
    return next;
  }
  return current;
}

function median(values: readonly number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function buildDamageOccurrences(
  fight: FflogsFight,
  events: readonly FflogsEvent[],
  options: FflogsImportOptions = {}
) {
  const draftsByKey = new Map<string, DamageOccurrenceDraft>();
  const includeAutoAttacks = options.includeAutoAttacks ?? true;

  for (const event of events) {
    if (!isDamageEventCandidate(event)) {
      continue;
    }

    const abilityName = getDamageTimelineName(event);
    const timestamp = event.timestamp;
    const damage = getDamageAmount(event);
    if (!abilityName || typeof timestamp !== "number" || damage === null) {
      continue;
    }
    if (!includeAutoAttacks && abilityName === "AA") {
      continue;
    }

    const tSec = Math.max(0, Math.round((timestamp - fight.startTime) / 1000));
    const key = getDamageOccurrenceKey(event, abilityName, tSec);
    const elem = getDamageElement(event);
    const targetKey = getDamageTargetKey(event);
    const sample = {
      damage,
      priority: getDamageSamplePriority(event),
    };
    const existing = draftsByKey.get(key);

    if (!existing) {
      const samplesByTarget = new Map<string, DamageSample>();
      samplesByTarget.set(targetKey, sample);
      draftsByKey.set(key, {
        key,
        abilityName,
        timestamp,
        elem,
        samplesByTarget,
      });
      continue;
    }

    existing.timestamp = Math.min(existing.timestamp, timestamp);
    existing.elem = preferDamageElement(existing.elem, elem);

    const existingSample = existing.samplesByTarget.get(targetKey);
    if (
      !existingSample ||
      sample.priority > existingSample.priority ||
      (sample.priority === existingSample.priority &&
        sample.damage > existingSample.damage)
    ) {
      existing.samplesByTarget.set(targetKey, sample);
    }
  }

  const occurrencesByAbility = new Map<string, DamageOccurrence[]>();
  for (const draft of draftsByKey.values()) {
    const damages = Array.from(draft.samplesByTarget.values()).map(
      (sample) => sample.damage
    );
    const occurrence: DamageOccurrence = {
      key: draft.key,
      abilityName: draft.abilityName,
      timestamp: draft.timestamp,
      tSec: Math.max(0, Math.round((draft.timestamp - fight.startTime) / 1000)),
      damage: median(damages),
      elem: draft.elem,
    };
    const list = occurrencesByAbility.get(occurrence.abilityName) ?? [];
    list.push(occurrence);
    occurrencesByAbility.set(occurrence.abilityName, list);
  }

  for (const [abilityName, list] of occurrencesByAbility.entries()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    occurrencesByAbility.set(
      abilityName,
      mergeCloseDamageOccurrences(
        list,
        abilityName === "AA"
          ? options.autoAttackMergeWindowSec ?? 1
          : options.damageMergeWindowSec ?? 0
      )
    );
  }

  return occurrencesByAbility;
}

function mergeCloseDamageOccurrences(
  occurrences: readonly DamageOccurrence[],
  windowSec: number
) {
  if (windowSec <= 0 || occurrences.length <= 1) {
    return [...occurrences];
  }

  const windowMs = windowSec * 1000;
  const merged: DamageOccurrence[] = [];
  for (const occurrence of occurrences) {
    const previous = merged[merged.length - 1];
    if (previous && occurrence.timestamp - previous.timestamp <= windowMs) {
      previous.key = `${previous.key}+${occurrence.key}`;
      previous.damage = Math.max(previous.damage, occurrence.damage);
      previous.elem = preferDamageElement(previous.elem, occurrence.elem);
      continue;
    }
    merged.push({ ...occurrence });
  }
  return merged;
}

function findDamageOccurrence(
  abilityName: string,
  castTimestamp: number,
  occurrencesByAbility: Map<string, DamageOccurrence[]>,
  usedDamageKeys: Set<string>
) {
  const occurrences = occurrencesByAbility.get(abilityName) ?? [];
  const future = occurrences.find(
    (occurrence) =>
      !usedDamageKeys.has(occurrence.key) &&
      occurrence.timestamp >= castTimestamp - 1000 &&
      occurrence.timestamp - castTimestamp <= 35000
  );
  if (future) {
    return future;
  }

  return occurrences.find(
    (occurrence) =>
      !usedDamageKeys.has(occurrence.key) &&
      Math.abs(occurrence.timestamp - castTimestamp) <= 3000
  );
}

function formatTimelineSecond(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.max(0, totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildDamageMoment(
  occurrence: DamageOccurrence,
  note?: string
): Moment {
  return {
    t_sec: occurrence.tSec,
    name: occurrence.abilityName,
    elem: occurrence.elem,
    damage: occurrence.damage,
    ...(note ? { note } : {}),
  };
}

function buildTimelineFromCasts(
  code: string,
  fight: FflogsFight,
  events: readonly FflogsEvent[],
  damageEvents: readonly FflogsEvent[],
  options: FflogsImportOptions = {}
) {
  const momentsByKey = new Map<string, Moment>();
  const damageOccurrences = buildDamageOccurrences(fight, damageEvents, options);
  const usedDamageKeys = new Set<string>();
  const castCandidates = events
    .filter(isCastEventCandidate)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const beginCastKeys = new Map<string, number[]>();

  for (const event of castCandidates) {
    if (event.type !== "begincast") {
      continue;
    }

    const abilityName = getAbilityName(event);
    if (!abilityName || typeof event.timestamp !== "number") {
      continue;
    }
    const key = abilityName;
    const timestamps = beginCastKeys.get(key) ?? [];
    timestamps.push(event.timestamp);
    beginCastKeys.set(key, timestamps);
  }

  for (const event of castCandidates) {
    const abilityName = getAbilityName(event);
    if (!abilityName || typeof event.timestamp !== "number") {
      continue;
    }

    const eventTimestamp = event.timestamp;
    if (event.type === "cast") {
      const beginCasts = beginCastKeys.get(abilityName) ?? [];
      const hasMatchingBeginCast = beginCasts.some(
        (timestamp) => timestamp <= eventTimestamp && eventTimestamp - timestamp <= 30000
      );
      if (hasMatchingBeginCast) {
        continue;
      }
    }

    const castStartSec = Math.max(
      0,
      Math.round((eventTimestamp - fight.startTime) / 1000)
    );
    const damageOccurrence = findDamageOccurrence(
      abilityName,
      eventTimestamp,
      damageOccurrences,
      usedDamageKeys
    );
    if (damageOccurrence) {
      usedDamageKeys.add(damageOccurrence.key);
    }

    const tSec = damageOccurrence?.tSec ?? castStartSec;
    const key = `${tSec}::${abilityName}`;
    if (momentsByKey.has(key)) {
      continue;
    }

    const note =
      damageOccurrence && damageOccurrence.tSec !== castStartSec
        ? `FFLogs cast start: ${formatTimelineSecond(castStartSec)}`
        : undefined;

    momentsByKey.set(
      key,
      damageOccurrence
        ? buildDamageMoment(damageOccurrence, note)
        : {
            t_sec: tSec,
            name: abilityName,
            elem: "none",
            kind: "event",
          }
    );
  }

  for (const damageOccurrencesForAbility of damageOccurrences.values()) {
    for (const occurrence of damageOccurrencesForAbility) {
      if (usedDamageKeys.has(occurrence.key)) {
        continue;
      }

      const key = `${occurrence.tSec}::${occurrence.abilityName}`;
      const existing = momentsByKey.get(key);
      if (existing && typeof existing.damage === "number") {
        continue;
      }

      momentsByKey.set(key, buildDamageMoment(occurrence));
    }
  }

  const moments = Array.from(momentsByKey.values()).sort(
    (a, b) => a.t_sec - b.t_sec || a.name.localeCompare(b.name)
  );

  if (moments.length === 0) {
    throw new Error("敵の詠唱イベントを取得できませんでした。");
  }

  const endSec = Math.max(
    Math.ceil((fight.endTime - fight.startTime) / 1000),
    moments[moments.length - 1]?.t_sec ?? 0
  );

  const timeline: Timeline = {
    id: `fflogs-${code}-${fight.id}`,
    title: `${fight.name || "FFLogs Timeline"} (${code} #${fight.id})`,
    version: 1,
    phases: [
      {
        id: "p1",
        title: "P1",
        start_sec: 0,
        end_sec: endSec,
      },
    ],
    moments,
  };

  validateTimeline(timeline);
  return timeline;
}

function getTimelineEndSec(timeline: Timeline) {
  return Math.max(
    0,
    ...timeline.moments.map((moment) => moment.t_sec),
    ...timeline.phases.map((phase) => phase.end_sec ?? phase.start_sec)
  );
}

function buildTimelineWithCooldownLog(
  baseTimeline: Timeline,
  code: string,
  fight: FflogsFight,
  usages: readonly PlanUsage[]
) {
  const maxUsageSec = Math.max(0, ...usages.map((usage) => usage.t_sec));
  const endSec = Math.max(getTimelineEndSec(baseTimeline), maxUsageSec);
  const phases = baseTimeline.phases.map((phase) => ({ ...phase }));
  const lastPhase = phases[phases.length - 1];
  if (lastPhase && (lastPhase.end_sec ?? lastPhase.start_sec) < endSec) {
    lastPhase.end_sec = endSec;
  }

  const timeline: Timeline = {
    ...baseTimeline,
    id: `${baseTimeline.id}-logs-${code}-${fight.id}`.replace(
      /[^a-zA-Z0-9_.-]+/g,
      "-"
    ),
    title: `${baseTimeline.title} + ${fight.name || "FFLogs"} CD`,
    phases,
    moments: baseTimeline.moments.map((moment) => ({ ...moment })),
    mechanisms: baseTimeline.mechanisms?.map((mechanism) => ({ ...mechanism })),
    practice: baseTimeline.practice
      ? {
          youtubeUrl: baseTimeline.practice.youtubeUrl,
          syncPoints: baseTimeline.practice.syncPoints.map((point) => ({ ...point })),
        }
      : undefined,
  };

  validateTimeline(timeline);
  return timeline;
}

export async function importFflogsTimeline(args: {
  reportUrl: string;
  accessToken: string;
  baseTimeline?: Timeline | null;
  evolveJobs?: readonly JobId[];
  options?: FflogsImportOptions;
}): Promise<FflogsTimelineImportResult> {
  const accessToken = normalizeAccessToken(args.accessToken);
  assertUsableAccessToken(accessToken);

  const evolveJobs = new Set(args.evolveJobs ?? []);
  const { code, fightId } = parseReportUrl(args.reportUrl);
  const fights = await fetchFights(accessToken, code);
  const fight = selectFight(fights, fightId);
  const masterData = await fetchMasterData(accessToken, code);
  const cooldownEvents = await fetchFriendlyCooldownEvents(
    accessToken,
    code,
    fight,
    masterData
  );
  const importOptions = args.options ?? {};
  const usages = buildCooldownUsages(
    fight,
    masterData,
    cooldownEvents,
    evolveJobs,
    importOptions
  );
  const unmatchedCooldowns = buildUnmatchedCooldowns(
    fight,
    masterData,
    cooldownEvents,
    evolveJobs,
    importOptions.unmatchedCooldownLimit ?? 30
  );
  const timeline = args.baseTimeline
    ? buildTimelineWithCooldownLog(args.baseTimeline, code, fight, usages)
    : buildTimelineFromCasts(
        code,
        fight,
        await fetchEnemyCastEvents(accessToken, code, fight, masterData),
        await fetchEnemyDamageEvents(accessToken, code, fight, masterData),
        importOptions
      );

  return {
    timeline,
    fight,
    eventCount: timeline.moments.length,
    usages,
    team: buildTeamFromUsages(usages),
    expandedJobs: buildExpandedJobsFromUsages(usages),
    evolveJobs: buildEvolveJobsFromUsages(usages, evolveJobs),
    cooldownUsageCount: usages.length,
    unmatchedCooldowns,
  };
}
