import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(path.join(root, "scripts/dmu-timeline-raw.txt"), "utf8");

function parseTime(text) {
  const [m, s] = text.split(":").map(Number);
  return m * 60 + s;
}

function parseElem(text) {
  if (!text) return "none";
  const lower = text.toLowerCase();
  if (lower === "physical") return "physical";
  if (lower === "magic") return "magic";
  if (lower === "unique") return "unique";
  return "none";
}

function parseDamage(text) {
  if (!text || !text.trim()) return undefined;
  const trimmed = text.trim();
  if (trimmed === "MAX HP - 1") return undefined;
  const num = Number(trimmed.replaceAll(",", ""));
  return Number.isFinite(num) ? num : undefined;
}

function fmtMoment(moment) {
  const fields = [
    `t_sec: ${moment.t_sec}`,
    ...(moment.phase_t_sec !== undefined ? [`phase_t_sec: ${moment.phase_t_sec}`] : []),
    `name: ${JSON.stringify(moment.name)}`,
    `elem: ${JSON.stringify(moment.elem)}`,
  ];
  if (moment.order) fields.push(`order: ${moment.order}`);
  if (moment.damage !== undefined) fields.push(`damage: ${moment.damage}`);
  if (moment.note) fields.push(`note: ${JSON.stringify(moment.note)}`);
  if (moment.kind) fields.push(`kind: ${JSON.stringify(moment.kind)}`);
  return `  { ${fields.join(", ")} },`;
}

function buildMoments(lines, { usePhaseTime, phaseStartAbs }) {
  const moments = [];
  const orderBySec = new Map();

  for (const line of lines) {
    const parts = line.split("\t").map((p) => p.trim());
    if (parts.length < 2) continue;

    let t_sec;
    let phase_t_sec;
    let name;
    let elem;
    let damageText;

    if (/^P[123]$/.test(parts[0])) continue;

    if (/^\d{2}:\d{2}$/.test(parts[0]) && /^\d{2}:\d{2}$/.test(parts[1])) {
      t_sec = parseTime(parts[0]);
      phase_t_sec = usePhaseTime ? parseTime(parts[1]) : undefined;
      name = parts[2];
      elem = parts[3];
      damageText = parts[4];
    } else if (parts.length >= 4 && /^\d{2}:\d{2}$/.test(parts[1]) && /^\d{2}:\d{2}$/.test(parts[2])) {
      t_sec = parseTime(parts[1]);
      phase_t_sec = parseTime(parts[2]);
      name = parts[3];
      elem = parts[4];
      damageText = parts[5];
    } else {
      continue;
    }

    if (phaseStartAbs !== undefined && phase_t_sec !== undefined) {
      // sanity: absolute should match phase start + phase_t_sec when provided
      void phaseStartAbs;
    }

    const order = (orderBySec.get(t_sec) ?? 0) + 1;
    orderBySec.set(t_sec, order);

    const moment = {
      t_sec,
      ...(phase_t_sec !== undefined ? { phase_t_sec } : {}),
      name,
      elem: parseElem(elem),
      ...(order > 1 ? { order } : {}),
    };

    const damage = parseDamage(damageText);
    if (damage !== undefined) {
      if (damage === 0 && (moment.elem === "unique" || moment.elem === "none")) {
        moment.kind = "event";
      } else {
        moment.damage = damage;
        if (damage >= 9999999 && moment.elem === "none") {
          moment.elem = "magic";
        }
      }
    } else if (damageText?.includes("MAX HP")) {
      moment.note = damageText.trim();
      moment.kind = "event";
    } else if (moment.elem === "unique" || !elem || parseElem(elem) === "none") {
      moment.kind = moment.elem === "unique" ? "event" : "event";
    }

    if (moment.elem === "none" && !moment.kind) {
      moment.kind = "event";
    }

    moments.push(moment);
  }

  moments.sort((a, b) => a.t_sec - b.t_sec || (a.order ?? 1) - (b.order ?? 1));

  const orderAfterSort = new Map();
  for (const moment of moments) {
    const next = (orderAfterSort.get(moment.t_sec) ?? 0) + 1;
    orderAfterSort.set(moment.t_sec, next);
    if (next > 1) {
      moment.order = next;
    } else {
      delete moment.order;
    }
  }

  return moments;
}

function fmtMechanisms(items) {
  return items
    .map(
      (m) =>
        `  { name: ${JSON.stringify(m.name)}, phaseId: ${JSON.stringify(m.phaseId)}, start_sec: ${m.start_sec}, end_sec: ${m.end_sec} },`
    )
    .join("\n");
}

