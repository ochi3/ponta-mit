import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const coreTimelineIds = new Set(["dancing-mad", "fru", "m12s-p1", "m12s-p2"]);
const elementTypes = new Set(["physical", "magic", "unique", "none"]);
const momentKinds = new Set(["hit", "event", "mechanic"]);
const momentTags = new Set([
  "raidwide",
  "tankbuster",
  "spread",
  "stack",
  "tower",
  "knockback",
  "downtime",
]);
const skillScopes = new Set([
  "self",
  "single_party",
  "range_party",
  "single_target",
  "range_target",
]);
const skillKinds = new Set(["mitigation", "shield", "invuln", "heal", "utility"]);
const activityDateRe = /^\d{4}-\d{2}-\d{2}$/;

function rel(filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function addError(filePath, message) {
  errors.push(`${rel(filePath)}: ${message}`);
}

function readText(...parts) {
  return readFileSync(path.join(rootDir, ...parts), "utf8");
}

function listFiles(dir, predicate) {
  if (!existsSync(dir)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...listFiles(entryPath, predicate));
    } else if (predicate(entryPath)) {
      files.push(entryPath);
    }
  }
  return files.sort((a, b) => rel(a).localeCompare(rel(b)));
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateMoment(filePath, moment, index) {
  const label = `moments[${index}]`;
  if (!isObject(moment)) {
    addError(filePath, `${label} must be an object`);
    return;
  }
  if (!Number.isInteger(moment.t_sec)) {
    addError(filePath, `${label}.t_sec must be an integer`);
  }
  if (typeof moment.name !== "string" || !moment.name.trim()) {
    addError(filePath, `${label}.name must be a non-empty string`);
  }
  if (!elementTypes.has(moment.elem)) {
    addError(filePath, `${label}.elem must be physical, magic, unique, or none`);
  }
  if (moment.kind !== undefined && !momentKinds.has(moment.kind)) {
    addError(filePath, `${label}.kind must be hit, event, or mechanic`);
  }
  if (moment.tags !== undefined) {
    if (!Array.isArray(moment.tags)) {
      addError(filePath, `${label}.tags must be an array`);
    } else {
      for (const tag of moment.tags) {
        if (!momentTags.has(tag)) {
          addError(filePath, `${label}.tags contains invalid tag "${tag}"`);
        }
      }
    }
  }

  const hasDamage = isPositiveNumber(moment.damage);
  const hasDot = isPositiveNumber(moment.dot);
  const isEvent = !hasDamage && !hasDot;
  if (hasDamage && hasDot) {
    addError(filePath, `${label} cannot have both damage and dot`);
  }
  if (!isEvent && moment.elem === "none") {
    addError(filePath, `${label} with damage/dot cannot use elem="none"`);
  }
  if (hasDot && !Number.isInteger(moment.dot_ticks)) {
    addError(filePath, `${label}.dot_ticks must be an integer when dot is set`);
  }
}

