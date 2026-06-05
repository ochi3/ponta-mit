import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const P3_START = 388;
const RAW = readFileSync(path.join(__dirname, "dmu-p3-raw.txt"), "utf8");

function parseTime(text) {
  const [m, s] = text.split(":").map(Number);
  return m * 60 + s;
}

function parseElem(text) {
  if (!text) return "none";
  const lower = text.toLowerCase();
  if (lower === "physical") return "physical";
  if (lower === "magic") return "magic";
  return "none";
}

function parseDamage(text) {
  if (!text || !text.trim()) return undefined;
  const trimmed = text.trim();
  if (trimmed === "MAX HP - 1") return undefined;
  const num = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(num) ? num : undefined;
}

const moments = [];
const orderBySec = new Map();

for (const line of RAW.trim().split("\n")) {
  const parts = line.split("\t").map((p) => p.trim());
  let phaseSec;
  let name;
  let elem;
  let damageText;

  if (/^\d{2}:\d{2}$/.test(parts[0])) {
    phaseSec = parseTime(parts[0]);
    name = parts[1];
    elem = parts[2];
    damageText = parts[3];
  } else if (parts.length >= 2 && /^\d{2}:\d{2}$/.test(parts[1])) {
    phaseSec = parseTime(parts[1]);
    name = parts[2];
    elem = parts[3];
    damageText = parts[4];
  } else {
    continue;
  }

  const t_sec = P3_START + phaseSec;
  const phase_t_sec = phaseSec;
  const order = (orderBySec.get(t_sec) ?? 0) + 1;
  orderBySec.set(t_sec, order);

  const moment = {
    t_sec,
    phase_t_sec,
    name,
    elem: parseElem(elem),
    ...(order > 1 ? { order } : {}),
  };

  const damage = parseDamage(damageText);
  if (damage !== undefined) {
    moment.damage = damage;
  } else if (damageText?.includes("MAX HP")) {
    moment.note = damageText.trim();
    moment.kind = "event";
  } else if (!elem || parseElem(elem) === "none") {
    moment.kind = "event";
  }

  if (moment.elem === "none" && !moment.kind) {
    moment.kind = "event";
  }

  moments.push(moment);
}

function fmt(moment) {
  const fields = [
    `t_sec: ${moment.t_sec}`,
    `phase_t_sec: ${moment.phase_t_sec}`,
    `name: ${JSON.stringify(moment.name)}`,
    `elem: ${JSON.stringify(moment.elem)}`,
  ];
  if (moment.order) fields.push(`order: ${moment.order}`);
  if (moment.damage !== undefined) fields.push(`damage: ${moment.damage}`);
  if (moment.note) fields.push(`note: ${JSON.stringify(moment.note)}`);
  if (moment.kind) fields.push(`kind: ${JSON.stringify(moment.kind)}`);
  return `  { ${fields.join(", ")} },`;
}

const body = moments.map(fmt).join("\n");
writeFileSync(path.join(__dirname, "dmu-p3-moments.ts.txt"), body, "utf8");
console.log(`count: ${moments.length}, end: ${moments[moments.length - 1].t_sec}`);