const sections = raw.split(/^P([123])$/m);
const p1Lines = (sections[2] ?? "").trim().split("\n").filter(Boolean);
const p2Lines = (sections[4] ?? "").trim().split("\n").filter(Boolean);
const p3Lines = (sections[6] ?? "").trim().split("\n").filter(Boolean);

const momentsP1 = [
  { t_sec: -15, name: "戦闘前", elem: "none", kind: "event" },
  ...buildMoments(p1Lines, { usePhaseTime: false }),
];
const momentsP2 = buildMoments(p2Lines, { usePhaseTime: true, phaseStartAbs: 197 });
const momentsP3 = buildMoments(p3Lines, { usePhaseTime: true, phaseStartAbs: 382 });

const P1_END = 202;
const P2_START = 197;
const P2_END = 387;
const P3_START = 382;
const P3_END = 734;

const mechanismsP1 = [
  { name: "開幕", phaseId: "p1", start_sec: -15, end_sec: 28 },
  { name: "神々の像 (魔神)", phaseId: "p1", start_sec: 29, end_sec: 79 },
  { name: "神々の像 (鬼神)", phaseId: "p1", start_sec: 80, end_sec: 163 },
  { name: "神々の像 (女神)", phaseId: "p1", start_sec: 164, end_sec: P1_END },
];

const mechanismsP2 = [
  { name: "開幕", phaseId: "p2", start_sec: P2_START, end_sec: 235 },
  { name: "ミッシング", phaseId: "p2", start_sec: 236, end_sec: 353 },
  { name: "トライン", phaseId: "p2", start_sec: 354, end_sec: P2_END },
];

const mechanismsP3 = [
  { name: "開幕", phaseId: "p3", start_sec: P3_START, end_sec: 430 },
  { name: "決戦 1 回目", phaseId: "p3", start_sec: 431, end_sec: 506 },
  { name: "アルテマブラスター", phaseId: "p3", start_sec: 507, end_sec: 544 },
  { name: "じしん & ブラックホール", phaseId: "p3", start_sec: 545, end_sec: 699 },
  { name: "どんどこ地団駄", phaseId: "p3", start_sec: 700, end_sec: 717 },
  { name: "時間切れまで", phaseId: "p3", start_sec: 718, end_sec: P3_END },
];

const file = `import type { MechanismSlice, Timeline, Moment } from "../../types";

export const MOMENTS_P1: Moment[] = [
${momentsP1.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P1: MechanismSlice[] = [
${fmtMechanisms(mechanismsP1)}
];

export const MOMENTS_P2: Moment[] = [
${momentsP2.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P2: MechanismSlice[] = [
${fmtMechanisms(mechanismsP2)}
];

export const MOMENTS_P3: Moment[] = [
${momentsP3.map(fmtMoment).join("\n")}
];

export const MECHANISMS_P3: MechanismSlice[] = [
${fmtMechanisms(mechanismsP3)}
];

const MOMENTS: Moment[] = [...MOMENTS_P1, ...MOMENTS_P2, ...MOMENTS_P3];
MOMENTS.sort((a, b) => a.t_sec - b.t_sec || (a.order ?? 1e9) - (b.order ?? 1e9));

const MECHANISMS: MechanismSlice[] = [...MECHANISMS_P1, ...MECHANISMS_P2, ...MECHANISMS_P3];

export const DANCING_MAD: Timeline = {
  id: "dancing-mad",
  title: "絶妖星乱舞",
  version: 1,
  phases: [
    { id: "p1", title: "P1", start_sec: -15, end_sec: ${P1_END} },
    { id: "p2", title: "P2", start_sec: ${P2_START}, end_sec: ${P2_END} },
    { id: "p3", title: "P3", start_sec: ${P3_START}, end_sec: ${P3_END} },
  ],
  moments: MOMENTS,
  mechanisms: MECHANISMS,
};
`;

writeFileSync(path.join(root, "src/data/timelines/dancing-mad.ts"), file, "utf8");
console.log(
  `P1: ${momentsP1.length} (${momentsP1[0]?.t_sec}-${momentsP1.at(-1)?.t_sec}), ` +
    `P2: ${momentsP2.length} (${momentsP2[0]?.t_sec}-${momentsP2.at(-1)?.t_sec}), ` +
    `P3: ${momentsP3.length} (${momentsP3[0]?.t_sec}-${momentsP3.at(-1)?.t_sec})`
);