function validateTimelineJson(filePath, timeline, seenIds) {
  if (!isObject(timeline)) {
    addError(filePath, "timeline root must be an object");
    return;
  }
  if (typeof timeline.id !== "string" || !timeline.id.trim()) {
    addError(filePath, "id must be a non-empty string");
  } else if (seenIds.has(timeline.id)) {
    addError(filePath, `duplicate timeline id "${timeline.id}"`);
  } else {
    seenIds.add(timeline.id);
  }
  if (typeof timeline.title !== "string" || !timeline.title.trim()) {
    addError(filePath, "title must be a non-empty string");
  }
  if (timeline.version !== 1) {
    addError(filePath, "version must be 1");
  }
  if (!Array.isArray(timeline.phases) || timeline.phases.length === 0) {
    addError(filePath, "phases must be a non-empty array");
  } else {
    const phaseIds = new Set();
    for (const [index, phase] of timeline.phases.entries()) {
      const label = `phases[${index}]`;
      if (!isObject(phase)) {
        addError(filePath, `${label} must be an object`);
        continue;
      }
      if (typeof phase.id !== "string" || !phase.id.trim()) {
        addError(filePath, `${label}.id must be a non-empty string`);
      } else if (phaseIds.has(phase.id)) {
        addError(filePath, `${label}.id duplicates "${phase.id}"`);
      } else {
        phaseIds.add(phase.id);
      }
      if (!Number.isInteger(phase.start_sec)) {
        addError(filePath, `${label}.start_sec must be an integer`);
      }
      if (phase.end_sec !== undefined && !Number.isInteger(phase.end_sec)) {
        addError(filePath, `${label}.end_sec must be an integer`);
      }
      if (
        Number.isInteger(phase.start_sec) &&
        Number.isInteger(phase.end_sec) &&
        phase.start_sec > phase.end_sec
      ) {
        addError(filePath, `${label}.start_sec must not exceed end_sec`);
      }
    }

    if (Array.isArray(timeline.mechanisms)) {
      const phasesById = new Map(
        timeline.phases.filter(isObject).map((phase) => [phase.id, phase])
      );
      for (const [index, mechanism] of timeline.mechanisms.entries()) {
        const label = `mechanisms[${index}]`;
        if (!isObject(mechanism)) {
          addError(filePath, `${label} must be an object`);
          continue;
        }
        const phase = phasesById.get(mechanism.phaseId);
        if (!phase) {
          addError(filePath, `${label}.phaseId refers to an unknown phase`);
        }
        if (!Number.isInteger(mechanism.start_sec)) {
          addError(filePath, `${label}.start_sec must be an integer`);
        }
        if (!Number.isInteger(mechanism.end_sec)) {
          addError(filePath, `${label}.end_sec must be an integer`);
        }
        if (
          phase &&
          Number.isInteger(mechanism.start_sec) &&
          Number.isInteger(mechanism.end_sec) &&
          mechanism.start_sec > mechanism.end_sec
        ) {
          addError(filePath, `${label}.start_sec must not exceed end_sec`);
        }
        if (
          phase &&
          Number.isInteger(phase.start_sec) &&
          Number.isInteger(mechanism.start_sec) &&
          Number.isInteger(mechanism.end_sec)
        ) {
          const phaseEnd = Number.isInteger(phase.end_sec)
            ? phase.end_sec
            : Number.POSITIVE_INFINITY;
          if (mechanism.start_sec < phase.start_sec || mechanism.end_sec > phaseEnd) {
            addError(
              filePath,
              `${label} must stay within phase ${phase.id} (${phase.start_sec}-${phase.end_sec ?? "∞"}): ${mechanism.name ?? ""}`
            );
          }
        }
      }
    }
  }

  if (!Array.isArray(timeline.moments) || timeline.moments.length === 0) {
    addError(filePath, "moments must be a non-empty array");
  } else {
    const momentKeys = new Set();
    let previousTime = Number.NEGATIVE_INFINITY;
    for (const [index, moment] of timeline.moments.entries()) {
      validateMoment(filePath, moment, index);
      if (isObject(moment)) {
        if (Number.isInteger(moment.t_sec) && moment.t_sec < previousTime) {
          addError(filePath, `moments[${index}] is out of t_sec order`);
        }
        if (Number.isInteger(moment.t_sec)) {
          previousTime = moment.t_sec;
        }
        const key = `${moment.t_sec}::${moment.name}::${moment.order ?? 0}::${moment.alt_group ?? ""}`;
        if (momentKeys.has(key)) {
          addError(filePath, `duplicate moment ${key}`);
        }
        momentKeys.add(key);
      }
    }
  }
}

function validateCustomTimelines() {
  const customDir = path.join(rootDir, "src", "data", "timelines", "custom");
  const jsonFiles = listFiles(customDir, (filePath) => filePath.endsWith(".json"));
  const seenIds = new Set(coreTimelineIds);

  for (const filePath of jsonFiles) {
    try {
      validateTimelineJson(filePath, JSON.parse(readFileSync(filePath, "utf8")), seenIds);
    } catch (error) {
      addError(filePath, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return jsonFiles.length;
}

function extractMatches(text, regexp) {
  return Array.from(text.matchAll(regexp), (match) => match[1]);
}

function validateSkills() {
  const skillFiles = ["tank.ts", "healer.ts", "melee.ts", "ranged.ts", "caster.ts", "utility.ts"];
  const iconText = readText("src", "data", "skills", "icon.skills.ts");
  const iconIds = new Set(extractMatches(iconText, /"([^"]+)":/g));
  const skillIds = [];
  const seenSkillIds = new Map();

  for (const fileName of skillFiles) {
    const filePath = path.join(rootDir, "src", "data", "skills", fileName);
    const ids = extractMatches(readFileSync(filePath, "utf8"), /\bid:\s*"([^"]+)"/g);
    for (const id of ids) {
      skillIds.push(id);
      const previousFile = seenSkillIds.get(id);
      if (previousFile) {
        addError(filePath, `duplicate skill id "${id}" (already in ${previousFile})`);
      } else {
        seenSkillIds.set(id, rel(filePath));
      }
      if (!iconIds.has(id)) {
        addError(filePath, `skill "${id}" has no SKILL_ICON entry`);
      }
    }
  }

  const skillIdSet = new Set(skillIds);
  const customSkillDir = path.join(rootDir, "src", "data", "skills", "custom");
  const customSkillFiles = listFiles(customSkillDir, (filePath) => filePath.endsWith(".json"));
  for (const filePath of customSkillFiles) {
    try {
      validateCustomSkillPack(
        filePath,
        JSON.parse(readFileSync(filePath, "utf8")),
        skillIdSet,
        seenSkillIds
      );
    } catch (error) {
      addError(filePath, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  const evolvePath = path.join(rootDir, "src", "data", "skills", "evolve.ts");
  const evolveRefs = extractMatches(readFileSync(evolvePath, "utf8"), /evolve\("([^"]+)"/g);
  for (const id of evolveRefs) {
    if (!skillIdSet.has(id)) {
      addError(evolvePath, `evolve base skill "${id}" does not exist`);
    }
  }

  return skillIdSet.size;
}

function validateCustomSkillPack(filePath, pack, skillIdSet, seenSkillIds) {
  if (!isObject(pack)) {
    addError(filePath, "custom skill pack root must be an object");
    return;
  }

  if (pack.skills !== undefined && !Array.isArray(pack.skills)) {
    addError(filePath, "skills must be an array");
  }
  if (pack.evolve !== undefined && !Array.isArray(pack.evolve)) {
    addError(filePath, "evolve must be an array");
  }

  for (const [index, entry] of (pack.skills ?? []).entries()) {
    const label = `skills[${index}]`;
    if (!isObject(entry) || !isObject(entry.skill)) {
      addError(filePath, `${label} must have a skill object`);
      continue;
    }
    if (typeof entry.jobId !== "string" || !entry.jobId.includes(".")) {
      addError(filePath, `${label}.jobId must be a job id such as tank.drk`);
    }
    if (entry.row !== undefined && entry.row !== "primary" && entry.row !== "secondary") {
      addError(filePath, `${label}.row must be primary or secondary`);
    }

    const { skill } = entry;
    if (typeof skill.id !== "string" || !/^[a-z0-9_.-]+$/.test(skill.id)) {
      addError(filePath, `${label}.skill.id must be lowercase ASCII`);
    } else if (seenSkillIds.has(skill.id)) {
      addError(filePath, `${label}.skill.id duplicates "${skill.id}" from ${seenSkillIds.get(skill.id)}`);
    } else {
      skillIdSet.add(skill.id);
      seenSkillIds.set(skill.id, rel(filePath));
    }

    if (typeof skill.name !== "string" || !skill.name.trim()) {
      addError(filePath, `${label}.skill.name must be a non-empty string`);
    }
    if (!Number.isFinite(skill.cooldown_s) || skill.cooldown_s < 0) {
      addError(filePath, `${label}.skill.cooldown_s must be 0 or greater`);
    }
    if (skill.duration_s !== undefined && (!Number.isFinite(skill.duration_s) || skill.duration_s < 0)) {
      addError(filePath, `${label}.skill.duration_s must be 0 or greater`);
    }
    if (!skillScopes.has(skill.scope)) {
      addError(filePath, `${label}.skill.scope is invalid`);
    }
    if (!Array.isArray(skill.kinds) || skill.kinds.length === 0) {
      addError(filePath, `${label}.skill.kinds must be a non-empty array`);
    } else {
      for (const kind of skill.kinds) {
        if (!skillKinds.has(kind)) {
          addError(filePath, `${label}.skill.kinds contains invalid kind "${kind}"`);
        }
      }
    }

    if (typeof skill.icon === "string" && skill.icon.startsWith("/")) {
      const iconPath = path.join(rootDir, "public", skill.icon.replace(/^\/+/, ""));
      if (!existsSync(iconPath)) {
        addError(filePath, `${label}.skill.icon points to a missing public file`);
      }
    }
  }

  for (const [index, entry] of (pack.evolve ?? []).entries()) {
    const label = `evolve[${index}]`;
    if (!isObject(entry)) {
      addError(filePath, `${label} must be an object`);
      continue;
    }
    if (typeof entry.jobId !== "string" || !entry.jobId.includes(".")) {
      addError(filePath, `${label}.jobId must be a job id such as tank.drk`);
    }
    if (typeof entry.baseSkillId !== "string" || !skillIdSet.has(entry.baseSkillId)) {
      addError(filePath, `${label}.baseSkillId does not exist`);
    }
  }
}

function validateActivityRecordJson(filePath, book, seenIds) {
  if (!isObject(book)) {
    addError(filePath, "activity record root must be an object");
    return;
  }
  if (typeof book.id !== "string" || !book.id.trim()) {
    addError(filePath, "id must be a non-empty string");
  } else if (seenIds.has(book.id)) {
    addError(filePath, `duplicate activity record id "${book.id}"`);
  } else {
    seenIds.add(book.id);
  }
  if (typeof book.title !== "string" || !book.title.trim()) {
    addError(filePath, "title must be a non-empty string");
  }
  if (book.version !== 1) {
    addError(filePath, "version must be 1");
  }
  if (book.description !== undefined && typeof book.description !== "string") {
    addError(filePath, "description must be a string");
  }
  if (!Array.isArray(book.entries)) {
    addError(filePath, "entries must be an array");
    return;
  }

  const seenDates = new Set();
  for (const [index, entry] of book.entries.entries()) {
    const label = `entries[${index}]`;
    if (!isObject(entry)) {
      addError(filePath, `${label} must be an object`);
      continue;
    }
    if (typeof entry.date !== "string" || !activityDateRe.test(entry.date)) {
      addError(filePath, `${label}.date must be YYYY-MM-DD`);
    } else if (seenDates.has(entry.date)) {
      addError(filePath, `${label}.date duplicates "${entry.date}"`);
    } else {
      seenDates.add(entry.date);
    }
    if (!Number.isFinite(entry.duration_min) || entry.duration_min < 0) {
      addError(filePath, `${label}.duration_min must be 0 or greater`);
    }
    if (typeof entry.progress !== "string") {
      addError(filePath, `${label}.progress must be a string`);
    }
    if (entry.fflogs_url !== undefined && typeof entry.fflogs_url !== "string") {
      addError(filePath, `${label}.fflogs_url must be a string`);
    }
  }
}

function validateActivityRecords() {
  const customDir = path.join(rootDir, "src", "data", "activity-records", "custom");
  const jsonFiles = listFiles(customDir, (filePath) => filePath.endsWith(".json"));
  const seenIds = new Set();

  for (const filePath of jsonFiles) {
    try {
      validateActivityRecordJson(filePath, JSON.parse(readFileSync(filePath, "utf8")), seenIds);
    } catch (error) {
      addError(filePath, `invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  return jsonFiles.length;
}

const timelineCount = validateCustomTimelines();
const skillCount = validateSkills();
const activityRecordCount = validateActivityRecords();

if (errors.length > 0) {
  console.error(`Data validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Data validation passed (${skillCount} skills, ${timelineCount} custom timelines, ${activityRecordCount} activity records).`
  );
}
